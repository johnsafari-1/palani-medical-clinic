-- Additive: retain historical invoices, including legacy inconsistencies.
alter table public.invoices add column if not exists request_id uuid;
alter table public.invoices add column if not exists request_hash text;
alter table public.invoices add column if not exists paid_by uuid references public.staff(id);
alter table public.invoice_items add column if not exists price_item_id uuid references public.price_list(id);
create unique index if not exists invoices_request_id_key on public.invoices(request_id) where request_id is not null;

-- Existing pharmacy write policies intend OTC sales; allow only their own reads.
drop policy if exists invoices_select_own_otc on public.invoices;
create policy invoices_select_own_otc on public.invoices for select to authenticated
using (private.active_staff_role()='Pharmacist' and sale_type='OTC' and created_by=auth.uid());
drop policy if exists invoice_items_select_own_otc on public.invoice_items;
create policy invoice_items_select_own_otc on public.invoice_items for select to authenticated
using (private.active_staff_role()='Pharmacist' and exists(
  select 1 from public.invoices i where i.id=invoice_id and i.sale_type='OTC' and i.created_by=auth.uid()
));

create or replace function private.guard_invoice_write()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare actor_role text := private.active_staff_role(); n bigint; amount_sum numeric;
begin
  if current_user not in ('authenticated','anon') then
    if TG_OP='DELETE' then return OLD; end if;
    return NEW;
  end if;
  if TG_OP='DELETE' then raise exception 'Invoice deletion requires a separate correction workflow.' using errcode='42501'; end if;
  if actor_role is null or (actor_role not in ('Admin','Cashier') and
      not (actor_role='Pharmacist' and NEW.sale_type='OTC' and (TG_OP='INSERT' or OLD.created_by=auth.uid()))) then
    raise exception 'An active billing staff member is required.' using errcode='42501';
  end if;
  if TG_OP='INSERT' then
    if NEW.sale_type='Encounter' then
      if (NEW.consultation_id is null) = (NEW.admission_id is null) then
        raise exception 'Encounter invoices need exactly one consultation or discharged stay.' using errcode='22023';
      end if;
      -- Serialize competing invoice creations without broadening clinical UPDATE RLS.
      perform pg_advisory_xact_lock(hashtextextended('bill-source:'||coalesce(NEW.consultation_id,NEW.admission_id)::text,0));
      if NEW.consultation_id is not null then
        if not exists(select 1 from public.consultations c where c.id=NEW.consultation_id and c.patient_id=NEW.patient_id) then
          raise exception 'Consultation and invoice must refer to the same patient.' using errcode='22023';
        end if;
        if exists(select 1 from public.invoices i where i.consultation_id=NEW.consultation_id) then
          raise exception 'This consultation already has an invoice. Refresh billing.' using errcode='P0001';
        end if;
      else
        if not exists(select 1 from public.admissions a where a.id=NEW.admission_id and a.patient_id=NEW.patient_id and a.status='Discharged' and a.discharged_at is not null) then
          raise exception 'Invoice requires a discharged stay for the same patient.' using errcode='22023';
        end if;
        if exists(select 1 from public.invoices i where i.admission_id=NEW.admission_id) then
          raise exception 'This stay already has an invoice. Refresh billing.' using errcode='P0001';
        end if;
      end if;
    elsif NEW.sale_type='OTC' then
      if NEW.consultation_id is not null or NEW.admission_id is not null then
        raise exception 'OTC sales cannot claim an encounter.' using errcode='22023';
      end if;
    else raise exception 'Unsupported sale type.' using errcode='22023'; end if;
    if NEW.total < 0 or NEW.total > 100000000000000 or NEW.total<>round(NEW.total,2) or NEW.status<>'Unpaid'
       or NEW.payment_method is not null or NEW.paid_at is not null or NEW.paid_by is not null then
      raise exception 'New invoices must be unpaid with a valid total.' using errcode='22023';
    end if;
    NEW.created_by:=auth.uid(); NEW.created_at:=statement_timestamp();
    return NEW;
  end if;
  if (to_jsonb(NEW)-array['status','payment_method','paid_at','paid_by']) is distinct from
     (to_jsonb(OLD)-array['status','payment_method','paid_at','paid_by']) then
    raise exception 'Invoice identity, total and authorship cannot be changed during payment.' using errcode='42501';
  end if;
  if OLD.status='Paid' then
    if NEW is not distinct from OLD then return null; end if;
    raise exception 'This invoice is already paid; its payment cannot be overwritten.' using errcode='P0001';
  end if;
  if NEW.status<>'Paid' or NEW.payment_method is null or NEW.payment_method not in ('Cash','M-Pesa','Card','Other') then
    raise exception 'Choose a supported payment method for an unpaid invoice.' using errcode='22023';
  end if;
  select count(*),coalesce(sum(amount),0) into n,amount_sum from public.invoice_items where invoice_id=OLD.id;
  if n=0 or OLD.total<>amount_sum or OLD.total<0 or OLD.total>100000000000000 or exists(
    select 1 from public.invoice_items where invoice_id=OLD.id and
      (quantity<=0 or quantity>100000 or amount<0 or amount>100000000000000)
  ) then
    raise exception 'Invoice lines and total are inconsistent; review before recording payment.' using errcode='22023';
  end if;
  NEW.paid_by:=auth.uid(); NEW.paid_at:=statement_timestamp();
  return NEW;
end;
$$;
revoke all on function private.guard_invoice_write() from public,anon,authenticated;
drop trigger if exists guard_invoice_write on public.invoices;
create trigger guard_invoice_write before insert or update or delete on public.invoices
for each row execute function private.guard_invoice_write();

create or replace function private.guard_invoice_item_write()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare inv public.invoices%rowtype; price public.price_list%rowtype; actor_role text:=private.active_staff_role();
begin
  if current_user not in ('authenticated','anon') then
    if TG_OP='DELETE' then return OLD; end if;
    return NEW;
  end if;
  if TG_OP<>'INSERT' then raise exception 'Invoice lines require a separate correction workflow.' using errcode='42501'; end if;
  select * into inv from public.invoices where id=NEW.invoice_id for update;
  if inv.id is null or inv.status<>'Unpaid' then raise exception 'An available unpaid invoice is required.' using errcode='22023'; end if;
  if actor_role is null or (actor_role not in ('Admin','Cashier') and
      not (actor_role='Pharmacist' and inv.sale_type='OTC' and inv.created_by=auth.uid())) then
    raise exception 'An active billing staff member is required.' using errcode='42501';
  end if;
  if NEW.quantity is null or NEW.quantity<=0 or NEW.quantity>100000 or NEW.quantity<>round(NEW.quantity,3) then
    raise exception 'Quantity must be positive, at most 100000, with at most three decimal places.' using errcode='22023';
  end if;
  if NEW.price_item_id is not null then
    select * into price from public.price_list where id=NEW.price_item_id and active;
  else
    -- Legacy screens send the catalogue label and unit price, without its ID.
    select p.* into price from public.price_list p where p.active and p.name=NEW.label and p.price=NEW.unit_price
      and (NEW.prescription_id is null or p.category='Medication') and (NEW.lab_order_id is null or p.category='Lab Test') order by p.id limit 1;
  end if;
  if price.id is null or price.price<0 or price.price>1000000000 then
    raise exception 'Choose an active price-list item with a valid price.' using errcode='22023';
  end if;
  if (NEW.prescription_id is not null and price.category<>'Medication') or
     (NEW.lab_order_id is not null and price.category<>'Lab Test') then
    raise exception 'Price-list category does not match the clinical order.' using errcode='22023';
  end if;
  NEW.price_item_id:=price.id; NEW.label:=price.name; NEW.unit_price:=price.price;
  NEW.amount:=round(price.price*NEW.quantity,2);
  return NEW;
end;
$$;
revoke all on function private.guard_invoice_item_write() from public,anon,authenticated;
drop trigger if exists a_guard_invoice_item_write on public.invoice_items;
create trigger a_guard_invoice_item_write before insert or update or delete on public.invoice_items
for each row execute function private.guard_invoice_item_write();

-- Narrow definer authority is needed only to claim billed flags: cashiers do
-- not have clinical UPDATE rights. This private trigger has no execution grant.
create or replace function private.claim_billing_source()
returns trigger language plpgsql security definer set search_path=''
as $$
declare inv public.invoices%rowtype; rx public.prescriptions%rowtype; lab public.lab_orders%rowtype;
  actor_role text:=private.active_staff_role(); source_patient uuid;
begin
  select * into inv from public.invoices where id=NEW.invoice_id;
  if inv.id is null then raise exception 'Invoice unavailable.' using errcode='22023'; end if;
  if actor_role is null or (actor_role not in ('Admin','Cashier') and
      not (actor_role='Pharmacist' and inv.sale_type='OTC' and inv.created_by=auth.uid())) then
    raise exception 'An active billing staff member is required.' using errcode='42501';
  end if;
  if NEW.prescription_id is not null and NEW.lab_order_id is not null then
    raise exception 'An invoice line cannot claim two clinical orders.' using errcode='22023';
  end if;
  if inv.sale_type='OTC' and (NEW.prescription_id is not null or NEW.lab_order_id is not null) then
    raise exception 'OTC sales cannot claim clinical orders.' using errcode='22023';
  end if;
  if NEW.prescription_id is not null then
    select * into rx from public.prescriptions where id=NEW.prescription_id for update;
    select patient_id into source_patient from public.consultations where id=rx.consultation_id;
    if rx.id is null or rx.billed then raise exception 'This prescription is unavailable or already billed.' using errcode='P0001'; end if;
    if rx.consultation_id is distinct from inv.consultation_id or source_patient is distinct from inv.patient_id then
      raise exception 'Prescription must belong to this invoice consultation and patient.' using errcode='22023';
    end if;
    update public.prescriptions set billed=true where id=rx.id;
  end if;
  if NEW.lab_order_id is not null then
    select * into lab from public.lab_orders where id=NEW.lab_order_id for update;
    if lab.id is null or lab.billed then raise exception 'This lab order is unavailable or already billed.' using errcode='P0001'; end if;
    if lab.consultation_id is distinct from inv.consultation_id or lab.patient_id is distinct from inv.patient_id or inv.consultation_id is null then
      raise exception 'Lab order must belong to this invoice consultation and patient.' using errcode='22023';
    end if;
    update public.lab_orders set billed=true where id=lab.id;
  end if;
  return NEW;
end;
$$;
revoke all on function private.claim_billing_source() from public,anon,authenticated;
drop trigger if exists guard_invoice_item_billing on public.invoice_items;
create trigger guard_invoice_item_billing before insert on public.invoice_items
for each row execute function private.claim_billing_source();

create or replace function public.create_clinic_invoice(p_patient_id uuid,p_consultation_id uuid,p_admission_id uuid,
  p_sale_type text,p_request_id uuid,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare inv public.invoices%rowtype; actor_role text:=private.active_staff_role(); fingerprint text;
  line jsonb; price public.price_list%rowtype; prepared jsonb:='[]'; qty numeric; total_amount numeric:=0;
begin
  if actor_role is null or (actor_role not in ('Admin','Cashier') and not(actor_role='Pharmacist' and p_sale_type='OTC')) then
    raise exception 'An active billing staff member is required.' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'A request ID is required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('invoice-request:'||p_request_id::text,0));
  fingerprint:=md5(jsonb_build_object('patient',p_patient_id,'consultation',p_consultation_id,'admission',p_admission_id,'sale',p_sale_type,'items',p_items)::text);
  select * into inv from public.invoices where request_id=p_request_id;
  if inv.id is not null then
    if inv.created_by is distinct from auth.uid() or inv.request_hash is distinct from fingerprint then
      raise exception 'This request ID belongs to a different invoice submission.' using errcode='22023';
    end if;
    return to_jsonb(inv);
  end if;
  if p_sale_type is null or p_patient_id is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Select a patient and 1 to 100 invoice lines.' using errcode='22023';
  end if;
  for line in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(line) is distinct from 'object' then raise exception 'Invalid invoice line.' using errcode='22023'; end if;
    qty:=(line->>'quantity')::numeric;
    if qty is null or qty<=0 or qty>100000 or qty<>round(qty,3) then raise exception 'Invalid invoice quantity.' using errcode='22023'; end if;
    select * into price from public.price_list where id=(line->>'price_item_id')::uuid and active;
    if price.id is null or price.price<0 or price.price>1000000000 then raise exception 'An active valid price-list item is required.' using errcode='22023'; end if;
    if line ? 'expected_unit_price' and (line->>'expected_unit_price')::numeric is distinct from price.price then
      raise exception 'Price changed. Refresh billing and review the draft before retrying.' using errcode='P0001';
    end if;
    prepared:=prepared||jsonb_build_array(jsonb_build_object('price_item_id',price.id,'quantity',qty,
      'prescription_id',line->>'prescription_id','lab_order_id',line->>'lab_order_id','label',price.name,'unit_price',price.price,'amount',round(price.price*qty,2)));
    total_amount:=total_amount+round(price.price*qty,2);
  end loop;
  insert into public.invoices(patient_id,consultation_id,admission_id,sale_type,total,created_by,request_id,request_hash)
    values(p_patient_id,p_consultation_id,p_admission_id,p_sale_type,total_amount,auth.uid(),p_request_id,fingerprint) returning * into inv;
  for line in select value from jsonb_array_elements(prepared)
    order by coalesce(value->>'prescription_id',value->>'lab_order_id',value->>'price_item_id') loop
    insert into public.invoice_items(invoice_id,price_item_id,label,quantity,unit_price,amount,prescription_id,lab_order_id)
      values(inv.id,(line->>'price_item_id')::uuid,line->>'label',(line->>'quantity')::numeric,
        (line->>'unit_price')::numeric,(line->>'amount')::numeric,(line->>'prescription_id')::uuid,(line->>'lab_order_id')::uuid);
  end loop;
  if (select sum(amount) from public.invoice_items where invoice_id=inv.id) is distinct from total_amount then
    raise exception 'Prices changed during submission. Review prices and retry.' using errcode='P0001';
  end if;
  return to_jsonb(inv);
end;
$$;

create or replace function public.record_invoice_payment(p_invoice_id uuid,p_payment_method text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare inv public.invoices%rowtype; actor_role text:=private.active_staff_role();
begin
  if actor_role is null or actor_role not in ('Admin','Cashier','Pharmacist') then
    raise exception 'An active billing staff member is required.' using errcode='42501';
  end if;
  if p_payment_method is null or p_payment_method not in ('Cash','M-Pesa','Card','Other') then
    raise exception 'Choose a supported payment method.' using errcode='22023';
  end if;
  select * into inv from public.invoices where id=p_invoice_id for update;
  if inv.id is null then raise exception 'Invoice unavailable.' using errcode='22023'; end if;
  if actor_role='Pharmacist' and (inv.sale_type<>'OTC' or inv.created_by is distinct from auth.uid()) then
    raise exception 'Pharmacists may record payment only for their own OTC sales.' using errcode='42501';
  end if;
  if inv.status='Paid' then
    if inv.paid_by is distinct from auth.uid() or inv.payment_method is distinct from p_payment_method then
      raise exception 'This invoice already has a different payment. Refresh billing.' using errcode='P0001';
    end if;
  else
    update public.invoices set status='Paid',payment_method=p_payment_method where id=inv.id returning * into inv;
    if inv.id is null then raise exception 'Payment was not confirmed.' using errcode='42501'; end if;
  end if;
  return to_jsonb(inv);
end;
$$;
revoke all on function public.create_clinic_invoice(uuid,uuid,uuid,text,uuid,jsonb) from public,anon;
revoke all on function public.record_invoice_payment(uuid,text) from public,anon;
grant execute on function public.create_clinic_invoice(uuid,uuid,uuid,text,uuid,jsonb) to authenticated;
grant execute on function public.record_invoice_payment(uuid,text) to authenticated;

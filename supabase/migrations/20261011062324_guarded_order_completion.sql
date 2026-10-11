-- Preserve RLS and legacy UI compatibility while constraining browser writes.
-- Trusted owner/service maintenance and the existing definer billing trigger
-- retain their authority; their writes still pass through the audit triggers.
create or replace function private.guard_prescription_write()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare actor_role text;
begin
  if current_user not in ('authenticated', 'anon') then return NEW; end if;
  actor_role := private.active_staff_role();
  if TG_OP = 'INSERT' then
    if actor_role is null or actor_role not in ('Doctor', 'Admin') then
      raise exception 'An active Doctor or Admin must prescribe.' using errcode='42501';
    end if;
    if NEW.dispensed or NEW.dispensed_by is not null or NEW.dispensed_at is not null or NEW.billed then
      raise exception 'New prescriptions must be pending and unbilled.' using errcode='22023';
    end if;
    return NEW;
  end if;
  if actor_role is null or actor_role not in ('Pharmacist', 'Admin') then
    raise exception 'An active Pharmacist or Admin must dispense.' using errcode='42501';
  end if;
  if (to_jsonb(NEW)-array['dispensed','dispensed_by','dispensed_at']) is distinct from
     (to_jsonb(OLD)-array['dispensed','dispensed_by','dispensed_at']) then
    raise exception 'Prescribed drug, dosage, instructions, links and billing fields cannot be changed during dispensing.' using errcode='42501';
  end if;
  if OLD.dispensed then
    if NEW is not distinct from OLD then return null; end if;
    raise exception 'This prescription is already dispensed; its completion is immutable.' using errcode='P0001';
  end if;
  if NEW.dispensed is not true then
    raise exception 'Only the pending-to-dispensed transition is supported.' using errcode='22023';
  end if;
  NEW.dispensed_by := auth.uid();
  NEW.dispensed_at := statement_timestamp();
  return NEW;
end;
$$;
revoke all on function private.guard_prescription_write() from public,anon,authenticated;
drop trigger if exists guard_prescription_write on public.prescriptions;
create trigger guard_prescription_write before insert or update on public.prescriptions
for each row execute function private.guard_prescription_write();

create or replace function private.guard_lab_order_write()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare actor_role text;
begin
  if current_user not in ('authenticated', 'anon') then return NEW; end if;
  actor_role := private.active_staff_role();
  if TG_OP = 'INSERT' then
    if actor_role is null or actor_role not in ('Doctor', 'Admin') then
      raise exception 'An active Doctor or Admin must order lab tests.' using errcode='42501';
    end if;
    if NEW.status <> 'Pending' or NEW.result is not null or NEW.completed_by is not null
       or NEW.completed_at is not null or NEW.billed then
      raise exception 'New lab orders must be pending and unbilled, without a result.' using errcode='22023';
    end if;
    NEW.ordered_by := auth.uid();
    NEW.ordered_at := statement_timestamp();
  else
    if actor_role is null or actor_role not in ('Lab Technician', 'Admin') then
      raise exception 'An active Lab Technician or Admin must complete lab tests.' using errcode='42501';
    end if;
    if (to_jsonb(NEW)-array['status','result','completed_by','completed_at']) is distinct from
       (to_jsonb(OLD)-array['status','result','completed_by','completed_at']) then
      raise exception 'Lab test, patient, ordering and billing fields cannot be changed during completion.' using errcode='42501';
    end if;
    if OLD.status = 'Completed' then
      if NEW is not distinct from OLD then return null; end if;
      raise exception 'This lab order is already completed; use a separate correction workflow.' using errcode='P0001';
    end if;
    if OLD.status <> 'Pending' or NEW.status <> 'Completed' or nullif(btrim(NEW.result),'') is null
       or length(NEW.result)>50000 then
      raise exception 'A nonempty result is required for pending-to-completed lab orders.' using errcode='22023';
    end if;
    NEW.result := btrim(NEW.result);
    NEW.completed_by := auth.uid();
    NEW.completed_at := statement_timestamp();
  end if;
  if NEW.consultation_id is not null and not exists(
    select 1 from public.consultations c where c.id=NEW.consultation_id and c.patient_id=NEW.patient_id
  ) then
    raise exception 'The lab order and consultation must refer to the same patient.' using errcode='22023';
  end if;
  return NEW;
end;
$$;
revoke all on function private.guard_lab_order_write() from public,anon,authenticated;
drop trigger if exists guard_lab_order_write on public.lab_orders;
create trigger guard_lab_order_write before insert or update on public.lab_orders
for each row execute function private.guard_lab_order_write();

create or replace function public.dispense_prescription(p_prescription_id uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare item public.prescriptions%rowtype; actor_role text := private.active_staff_role();
begin
  if actor_role is null or actor_role not in ('Pharmacist','Admin') then
    raise exception 'An active Pharmacist or Admin must dispense.' using errcode='42501';
  end if;
  select * into item from public.prescriptions where id=p_prescription_id for update;
  if item.id is null then raise exception 'Prescription unavailable.' using errcode='22023'; end if;
  if item.dispensed then
    if item.dispensed_by is distinct from auth.uid() then
      raise exception 'This prescription was already dispensed by another staff member. Refresh the queue.' using errcode='P0001';
    end if;
  else
    update public.prescriptions set dispensed=true where id=item.id returning * into item;
    if item.id is null then raise exception 'Dispensing was not confirmed.' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('id',item.id,'dispensed',item.dispensed,'dispensed_by',item.dispensed_by,'dispensed_at',item.dispensed_at);
end;
$$;

create or replace function public.complete_lab_order(p_order_id uuid,p_result text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare item public.lab_orders%rowtype; actor_role text := private.active_staff_role();
begin
  if actor_role is null or actor_role not in ('Lab Technician','Admin') then
    raise exception 'An active Lab Technician or Admin must complete lab tests.' using errcode='42501';
  end if;
  if nullif(btrim(p_result),'') is null or length(p_result)>50000 then
    raise exception 'Enter a result of at most 50000 characters.' using errcode='22023';
  end if;
  select * into item from public.lab_orders where id=p_order_id for update;
  if item.id is null then raise exception 'Lab order unavailable.' using errcode='22023'; end if;
  if item.status='Completed' then
    if item.completed_by is distinct from auth.uid() or item.result is distinct from btrim(p_result) then
      raise exception 'This lab order already has a different completion. Refresh the queue; the saved result was preserved.' using errcode='P0001';
    end if;
  else
    update public.lab_orders set status='Completed',result=btrim(p_result) where id=item.id returning * into item;
    if item.id is null then raise exception 'Lab completion was not confirmed.' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('id',item.id,'status',item.status,'result',item.result,'completed_by',item.completed_by,'completed_at',item.completed_at);
end;
$$;
revoke all on function public.dispense_prescription(uuid) from public,anon;
revoke all on function public.complete_lab_order(uuid,text) from public,anon;
grant execute on function public.dispense_prescription(uuid) to authenticated;
grant execute on function public.complete_lab_order(uuid,text) to authenticated;

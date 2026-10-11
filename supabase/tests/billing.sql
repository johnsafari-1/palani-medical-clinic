-- Run as database owner. All synthetic records/audits roll back; sequences may advance.
begin;
do $$
declare
  doctor uuid:=gen_random_uuid(); cashier uuid:=gen_random_uuid(); pharmacist uuid:=gen_random_uuid();
  patient uuid:=gen_random_uuid(); other_patient uuid:=gen_random_uuid(); consultation uuid:=gen_random_uuid(); other_consultation uuid:=gen_random_uuid();
  rx uuid:=gen_random_uuid(); lab uuid:=gen_random_uuid(); swap_id uuid;
  consultation_price uuid:=gen_random_uuid(); medication_price uuid:=gen_random_uuid(); lab_price uuid:=gen_random_uuid();
  request uuid:=gen_random_uuid(); payload jsonb; saved jsonb; replay jsonb; payment jsonb; otc jsonb;
  rejected boolean; scenario text; scenario_id uuid; fixture_email text;
begin
  perform set_config('request.jwt.claim.sub','',true);
  if rx::text>lab::text then swap_id:=rx;rx:=lab;lab:=swap_id;end if;
  insert into auth.users(id,aud,role,email,created_at,updated_at)
    select id,'authenticated','authenticated','billing-test-'||id||'@example.invalid',now(),now() from unnest(array[doctor,cashier,pharmacist]) id;
  insert into public.staff(id,name,role,active) values
    (doctor,'Billing test fixture','Doctor',true),(cashier,'Billing test fixture','Cashier',true),(pharmacist,'Billing test fixture','Pharmacist',true);
  insert into public.patients(id,code,name,dob,gender,phone) values
    (patient,'BILLING-TEST-'||patient,'Billing test fixture','2000-01-01','Other','test'),
    (other_patient,'BILLING-TEST-'||other_patient,'Billing test fixture','2000-01-01','Other','test');
  insert into public.consultations(id,patient_id,doctor_id,diagnosis) values
    (consultation,patient,doctor,'Synthetic diagnosis'),(other_consultation,other_patient,doctor,'Synthetic diagnosis');
  insert into public.prescriptions(id,consultation_id,drug) values(rx,consultation,'Synthetic drug');
  insert into public.lab_orders(id,patient_id,consultation_id,test_name,ordered_by) values(lab,other_patient,consultation,'Synthetic test',doctor);
  insert into public.price_list(id,name,category,price) values
    (consultation_price,'Synthetic consultation','Consultation',10.25),
    (medication_price,'Synthetic medication','Medication',3.30),(lab_price,'Synthetic lab','Lab Test',4.15);
  payload:=jsonb_build_array(jsonb_build_object('price_item_id',consultation_price,'quantity',2,'amount',0),
    jsonb_build_object('price_item_id',medication_price,'quantity',1,'prescription_id',rx),
    jsonb_build_object('price_item_id',lab_price,'quantity',1,'lab_order_id',lab));
  perform set_config('request.jwt.claim.sub',cashier::text,true);perform set_config('role','authenticated',true);

  rejected:=false;
  begin perform public.create_clinic_invoice(other_patient,other_consultation,null,'Encounter',gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('price_item_id',medication_price,'quantity',1,'prescription_id',rx)));
  exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Mismatched prescription patient was accepted';end if;
  rejected:=false;
  begin perform public.create_clinic_invoice(patient,consultation,null,'Encounter',request,payload);
  exception when invalid_parameter_value then rejected:=true;end;
  if not rejected or (select billed from public.prescriptions where id=rx) or exists(select 1 from public.invoices where patient_id in (patient,other_patient)) then
    raise exception 'Failed invoice left partial invoice or billed prescription';
  end if;
  perform set_config('role','none',true);
  if exists(select 1 from public.audit_log where table_name in ('invoices','invoice_items') and new_data->>'patient_id' in (patient::text,other_patient::text)) then
    raise exception 'Failed invoice audit was retained';
  end if;
  update public.lab_orders set patient_id=patient where id=lab;
  perform set_config('role','authenticated',true);
  saved:=public.create_clinic_invoice(patient,consultation,null,'Encounter',request,payload);
  replay:=public.create_clinic_invoice(patient,consultation,null,'Encounter',request,payload);
  if saved<>replay or (saved->>'total')::numeric<>27.95 or (saved->>'created_by')::uuid<>cashier
    or (saved->>'created_at')::timestamptz<now()-interval '1 minute' or (select count(*) from public.invoice_items where invoice_id=(saved->>'id')::uuid)<>3 then
    raise exception 'Invoice total/actor/time/lines/retry assertion failed';
  end if;
  if not (select billed from public.prescriptions where id=rx) or not (select billed from public.lab_orders where id=lab) then
    raise exception 'Successful invoice did not claim clinical sources';
  end if;
  rejected:=false;
  begin perform public.create_clinic_invoice(patient,consultation,null,'Encounter',gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('price_item_id',consultation_price,'quantity',1)));
  exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Duplicate consultation invoice accepted';end if;

  -- Legacy payment writes receive the same trusted actor/time protections.
  update public.invoices set status='Paid',payment_method='M-Pesa',paid_by=doctor,paid_at='1900-01-01' where id=(saved->>'id')::uuid;
  payment:=public.record_invoice_payment((saved->>'id')::uuid,'M-Pesa');
  if (payment->>'paid_by')::uuid<>cashier or (payment->>'paid_at')::timestamptz<now()-interval '1 minute'
     or public.record_invoice_payment((saved->>'id')::uuid,'M-Pesa')<>payment then raise exception 'Payment actor/time/retry failed';end if;
  rejected:=false;
  begin perform public.record_invoice_payment((saved->>'id')::uuid,'Card');exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Paid payment method was overwritten';end if;
  rejected:=false;
  begin update public.invoices set total=1 where id=(saved->>'id')::uuid;exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Invoice total was changed';end if;

  perform set_config('request.jwt.claim.sub',pharmacist::text,true);
  otc:=public.create_clinic_invoice(patient,null,null,'OTC',gen_random_uuid(),jsonb_build_array(jsonb_build_object('price_item_id',medication_price,'quantity',2)));
  if (otc->>'total')::numeric<>6.60 or (public.record_invoice_payment((otc->>'id')::uuid,'Cash')->>'paid_by')::uuid<>pharmacist then
    raise exception 'Pharmacist own OTC invoice/payment failed';
  end if;
  if exists(select 1 from public.invoices where id=(saved->>'id')::uuid) then raise exception 'Pharmacist read cashier invoice';end if;

  foreach scenario in array array['Admin','Cashier','Pharmacist','Doctor','Nurse','Receptionist','Lab Technician','Inactive Cashier','Unassigned'] loop
    perform set_config('role','none',true);perform set_config('request.jwt.claim.sub','',true);scenario_id:=gen_random_uuid();
    insert into auth.users(id,aud,role,email,created_at,updated_at) values(scenario_id,'authenticated','authenticated','billing-test-'||scenario_id||'@example.invalid',now(),now());
    if scenario<>'Unassigned' then insert into public.staff(id,name,role,active)
      values(scenario_id,'Billing test fixture',case when scenario='Inactive Cashier' then 'Cashier' else scenario end,scenario<>'Inactive Cashier');end if;
    perform set_config('request.jwt.claim.sub',scenario_id::text,true);perform set_config('role','authenticated',true);
    rejected:=false;
    begin perform public.create_clinic_invoice(null,null,null,'Encounter',gen_random_uuid(),jsonb_build_array(jsonb_build_object('price_item_id',consultation_price,'quantity',1)));
    exception when insufficient_privilege then rejected:=true;when invalid_parameter_value then null;end;
    if rejected is distinct from (scenario not in ('Admin','Cashier')) then raise exception 'Invoice role mismatch for %',scenario;end if;
    rejected:=false;
    begin perform public.record_invoice_payment(gen_random_uuid(),'Cash');exception when insufficient_privilege then rejected:=true;when invalid_parameter_value then null;end;
    if rejected is distinct from (scenario not in ('Admin','Cashier','Pharmacist')) then raise exception 'Payment role mismatch for %',scenario;end if;
    if scenario='Admin' then
      if (select count(*) from public.audit_log where record_id=saved->>'id' and action='INSERT')<>1 or
         (select count(*) from public.audit_log where record_id=saved->>'id' and action='UPDATE')<>1 then raise exception 'Invoice/payment retry appended duplicate audits';end if;
    end if;
  end loop;
  perform set_config('role','anon',true);perform set_config('request.jwt.claim.sub','',true);rejected:=false;
  begin perform public.record_invoice_payment(gen_random_uuid(),'Cash');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Anonymous payment RPC was exposed';end if;
  rejected:=false;
  begin perform public.create_clinic_invoice(patient,null,null,'OTC',gen_random_uuid(),'[]');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Anonymous invoice RPC was exposed';end if;
  perform set_config('role','none',true);
end;
$$;
rollback;
select 'PASS: atomic invoice/order claims, catalogue totals, patient links, duplicate rejection, actor/time, payment retries, OTC isolation and role checks; fixtures rolled back' as result;

-- Run as database owner. Test rows/audits roll back; sequences may advance.
begin;
do $$
declare
  doctor uuid:=gen_random_uuid(); pharmacist uuid:=gen_random_uuid(); technician uuid:=gen_random_uuid(); cashier uuid:=gen_random_uuid();
  patient uuid:=gen_random_uuid(); consultation uuid:=gen_random_uuid(); rx uuid:=gen_random_uuid(); lab uuid:=gen_random_uuid();
  first_result jsonb; replay jsonb; rejected boolean; invoice uuid; scenario text; scenario_id uuid;
begin
  perform set_config('request.jwt.claim.sub','',true);
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  select id,'authenticated','authenticated','order-test-'||id||'@example.invalid',now(),now()
  from unnest(array[doctor,pharmacist,technician,cashier]) id;
  insert into public.staff(id,name,role,active) values
    (doctor,'Order completion test fixture','Doctor',true),
    (pharmacist,'Order completion test fixture','Pharmacist',true),
    (technician,'Order completion test fixture','Lab Technician',true),
    (cashier,'Order completion test fixture','Cashier',true);
  insert into public.patients(id,code,name,dob,gender,phone)
  values(patient,'ORDER-TEST-'||patient,'Order completion test fixture','2000-01-01','Other','test');
  insert into public.consultations(id,patient_id,doctor_id,diagnosis)
  values(consultation,patient,doctor,'Synthetic diagnosis');
  insert into public.prescriptions(id,consultation_id,drug,dosage,instructions)
  values(rx,consultation,'Synthetic drug','Test dose','Test instructions');
  insert into public.lab_orders(id,patient_id,consultation_id,test_name,ordered_by)
  values(lab,patient,consultation,'Synthetic test',doctor);

  perform set_config('request.jwt.claim.sub',pharmacist::text,true);
  perform set_config('role','authenticated',true);
  rejected:=false;
  begin update public.prescriptions set drug='Changed drug' where id=rx;
  exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Pharmacist changed prescribed drug';end if;
  -- Compatibility with the existing frontend: client author/time are replaced.
  update public.prescriptions set dispensed=true,dispensed_by=doctor,dispensed_at='1900-01-01' where id=rx;
  first_result:=public.dispense_prescription(rx);replay:=public.dispense_prescription(rx);
  if replay<>first_result or (first_result->>'dispensed_by')::uuid<>pharmacist
     or (first_result->>'dispensed_at')::timestamptz<now()-interval '1 minute' then
    raise exception 'Dispensing actor/time/retry assertion failed';
  end if;
  rejected:=false;
  begin update public.prescriptions set dispensed=false where id=rx;
  exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Dispensing reversed';end if;

  perform set_config('request.jwt.claim.sub',technician::text,true);
  rejected:=false;
  begin update public.lab_orders set test_name='Changed test' where id=lab;
  exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Technician changed ordered test';end if;
  update public.lab_orders set status='Completed',result='Synthetic result',completed_by=doctor,completed_at='1900-01-01' where id=lab;
  first_result:=public.complete_lab_order(lab,'Synthetic result');replay:=public.complete_lab_order(lab,'Synthetic result');
  if replay<>first_result or (first_result->>'completed_by')::uuid<>technician
     or (first_result->>'completed_at')::timestamptz<now()-interval '1 minute' then
    raise exception 'Lab actor/time/retry assertion failed';
  end if;
  rejected:=false;
  begin perform public.complete_lab_order(lab,'Changed result');
  exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Completed result was overwritten';end if;

  perform set_config('request.jwt.claim.sub',cashier::text,true);
  insert into public.invoices(patient_id,created_by) values(patient,cashier) returning id into invoice;
  insert into public.invoice_items(invoice_id,label,amount,prescription_id) values(invoice,'Synthetic medication',1,rx);
  insert into public.invoice_items(invoice_id,label,amount,lab_order_id) values(invoice,'Synthetic lab',1,lab);
  if not (select billed from public.prescriptions where id=rx) or not (select billed from public.lab_orders where id=lab) then
    raise exception 'Billing trigger no longer marks ordered items billed';
  end if;

  foreach scenario in array array['Admin','Doctor','Nurse','Receptionist','Pharmacist','Lab Technician','Cashier','Inactive Pharmacist','Unassigned'] loop
    perform set_config('role','none',true);perform set_config('request.jwt.claim.sub','',true);
    scenario_id:=gen_random_uuid();
    insert into auth.users(id,aud,role,email,created_at,updated_at)
    values(scenario_id,'authenticated','authenticated','order-test-'||scenario_id||'@example.invalid',now(),now());
    if scenario<>'Unassigned' then
      insert into public.staff(id,name,role,active)
      values(scenario_id,'Order completion test fixture',case when scenario='Inactive Pharmacist' then 'Pharmacist' else scenario end,scenario<>'Inactive Pharmacist');
    end if;
    perform set_config('request.jwt.claim.sub',scenario_id::text,true);perform set_config('role','authenticated',true);
    -- Unknown IDs distinguish permitted roles (22023) from forbidden roles (42501).
    rejected:=false;
    begin perform public.dispense_prescription(gen_random_uuid());
    exception when insufficient_privilege then rejected:=true;when invalid_parameter_value then null;end;
    if rejected is distinct from (scenario not in ('Admin','Pharmacist')) then raise exception 'Dispensing permission mismatch for %',scenario;end if;
    rejected:=false;
    begin perform public.complete_lab_order(gen_random_uuid(),'Synthetic result');
    exception when insufficient_privilege then rejected:=true;when invalid_parameter_value then null;end;
    if rejected is distinct from (scenario not in ('Admin','Lab Technician')) then raise exception 'Lab permission mismatch for %',scenario;end if;
    if scenario='Admin' then
      if (select count(*) from public.audit_log where table_name='prescriptions' and record_id=rx::text and action='UPDATE')<>2
         or (select count(*) from public.audit_log where table_name='lab_orders' and record_id=lab::text and action='UPDATE')<>2 then
        raise exception 'Expected completion and billing audit events missing or retries duplicated them';
      end if;
    end if;
  end loop;
  perform set_config('role','anon',true);
  rejected:=false;
  begin perform public.dispense_prescription(rx);exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Anonymous dispensing allowed';end if;
  rejected:=false;
  begin perform public.complete_lab_order(lab,'Synthetic result');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Anonymous lab completion allowed';end if;
  perform set_config('role','none',true);
end;
$$;
rollback;
select 'PASS: guarded dispensing/lab completion, trusted author/time, immutable orders/results, retries, role checks, billing compatibility and audit events; fixtures rolled back' as result;

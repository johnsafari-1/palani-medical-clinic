-- POST-DEPLOYMENT verification only. Run as database owner in SQL Editor.
-- Synthetic rows and audit events are rolled back; sequence numbers can advance.
begin;
do $$
declare
  actor uuid := gen_random_uuid();
  patient uuid := gen_random_uuid();
  other_patient uuid := gen_random_uuid();
  visit uuid := gen_random_uuid();
  request uuid := gen_random_uuid();
  saved jsonb;
  replay jsonb;
  rejected boolean;
  scenario text;
  scenario_id uuid;
  clinic_table text;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(actor,'authenticated','authenticated','clinical-test-'||actor||'@example.invalid',now(),now());
  insert into public.staff(id,name,role,active) values(actor,'Clinical test fixture','Doctor',true);
  insert into public.patients(id,code,name,dob,gender,phone) values
    (patient,'TEST-'||patient,'Clinical test fixture','2000-01-01','Other','test'),
    (other_patient,'TEST-'||other_patient,'Clinical test fixture','2000-01-01','Other','test');
  insert into public.visits(id,patient_id) values(visit,patient);
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('role', 'authenticated', true);
  saved := public.save_clinical_consultation(patient,visit,request,'Synthetic diagnosis','Test notes',
    '[{"drug":"Synthetic medicine","dosage":"Test dosage","instructions":"Test instructions"}]', '["Synthetic lab test"]');
  replay := public.save_clinical_consultation(patient,visit,request,'Synthetic diagnosis','Test notes',
    '[{"drug":"Synthetic medicine","dosage":"Test dosage","instructions":"Test instructions"}]', '["Synthetic lab test"]');
  if saved <> replay then raise exception 'Retry did not return the same consultation'; end if;
  if (select count(*) from public.consultations where request_id=request) <> 1
     or (select count(*) from public.prescriptions where consultation_id=(saved->>'id')::uuid) <> 1
     or (select count(*) from public.lab_orders where consultation_id=(saved->>'id')::uuid) <> 1
     or (select status from public.visits where id=visit) <> 'Completed'
     or (select doctor_id from public.consultations where id=(saved->>'id')::uuid) <> actor then
    raise exception 'Atomic consultation, actor or order assertion failed';
  end if;
  rejected := false;
  begin
    perform public.save_clinical_consultation(patient,visit,request,'Changed diagnosis','Test notes','[]','[]');
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Changed payload was accepted with old request ID'; end if;
  rejected := false;
  begin
    perform public.save_clinical_consultation(patient,visit,gen_random_uuid(),'Synthetic diagnosis','','[]','[]');
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Duplicate visit consultation was accepted'; end if;
  rejected := false;
  begin
    perform public.save_clinical_consultation(other_patient,visit,gen_random_uuid(),'Synthetic diagnosis','','[]','[]');
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Wrong-patient visit was accepted'; end if;

  foreach scenario in array array['Admin','Receptionist','Nurse','Lab Technician','Pharmacist','Cashier','Inactive Doctor'] loop
    perform set_config('role','none',true);
    perform set_config('request.jwt.claim.sub','',true);
    scenario_id := gen_random_uuid();
    insert into auth.users(id,aud,role,email,created_at,updated_at)
    values(scenario_id,'authenticated','authenticated','clinical-test-'||scenario_id||'@example.invalid',now(),now());
    insert into public.staff(id,name,role,active)
    values(scenario_id,'Clinical test fixture',case when scenario='Inactive Doctor' then 'Doctor' else scenario end,scenario<>'Inactive Doctor');
    perform set_config('request.jwt.claim.sub',scenario_id::text,true);
    perform set_config('role','authenticated',true);
    rejected := false;
    begin
      perform public.save_clinical_consultation(patient,null,gen_random_uuid(),'Synthetic role check','','[]','[]');
    exception when insufficient_privilege then rejected := true; end;
    if rejected is distinct from (scenario <> 'Admin') then
      raise exception 'Unexpected clinical save authorization for %',scenario;
    end if;
    if scenario='Admin' then
      if (select count(*) from public.audit_log where record_id=saved->>'id' and action='INSERT' and table_name='consultations' and staff_id=actor and new_data is not null)<>1 then
        raise exception 'Consultation creation audit event missing or duplicated';
      end if;
      rejected := false;
      begin
        insert into public.audit_log(table_name,action) values('test','FORGED');
      exception when insufficient_privilege then rejected := true; end;
      if not rejected then raise exception 'Admin browser role can forge audit events'; end if;
    end if;
    foreach clinic_table in array array['staff','patients','visits','consultations','prescriptions','lab_orders','vitals','admissions','referrals','invoices','invoice_items','price_list','audit_log'] loop
      if has_table_privilege(current_user,'public.'||clinic_table,'TRUNCATE') then
        raise exception 'Browser role still has TRUNCATE on %',clinic_table;
      end if;
    end loop;
  end loop;
  perform set_config('role','anon',true);
  rejected := false;
  begin
    perform public.save_clinical_consultation(patient,null,gen_random_uuid(),'Anonymous test','','[]','[]');
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Anonymous clinical save accepted'; end if;
  perform set_config('role','none',true);
end;
$$;
rollback;
select 'PASS: synthetic clinical save/retry, visit integrity, role checks, creation audit and protected audit/TRUNCATE grants; rows rolled back' as result;

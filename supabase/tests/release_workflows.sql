-- Synthetic post-deployment verification. Rows/audits roll back; sequences may advance.
begin;
do $$
declare
  actor uuid:=gen_random_uuid(); nurse uuid:=gen_random_uuid(); patient uuid:=gen_random_uuid();
  request uuid:=gen_random_uuid(); admission_request uuid:=gen_random_uuid(); v jsonb; a jsonb; saved jsonb; r jsonb; rejected boolean;
begin
  perform set_config('request.jwt.claim.sub','',true);
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (actor,'authenticated','authenticated','release-test-'||actor||'@example.invalid',now(),now()),
    (nurse,'authenticated','authenticated','release-test-'||nurse||'@example.invalid',now(),now());
  insert into public.staff(id,name,role) values(actor,'Release test fixture','Admin'),(nurse,'Release test fixture','Nurse');
  insert into public.patients(id,code,name,dob,gender,phone) values(patient,'TEST-'||patient,'Release test fixture','2000-01-01','Other','test');
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('role','authenticated',true);
  v:=public.check_in_patient(patient,request,'Synthetic reason');
  if v<>public.check_in_patient(patient,request,'Synthetic reason') or (v->>'checked_in_by')::uuid<>actor then raise exception 'Check-in retry/actor failure';end if;
  rejected:=false;
  begin perform public.check_in_patient(patient,gen_random_uuid(),'Synthetic reason');exception when unique_violation then rejected:=true;end;
  if not rejected then raise exception 'Duplicate active visit accepted';end if;
  saved:=public.start_clinic_visit(patient,(v->>'id')::uuid);
  if saved->>'status'<>'In Consultation' or saved<>public.start_clinic_visit(patient,(v->>'id')::uuid) then raise exception 'Visit start/retry failure';end if;
  a:=public.admit_clinic_patient(patient,(v->>'id')::uuid,admission_request,'Synthetic ward reason');
  if a<>public.admit_clinic_patient(patient,(v->>'id')::uuid,admission_request,'Synthetic ward reason') then raise exception 'Admission retry failure';end if;
  saved:=public.discharge_clinic_patient(patient,(a->>'id')::uuid,(v->>'id')::uuid);
  if saved->>'status'<>'Discharged' or (saved->>'discharged_by')::uuid<>actor
    or saved<>public.discharge_clinic_patient(patient,(a->>'id')::uuid,(v->>'id')::uuid)
    or (select status from public.visits where id=(v->>'id')::uuid)<>'Completed' then raise exception 'Atomic discharge/retry failure';end if;
  rejected:=false;
  begin update public.visits set status='Waiting' where id=(v->>'id')::uuid;exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Completed visit reopened';end if;
  rejected:=false;
  begin update public.admissions set reason='Changed' where id=(a->>'id')::uuid;exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Original ward fields edited';end if;
  r:=public.clinic_operations_report();
  if r->>'schema_version'<>'1' or (r->>'totalPatients')::bigint<1 then raise exception 'Report metadata/count failure';end if;
  perform set_config('request.jwt.claim.sub',nurse::text,true);rejected:=false;
  begin perform public.clinic_operations_report();exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Nurse report access accepted';end if;
  rejected:=false;
  begin perform public.check_in_patient(patient,gen_random_uuid(),'');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Nurse check-in accepted';end if;
  perform set_config('role','none',true);update public.staff set active=false where id=actor;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('role','authenticated',true);rejected:=false;
  begin perform public.clinic_operations_report();exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Inactive report access accepted';end if;
  perform set_config('role','anon',true);rejected:=false;
  begin perform public.clinic_operations_report();exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Anonymous report access accepted';end if;
  perform set_config('role','none',true);
  if (select count(*) from public.audit_log where table_name='admissions' and record_id=a->>'id' and action='UPDATE')<>1
    or (select count(*) from public.audit_log where table_name='visits' and record_id=v->>'id' and action='UPDATE')<>2 then raise exception 'Missing or duplicate care audits';end if;
end;
$$;
rollback;
select 'PASS: guarded check-in/start/admission/discharge, atomic completion, retries, terminal identity protection, Admin reports and role checks; fixtures rolled back' as result;

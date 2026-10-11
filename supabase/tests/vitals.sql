-- Hosted check: synthetic rows and audits roll back; sequence counters can advance.
begin;
do $$
declare nurse uuid:=gen_random_uuid(); other_nurse uuid:=gen_random_uuid(); doctor uuid:=gen_random_uuid();
  patient uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); measured timestamptz:='2026-10-11T09:30:00Z';
  saved jsonb; replay jsonb; legacy public.vitals%rowtype; rejected boolean;
begin
  perform set_config('request.jwt.claim.sub','',true);
  insert into auth.users(id,aud,role,email,created_at,updated_at)
    select id,'authenticated','authenticated','vitals-test-'||id||'@example.invalid',now(),now() from unnest(array[nurse,other_nurse,doctor]) id;
  insert into public.staff(id,name,role,active) values(nurse,'Vitals test fixture','Nurse',true),(other_nurse,'Vitals test fixture','Nurse',true),(doctor,'Vitals test fixture','Doctor',true);
  insert into public.patients(id,code,name,dob,gender,phone) values(patient,'VITALS-TEST-'||patient,'Vitals test fixture','2000-01-01','Other','test');
  perform set_config('request.jwt.claim.sub',nurse::text,true);perform set_config('role','authenticated',true);
  saved:=public.save_patient_vitals(patient,120,80,36.8,76,68.25,measured,request);
  replay:=public.save_patient_vitals(patient,120,80,36.8,76,68.25,measured,request);
  if saved<>replay or saved->>'bp'<>'120/80' or (saved->>'bp_systolic')::numeric<>120 or (saved->>'recorded_by')::uuid<>nurse
    or (saved->>'measured_at')::timestamptz<>measured or (saved->>'recorded_at')::timestamptz<now()-interval '1 minute' then raise exception 'Structured reading/actor/time/retry failure';end if;
  rejected:=false;
  begin perform public.save_patient_vitals(patient,120,80,36.8,77,68.25,measured,request);exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Changed retry accepted';end if;
  rejected:=false;
  begin perform public.save_patient_vitals(patient,120,null,null,null,null,measured,gen_random_uuid());exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Partial pressure accepted';end if;
  rejected:=false;
  begin perform public.save_patient_vitals(patient,null,null,null,1.5,null,measured,gen_random_uuid());exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Fractional pulse rounded silently';end if;
  insert into public.vitals(patient_id,bp,recorded_by,recorded_at) values(patient,'120 / 80',doctor,'1900-01-01') returning * into legacy;
  if legacy.recorded_by<>nurse or legacy.bp_systolic<>120 or legacy.measured_at is not null or legacy.recorded_at<now()-interval '1 minute' then raise exception 'Legacy compatibility/actor failure';end if;
  perform set_config('request.jwt.claim.sub',other_nurse::text,true);rejected:=false;
  begin perform public.save_patient_vitals(patient,120,80,36.8,76,68.25,measured,request);exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Another recorder replayed submission';end if;
  perform set_config('request.jwt.claim.sub',doctor::text,true);rejected:=false;
  begin perform public.save_patient_vitals(patient,120,80,36.8,76,68.25,measured,gen_random_uuid());exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Doctor saved Nurse readings';end if;
  perform set_config('role','none',true);update public.staff set active=false where id=nurse;
  perform set_config('request.jwt.claim.sub',nurse::text,true);perform set_config('role','authenticated',true);rejected:=false;
  begin perform public.save_patient_vitals(patient,120,80,36.8,76,68.25,measured,gen_random_uuid());exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Inactive Nurse saved readings';end if;
  perform set_config('role','anon',true);perform set_config('request.jwt.claim.sub','',true);rejected:=false;
  begin perform public.save_patient_vitals(patient,120,80,36.8,76,68.25,measured,gen_random_uuid());exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Anonymous caller saved readings';end if;
  perform set_config('role','none',true);
  if (select count(*) from public.vitals where patient_id=patient)<>2 or
    (select count(*) from public.audit_log where record_id=saved->>'id' and action='INSERT')<>1 then raise exception 'Failed save/retry left extra rows or audits';end if;
end;
$$;
rollback;
select 'PASS: structured vitals, measured time, trusted recorder/time, safe retry, invalid readings, legacy compatibility, role checks and audits; fixtures rolled back' as result;

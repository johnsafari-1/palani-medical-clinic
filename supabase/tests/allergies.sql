-- Owner-executed, synthetic transaction only. All fixtures/revisions/audits roll back.
begin;
do $$
declare doctor uuid:=gen_random_uuid(); nurse uuid:=gen_random_uuid(); cashier uuid:=gen_random_uuid(); patient uuid:=gen_random_uuid();
  request uuid:=gen_random_uuid(); first jsonb; second jsonb; third jsonb; retry jsonb; allergy jsonb; rejected boolean; count_rows integer;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
    select id,'authenticated','authenticated','allergy-test-'||id||'@example.invalid',now(),now() from unnest(array[doctor,nurse,cashier]) id;
  insert into public.staff(id,name,role,active) values(doctor,'Allergy test fixture','Doctor',true),(nurse,'Allergy test fixture','Nurse',true),(cashier,'Allergy test fixture','Cashier',true);
  insert into public.patients(id,code,name,dob,gender,phone) values(patient,'ALLERGY-TEST-'||patient,'Allergy test fixture','2000-01-01','Other','test');
  perform set_config('request.jwt.claim.sub',doctor::text,true);set local role authenticated;
  first:=public.save_patient_allergy_review(patient,null,'unknown','[]','Initial assessment',request);
  retry:=public.save_patient_allergy_review(patient,null,'unknown','[]','Initial assessment',request);
  if first<>retry or first->>'recorded_by'<>doctor::text or (first->>'revision')::integer<>1 then raise exception 'Initial save/retry failed'; end if;
  allergy:=jsonb_build_object('id',gen_random_uuid(),'substance','Synthetic substance','reaction','Synthetic rash','severity','mild','criticality','unable-to-assess','category','medication','type','','clinical_status','active','verification_status','unconfirmed','note','Test fixture');
  second:=public.save_patient_allergy_review(patient,(first->>'id')::uuid,'known',jsonb_build_array(allergy),'Reviewed with patient',gen_random_uuid());
  if (second->>'revision')::integer<>2 or second->>'previous_id'<>first->>'id' then raise exception 'Attributed revision failed'; end if;
  rejected:=false;begin perform public.save_patient_allergy_review(patient,(second->>'id')::uuid,'no_known','[]','Silent removal',gen_random_uuid()); exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Saved allergy silently removed';end if;
  allergy:=allergy||jsonb_build_object('verification_status','entered-in-error','clinical_status',null);
  third:=public.save_patient_allergy_review(patient,(second->>'id')::uuid,'no_known',jsonb_build_array(allergy),'Corrected erroneous report; original retained',gen_random_uuid());
  if (third->>'revision')::integer<>3 or third->'allergies'->0->>'id'<>second->'allergies'->0->>'id' then raise exception 'Correction identity lost';end if;
  rejected:=false;begin perform public.save_patient_allergy_review(patient,(first->>'id')::uuid,'unknown','[]','Stale correction',gen_random_uuid()); exception when serialization_failure then rejected:=true;end;
  if not rejected then raise exception 'Stale revision allowed';end if;
  rejected:=false;begin perform public.save_patient_allergy_review(patient,null,'no_known','[]','Changed retry',request); exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Changed retry allowed';end if;
  rejected:=false;begin perform public.save_patient_allergy_review(patient,(third->>'id')::uuid,'known','[]','Invalid empty list',gen_random_uuid()); exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Invalid known assessment allowed';end if;
  perform set_config('request.jwt.claim.sub',nurse::text,true);
  select count(*) into count_rows from public.patient_allergy_reviews where patient_id=patient;if count_rows<>3 then raise exception 'Nurse read denied';end if;
  rejected:=false;begin perform public.save_patient_allergy_review(patient,(second->>'id')::uuid,'unknown','[]','Unauthorized',gen_random_uuid());exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Nurse write allowed';end if;
  perform set_config('request.jwt.claim.sub',cashier::text,true);
  select count(*) into count_rows from public.patient_allergy_reviews where patient_id=patient;if count_rows<>0 then raise exception 'Cashier allergy read allowed';end if;
  reset role;update public.staff set active=false where id=doctor;perform set_config('request.jwt.claim.sub',doctor::text,true);set local role authenticated;
  rejected:=false;begin perform public.save_patient_allergy_review(patient,(second->>'id')::uuid,'unknown','[]','Inactive',gen_random_uuid());exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Inactive doctor write allowed';end if;
  set local role anon;
  rejected:=false;begin perform public.save_patient_allergy_review(patient,null,'unknown','[]','Anonymous',gen_random_uuid());exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Anonymous RPC allowed';end if;
  reset role;
  select count(*) into count_rows from public.audit_log where table_name='patient_allergy_reviews' and record_id in (first->>'id',second->>'id',third->>'id');
  if count_rows<>3 then raise exception 'Allergy audit count mismatch';end if;
end;
$$;
rollback;
select 'PASS: explicit allergy states, attributed revisions, matching retry, stale/conflicting rejection, role-restricted reads/writes and audit events; fixtures rolled back' as result;

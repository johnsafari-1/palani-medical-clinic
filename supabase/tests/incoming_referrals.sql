-- Synthetic hosted verification only; all rows/audits roll back, sequences may advance.
begin;
do $$
declare
  actor uuid:=gen_random_uuid(); admin_actor uuid:=gen_random_uuid(); doctor uuid:=gen_random_uuid();
  patient uuid:=gen_random_uuid(); visit uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); direction_request uuid;
  saved jsonb; replay jsonb; rejected boolean;
begin
  perform set_config('request.jwt.claim.sub','',true);
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (actor,'authenticated','authenticated','incoming-referral-test-'||actor||'@example.invalid',now(),now()),
    (admin_actor,'authenticated','authenticated','incoming-referral-test-'||admin_actor||'@example.invalid',now(),now()),
    (doctor,'authenticated','authenticated','incoming-referral-test-'||doctor||'@example.invalid',now(),now());
  insert into public.staff(id,name,role) values(actor,'Incoming referral test fixture','Receptionist'),(admin_actor,'Incoming referral test fixture','Admin'),(doctor,'Incoming referral test fixture','Doctor');
  insert into public.patients(id,code,name,dob,gender,phone) values(patient,'TEST-'||patient,'Incoming referral test fixture','2000-01-01','Other','test');
  insert into public.visits(id,patient_id) values(visit,patient);
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('role','authenticated',true);
  saved:=public.save_incoming_referral(patient,request,'Source facility','Reported doctor','Source reason','Urgent','Source notes');
  replay:=public.save_incoming_referral(patient,request,'Source facility','Reported doctor','Source reason','Urgent','Source notes');
  if saved<>replay or saved->>'direction'<>'Incoming' or (saved->>'created_by')::uuid<>actor
    or saved->>'visit_id' is not null or saved ? 'request_hash'
    or (select status from public.visits where id=visit)<>'Waiting' then raise exception 'Incoming identity/retry/visit assertion failed';end if;
  rejected:=false;
  begin perform public.save_incoming_referral(patient,request,'Changed','','Source reason','Urgent','Source notes');exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Changed incoming retry accepted';end if;
  perform set_config('request.jwt.claim.sub',doctor::text,true);rejected:=false;
  begin perform public.save_incoming_referral(patient,gen_random_uuid(),'Source','','Reason','Routine','');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Doctor incoming RPC accepted';end if;
  perform set_config('request.jwt.claim.sub',admin_actor::text,true);direction_request:=gen_random_uuid();
  perform public.save_incoming_referral(patient,direction_request,'Same','Same','Same','Routine','Same');rejected:=false;
  begin perform public.save_outgoing_referral(patient,null,direction_request,'Same','Same','Same','Routine','Same');exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Incoming ID reused for outgoing';end if;
  direction_request:=gen_random_uuid();perform public.save_outgoing_referral(patient,null,direction_request,'Same','Same','Same','Routine','Same');rejected:=false;
  begin perform public.save_incoming_referral(patient,direction_request,'Same','Same','Same','Routine','Same');exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Outgoing ID reused for incoming';end if;
  perform set_config('role','none',true);update public.staff set active=false where id=actor;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('role','authenticated',true);rejected:=false;
  begin perform public.save_incoming_referral(patient,gen_random_uuid(),'Source','','Reason','Routine','');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Inactive Reception accepted';end if;
  perform set_config('role','anon',true);rejected:=false;
  begin perform public.save_incoming_referral(patient,gen_random_uuid(),'Source','','Reason','Routine','');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Anonymous incoming RPC accepted';end if;
  perform set_config('role','none',true);
  if (select count(*) from public.referrals where request_id=request)<>1
    or (select count(*) from public.audit_log where table_name='referrals' and record_id=saved->>'id' and action='INSERT')<>1
    or exists(select 1 from public.audit_log where table_name='visits' and record_id=visit::text and action='UPDATE') then raise exception 'Duplicate or unexpected visit/audit writes';end if;
end;
$$;
rollback;
select 'PASS: incoming referral retries, direction isolation, attribution, roles and untouched visits; fixtures rolled back' as result;

-- Hosted test-data verification: all fixtures and audits roll back; sequences can advance.
begin;
do $$
declare
  actor uuid:=gen_random_uuid(); patient uuid:=gen_random_uuid(); visit uuid:=gen_random_uuid();
  request uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); saved jsonb; replay jsonb; rejected boolean;
begin
  perform set_config('request.jwt.claim.sub','',true);
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (actor,'authenticated','authenticated','referral-test-'||actor||'@example.invalid',now(),now()),
    (other_actor,'authenticated','authenticated','referral-test-'||other_actor||'@example.invalid',now(),now());
  insert into public.staff(id,name,role) values(actor,'Referral test fixture','Doctor'),(other_actor,'Referral test fixture','Nurse');
  insert into public.patients(id,code,name,dob,gender,phone) values(patient,'TEST-'||patient,'Referral test fixture','2000-01-01','Other','test');
  insert into public.visits(id,patient_id) values(visit,patient);
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('role','authenticated',true);
  saved:=public.save_outgoing_referral(patient,visit,request,'Synthetic facility','Synthetic receiving doctor','Synthetic reason','Routine','Synthetic notes');
  replay:=public.save_outgoing_referral(patient,visit,request,'Synthetic facility','Synthetic receiving doctor','Synthetic reason','Routine','Synthetic notes');
  if saved<>replay or (saved->>'created_by')::uuid<>actor or (saved->>'visit_id')::uuid<>visit
    or (saved->>'request_id')::uuid<>request or saved ? 'request_hash'
    or (select status from public.visits where id=visit)<>'Completed' then raise exception 'Referral/visit/retry identity failure';end if;
  rejected:=false;
  begin perform public.save_outgoing_referral(patient,visit,request,'Changed facility','','Synthetic reason','Routine','Synthetic notes');
  exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Changed retry accepted';end if;
  rejected:=false;
  begin perform public.save_outgoing_referral(patient,visit,gen_random_uuid(),'Synthetic facility','','Synthetic reason','Routine','');
  exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Completed visit accepted';end if;
  rejected:=false;
  begin perform public.save_outgoing_referral(patient,gen_random_uuid(),gen_random_uuid(),'Synthetic facility','','Synthetic reason','Routine','');
  exception when invalid_parameter_value then rejected:=true;end;
  if not rejected then raise exception 'Missing visit accepted';end if;
  perform set_config('request.jwt.claim.sub',other_actor::text,true);
  rejected:=false;
  begin perform public.save_outgoing_referral(patient,null,gen_random_uuid(),'Synthetic facility','','Synthetic reason','Routine','');
  exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Nurse referral accepted';end if;
  perform set_config('role','none',true);update public.staff set active=false where id=actor;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('role','authenticated',true);
  rejected:=false;
  begin perform public.save_outgoing_referral(patient,null,gen_random_uuid(),'Synthetic facility','','Synthetic reason','Routine','');
  exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Inactive recorder accepted';end if;
  perform set_config('role','anon',true);rejected:=false;
  begin perform public.save_outgoing_referral(patient,null,gen_random_uuid(),'Synthetic facility','','Synthetic reason','Routine','');
  exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Anonymous RPC accepted';end if;
  perform set_config('role','none',true);
  if (select count(*) from public.referrals where request_id=request)<>1
    or (select count(*) from public.audit_log where table_name='referrals' and record_id=saved->>'id' and action='INSERT')<>1
    or (select count(*) from public.audit_log where table_name='visits' and record_id=visit::text and action='UPDATE')<>1 then
    raise exception 'Duplicate rows or missing transaction audits';end if;
end;
$$;
rollback;
select 'PASS: atomic referral checks; all synthetic rows rolled back' as result;

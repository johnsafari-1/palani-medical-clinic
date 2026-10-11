-- Run as the project database owner. All fixtures and writes are rolled back.
begin;
create temporary table palani_auth_cases (
  case_name text, user_id uuid, staff_role text, active boolean
) on commit drop;
insert into palani_auth_cases
select role, gen_random_uuid(), role, true
from unnest(array['Admin','Receptionist','Doctor','Nurse','Lab Technician','Pharmacist','Cashier']) role;
insert into palani_auth_cases values
('Inactive Admin', gen_random_uuid(), 'Admin', false),
('Unassigned user', gen_random_uuid(), null, null);
grant select on palani_auth_cases to authenticated;
insert into auth.users (id, aud, role, email, created_at, updated_at)
select user_id, 'authenticated', 'authenticated',
       'palani-auth-test-' || user_id::text || '@example.invalid', now(), now()
from palani_auth_cases;
insert into public.staff (id, name, role, active)
select user_id, 'Auth test fixture', staff_role, active
from palani_auth_cases where staff_role is not null;
create temporary table palani_auth_patient (id uuid) on commit drop;
insert into palani_auth_patient values (gen_random_uuid());
grant select on palani_auth_patient to authenticated;
insert into public.patients (id, code, name, dob, gender, phone)
select id, 'AUTH-' || id::text, 'Auth test fixture', date '2000-01-01', 'Other', 'test'
from palani_auth_patient;

set local role authenticated;
do $$
declare
  scenario record;
  clinic_table text;
  visible bigint;
  changed bigint;
  denied boolean;
  fixture uuid;
begin
  select id into fixture from pg_temp.palani_auth_patient;
  for scenario in select * from pg_temp.palani_auth_cases loop
    perform set_config('request.jwt.claim.sub', scenario.user_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', scenario.user_id, 'role', 'authenticated')::text, true);
    if public.current_staff_role() is distinct from
       (case when scenario.active is true then scenario.staff_role else null end) then
      raise exception 'Role validation failed for %', scenario.case_name;
    end if;

    if scenario.active is not true then
      foreach clinic_table in array array[
        'patients','visits','consultations','vitals','prescriptions','lab_orders',
        'admissions','referrals','invoices','invoice_items','price_list','audit_log'
      ] loop
        execute format('select count(*) from public.%I', clinic_table) into visible;
        if visible <> 0 then raise exception '% can read %', scenario.case_name, clinic_table; end if;
      end loop;
    else
      select count(*) into visible from public.patients where id = fixture;
      if visible <> 1 then raise exception 'Active % cannot read patient fixture', scenario.case_name; end if;
    end if;

    -- Only an active Admin/Receptionist may create and update patients.
    denied := false;
    begin
      insert into public.patients (code, name, dob, gender, phone, registered_by)
      values ('AUTH-' || gen_random_uuid()::text, 'Auth write fixture', date '2000-01-01',
              'Other', 'test', scenario.user_id);
    exception when insufficient_privilege then
      denied := true;
    end;
    if denied is distinct from not (coalesce(scenario.active, false) and scenario.staff_role in ('Admin','Receptionist')) then
      raise exception 'Insert permission mismatch for %', scenario.case_name;
    end if;

    update public.patients set address = 'Auth test update' where id = fixture;
    get diagnostics changed = row_count;
    if changed <> (case when scenario.active is true and scenario.staff_role in ('Admin','Receptionist') then 1 else 0 end) then
      raise exception 'Update permission mismatch for %', scenario.case_name;
    end if;

    -- An inactive Admin only sees its own profile and cannot manage staff.
    if scenario.case_name = 'Inactive Admin' then
      select count(*) into visible from public.staff;
      if visible <> 1 then raise exception 'Inactive Admin can list staff'; end if;
      update public.staff set active = true where id = scenario.user_id;
      get diagnostics changed = row_count;
      if changed <> 0 then raise exception 'Inactive Admin can reactivate itself'; end if;
    end if;
    if scenario.staff_role = 'Doctor' then
      update public.staff set role = 'Admin' where id = scenario.user_id;
      get diagnostics changed = row_count;
      if changed <> 0 then raise exception 'Doctor can escalate its role'; end if;
    end if;
  end loop;
  if has_function_privilege(current_user, 'public.log_audit()', 'execute')
     or has_function_privilege(current_user, 'public.validate_billing_source()', 'execute') then
    raise exception 'Trigger functions are still exposed to authenticated callers';
  end if;
end
$$;

set local role none;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$
declare
  clinic_table text;
  visible bigint;
begin
  foreach clinic_table in array array[
    'staff','patients','visits','consultations','vitals','prescriptions','lab_orders',
    'admissions','referrals','invoices','invoice_items','price_list','audit_log'
  ] loop
    execute format('select count(*) from public.%I', clinic_table) into visible;
    if visible <> 0 then raise exception 'Anonymous access to %', clinic_table; end if;
  end loop;
  if has_function_privilege(current_user, 'public.current_staff_role()', 'execute') then
    raise exception 'Anonymous callers can execute the staff role function';
  end if;
end
$$;
rollback;
select 'PASS: anonymous and unassigned accounts denied; all seven active roles verified; inactive Admin denied; patient writes and role escalation checked; fixtures rolled back' as result;

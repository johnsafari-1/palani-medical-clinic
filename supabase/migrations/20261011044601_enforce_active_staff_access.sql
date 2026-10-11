-- Harden the existing Palani schema; this is not a full database baseline.
alter table public.staff add column if not exists active boolean not null default true;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Definer privileges are needed only here to avoid staff-policy recursion.
-- This unexposed function only returns the caller's own active staff role.
create or replace function private.active_staff_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select s.role from public.staff s
  where (select auth.uid()) is not null
    and s.id = (select auth.uid())
    and s.active is true
    and s.role in ('Admin', 'Receptionist', 'Doctor', 'Nurse', 'Lab Technician', 'Pharmacist', 'Cashier')
$$;
revoke all on function private.active_staff_role() from public, anon;
grant execute on function private.active_staff_role() to authenticated;

-- Keep existing role-specific policies compatible without exposing a definer RPC.
create or replace function public.current_staff_role()
returns text
language sql stable security invoker
set search_path = ''
as $$ select private.active_staff_role() $$;
revoke all on function public.current_staff_role() from public, anon;
grant execute on function public.current_staff_role() to authenticated;

alter table public.staff enable row level security;
drop policy if exists staff_select_all on public.staff;
drop policy if exists staff_select_own_or_admin on public.staff;
create policy staff_select_own_or_admin on public.staff
for select to authenticated
using (id = (select auth.uid()) or (select private.active_staff_role()) = 'Admin');

-- Restrictive policies combine with, rather than replace, existing department
-- permissions. Old JWTs cannot read or write clinic data after deactivation.
do $$
declare
  clinic_table text;
begin
  foreach clinic_table in array array[
    'patients', 'visits', 'consultations', 'vitals', 'prescriptions',
    'lab_orders', 'admissions', 'referrals', 'invoices', 'invoice_items',
    'price_list', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', clinic_table);
    execute format('drop policy if exists active_staff_required on public.%I', clinic_table);
    execute format(
      'create policy active_staff_required on public.%I as restrictive for all to authenticated using ((select private.active_staff_role()) is not null) with check ((select private.active_staff_role()) is not null)',
      clinic_table
    );
  end loop;
end
$$;

-- Trigger execution does not require exposing these as callable RPCs.
revoke execute on function public.log_audit() from public, anon, authenticated;
revoke execute on function public.validate_billing_source() from public, anon, authenticated;

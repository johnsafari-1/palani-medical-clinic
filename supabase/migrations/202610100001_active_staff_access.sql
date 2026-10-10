-- Apply to a staging copy first. This extends existing role policies; it does
-- not grant access, delete records, or establish role-specific clinical reads.
begin;
alter table public.staff add column if not exists active boolean not null default true;

create or replace function public.current_staff_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role from public.staff where id = auth.uid() and active is true
$$;
revoke all on function public.current_staff_role() from public, anon;
grant execute on function public.current_staff_role() to authenticated, service_role;

-- RESTRICTIVE policies are ANDed with existing permissive policies. A stale JWT
-- cannot bypass deactivation even where an existing SELECT policy uses true.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'staff', 'patients', 'consultations', 'prescriptions', 'lab_orders',
    'vitals', 'invoices', 'invoice_items', 'visits', 'admissions',
    'referrals', 'price_list', 'audit_log'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from anon', table_name);
      -- TRUNCATE is not governed by RLS.
      execute format('revoke truncate on table public.%I from authenticated', table_name);
      execute format('drop policy if exists active_staff_required on public.%I', table_name);
      execute format('create policy active_staff_required on public.%I as restrictive for all to authenticated using ((select public.current_staff_role()) is not null) with check ((select public.current_staff_role()) is not null)', table_name);
    end if;
  end loop;
end $$;

-- Retain staff identity and foreign-key history. Use deactivation rather than
-- deleting staff through the browser. Backend/service-role retention controls
-- must still be reviewed separately.
revoke delete on public.staff from authenticated;
drop policy if exists staff_delete_admin on public.staff;
commit;

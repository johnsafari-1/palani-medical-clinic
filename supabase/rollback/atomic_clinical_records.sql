-- Emergency compatibility rollback. Run only after reverting the frontend.
-- Preserves all records, added columns, unique indexes and captured audit history.
-- Keeps the safer audit-write and TRUNCATE revocations in place.
begin;
revoke execute on function public.save_clinical_consultation(uuid,uuid,uuid,text,text,jsonb,jsonb)
  from public, anon, authenticated;
do $$
declare clinic_table text;
begin
  foreach clinic_table in array array['staff','patients','visits','consultations','prescriptions',
    'lab_orders','vitals','admissions','referrals','invoices','invoice_items','price_list'] loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || clinic_table, clinic_table);
  end loop;
  -- Exact pre-change trigger coverage from the inspected project catalog.
  foreach clinic_table in array array['patients','consultations','prescriptions','invoices',
    'admissions','staff','price_list','visits','referrals'] loop
    execute format('create trigger %I after update or delete on public.%I for each row execute function public.log_audit()',
      'audit_' || clinic_table, clinic_table);
  end loop;
end;
$$;
commit;

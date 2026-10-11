-- Revert the Pharmacy/Lab frontend first. Keeps all records and audit history.
begin;
revoke execute on function public.dispense_prescription(uuid) from public,anon,authenticated;
revoke execute on function public.complete_lab_order(uuid,text) from public,anon,authenticated;
drop trigger if exists guard_prescription_write on public.prescriptions;
drop trigger if exists guard_lab_order_write on public.lab_orders;
commit;

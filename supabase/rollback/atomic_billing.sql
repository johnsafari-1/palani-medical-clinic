-- Revert the Cashier frontend first. Retain every invoice, line and audit event.
begin;
revoke execute on function public.create_clinic_invoice(uuid,uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.record_invoice_payment(uuid,text) from public,anon,authenticated;
drop trigger if exists guard_invoice_write on public.invoices;
drop trigger if exists a_guard_invoice_item_write on public.invoice_items;
drop trigger if exists guard_invoice_item_billing on public.invoice_items;
create trigger guard_invoice_item_billing before insert on public.invoice_items
for each row execute function public.validate_billing_source();
drop policy if exists invoices_select_own_otc on public.invoices;
drop policy if exists invoice_items_select_own_otc on public.invoice_items;
commit;

-- Revert Nurse UI first. Retain every reading, audit, column and request-ID index.
begin;
revoke execute on function public.save_patient_vitals(uuid,numeric,numeric,numeric,numeric,numeric,timestamptz,uuid) from authenticated;
drop trigger if exists guard_vitals_write on public.vitals;
commit;

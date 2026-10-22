-- Revert the new frontend first. Retain records, identities, RLS, indexes and guards.
revoke execute on function public.check_in_patient(uuid,uuid,text),public.start_clinic_visit(uuid,uuid),public.admit_clinic_patient(uuid,uuid,uuid,text),public.discharge_clinic_patient(uuid,uuid,uuid),public.clinic_operations_report() from authenticated;

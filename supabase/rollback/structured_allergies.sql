-- Revert the allergy frontend first. Preserve clinical revisions and their audits.
begin;
revoke execute on function public.save_patient_allergy_review(uuid,uuid,text,jsonb,text,uuid) from authenticated;
revoke insert on public.patient_allergy_reviews from authenticated;
commit;

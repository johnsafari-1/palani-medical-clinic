-- Revert the Doctor frontend first. Retain saved referrals, links, request identities,
-- author/time guards, RLS, unique indexes and audit coverage. This is not a backup.
revoke execute on function public.save_outgoing_referral(uuid,uuid,uuid,text,text,text,text,text) from authenticated;

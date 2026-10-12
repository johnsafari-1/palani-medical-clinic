-- Revert Reception frontend first. Preserve all records, request IDs, direction checks,
-- author/time guards, RLS, unique indexes and outgoing RPC. Not a backup.
revoke execute on function public.save_incoming_referral(uuid,uuid,text,text,text,text,text) from authenticated;

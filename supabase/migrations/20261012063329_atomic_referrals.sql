-- Additive: keep historical referrals without inventing request/visit links.
alter table public.referrals
  add column visit_id uuid references public.visits(id),
  add column request_id uuid,
  add column request_hash text;
create unique index referrals_request_id_key on public.referrals(request_id) where request_id is not null;
create unique index referrals_visit_id_key on public.referrals(visit_id) where visit_id is not null;
alter table public.referrals add constraint referrals_request_link_check check (
  (request_id is null and request_hash is null and visit_id is null)
  or (direction = 'Outgoing' and request_id is not null and request_hash is not null)
);

create function private.referral_fingerprint(p_patient uuid, p_visit uuid, p_facility text, p_doctor text, p_reason text, p_urgency text, p_notes text)
returns text language sql immutable security invoker set search_path = '' as $$
  select md5(jsonb_build_object('patient',p_patient,'visit',p_visit,'facility',btrim(p_facility),
    'doctor',btrim(coalesce(p_doctor,'')),'reason',btrim(p_reason),'urgency',p_urgency,'notes',btrim(coalesce(p_notes,'')))::text)
$$;
revoke all on function private.referral_fingerprint(uuid,uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function private.referral_fingerprint(uuid,uuid,text,text,text,text,text) to authenticated;

create function private.guard_referral_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text := private.active_staff_role();
  linked_visit public.visits%rowtype;
begin
  -- Trusted database owners/service roles retain maintenance authority.
  if current_user not in ('authenticated','anon') then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;
  if TG_OP <> 'INSERT' then
    raise exception 'Saved referrals require a separate attributed correction workflow.' using errcode='42501';
  end if;
  if actor is null or actor_role is null
    or NEW.direction not in ('Incoming','Outgoing')
    or (NEW.direction='Outgoing' and actor_role not in ('Doctor','Admin'))
    or (NEW.direction='Incoming' and actor_role not in ('Receptionist','Admin')) then
    raise exception 'An active authorized referral recorder is required.' using errcode='42501';
  end if;
  if NEW.patient_id is null or nullif(btrim(NEW.facility_name),'') is null or length(NEW.facility_name)>500
    or nullif(btrim(NEW.reason),'') is null or length(NEW.reason)>10000
    or length(coalesce(NEW.referring_doctor,''))>500 or length(coalesce(NEW.notes,''))>50000
    or NEW.urgency is null or NEW.urgency not in ('Routine','Urgent','Emergency')
    or (NEW.direction='Incoming' and (NEW.visit_id is not null or NEW.request_id is not null))
    or (NEW.visit_id is not null and NEW.request_id is null) then
    raise exception 'Invalid referral fields or visit/request links.' using errcode='22023';
  end if;
  NEW.facility_name := btrim(NEW.facility_name);
  NEW.referring_doctor := btrim(coalesce(NEW.referring_doctor,''));
  NEW.reason := btrim(NEW.reason);
  NEW.notes := btrim(coalesce(NEW.notes,''));
  NEW.created_by := actor;
  NEW.created_at := statement_timestamp();
  NEW.request_hash := null;
  if NEW.request_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('clinic-referral:'||NEW.request_id::text,0));
    if exists(select 1 from public.referrals where request_id=NEW.request_id) then
      raise exception 'Request ID already saved; retry using the referral RPC.' using errcode='22023';
    end if;
    NEW.request_hash := private.referral_fingerprint(NEW.patient_id,NEW.visit_id,NEW.facility_name,NEW.referring_doctor,NEW.reason,NEW.urgency,NEW.notes);
  end if;
  if NEW.visit_id is not null then
    select * into linked_visit from public.visits where id=NEW.visit_id for update;
    if linked_visit.id is null or linked_visit.patient_id<>NEW.patient_id or linked_visit.status not in ('Waiting','In Consultation') then
      raise exception 'Selected visit is missing, completed, or belongs to another patient.' using errcode='22023';
    end if;
    update public.visits set status='Completed',completed_at=statement_timestamp()
      where id=NEW.visit_id and patient_id=NEW.patient_id and status in ('Waiting','In Consultation');
    if not found then raise exception 'Visit completion was denied.' using errcode='42501'; end if;
  end if;
  return NEW;
end;
$$;
revoke all on function private.guard_referral_write() from public, anon, authenticated;
create trigger guard_referral_write before insert or update or delete on public.referrals
  for each row execute function private.guard_referral_write();
revoke update,delete,truncate on public.referrals from public,anon,authenticated;

create function public.save_outgoing_referral(
  p_patient_id uuid, p_visit_id uuid, p_request_id uuid, p_facility_name text,
  p_referring_doctor text, p_reason text, p_urgency text, p_notes text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text := private.active_staff_role();
  saved public.referrals%rowtype;
  fingerprint text;
begin
  if actor is null or actor_role is null or actor_role not in ('Doctor','Admin') then
    raise exception 'An active Doctor or Admin is required.' using errcode='42501';
  end if;
  if p_patient_id is null or p_request_id is null then
    raise exception 'Patient and request ID are required.' using errcode='22023';
  end if;
  fingerprint := private.referral_fingerprint(p_patient_id,p_visit_id,p_facility_name,p_referring_doctor,p_reason,p_urgency,p_notes);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('clinic-referral:'||p_request_id::text,0));
  select * into saved from public.referrals where request_id=p_request_id;
  if saved.id is not null then
    if saved.created_by<>actor or saved.request_hash is distinct from fingerprint then
      raise exception 'This request ID belongs to a different referral submission.' using errcode='22023';
    end if;
  else
    -- BEFORE guard completes the visit; referral insertion + both audit writes share this transaction.
    insert into public.referrals(patient_id,direction,facility_name,referring_doctor,reason,urgency,notes,visit_id,request_id)
    values(p_patient_id,'Outgoing',p_facility_name,p_referring_doctor,p_reason,p_urgency,p_notes,p_visit_id,p_request_id)
    returning * into saved;
  end if;
  return to_jsonb(saved)-'request_hash';
end;
$$;
revoke all on function public.save_outgoing_referral(uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_outgoing_referral(uuid,uuid,uuid,text,text,text,text,text) to authenticated;

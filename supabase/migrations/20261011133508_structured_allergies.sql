-- Append-only assessment snapshots. No historical patient is marked allergy-free.
create table public.patient_allergy_reviews (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id),
  revision integer not null check (revision > 0),
  previous_id uuid references public.patient_allergy_reviews(id),
  assessment text not null check (assessment in ('unknown','no_known','known')),
  allergies jsonb not null,
  change_reason text not null,
  recorded_by uuid not null references public.staff(id),
  recorded_at timestamptz not null,
  request_id uuid not null unique,
  request_hash text not null,
  unique(patient_id, revision)
);
create index allergy_reviews_previous_idx on public.patient_allergy_reviews(previous_id) where previous_id is not null;
create index allergy_reviews_recorder_idx on public.patient_allergy_reviews(recorded_by);
alter table public.patient_allergy_reviews enable row level security;
revoke all on public.patient_allergy_reviews from public, anon, authenticated;
grant select, insert on public.patient_allergy_reviews to authenticated;
create policy allergy_reviews_read on public.patient_allergy_reviews for select to authenticated
  using ((select private.active_staff_role()) in ('Doctor','Nurse','Pharmacist','Admin'));
create policy allergy_reviews_write on public.patient_allergy_reviews for insert to authenticated
  with check ((select private.active_staff_role()) in ('Doctor','Admin') and recorded_by=(select auth.uid()));

create function private.validate_allergy_review(p_assessment text, p_allergies jsonb)
returns void language plpgsql security invoker set search_path=''
as $$
declare item jsonb; field text; substantive integer:=0;
begin
  if p_assessment is null or p_assessment not in ('unknown','no_known','known')
     or jsonb_typeof(p_allergies) is distinct from 'array' then
    raise exception 'Choose an allergy assessment and provide a structured list.' using errcode='22023';
  end if;
  if jsonb_array_length(p_allergies)>50 or octet_length(p_allergies::text)>100000 then
    raise exception 'Allergy review exceeds storage limits.' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_allergies) loop
    if jsonb_typeof(item) is distinct from 'object' or
       (select count(*) from jsonb_object_keys(item))<>10 or
       not (item ?& array['id','substance','reaction','severity','criticality','category','type','clinical_status','verification_status','note']) then
      raise exception 'Invalid allergy fields.' using errcode='22023';
    end if;
    foreach field in array array['id','substance','reaction','severity','criticality','category','type','verification_status','note'] loop
      if jsonb_typeof(item->field) is distinct from 'string' or item->>field<>btrim(item->>field) then
        raise exception 'Allergy fields must contain trimmed text.' using errcode='22023';
      end if;
    end loop;
    if (item->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or length(item->>'substance') not between 1 and 200
       or length(item->>'reaction')>500 or length(item->>'note')>1000
       or item->>'severity' not in ('','mild','moderate','severe')
       or item->>'criticality' not in ('low','high','unable-to-assess')
       or item->>'category' not in ('','food','medication','environment','biologic')
       or item->>'type' not in ('','allergy','intolerance')
       or item->>'verification_status' not in ('unconfirmed','confirmed','refuted','entered-in-error')
       or (item->>'reaction'='' and item->>'severity'<>'') then
      raise exception 'Invalid substance, reaction or allergy classification.' using errcode='22023';
    end if;
    if item->>'verification_status'='entered-in-error' then
      if jsonb_typeof(item->'clinical_status') is distinct from 'null' then
        raise exception 'Entered-in-error records must have no clinical status.' using errcode='22023';
      end if;
    elsif jsonb_typeof(item->'clinical_status') is distinct from 'string'
          or item->>'clinical_status' not in ('active','inactive','resolved') then
      raise exception 'A clinical status is required.' using errcode='22023';
    end if;
    if item->>'verification_status' not in ('refuted','entered-in-error') then substantive:=substantive+1; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_allergies))<>jsonb_array_length(p_allergies) then
    raise exception 'Allergy record IDs must be distinct.' using errcode='22023';
  end if;
  if (p_assessment='known' and substantive=0) or (p_assessment<>'known' and substantive>0) then
    raise exception 'Assessment conflicts with the recorded allergy list.' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.validate_allergy_review(text,jsonb) from public,anon,authenticated;
grant execute on function private.validate_allergy_review(text,jsonb) to authenticated;

create function private.guard_allergy_review()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare latest public.patient_allergy_reviews%rowtype;
begin
  if current_user not in ('authenticated','anon') then
    if TG_OP='DELETE' then return OLD; end if;
    return NEW;
  end if;
  if TG_OP<>'INSERT' then raise exception 'Allergy corrections require a new attributed revision.' using errcode='42501'; end if;
  if private.active_staff_role() is null or private.active_staff_role() not in ('Doctor','Admin') then
    raise exception 'An active Doctor or Admin is required.' using errcode='42501';
  end if;
  if NEW.patient_id is null or NEW.request_id is null then raise exception 'Patient and request ID are required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('allergy-request:'||NEW.request_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('allergy-patient:'||NEW.patient_id::text,0));
  select * into latest from public.patient_allergy_reviews where patient_id=NEW.patient_id order by revision desc limit 1;
  if NEW.previous_id is distinct from latest.id then
    raise exception 'Allergy review changed. Refresh and reconcile before saving.' using errcode='40001';
  end if;
  perform private.validate_allergy_review(NEW.assessment, NEW.allergies);
  NEW.change_reason:=btrim(coalesce(NEW.change_reason,''));
  if length(NEW.change_reason) not between 1 and 1000 then raise exception 'A review or correction reason is required.' using errcode='22023'; end if;
  if latest.id is not null and exists (
    select 1 from jsonb_array_elements(latest.allergies) prior where not exists (
      select 1 from jsonb_array_elements(NEW.allergies) next where next->>'id'=prior->>'id')) then
    raise exception 'Preserve existing allergy IDs; mark incorrect records refuted or entered-in-error.' using errcode='22023';
  end if;
  NEW.revision:=coalesce(latest.revision,0)+1;
  NEW.recorded_by:=auth.uid(); NEW.recorded_at:=statement_timestamp();
  NEW.request_hash:=md5(jsonb_build_object('patient',NEW.patient_id,'previous',NEW.previous_id,
    'assessment',NEW.assessment,'allergies',NEW.allergies,'reason',NEW.change_reason)::text);
  return NEW;
end;
$$;
revoke all on function private.guard_allergy_review() from public,anon,authenticated;
create trigger guard_allergy_review before insert or update or delete on public.patient_allergy_reviews
  for each row execute function private.guard_allergy_review();
create trigger audit_patient_allergy_reviews after insert or update or delete on public.patient_allergy_reviews
  for each row execute function private.write_clinical_audit();

create function public.save_patient_allergy_review(p_patient_id uuid,p_previous_id uuid,p_assessment text,
  p_allergies jsonb,p_change_reason text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare saved public.patient_allergy_reviews%rowtype; fingerprint text;
begin
  if private.active_staff_role() is null or private.active_staff_role() not in ('Doctor','Admin') then
    raise exception 'An active Doctor or Admin is required.' using errcode='42501';
  end if;
  if p_patient_id is null or p_request_id is null then raise exception 'Patient and request ID are required.' using errcode='22023'; end if;
  perform private.validate_allergy_review(p_assessment,p_allergies);
  fingerprint:=md5(jsonb_build_object('patient',p_patient_id,'previous',p_previous_id,
    'assessment',p_assessment,'allergies',p_allergies,'reason',btrim(coalesce(p_change_reason,'')))::text);
  perform pg_advisory_xact_lock(hashtextextended('allergy-request:'||p_request_id::text,0));
  select * into saved from public.patient_allergy_reviews where request_id=p_request_id;
  if saved.id is not null then
    if saved.recorded_by is distinct from auth.uid() or saved.request_hash is distinct from fingerprint then
      raise exception 'This request ID belongs to a different allergy review or recorder.' using errcode='22023';
    end if;
    return to_jsonb(saved);
  end if;
  insert into public.patient_allergy_reviews(patient_id,previous_id,assessment,allergies,change_reason,request_id)
  values(p_patient_id,p_previous_id,p_assessment,p_allergies,p_change_reason,p_request_id) returning * into saved;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_patient_allergy_review(uuid,uuid,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.save_patient_allergy_review(uuid,uuid,text,jsonb,text,uuid) to authenticated;

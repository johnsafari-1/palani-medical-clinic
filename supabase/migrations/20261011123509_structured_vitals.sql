-- Historical rows are retained without inferred measurement times or BP components.
alter table public.vitals add column if not exists bp_systolic numeric;
alter table public.vitals add column if not exists bp_diastolic numeric;
alter table public.vitals add column if not exists measured_at timestamptz;
alter table public.vitals add column if not exists request_id uuid;
alter table public.vitals add column if not exists request_hash text;
create unique index if not exists vitals_request_id_key on public.vitals(request_id) where request_id is not null;

create or replace function private.guard_vitals_write()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare pair text[]; value numeric;
begin
  if current_user not in ('authenticated','anon') then
    if TG_OP='DELETE' then return OLD; end if;
    return NEW;
  end if;
  if private.active_staff_role() is null or private.active_staff_role() not in ('Nurse','Admin') then
    raise exception 'An active Nurse or Admin is required.' using errcode='42501';
  end if;
  if TG_OP<>'INSERT' then raise exception 'Saved readings need a separate attributed correction workflow.' using errcode='42501'; end if;
  NEW.bp:=nullif(btrim(NEW.bp),'');
  if NEW.bp is not null then
    pair:=regexp_match(NEW.bp,'^([0-9]+(?:\.[0-9]{1,3})?)[[:space:]]*/[[:space:]]*([0-9]+(?:\.[0-9]{1,3})?)$');
    if pair is null then raise exception 'Blood pressure must contain systolic/diastolic numbers.' using errcode='22023'; end if;
    if (NEW.bp_systolic is not null and NEW.bp_systolic<>(pair[1])::numeric) or
       (NEW.bp_diastolic is not null and NEW.bp_diastolic<>(pair[2])::numeric) then
      raise exception 'Blood pressure text and components disagree.' using errcode='22023';
    end if;
    NEW.bp_systolic:=(pair[1])::numeric; NEW.bp_diastolic:=(pair[2])::numeric;
  end if;
  if (NEW.bp_systolic is null) <> (NEW.bp_diastolic is null) then
    raise exception 'Both blood pressure components are required.' using errcode='22023';
  end if;
  foreach value in array array[NEW.bp_systolic,NEW.bp_diastolic,NEW.temperature,NEW.pulse,NEW.weight] loop
    if value is not null and (value::text in ('NaN','Infinity','-Infinity') or abs(value)>1000000 or value<>round(value,3)) then
      raise exception 'Readings must be finite numbers, at most three decimal places, within storage limits.' using errcode='22023';
    end if;
  end loop;
  if NEW.bp_systolic<0 or NEW.bp_diastolic<0 or NEW.pulse<0 or NEW.weight<=0 then
    raise exception 'Pressure/pulse must be nonnegative and weight positive.' using errcode='22023';
  end if;
  if coalesce(NEW.bp_systolic,NEW.temperature,NEW.pulse,NEW.weight) is null then
    raise exception 'Enter at least one reading.' using errcode='22023';
  end if;
  if NEW.measured_at is not null and not isfinite(NEW.measured_at) then raise exception 'Invalid measured time.' using errcode='22023'; end if;
  if NEW.request_id is not null and NEW.measured_at is null then raise exception 'A measured time is required for an identified submission.' using errcode='22023'; end if;
  if NEW.bp_systolic is not null then NEW.bp:=NEW.bp_systolic::text||'/'||NEW.bp_diastolic::text; end if;
  NEW.recorded_by:=auth.uid(); NEW.recorded_at:=statement_timestamp();
  NEW.request_hash:=case when NEW.request_id is null then null else md5(jsonb_build_object(
    'patient',NEW.patient_id,'systolic',NEW.bp_systolic,'diastolic',NEW.bp_diastolic,
    'temperature',NEW.temperature,'pulse',NEW.pulse,'weight',NEW.weight,'measured',NEW.measured_at)::text) end;
  return NEW;
end;
$$;
revoke all on function private.guard_vitals_write() from public,anon,authenticated;
drop trigger if exists guard_vitals_write on public.vitals;
create trigger guard_vitals_write before insert or update or delete on public.vitals
for each row execute function private.guard_vitals_write();

create or replace function public.save_patient_vitals(p_patient_id uuid,p_systolic numeric,p_diastolic numeric,
  p_temperature numeric,p_pulse numeric,p_weight numeric,p_measured_at timestamptz,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare saved public.vitals%rowtype; fingerprint text;
begin
  if private.active_staff_role() is null or private.active_staff_role() not in ('Nurse','Admin') then
    raise exception 'An active Nurse or Admin is required.' using errcode='42501';
  end if;
  if p_patient_id is null or p_request_id is null or p_measured_at is null or not isfinite(p_measured_at) then
    raise exception 'Patient, request ID and measured time are required.' using errcode='22023';
  end if;
  if p_pulse is not null and (p_pulse::text in ('NaN','Infinity','-Infinity') or p_pulse<>trunc(p_pulse) or p_pulse<0 or p_pulse>1000000) then
    raise exception 'Pulse must be a nonnegative whole number within storage limits.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vitals-request:'||p_request_id::text,0));
  fingerprint:=md5(jsonb_build_object('patient',p_patient_id,'systolic',p_systolic,'diastolic',p_diastolic,
    'temperature',p_temperature,'pulse',p_pulse::integer,'weight',p_weight,'measured',p_measured_at)::text);
  select * into saved from public.vitals where request_id=p_request_id;
  if saved.id is not null then
    if saved.recorded_by is distinct from auth.uid() or saved.request_hash is distinct from fingerprint then
      raise exception 'This request ID belongs to different readings or another recorder.' using errcode='22023';
    end if;
    return to_jsonb(saved);
  end if;
  insert into public.vitals(patient_id,bp_systolic,bp_diastolic,temperature,pulse,weight,measured_at,request_id,recorded_by)
  values(p_patient_id,p_systolic,p_diastolic,p_temperature,p_pulse::integer,p_weight,p_measured_at,p_request_id,auth.uid()) returning * into saved;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_patient_vitals(uuid,numeric,numeric,numeric,numeric,numeric,timestamptz,uuid) from public,anon;
grant execute on function public.save_patient_vitals(uuid,numeric,numeric,numeric,numeric,numeric,timestamptz,uuid) to authenticated;

-- Test-data release integrity. Historical identities/times are not backfilled.
alter table public.visits add column request_id uuid;
create unique index visits_request_id_key on public.visits(request_id) where request_id is not null;
create unique index visits_one_active_patient_key on public.visits(patient_id) where status in ('Waiting','In Consultation');
alter table public.admissions add column request_id uuid,
  add column visit_id uuid references public.visits(id),
  add column discharge_visit_id uuid references public.visits(id);
create unique index admissions_request_id_key on public.admissions(request_id) where request_id is not null;
create unique index admissions_one_active_patient_key on public.admissions(patient_id) where status='Admitted';
create index admissions_visit_id_idx on public.admissions(visit_id) where visit_id is not null;
create index admissions_discharge_visit_id_idx on public.admissions(discharge_visit_id) where discharge_visit_id is not null;

create function private.guard_visit_write() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); staff_role text:=private.active_staff_role();
begin
  if current_user not in ('authenticated','anon') then
    if TG_OP='DELETE' then return OLD; else return NEW; end if;
  end if;
  if actor is null or staff_role is null or TG_OP='DELETE' then
    raise exception 'An active authorized visit recorder is required.' using errcode='42501';
  end if;
  if TG_OP='INSERT' then
    if staff_role not in ('Receptionist','Admin') then raise exception 'Reception or Admin check-in required.' using errcode='42501';end if;
    if NEW.status is distinct from 'Waiting' or length(coalesce(NEW.reason,''))>10000 then raise exception 'Invalid check-in fields.' using errcode='22023';end if;
    NEW.reason:=btrim(coalesce(NEW.reason,''));NEW.checked_in_by:=actor;NEW.checked_in_at:=statement_timestamp();NEW.completed_at:=null;
  else
    if staff_role not in ('Doctor','Admin') then raise exception 'Doctor or Admin visit transition required.' using errcode='42501';end if;
    if (to_jsonb(NEW)-'status'-'completed_at') is distinct from (to_jsonb(OLD)-'status'-'completed_at') then
      raise exception 'Visit identity and check-in fields cannot be changed.' using errcode='42501';end if;
    if NEW.status is not distinct from OLD.status then
      NEW.completed_at:=OLD.completed_at;return NEW;
    end if;
    if OLD.status='Completed' or NEW.status not in ('In Consultation','Completed')
      or (OLD.status='In Consultation' and NEW.status<>'Completed') then
      raise exception 'Invalid or terminal visit transition.' using errcode='22023';end if;
    NEW.completed_at:=case when NEW.status='Completed' then statement_timestamp() else null end;
  end if;
  return NEW;
end;
$$;
revoke all on function private.guard_visit_write() from public,anon,authenticated;
create trigger guard_visit_write before insert or update or delete on public.visits for each row execute function private.guard_visit_write();
revoke delete,truncate on public.visits from public,anon,authenticated;

create function public.check_in_patient(p_patient_id uuid,p_request_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.visits%rowtype;
begin
  if coalesce(private.active_staff_role(),'') not in ('Receptionist','Admin') then raise exception 'Active Reception or Admin required.' using errcode='42501';end if;
  if p_patient_id is null or p_request_id is null or length(coalesce(p_reason,''))>10000 then raise exception 'Invalid check-in request.' using errcode='22023';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('clinic-checkin:'||p_request_id::text,0));
  select * into saved from public.visits where request_id=p_request_id;
  if saved.id is null then
    insert into public.visits(patient_id,request_id,reason) values(p_patient_id,p_request_id,btrim(coalesce(p_reason,''))) returning * into saved;
  elsif saved.patient_id is distinct from p_patient_id or saved.checked_in_by is distinct from auth.uid() or saved.reason is distinct from btrim(coalesce(p_reason,'')) then
    raise exception 'Request ID belongs to a different check-in.' using errcode='22023';
  end if;
  return to_jsonb(saved);
end;
$$;
create function public.start_clinic_visit(p_patient_id uuid,p_visit_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.visits%rowtype;
begin
  if coalesce(private.active_staff_role(),'') not in ('Doctor','Admin') then raise exception 'Active Doctor or Admin required.' using errcode='42501';end if;
  select * into saved from public.visits where id=p_visit_id for update;
  if saved.id is null or saved.patient_id is distinct from p_patient_id or saved.status='Completed' then raise exception 'Visit is unavailable or completed.' using errcode='40001';end if;
  if saved.status='Waiting' then update public.visits set status='In Consultation' where id=p_visit_id returning * into saved;end if;
  return to_jsonb(saved);
end;
$$;

create function private.guard_admission_write() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); linked public.visits%rowtype;
begin
  if current_user not in ('authenticated','anon') then
    if TG_OP='DELETE' then return OLD; else return NEW; end if;
  end if;
  if coalesce(private.active_staff_role(),'') not in ('Doctor','Admin') or TG_OP='DELETE' then raise exception 'Active Doctor or Admin admission recorder required.' using errcode='42501';end if;
  if TG_OP='INSERT' then
    if NEW.status is distinct from 'Admitted' or NEW.discharge_visit_id is not null or length(coalesce(NEW.reason,''))>10000 then raise exception 'Invalid admission fields.' using errcode='22023';end if;
    NEW.admitted_by:=actor;NEW.admitted_at:=statement_timestamp();NEW.reason:=btrim(coalesce(NEW.reason,''));NEW.discharged_by:=null;NEW.discharged_at:=null;
    if NEW.visit_id is not null and not exists(select 1 from public.visits where id=NEW.visit_id and patient_id=NEW.patient_id) then raise exception 'Admission visit belongs to another patient or is missing.' using errcode='22023';end if;
  else
    if (to_jsonb(NEW)-'status'-'discharged_by'-'discharged_at'-'discharge_visit_id') is distinct from (to_jsonb(OLD)-'status'-'discharged_by'-'discharged_at'-'discharge_visit_id') then
      raise exception 'Admission identity and original fields cannot change.' using errcode='42501';end if;
    if NEW.status is not distinct from OLD.status then
      if NEW.discharge_visit_id is distinct from OLD.discharge_visit_id then raise exception 'Discharge visit cannot change.' using errcode='42501';end if;
      NEW.discharged_by:=OLD.discharged_by;NEW.discharged_at:=OLD.discharged_at;return NEW;
    end if;
    if OLD.status<>'Admitted' or NEW.status is distinct from 'Discharged' then raise exception 'Invalid or terminal admission transition.' using errcode='22023';end if;
    NEW.discharged_by:=actor;NEW.discharged_at:=statement_timestamp();
    if NEW.discharge_visit_id is not null then
      select * into linked from public.visits where id=NEW.discharge_visit_id for update;
      if linked.id is null or linked.patient_id<>NEW.patient_id or linked.status not in ('Waiting','In Consultation') then raise exception 'Discharge visit is unavailable, completed or belongs to another patient.' using errcode='22023';end if;
      update public.visits set status='Completed' where id=linked.id;
      if not found then raise exception 'Visit completion denied.' using errcode='42501';end if;
    end if;
  end if;
  return NEW;
end;
$$;
revoke all on function private.guard_admission_write() from public,anon,authenticated;
create trigger guard_admission_write before insert or update or delete on public.admissions for each row execute function private.guard_admission_write();
revoke delete,truncate on public.admissions from public,anon,authenticated;

create function public.admit_clinic_patient(p_patient_id uuid,p_visit_id uuid,p_request_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.admissions%rowtype;
begin
  if coalesce(private.active_staff_role(),'') not in ('Doctor','Admin') then raise exception 'Active Doctor or Admin required.' using errcode='42501';end if;
  if p_patient_id is null or p_request_id is null or length(coalesce(p_reason,''))>10000 then raise exception 'Invalid admission request.' using errcode='22023';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('clinic-admission:'||p_request_id::text,0));
  select * into saved from public.admissions where request_id=p_request_id;
  if saved.id is null then
    insert into public.admissions(patient_id,visit_id,request_id,reason) values(p_patient_id,p_visit_id,p_request_id,btrim(coalesce(p_reason,''))) returning * into saved;
  elsif saved.patient_id is distinct from p_patient_id or saved.visit_id is distinct from p_visit_id or saved.admitted_by is distinct from auth.uid() or saved.reason is distinct from btrim(coalesce(p_reason,'')) then
    raise exception 'Request ID belongs to a different admission.' using errcode='22023';
  end if;
  return to_jsonb(saved);
end;
$$;
create function public.discharge_clinic_patient(p_patient_id uuid,p_admission_id uuid,p_visit_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.admissions%rowtype;
begin
  if coalesce(private.active_staff_role(),'') not in ('Doctor','Admin') then raise exception 'Active Doctor or Admin required.' using errcode='42501';end if;
  select * into saved from public.admissions where id=p_admission_id for update;
  if saved.id is null or saved.patient_id is distinct from p_patient_id then raise exception 'Admission unavailable or belongs to another patient.' using errcode='22023';end if;
  if saved.status='Discharged' then
    if saved.discharged_by is distinct from auth.uid() or saved.discharge_visit_id is distinct from p_visit_id then raise exception 'Admission was already discharged with different details.' using errcode='40001';end if;
  else
    update public.admissions set status='Discharged',discharge_visit_id=p_visit_id where id=p_admission_id returning * into saved;
  end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.check_in_patient(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.start_clinic_visit(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admit_clinic_patient(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.discharge_clinic_patient(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.check_in_patient(uuid,uuid,text),public.start_clinic_visit(uuid,uuid),public.admit_clinic_patient(uuid,uuid,uuid,text),public.discharge_clinic_patient(uuid,uuid,uuid) to authenticated;

-- Admin report is one database snapshot, independent of Data API row limits.
create function public.clinic_operations_report() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare snapshot_at timestamptz:=statement_timestamp(); since_at timestamptz:=snapshot_at-interval '7 days'; result jsonb;
begin
  if coalesce(private.active_staff_role(),'')<>'Admin' then raise exception 'An active Admin is required for operations reports.' using errcode='42501';end if;
  select jsonb_build_object('schema_version',1,'read_at',snapshot_at,'period_start',since_at,
    'totalPatients',(select count(*) from public.patients),
    'newPatients',(select count(*) from public.patients where registered_at>=since_at and registered_at<=snapshot_at),
    'admittedNow',(select count(*) from public.admissions where status='Admitted'),
    'consultsThisWeek',(select count(*) from public.consultations where created_at>=since_at and created_at<=snapshot_at),
    'totalRevenue',coalesce(round(sum(total) filter(where status='Paid'),2),0)::text,
    'revenueThisWeek',coalesce(round(sum(total) filter(where status='Paid' and paid_at>=since_at and paid_at<=snapshot_at),2),0)::text,
    'outstanding',coalesce(round(sum(total) filter(where status='Unpaid'),2),0)::text,
    'outstandingCount',count(*) filter(where status='Unpaid'),
    'paidWithoutTimestamp',count(*) filter(where status='Paid' and paid_at is null))
  into result from public.invoices;
  return result;
end;
$$;
revoke all on function public.clinic_operations_report() from public,anon,authenticated;
grant execute on function public.clinic_operations_report() to authenticated;

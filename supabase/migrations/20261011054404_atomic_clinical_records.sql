-- Additive migration for the existing clinic schema; historical rows are retained.
alter table public.consultations
  add column if not exists visit_id uuid references public.visits(id),
  add column if not exists request_id uuid,
  add column if not exists request_hash text;
create unique index if not exists consultations_request_id_key on public.consultations(request_id);
create unique index if not exists consultations_visit_id_key on public.consultations(visit_id);

create or replace function public.save_clinical_consultation(
  p_patient_id uuid,
  p_visit_id uuid,
  p_request_id uuid,
  p_diagnosis text,
  p_notes text,
  p_prescriptions jsonb,
  p_lab_tests jsonb
)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role text := private.active_staff_role();
  saved public.consultations%rowtype;
  visit public.visits%rowtype;
  item jsonb;
  fingerprint text;
begin
  if actor is null or actor_role is null or actor_role not in ('Doctor', 'Admin') then
    raise exception 'An active Doctor or Admin is required.' using errcode = '42501';
  end if;
  if p_patient_id is null or p_request_id is null or nullif(btrim(p_diagnosis), '') is null
     or length(p_diagnosis) > 10000 or length(coalesce(p_notes, '')) > 50000 then
    raise exception 'Patient, request ID and diagnosis are required; text limits exceeded.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_prescriptions) is distinct from 'array'
     or jsonb_typeof(p_lab_tests) is distinct from 'array' then
    raise exception 'Prescriptions and lab tests must be arrays.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_prescriptions) > 100 or jsonb_array_length(p_lab_tests) > 100 then
    raise exception 'Too many orders in one consultation.' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_prescriptions) loop
    if jsonb_typeof(item) is distinct from 'object'
       or jsonb_typeof(item->'drug') is distinct from 'string'
       or nullif(btrim(item->>'drug'), '') is null
       or length(item->>'drug') > 1000
       or (item ? 'dosage' and jsonb_typeof(item->'dosage') is distinct from 'string')
       or (item ? 'instructions' and jsonb_typeof(item->'instructions') is distinct from 'string')
       or length(coalesce(item->>'dosage', '')) > 2000
       or length(coalesce(item->>'instructions', '')) > 5000 then
      raise exception 'Invalid prescription: a drug name and text dosage/instructions are required.' using errcode = '22023';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_lab_tests) loop
    if jsonb_typeof(item) is distinct from 'string'
       or nullif(btrim(item #>> '{}'), '') is null or length(item #>> '{}') > 1000 then
      raise exception 'Every lab test must have a text name.' using errcode = '22023';
    end if;
  end loop;
  -- This is a retry fingerprint, not encryption or a security credential.
  fingerprint := md5(jsonb_build_object('patient', p_patient_id, 'visit', p_visit_id,
    'diagnosis', btrim(p_diagnosis), 'notes', coalesce(p_notes, ''),
    'prescriptions', p_prescriptions, 'labs', p_lab_tests)::text);

  select * into saved from public.consultations where request_id = p_request_id;
  if saved.id is null and p_visit_id is not null then
    -- Serialize competing saves of the same queue visit, including a retry
    -- whose first request was still in flight when its response was lost.
    select * into visit from public.visits where id = p_visit_id for update;
    select * into saved from public.consultations where request_id = p_request_id;
    if saved.id is null and (visit.id is null or visit.patient_id <> p_patient_id
       or visit.status not in ('Waiting', 'In Consultation')) then
      raise exception 'The selected visit is unavailable, completed, or belongs to another patient.' using errcode = '22023';
    end if;
  end if;
  if saved.id is null then
    insert into public.consultations(patient_id, doctor_id, diagnosis, notes, visit_id, request_id, request_hash)
    values (p_patient_id, actor, btrim(p_diagnosis), coalesce(p_notes, ''), p_visit_id, p_request_id, fingerprint)
    on conflict (request_id) do nothing
    returning * into saved;
    if saved.id is null then
      select * into saved from public.consultations where request_id = p_request_id;
    else
      insert into public.prescriptions(consultation_id, drug, dosage, instructions)
      select saved.id, btrim(value->>'drug'), coalesce(value->>'dosage', ''), coalesce(value->>'instructions', '')
      from jsonb_array_elements(p_prescriptions);
      insert into public.lab_orders(patient_id, consultation_id, test_name, ordered_by)
      select p_patient_id, saved.id, btrim(value #>> '{}'), actor from jsonb_array_elements(p_lab_tests);
      if p_visit_id is not null then
        update public.visits set status = 'Completed', completed_at = statement_timestamp()
        where id = p_visit_id and patient_id = p_patient_id and status in ('Waiting', 'In Consultation');
        if not found then
          raise exception 'The selected visit could not be completed.' using errcode = '42501';
        end if;
      end if;
    end if;
  end if;
  if saved.id is null or saved.doctor_id <> actor or saved.request_hash is distinct from fingerprint then
    raise exception 'This request ID belongs to a different consultation submission.' using errcode = '22023';
  end if;
  return jsonb_build_object('id', saved.id, 'code', saved.code);
end;
$$;
revoke all on function public.save_clinical_consultation(uuid, uuid, uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_clinical_consultation(uuid, uuid, uuid, text, text, jsonb, jsonb) to authenticated;

-- The only definer operation is appending to the protected audit table.
-- It is a private trigger function with no client execution grant.
create or replace function private.write_clinical_audit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.audit_log(staff_id, table_name, action, record_id, old_data, new_data)
  values(auth.uid(), TG_TABLE_NAME, TG_OP,
    (case when TG_OP = 'DELETE' then OLD.id else NEW.id end)::text,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end);
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function private.write_clinical_audit() from public, anon, authenticated;
revoke insert, update, delete, truncate on public.audit_log from public, anon, authenticated;

do $$
declare clinic_table text;
begin
  foreach clinic_table in array array['staff','patients','visits','consultations','prescriptions',
    'lab_orders','vitals','admissions','referrals','invoices','invoice_items','price_list'] loop
    -- TRUNCATE bypasses row policies and row audit triggers entirely.
    execute format('revoke truncate on public.%I from public, anon, authenticated', clinic_table);
    execute format('drop trigger if exists %I on public.%I', 'audit_' || clinic_table, clinic_table);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.write_clinical_audit()',
      'audit_' || clinic_table, clinic_table);
  end loop;
end;
$$;

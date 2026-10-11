-- Schema-only catalog snapshot on 2026-10-11, BEFORE atomic_clinical_records.
-- Test fixture only: mock Auth, no patient rows, not a production restore or migration.
create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, aud text, role text, email text, created_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
create sequence public.patient_code_seq;
create sequence public.consultation_code_seq;
create sequence public.lab_code_seq;
create sequence public.vitals_code_seq;
create sequence public.invoice_code_seq;
create sequence public.price_code_seq;
create sequence public.admission_code_seq;
create sequence public.referral_code_seq;
create table public.admissions (id uuid not null default gen_random_uuid(), code text not null default ('AD-'::text || lpad((nextval('admission_code_seq'::regclass))::text, 4, '0'::text)), patient_id uuid not null, admitted_by uuid, admitted_at timestamp with time zone not null default now(), reason text, discharged_by uuid, discharged_at timestamp with time zone, status text not null default 'Admitted'::text);
create table public.audit_log (id uuid not null default gen_random_uuid(), staff_id uuid, table_name text not null, action text not null, record_id text, old_data jsonb, new_data jsonb, created_at timestamp with time zone not null default now());
create table public.consultations (id uuid not null default gen_random_uuid(), code text not null default ('CN-'::text || lpad((nextval('consultation_code_seq'::regclass))::text, 4, '0'::text)), patient_id uuid not null, doctor_id uuid not null, diagnosis text not null, notes text, status text not null default 'Open'::text, created_at timestamp with time zone not null default now());
create table public.invoice_items (id uuid not null default gen_random_uuid(), invoice_id uuid not null, label text not null, amount numeric not null default 0, quantity numeric not null default 1, unit_price numeric, prescription_id uuid, lab_order_id uuid);
create table public.invoices (id uuid not null default gen_random_uuid(), code text not null default ('IV-'::text || lpad((nextval('invoice_code_seq'::regclass))::text, 4, '0'::text)), patient_id uuid not null, consultation_id uuid, total numeric not null default 0, status text not null default 'Unpaid'::text, created_by uuid, created_at timestamp with time zone not null default now(), admission_id uuid, payment_method text, paid_at timestamp with time zone, sale_type text not null default 'Encounter'::text);
create table public.lab_orders (id uuid not null default gen_random_uuid(), code text not null default ('LB-'::text || lpad((nextval('lab_code_seq'::regclass))::text, 4, '0'::text)), patient_id uuid not null, consultation_id uuid, test_name text not null, ordered_by uuid not null, ordered_at timestamp with time zone not null default now(), status text not null default 'Pending'::text, result text, completed_by uuid, completed_at timestamp with time zone, billed boolean not null default false);
create table public.patients (id uuid not null default gen_random_uuid(), code text not null default ('PT-'::text || lpad((nextval('patient_code_seq'::regclass))::text, 4, '0'::text)), name text not null, dob date not null, gender text not null, phone text not null, address text, registered_by uuid, registered_at timestamp with time zone not null default now());
create table public.prescriptions (id uuid not null default gen_random_uuid(), consultation_id uuid not null, drug text not null, dosage text, instructions text, dispensed boolean not null default false, dispensed_by uuid, dispensed_at timestamp with time zone, billed boolean not null default false);
create table public.price_list (id uuid not null default gen_random_uuid(), code text not null default ('PRC-'::text || lpad((nextval('price_code_seq'::regclass))::text, 4, '0'::text)), name text not null, category text not null, unit text not null default 'item'::text, price numeric not null default 0, active boolean not null default true, created_at timestamp with time zone not null default now());
create table public.referrals (id uuid not null default gen_random_uuid(), code text not null default ('REF-'::text || lpad((nextval('referral_code_seq'::regclass))::text, 4, '0'::text)), patient_id uuid not null, direction text not null, facility_name text not null, referring_doctor text, reason text not null, urgency text not null default 'Routine'::text, notes text, created_by uuid, created_at timestamp with time zone not null default now());
create table public.staff (id uuid not null, name text not null, role text not null, created_at timestamp with time zone not null default now(), active boolean not null default true);
create table public.visits (id uuid not null default gen_random_uuid(), patient_id uuid not null, checked_in_by uuid, checked_in_at timestamp with time zone not null default now(), reason text, status text not null default 'Waiting'::text, completed_at timestamp with time zone);
create table public.vitals (id uuid not null default gen_random_uuid(), code text not null default ('VT-'::text || lpad((nextval('vitals_code_seq'::regclass))::text, 4, '0'::text)), patient_id uuid not null, bp text, temperature numeric, pulse integer, weight numeric, recorded_by uuid not null, recorded_at timestamp with time zone not null default now());
alter table public.staff add constraint staff_role_check CHECK ((role = ANY (ARRAY['Admin'::text, 'Receptionist'::text, 'Doctor'::text, 'Nurse'::text, 'Lab Technician'::text, 'Pharmacist'::text, 'Cashier'::text])));
alter table public.vitals add constraint vitals_pkey PRIMARY KEY (id);
alter table public.patients add constraint patients_code_key UNIQUE (code);
alter table public.patients add constraint patients_pkey PRIMARY KEY (id);
alter table public.invoices add constraint invoices_payment_method_check CHECK ((payment_method = ANY (ARRAY['Cash'::text, 'M-Pesa'::text, 'Card'::text, 'Other'::text])));
alter table public.prescriptions add constraint prescriptions_pkey PRIMARY KEY (id);
alter table public.price_list add constraint price_list_category_check CHECK ((category = ANY (ARRAY['Consultation'::text, 'Medication'::text, 'Lab Test'::text, 'Procedure'::text, 'Room'::text, 'Other'::text])));
alter table public.price_list add constraint price_list_code_key UNIQUE (code);
alter table public.price_list add constraint price_list_pkey PRIMARY KEY (id);
alter table public.invoices add constraint invoices_pkey PRIMARY KEY (id);
alter table public.admissions add constraint admissions_code_key UNIQUE (code);
alter table public.invoices add constraint invoices_sale_type_check CHECK ((sale_type = ANY (ARRAY['Encounter'::text, 'OTC'::text])));
alter table public.invoices add constraint invoices_status_check CHECK ((status = ANY (ARRAY['Unpaid'::text, 'Paid'::text])));
alter table public.admissions add constraint admissions_pkey PRIMARY KEY (id);
alter table public.admissions add constraint admissions_status_check CHECK ((status = ANY (ARRAY['Admitted'::text, 'Discharged'::text])));
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.staff add constraint staff_pkey PRIMARY KEY (id);
alter table public.lab_orders add constraint lab_orders_pkey PRIMARY KEY (id);
alter table public.invoice_items add constraint invoice_items_pkey PRIMARY KEY (id);
alter table public.visits add constraint visits_pkey PRIMARY KEY (id);
alter table public.visits add constraint visits_status_check CHECK ((status = ANY (ARRAY['Waiting'::text, 'In Consultation'::text, 'Completed'::text])));
alter table public.referrals add constraint referrals_code_key UNIQUE (code);
alter table public.lab_orders add constraint lab_orders_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Completed'::text])));
alter table public.referrals add constraint referrals_direction_check CHECK ((direction = ANY (ARRAY['Outgoing'::text, 'Incoming'::text])));
alter table public.consultations add constraint consultations_code_key UNIQUE (code);
alter table public.referrals add constraint referrals_pkey PRIMARY KEY (id);
alter table public.referrals add constraint referrals_urgency_check CHECK ((urgency = ANY (ARRAY['Routine'::text, 'Urgent'::text, 'Emergency'::text])));
alter table public.lab_orders add constraint lab_orders_code_key UNIQUE (code);
alter table public.invoices add constraint invoices_code_key UNIQUE (code);
alter table public.consultations add constraint consultations_pkey PRIMARY KEY (id);
alter table public.consultations add constraint consultations_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'Closed'::text])));
alter table public.vitals add constraint vitals_code_key UNIQUE (code);
alter table public.prescriptions add constraint prescriptions_dispensed_by_fkey FOREIGN KEY (dispensed_by) REFERENCES staff(id);
alter table public.patients add constraint patients_registered_by_fkey FOREIGN KEY (registered_by) REFERENCES staff(id);
alter table public.lab_orders add constraint lab_orders_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES staff(id);
alter table public.lab_orders add constraint lab_orders_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES consultations(id);
alter table public.lab_orders add constraint lab_orders_ordered_by_fkey FOREIGN KEY (ordered_by) REFERENCES staff(id);
alter table public.lab_orders add constraint lab_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
alter table public.invoices add constraint invoices_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES admissions(id);
alter table public.invoices add constraint invoices_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES consultations(id);
alter table public.invoices add constraint invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff(id);
alter table public.invoices add constraint invoices_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
alter table public.invoice_items add constraint invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
alter table public.invoice_items add constraint invoice_items_lab_order_id_fkey FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id);
alter table public.invoice_items add constraint invoice_items_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES prescriptions(id);
alter table public.consultations add constraint consultations_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES staff(id);
alter table public.consultations add constraint consultations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
alter table public.vitals add constraint vitals_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
alter table public.vitals add constraint vitals_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES staff(id);
alter table public.prescriptions add constraint prescriptions_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE;
alter table public.staff add constraint staff_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.admissions add constraint admissions_admitted_by_fkey FOREIGN KEY (admitted_by) REFERENCES staff(id);
alter table public.admissions add constraint admissions_discharged_by_fkey FOREIGN KEY (discharged_by) REFERENCES staff(id);
alter table public.admissions add constraint admissions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
alter table public.audit_log add constraint audit_log_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id);
alter table public.visits add constraint visits_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES staff(id);
alter table public.visits add constraint visits_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
alter table public.referrals add constraint referrals_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff(id);
alter table public.referrals add constraint referrals_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
create schema private; create function private.active_staff_role() returns text language sql stable security definer set search_path='' as $$ select role from public.staff where id=auth.uid() and active $$;
grant usage on schema private to authenticated; grant execute on function private.active_staff_role() to authenticated;
CREATE OR REPLACE FUNCTION public.current_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.active_staff_role() $function$;

CREATE OR REPLACE FUNCTION public.validate_billing_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.prescription_id is not null then
    if not exists (select 1 from prescriptions where id = NEW.prescription_id and billed = false) then
      raise exception 'This prescription has already been billed or does not exist.';
    end if;
    update prescriptions set billed = true where id = NEW.prescription_id;
  end if;

  if NEW.lab_order_id is not null then
    if not exists (select 1 from lab_orders where id = NEW.lab_order_id and billed = false) then
      raise exception 'This lab test has already been billed or does not exist.';
    end if;
    update lab_orders set billed = true where id = NEW.lab_order_id;
  end if;

  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into audit_log (staff_id, table_name, action, record_id, old_data, new_data)
  values (
    auth.uid(),
    TG_TABLE_NAME,
    TG_OP,
    coalesce(NEW.id, OLD.id)::text,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP = 'UPDATE' then to_jsonb(NEW) else null end
  );
  return coalesce(NEW, OLD);
end;
$function$;

alter table public.staff enable row level security;
alter table public.patients enable row level security;
alter table public.consultations enable row level security;
alter table public.prescriptions enable row level security;
alter table public.lab_orders enable row level security;
alter table public.vitals enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.price_list enable row level security;
alter table public.admissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.visits enable row level security;
alter table public.referrals enable row level security;
create policy "staff_delete_admin" on public."staff" as PERMISSIVE for DELETE to authenticated using ((current_staff_role() = 'Admin'::text)) ;
create policy "staff_insert_admin" on public."staff" as PERMISSIVE for INSERT to authenticated  with check ((current_staff_role() = 'Admin'::text));
create policy "staff_select_own_or_admin" on public."staff" as PERMISSIVE for SELECT to authenticated using (((id = ( SELECT auth.uid() AS uid)) OR (( SELECT private.active_staff_role() AS active_staff_role) = 'Admin'::text))) ;
create policy "staff_update_admin" on public."staff" as PERMISSIVE for UPDATE to authenticated using ((current_staff_role() = 'Admin'::text)) ;
create policy "active_staff_required" on public."patients" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "patients_insert_reception" on public."patients" as PERMISSIVE for INSERT to authenticated  with check ((current_staff_role() = ANY (ARRAY['Receptionist'::text, 'Admin'::text])));
create policy "patients_select_all" on public."patients" as PERMISSIVE for SELECT to authenticated using (true) ;
create policy "patients_update_reception" on public."patients" as PERMISSIVE for UPDATE to authenticated using ((current_staff_role() = ANY (ARRAY['Receptionist'::text, 'Admin'::text]))) ;
create policy "active_staff_required" on public."lab_orders" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "labs_insert_doctor" on public."lab_orders" as PERMISSIVE for INSERT to authenticated  with check ((current_staff_role() = ANY (ARRAY['Doctor'::text, 'Admin'::text])));
create policy "labs_select_all" on public."lab_orders" as PERMISSIVE for SELECT to authenticated using (true) ;
create policy "labs_update_labtech" on public."lab_orders" as PERMISSIVE for UPDATE to authenticated using ((current_staff_role() = ANY (ARRAY['Lab Technician'::text, 'Admin'::text]))) ;
create policy "active_staff_required" on public."invoices" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "invoices_insert_billing" on public."invoices" as PERMISSIVE for INSERT to authenticated  with check (((current_staff_role() = ANY (ARRAY['Cashier'::text, 'Admin'::text])) OR ((current_staff_role() = 'Pharmacist'::text) AND (sale_type = 'OTC'::text))));
create policy "invoices_select_billing_roles" on public."invoices" as PERMISSIVE for SELECT to authenticated using ((current_staff_role() = ANY (ARRAY['Admin'::text, 'Cashier'::text, 'Receptionist'::text]))) ;
create policy "invoices_update_billing" on public."invoices" as PERMISSIVE for UPDATE to authenticated using (((current_staff_role() = ANY (ARRAY['Cashier'::text, 'Admin'::text])) OR (current_staff_role() = 'Pharmacist'::text))) ;
create policy "active_staff_required" on public."invoice_items" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "invoice_items_insert_billing" on public."invoice_items" as PERMISSIVE for INSERT to authenticated  with check (((current_staff_role() = ANY (ARRAY['Cashier'::text, 'Admin'::text])) OR ((current_staff_role() = 'Pharmacist'::text) AND (EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND (i.sale_type = 'OTC'::text)))))));
create policy "invoice_items_select_billing_roles" on public."invoice_items" as PERMISSIVE for SELECT to authenticated using ((current_staff_role() = ANY (ARRAY['Admin'::text, 'Cashier'::text, 'Receptionist'::text]))) ;
create policy "active_staff_required" on public."consultations" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "consultations_insert_doctor" on public."consultations" as PERMISSIVE for INSERT to authenticated  with check ((current_staff_role() = ANY (ARRAY['Doctor'::text, 'Admin'::text])));
create policy "consultations_select_all" on public."consultations" as PERMISSIVE for SELECT to authenticated using (true) ;
create policy "active_staff_required" on public."vitals" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "vitals_insert_nurse" on public."vitals" as PERMISSIVE for INSERT to authenticated  with check ((current_staff_role() = ANY (ARRAY['Nurse'::text, 'Admin'::text])));
create policy "vitals_select_all" on public."vitals" as PERMISSIVE for SELECT to authenticated using (true) ;
create policy "active_staff_required" on public."prescriptions" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "prescriptions_insert_doctor" on public."prescriptions" as PERMISSIVE for INSERT to authenticated  with check ((current_staff_role() = ANY (ARRAY['Doctor'::text, 'Admin'::text])));
create policy "prescriptions_select_all" on public."prescriptions" as PERMISSIVE for SELECT to authenticated using (true) ;
create policy "prescriptions_update_pharmacist" on public."prescriptions" as PERMISSIVE for UPDATE to authenticated using ((current_staff_role() = ANY (ARRAY['Pharmacist'::text, 'Admin'::text]))) ;
create policy "active_staff_required" on public."price_list" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "price_list_delete_admin" on public."price_list" as PERMISSIVE for DELETE to authenticated using ((current_staff_role() = 'Admin'::text)) ;
create policy "price_list_insert_admin" on public."price_list" as PERMISSIVE for INSERT to authenticated  with check ((current_staff_role() = 'Admin'::text));
create policy "price_list_select_all" on public."price_list" as PERMISSIVE for SELECT to authenticated using (true) ;
create policy "price_list_update_admin" on public."price_list" as PERMISSIVE for UPDATE to authenticated using ((current_staff_role() = 'Admin'::text)) ;
create policy "active_staff_required" on public."admissions" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "admissions_insert_doctor" on public."admissions" as PERMISSIVE for INSERT to authenticated  with check ((current_staff_role() = ANY (ARRAY['Doctor'::text, 'Admin'::text])));
create policy "admissions_select_all" on public."admissions" as PERMISSIVE for SELECT to authenticated using (true) ;
create policy "admissions_update_doctor" on public."admissions" as PERMISSIVE for UPDATE to authenticated using ((current_staff_role() = ANY (ARRAY['Doctor'::text, 'Admin'::text]))) ;
create policy "active_staff_required" on public."audit_log" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "audit_log_select_admin" on public."audit_log" as PERMISSIVE for SELECT to authenticated using ((current_staff_role() = 'Admin'::text)) ;
create policy "active_staff_required" on public."visits" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "visits_insert_reception" on public."visits" as PERMISSIVE for INSERT to authenticated  with check ((current_staff_role() = ANY (ARRAY['Receptionist'::text, 'Admin'::text])));
create policy "visits_select_all" on public."visits" as PERMISSIVE for SELECT to authenticated using (true) ;
create policy "visits_update_clinical" on public."visits" as PERMISSIVE for UPDATE to authenticated using ((current_staff_role() = ANY (ARRAY['Doctor'::text, 'Nurse'::text, 'Admin'::text]))) ;
create policy "active_staff_required" on public."referrals" as RESTRICTIVE for ALL to authenticated using ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL)) with check ((( SELECT private.active_staff_role() AS active_staff_role) IS NOT NULL));
create policy "referrals_insert_incoming" on public."referrals" as PERMISSIVE for INSERT to authenticated  with check (((direction = 'Incoming'::text) AND (current_staff_role() = ANY (ARRAY['Receptionist'::text, 'Admin'::text]))));
create policy "referrals_insert_outgoing" on public."referrals" as PERMISSIVE for INSERT to authenticated  with check (((direction = 'Outgoing'::text) AND (current_staff_role() = ANY (ARRAY['Doctor'::text, 'Admin'::text]))));
create policy "referrals_select_all" on public."referrals" as PERMISSIVE for SELECT to authenticated using (true) ;
grant usage on schema public to anon, authenticated; grant all on all tables in schema public to anon, authenticated; grant usage on all sequences in schema public to anon, authenticated;
CREATE TRIGGER audit_patients AFTER DELETE OR UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION log_audit();
CREATE TRIGGER audit_consultations AFTER DELETE OR UPDATE ON public.consultations FOR EACH ROW EXECUTE FUNCTION log_audit();
CREATE TRIGGER audit_prescriptions AFTER DELETE OR UPDATE ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION log_audit();
CREATE TRIGGER audit_invoices AFTER DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION log_audit();
CREATE TRIGGER audit_admissions AFTER DELETE OR UPDATE ON public.admissions FOR EACH ROW EXECUTE FUNCTION log_audit();
CREATE TRIGGER audit_staff AFTER DELETE OR UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION log_audit();
CREATE TRIGGER audit_price_list AFTER DELETE OR UPDATE ON public.price_list FOR EACH ROW EXECUTE FUNCTION log_audit();
CREATE TRIGGER audit_visits AFTER DELETE OR UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION log_audit();
CREATE TRIGGER audit_referrals AFTER DELETE OR UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION log_audit();
CREATE TRIGGER guard_invoice_item_billing BEFORE INSERT ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION validate_billing_source();

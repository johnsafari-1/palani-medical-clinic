-- Palani Medical Clinic — database schema for Supabase
-- Paste this whole file into the Supabase SQL Editor and run it once.

create extension if not exists pgcrypto;

-- ============================================================
-- SEQUENCES for human-readable codes (PT-0001, CN-0001, etc.)
-- ============================================================
create sequence patient_code_seq;
create sequence consultation_code_seq;
create sequence lab_code_seq;
create sequence vitals_code_seq;
create sequence invoice_code_seq;

-- ============================================================
-- TABLES
-- ============================================================

-- Staff: one row per employee, linked to their Supabase Auth login
create table staff (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('Admin','Receptionist','Doctor','Nurse','Lab Technician','Pharmacist','Cashier')),
  created_at timestamptz not null default now()
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PT-' || lpad(nextval('patient_code_seq')::text, 4, '0')),
  name text not null,
  dob date not null,
  gender text not null,
  phone text not null,
  address text,
  registered_by uuid references staff(id),
  registered_at timestamptz not null default now()
);

create table consultations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('CN-' || lpad(nextval('consultation_code_seq')::text, 4, '0')),
  patient_id uuid not null references patients(id),
  doctor_id uuid not null references staff(id),
  diagnosis text not null,
  notes text,
  status text not null default 'Open' check (status in ('Open','Closed')),
  created_at timestamptz not null default now()
);

create table prescriptions (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references consultations(id) on delete cascade,
  drug text not null,
  dosage text,
  instructions text,
  dispensed boolean not null default false,
  dispensed_by uuid references staff(id),
  dispensed_at timestamptz
);

create table lab_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('LB-' || lpad(nextval('lab_code_seq')::text, 4, '0')),
  patient_id uuid not null references patients(id),
  consultation_id uuid references consultations(id),
  test_name text not null,
  ordered_by uuid not null references staff(id),
  ordered_at timestamptz not null default now(),
  status text not null default 'Pending' check (status in ('Pending','Completed')),
  result text,
  completed_by uuid references staff(id),
  completed_at timestamptz
);

create table vitals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('VT-' || lpad(nextval('vitals_code_seq')::text, 4, '0')),
  patient_id uuid not null references patients(id),
  bp text,
  temperature numeric,
  pulse integer,
  weight numeric,
  recorded_by uuid not null references staff(id),
  recorded_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('IV-' || lpad(nextval('invoice_code_seq')::text, 4, '0')),
  patient_id uuid not null references patients(id),
  consultation_id uuid references consultations(id),
  total numeric not null default 0,
  status text not null default 'Unpaid' check (status in ('Unpaid','Paid')),
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  label text not null,
  amount numeric not null default 0
);

-- ============================================================
-- HELPER: get the signed-in user's role
-- ============================================================
create or replace function current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from staff where id = auth.uid()
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- Everyone signed in can read most things (a clinic runs on
-- shared visibility) — writes are restricted to the role that
-- should own that action.
-- ============================================================

alter table staff enable row level security;
alter table patients enable row level security;
alter table consultations enable row level security;
alter table prescriptions enable row level security;
alter table lab_orders enable row level security;
alter table vitals enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;

-- STAFF: everyone can see the staff directory; only Admin manages it
create policy "staff_select_all" on staff for select to authenticated using (true);
create policy "staff_insert_admin" on staff for insert to authenticated with check (current_staff_role() = 'Admin');
create policy "staff_update_admin" on staff for update to authenticated using (current_staff_role() = 'Admin');
create policy "staff_delete_admin" on staff for delete to authenticated using (current_staff_role() = 'Admin');

-- PATIENTS: everyone can see patients; Receptionist (or Admin) registers them
create policy "patients_select_all" on patients for select to authenticated using (true);
create policy "patients_insert_reception" on patients for insert to authenticated
  with check (current_staff_role() in ('Receptionist','Admin'));
create policy "patients_update_reception" on patients for update to authenticated
  using (current_staff_role() in ('Receptionist','Admin'));

-- CONSULTATIONS: everyone can see them; only Doctor (or Admin) creates them
create policy "consultations_select_all" on consultations for select to authenticated using (true);
create policy "consultations_insert_doctor" on consultations for insert to authenticated
  with check (current_staff_role() in ('Doctor','Admin'));

-- PRESCRIPTIONS: everyone can see them; Doctor creates, Pharmacist marks dispensed
create policy "prescriptions_select_all" on prescriptions for select to authenticated using (true);
create policy "prescriptions_insert_doctor" on prescriptions for insert to authenticated
  with check (current_staff_role() in ('Doctor','Admin'));
create policy "prescriptions_update_pharmacist" on prescriptions for update to authenticated
  using (current_staff_role() in ('Pharmacist','Admin'));

-- LAB ORDERS: everyone can see them; Doctor orders, Lab Technician completes
create policy "labs_select_all" on lab_orders for select to authenticated using (true);
create policy "labs_insert_doctor" on lab_orders for insert to authenticated
  with check (current_staff_role() in ('Doctor','Admin'));
create policy "labs_update_labtech" on lab_orders for update to authenticated
  using (current_staff_role() in ('Lab Technician','Admin'));

-- VITALS: everyone can see them; only Nurse (or Admin) logs them
create policy "vitals_select_all" on vitals for select to authenticated using (true);
create policy "vitals_insert_nurse" on vitals for insert to authenticated
  with check (current_staff_role() in ('Nurse','Admin'));

-- INVOICES / INVOICE ITEMS: everyone can see them; only Cashier (or Admin) manages billing
create policy "invoices_select_all" on invoices for select to authenticated using (true);
create policy "invoices_insert_cashier" on invoices for insert to authenticated
  with check (current_staff_role() in ('Cashier','Admin'));
create policy "invoices_update_cashier" on invoices for update to authenticated
  using (current_staff_role() in ('Cashier','Admin'));

create policy "invoice_items_select_all" on invoice_items for select to authenticated using (true);
create policy "invoice_items_insert_cashier" on invoice_items for insert to authenticated
  with check (current_staff_role() in ('Cashier','Admin'));

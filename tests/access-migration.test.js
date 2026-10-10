// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
let db;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tables = ['staff', 'patients', 'consultations', 'prescriptions', 'lab_orders', 'vitals', 'invoices', 'invoice_items', 'visits', 'admissions', 'referrals', 'price_list', 'audit_log'];
const migration = readFileSync(new URL('../supabase/migrations/202610100001_active_staff_access.sql', import.meta.url), 'utf8');
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  // PostgreSQL has built-in gen_random_uuid(). Only pgcrypto extension loading
  // is omitted from the baseline schema in this embedded PostgreSQL fixture.
  await db.exec(readFileSync(new URL('../palani_clinic_schema.sql', import.meta.url), 'utf8').replace('create extension if not exists pgcrypto;', ''));
  for (const name of tables.slice(8)) {
    await db.exec(`create table public.${name} (id uuid primary key default gen_random_uuid(), value text);
      insert into public.${name}(value) values ('sensitive');
      create policy legacy_allow on public.${name} for all to authenticated using (true) with check (true);`);
  }
  // Model permissive grants, including TRUNCATE, on an older Supabase project.
  await db.exec(`grant all on all tables in schema public to anon, authenticated, service_role;
    grant usage on all sequences in schema public to authenticated, service_role;`);
  const roles = ['Admin', 'Receptionist', 'Doctor', 'Nurse', 'Lab Technician', 'Pharmacist', 'Cashier'];
  for (let n = 1; n <= 9; n++) await db.query('insert into auth.users(id) values ($1)', [id(n)]);
  for (let n = 1; n <= 8; n++) await db.query('insert into public.staff(id,name,role) values ($1,$2,$3)', [id(n), 'Staff ' + n, roles[(n - 1) % 7]]);
  await db.exec(`insert into patients(id,name,dob,gender,phone) values ('${id(100)}','Synthetic Patient','2000-01-01','Female','0700000000');
    insert into consultations(id,patient_id,doctor_id,diagnosis) values ('${id(101)}','${id(100)}','${id(3)}','Synthetic diagnosis');
    insert into prescriptions(consultation_id,drug) values ('${id(101)}','Synthetic drug');
    insert into lab_orders(patient_id,test_name,ordered_by) values ('${id(100)}','Synthetic test','${id(3)}');
    insert into vitals(patient_id,recorded_by) values ('${id(100)}','${id(4)}');
    insert into invoices(id,patient_id,created_by) values ('${id(102)}','${id(100)}','${id(7)}');
    insert into invoice_items(invoice_id,label) values ('${id(102)}','Synthetic fee');`);
  await db.exec(migration);
  await db.query('update staff set active=false where id=$1', [id(8)]);
}, 30_000);
afterAll(async () => { if (db) await db.close(); });
async function asUser(n, action, role = 'authenticated') {
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [n ? id(n) : '']);
  try { return await action(); } finally { await db.exec('reset role'); }
}
it('keeps existing SELECT access for every active staff role', async () => {
  for (let n = 1; n <= 7; n++) await asUser(n, async () => {
    for (const table of tables) expect((await db.query(`select * from public.${table}`)).rows.length).toBeGreaterThan(0);
  });
});
it.each([8, 9])('denies every known table for inactive/missing staff with a valid JWT (%s)', async (n) => {
  await asUser(n, async () => {
    for (const table of tables) expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);
    expect((await db.query('select public.current_staff_role() as role')).rows[0].role).toBeNull();
    await expect(db.query("insert into patients(name,dob,gender,phone) values ('Denied','2000-01-01','Female','0700000000')")).rejects.toThrow(/row-level security/);
    expect((await db.query("update visits set value='Denied'")).affectedRows).toBe(0);
  });
});
it('blocks anonymous table access and authenticated TRUNCATE outside RLS', async () => {
  await asUser(null, async () => {
    for (const table of tables) await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
  }, 'anon');
  await asUser(1, () => expect(db.query('truncate public.patients cascade')).rejects.toThrow(/permission denied/));
});
it('retains staff identity by denying browser deletion even to an admin', async () => {
  await asUser(1, () => expect(db.query('delete from public.staff where id=$1', [id(8)])).rejects.toThrow(/permission denied/));
});
it('revokes data access on the next statement after deactivation without replacing the JWT', async () => {
  await asUser(1, () => db.query('update staff set active=false where id=$1', [id(3)]));
  await asUser(3, async () => expect((await db.query('select * from patients')).rows).toHaveLength(0));
  await db.query('update staff set active=true where id=$1', [id(3)]);
});
it('can be reapplied without duplicate policies or losing deactivation', async () => {
  await db.exec(migration);
  expect((await db.query('select active from staff where id=$1', [id(8)])).rows[0].active).toBe(false);
  const result = await db.query("select count(*)::integer as n from pg_policies where policyname='active_staff_required'");
  expect(result.rows[0].n).toBe(tables.length);
});

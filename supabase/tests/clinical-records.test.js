// @vitest-environment node
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const migration = read("../migrations/20261011054404_atomic_clinical_records.sql");
let db;
let doctor, patient, visit, request;
async function role(name, active = true) {
  const id = randomUUID();
  await db.exec("reset role");
  await db.query("insert into auth.users(id) values ($1)", [id]);
  await db.query("insert into public.staff(id,name,role,active) values ($1,'Synthetic fixture',$2,$3)", [id, name, active]);
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
  await db.exec("set local role authenticated");
  return id;
}
async function save(overrides = {}) {
  const values = { patient, visit, request, diagnosis: "Synthetic diagnosis", notes: "Test notes",
    prescriptions: [{ drug: "Synthetic medicine", dosage: "Test dosage", instructions: "Test instructions" }],
    labs: ["Synthetic lab test"], ...overrides };
  return (await db.query("select public.save_clinical_consultation($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) as saved", [
    values.patient, values.visit, values.request, values.diagnosis, values.notes,
    JSON.stringify(values.prescriptions), JSON.stringify(values.labs),
  ])).rows[0].saved;
}
async function count(table) {
  await db.exec("reset role");
  return Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(read("fixtures/clinic-schema.sql"));
  await db.exec(read("../migrations/20261011044601_enforce_active_staff_access.sql"));
  await db.exec(migration);
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
  doctor = await role("Doctor");
  await db.exec("reset role");
  patient = randomUUID(); visit = randomUUID(); request = randomUUID();
  await db.query("insert into public.patients(id,name,dob,gender,phone) values ($1,'Synthetic patient','2000-01-01','Other','test')", [patient]);
  await db.query("insert into public.visits(id,patient_id) values ($1,$2)", [visit, patient]);
  await db.exec("set local role authenticated");
});
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db?.close(); });

describe("atomic clinical save and audit controls", () => {
  it("saves orders and encounter together with the server-verified actor", async () => {
    const saved = await save();
    expect(saved.code).toMatch(/^CN-/);
    const row = (await db.query("select * from consultations where id=$1", [saved.id])).rows[0];
    expect(row.doctor_id).toBe(doctor);
    expect(row.visit_id).toBe(visit);
    expect((await db.query("select status,completed_at from visits where id=$1", [visit])).rows[0])
      .toMatchObject({ status: "Completed", completed_at: expect.any(Date) });
    expect(await count("prescriptions")).toBe(1);
    expect(await count("lab_orders")).toBe(1);
    const audits = (await db.query("select table_name,action,staff_id,new_data from audit_log where table_name in ('consultations','prescriptions','lab_orders')")).rows;
    expect(audits).toHaveLength(3);
    expect(audits.every(a => a.action === "INSERT" && a.staff_id === doctor && a.new_data)).toBe(true);
  });
  it("replays the same request without creating orders or audit events twice", async () => {
    const first = await save();
    const second = await save();
    expect(second).toEqual(first);
    expect(await count("consultations")).toBe(1);
    expect(await count("prescriptions")).toBe(1);
    expect(await count("lab_orders")).toBe(1);
  });
  it("rejects changed payloads using an existing request ID", async () => {
    await save();
    await expect(save({ labs: ["Changed test"] })).rejects.toThrow("different consultation");
  });
  it("rejects a second save for a completed visit", async () => {
    await save();
    await expect(save({ request: randomUUID() })).rejects.toThrow("completed");
  });
  it("rejects a visit belonging to another patient", async () => {
    await expect(save({ patient: randomUUID() })).rejects.toThrow("another patient");
  });
  it("rolls back all writes and audits if a later lab insert fails", async () => {
    await db.exec("reset role");
    await db.exec("create function public.reject_test_lab() returns trigger language plpgsql as $$ begin raise exception 'Synthetic lab storage failure'; end $$; create trigger reject_test_lab before insert on lab_orders for each row execute function public.reject_test_lab();");
    const before = await count("audit_log");
    await db.exec("set local role authenticated; savepoint failing_save");
    await expect(save()).rejects.toThrow("Synthetic lab storage failure");
    await db.exec("rollback to savepoint failing_save");
    expect(await count("consultations")).toBe(0);
    expect(await count("prescriptions")).toBe(0);
    expect(await count("lab_orders")).toBe(0);
    expect(await count("audit_log")).toBe(before);
    expect((await db.query("select status from visits where id=$1", [visit])).rows[0].status).toBe("Waiting");
  });
  it.each(["Receptionist","Nurse","Lab Technician","Pharmacist","Cashier"])("denies %s clinical saves", async name => {
    await role(name);
    await expect(save()).rejects.toThrow("active Doctor or Admin");
  });
  it("denies an inactive Doctor", async () => {
    await role("Doctor", false);
    await expect(save()).rejects.toThrow("active Doctor or Admin");
  });
  it("allows an active Admin", async () => {
    await role("Admin");
    expect((await save()).id).toBeTruthy();
  });
  it("denies anonymous function calls", async () => {
    await db.exec("set local role anon");
    await expect(save()).rejects.toThrow("permission denied");
  });
  it("rejects malformed medication rows without a partial save", async () => {
    await expect(save({ prescriptions: [{ drug: "", dosage: "Test" }] })).rejects.toThrow("Invalid prescription");
  });
  it("records vitals creation and lab result changes, and blocks client audit changes", async () => {
    await save();
    await role("Nurse");
    await db.query("insert into public.vitals(patient_id,recorded_by,pulse) values ($1,auth.uid(),80)", [patient]);
    await role("Lab Technician");
    await db.query("update lab_orders set result='Synthetic result',status='Completed',completed_by=auth.uid(),completed_at=now() where patient_id=$1", [patient]);
    await role("Admin");
    const audits = (await db.query("select table_name,action,old_data,new_data from audit_log where table_name in ('vitals','lab_orders') order by created_at")).rows;
    expect(audits.some(a => a.table_name === "vitals" && a.action === "INSERT")).toBe(true);
    expect(audits.some(a => a.table_name === "lab_orders" && a.action === "UPDATE" && a.old_data.status === "Pending" && a.new_data.status === "Completed")).toBe(true);
    expect((await db.query("select has_table_privilege(current_user,'public.audit_log','INSERT') as allowed")).rows[0].allowed).toBe(false);
    expect((await db.query("select has_function_privilege(current_user,'private.write_clinical_audit()','EXECUTE') as allowed")).rows[0].allowed).toBe(false);
    const tables = (await db.query("select tablename from pg_tables where schemaname='public'")).rows;
    for (const { tablename } of tables) {
      expect((await db.query("select has_table_privilege(current_user,$1,'TRUNCATE') as allowed", [`public.${tablename}`])).rows[0].allowed).toBe(false);
    }
  });
  it("can apply the migration again without losing clinical records", async () => {
    await save();
    await db.exec("reset role");
    await db.exec(migration);
    expect(await count("consultations")).toBe(1);
  });
  it("validates the prepared hosted verification script against the schema fixture", async () => {
    await db.exec("reset role");
    const checks = read("clinical_records.sql").replace(/^begin;$/m, "").replace(/^rollback;$/m, "");
    await db.exec(checks);
  });
  it("can restore prior trigger compatibility without deleting records or reopening unsafe grants", async () => {
    const saved = await save();
    const auditCount = await count("audit_log");
    // Keep this test within its fixture transaction rather than committing.
    const rollback = read("../rollback/atomic_clinical_records.sql").replace(/^begin;$/m, "").replace(/^commit;$/m, "");
    await db.exec(rollback);
    expect(await count("consultations")).toBe(1);
    expect(await count("audit_log")).toBe(auditCount);
    expect((await db.query("select visit_id from consultations where id=$1", [saved.id])).rows[0].visit_id).toBe(visit);
    expect((await db.query("select count(*)::int as n from pg_trigger where tgname like 'audit_%' and not tgisinternal")).rows[0].n).toBe(9);
    await db.exec("set local role authenticated");
    expect((await db.query("select has_table_privilege(current_user,'public.consultations','TRUNCATE') as allowed")).rows[0].allowed).toBe(false);
    await expect(save()).rejects.toThrow("permission denied");
  });
});

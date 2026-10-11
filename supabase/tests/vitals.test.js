// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
const read = name => readFileSync(new URL(name, import.meta.url), "utf8");
let db, nurse, patient, other;
async function role(name, active = true) {
  await db.exec("reset role");const id = randomUUID();await db.query("insert into auth.users(id) values($1)", [id]);
  if (name) await db.query("insert into staff(id,name,role,active) values($1,'Vitals test fixture',$2,$3)", [id, name, active]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);await db.exec("set local role authenticated");return id;
}
const save = async (changes = {}) => {
  const args = { patient, sys: 120, dia: 80, temp: 36.8, pulse: 76, weight: 68.25, measured: "2026-10-11T09:30:00Z", request: randomUUID(), ...changes };
  await db.exec("savepoint submission");
  try {
    const result = await db.query("select public.save_patient_vitals($1,$2,$3,$4,$5,$6,$7,$8) as saved", [args.patient,args.sys,args.dia,args.temp,args.pulse,args.weight,args.measured,args.request]);
    await db.exec("release savepoint submission");return result;
  } catch (error) { await db.exec("rollback to savepoint submission; release savepoint submission");throw error; }
};
beforeAll(async () => {
  db = new PGlite();await db.exec(read("fixtures/clinic-schema.sql"));
  for (const name of readdirSync(new URL("../migrations",import.meta.url)).filter(n => n.endsWith(".sql")).sort()) await db.exec(read("../migrations/"+name));
}, 30000);
beforeEach(async () => {
  await db.exec("begin");nurse = await role("Nurse");await db.exec("reset role");patient = randomUUID();other = randomUUID();
  for(const id of [patient,other]) await db.query("insert into patients(id,name,dob,gender,phone) values($1,'Vitals test fixture','2000-01-01','Other','test')",[id]);
  await db.exec("set local role authenticated");
});
afterEach(async () => { await db.exec("rollback"); });afterAll(async () => { await db?.close(); });
it("stores structured readings, server recorder/time and matching retry without duplicate audit", async () => {
  const request = randomUUID(), first = (await save({ request })).rows[0].saved;
  expect(first).toMatchObject({ patient_id: patient, bp: "120/80", bp_systolic: 120, bp_diastolic: 80, recorded_by: nurse, request_id: request });
  expect(Date.parse(first.recorded_at)).toBeGreaterThan(Date.now()-60000);
  expect((await save({ request })).rows[0].saved).toEqual(first);
  await db.exec("reset role");expect((await db.query("select count(*)::int as n from audit_log where record_id=$1 and action='INSERT'",[first.id])).rows[0].n).toBe(1);
});
it("rejects collisions with changed patient, readings or recorder", async () => {
  const request = randomUUID();await save({ request });
  for (const change of [{ patient: other }, { pulse: 77 }, { measured: "2026-10-11T09:31:00Z" }]) await expect(save({ request, ...change })).rejects.toThrow("different readings");
  await role("Nurse");await expect(save({ request })).rejects.toThrow("another recorder");
});
it.each(["Doctor","Cashier","Pharmacist","Lab Technician","Receptionist",null])("rejects %s", async name => { await role(name);await expect(save()).rejects.toThrow("active Nurse"); });
it("allows Admin and rejects inactive Nurse and anonymous", async () => {
  await role("Admin");await save();await role("Nurse",false);await expect(save()).rejects.toThrow("active Nurse");
  await db.exec("set local role anon");await expect(save()).rejects.toThrow("permission denied");
});
it.each([{ sys: null }, { dia: null }, { weight: 0 }, { sys: -1 }, { pulse: -1 }, { pulse: 1.5 },
  { temp: "NaN" }, { temp: "Infinity" }, { weight: 1.1234 }, { sys: 1000001 }, { measured: null },
  { measured: "infinity" }, { patient: null }, { request: null }, { sys: null, dia: null, temp: null, pulse: null, weight: null }])("rejects invalid submission %#", async changes => { await expect(save(changes)).rejects.toThrow();expect((await db.query("select count(*)::int as n from vitals")).rows[0].n).toBe(0); });
it("retains zero pulse/pressure, low infant weight and atypical values without classifying them", async () => {
  expect((await save({ sys: 0, dia: 0, pulse: 0, weight: 0.025, temp: -1 })).rows[0].saved).toMatchObject({ pulse: 0, weight: 0.025, temperature: -1 });
});
it("guards legacy inserts, derives actor/time and does not infer measured time", async () => {
  const saved = (await db.query("insert into vitals(patient_id,bp,recorded_by,recorded_at) values($1,'120 / 80',$2,'1900-01-01') returning *",[patient,randomUUID()])).rows[0];
  expect(saved.recorded_by).toBe(nurse);expect(Number(saved.bp_systolic)).toBe(120);expect(saved.measured_at).toBeNull();
  await expect(db.query("insert into vitals(patient_id,bp,recorded_by) values($1,'unknown',$2)",[patient,nurse])).rejects.toThrow("systolic/diastolic");
});
it("prevents overwrites and deletions even if future RLS grants write access", async () => {
  const saved = (await save()).rows[0].saved;await db.exec("reset role; create policy vitals_test_update on vitals for update to authenticated using(true) with check(true); create policy vitals_test_delete on vitals for delete to authenticated using(true); set local role authenticated;");
  for (const sql of ["update vitals set pulse=77 where id=$1", "delete from vitals where id=$1"]) {
    await db.exec("savepoint mutation");await expect(db.query(sql,[saved.id])).rejects.toThrow("correction workflow");await db.exec("rollback to savepoint mutation; release savepoint mutation");
  }
  expect((await db.query("select pulse from vitals where id=$1",[saved.id])).rows[0].pulse).toBe(76);
});
it("preserves historical rows and rolls back on audit failure", async () => {
  await db.exec("reset role");await db.exec("drop trigger guard_vitals_write on vitals");
  await db.query("insert into vitals(patient_id,bp,recorded_by) values($1,'legacy uncertain',$2)",[patient,nurse]);
  const migration = readdirSync(new URL("../migrations",import.meta.url)).find(n => n.endsWith("_structured_vitals.sql"));await db.exec(read("../migrations/"+migration));
  expect((await db.query("select bp,bp_systolic,measured_at from vitals")).rows[0]).toEqual({ bp: "legacy uncertain", bp_systolic: null, measured_at: null });
  await db.exec("create function private.fail_vitals_audit() returns trigger language plpgsql as $$ begin if NEW.table_name='vitals' then raise exception 'Synthetic audit failure'; end if; return NEW; end $$; create trigger fail_vitals_audit before insert on audit_log for each row execute function private.fail_vitals_audit(); set local role authenticated;");
  await expect(save()).rejects.toThrow("Synthetic audit failure");expect((await db.query("select count(*)::int as n from vitals")).rows[0].n).toBe(1);
});
it("rollback retains saved readings, audits and request IDs and disables the new RPC", async () => {
  const saved = (await save()).rows[0].saved;await db.exec("reset role");await db.exec(read("../rollback/structured_vitals.sql").replace(/^begin;$/m,"").replace(/^commit;$/m,""));
  expect((await db.query("select request_id from vitals where id=$1",[saved.id])).rows[0].request_id).toBe(saved.request_id);
  expect((await db.query("select count(*)::int as n from audit_log where record_id=$1",[saved.id])).rows[0].n).toBe(1);
  await db.exec("set local role authenticated");await expect(save()).rejects.toThrow("permission denied");
});
it("runs the hosted verification script against the inspected schema fixture and leaves no fixtures", async () => {
  await db.exec("rollback");const results = await db.exec(read("vitals.sql"));
  expect(results.at(-1).rows[0].result).toMatch(/^PASS:/);
  expect((await db.query("select count(*)::int as n from patients where name='Vitals test fixture'")).rows[0].n).toBe(0);
  await db.exec("begin");
});

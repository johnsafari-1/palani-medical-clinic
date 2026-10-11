// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
const read = name => readFileSync(new URL(name,import.meta.url),"utf8");
let db, doctor, patient, other;
const entry = changes => ({id:randomUUID(),substance:"Synthetic substance",reaction:"Synthetic rash",severity:"mild",criticality:"unable-to-assess",category:"medication",type:"",clinical_status:"active",verification_status:"unconfirmed",note:"",...changes});
async function role(name,active=true) {
  await db.exec("reset role");const id=randomUUID();await db.query("insert into auth.users(id) values($1)",[id]);
  if(name) await db.query("insert into staff(id,name,role,active) values($1,'Allergy test fixture',$2,$3)",[id,name,active]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await db.exec("set local role authenticated");return id;
}
async function safely(action) {
  await db.exec("savepoint allergy_action");try {const result=await action();await db.exec("release savepoint allergy_action");return result;}
  catch(error){await db.exec("rollback to savepoint allergy_action; release savepoint allergy_action");throw error;}
}
async function save(changes={}) {
  const args={patient,previous:null,assessment:"unknown",allergies:[],reason:"Initial assessment",request:randomUUID(),...changes};
  return safely(async()=> (await db.query("select save_patient_allergy_review($1,$2,$3,$4::jsonb,$5,$6) as saved",[args.patient,args.previous,args.assessment,JSON.stringify(args.allergies),args.reason,args.request])).rows[0].saved);
}
beforeAll(async()=>{db=new PGlite();await db.exec(read("fixtures/clinic-schema.sql"));for(const file of readdirSync(new URL("../migrations",import.meta.url)).filter(n=>n.endsWith(".sql")).sort()) await db.exec(read("../migrations/"+file));},30000);
beforeEach(async()=>{await db.exec("begin");doctor=await role("Doctor");await db.exec("reset role");patient=randomUUID();other=randomUUID();for(const id of [patient,other]) await db.query("insert into patients(id,name,dob,gender,phone) values($1,'Allergy test fixture','2000-01-01','Other','test')",[id]);await db.exec("set local role authenticated");});
afterEach(async()=>{await db.exec("rollback");});afterAll(async()=>{await db?.close();});
it("does not backfill historical patients as allergy-free",async()=>{expect((await db.query("select count(*)::int as n from patient_allergy_reviews")).rows[0].n).toBe(0);});
it("records explicit unknown/no-known states, actor/time and one audit per matching retry",async()=>{
  const request=randomUUID(),first=await save({request});expect(first).toMatchObject({patient_id:patient,assessment:"unknown",revision:1,previous_id:null,recorded_by:doctor});
  expect(Date.parse(first.recorded_at)).toBeGreaterThan(Date.now()-60000);expect(await save({request})).toEqual(first);
  const second=await save({previous:first.id,assessment:"no_known",reason:"Reviewed with patient"});expect(second.revision).toBe(2);
  expect(await save({request})).toEqual(first); // Historical retry still returns the original review.
  await db.exec("reset role");expect((await db.query("select count(*)::int as n from audit_log where table_name='patient_allergy_reviews'")).rows[0].n).toBe(2);
});
it("rejects changed request identity, patient, previous review, payload and recorder",async()=>{
  const request=randomUUID(),first=await save({request});for(const changes of [{patient:other},{previous:first.id},{assessment:"no_known"},{reason:"Different reason"}]) await expect(save({request,...changes})).rejects.toThrow("different allergy review");
  await role("Doctor");await expect(save({request})).rejects.toThrow("recorder");
});
it("rejects stale and other-patient parents without overwriting earlier reviews",async()=>{
  const first=await save();await save({previous:first.id,assessment:"no_known"});await expect(save({previous:first.id})).rejects.toThrow("changed");
  await expect(save({patient:other,previous:first.id})).rejects.toThrow("changed");expect((await db.query("select count(*)::int as n from patient_allergy_reviews")).rows[0].n).toBe(2);
});
it("preserves stable IDs and prior reactions during corrections and entered-in-error transitions",async()=>{
  const allergy=entry(),first=await save({assessment:"known",allergies:[allergy]});
  await expect(save({previous:first.id,allergies:[]})).rejects.toThrow("Preserve existing");
  const corrected={...allergy,reaction:"Corrected manifestation",verification_status:"confirmed"};const second=await save({previous:first.id,assessment:"known",allergies:[corrected],reason:"Corrected reaction after review"});
  const third=await save({previous:second.id,assessment:"no_known",allergies:[{...corrected,verification_status:"entered-in-error",clinical_status:null}],reason:"Incorrect patient report; retained as entered-in-error"});
  expect(third.revision).toBe(3);expect(third.allergies[0].id).toBe(allergy.id);expect((await db.query("select allergies from patient_allergy_reviews where id=$1",[first.id])).rows[0].allergies[0].reaction).toBe("Synthetic rash");
});
it.each(["Nurse","Pharmacist","Cashier","Receptionist","Lab Technician",null])("denies %s allergy writes",async name=>{await role(name);await expect(save()).rejects.toThrow("active Doctor");});
it("allows Admin; denies inactive Doctor/Admin and anonymous",async()=>{
  await role("Admin");await save();for(const name of ["Doctor","Admin"]){await role(name,false);await expect(save()).rejects.toThrow("active Doctor");}
  await db.exec("set local role anon");await expect(save()).rejects.toThrow("permission denied");
});
it.each(["Doctor","Nurse","Pharmacist","Admin","Cashier","Receptionist","Lab Technician",null])("enforces %s read access using active database roles",async name=>{
  await save();await role(name);expect((await db.query("select count(*)::int as n from patient_allergy_reviews")).rows[0].n).toBe(["Doctor","Nurse","Pharmacist","Admin"].includes(name)?1:0);
  if(name){await role(name,false);expect((await db.query("select count(*)::int as n from patient_allergy_reviews")).rows[0].n).toBe(0);}
});
it.each([
  {assessment:null},{assessment:"none"},{assessment:"known"},{reason:" "},{request:null},{patient:null},
  {allergies:null},{allergies:{}},{allergies:[null]},{allergies:[{}]},
  {assessment:"known",allergies:[entry({severity:"extreme"})]},
  {assessment:"known",allergies:[entry({verification_status:"entered-in-error"})]},
  {assessment:"known",allergies:[entry({clinical_status:null})]},
  {assessment:"known",allergies:[entry({substance:""})]},
  {assessment:"known",allergies:[entry({criticality:"unknown"})]},
  {assessment:"known",allergies:[entry({reaction:"",severity:"mild"})]},
  {assessment:"known",allergies:[entry({category:"other"})]},
  {assessment:"known",allergies:[entry({type:"unverified"})]},
  {assessment:"known",allergies:[entry({note:4})]},
  {assessment:"known",allergies:[entry({extra:"unexpected"})]},
  {assessment:"known",allergies:[entry({substance:"x".repeat(201)})]},
  {assessment:"known",allergies:Array.from({length:51},()=>entry())},
])("rejects malformed review %# without partial rows/audits",async changes=>{await expect(save(changes)).rejects.toThrow();expect((await db.query("select count(*)::int as n from patient_allergy_reviews")).rows[0].n).toBe(0);});
it("rejects duplicate record IDs",async()=>{const allergy=entry();await expect(save({assessment:"known",allergies:[allergy,allergy]})).rejects.toThrow("distinct");});
it("guards direct inserts against client actor, timestamp, revision and fingerprint spoofing",async()=>{
  const row=(await db.query("insert into patient_allergy_reviews(patient_id,assessment,allergies,change_reason,request_id,recorded_by,recorded_at,revision,request_hash) values($1,'no_known','[]','Reviewed',$2,$3,'1900-01-01',99,'forged') returning *",[patient,randomUUID(),randomUUID()])).rows[0];expect(row.recorded_by).toBe(doctor);expect(row.revision).toBe(1);expect(row.request_hash).not.toBe("forged");expect(new Date(row.recorded_at).getFullYear()).toBeGreaterThan(2000);
});
it("blocks browser update/delete/TRUNCATE even with future row policies and grants",async()=>{
  const saved=await save();await db.exec("reset role; grant update,delete on patient_allergy_reviews to authenticated; create policy test_allergy_update on patient_allergy_reviews for update to authenticated using(true) with check(true); create policy test_allergy_delete on patient_allergy_reviews for delete to authenticated using(true); set local role authenticated;");
  for(const query of ["update patient_allergy_reviews set change_reason='Overwrite' where id=$1","delete from patient_allergy_reviews where id=$1"]) await expect(safely(()=>db.query(query,[saved.id]))).rejects.toThrow("new attributed revision");
  await expect(safely(()=>db.exec("truncate patient_allergy_reviews"))).rejects.toThrow("permission denied");
});
it("rolls back an assessment if the protected audit write fails",async()=>{
  await db.exec("reset role; create function private.fail_allergy_audit() returns trigger language plpgsql as $$ begin if NEW.table_name='patient_allergy_reviews' then raise exception 'Synthetic allergy audit failure'; end if; return NEW; end $$; create trigger fail_allergy_audit before insert on audit_log for each row execute function private.fail_allergy_audit(); set local role authenticated;");
  await expect(save()).rejects.toThrow("Synthetic allergy audit failure");expect((await db.query("select count(*)::int as n from patient_allergy_reviews")).rows[0].n).toBe(0);
});
it("recovery disables writes while retaining reviews, IDs, read permissions and audits",async()=>{
  const saved=await save();await db.exec("reset role");await db.exec(read("../rollback/structured_allergies.sql").replace(/^begin;$/m,"").replace(/^commit;$/m,""));await db.exec("set local role authenticated");
  expect((await db.query("select id from patient_allergy_reviews")).rows[0].id).toBe(saved.id);await expect(save({previous:saved.id})).rejects.toThrow("permission denied");
  await db.exec("reset role");expect((await db.query("select count(*)::int as n from audit_log where record_id=$1",[saved.id])).rows[0].n).toBe(1);
});
it("runs hosted allergy verification with all synthetic fixtures rolled back",async()=>{
  await db.exec("rollback");const results=await db.exec(read("allergies.sql"));expect(results.at(-1).rows[0].result).toMatch(/^PASS:/);
  expect((await db.query("select count(*)::int as n from patients where name='Allergy test fixture'")).rows[0].n).toBe(0);await db.exec("begin");
});

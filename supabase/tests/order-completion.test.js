// @vitest-environment node
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
const read = name => readFileSync(new URL(name,import.meta.url),"utf8");
const migration = read("../migrations/20261011062324_guarded_order_completion.sql");
let db, patient, consultation, rx, lab, actor;
async function role(name, active=true) {
  await db.exec("reset role");
  const id=randomUUID();
  await db.query("insert into auth.users(id) values ($1)",[id]);
  if (name) await db.query("insert into staff(id,name,role,active) values ($1,'Order completion test fixture',$2,$3)",[id,name,active]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  await db.exec("set local role authenticated");
  actor=id; return id;
}
const dispense=()=>db.query("select public.dispense_prescription($1) as saved",[rx]);
const complete=(result="Synthetic result")=>db.query("select public.complete_lab_order($1,$2) as saved",[lab,result]);
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(read("fixtures/clinic-schema.sql"));
  await db.exec(read("../migrations/20261011044601_enforce_active_staff_access.sql"));
  await db.exec(read("../migrations/20261011060200_atomic_clinical_records.sql"));
  await db.exec(migration);
  await db.exec(read("../migrations/20261011104648_atomic_billing.sql"));
},30000);
beforeEach(async()=>{
  await db.exec("begin");
  const doctor=await role("Doctor");
  await db.exec("reset role");
  patient=randomUUID();consultation=randomUUID();rx=randomUUID();lab=randomUUID();
  await db.query("insert into patients(id,name,dob,gender,phone) values ($1,'Order completion test fixture','2000-01-01','Other','test')",[patient]);
  await db.query("insert into consultations(id,patient_id,doctor_id,diagnosis) values ($1,$2,$3,'Synthetic diagnosis')",[consultation,patient,doctor]);
  await db.query("insert into prescriptions(id,consultation_id,drug,dosage,instructions) values ($1,$2,'Synthetic drug','Test dose','Test instructions')",[rx,consultation]);
  await db.query("insert into lab_orders(id,patient_id,consultation_id,test_name,ordered_by) values ($1,$2,$3,'Synthetic test',$4)",[lab,patient,consultation,doctor]);
  await db.exec("set local role authenticated");
});
afterEach(async()=>{await db.exec("rollback");});
afterAll(async()=>{await db?.close();});
describe("server-controlled order completion",()=>{
  it.each(["Admin","Receptionist","Doctor","Nurse","Lab Technician","Pharmacist","Cashier"])("enforces completion rights for %s",async name=>{
    await role(name);
    await db.exec("savepoint dispense_case");
    if (["Admin","Pharmacist"].includes(name)) expect((await dispense()).rows[0].saved.dispensed).toBe(true);
    else {await expect(dispense()).rejects.toThrow("active Pharmacist");await db.exec("rollback to savepoint dispense_case");}
    if (["Admin","Lab Technician"].includes(name)) expect((await complete()).rows[0].saved.status).toBe("Completed");
    else await expect(complete()).rejects.toThrow("active Lab Technician");
  });
  it.each([["Pharmacist",false],["Lab Technician",false],[null,true]])("denies inactive or unassigned staff %s",async(name,active)=>{
    await role(name,active);
    await db.exec("savepoint deny_case");
    await expect(dispense()).rejects.toThrow("active Pharmacist");
    await db.exec("rollback to savepoint deny_case");
    await expect(complete()).rejects.toThrow("active Lab Technician");
  });
  it("denies anonymous RPC calls",async()=>{
    await db.exec("set local role anon;savepoint deny_case");
    await expect(dispense()).rejects.toThrow("permission denied");
    await db.exec("rollback to savepoint deny_case");
    await expect(complete()).rejects.toThrow("permission denied");
  });
  it("uses the authenticated pharmacist and database time even on legacy direct writes",async()=>{
    await role("Pharmacist");
    const pharmacist=actor;
    await db.query("update prescriptions set dispensed=true,dispensed_by=$1,dispensed_at='1900-01-01' where id=$2",[randomUUID(),rx]);
    const saved=(await db.query("select * from prescriptions where id=$1",[rx])).rows[0];
    expect(saved.dispensed_by).toBe(pharmacist);
    expect(saved.dispensed_at.getUTCFullYear()).toBeGreaterThan(2020);
  });
  it.each(["drug","dosage","instructions","consultation_id","billed"])("blocks pharmacists changing %s",async field=>{
    await role("Pharmacist");
    const value=field==="billed"?true:field==="consultation_id"?randomUUID():"Altered";
    await expect(db.query(`update prescriptions set ${field}=$1 where id=$2`,[value,rx])).rejects.toThrow("cannot be changed");
  });
  it.each(["test_name","patient_id","ordered_by","ordered_at","billed"])("blocks lab technicians changing %s",async field=>{
    await role("Lab Technician");
    const value=field==="billed"?true:field.endsWith("_id")||field==="ordered_by"?randomUUID():field==="ordered_at"?"1900-01-01":"Altered";
    await expect(db.query(`update lab_orders set ${field}=$1 where id=$2`,[value,lab])).rejects.toThrow("cannot be changed");
  });
  it("retries dispensing without changing its actor/time or appending a second audit",async()=>{
    await role("Pharmacist");
    const first=(await dispense()).rows[0].saved;
    expect((await dispense()).rows[0].saved).toEqual(first);
    await db.exec("reset role");
    expect((await db.query("select count(*)::int as n from audit_log where record_id=$1 and action='UPDATE'",[rx])).rows[0].n).toBe(1);
  });
  it("retries the same lab result but rejects a changed result",async()=>{
    await role("Lab Technician");
    const first=(await complete(" Synthetic result ")).rows[0].saved;
    expect(first.completed_by).toBe(actor);
    expect((await complete()).rows[0].saved).toEqual(first);
    await expect(complete("Changed result")).rejects.toThrow("different completion");
  });
  it("rejects a competing pharmacist without changing the first actor",async()=>{
    await role("Pharmacist");await dispense();
    await role("Pharmacist");
    await expect(dispense()).rejects.toThrow("another staff member");
  });
  it("rejects a competing lab technician even with the same result",async()=>{
    await role("Lab Technician");await complete();
    await role("Lab Technician");
    await expect(complete()).rejects.toThrow("different completion");
  });
  it("blocks direct replacement of a completed lab result",async()=>{
    await role("Lab Technician");await complete();
    await expect(db.query("update lab_orders set result='Replaced' where id=$1",[lab])).rejects.toThrow("correction workflow");
  });
  it("blocks reversing dispensing",async()=>{
    await role("Pharmacist");await dispense();
    await expect(db.query("update prescriptions set dispensed=false where id=$1",[rx])).rejects.toThrow("immutable");
  });
  it("rolls back completion when writing its audit fails",async()=>{
    await db.exec("reset role");
    await db.exec("create function public.reject_order_audit() returns trigger language plpgsql as $$ begin if NEW.action='UPDATE' then raise exception 'Synthetic audit storage failure'; end if; return NEW; end $$; create trigger reject_order_audit before insert on audit_log for each row execute function public.reject_order_audit();");
    await role("Lab Technician");
    await db.exec("savepoint audit_failure");
    await expect(complete()).rejects.toThrow("Synthetic audit storage failure");
    await db.exec("rollback to savepoint audit_failure");
    expect((await db.query("select status,result,completed_at from lab_orders where id=$1",[lab])).rows[0]).toMatchObject({status:"Pending",result:null,completed_at:null});
  });
  it("preserves billing-trigger updates under trusted definer privileges",async()=>{
    await db.exec("reset role");
    await db.exec("insert into price_list(name,category,price) values ('Synthetic medication','Medication',1),('Synthetic lab','Lab Test',1)");
    await role("Cashier");
    const invoice=(await db.query("insert into invoices(patient_id,consultation_id,total,created_by) values ($1,$2,2,auth.uid()) returning id",[patient,consultation])).rows[0].id;
    await db.query("insert into invoice_items(invoice_id,label,quantity,unit_price,amount,prescription_id) values ($1,'Synthetic medication',1,1,1,$2)",[invoice,rx]);
    await db.query("insert into invoice_items(invoice_id,label,quantity,unit_price,amount,lab_order_id) values ($1,'Synthetic lab',1,1,1,$2)",[invoice,lab]);
    expect((await db.query("select billed from prescriptions where id=$1",[rx])).rows[0].billed).toBe(true);
    expect((await db.query("select billed from lab_orders where id=$1",[lab])).rows[0].billed).toBe(true);
  });
  it("blocks creation of already-dispensed medication",async()=>{
    await role("Doctor");
    await expect(db.query("insert into prescriptions(consultation_id,drug,dispensed) values ($1,'Synthetic drug',true)",[consultation])).rejects.toThrow("pending and unbilled");
  });
  it("blocks a mismatched patient when ordering a lab test",async()=>{
    await role("Doctor");
    await expect(db.query("insert into lab_orders(patient_id,consultation_id,test_name,ordered_by) values ($1,$2,'Synthetic test',auth.uid())",[randomUUID(),consultation])).rejects.toThrow("same patient");
  });
  it("pins the ordering actor and timestamp for direct lab-order creation",async()=>{
    await role("Doctor");
    const saved=(await db.query("insert into lab_orders(patient_id,consultation_id,test_name,ordered_by,ordered_at) values ($1,$2,'Synthetic test',$3,'1900-01-01') returning *",[patient,consultation,randomUUID()])).rows[0];
    expect(saved.ordered_by).toBe(actor);
    expect(saved.ordered_at.getUTCFullYear()).toBeGreaterThan(2020);
  });
  it("can reapply the migration and use its data-preserving rollback",async()=>{
    await role("Pharmacist");await dispense();
    await db.exec("reset role");await db.exec(migration);
    await db.exec(read("../rollback/guarded_order_completion.sql").replace(/^begin;$/m,"").replace(/^commit;$/m,""));
    expect((await db.query("select dispensed from prescriptions where id=$1",[rx])).rows[0].dispensed).toBe(true);
    await db.exec("set local role authenticated");
    await expect(dispense()).rejects.toThrow("permission denied");
  });
  it("validates the hosted check script against the schema fixture",async()=>{
    await db.exec("reset role");
    await db.exec(read("order_completion.sql").replace(/^begin;$/m,"").replace(/^rollback;$/m,""));
  });
});

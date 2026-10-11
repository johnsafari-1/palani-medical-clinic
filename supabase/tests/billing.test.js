// @vitest-environment node
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect } from 'vitest';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const migration=read('../migrations/20261011104648_atomic_billing.sql');
let db, patient, otherPatient, consultation, otherConsultation, admission, rx, lab, price, medicine, labPrice, actor;
async function role(name,active=true){
  await db.exec('reset role'); const id=randomUUID();
  await db.query('insert into auth.users(id) values ($1)',[id]);
  if(name)await db.query("insert into staff(id,name,role,active) values ($1,'Billing test fixture',$2,$3)",[id,name,active]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  await db.exec('set local role authenticated'); actor=id;return id;
}
function items(){return [{price_item_id:price,quantity:2},{price_item_id:medicine,quantity:1,prescription_id:rx},{price_item_id:labPrice,quantity:1,lab_order_id:lab}];}
async function create(overrides={}){
  const args={patient,consultation,admission:null,sale:'Encounter',request:randomUUID(),items:items(),...overrides};
  return (await db.query('select public.create_clinic_invoice($1,$2,$3,$4,$5,$6::jsonb) as saved',
    [args.patient,args.consultation,args.admission,args.sale,args.request,JSON.stringify(args.items)])).rows[0].saved;
}
const pay=(id,method='Cash')=>db.query('select public.record_invoice_payment($1,$2) as saved',[id,method]);
beforeAll(async()=>{
  db=new PGlite(); await db.exec(read('fixtures/clinic-schema.sql'));
  for(const name of ['20261011044601_enforce_active_staff_access.sql','20261011060200_atomic_clinical_records.sql','20261011062324_guarded_order_completion.sql'])await db.exec(read('../migrations/'+name));
  await db.exec(migration);
},30000);
beforeEach(async()=>{
  await db.exec('begin');const doctor=await role('Doctor');await db.exec('reset role');
  [patient,otherPatient,consultation,otherConsultation,admission,rx,lab,price,medicine,labPrice]=Array.from({length:10},()=>randomUUID());
  if(rx>lab)[rx,lab]=[lab,rx];
  for(const id of [patient,otherPatient])await db.query("insert into patients(id,name,dob,gender,phone) values ($1,'Billing test fixture','2000-01-01','Other','test')",[id]);
  for(const [id,p] of [[consultation,patient],[otherConsultation,otherPatient]])await db.query("insert into consultations(id,patient_id,doctor_id,diagnosis) values ($1,$2,$3,'Synthetic diagnosis')",[id,p,doctor]);
  await db.query("insert into admissions(id,patient_id,status,admitted_at,discharged_at) values ($1,$2,'Discharged','2026-10-01','2026-10-03')",[admission,patient]);
  await db.query("insert into prescriptions(id,consultation_id,drug) values ($1,$2,'Synthetic drug')",[rx,consultation]);
  await db.query("insert into lab_orders(id,patient_id,consultation_id,test_name,ordered_by) values ($1,$2,$3,'Synthetic test',$4)",[lab,patient,consultation,doctor]);
  for(const [id,name,category,amount] of [[price,'Synthetic consultation','Consultation',10.25],[medicine,'Synthetic medication','Medication',3.30],[labPrice,'Synthetic lab','Lab Test',4.15]])await db.query('insert into price_list(id,name,category,price) values ($1,$2,$3,$4)',[id,name,category,amount]);
  await role('Cashier');
});
afterEach(async()=>{await db.exec('rollback');}); afterAll(async()=>{await db?.close();});
describe('atomic billing and payment',()=>{
  it('derives catalogue amounts, trusted creator, links and audit events in one save',async()=>{
    const saved=await create({items:items().map(line=>({...line,amount:1,unit_price:1,label:'Forged label'}))});
    expect(saved).toMatchObject({patient_id:patient,consultation_id:consultation,total:27.95,status:'Unpaid',created_by:actor});
    const lines=(await db.query('select * from invoice_items where invoice_id=$1',[saved.id])).rows;
    expect(lines).toHaveLength(3);expect(lines.reduce((s,l)=>s+Number(l.amount),0)).toBeCloseTo(27.95);
    expect(lines.every(l=>l.label!=='Forged label'&&l.price_item_id)).toBe(true);
    expect((await db.query('select billed from prescriptions where id=$1',[rx])).rows[0].billed).toBe(true);
    await db.exec('reset role');expect((await db.query("select count(*)::int as n from audit_log where table_name='invoice_items' and action='INSERT'")).rows[0].n).toBe(3);
  });
  it.each(['Admin','Cashier','Doctor','Nurse','Receptionist','Lab Technician','Pharmacist'])('restricts encounter billing for %s',async name=>{
    await role(name);if(['Admin','Cashier'].includes(name))expect((await create()).id).toBeTruthy();
    else await expect(create()).rejects.toThrow('active billing');
  });
  it.each([['Cashier',false],[null,true]])('denies inactive/unassigned staff %s',async(name,active)=>{await role(name,active);await expect(create()).rejects.toThrow('active billing');});
  it('denies anonymous invoice and payment RPCs',async()=>{
    await db.exec('set local role anon;savepoint denied');await expect(create()).rejects.toThrow('permission denied');await db.exec('rollback to savepoint denied');await expect(pay(randomUUID())).rejects.toThrow('permission denied');
  });
  it('allows pharmacists to read and pay only their own OTC sales',async()=>{
    await role('Pharmacist');const saved=await create({sale:'OTC',consultation:null,items:[{price_item_id:medicine,quantity:2}]});
    expect(saved.total).toBe(6.6);expect((await pay(saved.id)).rows[0].saved.paid_by).toBe(actor);
    await role('Pharmacist');expect((await db.query('select id from invoices where id=$1',[saved.id])).rows).toHaveLength(0);
    await expect(pay(saved.id)).rejects.toThrow('unavailable');
  });
  it('retries an identical invoice after catalogue prices change without creating duplicates',async()=>{
    const request=randomUUID();const first=await create({request});await db.exec('reset role');
    await db.query('update price_list set active=false,price=999 where id=$1',[price]);await db.exec('set local role authenticated');
    expect(await create({request})).toEqual(first);expect((await db.query('select count(*)::int as n from invoices')).rows[0].n).toBe(1);
  });
  it('rejects reusing an invoice request with a different payload',async()=>{
    const request=randomUUID();await create({request});await expect(create({request,items:[{price_item_id:price,quantity:1}]})).rejects.toThrow('different invoice submission');
  });
  it('rejects another caller reusing a request ID',async()=>{const request=randomUUID();await create({request});await role('Cashier');await expect(create({request})).rejects.toThrow('different invoice submission');});
  it('rejects a second invoice for the same consultation',async()=>{await create();await expect(create({items:[{price_item_id:price,quantity:1}]})).rejects.toThrow('already has an invoice');});
  it('rejects a mismatched invoice patient',async()=>{await expect(create({patient:otherPatient})).rejects.toThrow('same patient');});
  it('rolls back invoice, claimed prescription and audits when a later lab item fails',async()=>{
    await db.exec('reset role');await db.query('update lab_orders set patient_id=$1 where id=$2',[otherPatient,lab]);await db.exec('set local role authenticated;savepoint failure');
    await expect(create()).rejects.toThrow('Lab order must belong');await db.exec('rollback to savepoint failure');
    expect((await db.query('select count(*)::int as n from invoices')).rows[0].n).toBe(0);
    expect((await db.query('select billed from prescriptions where id=$1',[rx])).rows[0].billed).toBe(false);
    await db.exec('reset role');expect((await db.query("select count(*)::int as n from audit_log where table_name in ('invoices','invoice_items')")).rows[0].n).toBe(0);
  });
  it('rolls back the entire sale when audit storage fails on an invoice line',async()=>{
    await db.exec("reset role;create function public.reject_billing_audit() returns trigger language plpgsql as $$ begin if NEW.table_name='invoice_items' then raise exception 'Synthetic audit failure';end if;return NEW;end $$;create trigger reject_billing_audit before insert on audit_log for each row execute function public.reject_billing_audit();set local role authenticated;savepoint failure");
    await expect(create()).rejects.toThrow('Synthetic audit failure');await db.exec('rollback to savepoint failure');expect((await db.query('select count(*)::int as n from invoices')).rows[0].n).toBe(0);
    expect((await db.query('select billed from prescriptions where id=$1',[rx])).rows[0].billed).toBe(false);
  });
  it.each([0,-1,'NaN','Infinity',100001,0.0001])('rejects invalid quantity %s',async quantity=>{await expect(create({items:[{price_item_id:price,quantity}]})).rejects.toThrow('quantity');});
  it('rounds each line to cents before summing',async()=>{expect((await create({items:[{price_item_id:medicine,quantity:1.015},{price_item_id:labPrice,quantity:1.015}]})).total).toBe(7.56);});
  it('rejects empty invoices',async()=>{await expect(create({items:[]})).rejects.toThrow('1 to 100');});
  it('rejects inactive prices',async()=>{await db.exec('reset role');await db.query('update price_list set active=false where id=$1',[price]);await db.exec('set local role authenticated');await expect(create()).rejects.toThrow('active valid price');});
  it('rejects prices that changed since the cashier reviewed the draft',async()=>{await expect(create({items:[{price_item_id:price,quantity:1,expected_unit_price:9}]})).rejects.toThrow('Price changed');});
  it('rejects mismatched catalogue categories',async()=>{await expect(create({items:[{price_item_id:price,quantity:1,prescription_id:rx}]})).rejects.toThrow('category');});
  it('rejects OTC clinical-order claims',async()=>{await expect(create({sale:'OTC',consultation:null,items:[{price_item_id:medicine,quantity:1,prescription_id:rx}]})).rejects.toThrow('cannot claim clinical');});
  it('requires a discharged stay for stay billing and prevents duplicate stay invoices',async()=>{
    const saved=await create({consultation:null,admission,items:[{price_item_id:price,quantity:1}]});expect(saved.admission_id).toBe(admission);
    await expect(create({consultation:null,admission,items:[{price_item_id:price,quantity:1}]})).rejects.toThrow('already has an invoice');
  });
  it('rejects an active stay',async()=>{await db.exec('reset role');await db.query("update admissions set status='Admitted',discharged_at=null where id=$1",[admission]);await db.exec('set local role authenticated');await expect(create({consultation:null,admission})).rejects.toThrow('discharged stay');});
  it('records payment with trusted actor/time and makes identical retries idempotent',async()=>{
    const invoice=await create();const first=(await pay(invoice.id,'M-Pesa')).rows[0].saved;expect(first).toMatchObject({status:'Paid',payment_method:'M-Pesa',paid_by:actor});
    expect(first.paid_at).toBeTruthy();expect((await pay(invoice.id,'M-Pesa')).rows[0].saved).toEqual(first);
    await db.exec('reset role');expect((await db.query("select count(*)::int as n from audit_log where record_id=$1 and action='UPDATE'",[invoice.id])).rows[0].n).toBe(1);
  });
  it.each(['Admin','Cashier','Doctor','Nurse','Receptionist','Lab Technician','Pharmacist'])('restricts encounter payment for %s',async name=>{
    const inv=await create();await role(name);
    if(['Admin','Cashier'].includes(name))expect((await pay(inv.id)).rows[0].saved.status).toBe('Paid');
    else await expect(pay(inv.id)).rejects.toThrow(name==='Pharmacist'?'unavailable':'active billing');
  });
  it('denies an inactive cashier payment',async()=>{const inv=await create();await role('Cashier',false);await expect(pay(inv.id)).rejects.toThrow('active billing');});
  it('prevents direct changes to an already paid invoice',async()=>{const inv=await create();await pay(inv.id);await expect(db.query("update invoices set payment_method='Card' where id=$1",[inv.id])).rejects.toThrow('cannot be overwritten');});
  it('rejects a conflicting payment method',async()=>{const invoice=await create();await pay(invoice.id);await expect(pay(invoice.id,'Card')).rejects.toThrow('different payment');});
  it('rejects payment by a competing cashier after completion',async()=>{const invoice=await create();await pay(invoice.id);await role('Cashier');await expect(pay(invoice.id)).rejects.toThrow('different payment');});
  it('derives actor/time on legacy direct payment writes',async()=>{const invoice=await create();const saved=(await db.query("update invoices set status='Paid',payment_method='Cash',paid_by=$1,paid_at='1900-01-01' where id=$2 returning *",[randomUUID(),invoice.id])).rows[0];expect(saved.paid_by).toBe(actor);expect(saved.paid_at.getUTCFullYear()).toBeGreaterThan(2020);});
  it.each(['patient_id','total','created_by','created_at','sale_type'])('protects invoice %s during payment',async field=>{
    const inv=await create();const value=field==='total'?1:field.endsWith('_id')||field==='created_by'?randomUUID():field==='created_at'?'1900-01-01':'OTC';
    await expect(db.query(`update invoices set ${field}=$1 where id=$2`,[value,inv.id])).rejects.toThrow('cannot be changed');
  });
  it('prevents payment for legacy invoices with inconsistent totals',async()=>{
    const inv=await create();await db.exec('reset role');await db.query('update invoices set total=99 where id=$1',[inv.id]);await db.exec('set local role authenticated');await expect(pay(inv.id)).rejects.toThrow('inconsistent');
  });
  it('blocks direct clinical source mismatch and leaves billed flags unchanged',async()=>{
    const inv=await create({patient:otherPatient,consultation:otherConsultation,items:[{price_item_id:price,quantity:1}]});await db.exec('savepoint failure');
    await expect(db.query("insert into invoice_items(invoice_id,label,price_item_id,quantity,prescription_id) values ($1,'Forged',$2,1,$3)",[inv.id,medicine,rx])).rejects.toThrow('must belong');await db.exec('rollback to savepoint failure');expect((await db.query('select billed from prescriptions where id=$1',[rx])).rows[0].billed).toBe(false);
  });
  it('blocks duplicate clinical claims within a transaction',async()=>{await expect(create({items:[{price_item_id:medicine,quantity:1,prescription_id:rx},{price_item_id:medicine,quantity:1,prescription_id:rx}]})).rejects.toThrow('already billed');});
  it('keeps legacy catalogue-backed invoice item writes compatible',async()=>{
    const inv=(await db.query("insert into invoices(patient_id,consultation_id,total,created_by) values ($1,$2,3.3,$3) returning *",[patient,consultation,randomUUID()])).rows[0];expect(inv.created_by).toBe(actor);
    const line=(await db.query("insert into invoice_items(invoice_id,label,quantity,unit_price,amount,prescription_id) values ($1,'Synthetic medication',1,3.3,999,$2) returning *",[inv.id,rx])).rows[0];expect(Number(line.amount)).toBe(3.3);expect(line.price_item_id).toBe(medicine);expect((await pay(inv.id)).rows[0].saved.status).toBe('Paid');
  });
  it('supports a non-destructive rollback while retaining invoices and audits',async()=>{
    const inv=await create();await pay(inv.id);await db.exec('reset role');await db.exec(migration);await db.exec(read('../rollback/atomic_billing.sql').replace(/^begin;$/m,'').replace(/^commit;$/m,''));
    expect((await db.query('select status from invoices where id=$1',[inv.id])).rows[0].status).toBe('Paid');await db.exec('set local role authenticated');await expect(pay(inv.id)).rejects.toThrow('permission denied');
  });
  it('validates the hosted billing check script against the schema fixture',async()=>{
    await db.exec('reset role');await db.exec(read('billing.sql').replace(/^begin;$/m,'').replace(/^rollback;$/m,''));
  });
});

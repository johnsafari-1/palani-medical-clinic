// @vitest-environment node
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
let db,actor,patient,visit,request;
async function asRole(role='Doctor',active=true){
  await db.exec('reset role'); const id=randomUUID();await db.query('insert into auth.users(id) values($1)',[id]);
  await db.query("insert into staff(id,name,role,active) values($1,'Referral test fixture',$2,$3)",[id,role,active]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await db.exec('set local role authenticated');return id;
}
async function save(overrides={}){
  const p={patient,visit,request,facility:'Synthetic facility',doctor:'Synthetic receiving doctor',reason:'Synthetic reason',urgency:'Routine',notes:'Test notes',...overrides};
  await db.exec('savepoint rpc_call');
  try { const result=(await db.query('select save_outgoing_referral($1,$2,$3,$4,$5,$6,$7,$8) as saved',[p.patient,p.visit,p.request,p.facility,p.doctor,p.reason,p.urgency,p.notes])).rows[0].saved;await db.exec('release savepoint rpc_call');return result; }
  catch(error){await db.exec('rollback to savepoint rpc_call; release savepoint rpc_call');throw error;}
}
const count=async table=>Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n);
beforeAll(async()=>{db=new PGlite();await db.exec(read('fixtures/clinic-schema.sql'));for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort())await db.exec(read('../migrations/'+name));},30000);
beforeEach(async()=>{await db.exec('begin');actor=await asRole();await db.exec('reset role');patient=randomUUID();visit=randomUUID();request=randomUUID();await db.query("insert into patients(id,name,dob,gender,phone) values($1,'Referral test fixture','2000-01-01','Other','test')",[patient]);await db.query('insert into visits(id,patient_id) values($1,$2)',[visit,patient]);await db.exec('set local role authenticated');});
afterEach(async()=>{await db.exec('rollback');});afterAll(async()=>{await db.close();});
describe('atomic outgoing referrals',()=>{
  it('saves, derives actor/time, completes the linked visit and audits both once',async()=>{
    const first=await save(),second=await save();expect(first).toEqual(second);expect(first.created_by).toBe(actor);expect(first.visit_id).toBe(visit);expect(first.request_id).toBe(request);expect(first.request_hash).toBeUndefined();
    expect((await db.query('select status,completed_at from visits where id=$1',[visit])).rows[0]).toMatchObject({status:'Completed',completed_at:expect.any(Date)});
    await db.exec('reset role');expect(await count('referrals')).toBe(1);expect((await db.query("select table_name,staff_id,action from audit_log where record_id in ($1,$2) and table_name in ('referrals','visits') and ((table_name='referrals' and action='INSERT') or (table_name='visits' and action='UPDATE'))",[first.id,visit])).rows.filter(r=>r.staff_id===actor)).toHaveLength(2);
  });
  it('allows a walk-in referral without completing any unrelated queued visit',async()=>{const row=await save({visit:null});expect(row.visit_id).toBeNull();expect((await db.query('select status from visits where id=$1',[visit])).rows[0].status).toBe('Waiting');});
  it.each([{facility:'Changed'},{doctor:'Changed'},{reason:'Changed'},{notes:'Changed'},{urgency:'Urgent'},{visit:null},{patient:randomUUID()}])('rejects changed retry fields %#',async change=>{await save();await expect(save(change)).rejects.toThrow(/different referral/);});
  it('rejects another actor reusing a request',async()=>{await save();await asRole();await expect(save()).rejects.toThrow(/different referral/);});
  it.each(['Receptionist','Nurse','Pharmacist','Lab Technician','Cashier'])('denies outgoing saves for %s',async role=>{await asRole(role);await expect(save()).rejects.toThrow(/active Doctor/);});
  it('permits Admin',async()=>{actor=await asRole('Admin');expect((await save()).created_by).toBe(actor);});
  it('denies inactive and anonymous callers',async()=>{await asRole('Doctor',false);await expect(save()).rejects.toThrow();await db.exec('reset role; set local role anon');await expect(save()).rejects.toThrow(/permission denied/);});
  it.each([{facility:''},{facility:'x'.repeat(501)},{doctor:'x'.repeat(501)},{reason:' '},{reason:'x'.repeat(10001)},{notes:'x'.repeat(50001)},{urgency:'Invalid'},{urgency:null},{request:null},{patient:null}])('rejects invalid payload %#',async change=>{await expect(save(change)).rejects.toThrow();});
  it('rejects missing, wrong-patient and completed visits',async()=>{await expect(save({visit:randomUUID()})).rejects.toThrow(/Selected visit/);await expect(save({patient:randomUUID()})).rejects.toThrow(/Selected visit/);await save();await expect(save({request:randomUUID()})).rejects.toThrow(/completed/);});
  it('allows legacy referrals without invented request or visit links',async()=>{await db.exec('reset role');const row=(await db.query("insert into referrals(patient_id,direction,facility_name,reason) values($1,'Outgoing','Legacy','Legacy') returning visit_id,request_id,request_hash",[patient])).rows[0];expect(row).toEqual({visit_id:null,request_id:null,request_hash:null});});
  it('guards direct inserts and derives metadata, including incoming Reception records',async()=>{
    const other=randomUUID();await db.exec('reset role');await db.query("insert into auth.users(id) values($1)",[other]);await db.query("insert into staff(id,name,role) values($1,'Other','Doctor')",[other]);await db.exec('set local role authenticated');
    const row=(await db.query("insert into referrals(patient_id,direction,facility_name,reason,created_by,created_at,visit_id,request_id,request_hash) values($1,'Outgoing',' Direct ',' Direct ',$2,'2000-01-01',$3,$4,'spoof') returning *",[patient,other,visit,request])).rows[0];expect(row.created_by).toBe(actor);expect(row.created_at.getUTCFullYear()).toBeGreaterThan(2000);expect(row.request_hash).not.toBe('spoof');expect(row.facility_name).toBe('Direct');
    const reception=await asRole('Receptionist');const incoming=(await db.query("insert into referrals(patient_id,direction,facility_name,reason,created_by) values($1,'Incoming','Source','Reason',$2) returning *",[patient,other])).rows[0];expect(incoming.created_by).toBe(reception);expect(incoming.request_id).toBeNull();
    await expect(db.query("insert into referrals(patient_id,direction,facility_name,reason,request_id,visit_id) values($1,'Incoming','Source','Reason',$2,$3)",[patient,randomUUID(),visit])).rejects.toThrow(/Invalid referral/);
  });
  it('rolls back referral, visit and audits when referral audit storage fails',async()=>{
    await db.exec("reset role; create function public.reject_referral_audit() returns trigger language plpgsql as $$ begin if NEW.table_name='referrals' then raise exception 'Synthetic audit failure'; end if; return NEW; end $$; create trigger reject_referral_audit before insert on audit_log for each row execute function public.reject_referral_audit();");const before=await count('audit_log');await db.exec('set local role authenticated; savepoint failing');await expect(save()).rejects.toThrow(/Synthetic audit/);await db.exec('rollback to savepoint failing; reset role');expect(await count('referrals')).toBe(0);expect(await count('audit_log')).toBe(before);expect((await db.query('select status from visits where id=$1',[visit])).rows[0].status).toBe('Waiting');
  });
  it('rolls back when visit updates are denied',async()=>{await db.exec("reset role; drop policy visits_update_clinical on visits; set local role authenticated");await expect(save()).rejects.toThrow(/Selected visit|Visit completion/);await db.exec('reset role');expect(await count('referrals')).toBe(0);});
  it('blocks mutations even after future browser grants and policies',async()=>{const row=await save();await db.exec("reset role; grant update,delete on referrals to authenticated; create policy future_referral_update on referrals for update to authenticated using(true) with check(true); create policy future_referral_delete on referrals for delete to authenticated using(true); set local role authenticated");await db.exec('savepoint mutate');await expect(db.query("update referrals set reason='changed' where id=$1",[row.id])).rejects.toThrow(/correction workflow/);await db.exec('rollback to savepoint mutate');await expect(db.query('delete from referrals where id=$1',[row.id])).rejects.toThrow(/correction workflow/);await db.exec('rollback to savepoint mutate');await expect(db.exec('truncate referrals')).rejects.toThrow(/permission denied/);});
  it('rejects a second referral for a reopened linked visit',async()=>{await save();await db.exec('reset role');await db.query("update visits set status='Waiting',completed_at=null where id=$1",[visit]);await db.exec('set local role authenticated');await expect(save({request:randomUUID()})).rejects.toThrow(/unique/);expect((await db.query('select status from visits where id=$1',[visit])).rows[0].status).toBe('Waiting');});
  it('runs the hosted verification script without retaining its fixtures',async()=>{await db.exec('rollback');await db.exec(read('referrals.sql'));expect(await count('referrals')).toBe(0);expect(await count('patients')).toBe(0);expect(await count('staff')).toBe(0);});
  it('recovers without destroying records, links or guard protection',async()=>{await save();await db.exec('reset role');await db.exec(read('../rollback/atomic_referrals.sql'));await db.exec('set local role authenticated');await expect(save()).rejects.toThrow(/permission denied/);expect(await count('referrals')).toBe(1);});
});

import {describe,it,expect,vi} from 'vitest';
import {createCareSubmission} from './careSubmission';
const id='00000000-0000-4000-8000-000000000001',patient='00000000-0000-4000-8000-000000000002',actor='actor',request='00000000-0000-4000-8000-000000000003',at='2026-10-22T12:00:00Z';
const cases={
  checkin:{payload:{p_patient_id:patient,p_reason:''},data:{id,patient_id:patient,request_id:request,reason:'',status:'Waiting',checked_in_by:actor,checked_in_at:at}},
  start:{payload:{p_patient_id:patient,p_visit_id:id},data:{id,patient_id:patient,status:'In Consultation'}},
  admit:{payload:{p_patient_id:patient,p_visit_id:null,p_reason:'Reason'},data:{id,patient_id:patient,request_id:request,reason:'Reason',status:'Admitted',admitted_by:actor,admitted_at:at,visit_id:null}},
  discharge:{payload:{p_patient_id:patient,p_admission_id:id,p_visit_id:null},data:{id,patient_id:patient,status:'Discharged',discharged_by:actor,discharged_at:at,discharge_visit_id:null}},
};
describe('care submission confirmation and retries',()=>{
  it.each(Object.keys(cases))('confirms %s and never sends an actor/time',async action=>{const {payload,data}=cases[action],client={rpc:vi.fn(async()=>({data}))},s=createCareSubmission(client,()=>request);expect(await s.save(action,payload,actor)).toEqual(data);expect(s.hasPending()).toBe(false);expect(client.rpc.mock.calls[0][1]).not.toHaveProperty('actor');expect(client.rpc.mock.calls[0][1]).not.toHaveProperty('checked_in_at');});
  it.each(Object.keys(cases))('retains and replays the original %s request after transport loss',async action=>{const {payload,data}=cases[action],client={rpc:vi.fn().mockRejectedValueOnce(new Error('Lost')).mockResolvedValue({data})},s=createCareSubmission(client,()=>request);await expect(s.save(action,payload,actor)).rejects.toThrow();await expect(s.save(action,{...payload,p_patient_id:'other'},actor)).rejects.toThrow(/exact/);await expect(s.save(action,payload,'other')).rejects.toThrow(/exact/);await s.save(action,payload,actor);expect(client.rpc.mock.calls[0]).toEqual(client.rpc.mock.calls[1]);});
  it.each(Object.keys(cases))('rejects a mismatched %s response without clearing retry state',async action=>{const {payload,data}=cases[action],s=createCareSubmission({rpc:async()=>({data:{...data,patient_id:'other'}})},()=>request);await expect(s.save(action,payload,actor)).rejects.toThrow(/not be confirmed/);expect(s.hasPending()).toBe(true);});
  it.each(['08006','PGRST000',undefined])('retains uncertainty for %s',async code=>{const s=createCareSubmission({rpc:async()=>({error:{code}})},()=>request);await expect(s.save('checkin',cases.checkin.payload,actor)).rejects.toThrow();expect(s.hasPending()).toBe(true);});
  it('clears a definitely rejected request for correction',async()=>{const s=createCareSubmission({rpc:async()=>({error:{code:'23505',message:'Already checked in'}})},()=>request);await expect(s.save('checkin',cases.checkin.payload,actor)).rejects.toThrow(/Already checked in/);expect(s.hasPending()).toBe(false);});
});

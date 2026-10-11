import { describe, expect, it, vi } from "vitest";
import { allergyPayload, createAllergySubmission, newAllergy, validateAllergies, validAllergyReview } from "./allergySubmission";
const patient="00000000-0000-4000-8000-000000000001",doctor="00000000-0000-4000-8000-000000000002",request="00000000-0000-4000-8000-000000000003";
const draft={assessment:"unknown",allergies:[],reason:"Reviewed with patient"};
const payload=()=>allergyPayload(patient,null,draft);
const confirmed=args=>({id:"00000000-0000-4000-8000-000000000004",patient_id:args.p_patient_id,previous_id:args.p_previous_id,revision:1,assessment:args.p_assessment,allergies:args.p_allergies,change_reason:args.p_change_reason,request_id:args.p_request_id,recorded_by:doctor,recorded_at:"2026-10-11T13:00:00Z"});
describe("allergy submissions",()=>{
  it("requires a deliberate assessment and reason and derives no actor/time",()=>{
    expect(payload()).not.toHaveProperty("recorded_by");expect(payload()).not.toHaveProperty("recorded_at");
    expect(()=>allergyPayload(patient,null,{...draft,assessment:""})).toThrow();expect(()=>allergyPayload(patient,null,{...draft,reason:" "})).toThrow();
    expect(()=>allergyPayload("wrong",null,draft)).toThrow();
  });
  it("captures unknown reaction, mechanism/category and future risk without inventing certainty",()=>{
    const allergy={...newAllergy(),substance:"Synthetic substance"};expect(validateAllergies("known",[allergy])[0]).toMatchObject({verification_status:"unconfirmed",reaction:"",type:"",category:"",criticality:"unable-to-assess"});
  });
  it.each([{assessment:"known",allergies:[]},{assessment:"no_known",allergies:[{...newAllergy(),substance:"Recorded"}]},
    {assessment:"known",allergies:[{...newAllergy(),substance:"Recorded",verification_status:"entered-in-error"}]},
    {assessment:"known",allergies:[{...newAllergy(),substance:"Recorded",severity:"severe"}]},
    {assessment:"known",allergies:[{...newAllergy(),substance:"Recorded",category:"other"}]},
    {assessment:"known",allergies:[{...newAllergy(),substance:"Recorded",extra:true}]}])("rejects inconsistent/malformed draft %#",change=>{expect(()=>allergyPayload(patient,null,{...draft,...change})).toThrow();});
  it("retains exact identity for unknown transport outcomes and blocks changed drafts",async()=>{
    const client={rpc:vi.fn().mockRejectedValueOnce(new Error("Lost response"))};const submission=createAllergySubmission(client,()=>request);
    await expect(submission.save(payload(),0,doctor)).rejects.toThrow("Lost response");expect(submission.hasPending()).toBe(true);
    await expect(submission.save({...payload(),p_change_reason:"Changed"},0,doctor)).rejects.toThrow("exact unconfirmed");
    client.rpc.mockImplementation((_method,args)=>Promise.resolve({data:confirmed(args),error:null}));await submission.save(payload(),0,doctor);expect(client.rpc.mock.calls[0]).toEqual(client.rpc.mock.calls[1]);expect(submission.hasPending()).toBe(false);
  });
  it("keeps connection SQLSTATE errors unconfirmed but releases definite database rejections",async()=>{
    const client={rpc:vi.fn().mockResolvedValue({error:{code:"08006",message:"Connection lost"}})};const submission=createAllergySubmission(client,()=>request);
    await expect(submission.save(payload(),0,doctor)).rejects.toThrow();expect(submission.hasPending()).toBe(true);
    client.rpc.mockResolvedValue({error:{code:"40001",message:"Changed"}});await expect(submission.save(payload(),0,doctor)).rejects.toThrow("Changed");expect(submission.hasPending()).toBe(false);
  });
  it.each([{revision:5},{recorded_by:patient},{assessment:"no_known"},{previous_id:patient},{change_reason:"Different"},{request_id:patient},{allergies:[{}]}])("refuses a mismatched confirmation %#",async changes=>{
    const client={rpc:vi.fn().mockImplementation((_method,args)=>Promise.resolve({data:{...confirmed(args),...changes},error:null}))};const submission=createAllergySubmission(client,()=>request);
    await expect(submission.save(payload(),0,doctor)).rejects.toThrow("not be confirmed");expect(submission.hasPending()).toBe(true);
  });
  it("compares JSON values independently of Postgres key ordering",async()=>{
    const allergy={...newAllergy(),substance:"Synthetic substance"},args=allergyPayload(patient,null,{...draft,assessment:"known",allergies:[allergy]});
    const client={rpc:vi.fn().mockImplementation((_method,sent)=>Promise.resolve({data:{...confirmed(sent),allergies:[Object.fromEntries(Object.entries(allergy).reverse())]},error:null}))};
    await expect(createAllergySubmission(client,()=>request).save(args,0,doctor)).resolves.toHaveProperty("revision",1);
  });
  it("rejects unavailable or wrong-patient histories",()=>{expect(validAllergyReview(confirmed({...payload(),p_request_id:request}),patient)).toBe(true);expect(validAllergyReview({},patient)).toBe(false);expect(validAllergyReview(confirmed({...payload(),p_request_id:request}),doctor)).toBe(false);});
});

import React from "react";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { act,cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import AllergyPanel from "./AllergyPanel";
import { supabase } from "../supabaseClient";
vi.mock("../supabaseClient",()=>({supabase:{from:vi.fn(),rpc:vi.fn()}}));
const patient="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000009",staff={id:"00000000-0000-4000-8000-000000000002",role:"Doctor"};
const review=(args={},revision=1)=>({id:"00000000-0000-4000-8000-000000000004",patient_id:patient,previous_id:null,revision,assessment:"unknown",allergies:[],change_reason:"Earlier assessment",recorded_by:staff.id,request_id:"00000000-0000-4000-8000-000000000003",recorded_at:"2026-10-11T13:00:00Z",...args});
const confirmed=args=>review({patient_id:args.p_patient_id,previous_id:args.p_previous_id,assessment:args.p_assessment,allergies:args.p_allergies,change_reason:args.p_change_reason,request_id:args.p_request_id});
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
let rows,error,delayed;
beforeEach(()=>{
  rows=[];error=null;delayed=null;supabase.rpc.mockReset();supabase.from.mockImplementation(()=>{let patientId;const query={select:()=>query,eq:(_column,value)=>{patientId=value;return query;},order:()=>query,limit:()=>query,
    then:(resolve,reject)=>(delayed&&patientId===patient?delayed.promise:Promise.resolve({data:rows,error})).then(resolve,reject)};return query;});
});afterEach(cleanup);
async function start(props={}) {render(<AllergyPanel patientId={patient} staff={staff} {...props}/>);fireEvent.click(await screen.findByRole("button",{name:"Record allergy assessment"}));fireEvent.change(screen.getByLabelText("Assessment"),{target:{value:"unknown"}});fireEvent.change(screen.getByLabelText("Review / correction reason"),{target:{value:"Reviewed with patient"}});}
it("distinguishes not assessed, reviewed unknown and no known allergies",async()=>{
  const view=render(<AllergyPanel patientId={patient} staff={staff}/>);expect(await screen.findByText("Not assessed — allergy status unknown")).toBeTruthy();expect(screen.queryByText("No known allergies reported")).toBeNull();
  rows=[review()];fireEvent.click(screen.getByRole("button",{name:"Refresh allergies"}));expect(await screen.findByText("Allergy status unknown")).toBeTruthy();
  rows=[review({assessment:"no_known"})];fireEvent.click(screen.getByRole("button",{name:"Refresh allergies"}));expect(await screen.findByText("No known allergies reported")).toBeTruthy();view.unmount();
});
it("does not present failed/malformed reads as unknown or allergy-free and supports retry",async()=>{
  error={message:"Failed"};const available=vi.fn();render(<AllergyPanel patientId={patient} staff={staff} onAvailabilityChange={available}/>);expect(await screen.findByRole("alert")).toBeTruthy();expect(screen.queryByText("Not assessed — allergy status unknown")).toBeNull();
  expect(screen.getByRole("button",{name:"Record allergy assessment"}).disabled).toBe(true);rows=[{}];error=null;fireEvent.click(screen.getByRole("button",{name:"Refresh allergies"}));await waitFor(()=>expect(screen.getByRole("button",{name:"Refresh allergies"}).disabled).toBe(false));expect(available).not.toHaveBeenCalledWith(true);
  rows=[];fireEvent.click(screen.getByRole("button",{name:"Refresh allergies"}));expect(await screen.findByText("Not assessed — allergy status unknown")).toBeTruthy();expect(available).toHaveBeenCalledWith(true);
});
it("saves once and clears only a confirmed draft with attributed identity",async()=>{
  const pending=defer(),lock=vi.fn();supabase.rpc.mockReturnValue(pending.promise);await start({onPendingChange:lock});const form=screen.getByRole("button",{name:"Save allergy review"}).closest("form");fireEvent.submit(form);fireEvent.submit(form);
  expect(supabase.rpc).toHaveBeenCalledTimes(1);expect(lock).toHaveBeenCalledWith(true);expect(screen.getByLabelText("Assessment").closest("fieldset").disabled).toBe(true);
  await act(async()=>pending.resolve({data:confirmed(supabase.rpc.mock.calls[0][1]),error:null}));expect(await screen.findByText("Allergy review saved as revision 1.")).toBeTruthy();expect(screen.queryByLabelText("Assessment")).toBeNull();expect(lock).toHaveBeenLastCalledWith(false);
});
it("freezes a lost response and retries the exact draft with the original request ID",async()=>{
  supabase.rpc.mockRejectedValueOnce(new Error("Connection lost")).mockImplementationOnce((_method,args)=>Promise.resolve({data:confirmed(args),error:null}));await start();fireEvent.click(screen.getByRole("button",{name:"Save allergy review"}));
  const retry=await screen.findByRole("button",{name:"Retry allergy save"});expect(screen.getByRole("button",{name:"Discard allergy draft"}).disabled).toBe(true);expect(screen.getByLabelText("Assessment").closest("fieldset").disabled).toBe(true);
  fireEvent.click(retry);expect(await screen.findByText("Allergy review saved as revision 1.")).toBeTruthy();expect(supabase.rpc.mock.calls[0]).toEqual(supabase.rpc.mock.calls[1]);
});
it("keeps a rejected draft editable and requires explicit conflict reconciliation",async()=>{
  supabase.rpc.mockResolvedValue({error:{code:"40001",message:"Allergy review changed"}});await start();fireEvent.click(screen.getByRole("button",{name:"Save allergy review"}));expect(await screen.findByText("Allergy review changed")).toBeTruthy();
  expect(screen.getByLabelText("Review / correction reason").value).toBe("Reviewed with patient");expect(screen.queryByRole("button",{name:"Save allergy review"})).toBeNull();
  rows=[review()];fireEvent.click(screen.getByRole("button",{name:"Refresh allergies"}));const accept=screen.getByRole("button",{name:"Use refreshed revision with my draft"});await waitFor(()=>expect(accept.disabled).toBe(false));fireEvent.click(accept);
  expect(screen.getByRole("button",{name:"Save allergy review"}).disabled).toBe(false);expect(screen.getByLabelText("Review / correction reason").value).toBe("Reviewed with patient");
});
it("allows corrections without silently removing a saved allergy record",async()=>{
  const allergy={id:crypto.randomUUID(),substance:"Synthetic substance",reaction:"",severity:"",criticality:"unable-to-assess",category:"",type:"",clinical_status:"active",verification_status:"unconfirmed",note:""};rows=[review({assessment:"known",allergies:[allergy]})];
  render(<AllergyPanel patientId={patient} staff={staff}/>);fireEvent.click(await screen.findByRole("button",{name:"Review / correct allergies"}));expect(screen.queryByRole("button",{name:/Remove unsaved record/})).toBeNull();
  fireEvent.change(screen.getByLabelText("Verification 1"),{target:{value:"entered-in-error"}});expect(screen.getByLabelText("Clinical status 1").disabled).toBe(true);expect(screen.getByLabelText("Clinical status 1").value).toBe("");
});
it("discards earlier patient responses and drafts on patient-keyed remount",async()=>{
  delayed=defer();const view=render(<AllergyPanel patientId={patient} staff={staff}/>);view.rerender(<AllergyPanel patientId={other} staff={staff}/>);expect(await screen.findByText("Not assessed — allergy status unknown")).toBeTruthy();
  await act(async()=>delayed.resolve({data:[review({assessment:"no_known"})],error:null}));expect(screen.queryByText("No known allergies reported")).toBeNull();
});
it.each(["Nurse","Pharmacist","Cashier"])("does not offer %s edit controls",async role=>{render(<AllergyPanel patientId={patient} staff={{...staff,role}} readOnly/>);await screen.findByText("Not assessed — allergy status unknown");expect(screen.queryByRole("button",{name:"Record allergy assessment"})).toBeNull();});

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import PharmacyDashboard from "./PharmacyDashboard";
import LabDashboard from "./LabDashboard";
import { useClinicalQueue } from "../clinical/useClinicalQueue";
import { supabase } from "../supabaseClient";
vi.mock("../supabaseClient",()=>({supabase:{from:vi.fn(),rpc:vi.fn()}}));
vi.mock("./Header",()=>({default:()=> <header>Clinical dashboard</header>}));
const prescription={id:"rx",drug:"Synthetic medicine",dosage:"Test dose",instructions:"Test instructions",dispensed:false,consultations:{patient_id:"00000000-0000-4000-8000-000000000001",patients:{name:"Synthetic patient",code:"PT-TEST"}}};
const lab={id:"lab",test_name:"Synthetic lab",status:"Pending",code:"LB-TEST",patients:{name:"Synthetic patient",code:"PT-TEST"}};
const staff={id:"staff",name:"Synthetic staff",role:"Admin"};
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
let response, allergyFailure;
beforeEach(()=>{
  response=null;allergyFailure=false;supabase.rpc.mockReset();
  supabase.from.mockImplementation(table=>{
    const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,
      then:(resolve,reject)=>(table==="patient_allergy_reviews" ? Promise.resolve(allergyFailure?{data:null,error:{message:"Unavailable"}}:{data:[],error:null}) : response || Promise.resolve({data:[table==="prescriptions"?prescription:lab],error:null})).then(resolve,reject)};
    return query;
  });
});
afterEach(cleanup);
describe("pharmacy completion",()=>{
  it("blocks dispensing on unavailable allergy history and enables it after a successful refresh",async()=>{
    allergyFailure=true;render(<PharmacyDashboard staff={staff}/>);
    await screen.findByText("Allergy history unavailable. Retry before relying on this status.");
    expect(screen.getByRole("button",{name:"Mark dispensed"}).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Mark dispensed"}));expect(supabase.rpc).not.toHaveBeenCalled();
    allergyFailure=false;fireEvent.click(screen.getByRole("button",{name:"Refresh allergies"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Mark dispensed"}).disabled).toBe(false));
  });
  it("records only confirmed dispensing and ignores duplicate clicks",async()=>{
    const pending=defer();supabase.rpc.mockReturnValue(pending.promise);
    render(<PharmacyDashboard staff={staff}/>);
    const button=await screen.findByRole("button",{name:"Mark dispensed"});
    await waitFor(()=>expect(button.disabled).toBe(false));
    fireEvent.click(button);fireEvent.click(button);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("dispense_prescription",{p_prescription_id:"rx"});
    expect(screen.queryByText("Dispensing recorded.")).toBeNull();
    await act(async()=>pending.resolve({data:{id:"rx",dispensed:true,dispensed_by:"server-staff",dispensed_at:"2026-10-11T06:00:00Z"},error:null}));
    expect(await screen.findByText("Dispensing recorded.")).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Mark dispensed"})).toBeNull();
  });
  it("keeps pending rows when a write fails",async()=>{
    supabase.rpc.mockResolvedValue({data:null,error:{code:"42501",message:"Synthetic permission failure"}});
    render(<PharmacyDashboard staff={staff}/>);
    await waitFor(()=>expect(screen.getByRole("button",{name:"Mark dispensed"}).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button",{name:"Mark dispensed"}));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent","Synthetic permission failure");
    expect(screen.getByRole("button",{name:"Mark dispensed"}).disabled).toBe(false);
    expect(screen.queryByText("Dispensing recorded.")).toBeNull();
  });
  it("retains the snapshot but blocks writes when refresh fails",async()=>{
    render(<PharmacyDashboard staff={staff}/>);
    await screen.findByRole("button",{name:"Mark dispensed"});
    response=Promise.resolve({data:null,error:{message:"Synthetic read failure"}});
    fireEvent.click(screen.getByRole("button",{name:"Refresh queue"}));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Synthetic medicine/)).toBeTruthy();
    expect(screen.getByRole("button",{name:"Mark dispensed"}).disabled).toBe(true);
    response=Promise.resolve({data:[prescription],error:null});
    fireEvent.click(screen.getByRole("button",{name:"Retry queue"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Mark dispensed"}).disabled).toBe(false));
  });
});
describe("lab completion",()=>{
  it("keeps a rejected result draft editable and never shows false success",async()=>{
    supabase.rpc.mockResolvedValue({data:null,error:{code:"22023",message:"Synthetic invalid result"}});
    render(<LabDashboard staff={staff}/>);
    fireEvent.change(await screen.findByPlaceholderText("Enter result"),{target:{value:"Synthetic draft"}});
    fireEvent.click(screen.getByRole("button",{name:"Mark complete"}));
    expect(await screen.findByText("Synthetic invalid result")).toBeTruthy();
    expect(screen.getByPlaceholderText("Enter result").value).toBe("Synthetic draft");
    expect(screen.getByPlaceholderText("Enter result").disabled).toBe(false);
    expect(screen.queryByText("Lab result recorded.")).toBeNull();
  });
  it("retries a lost response with the original frozen result",async()=>{
    supabase.rpc.mockRejectedValueOnce(new Error("Synthetic lost response")).mockResolvedValueOnce({data:{id:"lab",status:"Completed",result:"Synthetic draft",completed_by:"server-staff",completed_at:"2026-10-11T06:00:00Z"},error:null});
    render(<LabDashboard staff={staff}/>);
    fireEvent.change(await screen.findByPlaceholderText("Enter result"),{target:{value:"Synthetic draft"}});
    fireEvent.click(screen.getByRole("button",{name:"Mark complete"}));
    const retry=await screen.findByRole("button",{name:"Retry completion"});
    expect(screen.getByPlaceholderText("Enter result").disabled).toBe(true);
    expect(screen.getByRole("button",{name:"Refresh queue"}).disabled).toBe(true);
    fireEvent.click(retry);
    expect(await screen.findByText("Lab result recorded.")).toBeTruthy();
    expect(supabase.rpc.mock.calls[0]).toEqual(supabase.rpc.mock.calls[1]);
    expect(supabase.rpc).toHaveBeenCalledWith("complete_lab_order",{p_order_id:"lab",p_result:"Synthetic draft"});
  });
  it("preserves a conflicting draft when refreshing a completed order",async()=>{
    supabase.rpc.mockResolvedValue({data:null,error:{code:"P0001",message:"Already completed by another staff member"}});
    render(<LabDashboard staff={staff}/>);
    fireEvent.change(await screen.findByPlaceholderText("Enter result"),{target:{value:"Conflicting draft"}});
    fireEvent.click(screen.getByRole("button",{name:"Mark complete"}));
    await screen.findByText("Already completed by another staff member");
    response=Promise.resolve({data:[{...lab,status:"Completed",result:"Saved result"}],error:null});
    fireEvent.click(screen.getByRole("button",{name:"Refresh queue"}));
    expect(await screen.findByText("Result: Saved result")).toBeTruthy();
    expect(screen.getByText("Unsubmitted draft (not saved): Conflicting draft")).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Mark complete"})).toBeNull();
  });
  it("does not clear a draft or report success for an invalid response",async()=>{
    supabase.rpc.mockResolvedValue({data:{id:"different-order",status:"Completed"},error:null});
    render(<LabDashboard staff={staff}/>);
    fireEvent.change(await screen.findByPlaceholderText("Enter result"),{target:{value:"Synthetic draft"}});
    fireEvent.click(screen.getByRole("button",{name:"Mark complete"}));
    await screen.findByRole("button",{name:"Retry completion"});
    expect(screen.getByPlaceholderText("Enter result").value).toBe("Synthetic draft");
    expect(screen.queryByText("Lab result recorded.")).toBeNull();
  });
  it("requires a result before sending a completion",async()=>{
    render(<LabDashboard staff={staff}/>);
    fireEvent.click(await screen.findByRole("button",{name:"Mark complete"}));
    expect(screen.getByText("Enter a result before completing the order.")).toBeTruthy();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
describe("clinical queue reads",()=>{
  it("does not describe an unavailable queue as empty",async()=>{
    response=Promise.resolve({data:null,error:{message:"Synthetic failure"}});
    render(<LabDashboard staff={staff}/>);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No pending test orders.")).toBeNull();
    expect(screen.queryByText("No completed tests yet.")).toBeNull();
  });
  it("discards stale read responses",async()=>{
    const first=defer(),second=defer();response=first.promise;
    const {result}=renderHook(()=>useClinicalQueue("lab_orders","*","ordered_at"));
    response=second.promise;
    await act(async()=>{result.current.reload();});
    await act(async()=>second.resolve({data:[{...lab,test_name:"New snapshot"}],error:null}));
    await act(async()=>first.resolve({data:[{...lab,test_name:"Old snapshot"}],error:null}));
    expect(result.current.rows[0].test_name).toBe("New snapshot");
  });
});

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DoctorDashboard from "./DoctorDashboard";
import { supabase } from "../supabaseClient";

vi.mock("../supabaseClient", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("./Header", () => ({ default: () => <header>Doctor dashboard</header> }));
const patients = [
  { id: "patient-a", name: "Synthetic Alice", code: "PT-A", dob: "2000-01-01", gender: "Other", phone: "test" },
  { id: "patient-b", name: "Synthetic Bob", code: "PT-B", dob: "2001-01-01", gender: "Other", phone: "test" },
];
let historyFailure, historyDeferred, allergyFailure, testPatients, savedReferrals, referralSave, referralInsert, queueItems;
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => {
  historyFailure = false; historyDeferred = null; allergyFailure = false; testPatients = patients;
  savedReferrals = []; queueItems = []; referralSave = null; referralInsert = vi.fn();
  supabase.rpc.mockReset();
  supabase.from.mockImplementation(table => {
    let patientId, single = false, inserting = false;
    const query = {
      select: () => query, order: () => query, in: () => query, limit: () => query, range: () => query,
      insert: payload => { inserting = true; referralInsert(payload); return query; },
      single: () => { single = true; return query; },
      eq: (column, value) => { if (column === "patient_id") patientId = value; return query; },
      maybeSingle: () => { single = true; return query; },
      then: (resolve, reject) => {
        if (table === "staff") return Promise.resolve({data:{id:"doctor",role:"Doctor",active:true}}).then(resolve,reject);
        if (table === "referrals" && inserting) return referralSave.promise.then(resolve,reject);
        if (table === "consultations" && historyDeferred && patientId === "patient-a") {
          return historyDeferred.promise.then(resolve, reject);
        }
        const result = (table === "consultations" && historyFailure) || (table === "patient_allergy_reviews" && allergyFailure)
          ? { data: null, error: { message: "Synthetic failure" } }
          : { data: table === "patients" ? testPatients : table === "visits" ? queueItems : table === "referrals" ? (single ? savedReferrals[0] : savedReferrals) : single ? null : [], error: null, count: 0 };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  });
});
afterEach(cleanup);
async function selectAlice() {
  render(<DoctorDashboard staff={{ id: "doctor", name: "Synthetic Doctor", role: "Doctor" }} onLogout={() => {}} />);
  fireEvent.click(await screen.findByText("Synthetic Alice"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save consultation" }).disabled).toBe(false));
  fireEvent.change(screen.getByPlaceholderText("e.g. Acute malaria"), { target: { value: "Synthetic diagnosis" } });
}
describe("doctor consultation submission", () => {
  it("blocks new consultation writes while allergy history is unavailable", async () => {
    allergyFailure = true;
    render(<DoctorDashboard staff={{ id: "doctor", role: "Doctor" }} onLogout={() => {}} />);
    fireEvent.click(await screen.findByText("Synthetic Alice"));
    expect(await screen.findByText("Allergy history unavailable. Retry before relying on this status.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save consultation" }).disabled).toBe(true);
    allergyFailure = false; fireEvent.click(screen.getByRole("button", { name: "Refresh allergies" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save consultation" }).disabled).toBe(false));
  });
  it("locks patient changes and consultation writes during an unconfirmed allergy submission", async () => {
    testPatients = patients.map((p,i) => ({...p,id:`00000000-0000-4000-8000-00000000000${i+1}`}));
    supabase.rpc.mockRejectedValue(new Error("Lost allergy response"));
    render(<DoctorDashboard staff={{ id: "00000000-0000-4000-8000-000000000003", role: "Doctor" }} onLogout={() => {}} />);
    fireEvent.click(await screen.findByText("Synthetic Alice"));
    const start = await screen.findByRole("button", { name: "Record allergy assessment" });
    await waitFor(() => expect(start.disabled).toBe(false)); fireEvent.click(start);
    fireEvent.change(screen.getByLabelText("Assessment"), {target:{value:"unknown"}});
    fireEvent.change(screen.getByLabelText("Review / correction reason"), {target:{value:"Initial review"}});
    fireEvent.click(screen.getByRole("button", { name: "Save allergy review" }));
    await screen.findByRole("button", { name: "Retry allergy save" });
    fireEvent.click(screen.getByText("Synthetic Bob"));
    expect(screen.getAllByText("Synthetic Alice")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Save consultation" }).disabled).toBe(true);
  });
  it("uses one RPC and only clears the draft after confirmation", async () => {
    const result = defer();
    supabase.rpc.mockReturnValue(result.promise);
    await selectAlice();
    const form = screen.getByRole("button", { name: "Save consultation" }).closest("form");
    fireEvent.submit(form); fireEvent.submit(form);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc.mock.calls[0]).toEqual(["save_clinical_consultation", expect.objectContaining({
      p_patient_id: "patient-a", p_visit_id: null, p_diagnosis: "Synthetic diagnosis", p_request_id: expect.any(String),
    })]);
    fireEvent.click(screen.getByText("Synthetic Bob"));
    expect(screen.getAllByText("Synthetic Alice")).toHaveLength(2);
    expect(screen.getByPlaceholderText("e.g. Acute malaria").value).toBe("Synthetic diagnosis");
    await act(async () => result.resolve({ data: { id: "saved", code: "CN-TEST" }, error: null }));
    expect(await screen.findByText("Consultation saved as CN-TEST")).toBeTruthy();
    expect(screen.getByPlaceholderText("e.g. Acute malaria").value).toBe("");
  });
  it("retains the draft and allows correction after a database rejection", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "Invalid visit" } });
    await selectAlice();
    fireEvent.click(screen.getByRole("button", { name: "Save consultation" }));
    expect(await screen.findByText("Invalid visit")).toBeTruthy();
    expect(screen.getByPlaceholderText("e.g. Acute malaria").value).toBe("Synthetic diagnosis");
    expect(screen.getByPlaceholderText("e.g. Acute malaria").disabled).toBe(false);
    expect(screen.queryByText(/Consultation saved as/)).toBeNull();
  });
  it("freezes and retries an unconfirmed save using its original ID", async () => {
    supabase.rpc.mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValueOnce({ data: { id: "saved", code: "CN-RETRY" }, error: null });
    await selectAlice();
    fireEvent.click(screen.getByRole("button", { name: "Save consultation" }));
    const retry = await screen.findByRole("button", { name: "Retry consultation save" });
    expect(screen.getByPlaceholderText("e.g. Acute malaria").closest("fieldset").disabled).toBe(true);
    fireEvent.click(retry);
    expect(await screen.findByText("Consultation saved as CN-RETRY")).toBeTruthy();
    expect(supabase.rpc.mock.calls[0][1]).toEqual(supabase.rpc.mock.calls[1][1]);
  });
  it("blocks saving and shows unavailable history on query failure", async () => {
    historyFailure = true;
    render(<DoctorDashboard staff={{ id: "doctor", name: "Synthetic Doctor", role: "Doctor" }} onLogout={() => {}} />);
    fireEvent.click(await screen.findByText("Synthetic Alice"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save consultation" }).disabled).toBe(true);
    expect(screen.queryByText("No previous consultations for this patient.")).toBeNull();
    expect(screen.queryByText("No vitals recorded for this patient yet.")).toBeNull();
    historyFailure = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save consultation" }).disabled).toBe(false));
  });
  it("ignores an earlier patient's history response after switching patients", async () => {
    historyDeferred = defer();
    render(<DoctorDashboard staff={{ id: "doctor", name: "Synthetic Doctor", role: "Doctor" }} onLogout={() => {}} />);
    fireEvent.click(await screen.findByText("Synthetic Alice"));
    fireEvent.click(screen.getByText("Synthetic Bob"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save consultation" }).disabled).toBe(false));
    await act(async () => historyDeferred.resolve({ data: [{ id: "old", diagnosis: "Alice-only diagnosis", prescriptions: [] }], error: null }));
    expect(screen.queryByText("Alice-only diagnosis")).toBeNull();
    expect(screen.getAllByText("Synthetic Bob")).toHaveLength(2);
  });
});

const savedReferral = { id: "00000000-0000-4000-8000-000000000010", visit_id:null, referring_doctor:"",notes:"",urgency:"Routine", patient_id: "patient-a", direction: "Outgoing", code: "REF-TEST", created_by: "doctor", facility_name: "Synthetic Facility", reason: "Synthetic reason", created_at: "2026-10-11T10:00:00Z" };
const printWindow = () => ({ opener:{},closed:false,document:{open:vi.fn(),write:vi.fn(),close:vi.fn()},focus:vi.fn(),print:vi.fn(),close:vi.fn() });
async function saveReferral() {
  referralSave = defer(); supabase.rpc.mockReturnValue(referralSave.promise); await selectAlice();
  fireEvent.click(screen.getByRole('button',{name:'Refer to another facility'}));
  fireEvent.change(screen.getByPlaceholderText('Facility name'),{target:{value:'Synthetic Facility'}});
  fireEvent.change(screen.getByPlaceholderText('Reason for referral'),{target:{value:'Synthetic reason'}});
  const form = screen.getByRole('button',{name:'Save referral'}).closest('form');
  fireEvent.submit(form); fireEvent.submit(form);
  expect(referralInsert).not.toHaveBeenCalled(); expect(supabase.rpc).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText('Synthetic Bob'));expect(screen.getAllByText('Synthetic Alice')).toHaveLength(2);
  const result={...savedReferral,request_id:supabase.rpc.mock.calls[0][1].p_request_id};
  savedReferrals = [result];
  await act(async()=>referralSave.resolve({data:result,error:null}));
  return screen.findByRole('button',{name:'Print saved referral'});
}
describe('saved referral printing',()=>{
  it('saves once then retries a blocked popup without inserting another referral',async()=>{
    vi.spyOn(window,'open').mockReturnValue(null);
    const button = await saveReferral();expect(window.open).not.toHaveBeenCalled();
    fireEvent.click(button);expect(await screen.findByText(/Letter not printed: Allow popups/)).toBeTruthy();
    const win=printWindow();window.open.mockReturnValue(win);fireEvent.click(button);
    await waitFor(()=>expect(win.print).toHaveBeenCalledOnce());expect(referralInsert).not.toHaveBeenCalled();expect(supabase.rpc).toHaveBeenCalledOnce();
    expect(win.opener).toBeNull();expect(win.document.write.mock.calls.at(-1)[0]).toContain('Not assessed — allergy status unknown');
  });
  it('blocks printing after a failed fresh clinical read and supports print-only retry',async()=>{
    const button=await saveReferral(),win=printWindow();vi.spyOn(window,'open').mockReturnValue(win);
    historyFailure=true;fireEvent.click(button);
    expect(await screen.findByText(/Letter not printed/)).toBeTruthy();expect(win.print).not.toHaveBeenCalled();expect(win.close).toHaveBeenCalledOnce();
    historyFailure=false;const retryWin=printWindow();window.open.mockReturnValue(retryWin);fireEvent.click(button);
    await waitFor(()=>expect(retryWin.print).toHaveBeenCalledOnce());expect(referralInsert).not.toHaveBeenCalled();expect(supabase.rpc).toHaveBeenCalledOnce();
  });
  it('locks patient switching during print preparation and closes on unmount',async()=>{
    const button=await saveReferral(),win=printWindow();vi.spyOn(window,'open').mockReturnValue(win);historyDeferred=defer();
    fireEvent.click(button);fireEvent.click(screen.getByText('Synthetic Bob'));expect(screen.getAllByText('Synthetic Alice')).toHaveLength(2);
    cleanup();await act(async()=>historyDeferred.resolve({data:[],count:0}));expect(win.print).not.toHaveBeenCalled();expect(win.close).toHaveBeenCalledOnce();
  });
});

describe('atomic referral retry UI',()=>{
  async function openReferral(){ await selectAlice();fireEvent.click(screen.getByRole('button',{name:'Refer to another facility'}));fireEvent.change(screen.getByLabelText('Receiving facility'),{target:{value:'Synthetic Facility'}});fireEvent.change(screen.getByLabelText('Referral reason'),{target:{value:'Synthetic reason'}}); }
  it('freezes an unknown outcome, locks other writes and retries the original request',async()=>{
    supabase.rpc.mockRejectedValueOnce(new Error('Lost response')).mockImplementationOnce(async(name,p)=>({data:{...savedReferral,request_id:p.p_request_id},error:null}));
    await openReferral();fireEvent.click(screen.getByRole('button',{name:'Save referral'}));
    const retry=await screen.findByRole('button',{name:'Retry referral save'});
    expect(screen.getByLabelText('Receiving facility').closest('fieldset').disabled).toBe(true);
    fireEvent.click(screen.getByText('Synthetic Bob'));expect(screen.getAllByText('Synthetic Alice')).toHaveLength(2);
    expect(screen.getByRole('button',{name:'Save consultation'}).disabled).toBe(true);
    historyFailure=true;fireEvent.click(retry);await screen.findByRole('button',{name:'Print saved referral'});
    expect(supabase.rpc.mock.calls[0][1]).toEqual(supabase.rpc.mock.calls[1][1]);expect(referralInsert).not.toHaveBeenCalled();
  });
  it('retains an editable draft after a definite rejection',async()=>{
    supabase.rpc.mockResolvedValue({data:null,error:{code:'22023',message:'Visit completed'}});await openReferral();fireEvent.click(screen.getByRole('button',{name:'Save referral'}));
    expect(await screen.findByText('Visit completed')).toBeTruthy();expect(screen.getByLabelText('Receiving facility').value).toBe('Synthetic Facility');expect(screen.getByLabelText('Receiving facility').closest('fieldset').disabled).toBe(false);expect(screen.queryByRole('button',{name:'Retry referral save'})).toBeNull();
  });
  it('sends only the explicitly selected queue visit, with no browser actor or timestamps',async()=>{
    queueItems=[{id:'visit-a',patient_id:'patient-a',status:'In Consultation',patients:{id:'patient-a',name:'Synthetic Alice',code:'PT-A'}}];
    supabase.rpc.mockImplementation(async(name,p)=>({data:{...savedReferral,visit_id:'visit-a',request_id:p.p_request_id},error:null}));
    render(<DoctorDashboard staff={{id:'doctor',role:'Doctor'}} onLogout={()=>{}}/>);
    fireEvent.click((await screen.findByText('In Consultation')).closest('.wl-row'));await waitFor(()=>expect(screen.getByRole('button',{name:'Save consultation'}).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Refer to another facility'}));fireEvent.change(screen.getByLabelText('Receiving facility'),{target:{value:'Synthetic Facility'}});fireEvent.change(screen.getByLabelText('Referral reason'),{target:{value:'Synthetic reason'}});fireEvent.click(screen.getByRole('button',{name:'Save referral'}));
    await screen.findByRole('button',{name:'Print saved referral'});expect(supabase.rpc.mock.calls[0][0]).toBe('save_outgoing_referral');expect(supabase.rpc.mock.calls[0][1]).toEqual({p_patient_id:'patient-a',p_visit_id:'visit-a',p_request_id:expect.any(String),p_facility_name:'Synthetic Facility',p_referring_doctor:'',p_reason:'Synthetic reason',p_urgency:'Routine',p_notes:''});
  });
});

describe('ward action recovery',()=>{
  const admissionId='00000000-0000-4000-8000-000000000011';
  it('retains an uncertain admission and retries exactly without allowing patient changes',async()=>{
    supabase.rpc.mockRejectedValueOnce(new Error('Lost care response')).mockImplementationOnce(async(name,p)=>({data:{id:admissionId,patient_id:p.p_patient_id,visit_id:p.p_visit_id,request_id:p.p_request_id,reason:p.p_reason,status:'Admitted',admitted_by:'doctor',admitted_at:'2026-10-22T12:00:00Z'}}));
    await selectAlice();fireEvent.change(screen.getByPlaceholderText('Reason for admission (optional)'),{target:{value:'Synthetic reason'}});fireEvent.click(screen.getByRole('button',{name:'Admit to ward'}));
    const retry=await screen.findByRole('button',{name:'Retry care action'});expect(screen.getByRole('button',{name:'Save consultation'}).disabled).toBe(true);fireEvent.click(screen.getByText('Synthetic Bob'));expect(screen.getAllByText('Synthetic Alice')).toHaveLength(2);fireEvent.click(retry);
    await waitFor(()=>expect(screen.queryByRole('button',{name:'Retry care action'})).toBeNull());expect(supabase.rpc.mock.calls[0]).toEqual(supabase.rpc.mock.calls[1]);expect(supabase.rpc.mock.calls[0][0]).toBe('admit_clinic_patient');expect(supabase.rpc.mock.calls[0][1].p_visit_id).toBeNull();
  });
  it('keeps an editable ward reason after rejection',async()=>{supabase.rpc.mockResolvedValue({error:{code:'22023',message:'Admission rejected'}});await selectAlice();fireEvent.change(screen.getByPlaceholderText('Reason for admission (optional)'),{target:{value:'Keep reason'}});fireEvent.click(screen.getByRole('button',{name:'Admit to ward'}));expect(await screen.findByText('Admission rejected')).toBeTruthy();expect(screen.getByPlaceholderText('Reason for admission (optional)').value).toBe('Keep reason');expect(screen.getByRole('button',{name:'Admit to ward'}).disabled).toBe(false);});
});

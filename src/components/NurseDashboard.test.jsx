import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import NurseDashboard from "./NurseDashboard";
import { supabase } from "../supabaseClient";
vi.mock("../supabaseClient", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("./Header", () => ({ default: () => <header>Nurse workspace</header> }));
const patients = [{ id: "patient-a", name: "Synthetic Alice", code: "PT-A" }, { id: "patient-b", name: "Synthetic Bob", code: "PT-B" }];
let historyError, patientsError, queueError, delayedHistory, historyRows;
const defer = () => { let resolve;const promise = new Promise(r => { resolve = r; });return { promise, resolve }; };
beforeEach(() => {
  historyRows = [];historyError = false;patientsError = false;queueError = false;delayedHistory = null;supabase.rpc.mockReset();
  supabase.from.mockImplementation(table => {
    let patientId;
    const query = { select: () => query, order: () => query, limit: () => query, in: () => query, eq: (_column, value) => { patientId = value;return query; },
      then: (resolve, reject) => {
        if (table === "vitals" && patientId === "patient-a" && delayedHistory) return delayedHistory.promise.then(resolve, reject);
        const failed = table === "vitals" ? historyError : table === "patients" ? patientsError : queueError;
        return Promise.resolve({ data: failed ? null : table === "patients" ? patients : table === "vitals" ? historyRows : [], error: failed ? { message: "Synthetic read failure" } : null }).then(resolve, reject);
      } };
    return query;
  });
});
afterEach(cleanup);
function mount() { render(<NurseDashboard staff={{ id: "nurse", role: "Nurse" }} onLogout={() => {}} />); }
async function alice() {
  mount();fireEvent.click(await screen.findByRole("button", { name: "Select Synthetic Alice (PT-A)" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save vitals" }).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText("Pulse (beats/min)"), { target: { value: "76" } });
}
function confirmed(args) { return { data: { id: "saved", code: "VT-TEST", patient_id: args.p_patient_id, request_id: args.p_request_id, recorded_by: "nurse", recorded_at: new Date().toISOString(),
  measured_at: args.p_measured_at, bp_systolic: args.p_systolic, bp_diastolic: args.p_diastolic, temperature: args.p_temperature, pulse: args.p_pulse, weight: args.p_weight }, error: null }; }
it("saves through one RPC, blocks concurrent saves/patient changes and clears only confirmed readings", async () => {
  const pending = defer();supabase.rpc.mockReturnValue(pending.promise);await alice();
  const form = screen.getByRole("button", { name: "Save vitals" }).closest("form");fireEvent.submit(form);fireEvent.submit(form);
  expect(supabase.rpc).toHaveBeenCalledTimes(1);const [method,args] = supabase.rpc.mock.calls[0];expect(method).toBe("save_patient_vitals");expect(args.p_pulse).toBe(76);expect(args.recorded_by).toBeUndefined();
  expect(screen.getByRole("button", { name: "Select Synthetic Bob (PT-B)" }).disabled).toBe(true);fireEvent.click(screen.getByRole("button", { name: "Select Synthetic Bob (PT-B)" }));expect(screen.getByLabelText("Pulse (beats/min)").value).toBe("76");expect(screen.queryAllByText("Synthetic Bob")).toHaveLength(1);
  await act(async () => pending.resolve(confirmed(args)));expect(await screen.findByText("Vitals logged as VT-TEST")).toBeTruthy();expect(screen.getByLabelText("Pulse (beats/min)").value).toBe("");
});
it("freezes a lost response and retries the exact original request", async () => {
  supabase.rpc.mockRejectedValueOnce(new Error("Connection lost")).mockImplementationOnce((_method,args) => Promise.resolve(confirmed(args)));await alice();
  fireEvent.click(screen.getByRole("button", { name: "Save vitals" }));const retry = await screen.findByRole("button", { name: "Retry vitals save" });
  expect(screen.getByLabelText("Pulse (beats/min)").closest("fieldset").disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Select Synthetic Bob (PT-B)" }).disabled).toBe(true);fireEvent.click(screen.getByRole("button", { name: "Select Synthetic Bob (PT-B)" }));fireEvent.click(retry);expect(await screen.findByText("Vitals logged as VT-TEST")).toBeTruthy();expect(supabase.rpc.mock.calls[0]).toEqual(supabase.rpc.mock.calls[1]);
});
it("retains an editable draft on database rejection", async () => {
  supabase.rpc.mockResolvedValue({ error: { code: "22023", message: "Invalid reading" }, data: null });await alice();fireEvent.click(screen.getByRole("button", { name: "Save vitals" }));
  expect((await screen.findByRole("alert")).textContent.trim()).toBe("Invalid reading");expect(screen.getByLabelText("Pulse (beats/min)").value).toBe("76");expect(screen.getByLabelText("Pulse (beats/min)").closest("fieldset").disabled).toBe(false);
});
it("shows unavailable history and blocks new saves until a successful retry", async () => {
  historyError = true;mount();fireEvent.click(await screen.findByRole("button", { name: "Select Synthetic Alice (PT-A)" }));expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save vitals" }).disabled).toBe(true);expect(screen.queryByText("No vitals recorded for this patient yet.")).toBeNull();
  historyError = false;fireEvent.click(screen.getByRole("button", { name: "Retry history" }));await waitFor(() => expect(screen.getByRole("button", { name: "Save vitals" }).disabled).toBe(false));
});
it("discards late history for another patient", async () => {
  delayedHistory = defer();mount();fireEvent.click(await screen.findByRole("button", { name: "Select Synthetic Alice (PT-A)" }));fireEvent.click(screen.getByRole("button", { name: "Select Synthetic Bob (PT-B)" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save vitals" }).disabled).toBe(false));
  await act(async () => delayedHistory.resolve({ data: [{ id: "old", bp: "999/999", recorded_at: "2026-10-11" }], error: null }));expect(screen.queryByText(/999\/999/)).toBeNull();
});
it("does not present failed patient/queue reads as empty results", async () => {
  patientsError = true;queueError = true;mount();expect(await screen.findByRole("button", { name: "Retry patients" })).toBeTruthy();expect(screen.getByRole("button", { name: "Retry queue" })).toBeTruthy();expect(screen.queryByText("No patients registered yet.")).toBeNull();
});
it("rejects partial BP without saving", async () => {
  await alice();fireEvent.change(screen.getByLabelText("Systolic pressure (mmHg)"), { target: { value: "120" } });fireEvent.click(screen.getByRole("button", { name: "Save vitals" }));
  expect((await screen.findByRole("alert")).textContent.trim()).toBe("Enter both systolic and diastolic pressure, or leave both blank.");expect(supabase.rpc).not.toHaveBeenCalled();
});

it("displays zero readings with units instead of omitting them", async () => {
  historyRows = [{ id: "zero", bp: "0/0", pulse: 0, temperature: 0, weight: null, recorded_at: "2026-10-11" }];
  await alice();expect(screen.getByText("Pulse 0 beats/min")).toBeTruthy();expect(screen.getByText("Temp 0°C")).toBeTruthy();
});

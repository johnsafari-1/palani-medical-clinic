import { describe, expect, it, vi } from "vitest";
import { createVitalsSubmission, vitalsPayload } from "./vitalsSubmission";
const form = { systolic: "120", diastolic: "80", temp: "36.8", pulse: "76", weight: "68.250", measuredAt: "2026-10-11T12:30" };
describe("vitals submission", () => {
  it("sends numeric readings with an explicit measured instant and no claimed recorder", () => {
    const payload = vitalsPayload("patient", form);
    expect(payload).toMatchObject({ p_systolic: 120, p_diastolic: 80, p_temperature: 36.8, p_pulse: 76, p_weight: 68.25 });
    expect(payload.p_measured_at).toBe(new Date(form.measuredAt).toISOString());
    expect(payload.recorded_by).toBeUndefined();
  });
  it.each([{ ...form, systolic: "" }, { ...form, pulse: "76.5" }, { ...form, weight: "68kg" }, { ...form, temp: "NaN" },
    { ...form, temp: "1e2" }, { ...form, weight: "0" }, { ...form, systolic: "-5" }, { ...form, temp: "36.1234" },
    { ...form, measuredAt: "" }, { ...form, temp: "1000001" }, { ...form, systolic: "", diastolic: "", temp: "", pulse: "", weight: "" }])("rejects malformed readings %#", invalid => expect(() => vitalsPayload("patient", invalid)).toThrow());
  it("preserves zero readings and accepts unusual readings without normal-range classification", () => {
    expect(vitalsPayload("patient", { ...form, systolic: "0", diastolic: "0", pulse: "0", temp: "-1" })).toMatchObject({ p_systolic: 0, p_pulse: 0, p_temperature: -1 });
  });
  it("retains the exact request across lost responses and blocks changed payloads", async () => {
    const payload = vitalsPayload("patient", form);
    const client = { rpc: vi.fn().mockRejectedValueOnce(new Error("Lost")) };
    const submission = createVitalsSubmission(client, () => "request");
    await expect(submission.save(payload)).rejects.toThrow("Lost");
    await expect(submission.save({ ...payload, p_pulse: 75 })).rejects.toThrow("Retry");
    client.rpc.mockResolvedValue({ data: { id: "saved", code: "VT-TEST", request_id: "request", patient_id: "patient", recorded_by: "nurse", recorded_at: "2026-10-11T12:30:00Z", measured_at: payload.p_measured_at,
      bp_systolic: 120, bp_diastolic: 80, temperature: 36.8, pulse: 76, weight: 68.25 }, error: null });
    await submission.save(payload);
    expect(client.rpc.mock.calls[0]).toEqual(client.rpc.mock.calls[1]);
    expect(submission.hasPending()).toBe(false);
  });
  it("releases rejected submissions for correction but retains malformed responses", async () => {
    const payload = vitalsPayload("patient", form), client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "Invalid" } }) };
    const submission = createVitalsSubmission(client, () => "request");
    await expect(submission.save(payload)).rejects.toThrow("Invalid");expect(submission.hasPending()).toBe(false);
    client.rpc.mockResolvedValue({ data: { id: "wrong", code: "VT-X", patient_id: "other" }, error: null });
    await expect(submission.save(payload)).rejects.toThrow("not be confirmed");expect(submission.hasPending()).toBe(true);
  });
});

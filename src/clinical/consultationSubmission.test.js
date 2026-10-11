import { describe, expect, it, vi } from "vitest";
import { createConsultationSubmission } from "./consultationSubmission";

const payload = { p_patient_id: "patient", p_visit_id: "visit", p_diagnosis: "Test diagnosis", p_notes: "", p_prescriptions: [], p_lab_tests: [] };
describe("consultation request confirmation", () => {
  it("retries a lost response with the same ID and freezes the unconfirmed draft", async () => {
    const client = { rpc: vi.fn().mockRejectedValueOnce(new Error("Network interrupted"))
      .mockResolvedValueOnce({ data: { id: "saved", code: "CN-TEST" }, error: null }) };
    const submission = createConsultationSubmission(client, () => "request-1");
    await expect(submission.save(payload)).rejects.toThrow("Network interrupted");
    expect(submission.hasPending()).toBe(true);
    await expect(submission.save({ ...payload, p_diagnosis: "Changed" })).rejects.toThrow("unconfirmed");
    expect(client.rpc).toHaveBeenCalledTimes(1);
    await expect(submission.save(payload)).resolves.toEqual({ id: "saved", code: "CN-TEST" });
    expect(client.rpc.mock.calls[0][1].p_request_id).toBe(client.rpc.mock.calls[1][1].p_request_id);
    expect(submission.hasPending()).toBe(false);
  });
  it("retains an ID for a transport error returned by supabase-js", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "Failed to fetch", code: "" } }) };
    const submission = createConsultationSubmission(client, () => "request-1");
    await expect(submission.save(payload)).rejects.toThrow("Failed to fetch");
    expect(submission.hasPending()).toBe(true);
  });
  it("allows correcting a rejected database submission", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "Invalid visit", code: "22023" } }) };
    const submission = createConsultationSubmission(client, () => "request-1");
    await expect(submission.save(payload)).rejects.toThrow("Invalid visit");
    expect(submission.hasPending()).toBe(false);
  });
  it("does not report success for a malformed response", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    const submission = createConsultationSubmission(client, () => "request-1");
    await expect(submission.save(payload)).rejects.toThrow("could not be confirmed");
    expect(submission.hasPending()).toBe(true);
  });
});

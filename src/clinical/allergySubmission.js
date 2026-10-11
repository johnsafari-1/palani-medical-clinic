export const allergyStates = { unknown: "Allergy status unknown", no_known: "No known allergies reported", known: "Recorded allergies / intolerances" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fields = ["id", "substance", "reaction", "severity", "criticality", "category", "type", "clinical_status", "verification_status", "note"];
export const newAllergy = () => ({ id: crypto.randomUUID(), substance: "", reaction: "", severity: "", criticality: "unable-to-assess", category: "", type: "", clinical_status: "active", verification_status: "unconfirmed", note: "" });
export function validateAllergies(assessment, entries) {
  if (!Object.hasOwn(allergyStates, assessment) || !Array.isArray(entries) || entries.length > 50) throw new Error("Choose an allergy assessment; at most 50 records are supported.");
  const normalized = entries.map(item => {
    if (!item || Object.keys(item).length !== fields.length || fields.some(key => !Object.hasOwn(item, key))) throw new Error("Invalid allergy fields.");
    const row = Object.fromEntries(fields.map(key => [key, key === "clinical_status" && item[key] === null ? null : typeof item[key] === "string" ? item[key].trim() : undefined]));
    if (Object.values(row).some(value => value === undefined) || !uuid.test(row.id) || !row.substance || row.substance.length > 200 || row.reaction.length > 500 || row.note.length > 1000
      || !["", "mild", "moderate", "severe"].includes(row.severity) || (!row.reaction && row.severity)
      || !["low", "high", "unable-to-assess"].includes(row.criticality) || !["", "food", "medication", "environment", "biologic"].includes(row.category)
      || !["", "allergy", "intolerance"].includes(row.type) || !["unconfirmed", "confirmed", "refuted", "entered-in-error"].includes(row.verification_status)
      || (row.verification_status === "entered-in-error" ? row.clinical_status !== null : !["active", "inactive", "resolved"].includes(row.clinical_status))) throw new Error("Check the substance, reaction and allergy classification.");
    return row;
  });
  if (new Set(normalized.map(row => row.id)).size !== normalized.length) throw new Error("Allergy record IDs must be distinct.");
  const substantive = normalized.some(row => !["refuted", "entered-in-error"].includes(row.verification_status));
  if ((assessment === "known") !== substantive) throw new Error("Assessment conflicts with the recorded list. Preserve old records and mark incorrect entries refuted or entered-in-error.");
  return normalized;
}
export function allergyPayload(patientId, previousId, draft) {
  const reason = draft.reason.trim();
  if (!uuid.test(patientId) || (previousId !== null && !uuid.test(previousId)) || !reason || reason.length > 1000) throw new Error("A patient and review or correction reason are required (maximum 1,000 characters).");
  return { p_patient_id: patientId, p_previous_id: previousId, p_assessment: draft.assessment, p_allergies: validateAllergies(draft.assessment, draft.allergies), p_change_reason: reason };
}
export function validAllergyReview(row, patientId) {
  try {
    return !!row && uuid.test(row.id) && row.patient_id === patientId && Number.isInteger(row.revision) && row.revision > 0
      && (row.previous_id === null || uuid.test(row.previous_id)) && uuid.test(row.recorded_by) && uuid.test(row.request_id)
      && Number.isFinite(Date.parse(row.recorded_at)) && typeof row.change_reason === "string" && row.change_reason.trim().length > 0
      && validateAllergies(row.assessment, row.allergies).length === row.allergies.length;
  } catch { return false; }
}
export function createAllergySubmission(client, createId = () => crypto.randomUUID()) {
  let pending = null;
  return {
    hasPending: () => pending !== null,
    async save(payload, previousRevision, recorderId) {
      const signature = JSON.stringify({payload, previousRevision, recorderId});
      if (pending && pending.signature !== signature) throw new Error("Retry the exact unconfirmed allergy review before changing it.");
      if (!pending) pending = { signature, id: createId() };
      const { data, error } = await client.rpc("save_patient_allergy_review", { ...payload, p_request_id: pending.id });
      if (error) {
        if (/^[0-9A-Z]{5}$/.test(error.code || "") && !error.code.startsWith("PGRST") && !error.code.startsWith("08")) pending = null;
        throw Object.assign(new Error(error.message || "Allergy save could not be confirmed."), { code: error.code });
      }
      if (!validAllergyReview(data, payload.p_patient_id) || data.recorded_by !== recorderId || data.previous_id !== payload.p_previous_id || data.request_id !== pending.id
        || data.revision !== previousRevision + 1 || data.assessment !== payload.p_assessment || data.change_reason !== payload.p_change_reason
        || JSON.stringify(validateAllergies(data.assessment, data.allergies)) !== JSON.stringify(payload.p_allergies)) throw new Error("Allergy save could not be confirmed. Retry the same review.");
      pending = null; return data;
    },
  };
}

// Keep the request ID when a response is lost so retrying cannot duplicate a save.
export function createConsultationSubmission(client, createId = () => crypto.randomUUID()) {
  let pending = null;
  return {
    hasPending: () => pending !== null,
    async save(payload) {
      const signature = JSON.stringify(payload);
      if (pending && pending.signature !== signature) {
        throw new Error("The previous save is unconfirmed. Retry it before changing the consultation.");
      }
      if (!pending) pending = { signature, id: createId() };
      const { data, error } = await client.rpc("save_clinical_consultation", {
        ...payload, p_request_id: pending.id,
      });
      if (error) {
        // Database errors roll back the request. Transport failures may occur
        // after commit, so their request ID and draft must be retained.
        if (/^[0-9A-Z]{5}$/.test(error.code || "") && !error.code.startsWith("PGRST")) pending = null;
        throw new Error(error.message || "Save could not be confirmed. Retry the same consultation.");
      }
      if (!data?.id || !data?.code) throw new Error("Save could not be confirmed. Retry the same consultation.");
      pending = null;
      return data;
    },
  };
}

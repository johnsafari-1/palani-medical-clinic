// Pending state is kept only for this mounted screen. A transport failure may
// follow a commit: retain the exact request until confirmation or DB rejection.
export function createInvoiceSubmission(client, createId = () => crypto.randomUUID()) {
  let pending = null;
  return {
    hasPending: () => pending !== null,
    async save(payload) {
      const signature = JSON.stringify(payload);
      if (pending && pending.signature !== signature) throw new Error('The previous invoice is unconfirmed. Retry it before changing the draft.');
      if (!pending) pending = { signature, id: createId() };
      const { data, error } = await client.rpc('create_clinic_invoice', { ...payload, p_request_id: pending.id });
      if (error) {
        if (/^[0-9A-Z]{5}$/.test(error.code || '')) pending = null;
        throw new Error(error.message || 'Invoice creation could not be confirmed. Retry the same draft.');
      }
      if (!data?.id || !data.code || data.request_id !== pending.id || data.patient_id !== payload.p_patient_id ||
          data.consultation_id !== payload.p_consultation_id || data.admission_id !== payload.p_admission_id ||
          data.sale_type !== payload.p_sale_type || !data.created_by || !data.created_at ||
          !['Unpaid','Paid'].includes(data.status) || data.total == null || !Number.isFinite(Number(data.total)) || Number(data.total)<0) {
        throw new Error('Invoice creation could not be confirmed. Retry the same draft.');
      }
      pending = null;
      return data;
    },
  };
}

export function createPaymentSubmission(client) {
  let pending = null;
  return {
    hasPending: () => pending !== null,
    async save(id, method) {
      if (pending && (pending.id !== id || pending.method !== method)) throw new Error('The previous payment is unconfirmed. Retry the same payment method.');
      pending = { id, method };
      const { data, error } = await client.rpc('record_invoice_payment', { p_invoice_id: id, p_payment_method: method });
      if (error) {
        if (/^[0-9A-Z]{5}$/.test(error.code || '')) pending = null;
        throw new Error(error.message || 'Payment could not be confirmed. Retry the same payment method.');
      }
      if (data?.id !== id || data.status !== 'Paid' || data.payment_method !== method || !data.paid_by || !data.paid_at) {
        throw new Error('Payment could not be confirmed. Retry the same payment method.');
      }
      pending = null;
      return data;
    },
  };
}

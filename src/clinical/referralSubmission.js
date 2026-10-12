const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function referralPayload(patientId, visitId, form) {
  if (!patientId || (visitId !== null && !visitId)) throw new Error("A patient and explicit visit selection are required.");
  const fields = [['facility_name',500,true],['referring_doctor',500,false],['reason',10000,true],['notes',50000,false]];
  const normalized = {};
  for (const [key,limit,required] of fields) {
    if (typeof form[key] !== 'string' || form[key].length > limit || (required && !form[key].trim())) throw new Error("Check the referral facility, reason and text limits.");
    normalized['p_'+key] = form[key].trim();
  }
  if (!['Routine','Urgent','Emergency'].includes(form.urgency)) throw new Error("Choose a referral urgency.");
  return {p_patient_id:patientId,p_visit_id:visitId,...normalized,p_urgency:form.urgency};
}
export function createReferralSubmission(client, createId = () => crypto.randomUUID()) {
  let pending = null;
  return {
    hasPending: () => pending !== null,
    async save(payload, actorId) {
      const signature=JSON.stringify({payload,actorId});
      if (pending && pending.signature!==signature) throw new Error("Retry the exact unconfirmed referral before changing it.");
      if (!pending) pending={signature,id:createId()};
      const {data,error}=await client.rpc('save_outgoing_referral',{...payload,p_request_id:pending.id});
      if (error) {
        if (/^[0-9A-Z]{5}$/.test(error.code||'') && !error.code.startsWith('PGRST') && !error.code.startsWith('08')) pending=null;
        throw new Error(error.message||"Referral save could not be confirmed. Retry the same referral.");
      }
      if (!data || !uuid.test(data.id||'') || typeof data.code !== 'string' || !data.code || data.direction!=='Outgoing'
        || data.patient_id!==payload.p_patient_id || data.visit_id!==payload.p_visit_id || data.created_by!==actorId
        || data.request_id!==pending.id || !Number.isFinite(Date.parse(data.created_at))
        || ['facility_name','referring_doctor','reason','urgency','notes'].some(key=>data[key]!==payload['p_'+key])) {
        throw new Error("Referral save could not be confirmed. Retry the same referral.");
      }
      pending=null;return data;
    },
  };
}

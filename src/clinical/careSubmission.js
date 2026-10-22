const names={checkin:'check_in_patient',start:'start_clinic_visit',admit:'admit_clinic_patient',discharge:'discharge_clinic_patient'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export function createCareSubmission(client,createId=()=>crypto.randomUUID()) {
  let pending=null;
  return {
    hasPending:()=>pending!==null,
    async save(action,payload,actor) {
      if (!Object.hasOwn(names,action) || !payload.p_patient_id || (Object.hasOwn(payload,'p_reason') && (typeof payload.p_reason!=='string'||payload.p_reason.length>10000))) throw new Error('Invalid care request.');
      const signature=JSON.stringify({action,payload,actor});
      if(pending&&pending.signature!==signature)throw new Error('Retry the exact unconfirmed care action before changing patient or details.');
      if(!pending)pending={signature,id:createId()};
      const args={...payload,...(['checkin','admit'].includes(action)?{p_request_id:pending.id}:{})};
      const {data,error}=await client.rpc(names[action],args);
      if(error){if(/^[0-9A-Z]{5}$/.test(error.code||'')&&!error.code.startsWith('PGRST')&&!error.code.startsWith('08'))pending=null;throw new Error(error.message||'Care save could not be confirmed. Retry the same action.');}
      let valid=data&&uuid.test(data.id||'')&&data.patient_id===payload.p_patient_id;
      if(action==='checkin')valid=valid&&data.request_id===pending.id&&data.checked_in_by===actor&&timestamp(data.checked_in_at)&&data.reason===payload.p_reason&&['Waiting','In Consultation','Completed'].includes(data.status);
      if(action==='start')valid=valid&&data.id===payload.p_visit_id&&data.status==='In Consultation';
      if(action==='admit')valid=valid&&data.request_id===pending.id&&data.admitted_by===actor&&timestamp(data.admitted_at)&&data.reason===payload.p_reason&&data.visit_id===payload.p_visit_id&&['Admitted','Discharged'].includes(data.status);
      if(action==='discharge')valid=valid&&data.id===payload.p_admission_id&&data.status==='Discharged'&&data.discharged_by===actor&&timestamp(data.discharged_at)&&data.discharge_visit_id===payload.p_visit_id;
      if(!valid)throw new Error('Care save could not be confirmed. Retry the same action.');
      pending=null;return data;
    },
  };
}

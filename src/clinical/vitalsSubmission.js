export const emptyVitals = () => ({ systolic: "", diastolic: "", temp: "", pulse: "", weight: "", measuredAt: localMinute() });
function localMinute() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function reading(value, label, integer = false, signed = false) {
  const text = value.trim();
  if (!text) return null;
  const pattern = integer ? /^\d+$/ : signed ? /^-?\d+(\.\d{1,3})?$/ : /^\d+(\.\d{1,3})?$/;
  const number = Number(text);
  if (!pattern.test(text) || !Number.isFinite(number) || Math.abs(number) > 1000000) {
    throw new Error(`${label}: enter a number${integer ? " without decimals" : " with at most three decimal places"}.`);
  }
  return number;
}
export function vitalsPayload(patientId, form) {
  const systolic = reading(form.systolic, "Systolic pressure");
  const diastolic = reading(form.diastolic, "Diastolic pressure");
  if ((systolic === null) !== (diastolic === null)) throw new Error("Enter both systolic and diastolic pressure, or leave both blank.");
  const temperature = reading(form.temp, "Temperature", false, true);
  const pulse = reading(form.pulse, "Pulse", true);
  const weight = reading(form.weight, "Weight");
  if (weight !== null && weight <= 0) throw new Error("Weight must be greater than zero.");
  if ([systolic, temperature, pulse, weight].every(value => value === null)) throw new Error("Enter at least one reading.");
  const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form.measuredAt) ? new Date(form.measuredAt) : new Date(NaN);
  if (!Number.isFinite(time.getTime())) throw new Error("Enter the date and time the readings were measured.");
  return { p_patient_id: patientId, p_systolic: systolic, p_diastolic: diastolic, p_temperature: temperature,
    p_pulse: pulse, p_weight: weight, p_measured_at: time.toISOString() };
}
export function createVitalsSubmission(client, createId = () => crypto.randomUUID()) {
  let pending = null;
  return {
    hasPending: () => pending !== null,
    async save(payload) {
      const signature = JSON.stringify(payload);
      if (pending && pending.signature !== signature) throw new Error("Retry the unconfirmed readings before changing them.");
      if (!pending) pending = { signature, id: createId() };
      const { data, error } = await client.rpc("save_patient_vitals", { ...payload, p_request_id: pending.id });
      if (error) {
        if (/^[0-9A-Z]{5}$/.test(error.code || "") && !error.code.startsWith("PGRST")) pending = null;
        throw new Error(error.message || "Vitals save could not be confirmed. Retry the same readings.");
      }
      const matches = data && [["bp_systolic", "p_systolic"], ["bp_diastolic", "p_diastolic"], ["temperature", "p_temperature"], ["pulse", "p_pulse"], ["weight", "p_weight"]]
        .every(([column, parameter]) => payload[parameter] === null ? data[column] === null
          : (typeof data[column] === "number" || typeof data[column] === "string")
            && /^-?\d+(\.\d+)?$/.test(String(data[column])) && Number(data[column]) === payload[parameter]);
      if (!data?.id || !data?.code || !data.recorded_by || !Number.isFinite(Date.parse(data.recorded_at)) || !matches || data.patient_id !== payload.p_patient_id
          || data.request_id !== pending.id || !data.measured_at
          || new Date(data.measured_at).getTime() !== new Date(payload.p_measured_at).getTime()) {
        throw new Error("Vitals save could not be confirmed. Retry the same readings.");
      }
      pending = null;
      return data;
    },
  };
}

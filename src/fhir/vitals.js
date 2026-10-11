// Pure mapping only: this module exposes no download, network or FHIR endpoint.
const idPattern = /^[A-Za-z0-9.-]{1,64}$/;
const coding = (code, display) => ({ coding: [{ system: "http://loinc.org", code, display }] });
const quantity = (value, unit, code) => ({ value, unit, system: "http://unitsofmeasure.org", code });
function numeric(value, name, integer = false, signed = false) {
  if (value === null || value === undefined) return null;
  if ((typeof value !== "number" && typeof value !== "string") || !/^-?\d+(\.\d{1,3})?$/.test(String(value))) throw new Error(`Invalid ${name}.`);
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > 1000000 || (!signed && result < 0) || (integer && !Number.isInteger(result))) throw new Error(`Invalid ${name}.`);
  return result;
}
export function vitalsToObservations(row, references) {
  if (!row || !idPattern.test(row.id || "") || row.id.length > 55 || !row.request_id) throw new Error("Only new structured vitals can be mapped.");
  if (references?.patientId !== row.patient_id || references?.practitionerId !== row.recorded_by
      || !idPattern.test(references.patientId || "") || !idPattern.test(references.practitionerId || "")) throw new Error("Resolved patient and practitioner references are required.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(row.measured_at || "") || !Number.isFinite(Date.parse(row.measured_at))) throw new Error("A measured time with timezone is required.");
  const sys = numeric(row.bp_systolic, "systolic pressure");
  const dia = numeric(row.bp_diastolic, "diastolic pressure");
  if ((sys === null) !== (dia === null)) throw new Error("Incomplete blood pressure cannot be mapped.");
  if (row.bp?.trim() && sys === null) throw new Error("Unstructured blood pressure cannot be mapped.");
  if (row.bp?.trim()) {
    const pair = row.bp.trim().match(/^(\d+(?:\.\d{1,3})?)\s*\/\s*(\d+(?:\.\d{1,3})?)$/);
    if (!pair || Number(pair[1]) !== sys || Number(pair[2]) !== dia) throw new Error("Blood pressure text and components disagree.");
  }
  const temp = numeric(row.temperature, "temperature", false, true);
  const pulse = numeric(row.pulse, "pulse", true);
  const weight = numeric(row.weight, "weight");
  if (weight !== null && weight <= 0) throw new Error("Invalid weight.");
  const observation = (suffix, code, display) => ({ resourceType: "Observation", id: `${row.id}-${suffix}`, status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" }] }],
    code: coding(code, display), subject: { reference: `Patient/${references.patientId}` },
    effectiveDateTime: row.measured_at, performer: [{ reference: `Practitioner/${references.practitionerId}` }] });
  const result = [];
  if (sys !== null) result.push({ ...observation("bp", "85354-9", "Blood pressure panel with all children optional"), component: [
    { code: coding("8480-6", "Systolic blood pressure"), valueQuantity: quantity(sys, "mmHg", "mm[Hg]") },
    { code: coding("8462-4", "Diastolic blood pressure"), valueQuantity: quantity(dia, "mmHg", "mm[Hg]") },
  ] });
  if (temp !== null) result.push({ ...observation("temp", "8310-5", "Body temperature"), valueQuantity: quantity(temp, "°C", "Cel") });
  if (pulse !== null) result.push({ ...observation("pulse", "8867-4", "Heart rate"), valueQuantity: quantity(pulse, "beats/min", "/min") });
  if (weight !== null) result.push({ ...observation("weight", "29463-7", "Body weight"), valueQuantity: quantity(weight, "kg", "kg") });
  if (!result.length) throw new Error("No structured readings to map.");
  return result;
}

import { expect, it } from "vitest";
import { vitalsToObservations } from "./vitals";
const row = { id: "vitals-1", patient_id: "patient-1", recorded_by: "nurse-1", request_id: "request", measured_at: "2026-10-11T12:30:00+03:00",
  bp: "120/80", bp_systolic: "120", bp_diastolic: 80, temperature: "36.8", pulse: 76, weight: "68.25" };
const refs = { patientId: "patient-1", practitionerId: "nurse-1" };
it("maps four R4 observations with correct LOINC/UCUM and resolved references", () => {
  const observations = vitalsToObservations(row, refs);
  expect(observations.map(o => o.code.coding[0].code)).toEqual(["85354-9", "8310-5", "8867-4", "29463-7"]);
  const [bp, temp, pulse, weight] = observations;
  expect(bp.valueQuantity).toBeUndefined();
  expect(bp.component.map(c => [c.code.coding[0].code, c.valueQuantity.value, c.valueQuantity.code])).toEqual([["8480-6", 120, "mm[Hg]"], ["8462-4", 80, "mm[Hg]"]]);
  expect([temp, pulse, weight].map(o => [o.valueQuantity.value, o.valueQuantity.code])).toEqual([[36.8, "Cel"], [76, "/min"], [68.25, "kg"]]);
  for (const o of observations) {
    expect(o).toMatchObject({ resourceType: "Observation", status: "final", subject: { reference: "Patient/patient-1" }, performer: [{ reference: "Practitioner/nurse-1" }], effectiveDateTime: row.measured_at });
    expect(o.category[0].coding[0].code).toBe("vital-signs");
    expect(o.meta).toBeUndefined();expect(o.encounter).toBeUndefined();expect(o.interpretation).toBeUndefined();
  }
});
it("uses stable distinct IDs, preserves source data and emits only recorded values", () => {
  const source = { ...row, bp: null, bp_systolic: null, bp_diastolic: null, pulse: 0, temperature: null, weight: null };
  const copy = structuredClone(source), observations = vitalsToObservations(source, refs);
  expect(observations).toHaveLength(1);expect(observations[0].valueQuantity.value).toBe(0);
  expect(observations).toEqual(vitalsToObservations(source, refs));expect(source).toEqual(copy);
});
it.each([{ request_id: null }, { measured_at: null }, { measured_at: "2026-10-11T12:30:00" }, { bp_diastolic: null },
  { bp_systolic: null, bp_diastolic: null }, { weight: "68kg" }, { temperature: NaN }, { pulse: 1.5 }, { id: "x".repeat(60) },
  { weight: 0 }, { temperature: "" }])("rejects unsafe mapping %#", changes => expect(() => vitalsToObservations({ ...row, ...changes }, refs)).toThrow());
it("rejects unresolved or mismatched patient and practitioner references", () => {
  expect(() => vitalsToObservations(row)).toThrow();
  expect(() => vitalsToObservations(row, { ...refs, patientId: "other" })).toThrow();
  expect(() => vitalsToObservations(row, { ...refs, practitionerId: "other" })).toThrow();
});

import { validAllergyReview } from "./allergySubmission";

export const recordSections = {
  consultations: { title: "Consultations", date: "created_at", select: "id,patient_id,diagnosis,notes,created_at,prescriptions(id,consultation_id,drug,dosage,instructions,dispensed)" },
  vitals: { title: "Vitals", date: "recorded_at", select: "id,patient_id,bp,bp_systolic,bp_diastolic,temperature,pulse,weight,measured_at,recorded_at,recorded_by" },
  lab_orders: { title: "Lab tests", date: "ordered_at", select: "id,patient_id,test_name,status,result,ordered_at" },
  admissions: { title: "Ward admissions", date: "admitted_at", select: "id,patient_id,status,reason,admitted_at,discharged_at" },
  invoices: { title: "Invoices", date: "created_at", select: "id,patient_id,code,total,status,created_at" },
  allergies: { title: "Allergies / intolerances" },
};
export const allergyReaderRoles = ["Doctor", "Nurse", "Pharmacist", "Admin"];
// RLS can return an empty array for a denied role. Never interpret that as an assessment.
export async function readRecordSection(client, table, patientId, staff) {
  if (table === "allergies") {
    if (!allergyReaderRoles.includes(staff?.role) || !staff.id) throw new Error("Allergy information unavailable for this staff role.");
    const { data: currentStaff, error: staffError } = await client.from("staff").select("id,role,active").eq("id", staff.id).maybeSingle();
    if (staffError || currentStaff?.id !== staff.id || currentStaff.role !== staff.role || currentStaff.active !== true) throw new Error("Current allergy access could not be verified.");
    const { data, error } = await client.from("patient_allergy_reviews")
      .select("id,patient_id,revision,previous_id,assessment,allergies,change_reason,recorded_by,recorded_at,request_id")
      .eq("patient_id", patientId).order("revision", { ascending: false }).limit(1);
    if (error || !Array.isArray(data) || data.length > 1 || data.some(row => !validAllergyReview(row, patientId))) throw new Error("Allergy information could not be loaded.");
    return data;
  }
  const spec = recordSections[table];
  if (!spec) throw new Error("Unknown record section.");
  const rows = [], seen = new Set();
  let total;
  // Supabase defaults can cap a SELECT. Count and bounded pages prevent silent truncation.
  for (let offset = 0; offset < 5000; offset += 200) {
    const { data, error, count } = await client.from(table).select(spec.select, { count: "exact" })
      .eq("patient_id", patientId).order(spec.date, { ascending: false }).order("id", { ascending: false }).range(offset, offset + 199);
    if (error || !Array.isArray(data) || !Number.isInteger(count) || count < 0 || count > 5000 || (total !== undefined && total !== count)
      || data.length > 200 || data.some(row => !row || typeof row.id !== "string" || !row.id || row.patient_id !== patientId || seen.has(row.id)
        || (table === "consultations" && (!Array.isArray(row.prescriptions) || row.prescriptions.some(rx => !rx || rx.consultation_id !== row.id))))) {
      throw new Error("Record section could not be loaded completely. Refresh and retry.");
    }
    for (const row of data) { if (seen.has(row.id)) throw new Error("Duplicate record in read."); seen.add(row.id); rows.push(row); }
    total = count;
    if (rows.length === total) return rows;
    if (!data.length || rows.length > total) throw new Error("Incomplete record read.");
  }
  throw new Error("Record is too large for this summary. Request a dedicated export.");
}

export async function readReferralContext(client, patientId, staff) {
  const [consultations, vitals, allergies] = await Promise.all([
    readRecordSection(client, "consultations", patientId, staff),
    readRecordSection(client, "vitals", patientId, staff),
    readRecordSection(client, "allergies", patientId, staff),
  ]);
  return { consultations, vitals, allergies, readAt: new Date().toISOString() };
}

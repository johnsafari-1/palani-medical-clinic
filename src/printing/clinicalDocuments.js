import { escapeHtml as escape } from "./escapeHtml";
import { allergyStates } from "../clinical/allergySubmission";

export const displayValue = value => value === null || value === undefined || value === "" ? "Not recorded" : String(value);
export function displayTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date(value)) + " EAT";
}
const text = value => escape(displayValue(value));
const time = value => escape(displayTime(value));
export function vitalDetails(row) {
  const bp = row.bp_systolic != null && row.bp_diastolic != null ? `${row.bp_systolic}/${row.bp_diastolic}` : row.bp;
  return `BP: ${displayValue(bp)}${bp != null && bp !== "" ? " mmHg" : ""} · Temperature: ${displayValue(row.temperature)}${row.temperature != null ? " °C" : ""} · Pulse: ${displayValue(row.pulse)}${row.pulse != null ? " beats/min" : ""} · Weight: ${displayValue(row.weight)}${row.weight != null ? " kg" : ""}`;
}
export function allergyDetails(entry) {
  return `${entry.substance} · Reaction: ${displayValue(entry.reaction)} · Reaction severity: ${displayValue(entry.severity)} · Future-risk criticality: ${entry.criticality} · Category: ${displayValue(entry.category)} · Type: ${displayValue(entry.type)} · Clinical status: ${displayValue(entry.clinical_status)} · Verification: ${entry.verification_status} · Note: ${displayValue(entry.note)}`;
}
function allergyHtml(rows) {
  const review = rows[0];
  if (!review) return "<p>Not assessed — allergy status unknown.</p>";
  return `<p><strong>${escape(allergyStates[review.assessment])}</strong></p><p>Review revision ${text(review.revision)} · ${time(review.recorded_at)} · Recorder ID: ${text(review.recorded_by)}</p><p>Review / correction reason: ${text(review.change_reason)}</p>${review.allergies.length ? `<ul>${review.allergies.map(entry => `<li>${escape(allergyDetails(entry))}</li>`).join("")}</ul>` : "<p>No entries in this review.</p>"}`;
}
function consultationsHtml(rows) {
  return rows.length ? rows.map(row => `<article><p><strong>${text(row.diagnosis)}</strong> · ${time(row.created_at)}</p><p>Notes: ${text(row.notes)}</p>${row.prescriptions.length ? `<ul>${row.prescriptions.map(rx => `<li>${text(rx.drug)} · Dose: ${text(rx.dosage)} · Instructions: ${text(rx.instructions)} · ${rx.dispensed ? "Dispensed" : "Pending dispensing"}</li>`).join("")}</ul>` : "<p>No prescriptions recorded for this consultation.</p>"}</article>`).join("") : "<p>None recorded in accessible records.</p>";
}
function vitalsHtml(rows) {
  return rows.length ? rows.map(row => `<article><p>${escape(vitalDetails(row))}</p><p>Measured: ${time(row.measured_at)} · Recorded: ${time(row.recorded_at)} · Recorder ID: ${text(row.recorded_by)}</p></article>`).join("") : "<p>None recorded in accessible records.</p>";
}
const style = `body{font:13px Arial,sans-serif;color:#1e2a30;max-width:760px;margin:auto;padding:28px}h1{font-size:22px}h2{font-size:16px;border-bottom:1px solid #aab;padding-bottom:6px;margin-top:24px}p,li{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;border-bottom:1px solid #ddd;padding:9px 5px}td:last-child{text-align:right}thead{display:table-header-group}tr{break-inside:avoid}article{border-bottom:1px solid #ddd;padding:4px 0}li{margin:8px 0}.notice{border:2px solid #aa6d13;padding:10px}.meta{color:#526269}section{break-inside:auto}h2{break-after:avoid}@media print{body{padding:0}}`;
function documentHtml(title, content, readAt) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(title)}</title><style>${style}</style></head><body><h1>Palani Medical Clinic</h1><p class="notice">TEST DATA — training document. Not for clinical use.</p><p class="meta">Generated: ${time(new Date().toISOString())}. Read snapshot: ${time(readAt)}. Accessible records only; this is not a certified FHIR document.</p>${content}</body></html>`;
}
function patientHtml(patient) {
  return `<p><strong>Patient: ${text(patient.name)} (${text(patient.code)})</strong></p><p>DOB: ${text(patient.dob)} · Gender: ${text(patient.gender)} · Phone: ${text(patient.phone)}</p>`;
}
export function buildPatientSummary(patient, sections) {
  const headings = { allergies: "Allergies / intolerances", consultations: "Consultations", vitals: "Vitals", lab_orders: "Lab tests", admissions: "Ward admissions", invoices: "Invoices" };
  let content = `<h2>Patient summary</h2>${patientHtml(patient)}`;
  if (Object.keys(headings).some(key => sections[key]?.status !== "ready")) content += '<p class="notice">INCOMPLETE SUMMARY — one or more sections are unavailable. Do not treat missing sections as no clinical findings.</p>';
  for (const [key, heading] of Object.entries(headings)) {
    const section = sections[key];
    let body = '<p class="notice">Unavailable — do not interpret as none recorded.</p>';
    if (section?.status === "ready") {
      const rows = section.rows;
      if (key === "allergies") body = allergyHtml(rows);
      else if (key === "consultations") body = consultationsHtml(rows);
      else if (key === "vitals") body = vitalsHtml(rows);
      else if (!rows.length) body = "<p>None recorded in accessible records.</p>";
      else body = rows.map(row => `<article>${key === "lab_orders" ? `<p>${text(row.test_name)} · Status: ${text(row.status)} · Result: ${text(row.result)} · Ordered: ${time(row.ordered_at)}</p>` : key === "admissions" ? `<p>Status: ${text(row.status)} · Reason: ${text(row.reason)} · Admitted: ${time(row.admitted_at)} · Discharged: ${time(row.discharged_at)}</p>` : `<p>${text(row.code)} · Total: KES ${text(row.total)} · Status: ${text(row.status)} · ${time(row.created_at)}</p>`}</article>`).join("");
      body = `<p class="meta">Read: ${time(section.readAt)}</p>${body}`;
    }
    content += `<section><h2>${heading}</h2>${body}</section>`;
  }
  return documentHtml(`${displayValue(patient.name)} — Patient summary`, content, Object.values(sections).map(section => section.readAt).filter(Boolean).sort().at(-1));
}
export function buildReferralLetter(patient, referral, context) {
  if (referral.patient_id !== patient.id || referral.direction !== "Outgoing" || !referral.id || !referral.created_by) throw new Error("Referral identity could not be verified.");
  const body = `<h2>Referral letter — ${text(referral.code)}</h2>${patientHtml(patient)}<p>To facility: ${text(referral.facility_name)} · Receiving doctor: ${text(referral.referring_doctor)}</p><p>Urgency: ${text(referral.urgency)} · Referral recorded: ${time(referral.created_at)} · Referring staff ID: ${text(referral.created_by)}</p><p>Reason: ${text(referral.reason)}</p><p>Additional notes: ${text(referral.notes)}</p><h2>Allergies / intolerances</h2>${allergyHtml(context.allergies)}<h2>Latest vitals</h2>${vitalsHtml(context.vitals.slice(0, 1))}<h2>Recent consultations (up to 3)</h2>${consultationsHtml(context.consultations.slice(0, 3))}<p class="meta">This letter includes a limited current snapshot, not the complete patient record.</p>`;
  return documentHtml(`Referral letter — ${displayValue(patient.name)}`, body, context.readAt);
}
export function openClinicalPrintWindow() {
  const win = window.open("", "_blank");
  if (!win) throw new Error("Allow popups to print, then retry. No new record is needed.");
  win.opener = null;
  win.document.write(documentHtml("Preparing document", "<p>Loading document…</p>", null));
  win.document.close();
  return win;
}
export function printClinicalDocument(win, html) {
  if (win.closed) throw new Error("The print window was closed. Retry printing the saved record.");
  win.document.open(); win.document.write(html); win.document.close(); win.focus(); win.print();
}

export function buildOperationsReport(stats, rows) {
  const body=`<h2>Operations report</h2><p>Rolling seven-day period begins: ${time(stats.period_start)}</p><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${rows.map(([label,value])=>`<tr><td>${escape(label)}</td><td>${escape(value)}</td></tr>`).join("")}</tbody></table><p>Paid revenue uses the recorded payment time. Paid invoices without a payment timestamp are excluded from the period total.</p>`;
  return documentHtml("Palani Medical Clinic — Operations report",body,stats.read_at);
}

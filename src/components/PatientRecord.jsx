import { useEffect, useRef, useState } from "react";
import { X, Printer } from "lucide-react";
import { supabase } from "../supabaseClient";
import { readRecordSection, recordSections } from "../clinical/recordReads";
import { allergyStates } from "../clinical/allergySubmission";
import { allergyDetails, buildPatientSummary, displayTime, displayValue, openClinicalPrintWindow, printClinicalDocument, vitalDetails } from "../printing/clinicalDocuments";

export default function PatientRecord(props) {
  return <RecordContent key={`${props.patient.id}:${props.staff?.role}`} {...props} />;
}
function RecordContent({ patient, staff, onClose }) {
  const [sections, setSections] = useState(() => Object.fromEntries(Object.keys(recordSections).map(key => [key, { status: "loading", rows: [] }])));
  const [printError, setPrintError] = useState("");
  const generations = useRef({}), mounted = useRef(false), dialog = useRef(null);
  const close = useRef(onClose); close.current = onClose;
  async function load(key) {
    const generation = (generations.current[key] || 0) + 1; generations.current[key] = generation;
    setSections(previous => ({ ...previous, [key]: { status: "loading", rows: [] } }));
    try {
      const rows = await readRecordSection(supabase, key, patient.id, staff);
      if (mounted.current && generations.current[key] === generation) setSections(previous => ({ ...previous, [key]: { status: "ready", rows, readAt: new Date().toISOString() } }));
    } catch (error) {
      if (mounted.current && generations.current[key] === generation) setSections(previous => ({ ...previous, [key]: { status: "unavailable", rows: [], error: error.message } }));
    }
  }
  useEffect(() => {
    mounted.current = true;
    Object.keys(recordSections).forEach(key => { void load(key); });
    const priorFocus = document.activeElement;
    dialog.current.focus();
    return () => { mounted.current = false; if (priorFocus?.isConnected) priorFocus.focus(); };
  }, []);
  const loading = Object.values(sections).some(section => section.status === "loading");
  const incomplete = Object.values(sections).some(section => section.status === "unavailable");
  function printSummary() {
    if (loading) return;
    let win;
    setPrintError("");
    try { win = openClinicalPrintWindow(); printClinicalDocument(win, buildPatientSummary(patient, sections)); }
    catch (error) { win?.close(); setPrintError(error.message); }
  }
  function handleKeys(event) {
    if (event.key === "Escape") { event.stopPropagation(); close.current(); }
    if (event.key !== "Tab") return;
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
  }
  return <div className="wl-record-overlay" onClick={onClose}>
    <div className="wl-record-dialog wl-fade-in" role="dialog" aria-modal="true" aria-labelledby="patient-record-title" tabIndex={-1} ref={dialog} onKeyDown={handleKeys} onClick={event => event.stopPropagation()}>
      <div className="wl-record-heading">
        <div><h2 id="patient-record-title">Patient summary — {patient.name}</h2><p>{patient.code} · {displayValue(patient.gender)} · DOB {displayValue(patient.dob)} · {displayValue(patient.phone)}</p></div>
        <div className="wl-record-actions"><button className="wl-btn" disabled={loading} onClick={printSummary}><Printer size={16} /> Print summary</button><button className="wl-btn icon-btn" onClick={onClose} aria-label="Close patient summary"><X size={16} /></button></div>
      </div>
      <p className="wl-alert">TEST DATA — training document. Accessible records only.</p>
      {incomplete && <p role="alert" className="wl-alert">Incomplete summary: unavailable sections must not be interpreted as no clinical findings. Printed copies include this warning.</p>}
      {printError && <p role="alert" className="wl-alert">{printError}</p>}
      {Object.entries(recordSections).sort(([a], [b]) => a === "allergies" ? -1 : b === "allergies" ? 1 : 0).map(([key, spec]) => {
        const section = sections[key];
        return <section className="wl-record-section" key={key} aria-label={spec.title} aria-busy={section.status === "loading"}>
          <div className="wl-record-heading"><h3>{spec.title}</h3><button className="wl-btn" disabled={section.status === "loading"} onClick={() => load(key)}>{section.status === "unavailable" ? `Retry ${spec.title}` : `Refresh ${spec.title}`}</button></div>
          {section.status === "loading" ? <p role="status">Loading {spec.title.toLowerCase()}…</p> : section.status === "unavailable" ? <p role="alert">Unavailable — {section.error} Do not interpret as none recorded.</p> : <>
            <p className="wl-record-meta">Read: {displayTime(section.readAt)}</p>
            {key === "allergies" ? <AllergySnapshot rows={section.rows} /> : section.rows.length === 0 ? <p>None recorded in accessible records.</p> : section.rows.map(row => <RecordRow key={row.id} table={key} row={row} />)}
          </>}
        </section>;
      })}
    </div>
  </div>;
}
function AllergySnapshot({ rows }) {
  const review = rows[0];
  if (!review) return <p>Not assessed — allergy status unknown.</p>;
  return <><p><strong>{allergyStates[review.assessment]}</strong></p><p>Review revision {review.revision} · {displayTime(review.recorded_at)} · Recorder ID: {review.recorded_by}</p><p>Review / correction reason: {review.change_reason}</p>{review.allergies.length ? <ul>{review.allergies.map(entry => <li key={entry.id}>{allergyDetails(entry)}</li>)}</ul> : <p>No entries in this review.</p>}</>;
}
function RecordRow({ table, row }) {
  return <article className="wl-record-entry">
    {table === "consultations" ? <><p><strong>{displayValue(row.diagnosis)}</strong> · {displayTime(row.created_at)}</p><p>Notes: {displayValue(row.notes)}</p>{row.prescriptions.length ? <ul>{row.prescriptions.map(rx => <li key={rx.id}>{rx.drug} · Dose: {displayValue(rx.dosage)} · Instructions: {displayValue(rx.instructions)} · {rx.dispensed ? "Dispensed" : "Pending dispensing"}</li>)}</ul> : <p>No prescriptions recorded for this consultation.</p>}</> : table === "vitals" ? <><p>{vitalDetails(row)}</p><p>Measured: {displayTime(row.measured_at)} · Recorded: {displayTime(row.recorded_at)} · Recorder ID: {displayValue(row.recorded_by)}</p></> : table === "lab_orders" ? <p>{displayValue(row.test_name)} · Status: {displayValue(row.status)} · Result: {displayValue(row.result)} · Ordered: {displayTime(row.ordered_at)}</p> : table === "admissions" ? <p>Status: {displayValue(row.status)} · Reason: {displayValue(row.reason)} · Admitted: {displayTime(row.admitted_at)} · Discharged: {displayTime(row.discharged_at)}</p> : <p>{row.code} · KES {displayValue(row.total)} · {row.status} · {displayTime(row.created_at)}</p>}
  </article>;
}

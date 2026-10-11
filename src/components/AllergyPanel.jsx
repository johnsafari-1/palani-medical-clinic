import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { allergyPayload, allergyStates, createAllergySubmission, newAllergy, validAllergyReview } from "../clinical/allergySubmission";

export default function AllergyPanel(props) { return <AllergyReview key={props.patientId} {...props} />; }
function AllergyReview({ patientId, staff, readOnly = false, disabled = false, onAvailabilityChange, onPendingChange }) {
  const [reviews, setReviews] = useState([]), [loading, setLoading] = useState(true), [readError, setReadError] = useState("");
  const [draft, setDraft] = useState(null), [base, setBase] = useState(null), [saving, setSaving] = useState(false), [unconfirmed, setUnconfirmed] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [conflict, setConflict] = useState(false);
  const generation = useRef(0), mounted = useRef(true), busy = useRef(false), submission = useRef(null), callbacks = useRef({});
  callbacks.current = { onAvailabilityChange, onPendingChange };
  if (!submission.current) submission.current = createAllergySubmission(supabase);
  const latest = reviews[0] || null, editable = !readOnly && ["Doctor", "Admin"].includes(staff?.role);
  const locked = disabled || saving || unconfirmed;
  async function load() {
    const token = ++generation.current;
    setLoading(true); setReadError(""); callbacks.current.onAvailabilityChange?.(false);
    try {
      const { data, error } = await supabase.from("patient_allergy_reviews").select("*").eq("patient_id", patientId).order("revision", { ascending: false }).limit(20);
      if (!mounted.current || token !== generation.current) return;
      if (error || !Array.isArray(data) || data.some(row => !validAllergyReview(row, patientId))
        || data.some((row, i) => i > 0 && data[i-1].revision <= row.revision)) throw new Error("Invalid allergy response");
      setReviews(data); callbacks.current.onAvailabilityChange?.(true);
    } catch {
      if (mounted.current && token === generation.current) setReadError("Allergy history unavailable. Retry before relying on this status.");
    } finally { if (mounted.current && token === generation.current) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true; load();
    return () => { mounted.current = false; generation.current += 1; };
  }, [patientId]);
  function start() {
    setBase(latest); setDraft({ assessment: latest?.assessment || "", allergies: latest?.allergies.map(row => ({ ...row })) || [], reason: "" });
    setConflict(false); setError(""); setMessage("");
  }
  function update(id, field, value) {
    setDraft(current => ({ ...current, allergies: current.allergies.map(row => row.id !== id ? row : field === "verification_status"
      ? { ...row, verification_status: value, clinical_status: value === "entered-in-error" ? null : row.clinical_status || "active" } : { ...row, [field]: value }) }));
  }
  async function save(event) {
    event.preventDefault();
    if (busy.current || disabled || conflict || (!submission.current.hasPending() && (loading || readError))) return;
    let payload;
    try { payload = allergyPayload(patientId, base?.id || null, draft); } catch (error) { setError(error.message); return; }
    busy.current = true; setSaving(true); setError(""); setMessage(""); callbacks.current.onPendingChange?.(true);
    try {
      const saved = await submission.current.save(payload, base?.revision || 0, staff.id);
      if (!mounted.current) return;
      setReviews(rows => [saved, ...rows.filter(row => row.id !== saved.id)].slice(0,20)); setDraft(null); setUnconfirmed(false);
      setMessage(`Allergy review saved as revision ${saved.revision}.`); load();
    } catch (error) {
      if (mounted.current) { setError(error.message); setUnconfirmed(submission.current.hasPending()); if (error.code === "40001") { setConflict(true); callbacks.current.onAvailabilityChange?.(false); } }
    } finally {
      busy.current = false;
      if (mounted.current) { setSaving(false); callbacks.current.onPendingChange?.(submission.current.hasPending()); }
    }
  }
  return <section className="clinic-allergy-panel" aria-label="Allergy review">
    <div className="clinic-allergy-heading"><h3>Allergies and intolerances</h3><button type="button" className="wl-btn" disabled={locked || loading} onClick={load}>Refresh allergies</button></div>
    {loading ? <p role="status">Loading allergy history…</p> : readError ? <p role="alert">{readError}</p> : <>
      <p className="clinic-allergy-status"><strong>{latest ? allergyStates[latest.assessment] : "Not assessed — allergy status unknown"}</strong></p>
      {latest && <p className="clinic-allergy-meta">Review {latest.revision} · {new Date(latest.recorded_at).toLocaleString()} · Recorder {latest.recorded_by}</p>}
      {latest?.allergies.map(row => <p key={row.id}><strong>{row.substance}</strong> · {row.verification_status} {row.clinical_status && `· ${row.clinical_status}`}<br />
        {row.reaction ? `Reaction: ${row.reaction}${row.severity ? ` (${row.severity})` : ""}` : "Reaction not recorded"} · Future risk: {row.criticality}{row.note && <><br />{row.note}</>}</p>)}
    </>}
    <p className="clinic-allergy-meta">Review with the patient. Reaction severity and future risk are separate assessments. No automatic drug matching is performed.</p>
    {message && <p role="status">{message}</p>}
    {editable && !draft && <button type="button" className="wl-btn" disabled={locked || loading || !!readError} onClick={start}>{latest ? "Review / correct allergies" : "Record allergy assessment"}</button>}
    {draft && <form onSubmit={save}>
      <fieldset disabled={locked || loading || !!readError || conflict}>
        <label>Assessment<select className="wl-input" value={draft.assessment} onChange={event => setDraft({ ...draft, assessment: event.target.value })} required>
          <option value="">Choose assessment</option>{Object.entries(allergyStates).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {draft.allergies.map((row,index) => <div key={row.id} className="clinic-allergy-entry">
          <h4>Record {index+1}</h4><div className="wl-form-grid clinic-allergy-grid">
            <label>Substance {index+1}<input className="wl-input" maxLength={200} value={row.substance} onChange={event => update(row.id,"substance",event.target.value)} required /></label>
            <label>Reaction {index+1}<input className="wl-input" maxLength={500} value={row.reaction} onChange={event => update(row.id,"reaction",event.target.value)} /></label>
            <Choice label={`Verification ${index+1}`} value={row.verification_status} options={["unconfirmed","confirmed","refuted","entered-in-error"]} onChange={value => update(row.id,"verification_status",value)} />
            <Choice label={`Clinical status ${index+1}`} value={row.clinical_status || ""} options={["active","inactive","resolved"]} disabled={row.verification_status==="entered-in-error"} onChange={value => update(row.id,"clinical_status",value)} />
            <Choice label={`Reaction severity ${index+1}`} value={row.severity} options={["mild","moderate","severe"]} blank="Not recorded" onChange={value => update(row.id,"severity",value)} />
            <Choice label={`Future risk ${index+1}`} value={row.criticality} options={["unable-to-assess","low","high"]} onChange={value => update(row.id,"criticality",value)} />
            <Choice label={`Category ${index+1}`} value={row.category} options={["food","medication","environment","biologic"]} blank="Unknown" onChange={value => update(row.id,"category",value)} />
            <Choice label={`Mechanism ${index+1}`} value={row.type} options={["allergy","intolerance"]} blank="Unknown" onChange={value => update(row.id,"type",value)} />
            <label>Note {index+1}<textarea className="wl-input" maxLength={1000} value={row.note} onChange={event => update(row.id,"note",event.target.value)} /></label>
          </div>{!base?.allergies.some(prior => prior.id===row.id) && <button type="button" className="wl-btn" onClick={() => setDraft({ ...draft, allergies: draft.allergies.filter(item => item.id!==row.id) })}>Remove unsaved record {index+1}</button>}
        </div>)}
        <button type="button" className="wl-btn" disabled={draft.allergies.length>=50} onClick={() => setDraft({ ...draft, assessment:"known", allergies:[...draft.allergies,newAllergy()] })}>Add allergy / intolerance</button>
        <label>Review / correction reason<textarea className="wl-input" required maxLength={1000} value={draft.reason} onChange={event => setDraft({ ...draft, reason:event.target.value })} /></label>
      </fieldset>
      {unconfirmed && <p role="status">Save unconfirmed. Retry these exact details before changing patient or leaving the screen.</p>}
      {error && <p role="alert">{error}</p>}
      {conflict && <p role="alert">Another review was saved. Refresh allergies, compare the latest status and corrections, then explicitly keep your draft or discard it.</p>}
      <div className="clinic-allergy-heading">
        {conflict ? <button type="button" className="wl-btn" disabled={locked || loading || !!readError || latest?.id===base?.id} onClick={() => {setBase(latest);setConflict(false);setError("");callbacks.current.onAvailabilityChange?.(true);}}>Use refreshed revision with my draft</button>
          : <button type="submit" className="wl-btn" disabled={disabled || saving || (!unconfirmed && (loading || !!readError))}>{saving ? "Saving allergy review…" : unconfirmed ? "Retry allergy save" : "Save allergy review"}</button>}
        <button type="button" className="wl-btn" disabled={locked} onClick={() => {setDraft(null);setConflict(false);setError("");callbacks.current.onAvailabilityChange?.(!loading&&!readError);}}>Discard allergy draft</button>
      </div>
    </form>}
    {reviews.length>0 && <details><summary>Recent review / correction history (up to 20)</summary>{reviews.map(review => <article key={review.id} className="clinic-allergy-entry">
      <strong>Revision {review.revision} · {allergyStates[review.assessment]}</strong><p>{review.change_reason}</p><p className="clinic-allergy-meta">{new Date(review.recorded_at).toLocaleString()} · Recorder {review.recorded_by}</p>
      {review.allergies.map(row => <p key={row.id}>{row.substance} · {row.verification_status} · {row.clinical_status || "No clinical status"} · Reaction: {row.reaction || "not recorded"} · Severity: {row.severity || "not recorded"} · Future risk: {row.criticality}{row.note && ` · ${row.note}`}</p>)}
    </article>)}</details>}
  </section>;
}
function Choice({ label, value, options, blank, disabled, onChange }) {
  return <label>{label}<select className="wl-input" disabled={disabled} value={value} onChange={event => onChange(event.target.value)}>
    {(blank || value==="") && <option value="">{blank || "Not applicable"}</option>}{options.map(option => <option key={option} value={option}>{option}</option>)}
  </select></label>;
}

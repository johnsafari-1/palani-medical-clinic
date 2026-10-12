import { useEffect, useRef, useState } from "react";
import { Plus, Search, User, AlertCircle, UserPlus, Clock, Send } from "lucide-react";
import { supabase } from "../supabaseClient";
import Header from "./Header";
import PatientRecord from "./PatientRecord";
import { createIncomingReferralSubmission, incomingReferralPayload } from "../clinical/referralSubmission";
const emptyReferral = () => ({facility_name:"",referring_doctor:"",reason:"",urgency:"Routine",notes:""});

export default function ReceptionistDashboard({ staff, onLogout }) {
  const [patients, setPatients] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", dob: "", gender: "Female", phone: "", address: "" });
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");
  const [justAdded, setJustAdded] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [referralPatient, setReferralPatient] = useState(null);
  const [incomingSaving, setIncomingSaving] = useState(false);
  const [incomingUnconfirmed, setIncomingUnconfirmed] = useState(false);
  const incomingLock = useRef(false);
  const incomingSubmission = useRef(null);
  const mounted = useRef(false);
  if (!incomingSubmission.current) incomingSubmission.current = createIncomingReferralSubmission(supabase);
  const [incomingReferralForm, setIncomingReferralForm] = useState(emptyReferral);
  const [incomingReferralError, setIncomingReferralError] = useState("");
  const [referralSavedId, setReferralSavedId] = useState(null);

  async function loadPatients() {
    setLoading(true);
    const [{ data, error }, { data: visitData }] = await Promise.all([
      supabase.from("patients").select("*").order("registered_at", { ascending: false }),
      supabase.from("visits").select("*").in("status", ["Waiting", "In Consultation"]),
    ]);
    if (!error) setPatients(data);
    setVisits(visitData || []);
    setLoading(false);
  }

  useEffect(() => {
    mounted.current = true; loadPatients();
    return () => { mounted.current = false; };
  }, []);

  async function checkIn(patientId) {
    await supabase.from("visits").insert({ patient_id: patientId, checked_in_by: staff.id });
    loadPatients();
  }

  function openIncomingReferralForm(patient) {
    if (incomingLock.current || incomingSubmission.current.hasPending()) return;
    setReferralPatient(patient); setIncomingReferralForm(emptyReferral());
    setIncomingReferralError(""); setIncomingUnconfirmed(false); setReferralSavedId(null);
  }

  function cancelIncomingReferralForm() {
    if (incomingLock.current || incomingSubmission.current.hasPending()) return;
    setReferralPatient(null); setIncomingReferralError("");
  }

  async function submitIncomingReferral(e) {
    e.preventDefault();
    if (!referralPatient || incomingLock.current) return;
    let payload;
    try { payload = incomingReferralPayload(referralPatient.id, incomingReferralForm); }
    catch (error) { setIncomingReferralError(error.message); return; }
    incomingLock.current = true; setIncomingSaving(true); setIncomingReferralError("");
    try {
      const data = await incomingSubmission.current.save(payload, staff.id);
      if (!mounted.current) return;
      setReferralPatient(null); setIncomingReferralForm(emptyReferral()); setIncomingUnconfirmed(false);
      setReferralSavedId(`${data.code} — ${referralPatient.name} (${referralPatient.code})`);
    } catch (error) {
      if (mounted.current) { setIncomingReferralError(error.message); setIncomingUnconfirmed(incomingSubmission.current.hasPending()); }
    } finally {
      incomingLock.current = false;
      if (mounted.current) setIncomingSaving(false);
    }
  }

  function validateForm() {
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name || !form.dob || !phone) {
      return "Fill in name, date of birth, and phone number.";
    }
    const phoneDigits = phone.replace(/[\s+-]/g, "");
    if (!/^\d{7,15}$/.test(phoneDigits)) {
      return "Enter a valid phone number (7–15 digits).";
    }
    const dobDate = new Date(form.dob);
    const today = new Date();
    const minDate = new Date();
    minDate.setFullYear(today.getFullYear() - 120);
    if (dobDate > today) {
      return "Date of birth can't be in the future.";
    }
    if (dobDate < minDate) {
      return "That date of birth looks incorrect — please check it.";
    }
    return null;
  }

  function findDuplicate() {
    const name = form.name.trim().toLowerCase();
    return patients.find((p) => p.name.trim().toLowerCase() === name && p.dob === form.dob);
  }

  async function insertPatient() {
    const { data, error } = await supabase
      .from("patients")
      .insert({
        name: form.name.trim(),
        dob: form.dob,
        gender: form.gender,
        phone: form.phone.trim(),
        address: form.address.trim(),
        registered_by: staff.id,
      })
      .select()
      .single();

    if (error) {
      setFormError(error.message);
      return;
    }
    setForm({ name: "", dob: "", gender: "Female", phone: "", address: "" });
    setFormError("");
    setDuplicateWarning(null);
    setJustAdded(data.code);
    setTimeout(() => setJustAdded(null), 3000);
    loadPatients();
  }

  async function addPatient(e) {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError("");

    const duplicate = findDuplicate();
    if (duplicate) {
      setDuplicateWarning(duplicate);
      return;
    }

    await insertPatient();
  }

  async function confirmRegisterAnyway() {
    await insertPatient();
  }

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.phone.includes(q);
  });

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div id="clinic-content" role="main" tabIndex={-1} className="wl-page" style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Patient registration</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Register a new patient and give them a patient ID for their visit.</p>

        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <form onSubmit={addPatient} className="wl-form-grid" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Full name</label>
              <input className="wl-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Amina Wanjiru" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Date of birth</label>
              <input className="wl-input" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Gender</label>
              <select className="wl-input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Phone number</label>
              <input className="wl-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07XX XXX XXX" />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Address (optional)</label>
              <input className="wl-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Estate, town" />
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
              <button className="wl-btn" type="submit" style={{ background: "#2B6777", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} /> Register patient
              </button>
              {formError && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#A13D3D", fontSize: 13 }}>
                  <AlertCircle size={14} /> {formError}
                </span>
              )}
              {justAdded && <span style={{ fontSize: 13, color: "#2F7D4F", fontFamily: "IBM Plex Mono, monospace" }}>Registered as {justAdded}</span>}
            </div>
          </form>
        </div>

        {duplicateWarning && (
          <div className="wl-fade-in" style={{ background: "#C77D2E1A", border: "1px solid #C77D2E44", borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#C77D2E" }}>
              <AlertCircle size={16} />
              <strong style={{ fontSize: 13 }}>Possible duplicate patient</strong>
            </div>
            <p style={{ fontSize: 13, color: "#5B6B72", margin: "0 0 12px" }}>
              A patient named <strong>{duplicateWarning.name}</strong> with the same date of birth is already registered as <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{duplicateWarning.code}</span>.
            </p>
            <p style={{ fontSize: 12, color: "#5B6B72", margin: "0 0 12px", background: "#fff", borderRadius: 8, padding: "10px 12px" }}>
              <strong>If this is a returning patient</strong>, don't register them again — search for <strong>{duplicateWarning.name}</strong> in the list below instead and use their existing ID, so their history stays in one place.
              <br /><br />
              Only continue below if this is genuinely a different person (e.g. twins) who happens to share the same name and birth date.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="wl-btn" onClick={confirmRegisterAnyway} style={{ background: "#C77D2E", color: "#fff" }}>This is a different person — register anyway</button>
              <button className="wl-btn" onClick={() => setDuplicateWarning(null)} style={{ background: "#F5F7F8", color: "#5B6B72" }}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: 0 }}>
            All patients <span style={{ color: "#7C8A90", fontWeight: 500 }}>({patients.length})</span>
          </h3>
          <div style={{ position: "relative", width: 240 }}>
            <Search size={14} color="#7C8A90" style={{ position: "absolute", left: 10, top: 11 }} />
            <input className="wl-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, ID, or phone" style={{ paddingLeft: 32 }} />
          </div>
        </div>

        {referralSavedId && (
          <div role="status" className="wl-fade-in" style={{ fontSize: 13, color: "#2F7D4F", fontFamily: "IBM Plex Mono, monospace", marginBottom: 12 }}>
            Incoming referral logged as {referralSavedId}
          </div>
        )}

        {referralPatient && <section className="wl-record-section" aria-label="Incoming referral editor" style={{marginBottom:16}}>
          <h3>Incoming referral — {referralPatient.name} ({referralPatient.code})</h3>
          <p>Record the referring facility’s information. This does not check the patient in or complete a queue visit.</p>
          <form onSubmit={submitIncomingReferral}>
            <fieldset disabled={incomingSaving || incomingUnconfirmed} style={{border:0,padding:0,margin:0,minWidth:0}}>
              <div className="wl-form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <label>Referring facility<input className="wl-input" maxLength={500} value={incomingReferralForm.facility_name} onChange={e=>setIncomingReferralForm({...incomingReferralForm,facility_name:e.target.value})}/></label>
                <label>Referring doctor (reported)<input className="wl-input" maxLength={500} value={incomingReferralForm.referring_doctor} onChange={e=>setIncomingReferralForm({...incomingReferralForm,referring_doctor:e.target.value})}/></label>
              </div>
              <label>Reason given for referral<textarea className="wl-input" rows={3} maxLength={10000} value={incomingReferralForm.reason} onChange={e=>setIncomingReferralForm({...incomingReferralForm,reason:e.target.value})}/></label>
              <label>Reported urgency<select className="wl-input" value={incomingReferralForm.urgency} onChange={e=>setIncomingReferralForm({...incomingReferralForm,urgency:e.target.value})}><option>Routine</option><option>Urgent</option><option>Emergency</option></select></label>
              <label>Additional notes<textarea className="wl-input" rows={2} maxLength={50000} value={incomingReferralForm.notes} onChange={e=>setIncomingReferralForm({...incomingReferralForm,notes:e.target.value})}/></label>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}><button className="wl-btn" type="submit" disabled={incomingSaving || incomingUnconfirmed}>{incomingSaving ? "Saving incoming referral…" : "Save incoming referral"}</button><button className="wl-btn" type="button" onClick={cancelIncomingReferralForm}>Cancel incoming referral</button></div>
            </fieldset>
            {incomingUnconfirmed && <p role="status">Save unconfirmed. Retry this exact referral before changing its patient or details.</p>}
            {incomingReferralError && <p role="alert" className="wl-alert">{incomingReferralError}</p>}
            {incomingUnconfirmed && <button className="wl-btn" type="button" disabled={incomingSaving} onClick={submitIncomingReferral}>Retry incoming referral save</button>}
          </form>
        </section>}

        <p style={{ fontSize: 12, color: "#7C8A90", margin: "-4px 0 8px" }}>Click any patient to see their full record — consultations, vitals, labs, admissions, and invoices in one place.</p>
        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading patients…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>
              {patients.length === 0 ? "No patients registered yet. Add the first one above." : "No patients match your search."}
            </div>
          ) : (
            filtered.map((p, i) => {
              const activeVisit = visits.find((v) => v.patient_id === p.id);
              return (
                <div key={p.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                  <div
                    className="wl-row"
                    onClick={() => setSelectedPatient(p)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#7C5CBF1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <User size={16} color="#7C5CBF" />
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                          {activeVisit && (
                            <span className="wl-badge" style={{ background: activeVisit.status === "Waiting" ? "#C77D2E1A" : "#3D6FB41A", color: activeVisit.status === "Waiting" ? "#C77D2E" : "#3D6FB4" }}>
                              <Clock size={11} /> {activeVisit.status}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "#7C8A90" }}>{p.gender} · DOB {p.dob} · {p.phone}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, fontWeight: 500 }}>{p.code}</div>
                        <div style={{ fontSize: 11, color: "#7C8A90" }}>Registered {p.registered_at?.slice(0, 10)}</div>
                      </div>
                      <button
                        className="wl-btn"
                        onClick={(e) => { e.stopPropagation(); openIncomingReferralForm(p); }}
                        style={{ background: "#7C5CBF1A", color: "#7C5CBF", fontSize: 12, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
                        disabled={incomingSaving || incomingUnconfirmed}
                        aria-label={`Log incoming referral for ${p.name}`}
                        title="Log an incoming referral for this patient"
                      >
                        <Send size={13} /> Referral
                      </button>
                      {!activeVisit && (
                        <button
                          className="wl-btn"
                          onClick={(e) => { e.stopPropagation(); checkIn(p.id); }}
                          style={{ background: "#2B6777", color: "#fff", fontSize: 12, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
                        >
                          <UserPlus size={13} /> Check in
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              );
            })
          )}
        </div>
      </div>
      {selectedPatient && <PatientRecord patient={selectedPatient} staff={staff} onClose={() => setSelectedPatient(null)} />}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Search, User, AlertCircle, Clock } from "lucide-react";
import { supabase } from "../supabaseClient";
import Header from "./Header";
import { createVitalsSubmission, emptyVitals, vitalsPayload } from "../clinical/vitalsSubmission";

export default function NurseDashboard({ staff, onLogout }) {
  const [patients, setPatients] = useState([]);
  const [queue, setQueue] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(emptyVitals);
  const [formError, setFormError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [patientsError, setPatientsError] = useState("");
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [queueError, setQueueError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const historyRequest = useRef(0);
  const submission = useRef(null);
  if (!submission.current) submission.current = createVitalsSubmission(supabase);
  const locked = saving || unconfirmed;

  async function loadPatients() {
    setPatientsLoading(true); setPatientsError("");
    try {
      const { data, error } = await supabase.from("patients").select("*").order("name");
      if (error || !Array.isArray(data)) throw new Error("Patients unavailable");
      if (mounted.current) setPatients(data);
    } catch { if (mounted.current) setPatientsError("Patient list could not be loaded. Retry before selecting a patient."); }
    finally { if (mounted.current) setPatientsLoading(false); }
  }
  async function loadQueue() {
    try {
      const { data, error } = await supabase.from("visits").select("*, patients(id, name, code)")
        .in("status", ["Waiting", "In Consultation"]).order("checked_in_at", { ascending: true });
      if (error || !Array.isArray(data)) throw new Error("Queue unavailable");
      if (mounted.current) { setQueue(data); setQueueError(""); }
    } catch { if (mounted.current) setQueueError("Queue could not be loaded. Displayed entries may be out of date."); }
  }
  useEffect(() => {
    mounted.current = true; loadPatients(); loadQueue();
    return () => { mounted.current = false; historyRequest.current += 1; };
  }, []);

  const selected = patients.find(p => p.id === selectedId) || null;
  async function loadHistory(patientId) {
    const request = ++historyRequest.current;
    setHistoryLoading(true); setHistoryError("");
    try {
      const { data, error } = await supabase.from("vitals").select("*").eq("patient_id", patientId).order("recorded_at", { ascending: false });
      if (request !== historyRequest.current || !mounted.current) return;
      if (error || !Array.isArray(data)) throw new Error("History unavailable");
      setHistory(data);
    } catch { if (request === historyRequest.current && mounted.current) setHistoryError("Vitals history could not be loaded. Retry before recording new readings."); }
    finally { if (request === historyRequest.current && mounted.current) setHistoryLoading(false); }
  }
  function selectPatient(id) {
    if (busy.current || submission.current.hasPending() || patientsLoading || patientsError) return;
    setSelectedId(id); setHistory([]); setForm(emptyVitals()); setFormError(""); setSavedMsg(""); loadHistory(id);
  }
  async function saveVitals(e) {
    e.preventDefault();
    if (!selected || busy.current || (!submission.current.hasPending() && (historyLoading || historyError))) return;
    let payload;
    try { payload = vitalsPayload(selected.id, form); } catch (error) { setFormError(error.message); return; }
    busy.current = true; setSaving(true); setFormError(""); setSavedMsg("");
    try {
      const data = await submission.current.save(payload);
      if (!mounted.current) return;
      setUnconfirmed(false); setForm(emptyVitals()); setSavedMsg("Vitals logged as " + data.code);
      setHistory(rows => [data, ...rows.filter(row => row.id !== data.id)]);
      loadHistory(selected.id);
    } catch (error) {
      if (mounted.current) { setFormError(error.message); setUnconfirmed(submission.current.hasPending()); }
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  }

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
  });

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div id="clinic-content" role="main" tabIndex={-1} className="wl-split-page" style={{ padding: 32, maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        <div>
          {patientsLoading && <p role="status">Loading patients…</p>}
          {patientsError && <p role="alert">{patientsError} <button type="button" className="wl-btn" disabled={locked} onClick={loadPatients}>Retry patients</button></p>}
          {queueError && <p role="alert">{queueError} <button type="button" className="wl-btn" disabled={locked} onClick={loadQueue}>Retry queue</button></p>}
          {queue.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                <Clock size={14} color="#C77D2E" /> Today's queue <span style={{ color: "#7C8A90", fontWeight: 500 }}>({queue.length})</span>
              </h3>
              <div className="wl-card" style={{ overflow: "hidden" }}>
                {queue.map((v, i) => (
                  <div
                    key={v.id}
                    className="wl-row"
                    onClick={() => selectPatient(v.patient_id)}
                    style={{
                      padding: "10px 14px",
                      borderBottom: i < queue.length - 1 ? "1px solid #EEF1F2" : "none",
                      cursor: "pointer",
                      background: selectedId === v.patient_id ? "#C2467D14" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{v.patients?.name}</span>
                      <span className="wl-badge" style={{ background: v.status === "Waiting" ? "#C77D2E1A" : "#3D6FB41A", color: v.status === "Waiting" ? "#C77D2E" : "#3D6FB4", fontSize: 10 }}>
                        {v.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#7C8A90" }}>Checked in {new Date(v.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>Patients</h3>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={14} color="#7C8A90" style={{ position: "absolute", left: 10, top: 11 }} />
            <input className="wl-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or ID" style={{ paddingLeft: 32 }} />
          </div>
          <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", maxHeight: 480, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#7C8A90", fontSize: 12 }}>{patientsLoading ? "Loading patients…" : patientsError ? "Patient list unavailable." : "No patients registered yet."}</div>
            ) : (
              filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => selectPatient(p.id)}
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid #EEF1F2",
                    cursor: "pointer",
                    background: selectedId === p.id ? "#C2467D14" : "transparent",
                    borderLeft: selectedId === p.id ? "3px solid #C2467D" : "3px solid transparent",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{p.code}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          {!selected ? (
            <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 40, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>
              Select a patient to log vitals.
            </div>
          ) : (
            <div key={selected.id} className="wl-fade-in">
              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#C2467D1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <User size={18} color="#C2467D" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: "#7C8A90" }}>{selected.gender} · DOB {selected.dob} · <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{selected.code}</span></div>
                </div>
              </div>

              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 14px" }}>Log vitals</h3>
                <form onSubmit={saveVitals}>
                  <fieldset disabled={locked || historyLoading || !!historyError} style={{ border: 0, padding: 0, margin: 0 }}>
                    <div className="wl-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
                      {[["systolic", "Systolic pressure (mmHg)", "120"], ["diastolic", "Diastolic pressure (mmHg)", "80"],
                        ["temp", "Temperature (°C)", "36.8"], ["pulse", "Pulse (beats/min)", "76"], ["weight", "Weight (kg)", "68"]].map(([key, label, placeholder]) => (
                        <div key={key}><label htmlFor={`vitals-${key}`} style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label}</label>
                          <input id={`vitals-${key}`} className="wl-input" inputMode={key === "pulse" ? "numeric" : "decimal"} value={form[key]}
                            onChange={event => setForm({ ...form, [key]: event.target.value })} placeholder={placeholder} /></div>
                      ))}
                      <div><label htmlFor="vitals-measured" style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Measured at (local time)</label>
                        <input id="vitals-measured" className="wl-input" type="datetime-local" required value={form.measuredAt} onChange={event => setForm({ ...form, measuredAt: event.target.value })} /></div>
                    </div>
                  </fieldset>
                  {unconfirmed && <p role="status">The save is unconfirmed. Retry these exact readings before changing patient or leaving this screen.</p>}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button className="wl-btn" type="submit" disabled={saving || (!unconfirmed && (historyLoading || !!historyError))} style={{ background: "#C2467D", color: "#fff" }}>{saving ? "Saving…" : unconfirmed ? "Retry vitals save" : "Save vitals"}</button>
                    {formError && (
                      <span role="alert" style={{ display: "flex", alignItems: "center", gap: 6, color: "#A13D3D", fontSize: 13 }}>
                        <AlertCircle size={14} /> {formError}
                      </span>
                    )}
                    {savedMsg && <span role="status" style={{ fontSize: 13, color: "#2F7D4F", fontFamily: "IBM Plex Mono, monospace" }}>{savedMsg}</span>}
                  </div>
                </form>
              </div>

              <div>
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>Vitals history</h3>
                {historyLoading && <p role="status">Loading vitals history…</p>}
                {historyError && <p role="alert">{historyError} <button className="wl-btn" type="button" disabled={locked} onClick={() => loadHistory(selected.id)}>Retry history</button></p>}
                {history.length === 0 ? (
                  <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>
                    {historyLoading ? "Vitals history is loading." : historyError ? "Vitals history unavailable." : "No vitals recorded for this patient yet."}
                  </div>
                ) : (
                  <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
                    {history.map((v, i) => (
                      <div key={v.id} className="clinic-queue-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: i < history.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                        <div style={{ fontSize: 12, color: "#5B6B72" }}>
                          {v.bp && <span style={{ marginRight: 12 }}>BP {v.bp}</span>}
                          {v.temperature != null && <span style={{ marginRight: 12 }}>Temp {v.temperature}°C</span>}
                          {v.pulse != null && <span style={{ marginRight: 12 }}>Pulse {v.pulse} beats/min</span>}
                          {v.weight != null && <span>Weight {v.weight}kg</span>}
                        </div>
                        <span style={{ fontSize: 11, color: "#7C8A90" }}>{v.measured_at ? `Measured ${new Date(v.measured_at).toLocaleString()}` : `Logged ${v.recorded_at?.slice(0, 10)} · measurement time unavailable`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

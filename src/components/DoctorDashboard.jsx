import { useEffect, useState } from "react";
import { Search, User, Plus, X, FileText, AlertCircle, HeartPulse, FlaskConical } from "lucide-react";
import { supabase } from "../supabaseClient";
import Header from "./Header";

export default function DoctorDashboard({ staff, onLogout }) {
  const [patients, setPatients] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [vitals, setVitals] = useState([]);
  const [labResults, setLabResults] = useState([]);
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [rx, setRx] = useState([{ key: 1, drug: "", dosage: "", instructions: "" }]);
  const [labTests, setLabTests] = useState("");
  const [formError, setFormError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    supabase.from("patients").select("*").order("name").then(({ data }) => setPatients(data || []));
  }, []);

  const selected = patients.find((p) => p.id === selectedId) || null;

  async function loadHistory(patientId) {
    const { data: consultations } = await supabase
      .from("consultations")
      .select("*, prescriptions(*)")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    setHistory(consultations || []);

    const { data: vitalsData } = await supabase
      .from("vitals")
      .select("*")
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false })
      .limit(5);
    setVitals(vitalsData || []);

    const { data: labData } = await supabase
      .from("lab_orders")
      .select("*")
      .eq("patient_id", patientId)
      .order("ordered_at", { ascending: false });
    setLabResults(labData || []);
  }

  function selectPatient(id) {
    setSelectedId(id);
    setDiagnosis("");
    setNotes("");
    setRx([{ key: 1, drug: "", dosage: "", instructions: "" }]);
    setLabTests("");
    setFormError("");
    setSavedMsg("");
    loadHistory(id);
  }

  function updateRxRow(key, field, value) {
    setRx(rx.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }
  function addRxRow() {
    setRx([...rx, { key: Date.now(), drug: "", dosage: "", instructions: "" }]);
  }
  function removeRxRow(key) {
    setRx(rx.filter((r) => r.key !== key));
  }

  async function saveConsultation(e) {
    e.preventDefault();
    if (!selected) return;
    if (!diagnosis.trim()) {
      setFormError("Add a diagnosis before saving.");
      return;
    }

    const { data: consultation, error: consultError } = await supabase
      .from("consultations")
      .insert({
        patient_id: selected.id,
        doctor_id: staff.id,
        diagnosis: diagnosis.trim(),
        notes: notes.trim(),
      })
      .select()
      .single();

    if (consultError) {
      setFormError(consultError.message);
      return;
    }

    const prescriptionRows = rx
      .filter((r) => r.drug.trim())
      .map((r) => ({ consultation_id: consultation.id, drug: r.drug.trim(), dosage: r.dosage.trim(), instructions: r.instructions.trim() }));
    if (prescriptionRows.length) {
      await supabase.from("prescriptions").insert(prescriptionRows);
    }

    const testNames = labTests.split(",").map((t) => t.trim()).filter(Boolean);
    if (testNames.length) {
      const labRows = testNames.map((testName) => ({
        patient_id: selected.id,
        consultation_id: consultation.id,
        test_name: testName,
        ordered_by: staff.id,
      }));
      await supabase.from("lab_orders").insert(labRows);
    }

    setDiagnosis("");
    setNotes("");
    setRx([{ key: Date.now(), drug: "", dosage: "", instructions: "" }]);
    setLabTests("");
    setFormError("");
    setSavedMsg("Consultation saved as " + consultation.code);
    setTimeout(() => setSavedMsg(""), 3000);
    loadHistory(selected.id);
  }

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
  });

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        <div>
          <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>Patients</h3>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={14} color="#7C8A90" style={{ position: "absolute", left: 10, top: 11 }} />
            <input className="wl-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or ID" style={{ paddingLeft: 32 }} />
          </div>
          <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", maxHeight: 480, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#7C8A90", fontSize: 12 }}>No patients registered yet.</div>
            ) : (
              filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => selectPatient(p.id)}
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid #EEF1F2",
                    cursor: "pointer",
                    background: selectedId === p.id ? "#2B677714" : "transparent",
                    borderLeft: selectedId === p.id ? "3px solid #2B6777" : "3px solid transparent",
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
              Select a patient from the list to start a consultation.
            </div>
          ) : (
            <div>
              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#2F7D4F1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <User size={18} color="#2F7D4F" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: "#7C8A90" }}>{selected.gender} · DOB {selected.dob} · {selected.phone} · <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{selected.code}</span></div>
                </div>
              </div>

              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 18, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <HeartPulse size={15} color="#C2467D" />
                  <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 14, margin: 0 }}>Recent vitals</h3>
                </div>
                {vitals.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#7C8A90", margin: 0 }}>No vitals recorded for this patient yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {vitals.map((v) => (
                      <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "#5B6B72" }}>
                        <span>
                          {v.bp && <span style={{ marginRight: 10 }}>BP {v.bp}</span>}
                          {v.temperature && <span style={{ marginRight: 10 }}>Temp {v.temperature}°C</span>}
                          {v.pulse && <span style={{ marginRight: 10 }}>Pulse {v.pulse}</span>}
                          {v.weight && <span>Weight {v.weight}kg</span>}
                        </span>
                        <span style={{ color: "#7C8A90" }}>{v.recorded_at?.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 18, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <FlaskConical size={15} color="#C77D2E" />
                  <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 14, margin: 0 }}>Lab results</h3>
                </div>
                {labResults.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#7C8A90", margin: 0 }}>No lab tests ordered for this patient yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {labResults.map((l) => (
                      <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "#5B6B72" }}>
                        <span>
                          <strong style={{ color: "#1E2A30" }}>{l.test_name}</strong>
                          {l.status === "Completed" ? (
                            <span style={{ marginLeft: 8 }}>— {l.result}</span>
                          ) : (
                            <span className="wl-badge" style={{ marginLeft: 8, background: "#C77D2E1A", color: "#C77D2E" }}>Pending</span>
                          )}
                        </span>
                        <span style={{ color: "#7C8A90" }}>{l.ordered_at?.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 14px" }}>New consultation</h3>
                <form onSubmit={saveConsultation}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Diagnosis</label>
                  <input className="wl-input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Acute malaria" style={{ marginBottom: 12 }} />

                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Clinical notes (optional)</label>
                  <textarea className="wl-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations, vitals, follow-up plan" rows={3} style={{ marginBottom: 16, resize: "vertical" }} />

                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>Prescription</label>
                  {rx.map((r) => (
                    <div key={r.key} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.2fr auto", gap: 8, marginBottom: 8 }}>
                      <input className="wl-input" value={r.drug} onChange={(e) => updateRxRow(r.key, "drug", e.target.value)} placeholder="Drug name" />
                      <input className="wl-input" value={r.dosage} onChange={(e) => updateRxRow(r.key, "dosage", e.target.value)} placeholder="Dosage" />
                      <input className="wl-input" value={r.instructions} onChange={(e) => updateRxRow(r.key, "instructions", e.target.value)} placeholder="Frequency / duration" />
                      <button type="button" className="wl-btn" onClick={() => removeRxRow(r.key)} style={{ background: "transparent", color: "#A13D3D", padding: 6 }} aria-label="Remove drug row">
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="wl-btn" onClick={addRxRow} style={{ background: "#F5F7F8", color: "#5B6B72", display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
                    <Plus size={13} /> Add drug
                  </button>

                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Order lab tests (optional)</label>
                  <input className="wl-input" value={labTests} onChange={(e) => setLabTests(e.target.value)} placeholder="e.g. Full blood count, Malaria test (comma-separated)" style={{ marginBottom: 16 }} />

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button className="wl-btn" type="submit" style={{ background: "#2B6777", color: "#fff" }}>Save consultation</button>
                    {formError && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#A13D3D", fontSize: 13 }}>
                        <AlertCircle size={14} /> {formError}
                      </span>
                    )}
                    {savedMsg && <span style={{ fontSize: 13, color: "#2F7D4F", fontFamily: "IBM Plex Mono, monospace" }}>{savedMsg}</span>}
                  </div>
                </form>
              </div>

              <div>
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>Consultation history</h3>
                {history.length === 0 ? (
                  <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>
                    No previous consultations for this patient.
                  </div>
                ) : (
                  <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
                    {history.map((c, i) => (
                      <div key={c.id} style={{ padding: "14px 18px", borderBottom: i < history.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <FileText size={14} color="#2F7D4F" />
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{c.diagnosis}</span>
                          </div>
                          <span style={{ fontSize: 11, color: "#7C8A90" }}>{c.created_at?.slice(0, 10)}</span>
                        </div>
                        {c.notes && <p style={{ fontSize: 12, color: "#5B6B72", margin: "0 0 8px" }}>{c.notes}</p>}
                        {c.prescriptions?.length > 0 && (
                          <div style={{ fontSize: 12, color: "#5B6B72" }}>
                            {c.prescriptions.map((p) => (
                              <div key={p.id}>• {p.drug} {p.dosage && `— ${p.dosage}`} {p.instructions && `(${p.instructions})`} {p.dispensed && <span style={{ color: "#2F7D4F" }}> ✓ dispensed</span>}</div>
                            ))}
                          </div>
                        )}
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

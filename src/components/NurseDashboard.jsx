import { useEffect, useState } from "react";
import { Search, User, AlertCircle } from "lucide-react";
import { supabase } from "../supabaseClient";
import Header from "./Header";

export default function NurseDashboard({ staff, onLogout }) {
  const [patients, setPatients] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ bp: "", temp: "", pulse: "", weight: "" });
  const [formError, setFormError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    supabase.from("patients").select("*").order("name").then(({ data }) => setPatients(data || []));
  }, []);

  const selected = patients.find((p) => p.id === selectedId) || null;

  async function loadHistory(patientId) {
    const { data } = await supabase.from("vitals").select("*").eq("patient_id", patientId).order("recorded_at", { ascending: false });
    setHistory(data || []);
  }

  function selectPatient(id) {
    setSelectedId(id);
    setForm({ bp: "", temp: "", pulse: "", weight: "" });
    setFormError("");
    setSavedMsg("");
    loadHistory(id);
  }

  async function saveVitals(e) {
    e.preventDefault();
    if (!selected) return;
    if (!form.bp.trim() && !form.temp.trim() && !form.pulse.trim() && !form.weight.trim()) {
      setFormError("Enter at least one reading.");
      return;
    }
    const { data, error } = await supabase
      .from("vitals")
      .insert({
        patient_id: selected.id,
        bp: form.bp.trim(),
        temperature: form.temp.trim() || null,
        pulse: form.pulse.trim() || null,
        weight: form.weight.trim() || null,
        recorded_by: staff.id,
      })
      .select()
      .single();

    if (error) {
      setFormError(error.message);
      return;
    }
    setForm({ bp: "", temp: "", pulse: "", weight: "" });
    setFormError("");
    setSavedMsg("Vitals logged as " + data.code);
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
            <div>
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Blood pressure</label>
                      <input className="wl-input" value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} placeholder="120/80" />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Temp (°C)</label>
                      <input className="wl-input" value={form.temp} onChange={(e) => setForm({ ...form, temp: e.target.value })} placeholder="36.8" />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Pulse (bpm)</label>
                      <input className="wl-input" value={form.pulse} onChange={(e) => setForm({ ...form, pulse: e.target.value })} placeholder="76" />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Weight (kg)</label>
                      <input className="wl-input" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="68" />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button className="wl-btn" type="submit" style={{ background: "#C2467D", color: "#fff" }}>Save vitals</button>
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
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>Vitals history</h3>
                {history.length === 0 ? (
                  <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>
                    No vitals recorded for this patient yet.
                  </div>
                ) : (
                  <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
                    {history.map((v, i) => (
                      <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: i < history.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                        <div style={{ fontSize: 12, color: "#5B6B72" }}>
                          {v.bp && <span style={{ marginRight: 12 }}>BP {v.bp}</span>}
                          {v.temperature && <span style={{ marginRight: 12 }}>Temp {v.temperature}°C</span>}
                          {v.pulse && <span style={{ marginRight: 12 }}>Pulse {v.pulse}</span>}
                          {v.weight && <span>Weight {v.weight}kg</span>}
                        </div>
                        <span style={{ fontSize: 11, color: "#7C8A90" }}>{v.recorded_at?.slice(0, 10)}</span>
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

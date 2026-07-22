import { useEffect, useState } from "react";
import { Plus, Search, User, AlertCircle } from "lucide-react";
import { supabase } from "../supabaseClient";
import Header from "./Header";

export default function ReceptionistDashboard({ staff, onLogout }) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", dob: "", gender: "Female", phone: "", address: "" });
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");
  const [justAdded, setJustAdded] = useState(null);

  async function loadPatients() {
    setLoading(true);
    const { data, error } = await supabase.from("patients").select("*").order("registered_at", { ascending: false });
    if (!error) setPatients(data);
    setLoading(false);
  }

  useEffect(() => {
    loadPatients();
  }, []);

  async function addPatient(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.dob || !form.phone.trim()) {
      setFormError("Fill in name, date of birth, and phone number.");
      return;
    }
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
    setJustAdded(data.code);
    setTimeout(() => setJustAdded(null), 3000);
    loadPatients();
  }

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.phone.includes(q);
  });

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Patient registration</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Register a new patient and give them a patient ID for their visit.</p>

        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <form onSubmit={addPatient} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 10 }}>
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: 0 }}>
            All patients <span style={{ color: "#7C8A90", fontWeight: 500 }}>({patients.length})</span>
          </h3>
          <div style={{ position: "relative", width: 240 }}>
            <Search size={14} color="#7C8A90" style={{ position: "absolute", left: 10, top: 11 }} />
            <input className="wl-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, ID, or phone" style={{ paddingLeft: 32 }} />
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading patients…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>
              {patients.length === 0 ? "No patients registered yet. Add the first one above." : "No patients match your search."}
            </div>
          ) : (
            filtered.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: i < filtered.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#7C5CBF1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <User size={16} color="#7C5CBF" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#7C8A90" }}>{p.gender} · DOB {p.dob} · {p.phone}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, fontWeight: 500 }}>{p.code}</div>
                  <div style={{ fontSize: 11, color: "#7C8A90" }}>Registered {p.registered_at?.slice(0, 10)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

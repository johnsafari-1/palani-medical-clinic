import { useEffect, useState } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { supabase } from "../supabaseClient";
import { ROLES, roleMeta } from "../constants";
import Header from "./Header";
import PriceListManager from "./PriceListManager";

// NOTE: your Edge Function may be named "create-staff" or "quick-handler"
// depending on what you named it when deploying. Update this if needed.
const CREATE_STAFF_FUNCTION = "quick-handler";

export default function AdminDashboard({ staff, onLogout }) {
  const [tab, setTab] = useState("staff");
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "Receptionist" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadStaff() {
    setLoading(true);
    const { data, error } = await supabase.from("staff").select("*").order("created_at", { ascending: true });
    if (!error) setStaffList(data);
    setLoading(false);
  }

  useEffect(() => {
    loadStaff();
  }, []);

  async function addStaff(e) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim() || !form.username.trim() || !form.password.trim()) {
      setFormError("Fill in name, username, and password.");
      return;
    }
    setSubmitting(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke(CREATE_STAFF_FUNCTION, {
      body: { name: form.name.trim(), username: form.username.trim(), password: form.password, role: form.role },
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    });
    setSubmitting(false);
    if (error || data?.error) {
      setFormError(data?.error || error.message || "Could not create staff account.");
      return;
    }
    setForm({ name: "", username: "", password: "", role: "Receptionist" });
    loadStaff();
  }

  async function removeStaff(id) {
    // Note: this only removes the staff row. Deleting the login itself
    // requires an admin API call — for now this revokes their access to data
    // but the login technically still exists. A follow-up Edge Function can
    // handle full deletion if you need it later.
    await supabase.from("staff").delete().eq("id", id);
    loadStaff();
  }

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <button
            className="wl-btn"
            onClick={() => setTab("staff")}
            style={{ background: tab === "staff" ? "#2B6777" : "#F5F7F8", color: tab === "staff" ? "#fff" : "#5B6B72" }}
          >
            Staff accounts
          </button>
          <button
            className="wl-btn"
            onClick={() => setTab("price")}
            style={{ background: tab === "price" ? "#2B6777" : "#F5F7F8", color: tab === "price" ? "#fff" : "#5B6B72" }}
          >
            Price list
          </button>
        </div>

        {tab === "price" ? (
          <>
            <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Price list</h2>
            <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Manage what the Cashier can bill for — consultations, medications, lab tests, and procedures.</p>
            <PriceListManager />
          </>
        ) : (
        <>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Staff accounts</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Create logins for each department. Staff sign in with the username and password you set here.</p>

        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <form onSubmit={addStaff} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Full name</label>
              <input className="wl-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Mwangi" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Username</label>
              <input className="wl-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="jmwangi" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Password</label>
              <input className="wl-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Temporary password" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Role</label>
              <select className="wl-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.filter((r) => r.key !== "Admin").map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>
            <button className="wl-btn" type="submit" disabled={submitting} style={{ background: "#2B6777", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> {submitting ? "Adding..." : "Add"}
            </button>
          </form>
          {formError && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#A13D3D", fontSize: 12, marginTop: 10 }}>
              <AlertCircle size={14} /> {formError}
            </div>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading staff…</div>
          ) : (
            staffList.map((u, i) => {
              const meta = roleMeta(u.role);
              const Icon = meta.icon;
              return (
                <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: i < staffList.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="wl-badge" style={{ background: meta.color + "1A", color: meta.color }}>
                      <Icon size={13} /> {meta.label}
                    </span>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                  </div>
                  {u.role !== "Admin" && (
                    <button className="wl-btn" onClick={() => removeStaff(u.id)} style={{ background: "transparent", color: "#A13D3D", padding: 6 }} aria-label="Remove staff">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

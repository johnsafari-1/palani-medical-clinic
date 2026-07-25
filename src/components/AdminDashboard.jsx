import { useEffect, useState } from "react";
import { Plus, Trash2, AlertCircle, KeyRound, Ban, RotateCcw, Check, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { ROLES, roleMeta } from "../constants";
import Header from "./Header";
import PriceListManager from "./PriceListManager";
import ReportsPanel from "./ReportsPanel";

// NOTE: your Edge Function may be named "create-staff" or "quick-handler"
// depending on what you named it when deploying. Update this if needed.
const STAFF_FUNCTION = "quick-handler";

export default function AdminDashboard({ staff, onLogout }) {
  const [tab, setTab] = useState("staff");
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "Receptionist" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [resetId, setResetId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [actionError, setActionError] = useState("");

  async function loadStaff() {
    setLoading(true);
    const { data, error } = await supabase.from("staff").select("*").order("created_at", { ascending: true });
    if (!error) setStaffList(data);
    setLoading(false);
  }

  useEffect(() => {
    loadStaff();
  }, []);

  async function callStaffFunction(action, payload) {
    const { data: sessionData } = await supabase.auth.getSession();
    return supabase.functions.invoke(STAFF_FUNCTION, {
      body: { action, ...payload },
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    });
  }

  async function addStaff(e) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim() || !form.username.trim() || !form.password.trim()) {
      setFormError("Fill in name, username, and password.");
      return;
    }
    setSubmitting(true);
    const { data, error } = await callStaffFunction("create", {
      name: form.name.trim(),
      username: form.username.trim(),
      password: form.password,
      role: form.role,
    });
    setSubmitting(false);
    if (error || data?.error) {
      setFormError(data?.error || error.message || "Could not create staff account.");
      return;
    }
    setForm({ name: "", username: "", password: "", role: "Receptionist" });
    loadStaff();
  }

  async function toggleActive(u) {
    setActionError("");
    setBusyId(u.id);
    const { data, error } = await callStaffFunction(u.active ? "deactivate" : "reactivate", { staffId: u.id });
    setBusyId(null);
    if (error || data?.error) {
      setActionError(data?.error || error.message || "Could not update this account.");
      return;
    }
    loadStaff();
  }

  async function submitPasswordReset(u) {
    if (!newPassword.trim()) return;
    setActionError("");
    setBusyId(u.id);
    const { data, error } = await callStaffFunction("reset_password", { staffId: u.id, newPassword: newPassword.trim() });
    setBusyId(null);
    if (error || data?.error) {
      setActionError(data?.error || error.message || "Could not reset password.");
      return;
    }
    setResetId(null);
    setNewPassword("");
  }

  async function removeStaff(id) {
    // This only removes the app-level staff row (their dashboard access
    // and data association). Their login itself is handled separately —
    // deactivate it first using the button above if you want to fully
    // block sign-in, since this alone does not delete their credentials.
    await supabase.from("staff").delete().eq("id", id);
    loadStaff();
  }

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <button
            className="wl-btn wl-tab"
            onClick={() => setTab("staff")}
            style={{ background: tab === "staff" ? "#2B6777" : "#F5F7F8", color: tab === "staff" ? "#fff" : "#5B6B72" }}
          >
            Staff accounts
          </button>
          <button
            className="wl-btn wl-tab"
            onClick={() => setTab("price")}
            style={{ background: tab === "price" ? "#2B6777" : "#F5F7F8", color: tab === "price" ? "#fff" : "#5B6B72" }}
          >
            Price list
          </button>
          <button
            className="wl-btn wl-tab"
            onClick={() => setTab("reports")}
            style={{ background: tab === "reports" ? "#2B6777" : "#F5F7F8", color: tab === "reports" ? "#fff" : "#5B6B72" }}
          >
            Reports
          </button>
        </div>

        {tab === "reports" ? (
          <>
            <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Reports</h2>
            <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>A snapshot of how the clinic is running right now.</p>
            <ReportsPanel />
          </>
        ) : tab === "price" ? (
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

        {actionError && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#A13D3D", fontSize: 12, marginBottom: 10 }}>
            <AlertCircle size={14} /> {actionError}
          </div>
        )}

        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading staff…</div>
          ) : (
            staffList.map((u, i) => {
              const meta = roleMeta(u.role);
              const Icon = meta.icon;
              return (
                <div key={u.id} className="wl-row" style={{ padding: "14px 20px", borderBottom: i < staffList.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="wl-badge" style={{ background: meta.color + "1A", color: meta.color }}>
                        <Icon size={13} /> {meta.label}
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                      {u.active === false && (
                        <span className="wl-badge" style={{ background: "#A13D3D1A", color: "#A13D3D" }}>Deactivated</span>
                      )}
                    </div>
                    {u.role !== "Admin" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          className="wl-btn icon-btn"
                          onClick={() => { setResetId(resetId === u.id ? null : u.id); setNewPassword(""); setActionError(""); }}
                          aria-label="Reset password"
                          title="Reset password"
                        >
                          <KeyRound size={15} color="#3D6FB4" />
                        </button>
                        <button
                          className="wl-btn icon-btn"
                          onClick={() => toggleActive(u)}
                          disabled={busyId === u.id}
                          aria-label={u.active === false ? "Reactivate staff" : "Deactivate staff"}
                          title={u.active === false ? "Reactivate this login" : "Deactivate this login (blocks sign-in)"}
                        >
                          {u.active === false ? <RotateCcw size={15} color="#2F7D4F" /> : <Ban size={15} color="#C77D2E" />}
                        </button>
                        <button className="wl-btn icon-btn danger" onClick={() => removeStaff(u.id)} style={{ color: "#A13D3D" }} aria-label="Remove staff" title="Remove from staff list (does not delete login)">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                  {resetId === u.id && (
                    <div className="wl-fade-in" style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <input
                        className="wl-input"
                        type="text"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password"
                        style={{ maxWidth: 220 }}
                      />
                      <button className="wl-btn icon-btn" onClick={() => submitPasswordReset(u)} disabled={busyId === u.id} aria-label="Save new password" title="Save">
                        <Check size={15} color="#2F7D4F" />
                      </button>
                      <button className="wl-btn icon-btn" onClick={() => { setResetId(null); setNewPassword(""); }} aria-label="Cancel" title="Cancel">
                        <X size={15} color="#7C8A90" />
                      </button>
                    </div>
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

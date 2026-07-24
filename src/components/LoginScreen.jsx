import { useRef, useState } from "react";
import { Lock, AlertCircle } from "lucide-react";
import { supabase, usernameToEmail } from "../supabaseClient";
import { ROLES } from "../constants";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeRole, setActiveRole] = useState(null);
  const usernameRef = useRef(null);

  function handleRoleClick(role) {
    setActiveRole(role);
    usernameRef.current?.focus();
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    setLoading(false);
    if (authError) {
      setError("Username or password is incorrect.");
    }
    // On success, App.jsx's onAuthStateChange listener picks up the session automatically.
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{ flex: "0 0 380px", padding: "56px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 8, height: 28, borderRadius: 2, background: "#2B6777" }} />
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 22 }}>Palani Medical Clinic</span>
        </div>
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 20, margin: "0 0 6px" }}>Welcome to Palani</h1>
        <p style={{ color: "#5B6B72", fontSize: 14, margin: "0 0 28px" }}>Every department, one system, zero paperwork.</p>

        <form onSubmit={handleLogin}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Username</label>
            {activeRole && (
              <span className="wl-fade-in wl-badge" style={{ background: activeRole.color + "1A", color: activeRole.color }}>
                {activeRole.label}
              </span>
            )}
          </div>
          <input
            ref={usernameRef}
            className="wl-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={activeRole ? `e.g. ${activeRole.key.toLowerCase().replace(/\s+/g, "")}1` : "e.g. admin"}
            style={{ marginBottom: 6, borderColor: activeRole ? activeRole.color : undefined, boxShadow: activeRole ? `0 0 0 3px ${activeRole.color}1F` : undefined }}
          />
          {activeRole && (
            <p className="wl-fade-in" style={{ fontSize: 12, color: "#7C8A90", margin: "0 0 10px" }}>
              Ask your Admin to create this login for you — they assign the {activeRole.label} role from their dashboard.
            </p>
          )}
          <div style={{ marginBottom: activeRole ? 6 : 16 }} />
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Password</label>
          <input className="wl-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" style={{ marginBottom: 16 }} />
          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#A13D3D", fontSize: 13, marginBottom: 16 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <button className="wl-btn" type="submit" disabled={loading} style={{ width: "100%", background: activeRole ? activeRole.color : "#2B6777", color: "#fff", padding: "11px 16px" }}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div style={{ marginTop: 24, padding: 12, borderRadius: 8, background: "#EEF2F3", fontSize: 12, color: "#5B6B72", display: "flex", gap: 8 }}>
          <Lock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>First time here? Create your Admin account in Supabase Auth first (see setup guide), then sign in with it here.</span>
        </div>
      </div>

      <div style={{ flex: 1, background: "#1E2A30", padding: "56px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ color: "#8FA3AA", fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 20 }}>Staff directory</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <div
                key={r.key}
                className="wl-role-card"
                role="button"
                tabIndex={0}
                title={`Fill the form for a ${r.label} login`}
                onClick={() => handleRoleClick(r)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleRoleClick(r)}
                style={{
                  background: activeRole?.key === r.key ? "#2E3D45" : "#26343B",
                  borderRadius: 10,
                  padding: "14px 16px",
                  borderLeft: `4px solid ${r.color}`,
                  boxShadow: activeRole?.key === r.key ? `0 0 0 1px ${r.color}66` : "none",
                }}
              >
                <span className="wl-role-icon">
                  <Icon size={18} color={r.color} />
                </span>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginTop: 8 }}>{r.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

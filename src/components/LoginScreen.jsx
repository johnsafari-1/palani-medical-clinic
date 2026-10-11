import { useRef, useState } from "react";
import { Lock, AlertCircle, Eye, EyeOff, HeartPulse, ArrowRight } from "lucide-react";
import { supabase, usernameToEmail } from "../supabaseClient";
import { ROLES } from "../constants";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      if (authError) {
        setError(authError.code === "invalid_credentials" ? "Username or password is incorrect." : "Unable to sign in. Check your connection or contact your Administrator.");
      }
    } catch {
      setError("Unable to sign in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
    // AuthProvider verifies the user and staff membership before routing.
  }

  return (
    <main className="clinic-login">
      <section className="clinic-login-story" aria-label="Palani staff portal">
        <div className="clinic-brand"><span className="clinic-brand-mark"><HeartPulse size={25} aria-hidden="true" /></span><div><strong>Palani</strong><span>Medical Clinic</span></div></div>
        <div className="clinic-login-intro">
          <span className="clinic-story-tag">Your clinic. Connected.</span>
          <h1>Connected care.<br /><span>Clearer workdays.</span></h1>
          <p>From registration to care, keep your team’s daily work connected in one staff workspace.</p>
        </div>
        <div className="clinic-department-heading"><span>Find your department</span><small>Select a role to focus the sign-in form</small></div>
        <div className="clinic-department-grid">
          {ROLES.map(role => {
            const Icon = role.icon;
            return <button key={role.key} type="button" className={`clinic-department ${activeRole?.key === role.key ? "is-selected" : ""}`}
              aria-pressed={activeRole?.key === role.key} title={`Fill the form for a ${role.label} login`} onClick={() => handleRoleClick(role)}>
              <Icon size={19} aria-hidden="true" /><span>{role.label}</span><ArrowRight size={15} aria-hidden="true" />
            </button>;
          })}
        </div>
        <p className="clinic-login-footnote"><span className="clinic-test-dot" />Test workspace · Use test data only</p>
      </section>
      <section className="clinic-login-form-panel" aria-label="Staff sign in">
        <div className="clinic-login-form-card">
          <span className="clinic-eyebrow">Staff access</span>
          <h2>Welcome back</h2>
          <p className="clinic-login-description">Sign in with the account assigned by your Administrator.</p>
          {activeRole && <div className="clinic-selected-role"><activeRole.icon size={16} aria-hidden="true" />{activeRole.label}<span>Selected department</span></div>}
          <form onSubmit={handleLogin}>
            <label htmlFor="login-username">Username</label>
            <input id="login-username" name="username" autoComplete="username" required disabled={loading} ref={usernameRef}
              className="wl-input" value={username} onChange={event => setUsername(event.target.value)}
              placeholder={activeRole ? `e.g. ${activeRole.key.toLowerCase().replace(/\s+/g, "")}1` : "Enter your username"} />
            <label htmlFor="login-password">Password</label>
            <div className="clinic-password-field">
              <input id="login-password" name="password" autoComplete="current-password" required disabled={loading} className="wl-input"
                type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" />
              <button type="button" disabled={loading} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            {error && <div role="alert" className="clinic-login-error"><AlertCircle size={18} aria-hidden="true" /><span>{error}</span></div>}
            <button className="wl-btn clinic-login-submit" type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign in"}<ArrowRight size={18} aria-hidden="true" /></button>
          </form>
          <div className="clinic-login-help"><Lock size={18} aria-hidden="true" /><p><strong>Need access?</strong><br />Contact your Administrator for an account or password reset. Your account determines your department access.</p></div>
        </div>
        <span className="clinic-login-caption">Palani Medical Clinic · Staff portal</span>
      </section>
    </main>
  );
}

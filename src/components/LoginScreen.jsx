import { useRef, useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Heart, Info, Loader2, LockKeyhole, Plus, ShieldCheck, UserRound } from "lucide-react";
import { supabase, usernameToEmail } from "../supabaseClient";
import { ROLES } from "../constants";
import "./LoginScreen.css";

const departments = ["Admin", "Doctor", "Nurse", "Lab Technician", "Receptionist", "Pharmacist", "Cashier"]
  .map((key) => ROLES.find((role) => role.key === key));

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeRole, setActiveRole] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const usernameRef = useRef(null);

  function handleRoleClick(role) {
    setActiveRole(role);
    usernameRef.current?.focus();
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
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
    <main className="staff-login">
      <section className="staff-login__network" aria-labelledby="network-heading">
        <a className="staff-login__brand" href="#staff-sign-in" aria-label="Palani Medical Clinic staff sign in">
          <span className="staff-login__logo" aria-hidden="true">
            <Heart size={38} strokeWidth={1.7} />
            <Plus className="staff-login__logo-cross" size={21} strokeWidth={3} />
          </span>
          <span>Palani<span className="staff-login__brand-subtitle">Medical Clinic</span></span>
        </a>

        <div className="staff-login__network-content">
          <p className="staff-login__eyebrow">Connected Care Network</p>
          <h1 id="network-heading">One team.<br /><span> Connected care.</span></h1>
          <p className="staff-login__intro">Every department, working together.<br /> Better care starts with you.</p>
          <div className="staff-login__directory-heading">
            <span id="department-heading">Your department</span><span>7 connected teams</span>
          </div>
          <div className="staff-login__departments" role="group" aria-labelledby="department-heading">
            {departments.map((role) => {
              const Icon = role.icon;
              return (
                <button key={role.key} type="button"
                  className={`staff-login__department${activeRole?.key === role.key ? " is-selected" : ""}`}
                  aria-pressed={activeRole?.key === role.key} disabled={loading} onClick={() => handleRoleClick(role)}>
                  <Icon size={21} aria-hidden="true" />
                  <span>{role.key === "Lab Technician" ? role.key : role.label}</span>
                  <ArrowRight className="staff-login__department-arrow" size={16} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
        <p className="staff-login__network-note"><ShieldCheck size={18} aria-hidden="true" /> A shared purpose. A healthier community.</p>
      </section>

      <section className="staff-login__entry" aria-labelledby="staff-sign-in">
        <div className="staff-login__card">
          <span className="staff-login__portal-label"><span /> Staff portal</span>
          <div className="staff-login__welcome-icon" aria-hidden="true"><LockKeyhole size={25} /></div>
          <h2 id="staff-sign-in">Welcome back</h2>
          <p className="staff-login__card-intro">Sign in to your staff account to continue.</p>

          <form onSubmit={handleLogin} aria-busy={loading}>
            {activeRole && (
              <p className="staff-login__role-hint" id="role-hint">
                <strong>{activeRole.label}</strong> sign-in. Your administrator assigns your department access.
              </p>
            )}
            <div className="staff-login__field">
              <label htmlFor="staff-username">Username</label>
              <div className="staff-login__input-wrap">
                <UserRound size={19} aria-hidden="true" />
                <input ref={usernameRef} id="staff-username" name="username" autoComplete="username"
                  autoCapitalize="none" spellCheck={false} required disabled={loading}
                  value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username"
                  aria-describedby={activeRole ? "role-hint" : undefined} />
              </div>
            </div>
            <div className="staff-login__field">
              <label htmlFor="staff-password">Password</label>
              <div className="staff-login__input-wrap">
                <LockKeyhole size={19} aria-hidden="true" />
                <input id="staff-password" name="password" type={showPassword ? "text" : "password"}
                  autoComplete="current-password" required disabled={loading} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
                <button className="staff-login__visibility" type="button" disabled={loading}
                  aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="staff-password"
                  aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="staff-login__error" role="alert">
                <AlertCircle size={18} aria-hidden="true" /> <span>{error}</span>
              </div>
            )}
            <button className="staff-login__submit" type="submit" disabled={loading}>
              {loading ? <Loader2 className="staff-login__spinner" size={19} aria-hidden="true" /> : null}
              {loading ? "Signing in…" : "Sign In"}
              {!loading && <ArrowRight size={19} aria-hidden="true" />}
            </button>
            <span className="staff-login__sr-only" role="status">{loading ? "Signing in. Please wait." : ""}</span>
          </form>

          <p className="staff-login__account-help">Need an account or help signing in?<br /><span>Contact your clinic administrator or IT support.</span></p>
          <div className="staff-login__notice" role="note">
            <Info size={18} aria-hidden="true" />
            <p><strong>Test data only</strong><br />Do not enter real patient information.</p>
          </div>
        </div>
        <footer className="staff-login__footer">© Palani Medical Clinic <span aria-hidden="true">|</span> Staff Portal <span aria-hidden="true">|</span> <a href="#staff-it-support">Contact IT Support</a></footer>
        <p className="staff-login__support" id="staff-it-support">For account access or password assistance, contact your clinic administrator.</p>
      </section>
    </main>
  );
}

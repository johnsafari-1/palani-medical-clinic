import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { ROLES } from "./constants";
import LoginScreen from "./components/LoginScreen";
import AdminDashboard from "./components/AdminDashboard";
import ReceptionistDashboard from "./components/ReceptionistDashboard";
import DoctorDashboard from "./components/DoctorDashboard";
import NurseDashboard from "./components/NurseDashboard";
import LabDashboard from "./components/LabDashboard";
import PharmacyDashboard from "./components/PharmacyDashboard";
import CashierDashboard from "./components/CashierDashboard";

const dashboards = { Admin: AdminDashboard, Receptionist: ReceptionistDashboard, Doctor: DoctorDashboard,
  Nurse: NurseDashboard, "Lab Technician": LabDashboard, Pharmacist: PharmacyDashboard, Cashier: CashierDashboard };
const accessErrors = {
  inactive: "This account has been deactivated. Contact your administrator.",
  role: "This account has no supported staff role. Contact your administrator.",
  unavailable: "Unable to verify your staff access. Contact your administrator or sign in again.",
};

function AccessMessage({ children, onLogout }) {
  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
    <p role="status">{children}</p>
    {onLogout && <button className="wl-btn" onClick={onLogout}>Back to sign in</button>}
  </div>;
}

// Keyed by identity AND token: account changes immediately unmount all previous
// patient state, before the next profile request completes.
export function StaffSession({ session, onLogout }) {
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    async function checkAccess() {
      const request = ++generation;
      try {
        const { data, error: profileError } = await supabase.from("staff")
          .select("*").eq("id", session.user.id).single();
        if (disposed || request !== generation) return;
        let denial = "";
        if (profileError || !data || data.id !== session.user.id) denial = accessErrors.unavailable;
        else if (data.active === false) denial = accessErrors.inactive;
        else if (!ROLES.some((role) => role.key === data.role)) denial = accessErrors.role;
        setStaff(denial ? null : data);
        setError(denial);
      } catch {
        if (disposed || request !== generation) return;
        setStaff(null);
        setError(accessErrors.unavailable);
      }
    }
    checkAccess();
    const interval = window.setInterval(checkAccess, 60_000);
    window.addEventListener("focus", checkAccess);
    return () => {
      disposed = true;
      ++generation;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkAccess);
    };
  }, [session.user.id]);

  if (error) return <AccessMessage onLogout={onLogout}>{error}</AccessMessage>;
  if (!staff) return <AccessMessage>Verifying your staff access…</AccessMessage>;
  const Dashboard = dashboards[staff.role];
  return <Dashboard key={`${staff.id}:${staff.role}`} staff={staff} onLogout={onLogout} />;
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [sessionError, setSessionError] = useState("");
  useEffect(() => {
    let disposed = false;
    let authEventReceived = false;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      authEventReceived = true;
      if (!disposed) { setSessionError(""); setSession(newSession); }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (disposed || authEventReceived) return;
      if (error) setSessionError("Unable to restore your session. Please sign in again.");
      setSession(error ? null : data.session);
    }).catch(() => {
      if (disposed || authEventReceived) return;
      setSessionError("Unable to restore your session. Please sign in again.");
      setSession(null);
    });
    return () => { disposed = true; listener.subscription.unsubscribe(); };
  }, []);

  async function handleLogout() {
    // Remove clinical UI even if the network sign-out request fails.
    setSession(null);
    setSessionError("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch {
      setSessionError("Sign-out could not be completed. Close this browser and contact your administrator.");
    }
  }
  if (sessionError) return <AccessMessage onLogout={() => setSessionError("")}>{sessionError}</AccessMessage>;
  if (session === undefined) return <AccessMessage>Loading Palani Medical Clinic…</AccessMessage>;
  if (!session) return <LoginScreen />;
  return <StaffSession key={`${session.user.id}:${session.access_token}`} session={session} onLogout={handleLogout} />;
}

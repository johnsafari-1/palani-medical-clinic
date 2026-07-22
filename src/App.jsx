import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import LoginScreen from "./components/LoginScreen";
import AdminDashboard from "./components/AdminDashboard";
import ReceptionistDashboard from "./components/ReceptionistDashboard";
import DoctorDashboard from "./components/DoctorDashboard";
import NurseDashboard from "./components/NurseDashboard";
import LabDashboard from "./components/LabDashboard";
import PharmacyDashboard from "./components/PharmacyDashboard";
import CashierDashboard from "./components/CashierDashboard";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [staff, setStaff] = useState(null);
  const [staffError, setStaffError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setStaff(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (error) {
        setStaffError("Signed in, but no staff profile found for this account. Ask an Admin to add you.");
      } else {
        setStaff(data);
        setStaffError("");
      }
    })();
  }, [session]);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", color: "#5B6B72" }}>
        Loading Palani Medical Clinic…
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (staffError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", gap: 16 }}>
        <p style={{ color: "#A13D3D" }}>{staffError}</p>
        <button className="wl-btn" onClick={handleLogout} style={{ background: "#2B6777", color: "#fff" }}>Sign out</button>
      </div>
    );
  }

  if (!staff) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", color: "#5B6B72" }}>
        Loading your dashboard…
      </div>
    );
  }

  switch (staff.role) {
    case "Admin":
      return <AdminDashboard staff={staff} onLogout={handleLogout} />;
    case "Receptionist":
      return <ReceptionistDashboard staff={staff} onLogout={handleLogout} />;
    case "Doctor":
      return <DoctorDashboard staff={staff} onLogout={handleLogout} />;
    case "Nurse":
      return <NurseDashboard staff={staff} onLogout={handleLogout} />;
    case "Lab Technician":
      return <LabDashboard staff={staff} onLogout={handleLogout} />;
    case "Pharmacist":
      return <PharmacyDashboard staff={staff} onLogout={handleLogout} />;
    case "Cashier":
      return <CashierDashboard staff={staff} onLogout={handleLogout} />;
    default:
      return <p>Unknown role.</p>;
  }
}

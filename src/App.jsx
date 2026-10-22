import {lazy,Suspense} from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import ProtectedRoute, { AuthStatus } from "./auth/ProtectedRoute";
import { destinationAfterLogin, homeForRole } from "./auth/roles";
import LoginScreen from "./components/LoginScreen";
const AdminDashboard=lazy(()=>import("./components/AdminDashboard"));
const ReceptionistDashboard=lazy(()=>import("./components/ReceptionistDashboard"));
const DoctorDashboard=lazy(()=>import("./components/DoctorDashboard"));
const NurseDashboard=lazy(()=>import("./components/NurseDashboard"));
const LabDashboard=lazy(()=>import("./components/LabDashboard"));
const PharmacyDashboard=lazy(()=>import("./components/PharmacyDashboard"));
const CashierDashboard=lazy(()=>import("./components/CashierDashboard"));

function LoginRoute() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === "authenticated") return <Navigate to={destinationAfterLogin(auth.staff.role, location.state?.from)} replace />;
  if (auth.status !== "signed-out") return <AuthStatus />;
  return <LoginScreen />;
}

function DashboardHome() {
  const { staff } = useAuth();
  return <Navigate to={homeForRole(staff.role)} replace />;
}

function Dashboard({ component: Component }) {
  const { staff, signOut } = useAuth();
  return <div className="clinic-workspace"><Suspense fallback={<p className="wl-auth-status" role="status">Loading your workspace…</p>}><Component key={staff.id} staff={staff} onLogout={signOut} /></Suspense></div>;
}

export function AppRoutes() {
  return <Routes>
    <Route path="/" element={<Navigate to="/app" replace />} />
    <Route path="/login" element={<LoginRoute />} />
    <Route path="/app" element={<ProtectedRoute />}>
      <Route index element={<DashboardHome />} />
      <Route path="admin" element={<ProtectedRoute role="Admin"><Dashboard component={AdminDashboard} /></ProtectedRoute>} />
      <Route path="reception" element={<ProtectedRoute role="Receptionist"><Dashboard component={ReceptionistDashboard} /></ProtectedRoute>} />
      <Route path="doctor" element={<ProtectedRoute role="Doctor"><Dashboard component={DoctorDashboard} /></ProtectedRoute>} />
      <Route path="nursing" element={<ProtectedRoute role="Nurse"><Dashboard component={NurseDashboard} /></ProtectedRoute>} />
      <Route path="lab" element={<ProtectedRoute role="Lab Technician"><Dashboard component={LabDashboard} /></ProtectedRoute>} />
      <Route path="pharmacy" element={<ProtectedRoute role="Pharmacist"><Dashboard component={PharmacyDashboard} /></ProtectedRoute>} />
      <Route path="billing" element={<ProtectedRoute role="Cashier"><Dashboard component={CashierDashboard} /></ProtectedRoute>} />
    </Route>
    <Route path="*" element={<main className="wl-auth-status"><h1>Page not found</h1><Link to="/app">Go to my dashboard</Link></main>} />
  </Routes>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>;
}

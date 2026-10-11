import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { homeForRole } from "./roles";

export function AuthStatus() {
  const { status, error, retry, signOut } = useAuth();
  return <main className="wl-auth-status" aria-busy={status === "loading"}>
    {status === "loading" ? <p role="status">Verifying your staff access…</p> : <>
      <p role="alert">{error}</p>
      <div style={{ display: "flex", gap: 12 }}>
        {status === "error" && <button className="wl-btn" onClick={retry}>Retry</button>}
        <button className="wl-btn" onClick={signOut}>Back to sign in / sign out</button>
      </div>
    </>}
  </main>;
}

export function AccessDenied() {
  const { staff } = useAuth();
  return <main className="wl-auth-status"><h1>Access denied</h1><p>This page is restricted to another department.</p><Link to={homeForRole(staff.role)}>Go to my dashboard</Link></main>;
}

export default function ProtectedRoute({ role, children }) {
  const { status, staff } = useAuth();
  const location = useLocation();
  if (status === "signed-out") return <Navigate to="/login" state={{ from: location }} replace />;
  if (status !== "authenticated") return <AuthStatus />;
  if (role && staff.role !== role) return <AccessDenied />;
  return children || <Outlet />;
}

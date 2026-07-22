import { LogOut } from "lucide-react";
import { roleMeta } from "../constants";

export default function Header({ staff, onLogout }) {
  const meta = roleMeta(staff.role);
  const Icon = meta.icon;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "1px solid #DCE3E6", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 8, height: 24, borderRadius: 2, background: "#2B6777" }} />
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18 }}>Palani Medical Clinic</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="wl-badge" style={{ background: meta.color + "1A", color: meta.color }}>
          <Icon size={14} /> {meta.label}
        </span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{staff.name}</div>
        </div>
        <button className="wl-btn" onClick={onLogout} style={{ background: "#F5F7F8", color: "#5B6B72", display: "flex", alignItems: "center", gap: 6 }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}

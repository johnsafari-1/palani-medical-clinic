import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, HeartPulse, LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { roleMeta } from "../constants";

export default function Header({ staff, onLogout, navigation, activeItem }) {
  const meta = roleMeta(staff.role);
  const Icon = meta.icon;
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  const nav = useRef(null);
  const items = navigation || [{ key: "workspace", label: "My workspace", icon: LayoutDashboard }];
  const initials = staff.name?.trim().split(/\s+/).slice(0, 2).map(name => name[0]).join("").toUpperCase() || "ST";
  useEffect(() => { if (open) nav.current?.querySelector("button")?.focus(); }, [open]);
  function focusContent() {
    const content = document.getElementById("clinic-content");
    content?.focus(); content?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }
  function choose(item) { item.onSelect?.(); setOpen(false); requestAnimationFrame(focusContent); }
  function closeOnEscape(event) {
    if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); }
  }
  return <>
    <a className="clinic-skip" href="#clinic-content">Skip to workspace</a>
    <aside id="clinic-navigation" className={`clinic-sidebar ${open ? "is-open" : ""}`} onKeyDown={closeOnEscape}>
      <div className="clinic-brand"><span className="clinic-brand-mark"><HeartPulse size={24} aria-hidden="true" /></span><div><strong>Palani</strong><span>Medical Clinic</span></div></div>
      <div className="clinic-sidebar-label" id="clinic-nav-label">Workspace</div>
      <nav ref={nav} aria-labelledby="clinic-nav-label">
        {items.map(item => {
          const ItemIcon = item.icon || LayoutDashboard;
          const selected = item.key === (activeItem || "workspace");
          return <button key={item.key} type="button" className={`clinic-nav-item ${selected ? "is-active" : ""}`}
            aria-current={selected ? "page" : undefined} onClick={() => choose(item)}>
            <ItemIcon size={18} aria-hidden="true" /><span>{item.label}</span>{selected && <ArrowUpRight size={15} aria-hidden="true" />}
          </button>;
        })}
      </nav>
      <div className="clinic-workspace-note"><Icon size={21} aria-hidden="true" /><strong>{meta.label}</strong><p>Your department’s daily work, in one place.</p></div>
      <div className="clinic-sidebar-footer"><span className="clinic-test-dot" />Test workspace<span>Use test data only</span></div>
    </aside>
    <header className="clinic-topbar">
      <div className="clinic-topbar-title">
        <button ref={menuButton} type="button" className="clinic-menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open} aria-controls="clinic-navigation" onClick={() => setOpen(value => !value)}>
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
        <div><span className="clinic-eyebrow">Staff portal</span><strong>{meta.label} workspace</strong></div>
      </div>
      <div className="clinic-account">
        <span className="clinic-avatar" aria-hidden="true">{initials}</span>
        <div className="clinic-account-name"><strong>{staff.name}</strong><span>{meta.label}</span></div>
        <button className="wl-btn clinic-signout" type="button" onClick={onLogout}><LogOut size={16} aria-hidden="true" /><span>Sign out</span></button>
      </div>
    </header>
  </>;
}

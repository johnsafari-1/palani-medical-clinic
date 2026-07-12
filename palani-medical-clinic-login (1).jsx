import { useState, useEffect } from "react";
import { ShieldCheck, ClipboardList, Stethoscope, HeartPulse, FlaskConical, Pill, Banknote, LogOut, Plus, Trash2, Lock, AlertCircle, Search, User } from "lucide-react";

const ROLES = [
  { key: "Admin", label: "Administrator", color: "#2B6777", icon: ShieldCheck },
  { key: "Receptionist", label: "Receptionist", color: "#7C5CBF", icon: ClipboardList },
  { key: "Doctor", label: "Doctor", color: "#2F7D4F", icon: Stethoscope },
  { key: "Nurse", label: "Nurse", color: "#C2467D", icon: HeartPulse },
  { key: "Lab Technician", label: "Laboratory Technician", color: "#C77D2E", icon: FlaskConical },
  { key: "Pharmacist", label: "Pharmacist", color: "#3D6FB4", icon: Pill },
  { key: "Cashier", label: "Cashier", color: "#A13D3D", icon: Banknote },
];

const roleMeta = (key) => ROLES.find((r) => r.key === key) || ROLES[0];

const MODULES = {
  Receptionist: ["Appointment booking", "Visitor queue"],
  Doctor: ["Patient queue", "Consultations", "Prescriptions"],
  Nurse: ["Vitals & ward log", "Care schedule", "Bed management"],
  "Lab Technician": ["Test orders", "Result upload", "Sample tracking"],
  Pharmacist: ["Prescription queue", "Inventory", "Dispensing log"],
  Cashier: ["Invoices", "Payments", "Daily reconciliation"],
};

const USERS_KEY = "palani:users";
const PATIENTS_KEY = "palani:patients";

export default function App() {
  const [users, setUsers] = useState(null);
  const [patients, setPatients] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(USERS_KEY, true);
        setUsers(JSON.parse(res.value));
      } catch {
        const seeded = [
          { id: "STF-0001", name: "System Administrator", username: "admin", password: "admin123", role: "Admin" },
        ];
        await window.storage.set(USERS_KEY, JSON.stringify(seeded), true);
        setUsers(seeded);
      }
      try {
        const res = await window.storage.get(PATIENTS_KEY, true);
        setPatients(JSON.parse(res.value));
      } catch {
        await window.storage.set(PATIENTS_KEY, JSON.stringify([]), true);
        setPatients([]);
      }
      setLoading(false);
    })();
  }, []);

  async function persistUsers(next) {
    setUsers(next);
    try {
      await window.storage.set(USERS_KEY, JSON.stringify(next), true);
    } catch {
      // storage failed; local state still updated for this session
    }
  }

  async function persistPatients(next) {
    setPatients(next);
    try {
      await window.storage.set(PATIENTS_KEY, JSON.stringify(next), true);
    } catch {
      // storage failed; local state still updated for this session
    }
  }

  function handleLogin(e) {
    e.preventDefault();
    const match = users.find((u) => u.username === username.trim() && u.password === password);
    if (!match) {
      setLoginError("Username or password is incorrect.");
      return;
    }
    setLoginError("");
    setCurrentUser(match);
    setUsername("");
    setPassword("");
  }

  function handleLogout() {
    setCurrentUser(null);
  }

  if (loading) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", color: "#5B6B72" }}>
        Loading Wardline…
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#F5F7F8", minHeight: 600, color: "#1E2A30" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
        .wl-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #DCE3E6; font-family: Inter, sans-serif; font-size: 14px; background: #fff; }
        .wl-input:focus { outline: none; border-color: #2B6777; box-shadow: 0 0 0 3px rgba(43,103,119,0.12); }
        .wl-btn { font-family: Inter, sans-serif; font-weight: 600; font-size: 14px; border-radius: 8px; border: none; cursor: pointer; padding: 10px 16px; transition: opacity 0.15s; }
        .wl-btn:hover { opacity: 0.9; }
        .wl-btn:active { transform: scale(0.98); }
        .wl-badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 600; }
      `}</style>

      {!currentUser ? (
        <LoginScreen
          username={username} setUsername={setUsername}
          password={password} setPassword={setPassword}
          onSubmit={handleLogin} error={loginError}
        />
      ) : currentUser.role === "Admin" ? (
        <AdminDashboard user={currentUser} users={users} setUsers={persistUsers} onLogout={handleLogout} />
      ) : currentUser.role === "Receptionist" ? (
        <ReceptionistDashboard user={currentUser} patients={patients} setPatients={persistPatients} onLogout={handleLogout} />
      ) : (
        <StaffDashboard user={currentUser} onLogout={handleLogout} />
      )}
    </div>
  );
}

function Header({ user, onLogout }) {
  const meta = roleMeta(user.role);
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
          <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div>
          <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{user.id}</div>
        </div>
        <button className="wl-btn" onClick={onLogout} style={{ background: "#F5F7F8", color: "#5B6B72", display: "flex", alignItems: "center", gap: 6 }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}

function LoginScreen({ username, setUsername, password, setPassword, onSubmit, error }) {
  return (
    <div style={{ display: "flex", minHeight: 600 }}>
      <div style={{ flex: "0 0 380px", padding: "56px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 8, height: 28, borderRadius: 2, background: "#2B6777" }} />
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 22 }}>Palani Medical Clinic</span>
        </div>
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 20, margin: "0 0 6px" }}>Sign in to your ward</h1>
        <p style={{ color: "#5B6B72", fontSize: 14, margin: "0 0 28px" }}>Clinic operations, one staff badge at a time.</p>

        <form onSubmit={onSubmit}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Username</label>
          <input className="wl-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. admin" style={{ marginBottom: 16 }} />
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Password</label>
          <input className="wl-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" style={{ marginBottom: 16 }} />
          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#A13D3D", fontSize: 13, marginBottom: 16 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <button className="wl-btn" type="submit" style={{ width: "100%", background: "#2B6777", color: "#fff", padding: "11px 16px" }}>
            Sign in
          </button>
        </form>

        <div style={{ marginTop: 24, padding: 12, borderRadius: 8, background: "#EEF2F3", fontSize: 12, color: "#5B6B72", display: "flex", gap: 8 }}>
          <Lock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>First time here? Sign in with <strong>admin / admin123</strong> to set up staff accounts.</span>
        </div>
      </div>

      <div style={{ flex: 1, background: "#1E2A30", padding: "56px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ color: "#8FA3AA", fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 20 }}>Staff directory</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.key} style={{ background: "#26343B", borderRadius: 10, padding: "14px 16px", borderLeft: `4px solid ${r.color}` }}>
                <Icon size={18} color={r.color} />
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginTop: 8 }}>{r.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AdminDashboard({ user, users, setUsers, onLogout }) {
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "Receptionist" });
  const [formError, setFormError] = useState("");

  function nextId() {
    const nums = users.map((u) => parseInt(u.id.split("-")[1], 10)).filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return "STF-" + String(next).padStart(4, "0");
  }

  function addStaff(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.username.trim() || !form.password.trim()) {
      setFormError("Fill in name, username, and password.");
      return;
    }
    if (users.some((u) => u.username === form.username.trim())) {
      setFormError("That username is already taken.");
      return;
    }
    const newUser = { id: nextId(), name: form.name.trim(), username: form.username.trim(), password: form.password, role: form.role };
    setUsers([...users, newUser]);
    setForm({ name: "", username: "", password: "", role: "Receptionist" });
    setFormError("");
  }

  function removeStaff(id) {
    setUsers(users.filter((u) => u.id !== id));
  }

  return (
    <div>
      <Header user={user} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
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
            <button className="wl-btn" type="submit" style={{ background: "#2B6777", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> Add
            </button>
          </form>
          {formError && <div style={{ color: "#A13D3D", fontSize: 12, marginTop: 10 }}>{formError}</div>}
        </div>

        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
          {users.map((u, i) => {
            const meta = roleMeta(u.role);
            const Icon = meta.icon;
            return (
              <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: i < users.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="wl-badge" style={{ background: meta.color + "1A", color: meta.color }}>
                    <Icon size={13} /> {meta.label}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                    <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{u.username} · {u.id}</div>
                  </div>
                </div>
                {u.role !== "Admin" && (
                  <button className="wl-btn" onClick={() => removeStaff(u.id)} style={{ background: "transparent", color: "#A13D3D", padding: 6 }} aria-label="Remove staff">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReceptionistDashboard({ user, patients, setPatients, onLogout }) {
  const [form, setForm] = useState({ name: "", dob: "", gender: "Female", phone: "", address: "" });
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");
  const [justAdded, setJustAdded] = useState(null);

  function nextId() {
    const nums = patients.map((p) => parseInt(p.id.split("-")[1], 10)).filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return "PT-" + String(next).padStart(4, "0");
  }

  function addPatient(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.dob || !form.phone.trim()) {
      setFormError("Fill in name, date of birth, and phone number.");
      return;
    }
    const id = nextId();
    const newPatient = {
      id,
      name: form.name.trim(),
      dob: form.dob,
      gender: form.gender,
      phone: form.phone.trim(),
      address: form.address.trim(),
      registeredAt: new Date().toISOString().slice(0, 10),
      registeredBy: user.name,
    };
    setPatients([newPatient, ...patients]);
    setForm({ name: "", dob: "", gender: "Female", phone: "", address: "" });
    setFormError("");
    setJustAdded(id);
    setTimeout(() => setJustAdded(null), 3000);
  }

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.phone.includes(q);
  });

  return (
    <div>
      <Header user={user} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Patient registration</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Register a new patient and give them a patient ID for their visit.</p>

        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <form onSubmit={addPatient} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Full name</label>
              <input className="wl-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Amina Wanjiru" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Date of birth</label>
              <input className="wl-input" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Gender</label>
              <select className="wl-input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Phone number</label>
              <input className="wl-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07XX XXX XXX" />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Address (optional)</label>
              <input className="wl-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Estate, town" />
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
              <button className="wl-btn" type="submit" style={{ background: "#2B6777", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} /> Register patient
              </button>
              {formError && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#A13D3D", fontSize: 13 }}>
                  <AlertCircle size={14} /> {formError}
                </span>
              )}
              {justAdded && (
                <span style={{ fontSize: 13, color: "#2F7D4F", fontFamily: "IBM Plex Mono, monospace" }}>Registered as {justAdded}</span>
              )}
            </div>
          </form>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: 0 }}>
            All patients <span style={{ color: "#7C8A90", fontWeight: 500 }}>({patients.length})</span>
          </h3>
          <div style={{ position: "relative", width: 240 }}>
            <Search size={14} color="#7C8A90" style={{ position: "absolute", left: 10, top: 11 }} />
            <input className="wl-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, ID, or phone" style={{ paddingLeft: 32 }} />
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>
              {patients.length === 0 ? "No patients registered yet. Add the first one above." : "No patients match your search."}
            </div>
          ) : (
            filtered.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: i < filtered.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#7C5CBF1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <User size={16} color="#7C5CBF" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#7C8A90" }}>{p.gender} · DOB {p.dob} · {p.phone}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, fontWeight: 500 }}>{p.id}</div>
                  <div style={{ fontSize: 11, color: "#7C8A90" }}>Registered {p.registeredAt}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StaffDashboard({ user, onLogout }) {
  const meta = roleMeta(user.role);
  const modules = MODULES[user.role] || [];
  return (
    <div>
      <Header user={user} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Welcome, {user.name.split(" ")[0]}</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Your {meta.label.toLowerCase()} workspace is set up next. These modules are on the roadmap.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {modules.map((m) => (
            <div key={m} style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 18, opacity: 0.7 }}>
              <Lock size={16} color="#7C8A90" />
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>{m}</div>
              <div style={{ fontSize: 12, color: "#7C8A90", marginTop: 4 }}>Coming in the next build phase</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

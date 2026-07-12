import { useState, useEffect } from "react";
import { ShieldCheck, ClipboardList, Stethoscope, HeartPulse, FlaskConical, Pill, Banknote, LogOut, Plus, Trash2, Lock, AlertCircle, Search, User, FileText, X } from "lucide-react";

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
  Doctor: [],
  Nurse: ["Care schedule", "Bed management"],
  "Lab Technician": ["Sample tracking"],
  Pharmacist: ["Inventory"],
  Cashier: ["Payments", "Daily reconciliation"],
};

const USERS_KEY = "palani:users";
const PATIENTS_KEY = "palani:patients";
const CONSULTATIONS_KEY = "palani:consultations";
const LABS_KEY = "palani:labs";
const VITALS_KEY = "palani:vitals";
const INVOICES_KEY = "palani:invoices";

export default function App() {
  const [users, setUsers] = useState(null);
  const [patients, setPatients] = useState(null);
  const [consultations, setConsultations] = useState(null);
  const [labs, setLabs] = useState(null);
  const [vitals, setVitals] = useState(null);
  const [invoices, setInvoices] = useState(null);
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
      try {
        const res = await window.storage.get(CONSULTATIONS_KEY, true);
        setConsultations(JSON.parse(res.value));
      } catch {
        await window.storage.set(CONSULTATIONS_KEY, JSON.stringify([]), true);
        setConsultations([]);
      }
      try {
        const res = await window.storage.get(LABS_KEY, true);
        setLabs(JSON.parse(res.value));
      } catch {
        await window.storage.set(LABS_KEY, JSON.stringify([]), true);
        setLabs([]);
      }
      try {
        const res = await window.storage.get(VITALS_KEY, true);
        setVitals(JSON.parse(res.value));
      } catch {
        await window.storage.set(VITALS_KEY, JSON.stringify([]), true);
        setVitals([]);
      }
      try {
        const res = await window.storage.get(INVOICES_KEY, true);
        setInvoices(JSON.parse(res.value));
      } catch {
        await window.storage.set(INVOICES_KEY, JSON.stringify([]), true);
        setInvoices([]);
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

  async function persistConsultations(next) {
    setConsultations(next);
    try {
      await window.storage.set(CONSULTATIONS_KEY, JSON.stringify(next), true);
    } catch {
      // storage failed; local state still updated for this session
    }
  }

  async function persistLabs(next) {
    setLabs(next);
    try {
      await window.storage.set(LABS_KEY, JSON.stringify(next), true);
    } catch {
      // storage failed; local state still updated for this session
    }
  }

  async function persistVitals(next) {
    setVitals(next);
    try {
      await window.storage.set(VITALS_KEY, JSON.stringify(next), true);
    } catch {
      // storage failed; local state still updated for this session
    }
  }

  async function persistInvoices(next) {
    setInvoices(next);
    try {
      await window.storage.set(INVOICES_KEY, JSON.stringify(next), true);
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
        Loading Palani Medical Clinic…
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
      ) : currentUser.role === "Doctor" ? (
        <DoctorDashboard
          user={currentUser} patients={patients}
          consultations={consultations} setConsultations={persistConsultations}
          labs={labs} setLabs={persistLabs}
          onLogout={handleLogout}
        />
      ) : currentUser.role === "Nurse" ? (
        <NurseDashboard user={currentUser} patients={patients} vitals={vitals} setVitals={persistVitals} onLogout={handleLogout} />
      ) : currentUser.role === "Lab Technician" ? (
        <LabDashboard user={currentUser} labs={labs} setLabs={persistLabs} onLogout={handleLogout} />
      ) : currentUser.role === "Pharmacist" ? (
        <PharmacyDashboard user={currentUser} consultations={consultations} setConsultations={persistConsultations} onLogout={handleLogout} />
      ) : currentUser.role === "Cashier" ? (
        <CashierDashboard user={currentUser} patients={patients} consultations={consultations} invoices={invoices} setInvoices={persistInvoices} onLogout={handleLogout} />
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

function DoctorDashboard({ user, patients, consultations, setConsultations, labs, setLabs, onLogout }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [rx, setRx] = useState([{ key: 1, drug: "", dosage: "", instructions: "" }]);
  const [labTests, setLabTests] = useState("");
  const [formError, setFormError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  const selected = patients.find((p) => p.id === selectedId) || null;
  const history = selected ? consultations.filter((c) => c.patientId === selected.id) : [];

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
  });

  function selectPatient(id) {
    setSelectedId(id);
    setDiagnosis("");
    setNotes("");
    setRx([{ key: 1, drug: "", dosage: "", instructions: "" }]);
    setLabTests("");
    setFormError("");
    setSavedMsg("");
  }

  function updateRxRow(key, field, value) {
    setRx(rx.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function addRxRow() {
    setRx([...rx, { key: Date.now(), drug: "", dosage: "", instructions: "" }]);
  }

  function removeRxRow(key) {
    setRx(rx.filter((r) => r.key !== key));
  }

  function nextConsultId() {
    const nums = consultations.map((c) => parseInt(c.id.split("-")[1], 10)).filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return "CN-" + String(next).padStart(4, "0");
  }

  function nextLabId(offset) {
    const nums = labs.map((l) => parseInt(l.id.split("-")[1], 10)).filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1 + offset;
    return "LB-" + String(next).padStart(4, "0");
  }

  function saveConsultation(e) {
    e.preventDefault();
    if (!selected) return;
    if (!diagnosis.trim()) {
      setFormError("Add a diagnosis before saving.");
      return;
    }
    const prescriptions = rx.filter((r) => r.drug.trim()).map((r) => ({ drug: r.drug.trim(), dosage: r.dosage.trim(), instructions: r.instructions.trim() }));
    const record = {
      id: nextConsultId(),
      patientId: selected.id,
      patientName: selected.name,
      doctorName: user.name,
      date: new Date().toISOString().slice(0, 10),
      diagnosis: diagnosis.trim(),
      notes: notes.trim(),
      prescriptions,
      status: prescriptions.length ? "Pending pharmacy" : "Closed",
    };
    setConsultations([record, ...consultations]);

    const testNames = labTests.split(",").map((t) => t.trim()).filter(Boolean);
    if (testNames.length) {
      const newOrders = testNames.map((testName, idx) => ({
        id: nextLabId(idx),
        patientId: selected.id,
        patientName: selected.name,
        testName,
        orderedBy: user.name,
        orderedAt: new Date().toISOString().slice(0, 10),
        status: "Pending",
        result: "",
      }));
      setLabs([...newOrders, ...labs]);
    }

    setDiagnosis("");
    setNotes("");
    setRx([{ key: Date.now(), drug: "", dosage: "", instructions: "" }]);
    setLabTests("");
    setFormError("");
    setSavedMsg("Consultation saved as " + record.id);
    setTimeout(() => setSavedMsg(""), 3000);
  }

  return (
    <div>
      <Header user={user} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        <div>
          <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>Patients</h3>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={14} color="#7C8A90" style={{ position: "absolute", left: 10, top: 11 }} />
            <input className="wl-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or ID" style={{ paddingLeft: 32 }} />
          </div>
          <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", maxHeight: 480, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#7C8A90", fontSize: 12 }}>
                No patients registered yet.
              </div>
            ) : (
              filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => selectPatient(p.id)}
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid #EEF1F2",
                    cursor: "pointer",
                    background: selectedId === p.id ? "#2B677714" : "transparent",
                    borderLeft: selectedId === p.id ? "3px solid #2B6777" : "3px solid transparent",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{p.id}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          {!selected ? (
            <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 40, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>
              Select a patient from the list to start a consultation.
            </div>
          ) : (
            <div>
              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#2F7D4F1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <User size={18} color="#2F7D4F" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: "#7C8A90" }}>{selected.gender} · DOB {selected.dob} · {selected.phone} · <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{selected.id}</span></div>
                </div>
              </div>

              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 14px" }}>New consultation</h3>
                <form onSubmit={saveConsultation}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Diagnosis</label>
                  <input className="wl-input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Acute malaria" style={{ marginBottom: 12 }} />

                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Clinical notes (optional)</label>
                  <textarea className="wl-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations, vitals, follow-up plan" rows={3} style={{ marginBottom: 16, resize: "vertical" }} />

                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>Prescription</label>
                  {rx.map((r) => (
                    <div key={r.key} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.2fr auto", gap: 8, marginBottom: 8 }}>
                      <input className="wl-input" value={r.drug} onChange={(e) => updateRxRow(r.key, "drug", e.target.value)} placeholder="Drug name" />
                      <input className="wl-input" value={r.dosage} onChange={(e) => updateRxRow(r.key, "dosage", e.target.value)} placeholder="Dosage" />
                      <input className="wl-input" value={r.instructions} onChange={(e) => updateRxRow(r.key, "instructions", e.target.value)} placeholder="Frequency / duration" />
                      <button type="button" className="wl-btn" onClick={() => removeRxRow(r.key)} style={{ background: "transparent", color: "#A13D3D", padding: 6 }} aria-label="Remove drug row">
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="wl-btn" onClick={addRxRow} style={{ background: "#F5F7F8", color: "#5B6B72", display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
                    <Plus size={13} /> Add drug
                  </button>

                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Order lab tests (optional)</label>
                  <input className="wl-input" value={labTests} onChange={(e) => setLabTests(e.target.value)} placeholder="e.g. Full blood count, Malaria test (comma-separated)" style={{ marginBottom: 16 }} />

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button className="wl-btn" type="submit" style={{ background: "#2B6777", color: "#fff" }}>
                      Save consultation
                    </button>
                    {formError && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#A13D3D", fontSize: 13 }}>
                        <AlertCircle size={14} /> {formError}
                      </span>
                    )}
                    {savedMsg && <span style={{ fontSize: 13, color: "#2F7D4F", fontFamily: "IBM Plex Mono, monospace" }}>{savedMsg}</span>}
                  </div>
                </form>
              </div>

              <div>
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>Consultation history</h3>
                {history.length === 0 ? (
                  <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>
                    No previous consultations for this patient.
                  </div>
                ) : (
                  <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
                    {history.map((c, i) => (
                      <div key={c.id} style={{ padding: "14px 18px", borderBottom: i < history.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <FileText size={14} color="#2F7D4F" />
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{c.diagnosis}</span>
                          </div>
                          <span style={{ fontSize: 11, color: "#7C8A90" }}>{c.date}</span>
                        </div>
                        {c.notes && <p style={{ fontSize: 12, color: "#5B6B72", margin: "0 0 8px" }}>{c.notes}</p>}
                        {c.prescriptions.length > 0 && (
                          <div style={{ fontSize: 12, color: "#5B6B72" }}>
                            {c.prescriptions.map((p, idx) => (
                              <div key={idx}>• {p.drug} {p.dosage && `— ${p.dosage}`} {p.instructions && `(${p.instructions})`}</div>
                            ))}
                          </div>
                        )}
                        <span className="wl-badge" style={{ background: "#2B677714", color: "#2B6777", marginTop: 8 }}>{c.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NurseDashboard({ user, patients, vitals, setVitals, onLogout }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ bp: "", temp: "", pulse: "", weight: "" });
  const [formError, setFormError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  const selected = patients.find((p) => p.id === selectedId) || null;
  const history = selected ? vitals.filter((v) => v.patientId === selected.id) : [];

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
  });

  function selectPatient(id) {
    setSelectedId(id);
    setForm({ bp: "", temp: "", pulse: "", weight: "" });
    setFormError("");
    setSavedMsg("");
  }

  function nextVitalId() {
    const nums = vitals.map((v) => parseInt(v.id.split("-")[1], 10)).filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return "VT-" + String(next).padStart(4, "0");
  }

  function saveVitals(e) {
    e.preventDefault();
    if (!selected) return;
    if (!form.bp.trim() && !form.temp.trim() && !form.pulse.trim() && !form.weight.trim()) {
      setFormError("Enter at least one reading.");
      return;
    }
    const record = {
      id: nextVitalId(),
      patientId: selected.id,
      patientName: selected.name,
      bp: form.bp.trim(),
      temp: form.temp.trim(),
      pulse: form.pulse.trim(),
      weight: form.weight.trim(),
      recordedBy: user.name,
      recordedAt: new Date().toISOString().slice(0, 10),
    };
    setVitals([record, ...vitals]);
    setForm({ bp: "", temp: "", pulse: "", weight: "" });
    setFormError("");
    setSavedMsg("Vitals logged as " + record.id);
    setTimeout(() => setSavedMsg(""), 3000);
  }

  return (
    <div>
      <Header user={user} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        <div>
          <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>Patients</h3>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={14} color="#7C8A90" style={{ position: "absolute", left: 10, top: 11 }} />
            <input className="wl-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or ID" style={{ paddingLeft: 32 }} />
          </div>
          <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", maxHeight: 480, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#7C8A90", fontSize: 12 }}>No patients registered yet.</div>
            ) : (
              filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => selectPatient(p.id)}
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid #EEF1F2",
                    cursor: "pointer",
                    background: selectedId === p.id ? "#C2467D14" : "transparent",
                    borderLeft: selectedId === p.id ? "3px solid #C2467D" : "3px solid transparent",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{p.id}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          {!selected ? (
            <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 40, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>
              Select a patient to log vitals.
            </div>
          ) : (
            <div>
              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#C2467D1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <User size={18} color="#C2467D" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: "#7C8A90" }}>{selected.gender} · DOB {selected.dob} · <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{selected.id}</span></div>
                </div>
              </div>

              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 14px" }}>Log vitals</h3>
                <form onSubmit={saveVitals}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Blood pressure</label>
                      <input className="wl-input" value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} placeholder="120/80" />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Temp (°C)</label>
                      <input className="wl-input" value={form.temp} onChange={(e) => setForm({ ...form, temp: e.target.value })} placeholder="36.8" />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Pulse (bpm)</label>
                      <input className="wl-input" value={form.pulse} onChange={(e) => setForm({ ...form, pulse: e.target.value })} placeholder="76" />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Weight (kg)</label>
                      <input className="wl-input" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="68" />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button className="wl-btn" type="submit" style={{ background: "#C2467D", color: "#fff" }}>Save vitals</button>
                    {formError && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#A13D3D", fontSize: 13 }}>
                        <AlertCircle size={14} /> {formError}
                      </span>
                    )}
                    {savedMsg && <span style={{ fontSize: 13, color: "#2F7D4F", fontFamily: "IBM Plex Mono, monospace" }}>{savedMsg}</span>}
                  </div>
                </form>
              </div>

              <div>
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>Vitals history</h3>
                {history.length === 0 ? (
                  <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>
                    No vitals recorded for this patient yet.
                  </div>
                ) : (
                  <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
                    {history.map((v, i) => (
                      <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: i < history.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                        <div style={{ fontSize: 12, color: "#5B6B72" }}>
                          {v.bp && <span style={{ marginRight: 12 }}>BP {v.bp}</span>}
                          {v.temp && <span style={{ marginRight: 12 }}>Temp {v.temp}°C</span>}
                          {v.pulse && <span style={{ marginRight: 12 }}>Pulse {v.pulse}</span>}
                          {v.weight && <span>Weight {v.weight}kg</span>}
                        </div>
                        <span style={{ fontSize: 11, color: "#7C8A90" }}>{v.recordedAt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LabDashboard({ user, labs, setLabs, onLogout }) {
  const [resultDrafts, setResultDrafts] = useState({});
  const pending = labs.filter((l) => l.status === "Pending");
  const completed = labs.filter((l) => l.status === "Completed");

  function completeOrder(id) {
    const result = (resultDrafts[id] || "").trim();
    if (!result) return;
    setLabs(labs.map((l) => (l.id === id ? { ...l, status: "Completed", result, completedBy: user.name, completedAt: new Date().toISOString().slice(0, 10) } : l)));
    setResultDrafts({ ...resultDrafts, [id]: "" });
  }

  return (
    <div>
      <Header user={user} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Test orders</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Tests ordered by doctors appear here. Enter results to complete them.</p>

        <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
          Pending <span style={{ color: "#7C8A90", fontWeight: 500 }}>({pending.length})</span>
        </h3>
        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          {pending.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>No pending test orders.</div>
          ) : (
            pending.map((l, i) => (
              <div key={l.id} style={{ padding: "14px 18px", borderBottom: i < pending.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{l.testName} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {l.patientName}</span></div>
                    <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{l.id} · {l.patientId} · ordered {l.orderedAt}</div>
                  </div>
                  <span className="wl-badge" style={{ background: "#C77D2E1A", color: "#C77D2E" }}>Pending</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="wl-input"
                    value={resultDrafts[l.id] || ""}
                    onChange={(e) => setResultDrafts({ ...resultDrafts, [l.id]: e.target.value })}
                    placeholder="Enter result"
                  />
                  <button className="wl-btn" onClick={() => completeOrder(l.id)} style={{ background: "#2B6777", color: "#fff", whiteSpace: "nowrap" }}>
                    Mark complete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
          Completed <span style={{ color: "#7C8A90", fontWeight: 500 }}>({completed.length})</span>
        </h3>
        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
          {completed.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>No completed tests yet.</div>
          ) : (
            completed.map((l, i) => (
              <div key={l.id} style={{ padding: "14px 18px", borderBottom: i < completed.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{l.testName} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {l.patientName}</span></div>
                    <div style={{ fontSize: 12, color: "#5B6B72", marginTop: 4 }}>Result: {l.result}</div>
                  </div>
                  <span className="wl-badge" style={{ background: "#2F7D4F1A", color: "#2F7D4F" }}>Completed</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PharmacyDashboard({ user, consultations, setConsultations, onLogout }) {
  const pending = consultations.filter((c) => c.status === "Pending pharmacy");
  const dispensed = consultations.filter((c) => c.status === "Dispensed");

  function dispense(id) {
    setConsultations(consultations.map((c) => (c.id === id ? { ...c, status: "Dispensed", dispensedBy: user.name, dispensedAt: new Date().toISOString().slice(0, 10) } : c)));
  }

  return (
    <div>
      <Header user={user} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Prescription queue</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Prescriptions written by doctors appear here for dispensing.</p>

        <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
          Pending <span style={{ color: "#7C8A90", fontWeight: 500 }}>({pending.length})</span>
        </h3>
        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          {pending.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>No prescriptions waiting.</div>
          ) : (
            pending.map((c, i) => (
              <div key={c.id} style={{ padding: "14px 18px", borderBottom: i < pending.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.patientName} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {c.diagnosis}</span></div>
                    <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{c.id} · {c.patientId} · Dr {c.doctorName} · {c.date}</div>
                  </div>
                  <button className="wl-btn" onClick={() => dispense(c.id)} style={{ background: "#3D6FB4", color: "#fff", whiteSpace: "nowrap" }}>
                    Mark dispensed
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "#5B6B72" }}>
                  {c.prescriptions.map((p, idx) => (
                    <div key={idx}>• {p.drug} {p.dosage && `— ${p.dosage}`} {p.instructions && `(${p.instructions})`}</div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
          Dispensed <span style={{ color: "#7C8A90", fontWeight: 500 }}>({dispensed.length})</span>
        </h3>
        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
          {dispensed.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Nothing dispensed yet.</div>
          ) : (
            dispensed.map((c, i) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: i < dispensed.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.patientName} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {c.diagnosis}</span></div>
                <span className="wl-badge" style={{ background: "#2F7D4F1A", color: "#2F7D4F" }}>Dispensed</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CashierDashboard({ user, patients, consultations, invoices, setInvoices, onLogout }) {
  const [billingId, setBillingId] = useState(null);
  const [consultFee, setConsultFee] = useState("500");
  const [drugPrices, setDrugPrices] = useState({});

  const invoicedConsultIds = new Set(invoices.map((inv) => inv.consultationId));
  const awaitingBilling = consultations.filter((c) => !invoicedConsultIds.has(c.id));
  const billing = consultations.find((c) => c.id === billingId) || null;

  function nextInvoiceId() {
    const nums = invoices.map((i) => parseInt(i.id.split("-")[1], 10)).filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return "IV-" + String(next).padStart(4, "0");
  }

  function startBilling(c) {
    setBillingId(c.id);
    setConsultFee("500");
    const prices = {};
    c.prescriptions.forEach((p, idx) => (prices[idx] = "0"));
    setDrugPrices(prices);
  }

  const total = billing
    ? (parseFloat(consultFee) || 0) + billing.prescriptions.reduce((sum, _, idx) => sum + (parseFloat(drugPrices[idx]) || 0), 0)
    : 0;

  function createInvoice(e) {
    e.preventDefault();
    if (!billing) return;
    const items = [{ label: "Consultation fee", amount: parseFloat(consultFee) || 0 }, ...billing.prescriptions.map((p, idx) => ({ label: p.drug, amount: parseFloat(drugPrices[idx]) || 0 }))];
    const invoice = {
      id: nextInvoiceId(),
      patientId: billing.patientId,
      patientName: billing.patientName,
      consultationId: billing.id,
      items,
      total,
      status: "Unpaid",
      createdBy: user.name,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setInvoices([invoice, ...invoices]);
    setBillingId(null);
  }

  function markPaid(id) {
    setInvoices(invoices.map((inv) => (inv.id === id ? { ...inv, status: "Paid" } : inv)));
  }

  return (
    <div>
      <Header user={user} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Billing</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Generate an invoice from a consultation, then collect payment.</p>

        <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
          Awaiting billing <span style={{ color: "#7C8A90", fontWeight: 500 }}>({awaitingBilling.length})</span>
        </h3>
        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          {awaitingBilling.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Nothing to bill right now.</div>
          ) : (
            awaitingBilling.map((c, i) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < awaitingBilling.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.patientName} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {c.diagnosis}</span></div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{c.id} · {c.date}</div>
                </div>
                <button className="wl-btn" onClick={() => startBilling(c)} style={{ background: "#A13D3D", color: "#fff" }}>Bill this visit</button>
              </div>
            ))
          )}
        </div>

        {billing && (
          <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 14px" }}>
              Invoice for {billing.patientName}
            </h3>
            <form onSubmit={createInvoice}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EEF1F2" }}>
                <span style={{ fontSize: 13 }}>Consultation fee</span>
                <input className="wl-input" type="number" value={consultFee} onChange={(e) => setConsultFee(e.target.value)} style={{ width: 100 }} />
              </div>
              {billing.prescriptions.map((p, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EEF1F2" }}>
                  <span style={{ fontSize: 13 }}>{p.drug}</span>
                  <input className="wl-input" type="number" value={drugPrices[idx] || "0"} onChange={(e) => setDrugPrices({ ...drugPrices, [idx]: e.target.value })} style={{ width: 100 }} />
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 4px" }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
                <span style={{ fontSize: 16, fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>KES {total.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button className="wl-btn" type="submit" style={{ background: "#2B6777", color: "#fff" }}>Create invoice</button>
                <button className="wl-btn" type="button" onClick={() => setBillingId(null)} style={{ background: "#F5F7F8", color: "#5B6B72" }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
          Invoices <span style={{ color: "#7C8A90", fontWeight: 500 }}>({invoices.length})</span>
        </h3>
        <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
          {invoices.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>No invoices yet.</div>
          ) : (
            invoices.map((inv, i) => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < invoices.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{inv.patientName} <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, color: "#7C8A90" }}>· KES {inv.total.toLocaleString()}</span></div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{inv.id} · {inv.createdAt}</div>
                </div>
                {inv.status === "Unpaid" ? (
                  <button className="wl-btn" onClick={() => markPaid(inv.id)} style={{ background: "#2F7D4F", color: "#fff" }}>Mark paid</button>
                ) : (
                  <span className="wl-badge" style={{ background: "#2F7D4F1A", color: "#2F7D4F" }}>Paid</span>
                )}
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

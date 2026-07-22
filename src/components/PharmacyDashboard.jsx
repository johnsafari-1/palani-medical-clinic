import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Header from "./Header";

export default function PharmacyDashboard({ staff, onLogout }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadPrescriptions() {
    setLoading(true);
    const { data, error } = await supabase
      .from("prescriptions")
      .select("*, consultations(code, diagnosis, created_at, patients(name, code))")
      .order("id", { ascending: false });
    if (!error) setPrescriptions(data);
    setLoading(false);
  }

  useEffect(() => {
    loadPrescriptions();
  }, []);

  async function dispense(id) {
    await supabase
      .from("prescriptions")
      .update({ dispensed: true, dispensed_by: staff.id, dispensed_at: new Date().toISOString() })
      .eq("id", id);
    loadPrescriptions();
  }

  const pending = prescriptions.filter((p) => !p.dispensed);
  const dispensed = prescriptions.filter((p) => p.dispensed);

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Prescription queue</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Prescriptions written by doctors appear here for dispensing.</p>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
              Pending <span style={{ color: "#7C8A90", fontWeight: 500 }}>({pending.length})</span>
            </h3>
            <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
              {pending.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>No prescriptions waiting.</div>
              ) : (
                pending.map((p, i) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < pending.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.consultations?.patients?.name} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {p.drug} {p.dosage && `— ${p.dosage}`}</span></div>
                      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{p.consultations?.patients?.code} · {p.instructions}</div>
                    </div>
                    <button className="wl-btn" onClick={() => dispense(p.id)} style={{ background: "#3D6FB4", color: "#fff", whiteSpace: "nowrap" }}>
                      Mark dispensed
                    </button>
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
                dispensed.map((p, i) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: i < dispensed.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.consultations?.patients?.name} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {p.drug}</span></div>
                    <span className="wl-badge" style={{ background: "#2F7D4F1A", color: "#2F7D4F" }}>Dispensed</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

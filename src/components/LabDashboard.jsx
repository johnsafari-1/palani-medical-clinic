import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Header from "./Header";

export default function LabDashboard({ staff, onLogout }) {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resultDrafts, setResultDrafts] = useState({});

  async function loadLabs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("lab_orders")
      .select("*, patients(name, code)")
      .order("ordered_at", { ascending: false });
    if (!error) setLabs(data);
    setLoading(false);
  }

  useEffect(() => {
    loadLabs();
  }, []);

  async function completeOrder(id) {
    const result = (resultDrafts[id] || "").trim();
    if (!result) return;
    await supabase
      .from("lab_orders")
      .update({ status: "Completed", result, completed_by: staff.id, completed_at: new Date().toISOString() })
      .eq("id", id);
    setResultDrafts({ ...resultDrafts, [id]: "" });
    loadLabs();
  }

  const pending = labs.filter((l) => l.status === "Pending");
  const completed = labs.filter((l) => l.status === "Completed");

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Test orders</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Tests ordered by doctors appear here. Enter results to complete them.</p>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
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
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{l.test_name} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {l.patients?.name}</span></div>
                        <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{l.code} · {l.patients?.code} · ordered {l.ordered_at?.slice(0, 10)}</div>
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
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{l.test_name} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {l.patients?.name}</span></div>
                        <div style={{ fontSize: 12, color: "#5B6B72", marginTop: 4 }}>Result: {l.result}</div>
                      </div>
                      <span className="wl-badge" style={{ background: "#2F7D4F1A", color: "#2F7D4F" }}>Completed</span>
                    </div>
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

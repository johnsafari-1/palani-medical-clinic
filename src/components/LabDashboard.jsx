import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import Header from "./Header";
import { useClinicalQueue } from "../clinical/useClinicalQueue";

export default function LabDashboard({ staff, onLogout }) {
  const { rows: labs, setRows: setLabs, loading, error: queueError, reload } = useClinicalQueue(
    "lab_orders", "*, patients(name, code)", "ordered_at",
  );
  const [resultDrafts, setResultDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function completeOrder(id) {
    if (busy.current || loading || queueError || (unconfirmed && unconfirmed.id !== id)) return;
    const result = (resultDrafts[id] || "").trim();
    if (!result) { setActionError("Enter a result before completing the order."); return; }
    busy.current = true;
    setSavingId(id); setActionError(""); setActionMessage("");
    let databaseRejected = false;
    try {
      const { data, error } = await supabase.rpc("complete_lab_order", { p_order_id: id, p_result: result });
      if (!mounted.current) return;
      if (error) {
        databaseRejected = /^[0-9A-Z]{5}$/.test(error.code || "");
        throw new Error(error.message || "Completion could not be confirmed. Retry the same result.");
      }
      if (data?.id !== id || data.status !== "Completed" || data.result !== result || !data.completed_by || !data.completed_at) {
        throw new Error("Completion could not be confirmed. Retry the same result.");
      }
      setLabs(rows => rows.map(row => row.id === id ? { ...row, ...data } : row));
      setResultDrafts(drafts => ({ ...drafts, [id]: "" }));
      setUnconfirmed(null);
      setActionMessage("Lab result recorded.");
    } catch (error) {
      if (mounted.current) {
        setActionError(error.message);
        setUnconfirmed(databaseRejected ? null : { id });
      }
    } finally {
      busy.current = false;
      if (mounted.current) setSavingId(null);
    }
  }

  const pending = labs.filter((l) => l.status === "Pending");
  const completed = labs.filter((l) => l.status === "Completed");

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div id="clinic-content" role="main" tabIndex={-1} className="wl-page" style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Test orders</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Tests ordered by doctors appear here. Enter results to complete them.</p>
        <button type="button" className="wl-btn" onClick={reload} disabled={loading || !!savingId || !!unconfirmed}>Refresh queue</button>
        {queueError && <p role="alert">{queueError} <button type="button" onClick={reload}>Retry queue</button></p>}
        {actionError && <p role="alert">{actionError}</p>}
        {actionMessage && <p role="status">{actionMessage}</p>}
        {unconfirmed && <p role="status">Completion is unconfirmed. Retry the same result before refreshing or editing it.</p>}

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
              Pending <span style={{ color: "#7C8A90", fontWeight: 500 }}>({pending.length})</span>
            </h3>
            <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
              {queueError && pending.length === 0 ? <p>Pending lab orders unavailable.</p> : pending.length === 0 ? (
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
                        disabled={!!savingId || !!queueError || !!unconfirmed}
                        value={resultDrafts[l.id] || ""}
                        onChange={(e) => setResultDrafts(drafts => ({ ...drafts, [l.id]: e.target.value }))}
                        placeholder="Enter result"
                      />
                      <button className="wl-btn" disabled={!!savingId || !!queueError || (!!unconfirmed && unconfirmed.id !== l.id)} onClick={() => completeOrder(l.id)} style={{ background: "#2B6777", color: "#fff", whiteSpace: "nowrap" }}>
                        {savingId === l.id ? "Recording…" : unconfirmed?.id === l.id ? "Retry completion" : "Mark complete"}
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
              {queueError && completed.length === 0 ? <p>Completed lab orders unavailable.</p> : completed.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>No completed tests yet.</div>
              ) : (
                completed.map((l, i) => (
                  <div key={l.id} style={{ padding: "14px 18px", borderBottom: i < completed.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{l.test_name} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {l.patients?.name}</span></div>
                        <div style={{ fontSize: 12, color: "#5B6B72", marginTop: 4 }}>Result: {l.result}</div>
                        {resultDrafts[l.id] && <p>Unsubmitted draft (not saved): {resultDrafts[l.id]}</p>}
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

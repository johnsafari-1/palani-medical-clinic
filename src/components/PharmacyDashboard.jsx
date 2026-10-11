import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import Header from "./Header";
import { useClinicalQueue } from "../clinical/useClinicalQueue";

export default function PharmacyDashboard({ staff, onLogout }) {
  const { rows: prescriptions, setRows: setPrescriptions, loading, error: queueError, reload } = useClinicalQueue(
    "prescriptions", "*, consultations(code, created_at, patients(name, code))", "id",
  );
  const [savingId, setSavingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function dispense(id) {
    if (busy.current || loading || queueError) return;
    busy.current = true;
    setSavingId(id); setActionError(""); setActionMessage("");
    try {
      const { data, error } = await supabase.rpc("dispense_prescription", { p_prescription_id: id });
      if (!mounted.current) return;
      if (error) throw new Error(error.message || "Dispensing could not be confirmed. Retry or refresh the queue.");
      if (data?.id !== id || data.dispensed !== true || !data.dispensed_by || !data.dispensed_at) {
        throw new Error("Dispensing could not be confirmed. Retry or refresh the queue.");
      }
      setPrescriptions(rows => rows.map(row => row.id === id ? { ...row, ...data } : row));
      setActionMessage("Dispensing recorded.");
    } catch (error) {
      if (mounted.current) setActionError(error.message);
    } finally {
      busy.current = false;
      if (mounted.current) setSavingId(null);
    }
  }

  const pending = prescriptions.filter((p) => !p.dispensed);
  const dispensed = prescriptions.filter((p) => p.dispensed);

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div className="wl-page" style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Prescription queue</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Prescriptions written by doctors appear here for dispensing.</p>
        <button type="button" className="wl-btn" onClick={reload} disabled={loading || !!savingId}>Refresh queue</button>
        {queueError && <p role="alert">{queueError} <button type="button" onClick={reload}>Retry queue</button></p>}
        {actionError && <p role="alert">{actionError}</p>}
        {actionMessage && <p role="status">{actionMessage}</p>}

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
              Pending <span style={{ color: "#7C8A90", fontWeight: 500 }}>({pending.length})</span>
            </h3>
            <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
              {queueError && pending.length === 0 ? <p>Pending prescriptions unavailable.</p> : pending.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>No prescriptions waiting.</div>
              ) : (
                pending.map((p, i) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < pending.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.consultations?.patients?.name} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {p.drug} {p.dosage && `— ${p.dosage}`}</span></div>
                      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{p.consultations?.patients?.code} · {p.instructions}</div>
                    </div>
                    <button className="wl-btn" disabled={!!savingId || !!queueError} onClick={() => dispense(p.id)} style={{ background: "#3D6FB4", color: "#fff", whiteSpace: "nowrap" }}>
                      {savingId === p.id ? "Recording…" : "Mark dispensed"}
                    </button>
                  </div>
                ))
              )}
            </div>

            <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
              Dispensed <span style={{ color: "#7C8A90", fontWeight: 500 }}>({dispensed.length})</span>
            </h3>
            <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
              {queueError && dispensed.length === 0 ? <p>Dispensing history unavailable.</p> : dispensed.length === 0 ? (
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

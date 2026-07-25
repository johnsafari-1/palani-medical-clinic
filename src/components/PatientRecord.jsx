import { useEffect, useState } from "react";
import { X, FileText, HeartPulse, FlaskConical, BedDouble, Receipt, Printer } from "lucide-react";
import { supabase } from "../supabaseClient";

export default function PatientRecord({ patient, onClose }) {
  const [loading, setLoading] = useState(true);
  const [consultations, setConsultations] = useState([]);
  const [vitals, setVitals] = useState([]);
  const [labs, setLabs] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: c }, { data: v }, { data: l }, { data: a }, { data: inv }] = await Promise.all([
        supabase.from("consultations").select("*, prescriptions(*)").eq("patient_id", patient.id).order("created_at", { ascending: false }),
        supabase.from("vitals").select("*").eq("patient_id", patient.id).order("recorded_at", { ascending: false }),
        supabase.from("lab_orders").select("*").eq("patient_id", patient.id).order("ordered_at", { ascending: false }),
        supabase.from("admissions").select("*").eq("patient_id", patient.id).order("admitted_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("patient_id", patient.id).order("created_at", { ascending: false }),
      ]);
      setConsultations(c || []);
      setVitals(v || []);
      setLabs(l || []);
      setAdmissions(a || []);
      setInvoices(inv || []);
      setLoading(false);
    })();
  }, [patient.id]);

  function printSummary() {
    const consultRows = consultations
      .map(
        (c) => `
      <div class="entry">
        <div class="entry-head"><strong>${c.diagnosis}</strong><span>${c.created_at?.slice(0, 10)}</span></div>
        ${c.notes ? `<p>${c.notes}</p>` : ""}
        ${c.prescriptions?.length ? `<ul>${c.prescriptions.map((p) => `<li>${p.drug} ${p.dosage || ""} ${p.dispensed ? "(dispensed)" : "(pending)"}</li>`).join("")}</ul>` : ""}
      </div>`
      )
      .join("");

    const vitalsRows = vitals
      .map((v) => `<tr><td>${v.recorded_at?.slice(0, 10)}</td><td>${v.bp || "—"}</td><td>${v.temperature || "—"}</td><td>${v.pulse || "—"}</td><td>${v.weight || "—"}</td></tr>`)
      .join("");

    const labRows = labs
      .map((l) => `<tr><td>${l.test_name}</td><td>${l.status}</td><td>${l.result || "—"}</td><td>${l.ordered_at?.slice(0, 10)}</td></tr>`)
      .join("");

    const invoiceRows = invoices
      .map((i) => `<tr><td>${i.code}</td><td>${i.created_at?.slice(0, 10)}</td><td>KES ${Number(i.total).toLocaleString()}</td><td>${i.status}</td></tr>`)
      .join("");

    const html = `
      <!doctype html><html><head><meta charset="utf-8" /><title>${patient.name} — Patient Summary</title>
      <style>
        body { font-family: Arial, sans-serif; color: #1E2A30; padding: 40px; max-width: 700px; margin: 0 auto; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 2px solid #1E2A30; padding-bottom: 4px; }
        .sub { color: #5B6B72; font-size: 13px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { text-align: left; border-bottom: 1px solid #DCE3E6; padding: 6px 4px; }
        .entry { border-bottom: 1px solid #EEF1F2; padding: 10px 0; font-size: 13px; }
        .entry-head { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
        .entry ul { margin: 4px 0 0; padding-left: 18px; font-size: 12px; }
      </style></head>
      <body>
        <h1>Palani Medical Clinic</h1>
        <div class="sub">Patient summary — ${patient.name} (${patient.code})</div>
        <p style="font-size:13px">${patient.gender} · DOB ${patient.dob} · ${patient.phone}</p>

        <h2>Consultations</h2>
        ${consultRows || "<p style='font-size:12px;color:#7C8A90'>None recorded.</p>"}

        <h2>Vitals</h2>
        <table><thead><tr><th>Date</th><th>BP</th><th>Temp</th><th>Pulse</th><th>Weight</th></tr></thead><tbody>${vitalsRows || ""}</tbody></table>

        <h2>Lab tests</h2>
        <table><thead><tr><th>Test</th><th>Status</th><th>Result</th><th>Ordered</th></tr></thead><tbody>${labRows || ""}</tbody></table>

        <h2>Invoices</h2>
        <table><thead><tr><th>Code</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>${invoiceRows || ""}</tbody></table>
      </body></html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(30,42,48,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}
      onClick={onClose}
    >
      <div
        className="wl-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#F5F7F8", borderRadius: 16, maxWidth: 720, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 28 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: 0 }}>{patient.name}</h2>
            <p style={{ fontSize: 12, color: "#7C8A90", margin: "4px 0 0" }}>
              {patient.gender} · DOB {patient.dob} · {patient.phone} · <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{patient.code}</span>
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="wl-btn icon-btn" onClick={printSummary} aria-label="Print summary" title="Print full summary">
              <Printer size={16} color="#5B6B72" />
            </button>
            <button className="wl-btn icon-btn" onClick={onClose} aria-label="Close" title="Close">
              <X size={16} color="#5B6B72" />
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading patient record…</div>
        ) : (
          <>
            {admissions.some((a) => a.status === "Admitted") && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#A13D3D1A", color: "#A13D3D", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12, fontWeight: 600 }}>
                <BedDouble size={14} /> Currently admitted
              </div>
            )}

            <Section title="Consultations" icon={<FileText size={14} color="#2F7D4F" />}>
              {consultations.length === 0 ? (
                <Empty text="No consultations yet." />
              ) : (
                consultations.map((c) => (
                  <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid #EEF1F2" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                      <span>{c.diagnosis}</span>
                      <span style={{ fontWeight: 500, color: "#7C8A90", fontSize: 12 }}>{c.created_at?.slice(0, 10)}</span>
                    </div>
                    {c.notes && <p style={{ fontSize: 12, color: "#5B6B72", margin: "4px 0" }}>{c.notes}</p>}
                    {c.prescriptions?.length > 0 && (
                      <div style={{ fontSize: 12, color: "#5B6B72" }}>
                        {c.prescriptions.map((p) => (
                          <div key={p.id}>• {p.drug} {p.dosage} {p.dispensed && <span style={{ color: "#2F7D4F" }}>✓ dispensed</span>}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </Section>

            <Section title="Vitals" icon={<HeartPulse size={14} color="#C2467D" />}>
              {vitals.length === 0 ? (
                <Empty text="No vitals recorded." />
              ) : (
                vitals.map((v) => (
                  <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EEF1F2", fontSize: 12, color: "#5B6B72" }}>
                    <span>{v.bp && `BP ${v.bp}`} {v.temperature && `· Temp ${v.temperature}°C`} {v.pulse && `· Pulse ${v.pulse}`} {v.weight && `· ${v.weight}kg`}</span>
                    <span style={{ color: "#7C8A90" }}>{v.recorded_at?.slice(0, 10)}</span>
                  </div>
                ))
              )}
            </Section>

            <Section title="Lab tests" icon={<FlaskConical size={14} color="#C77D2E" />}>
              {labs.length === 0 ? (
                <Empty text="No lab tests ordered." />
              ) : (
                labs.map((l) => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EEF1F2", fontSize: 12 }}>
                    <span><strong style={{ color: "#1E2A30" }}>{l.test_name}</strong> {l.status === "Completed" ? `— ${l.result}` : <span style={{ color: "#C77D2E" }}>Pending</span>}</span>
                    <span style={{ color: "#7C8A90" }}>{l.ordered_at?.slice(0, 10)}</span>
                  </div>
                ))
              )}
            </Section>

            <Section title="Ward admissions" icon={<BedDouble size={14} color="#A13D3D" />}>
              {admissions.length === 0 ? (
                <Empty text="No admission history." />
              ) : (
                admissions.map((a) => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EEF1F2", fontSize: 12, color: "#5B6B72" }}>
                    <span>{a.admitted_at?.slice(0, 10)} → {a.discharged_at ? a.discharged_at.slice(0, 10) : "present"}</span>
                    <span className="wl-badge" style={{ background: a.status === "Admitted" ? "#A13D3D1A" : "#2F7D4F1A", color: a.status === "Admitted" ? "#A13D3D" : "#2F7D4F" }}>{a.status}</span>
                  </div>
                ))
              )}
            </Section>

            <Section title="Invoices" icon={<Receipt size={14} color="#3D6FB4" />}>
              {invoices.length === 0 ? (
                <Empty text="No invoices yet." />
              ) : (
                invoices.map((i) => (
                  <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EEF1F2", fontSize: 12, color: "#5B6B72" }}>
                    <span>{i.code} — KES {Number(i.total).toLocaleString()}</span>
                    <span className="wl-badge" style={{ background: i.status === "Paid" ? "#2F7D4F1A" : "#A13D3D1A", color: i.status === "Paid" ? "#2F7D4F" : "#A13D3D" }}>{i.status}</span>
                  </div>
                ))
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {icon}
        <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 13, margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }) {
  return <p style={{ fontSize: 12, color: "#7C8A90", margin: 0 }}>{text}</p>;
}

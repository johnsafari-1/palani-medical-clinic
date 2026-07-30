import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { supabase } from "../supabaseClient";
import Header from "./Header";

export default function CashierDashboard({ staff, onLogout }) {
  const [consultations, setConsultations] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [priceList, setPriceList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState(null);
  const [lines, setLines] = useState([]);
  const [payMethodTarget, setPayMethodTarget] = useState(null);
  const [payMethod, setPayMethod] = useState("Cash");

  async function loadData() {
    setLoading(true);
    const [{ data: c }, { data: adm }, { data: inv }, { data: prices }] = await Promise.all([
      supabase.from("consultations").select("*, patients(name, code), prescriptions(*)").order("created_at", { ascending: false }),
      supabase.from("admissions").select("*, patients(name, code)").eq("status", "Discharged").order("discharged_at", { ascending: false }),
      supabase.from("invoices").select("*, patients(name, code)").order("created_at", { ascending: false }),
      supabase.from("price_list").select("*").eq("active", true).order("category").order("name"),
    ]);
    setConsultations(c || []);
    setAdmissions(adm || []);
    setInvoices(inv || []);
    setPriceList(prices || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const invoicedConsultIds = new Set(invoices.map((inv) => inv.consultation_id).filter(Boolean));
  const invoicedAdmissionIds = new Set(invoices.map((inv) => inv.admission_id).filter(Boolean));
  const awaitingBilling = consultations.filter((c) => !invoicedConsultIds.has(c.id));
  const awaitingStayBilling = admissions.filter((a) => !invoicedAdmissionIds.has(a.id));

  function daysAdmitted(a) {
    const ms = new Date(a.discharged_at) - new Date(a.admitted_at);
    return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }

  function startBilling(c) {
    setBilling({ type: "visit", data: c });
    const initialLines = [
      { key: "consult", label: "Consultation fee", priceItemId: "", quantity: 1, amount: 0 },
      ...c.prescriptions.map((p, idx) => ({ key: `rx-${idx}`, label: p.drug, priceItemId: "", quantity: 1, amount: 0 })),
    ];
    setLines(initialLines);
  }

  function startStayBilling(a) {
    setBilling({ type: "stay", data: a });
    setLines([{ key: "room", label: `Room charge (${daysAdmitted(a)} day${daysAdmitted(a) > 1 ? "s" : ""})`, priceItemId: "", quantity: daysAdmitted(a), amount: 0 }]);
  }

  function addExtraLine() {
    setLines([...lines, { key: `extra-${Date.now()}`, label: "Additional item", priceItemId: "", quantity: 1, amount: 0 }]);
  }

  function updateLine(key, field, value) {
    setLines(
      lines.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, [field]: value };
        if (field === "priceItemId") {
          const item = priceList.find((p) => p.id === value);
          next.amount = item ? item.price * next.quantity : 0;
        }
        if (field === "quantity") {
          const item = priceList.find((p) => p.id === next.priceItemId);
          next.amount = item ? item.price * (parseFloat(value) || 0) : next.amount;
        }
        return next;
      })
    );
  }

  const total = lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

  async function createInvoice(e) {
    e.preventDefault();
    if (!billing) return;

    const patientId = billing.type === "visit" ? billing.data.patient_id : billing.data.patient_id;
    const insertPayload = {
      patient_id: patientId,
      total,
      created_by: staff.id,
      ...(billing.type === "visit" ? { consultation_id: billing.data.id } : { admission_id: billing.data.id }),
    };

    const { data: invoice, error } = await supabase.from("invoices").insert(insertPayload).select().single();

    if (error) return;

    const items = lines
      .filter((l) => l.priceItemId)
      .map((l) => {
        const item = priceList.find((p) => p.id === l.priceItemId);
        return {
          invoice_id: invoice.id,
          label: item ? item.name : l.label,
          quantity: l.quantity,
          unit_price: item ? item.price : null,
          amount: l.amount,
        };
      });
    if (items.length) await supabase.from("invoice_items").insert(items);

    setBilling(null);
    setLines([]);
    loadData();
  }

  function openPayMethod(id) {
    setPayMethodTarget(id);
    setPayMethod("Cash");
  }

  async function confirmPaid(id) {
    await supabase.from("invoices").update({ status: "Paid", payment_method: payMethod, paid_at: new Date().toISOString() }).eq("id", id);
    setPayMethodTarget(null);
    loadData();
  }

  async function printReceipt(inv) {
    const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", inv.id);
    const rows = (items || [])
      .map(
        (it) => `
        <tr>
          <td>${it.label}</td>
          <td style="text-align:center">${it.quantity}</td>
          <td style="text-align:right">${it.unit_price != null ? "KES " + Number(it.unit_price).toLocaleString() : "—"}</td>
          <td style="text-align:right">KES ${Number(it.amount).toLocaleString()}</td>
        </tr>`
      )
      .join("");

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt ${inv.code}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1E2A30; padding: 40px; max-width: 640px; margin: 0 auto; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          .sub { color: #5B6B72; font-size: 13px; margin-bottom: 24px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
          th { text-align: left; border-bottom: 2px solid #1E2A30; padding: 8px 4px; font-size: 12px; }
          td { border-bottom: 1px solid #DCE3E6; padding: 8px 4px; }
          .total { display: flex; justify-content: space-between; margin-top: 16px; font-size: 16px; font-weight: bold; }
          .status { display: inline-block; margin-top: 16px; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; background: ${inv.status === "Paid" ? "#2F7D4F1A" : "#A13D3D1A"}; color: ${inv.status === "Paid" ? "#2F7D4F" : "#A13D3D"}; }
          .footer { margin-top: 32px; font-size: 11px; color: #7C8A90; text-align: center; }
        </style>
      </head>
      <body>
        <h1>Palani Medical Clinic</h1>
        <div class="sub">Receipt · ${inv.code}</div>
        <div class="row"><span>Patient</span><strong>${inv.patients?.name || ""}</strong></div>
        <div class="row"><span>Patient ID</span><strong>${inv.patients?.code || ""}</strong></div>
        <div class="row"><span>Date</span><strong>${inv.created_at?.slice(0, 10)}</strong></div>
        ${inv.payment_method ? `<div class="row"><span>Payment method</span><strong>${inv.payment_method}</strong></div>` : ""}
        <table>
          <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit price</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="total"><span>Total</span><span>KES ${Number(inv.total).toLocaleString()}</span></div>
        <span class="status">${inv.status}</span>
        <div class="footer">Thank you for visiting Palani Medical Clinic.</div>
      </body>
      </html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div className="wl-page" style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>Billing</h2>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Generate an invoice from a consultation, then collect payment.</p>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
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
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.patients?.name} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {c.diagnosis}</span></div>
                      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{c.code} · {c.created_at?.slice(0, 10)}</div>
                    </div>
                    <button className="wl-btn" onClick={() => startBilling(c)} style={{ background: "#A13D3D", color: "#fff" }}>Bill this visit</button>
                  </div>
                ))
              )}
            </div>

            <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
              Stays awaiting billing <span style={{ color: "#7C8A90", fontWeight: 500 }}>({awaitingStayBilling.length})</span>
            </h3>
            <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
              {awaitingStayBilling.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>No discharged stays waiting to be billed.</div>
              ) : (
                awaitingStayBilling.map((a, i) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < awaitingStayBilling.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.patients?.name} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {daysAdmitted(a)} day{daysAdmitted(a) > 1 ? "s" : ""} admitted</span></div>
                      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{a.code} · {a.admitted_at?.slice(0, 10)} → {a.discharged_at?.slice(0, 10)}</div>
                    </div>
                    <button className="wl-btn" onClick={() => startStayBilling(a)} style={{ background: "#A13D3D", color: "#fff" }}>Bill this stay</button>
                  </div>
                ))
              )}
            </div>

            {billing && (
              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 14px" }}>
                  {billing.type === "visit" ? "Invoice for " + billing.data.patients?.name : "Ward stay invoice for " + billing.data.patients?.name}
                </h3>
                <form onSubmit={createInvoice}>
                  {lines.map((l) => (
                    <div key={l.key} className="wl-form-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr", gap: 10, alignItems: "end", padding: "8px 0", borderBottom: "1px solid #EEF1F2" }}>
                      <div>
                        <label style={{ fontSize: 11, color: "#7C8A90", display: "block", marginBottom: 2 }}>{l.label}</label>
                        <select className="wl-input" value={l.priceItemId} onChange={(e) => updateLine(l.key, "priceItemId", e.target.value)}>
                          <option value="">Select price list item…</option>
                          {priceList.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} — KES {Number(p.price).toLocaleString()}/{p.unit}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "#7C8A90", display: "block", marginBottom: 2 }}>Qty</label>
                        <input className="wl-input" type="number" min="1" value={l.quantity} onChange={(e) => updateLine(l.key, "quantity", e.target.value)} />
                      </div>
                      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>
                        KES {Number(l.amount).toLocaleString()}
                      </div>
                    </div>
                  ))}

                  <button type="button" className="wl-btn" onClick={addExtraLine} style={{ background: "#F5F7F8", color: "#5B6B72", marginTop: 10 }}>
                    + Add another item
                  </button>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 4px" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
                    <span style={{ fontSize: 16, fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>KES {total.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button className="wl-btn" type="submit" style={{ background: "#2B6777", color: "#fff" }}>Create invoice</button>
                    <button className="wl-btn" type="button" onClick={() => { setBilling(null); setLines([]); }} style={{ background: "#F5F7F8", color: "#5B6B72" }}>Cancel</button>
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
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{inv.patients?.name} <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, color: "#7C8A90" }}>· KES {Number(inv.total).toLocaleString()}</span></div>
                      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{inv.code} · {inv.created_at?.slice(0, 10)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {inv.status === "Unpaid" ? (
                        payMethodTarget === inv.id ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <select className="wl-input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ width: 110 }}>
                              <option>Cash</option>
                              <option>M-Pesa</option>
                              <option>Card</option>
                              <option>Other</option>
                            </select>
                            <button className="wl-btn" onClick={() => confirmPaid(inv.id)} style={{ background: "#2F7D4F", color: "#fff", fontSize: 12 }}>Confirm</button>
                            <button className="wl-btn" onClick={() => setPayMethodTarget(null)} style={{ background: "#F5F7F8", color: "#5B6B72", fontSize: 12 }}>Cancel</button>
                          </div>
                        ) : (
                          <button className="wl-btn" onClick={() => openPayMethod(inv.id)} style={{ background: "#2F7D4F", color: "#fff" }}>Mark paid</button>
                        )
                      ) : (
                        <span className="wl-badge" style={{ background: "#2F7D4F1A", color: "#2F7D4F" }}>Paid via {inv.payment_method || "—"}</span>
                      )}
                      <button className="wl-btn icon-btn" onClick={() => printReceipt(inv)} aria-label="Print receipt" title="Print receipt">
                        <Printer size={15} color="#5B6B72" />
                      </button>
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

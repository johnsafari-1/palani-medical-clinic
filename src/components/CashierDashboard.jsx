import { useEffect, useState } from "react";
import { Printer, ShoppingBag } from "lucide-react";
import { supabase } from "../supabaseClient";
import Header from "./Header";

const CATEGORY_FOR_LINE = { consult: "Consultation", room: "Room" };

export default function CashierDashboard({ staff, onLogout }) {
  const [consultations, setConsultations] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [priceList, setPriceList] = useState([]);
  const [patients, setPatients] = useState([]);
  const [pendingLabs, setPendingLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState(null);
  const [lines, setLines] = useState([]);
  const [payMethodTarget, setPayMethodTarget] = useState(null);
  const [payMethod, setPayMethod] = useState("Cash");
  const [showOtc, setShowOtc] = useState(false);
  const [otcPatientId, setOtcPatientId] = useState("");
  const [otcLines, setOtcLines] = useState([{ key: 1, priceItemId: "", quantity: 1, amount: 0 }]);
  const [otcError, setOtcError] = useState("");

  async function loadData() {
    setLoading(true);
    const [{ data: c }, { data: adm }, { data: inv }, { data: prices }, { data: pts }, { data: labs }] = await Promise.all([
      supabase.from("consultations").select("*, patients(name, code), prescriptions(*)").order("created_at", { ascending: false }),
      supabase.from("admissions").select("*, patients(name, code)").eq("status", "Discharged").order("discharged_at", { ascending: false }),
      supabase.from("invoices").select("*, patients(name, code)").order("created_at", { ascending: false }),
      supabase.from("price_list").select("*").eq("active", true).order("category").order("name"),
      supabase.from("patients").select("*").order("name"),
      supabase.from("lab_orders").select("*").eq("billed", false),
    ]);
    setConsultations(c || []);
    setAdmissions(adm || []);
    setInvoices(inv || []);
    setPriceList(prices || []);
    setPatients(pts || []);
    setPendingLabs(labs || []);
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

  function itemsForCategory(category) {
    return priceList.filter((p) => p.category === category);
  }

  function startBilling(c) {
    setBilling({ type: "visit", data: c });
    const unbilledRx = (c.prescriptions || []).filter((p) => !p.billed);
    const unbilledLabs = pendingLabs.filter((l) => l.consultation_id === c.id);
    const initialLines = [
      { key: "consult", label: "Consultation fee", category: "Consultation", priceItemId: "", quantity: 1, amount: 0 },
      ...unbilledRx.map((p) => ({ key: `rx-${p.id}`, label: p.drug, category: "Medication", prescription_id: p.id, priceItemId: "", quantity: 1, amount: 0 })),
      ...unbilledLabs.map((l) => ({ key: `lab-${l.id}`, label: l.test_name, category: "Lab Test", lab_order_id: l.id, priceItemId: "", quantity: 1, amount: 0 })),
    ];
    setLines(initialLines);
  }

  function startStayBilling(a) {
    setBilling({ type: "stay", data: a });
    setLines([{ key: "room", label: `Room charge (${daysAdmitted(a)} day${daysAdmitted(a) > 1 ? "s" : ""})`, category: "Room", priceItemId: "", quantity: daysAdmitted(a), amount: 0 }]);
  }

  function addExtraLine() {
    setLines([...lines, { key: `extra-${Date.now()}`, label: "Additional item", category: null, priceItemId: "", quantity: 1, amount: 0 }]);
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

    const patientId = billing.data.patient_id;
    const insertPayload = {
      patient_id: patientId,
      total,
      created_by: staff.id,
      sale_type: "Encounter",
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
          prescription_id: l.prescription_id || null,
          lab_order_id: l.lab_order_id || null,
        };
      });

    if (items.length) {
      const { error: itemsError } = await supabase.from("invoice_items").insert(items);
      if (itemsError) {
        // The database guard rejected a line (e.g. already billed) — surface it clearly
        alert("Could not save invoice items: " + itemsError.message);
        return;
      }
    }

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

  function addOtcLine() {
    setOtcLines([...otcLines, { key: Date.now(), priceItemId: "", quantity: 1, amount: 0 }]);
  }
  function updateOtcLine(key, field, value) {
    setOtcLines(
      otcLines.map((l) => {
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
  function removeOtcLine(key) {
    setOtcLines(otcLines.filter((l) => l.key !== key));
  }
  const otcTotal = otcLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

  async function submitOtc(e) {
    e.preventDefault();
    if (!otcPatientId) {
      setOtcError("Select a patient for this sale.");
      return;
    }
    const validLines = otcLines.filter((l) => l.priceItemId);
    if (validLines.length === 0) {
      setOtcError("Add at least one item.");
      return;
    }
    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({ patient_id: otcPatientId, total: otcTotal, created_by: staff.id, sale_type: "OTC" })
      .select()
      .single();
    if (error) {
      setOtcError(error.message);
      return;
    }
    const items = validLines.map((l) => {
      const item = priceList.find((p) => p.id === l.priceItemId);
      return { invoice_id: invoice.id, label: item.name, quantity: l.quantity, unit_price: item.price, amount: l.amount };
    });
    await supabase.from("invoice_items").insert(items);
    setShowOtc(false);
    setOtcPatientId("");
    setOtcLines([{ key: Date.now(), priceItemId: "", quantity: 1, amount: 0 }]);
    setOtcError("");
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
        <div class="sub">Receipt · ${inv.code}${inv.sale_type === "OTC" ? " · Over-the-counter sale" : ""}</div>
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
      <div id="clinic-content" role="main" tabIndex={-1} className="wl-page" style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: 0 }}>Billing</h2>
          <button className="wl-btn" onClick={() => setShowOtc(true)} style={{ background: "#3D6FB4", color: "#fff", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <ShoppingBag size={14} /> New OTC sale
          </button>
        </div>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Bill against clinical orders from a visit or stay — or record a direct over-the-counter sale.</p>

        {showOtc && (
          <div className="wl-fade-in" style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 4px" }}>Over-the-counter sale</h3>
            <p style={{ fontSize: 12, color: "#7C8A90", margin: "0 0 14px" }}>For direct purchases with no doctor visit — items are picked freely, not tied to a clinical order.</p>
            <form onSubmit={submitOtc}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Patient</label>
              <select className="wl-input" value={otcPatientId} onChange={(e) => setOtcPatientId(e.target.value)} style={{ marginBottom: 12 }}>
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.code}</option>
                ))}
              </select>

              {otcLines.map((l) => (
                <div key={l.key} className="wl-form-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 0.6fr 0.6fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
                  <select className="wl-input" value={l.priceItemId} onChange={(e) => updateOtcLine(l.key, "priceItemId", e.target.value)}>
                    <option value="">Select item…</option>
                    {priceList.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — KES {Number(p.price).toLocaleString()}/{p.unit}</option>
                    ))}
                  </select>
                  <input className="wl-input" type="number" min="1" value={l.quantity} onChange={(e) => updateOtcLine(l.key, "quantity", e.target.value)} />
                  <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>KES {Number(l.amount).toLocaleString()}</div>
                  <button type="button" className="wl-btn icon-btn danger" onClick={() => removeOtcLine(l.key)} style={{ color: "#A13D3D" }}>✕</button>
                </div>
              ))}
              <button type="button" className="wl-btn" onClick={addOtcLine} style={{ background: "#F5F7F8", color: "#5B6B72", fontSize: 12, marginBottom: 12 }}>+ Add item</button>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Total</span>
                <span style={{ fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>KES {otcTotal.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="wl-btn" type="submit" style={{ background: "#3D6FB4", color: "#fff" }}>Create OTC invoice</button>
                <button type="button" className="wl-btn" onClick={() => setShowOtc(false)} style={{ background: "#F5F7F8", color: "#5B6B72" }}>Cancel</button>
                {otcError && <span style={{ color: "#A13D3D", fontSize: 12 }}>{otcError}</span>}
              </div>
            </form>
          </div>
        )}

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
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 4px" }}>
                  {billing.type === "visit" ? "Invoice for " + billing.data.patients?.name : "Ward stay invoice for " + billing.data.patients?.name}
                </h3>
                <p style={{ fontSize: 12, color: "#7C8A90", margin: "0 0 14px" }}>Only items actually ordered or prescribed for this {billing.type === "visit" ? "visit" : "stay"} can be billed here.</p>
                <form onSubmit={createInvoice}>
                  {lines.map((l) => (
                    <div key={l.key} className="wl-form-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr", gap: 10, alignItems: "end", padding: "8px 0", borderBottom: "1px solid #EEF1F2" }}>
                      <div>
                        <label style={{ fontSize: 11, color: "#7C8A90", display: "block", marginBottom: 2 }}>{l.label}</label>
                        <select className="wl-input" value={l.priceItemId} onChange={(e) => updateLine(l.key, "priceItemId", e.target.value)}>
                          <option value="">Select price list item…</option>
                          {(l.category ? itemsForCategory(l.category) : priceList).map((p) => (
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

                  {billing.type === "stay" && (
                    <button type="button" className="wl-btn" onClick={addExtraLine} style={{ background: "#F5F7F8", color: "#5B6B72", marginTop: 10 }}>
                      + Add another item
                    </button>
                  )}

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
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {inv.patients?.name} <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, color: "#7C8A90" }}>· KES {Number(inv.total).toLocaleString()}</span>
                        {inv.sale_type === "OTC" && <span className="wl-badge" style={{ marginLeft: 8, background: "#3D6FB41A", color: "#3D6FB4", fontSize: 10 }}>OTC</span>}
                      </div>
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

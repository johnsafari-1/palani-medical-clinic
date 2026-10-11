import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, ShoppingBag } from "lucide-react";
import { supabase } from "../supabaseClient";
import Header from "./Header";
import { createInvoiceSubmission, createPaymentSubmission } from "../clinical/billingSubmission";
import { escapeHtml } from "../printing/escapeHtml";

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
  const [queueError, setQueueError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  const invoiceSubmission = useRef(null);
  const paymentSubmission = useRef(null);
  if (!invoiceSubmission.current) invoiceSubmission.current = createInvoiceSubmission(supabase);
  if (!paymentSubmission.current) paymentSubmission.current = createPaymentSubmission(supabase);
  const locked = loading || !!queueError || saving || !!unconfirmed;
  const editing = !!billing || showOtc || !!payMethodTarget;

  const loadData = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setQueueError("");
    try {
    const results = await Promise.all([
      supabase.from("consultations").select("id, code, patient_id, created_at, patients(name, code), prescriptions(*)").order("created_at", { ascending: false }),
      supabase.from("admissions").select("id, code, patient_id, admitted_at, discharged_at, patients(name, code)").eq("status", "Discharged").order("discharged_at", { ascending: false }),
      supabase.from("invoices").select("*, patients(name, code)").order("created_at", { ascending: false }),
      supabase.from("price_list").select("*").eq("active", true).order("category").order("name"),
      supabase.from("patients").select("id, name, code").order("name"),
      supabase.from("lab_orders").select("id, consultation_id, test_name").eq("billed", false),
    ]);
    if (request !== generation.current) return;
    if (results.some(result => result.error || !Array.isArray(result.data))) throw new Error("Billing unavailable");
    const [c, adm, inv, prices, pts, labs] = results.map(result => result.data);
    setConsultations(c); setAdmissions(adm); setInvoices(inv); setPriceList(prices); setPatients(pts); setPendingLabs(labs);
    } catch {
      if (request === generation.current) setQueueError("Billing could not be refreshed. Previously loaded records are shown for reference; actions are disabled until retry succeeds.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadData();
    return () => { mounted.current = false; generation.current += 1; };
  }, [loadData]);

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
    if (locked || editing) return;
    setActionError(""); setActionMessage("");
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
    if (locked || editing) return;
    setActionError(""); setActionMessage("");
    setBilling({ type: "stay", data: a });
    setLines([{ key: "room", label: `Room charge (${daysAdmitted(a)} day${daysAdmitted(a) > 1 ? "s" : ""})`, category: "Room", priceItemId: "", quantity: daysAdmitted(a), amount: 0 }]);
  }

  function addExtraLine() {
    setLines(draft => [...draft, { key: `extra-${crypto.randomUUID()}`, label: "Additional item", category: null, priceItemId: "", quantity: 1 }]);
  }

  function updateLine(key, field, value) {
    setLines(draft => draft.map(l => l.key === key ? { ...l, [field]: value } : l));
  }

  function estimatedAmount(line) {
    const item = priceList.find(p => p.id === line.priceItemId);
    return item ? Math.round((Number(item.price) * Number(line.quantity) + Number.EPSILON) * 100) / 100 || 0 : 0;
  }
  const total = lines.reduce((sum, l) => sum + estimatedAmount(l), 0);

  async function createInvoice(e) {
    e.preventDefault();
    if (!billing || busy.current || loading || queueError) return;
    if (lines.some(l => !l.key.startsWith("extra-") && !l.priceItemId)) {
      setActionError("Select a price for each consultation, room and clinical order line."); return;
    }
    await saveInvoice({ p_patient_id: billing.data.patient_id, p_sale_type: "Encounter",
      p_consultation_id: billing.type === "visit" ? billing.data.id : null,
      p_admission_id: billing.type === "stay" ? billing.data.id : null,
      p_items: invoiceItems(lines),
    });
  }

  function invoiceItems(draft) {
    return draft.filter(l => l.priceItemId).map(l => ({ price_item_id: l.priceItemId, quantity: Number(l.quantity),
      expected_unit_price: Number(priceList.find(p => p.id === l.priceItemId)?.price),
      prescription_id: l.prescription_id || null, lab_order_id: l.lab_order_id || null }));
  }

  async function saveInvoice(payload) {
    if (busy.current || loading || queueError || unconfirmed === "payment") return;
    if (!payload.p_items.length || payload.p_items.some(l => !Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 100000 || Math.round(l.quantity * 1000) / 1000 !== l.quantity)) {
      setActionError("Choose items and positive quantities of at most 100000, with at most three decimal places."); return;
    }
    busy.current = true; setSaving(true); setActionError(""); setActionMessage("");
    try {
      const saved = await invoiceSubmission.current.save(payload);
      if (!mounted.current) return;
      setInvoices(rows => [{ ...saved, patients: patients.find(p => p.id === saved.patient_id) }, ...rows.filter(row => row.id !== saved.id)]);
      setBilling(null); setLines([]); setShowOtc(false); setOtcPatientId("");
      setOtcLines([{ key: Date.now(), priceItemId: "", quantity: 1, amount: 0 }]); setOtcError("");
      setUnconfirmed(null); setActionMessage("Invoice created."); loadData();
    } catch (error) {
      if (mounted.current) { setActionError(error.message); setUnconfirmed(invoiceSubmission.current.hasPending() ? "invoice" : null); }
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  }

  function openPayMethod(id) {
    if (locked || editing) return;
    setActionError(""); setActionMessage("");
    setPayMethodTarget(id);
    setPayMethod("Cash");
  }

  async function confirmPaid(id) {
    if (busy.current || loading || queueError || unconfirmed === "invoice") return;
    busy.current = true; setSaving(true); setActionError(""); setActionMessage("");
    try {
      const saved = await paymentSubmission.current.save(id, payMethod);
      if (!mounted.current) return;
      setInvoices(rows => rows.map(row => row.id === id ? { ...row, ...saved } : row));
      setPayMethodTarget(null); setUnconfirmed(null); setActionMessage("Payment recorded."); loadData();
    } catch (error) {
      if (mounted.current) { setActionError(error.message); setUnconfirmed(paymentSubmission.current.hasPending() ? "payment" : null); }
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  }

  function addOtcLine() {
    setOtcLines(draft => [...draft, { key: crypto.randomUUID(), priceItemId: "", quantity: 1 }]);
  }
  function updateOtcLine(key, field, value) {
    setOtcLines(draft => draft.map(l => l.key === key ? { ...l, [field]: value } : l));
  }
  function removeOtcLine(key) {
    setOtcLines(draft => draft.filter(l => l.key !== key));
  }
  const otcTotal = otcLines.reduce((sum, l) => sum + estimatedAmount(l), 0);

  async function submitOtc(e) {
    e.preventDefault();
    if (busy.current || loading || queueError) return;
    if (!otcPatientId) {
      setOtcError("Select a patient for this sale.");
      return;
    }
    const validLines = otcLines.filter((l) => l.priceItemId);
    if (validLines.length === 0) {
      setOtcError("Add at least one item.");
      return;
    }
    setOtcError("");
    await saveInvoice({ p_patient_id: otcPatientId, p_consultation_id: null, p_admission_id: null, p_sale_type: "OTC", p_items: invoiceItems(validLines) });
  }

  async function printReceipt(inv) {
    if (locked || busy.current) return;
    busy.current = true; setSaving(true); setActionError("");
    try {
    const { data: items, error } = await supabase.from("invoice_items").select("*").eq("invoice_id", inv.id);
    if (!mounted.current) return;
    if (error || !Array.isArray(items) || !items.length || !Number.isFinite(Number(inv.total)) || Number(inv.total)<0 ||
        items.some(item => !Number.isFinite(Number(item.amount)) || Number(item.amount)<0 || !Number.isFinite(Number(item.quantity)) || Number(item.quantity)<=0) ||
        Math.abs(items.reduce((sum,item) => sum + Number(item.amount),0) - Number(inv.total)) > 0.005) {
      throw new Error("Receipt could not be verified. Refresh billing and retry; review inconsistent invoice totals.");
    }
    const rows = (items || [])
      .map(
        (it) => `
        <tr>
          <td>${escapeHtml(it.label)}</td>
          <td style="text-align:center">${escapeHtml(it.quantity)}</td>
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
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
        <title>Receipt ${escapeHtml(inv.code)}</title>
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
        <div class="sub">Receipt · ${escapeHtml(inv.code)}${inv.sale_type === "OTC" ? " · Over-the-counter sale" : ""}</div>
        <div class="row"><span>Patient</span><strong>${escapeHtml(inv.patients?.name)}</strong></div>
        <div class="row"><span>Patient ID</span><strong>${escapeHtml(inv.patients?.code)}</strong></div>
        <div class="row"><span>Date</span><strong>${escapeHtml(inv.created_at?.slice(0, 10))}</strong></div>
        ${inv.payment_method ? `<div class="row"><span>Payment method</span><strong>${escapeHtml(inv.payment_method)}</strong></div>` : ""}
        <table>
          <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit price</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="total"><span>Total</span><span>KES ${Number(inv.total).toLocaleString()}</span></div>
        <span class="status">${escapeHtml(inv.status)}</span>
        <div class="footer">Thank you for visiting Palani Medical Clinic.</div>
      </body>
      </html>`;

    const win = window.open("", "_blank");
    if (!win) throw new Error("Allow popups to print this receipt, then retry.");
    win.opener = null;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    } catch (error) { if (mounted.current) setActionError(error.message); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  }

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div className="wl-page" style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, margin: 0 }}>Billing</h2>
          <button className="wl-btn" disabled={locked || editing} onClick={() => { setShowOtc(true); setActionError(""); setActionMessage(""); }} style={{ background: "#3D6FB4", color: "#fff", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <ShoppingBag size={14} /> New OTC sale
          </button>
        </div>
        <p style={{ color: "#5B6B72", fontSize: 13, margin: "0 0 24px" }}>Bill against clinical orders from a visit or stay — or record a direct over-the-counter sale.</p>
        <button type="button" className="wl-btn" onClick={loadData} disabled={loading || saving || !!unconfirmed}>Refresh billing</button>
        {queueError && <p role="alert">{queueError} <button type="button" onClick={loadData}>Retry billing</button></p>}
        {actionError && <p role="alert">{actionError}</p>}
        {actionMessage && <p role="status">{actionMessage}</p>}
        {unconfirmed && <p role="status">{unconfirmed === "invoice" ? "Invoice creation is unconfirmed. Retry the same draft before editing or leaving this screen." : "Payment is unconfirmed. Retry the same method before editing or leaving this screen."}</p>}

        {showOtc && (
          <div className="wl-fade-in" style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 4px" }}>Over-the-counter sale</h3>
            <p style={{ fontSize: 12, color: "#7C8A90", margin: "0 0 14px" }}>For direct purchases with no doctor visit — items are picked freely, not tied to a clinical order.</p>
            <form onSubmit={submitOtc}>
              <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
              <label htmlFor="otc-patient" style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Patient</label>
              <select id="otc-patient" className="wl-input" value={otcPatientId} onChange={(e) => setOtcPatientId(e.target.value)} style={{ marginBottom: 12 }}>
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.code}</option>
                ))}
              </select>

              {otcLines.map((l) => (
                <div key={l.key} className="wl-form-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 0.6fr 0.6fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
                  <select aria-label="OTC item" className="wl-input" value={l.priceItemId} onChange={(e) => updateOtcLine(l.key, "priceItemId", e.target.value)}>
                    <option value="">Select item…</option>
                    {priceList.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — KES {Number(p.price).toLocaleString()}/{p.unit}</option>
                    ))}
                  </select>
                  <input aria-label="OTC quantity" className="wl-input" type="number" min="0.001" step="0.001" max="100000" value={l.quantity} onChange={(e) => updateOtcLine(l.key, "quantity", e.target.value)} />
                  <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>KES {estimatedAmount(l).toLocaleString()}</div>
                  <button type="button" className="wl-btn icon-btn danger" onClick={() => removeOtcLine(l.key)} style={{ color: "#A13D3D" }}>✕</button>
                </div>
              ))}
              <button type="button" className="wl-btn" onClick={addOtcLine} style={{ background: "#F5F7F8", color: "#5B6B72", fontSize: 12, marginBottom: 12 }}>+ Add item</button>
              </fieldset>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Estimated total</span>
                <span style={{ fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>KES {otcTotal.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="wl-btn" type="submit" disabled={saving || loading || !!queueError} style={{ background: "#3D6FB4", color: "#fff" }}>{saving ? "Saving…" : unconfirmed === "invoice" ? "Retry OTC invoice" : "Create OTC invoice"}</button>
                <button type="button" className="wl-btn" disabled={saving || !!unconfirmed} onClick={() => { setShowOtc(false); setOtcError(""); }} style={{ background: "#F5F7F8", color: "#5B6B72" }}>Cancel</button>
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
              {queueError && awaitingBilling.length === 0 ? <p>Billing queue unavailable.</p> : awaitingBilling.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Nothing to bill right now.</div>
              ) : (
                awaitingBilling.map((c, i) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < awaitingBilling.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.patients?.name}</div>
                      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{c.code} · {c.created_at?.slice(0, 10)}</div>
                    </div>
                    <button className="wl-btn" disabled={locked || editing} onClick={() => startBilling(c)} style={{ background: "#A13D3D", color: "#fff" }}>Bill this visit</button>
                  </div>
                ))
              )}
            </div>

            <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
              Stays awaiting billing <span style={{ color: "#7C8A90", fontWeight: 500 }}>({awaitingStayBilling.length})</span>
            </h3>
            <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
              {queueError && awaitingStayBilling.length === 0 ? <p>Stay billing queue unavailable.</p> : awaitingStayBilling.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>No discharged stays waiting to be billed.</div>
              ) : (
                awaitingStayBilling.map((a, i) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < awaitingStayBilling.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.patients?.name} <span style={{ color: "#7C8A90", fontWeight: 400 }}>· {daysAdmitted(a)} day{daysAdmitted(a) > 1 ? "s" : ""} admitted</span></div>
                      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{a.code} · {a.admitted_at?.slice(0, 10)} → {a.discharged_at?.slice(0, 10)}</div>
                    </div>
                    <button className="wl-btn" disabled={locked || editing} onClick={() => startStayBilling(a)} style={{ background: "#A13D3D", color: "#fff" }}>Bill this stay</button>
                  </div>
                ))
              )}
            </div>

            {billing && (
              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 4px" }}>
                  {billing.type === "visit" ? "Invoice for " + billing.data.patients?.name : "Ward stay invoice for " + billing.data.patients?.name}
                </h3>
                <p style={{ fontSize: 12, color: "#7C8A90", margin: "0 0 14px" }}>Choose prices for this {billing.type === "visit" ? "visit" : "stay"}. The saved total is calculated from the active price list.</p>
                <form onSubmit={createInvoice}>
                  <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
                  {lines.map((l) => (
                    <div key={l.key} className="wl-form-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr", gap: 10, alignItems: "end", padding: "8px 0", borderBottom: "1px solid #EEF1F2" }}>
                      <div>
                        <label htmlFor={`price-${l.key}`} style={{ fontSize: 11, color: "#7C8A90", display: "block", marginBottom: 2 }}>{l.label}</label>
                        <select id={`price-${l.key}`} className="wl-input" value={l.priceItemId} onChange={(e) => updateLine(l.key, "priceItemId", e.target.value)}>
                          <option value="">Select price list item…</option>
                          {(l.category ? itemsForCategory(l.category) : priceList).map((p) => (
                            <option key={p.id} value={p.id}>{p.name} — KES {Number(p.price).toLocaleString()}/{p.unit}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`qty-${l.key}`} style={{ fontSize: 11, color: "#7C8A90", display: "block", marginBottom: 2 }}>Qty</label>
                        <input id={`qty-${l.key}`} className="wl-input" type="number" min="0.001" step="0.001" max="100000" value={l.quantity} onChange={(e) => updateLine(l.key, "quantity", e.target.value)} />
                      </div>
                      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>
                        KES {estimatedAmount(l).toLocaleString()}
                      </div>
                    </div>
                  ))}

                  {billing.type === "stay" && (
                    <button type="button" className="wl-btn" onClick={addExtraLine} style={{ background: "#F5F7F8", color: "#5B6B72", marginTop: 10 }}>
                      + Add another item
                    </button>
                  )}
                  </fieldset>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 4px" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Estimated total</span>
                    <span style={{ fontSize: 16, fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>KES {total.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button className="wl-btn" type="submit" disabled={saving || loading || !!queueError} style={{ background: "#2B6777", color: "#fff" }}>{saving ? "Saving…" : unconfirmed === "invoice" ? "Retry invoice" : "Create invoice"}</button>
                    <button className="wl-btn" type="button" disabled={saving || !!unconfirmed} onClick={() => { setBilling(null); setLines([]); }} style={{ background: "#F5F7F8", color: "#5B6B72" }}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 10px" }}>
              Invoices <span style={{ color: "#7C8A90", fontWeight: 500 }}>({invoices.length})</span>
            </h3>
            <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
              {queueError && invoices.length === 0 ? <p>Invoices unavailable.</p> : invoices.length === 0 ? (
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
                            <select aria-label="Payment method" disabled={locked} className="wl-input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ width: 110 }}>
                              <option>Cash</option>
                              <option>M-Pesa</option>
                              <option>Card</option>
                              <option>Other</option>
                            </select>
                            <button className="wl-btn" disabled={saving || loading || !!queueError} onClick={() => confirmPaid(inv.id)} style={{ background: "#2F7D4F", color: "#fff", fontSize: 12 }}>{saving ? "Recording…" : unconfirmed === "payment" ? "Retry payment" : "Confirm"}</button>
                            <button className="wl-btn" disabled={saving || !!unconfirmed} onClick={() => setPayMethodTarget(null)} style={{ background: "#F5F7F8", color: "#5B6B72", fontSize: 12 }}>Cancel</button>
                          </div>
                        ) : (
                          <button className="wl-btn" disabled={locked || editing} onClick={() => openPayMethod(inv.id)} style={{ background: "#2F7D4F", color: "#fff" }}>Mark paid</button>
                        )
                      ) : (
                        <span className="wl-badge" style={{ background: "#2F7D4F1A", color: "#2F7D4F" }}>Paid via {inv.payment_method || "—"}</span>
                      )}
                      <button className="wl-btn icon-btn" disabled={locked} onClick={() => printReceipt(inv)} aria-label="Print receipt" title="Print receipt">
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

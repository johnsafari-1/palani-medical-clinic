import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Header from "./Header";

export default function CashierDashboard({ staff, onLogout }) {
  const [consultations, setConsultations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [priceList, setPriceList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState(null);
  const [lines, setLines] = useState([]);

  async function loadData() {
    setLoading(true);
    const [{ data: c }, { data: inv }, { data: prices }] = await Promise.all([
      supabase.from("consultations").select("*, patients(name, code), prescriptions(*)").order("created_at", { ascending: false }),
      supabase.from("invoices").select("*, patients(name)").order("created_at", { ascending: false }),
      supabase.from("price_list").select("*").eq("active", true).order("category").order("name"),
    ]);
    setConsultations(c || []);
    setInvoices(inv || []);
    setPriceList(prices || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const invoicedConsultIds = new Set(invoices.map((inv) => inv.consultation_id));
  const awaitingBilling = consultations.filter((c) => !invoicedConsultIds.has(c.id));

  function startBilling(c) {
    setBilling(c);
    const initialLines = [
      { key: "consult", label: "Consultation fee", priceItemId: "", quantity: 1, amount: 0 },
      ...c.prescriptions.map((p, idx) => ({ key: `rx-${idx}`, label: p.drug, priceItemId: "", quantity: 1, amount: 0 })),
    ];
    setLines(initialLines);
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

    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        patient_id: billing.patient_id,
        consultation_id: billing.id,
        total,
        created_by: staff.id,
      })
      .select()
      .single();

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

  async function markPaid(id) {
    await supabase.from("invoices").update({ status: "Paid" }).eq("id", id);
    loadData();
  }

  return (
    <div>
      <Header staff={staff} onLogout={onLogout} />
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
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

            {billing && (
              <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 14px" }}>
                  Invoice for {billing.patients?.name}
                </h3>
                <form onSubmit={createInvoice}>
                  {lines.map((l) => (
                    <div key={l.key} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr", gap: 10, alignItems: "end", padding: "8px 0", borderBottom: "1px solid #EEF1F2" }}>
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
                    {inv.status === "Unpaid" ? (
                      <button className="wl-btn" onClick={() => markPaid(inv.id)} style={{ background: "#2F7D4F", color: "#fff" }}>Mark paid</button>
                    ) : (
                      <span className="wl-badge" style={{ background: "#2F7D4F1A", color: "#2F7D4F" }}>Paid</span>
                    )}
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

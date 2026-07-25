import { useEffect, useState } from "react";
import { Users, UserPlus, Wallet, AlertCircle, BedDouble, Stethoscope, Printer } from "lucide-react";
import { supabase } from "../supabaseClient";

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function ReportsPanel() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const weekAgo = daysAgoISO(7);

      const [
        { count: totalPatients },
        { count: newPatients },
        { data: invoices },
        { count: admittedNow },
        { count: consultsThisWeek },
      ] = await Promise.all([
        supabase.from("patients").select("*", { count: "exact", head: true }),
        supabase.from("patients").select("*", { count: "exact", head: true }).gte("registered_at", weekAgo),
        supabase.from("invoices").select("total, status, created_at"),
        supabase.from("admissions").select("*", { count: "exact", head: true }).eq("status", "Admitted"),
        supabase.from("consultations").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
      ]);

      const paidInvoices = (invoices || []).filter((i) => i.status === "Paid");
      const unpaidInvoices = (invoices || []).filter((i) => i.status === "Unpaid");
      const totalRevenue = paidInvoices.reduce((sum, i) => sum + Number(i.total), 0);
      const revenueThisWeek = paidInvoices.filter((i) => i.created_at >= weekAgo).reduce((sum, i) => sum + Number(i.total), 0);
      const outstanding = unpaidInvoices.reduce((sum, i) => sum + Number(i.total), 0);

      setStats({
        totalPatients: totalPatients || 0,
        newPatients: newPatients || 0,
        totalRevenue,
        revenueThisWeek,
        outstanding,
        outstandingCount: unpaidInvoices.length,
        admittedNow: admittedNow || 0,
        consultsThisWeek: consultsThisWeek || 0,
      });
      setLoading(false);
    })();
  }, []);

  function printReport() {
    if (!stats) return;
    const today = new Date().toISOString().slice(0, 10);
    const html = `
      <!doctype html><html><head><meta charset="utf-8" /><title>Palani Medical Clinic — Report ${today}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #1E2A30; padding: 40px; max-width: 640px; margin: 0 auto; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .sub { color: #5B6B72; font-size: 13px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; border-bottom: 2px solid #1E2A30; padding: 8px 4px; font-size: 12px; }
        td { border-bottom: 1px solid #DCE3E6; padding: 10px 4px; }
        .footer { margin-top: 32px; font-size: 11px; color: #7C8A90; text-align: center; }
      </style></head>
      <body>
        <h1>Palani Medical Clinic</h1>
        <div class="sub">Operations report · Generated ${today}</div>
        <table>
          <thead><tr><th>Metric</th><th style="text-align:right">Value</th></tr></thead>
          <tbody>
            <tr><td>Total patients</td><td style="text-align:right">${stats.totalPatients} (${stats.newPatients} new this week)</td></tr>
            <tr><td>Consultations this week</td><td style="text-align:right">${stats.consultsThisWeek}</td></tr>
            <tr><td>Currently admitted</td><td style="text-align:right">${stats.admittedNow}</td></tr>
            <tr><td>Total revenue (paid)</td><td style="text-align:right">KES ${stats.totalRevenue.toLocaleString()}</td></tr>
            <tr><td>Revenue this week</td><td style="text-align:right">KES ${stats.revenueThisWeek.toLocaleString()}</td></tr>
            <tr><td>Outstanding (unpaid)</td><td style="text-align:right">KES ${stats.outstanding.toLocaleString()} (${stats.outstandingCount} invoice${stats.outstandingCount === 1 ? "" : "s"})</td></tr>
          </tbody>
        </table>
        <div class="footer">Palani Medical Clinic — internal operations report.</div>
      </body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading reports…</div>;
  }

  const cards = [
    { label: "Total patients", value: stats.totalPatients, sub: `${stats.newPatients} new this week`, icon: Users, color: "#7C5CBF" },
    { label: "Consultations this week", value: stats.consultsThisWeek, sub: "across all doctors", icon: Stethoscope, color: "#2F7D4F" },
    { label: "Currently admitted", value: stats.admittedNow, sub: "patients on the ward", icon: BedDouble, color: "#A13D3D" },
    { label: "Revenue (paid)", value: `KES ${stats.totalRevenue.toLocaleString()}`, sub: `KES ${stats.revenueThisWeek.toLocaleString()} this week`, icon: Wallet, color: "#2B6777" },
    { label: "Outstanding", value: `KES ${stats.outstanding.toLocaleString()}`, sub: `${stats.outstandingCount} unpaid invoice${stats.outstandingCount === 1 ? "" : "s"}`, icon: AlertCircle, color: "#C77D2E" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button className="wl-btn" onClick={printReport} style={{ background: "#F5F7F8", color: "#5B6B72", display: "flex", alignItems: "center", gap: 6 }}>
          <Printer size={14} /> Print report
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="wl-card" style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: c.color + "1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={15} color={c.color} />
                </div>
                <span style={{ fontSize: 12, color: "#5B6B72", fontWeight: 600 }}>{c.label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "Space Grotesk, sans-serif" }}>{c.value}</div>
              <div style={{ fontSize: 11, color: "#7C8A90", marginTop: 2 }}>{c.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

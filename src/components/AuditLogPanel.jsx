import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const ACTION_COLORS = {
  UPDATE: { bg: "#3D6FB41A", color: "#3D6FB4" },
  DELETE: { bg: "#A13D3D1A", color: "#A13D3D" },
};

export default function AuditLogPanel() {
  const [logs, setLogs] = useState([]);
  const [staffNames, setStaffNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: logData } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
      setLogs(logData || []);

      const { data: staffData } = await supabase.from("staff").select("id, name");
      const nameMap = {};
      (staffData || []).forEach((s) => (nameMap[s.id] = s.name));
      setStaffNames(nameMap);
      setLoading(false);
    })();
  }, []);

  const tables = ["all", ...new Set(logs.map((l) => l.table_name))];
  const filtered = tableFilter === "all" ? logs : logs.filter((l) => l.table_name === tableFilter);

  function fieldDiff(log) {
    if (log.action !== "UPDATE" || !log.old_data || !log.new_data) return [];
    const changed = [];
    for (const key of Object.keys(log.new_data)) {
      if (JSON.stringify(log.old_data[key]) !== JSON.stringify(log.new_data[key])) {
        changed.push({ field: key, from: log.old_data[key], to: log.new_data[key] });
      }
    }
    return changed;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: "#5B6B72" }}>Filter by table:</label>
        <select className="wl-input" value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} style={{ width: 200 }}>
          {tables.map((t) => (
            <option key={t} value={t}>{t === "all" ? "All tables" : t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading audit log…</div>
      ) : filtered.length === 0 ? (
        <div className="wl-card" style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>No changes recorded yet.</div>
      ) : (
        <div className="wl-card" style={{ overflow: "hidden" }}>
          {filtered.map((log, i) => {
            const colors = ACTION_COLORS[log.action] || { bg: "#F5F7F8", color: "#5B6B72" };
            const diff = fieldDiff(log);
            const isOpen = expandedId === log.id;
            return (
              <div key={log.id} className="wl-row" style={{ borderBottom: i < filtered.length - 1 ? "1px solid #EEF1F2" : "none" }}>
                <div
                  onClick={() => setExpandedId(isOpen ? null : log.id)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="wl-badge" style={{ background: colors.bg, color: colors.color }}>{log.action}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{log.table_name}</span>
                    <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#7C8A90" }}>{log.record_id?.slice(0, 8)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "#5B6B72" }}>{staffNames[log.staff_id] || "Unknown"}</span>
                    <span style={{ fontSize: 11, color: "#7C8A90" }}>{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                </div>
                {isOpen && (
                  <div className="wl-fade-in" style={{ padding: "0 18px 14px", fontSize: 12, color: "#5B6B72" }}>
                    {log.action === "DELETE" ? (
                      <pre style={{ background: "#F5F7F8", borderRadius: 8, padding: 10, overflowX: "auto", margin: 0 }}>{JSON.stringify(log.old_data, null, 2)}</pre>
                    ) : diff.length === 0 ? (
                      <span>No field-level changes detected.</span>
                    ) : (
                      diff.map((d) => (
                        <div key={d.field} style={{ marginBottom: 4 }}>
                          <strong>{d.field}</strong>: <span style={{ color: "#A13D3D" }}>{JSON.stringify(d.from)}</span> → <span style={{ color: "#2F7D4F" }}>{JSON.stringify(d.to)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

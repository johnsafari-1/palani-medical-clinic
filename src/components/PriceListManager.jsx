import { useEffect, useState } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { supabase } from "../supabaseClient";

const CATEGORIES = ["Consultation", "Medication", "Lab Test", "Procedure", "Other"];

export default function PriceListManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", category: "Medication", unit: "", price: "" });
  const [formError, setFormError] = useState("");

  async function loadItems() {
    setLoading(true);
    const { data, error } = await supabase.from("price_list").select("*").order("category").order("name");
    if (!error) setItems(data);
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function addItem(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.unit.trim() || form.price === "") {
      setFormError("Fill in name, unit, and price.");
      return;
    }
    const { error } = await supabase.from("price_list").insert({
      name: form.name.trim(),
      category: form.category,
      unit: form.unit.trim(),
      price: parseFloat(form.price) || 0,
    });
    if (error) {
      setFormError(error.message);
      return;
    }
    setForm({ name: "", category: "Medication", unit: "", price: "" });
    setFormError("");
    loadItems();
  }

  async function toggleActive(item) {
    await supabase.from("price_list").update({ active: !item.active }).eq("id", item.id);
    loadItems();
  }

  async function removeItem(id) {
    await supabase.from("price_list").delete().eq("id", id);
    loadItems();
  }

  const grouped = CATEGORIES.map((cat) => ({ category: cat, items: items.filter((i) => i.category === cat) }));

  return (
    <div>
      <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 15, margin: "0 0 14px" }}>Add price list item</h3>
        <form onSubmit={addItem} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr 0.8fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Name</label>
            <input className="wl-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ibuprofen 400mg" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Category</label>
            <select className="wl-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Unit</label>
            <input className="wl-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="tablet, test, visit" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Price (KES)</label>
            <input className="wl-input" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0" />
          </div>
          <button className="wl-btn" type="submit" style={{ background: "#2B6777", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> Add
          </button>
        </form>
        {formError && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#A13D3D", fontSize: 12, marginTop: 10 }}>
            <AlertCircle size={14} /> {formError}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "#7C8A90", fontSize: 13 }}>Loading price list…</div>
      ) : (
        grouped.map(({ category, items }) => (
          <div key={category} style={{ marginBottom: 20 }}>
            <h4 style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 13, color: "#5B6B72", margin: "0 0 8px" }}>
              {category} <span style={{ fontWeight: 500, color: "#7C8A90" }}>({items.length})</span>
            </h4>
            <div style={{ background: "#fff", border: "1px solid #DCE3E6", borderRadius: 12, overflow: "hidden" }}>
              {items.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", color: "#7C8A90", fontSize: 12 }}>No items in this category yet.</div>
              ) : (
                items.map((item, i) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: i < items.length - 1 ? "1px solid #EEF1F2" : "none", opacity: item.active ? 1 : 0.5 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: "#7C8A90" }}>KES {Number(item.price).toLocaleString()} per {item.unit}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button className="wl-btn" onClick={() => toggleActive(item)} style={{ background: "#F5F7F8", color: "#5B6B72", fontSize: 12, padding: "6px 10px" }}>
                        {item.active ? "Deactivate" : "Activate"}
                      </button>
                      <button className="wl-btn icon-btn danger" onClick={() => removeItem(item.id)} style={{ color: "#A13D3D" }} aria-label="Delete item" title="Delete this price list item">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

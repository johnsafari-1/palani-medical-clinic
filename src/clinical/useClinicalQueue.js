import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

export function useClinicalQueue(table, columns, order) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase.from(table).select(columns).order(order, { ascending: false });
      if (request !== generation.current) return;
      if (queryError || !Array.isArray(data)) throw new Error("Queue unavailable");
      setRows(data);
    } catch {
      if (request === generation.current) setError("Queue could not be refreshed. Previously loaded records are shown for reference; actions are disabled until retry succeeds.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [table, columns, order]);
  useEffect(() => {
    reload();
    return () => { generation.current += 1; };
  }, [reload]);
  return { rows, setRows, loading, error, reload };
}

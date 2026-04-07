import { useState, useEffect, useCallback } from "react";

export function useMapleData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch("/api/maple")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json) => { setData(json); setLoading(false); setError(null); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}

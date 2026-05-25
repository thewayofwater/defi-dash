import { useCallback, useEffect, useState } from "react";

export function useUsdaiData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(async (isRefresh) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const r = await fetch("/api/usdai", { cache: "no-store" });
      if (!r.ok) throw new Error(`/api/usdai ${r.status}`);
      const j = await r.json();
      setData(j);
      setLastUpdated(new Date());
      setRefreshKey(k => k + 1);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(false); }, [fetchData]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, refreshing, error, lastUpdated, refreshKey, refresh };
}

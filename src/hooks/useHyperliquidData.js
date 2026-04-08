import { useState, useEffect, useCallback } from "react";

export function useHyperliquidData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    fetch("/api/hyperliquid")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json) => {
        setData(json);
        setError(null);
        setLastUpdated(new Date());
        setRefreshKey((k) => k + 1);
      })
      .catch((e) => { setError(e.message); })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, refreshing, refreshKey, error, lastUpdated, refresh: () => fetchData(true) };
}

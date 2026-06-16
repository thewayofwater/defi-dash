import { useState, useEffect, useCallback } from "react";

const URL = "/api/wbtc?view=pools";

export function useWbtcPoolsData() {
  const [data, setData] = useState({ pools: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback((isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    fetch(URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        setData({ pools: json.pools || [], summary: json.summary || null });
        setLastUpdated(new Date());
        setLoading(false);
        setRefreshing(false);
        setRefreshKey((k) => k + 1);
        setError(null);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { ...data, loading, refreshing, refreshKey, error, lastUpdated, refresh: () => fetchData(false) };
}

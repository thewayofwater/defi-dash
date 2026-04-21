import { useState, useEffect, useCallback } from "react";

const GOV_URL = "/api/governance";

export function useGovernanceData() {
  const [data, setData] = useState({ protocols: [], modelAverages: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback((isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    fetch(GOV_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        setData(json);
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
    const interval = setInterval(() => fetchData(false), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    ...data,
    loading,
    refreshing,
    refreshKey,
    error,
    lastUpdated,
    refresh: () => fetchData(false),
  };
}

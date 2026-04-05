import { useState, useEffect, useCallback } from "react";

const YIELDS_URL = "/api/yields";

export function useYieldComparison() {
  const [pools, setPools] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback((isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    fetch(YIELDS_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        setPools(json.pools || []);
        setAssets(json.assets || []);
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
    const interval = setInterval(() => fetchData(false), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { pools, assets, loading, refreshing, refreshKey, error, lastUpdated, refresh: () => fetchData(false) };
}

export function useYieldChart(poolId) {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!poolId) { setPoints([]); return; }
    setLoading(true);
    fetch(`${YIELDS_URL}?chart=${poolId}`)
      .then((r) => r.json())
      .then((json) => {
        setPoints(json.points || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [poolId]);

  return { points, loading };
}

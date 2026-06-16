import { useState, useEffect, useCallback } from "react";

// `days` must be one of: 30, 90, 365, or "all". "all" is served by passing a large
// number to the endpoint (GT caps at 1000 days which is ~2.7y — plenty for WBTC/cbBTC
// history since cbBTC only launched Q4 2024).

export function useWbtcPegData(days = 90) {
  const [data, setData] = useState({ pools: [], history: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const daysParam = days === "all" ? 1000 : days;
  const url = `/api/wbtc?view=peg&days=${daysParam}`;

  const fetchData = useCallback(
    (isInitial = false) => {
      if (isInitial) setLoading(true);
      else setRefreshing(true);
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((json) => {
          const history = json.history || [];
          // If the new response is empty (e.g., upstream rate-limited), preserve
          // the previously-fetched data rather than clearing the chart.
          if (history.length === 0) {
            setError("upstream rate limited — showing previous data");
            setLoading(false);
            setRefreshing(false);
            return;
          }
          setData({
            pools: json.pools || [],
            history,
            summary: json.summary || null,
          });
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
    },
    [url]
  );

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { ...data, loading, refreshing, refreshKey, error, lastUpdated, refresh: () => fetchData(false) };
}

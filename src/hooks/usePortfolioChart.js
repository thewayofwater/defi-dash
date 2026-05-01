import { useState, useEffect, useMemo, useRef } from "react";

const YIELDS_URL = "/api/yields";

/**
 * Fetches historical APY data for multiple pools and computes
 * a weighted average timeseries based on portfolio allocations.
 *
 * @param {Array<{poolId: string, weight: number}>} entries
 * @param {Object} poolMap optional poolId → pool record lookup. Used to extract
 *                        chainId for Morpho-market history fetches (markets need
 *                        chainId to disambiguate the same uniqueKey across chains).
 * @returns {{ data: Array<{date, weightedApy, cumulativeYield}>, loading: boolean }}
 */
export function usePortfolioChart(entries, poolMap = {}) {
  const [perPool, setPerPool] = useState({});
  const [loading, setLoading] = useState(false);
  const prevKey = useRef("");

  // Only re-fetch when the set of poolIds changes
  const poolIds = useMemo(() => entries.map((e) => e.poolId).sort(), [entries]);
  const key = poolIds.join(",");

  useEffect(() => {
    if (!poolIds.length) {
      setPerPool({});
      return;
    }
    if (key === prevKey.current) return;
    prevKey.current = key;

    // Morpho market IDs are 0x-prefixed 64-char hex hashes; they need a chainId
    // appended to the chart query so the API can route to Morpho's GraphQL.
    const isMorphoMarket = (id) => /^0x[0-9a-f]{64}$/i.test(id);

    setLoading(true);
    Promise.all(
      poolIds.map((id) => {
        let url = `${YIELDS_URL}?chart=${id}`;
        if (isMorphoMarket(id)) {
          const chainId = poolMap[id]?.chainId || 1;
          url += `&chainId=${chainId}`;
        }
        return fetch(url)
          .then((r) => r.json())
          .then((json) => ({ id, points: json.points || [] }))
          .catch(() => ({ id, points: [] }));
      })
    ).then((results) => {
      const map = {};
      results.forEach(({ id, points }) => {
        map[id] = points;
      });
      setPerPool(map);
      setLoading(false);
    });
  }, [key, poolIds, poolMap]);

  const data = useMemo(() => {
    if (!entries.length || !Object.keys(perPool).length) return [];

    // Build weight lookup
    const weightMap = {};
    entries.forEach((e) => {
      weightMap[e.poolId] = e.weight;
    });

    // Collect all dates with data across all pools
    const dateMap = {};
    for (const [poolId, points] of Object.entries(perPool)) {
      if (!weightMap[poolId]) continue;
      for (const pt of points) {
        if (!dateMap[pt.date]) dateMap[pt.date] = {};
        dateMap[pt.date][poolId] = pt.apy;
      }
    }

    // Sort by date, take last 90 days
    const sortedDates = Object.keys(dateMap).sort().slice(-90);

    let cumulative = 0;
    return sortedDates.map((date) => {
      const apys = dateMap[date];
      let totalWeight = 0;
      let weightedSum = 0;
      for (const [poolId, w] of Object.entries(weightMap)) {
        if (apys[poolId] != null) {
          weightedSum += apys[poolId] * w;
          totalWeight += w;
        }
      }
      const weightedApy = totalWeight > 0 ? weightedSum / totalWeight : 0;
      // Daily compounding
      cumulative += weightedApy / 365;
      return { date, weightedApy, cumulativeYield: cumulative };
    });
  }, [entries, perPool]);

  return { data, loading, perPool };
}

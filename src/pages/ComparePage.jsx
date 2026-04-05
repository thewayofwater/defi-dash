import React, { useState, useMemo, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { useYieldComparison, useYieldChart } from "../hooks/useYieldComparison";
import { fmt, fmtPct } from "../utils/format";
import { SectionHeader, LoadingSpinner, ModuleCard, StatCard, ChartShimmer } from "../components/Shared";
import { CATEGORY_COLORS } from "../utils/constants";

const mono = "'JetBrains Mono', monospace";

const ASSET_TABS = ["ETH", "BTC", "USD", "SOL", "HYPE", "EUR"];

const ASSET_COLORS = {
  ETH: "#627eea",
  BTC: "#f7931a",
  USD: "#26a17b",
  SOL: "#9945ff",
  HYPE: "#50E3C2",
  EUR: "#1a4fc4",
};

const CHAIN_COLORS = {
  Ethereum: "#627eea", Base: "#2563eb", Arbitrum: "#28a0f0",
  Optimism: "#ff0420", Polygon: "#8247e5", HyperEVM: "#22d3ee",
  Unichain: "#f472b6", Monad: "#a855f7", Katana: "#fb923c",
  "BNB Chain": "#f0b90b", BSC: "#f0b90b", Sonic: "#60a5fa",
  Mantle: "#fb923c", Berachain: "#b45309", Plasma: "#8b5cf6",
  Linea: "#60a5fa", Scroll: "#fbbf24", Gnosis: "#04795b",
  Celo: "#35d07f", Avalanche: "#e84142", Fraxtal: "#818cf8",
  MegaETH: "#22d3ee",
};
function getChainColor(name) { return CHAIN_COLORS[name] || "#6b7a8d"; }

const TAB_STYLE = (active, color) => ({
  background: active ? `${color}18` : "rgba(255,255,255,0.025)",
  border: active ? `1px solid ${color}50` : "1px solid rgba(255,255,255,0.05)",
  borderRadius: 5,
  padding: "7px 16px",
  fontSize: 10,
  fontFamily: mono,
  color: active ? color : "#6b7a8d",
  cursor: "pointer",
  letterSpacing: 0.5,
  fontWeight: active ? 600 : 400,
});

const FILTER_STYLE = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 4,
  padding: "5px 8px",
  fontSize: 12,
  fontFamily: mono,
  color: "#cbd5e1",
  outline: "none",
  minWidth: 80,
};

const TH = { padding: "8px 8px", textAlign: "left", fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 };
const TD = { padding: "8px 8px", fontSize: 13, fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.03)" };
const TD_NUM = { ...TD, textAlign: "right" };
const TD_APY = { ...TD_NUM, color: "#22d3ee" };
const TD_DIM = { ...TD, color: "#94a3b8" };

const chartTooltipStyle = {
  contentStyle: { background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, fontSize: 11, fontFamily: mono },
  itemStyle: { color: "#e2e8f0", fontSize: 11, fontFamily: mono },
  labelStyle: { color: "#94a3b8", fontSize: 10, fontFamily: mono, marginBottom: 4 },
  cursor: { stroke: "rgba(255,255,255,0.1)" },
};

/* ── Pagination (Morpho style) ── */
const PAGE_SIZE = 20;
function Pagination({ page, totalPages, total, onPageChange }) {
  if (total <= PAGE_SIZE) return null;
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "10px 0", fontSize: 10, fontFamily: mono, color: "#6b7a8d" }}>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 4, padding: "4px 10px", fontSize: 10, fontFamily: mono,
          color: page === 0 ? "#2d3a4a" : "#94a3b8",
          cursor: page === 0 ? "default" : "pointer",
        }}
      >← Prev</button>
      <span>{start}–{end} of {total} pools</span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages - 1}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 4, padding: "4px 10px", fontSize: 10, fontFamily: mono,
          color: page >= totalPages - 1 ? "#2d3a4a" : "#94a3b8",
          cursor: page >= totalPages - 1 ? "default" : "pointer",
        }}
      >Next →</button>
    </div>
  );
}

/* ── Yield History Chart ── */
function YieldHistoryPanel({ selectedPools, allPools, onClear }) {
  // Show up to 5 selected pools' history
  const poolIds = selectedPools.slice(0, 5);
  const [chartMode, setChartMode] = useState("apy"); // "apy" | "cumulative"
  const poolMap = useMemo(() => {
    const m = {};
    allPools.forEach((p) => { m[p.id] = p; });
    return m;
  }, [allPools]);

  if (poolIds.length === 0) {
    return (
      <div style={{ color: "#4a5568", fontSize: 12, fontFamily: mono, textAlign: "center", padding: 40 }}>
        Select pools from the table below to compare yield history
      </div>
    );
  }

  const toggleStyle = (active) => ({
    padding: "3px 10px",
    fontSize: 10,
    fontFamily: mono,
    fontWeight: active ? 600 : 400,
    color: active ? "#e2e8f0" : "#4a5568",
    background: active ? "rgba(255,255,255,0.08)" : "transparent",
    border: active ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.04)",
    borderRadius: 4,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {poolIds.map((id) => {
            const pool = poolMap[id];
            if (!pool) return null;
            const color = CATEGORY_COLORS[pool.category] || "#94a3b8";
            return (
              <span key={id} style={{ fontSize: 10, fontFamily: mono, color, background: `${color}15`, padding: "2px 8px", borderRadius: 3 }}>
                {pool.project} — {pool.symbol} ({pool.chain})
              </span>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={toggleStyle(chartMode === "apy")} onClick={() => setChartMode("apy")}>APY</button>
          <button style={toggleStyle(chartMode === "cumulative")} onClick={() => setChartMode("cumulative")}>Cumulative</button>
          <button style={{ ...toggleStyle(false), color: "#f87171" }} onClick={onClear}>Clear</button>
        </div>
      </div>
      <YieldChartMulti poolIds={poolIds} poolMap={poolMap} mode={chartMode} />
    </div>
  );
}

function YieldChartMulti({ poolIds, poolMap, mode }) {
  const [chartData, setChartData] = useState({});
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (poolIds.length === 0) return;
    setLoading(true);
    Promise.all(
      poolIds.map((id) =>
        fetch(`/api/yields?chart=${id}`)
          .then((r) => r.json())
          .then((json) => ({ id, points: json.points || [] }))
          .catch(() => ({ id, points: [] }))
      )
    ).then((results) => {
      const d = {};
      results.forEach((r) => { d[r.id] = r.points; });
      setChartData(d);
      setLoading(false);
    });
  }, [poolIds.join(",")]);

  // Merge into a single timeline, starting from the latest common date across all pools
  const recent = useMemo(() => {
    const dateMap = {};
    poolIds.forEach((id) => {
      (chartData[id] || []).forEach((pt) => {
        if (!dateMap[pt.date]) dateMap[pt.date] = { date: pt.date };
        dateMap[pt.date][id] = pt.apy;
      });
    });
    const merged = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
    // Find the latest start date where all pools have data
    const startDates = poolIds.map((id) => {
      const pts = (chartData[id] || []);
      return pts.length > 0 ? pts[0].date : null;
    }).filter(Boolean);
    const commonStart = startDates.length > 0 ? startDates.sort().pop() : null;
    const filtered = commonStart ? merged.filter((row) => row.date >= commonStart) : merged;
    return filtered.slice(-90);
  }, [chartData, poolIds]);

  // Cumulative mode: compound daily APY into cumulative yield starting from 0
  const displayData = useMemo(() => {
    if (mode !== "cumulative") return recent;
    const cumulative = {};
    poolIds.forEach((id) => { cumulative[id] = 0; });
    // Start with a zero point on the first date
    const zeroPoint = { date: recent[0]?.date };
    poolIds.forEach((id) => { zeroPoint[id] = 0; });
    const points = recent.map((row) => {
      const pt = { date: row.date };
      poolIds.forEach((id) => {
        const dailyApy = row[id];
        if (dailyApy != null) {
          cumulative[id] += dailyApy / 365;
        }
        pt[id] = cumulative[id] || null;
      });
      return pt;
    });
    // Replace the first point with zeros so all lines start at 0%
    points[0] = zeroPoint;
    return points;
  }, [recent, poolIds, mode]);

  const isCumulative = mode === "cumulative";

  if (loading) return <ChartShimmer height={250} />;

  if (recent.length === 0) {
    return <div style={{ color: "#4a5568", fontSize: 11, fontFamily: mono, textAlign: "center", padding: 30 }}>No history available</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={displayData}>
        <XAxis dataKey="date" tick={{ fill: "#4a5568", fontSize: 10, fontFamily: mono }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} minTickGap={40} />
        <YAxis tick={{ fill: "#4a5568", fontSize: 10, fontFamily: mono }} tickFormatter={(v) => `${v.toFixed(isCumulative ? 2 : 1)}%`} axisLine={false} tickLine={false} width={50} />
        <Tooltip
          {...chartTooltipStyle}
          labelFormatter={(v) => v}
          formatter={(v, name) => [`${v.toFixed(isCumulative ? 3 : 2)}%`, name]}
        />
        {poolIds.map((id) => {
          const pool = poolMap[id];
          const color = pool ? (CATEGORY_COLORS[pool.category] || "#94a3b8") : "#94a3b8";
          return (
            <Line key={id} dataKey={id} stroke={color} dot={false} strokeWidth={1.5} name={pool ? `${pool.project} ${pool.symbol}` : id} connectNulls />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

// Get the primary category for a protocol (most common across its pools)
function primaryCategory(pools, project) {
  const cats = pools.filter((p) => p.project === project && p.category).map((p) => p.category);
  if (!cats.length) return null;
  const counts = {};
  cats.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/* ── APY by Protocol Bar Chart ── */
function ApyByProtocol({ pools }) {
  const data = useMemo(() => {
    const byProject = {};
    pools.forEach((p) => {
      if (!byProject[p.project]) byProject[p.project] = { apys: [], tvls: [] };
      byProject[p.project].apys.push(p.apy);
      byProject[p.project].tvls.push(p.tvlUsd);
    });
    return Object.entries(byProject)
      .map(([project, { apys, tvls }]) => {
        const totalTvl = tvls.reduce((a, b) => a + b, 0);
        const weightedApy = totalTvl > 0
          ? apys.reduce((sum, apy, i) => sum + apy * tvls[i], 0) / totalTvl
          : apys.reduce((a, b) => a + b, 0) / apys.length;
        const cat = primaryCategory(pools, project);
        return { project, apy: weightedApy, tvl: totalTvl, pools: apys.length, category: cat };
      })
      .sort((a, b) => b.apy - a.apy);
  }, [pools]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <XAxis type="number" tick={{ fill: "#4a5568", fontSize: 10, fontFamily: mono }} tickFormatter={(v) => `${v.toFixed(1)}%`} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="project" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} width={85} />
        <Tooltip
          {...chartTooltipStyle}
          formatter={(v, name, props) => [`${v.toFixed(2)}%`, "Avg APY"]}
          labelFormatter={(label) => {
            const item = data.find((d) => d.project === label);
            return item ? `${label} (${item.pools} pools · ${fmt(item.tvl)})` : label;
          }}
        />
        <Bar dataKey="apy" radius={[0, 3, 3, 0]} maxBarSize={22}>
          {data.map((d) => (
            <Cell key={d.project} fill={CATEGORY_COLORS[d.category] || "#64748b"} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── TVL by Protocol Donut (via bar chart) ── */
function TvlByProtocol({ pools }) {
  const data = useMemo(() => {
    const byProject = {};
    pools.forEach((p) => {
      if (!byProject[p.project]) byProject[p.project] = { tvl: 0 };
      byProject[p.project].tvl += p.tvlUsd;
    });
    return Object.entries(byProject)
      .map(([project, { tvl }]) => {
        const cat = primaryCategory(pools, project);
        return { project, tvl, category: cat };
      })
      .sort((a, b) => b.tvl - a.tvl);
  }, [pools]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <XAxis type="number" tick={{ fill: "#4a5568", fontSize: 10, fontFamily: mono }} tickFormatter={(v) => `${fmt(v)}`} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="project" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} width={85} />
        <Tooltip
          {...chartTooltipStyle}
          formatter={(v) => [`${fmt(v)}`, "TVL"]}
        />
        <Bar dataKey="tvl" radius={[0, 3, 3, 0]} maxBarSize={22}>
          {data.map((d) => (
            <Cell key={d.project} fill={CATEGORY_COLORS[d.category] || "#64748b"} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Risk/Return Scatter ── */
function RiskReturnScatter({ pools }) {
  // Uniform spacing: one tick per order of magnitude
  const TVL_TICKS = [1e6, 1e7, 1e8, 1e9, 1e10];

  const data = useMemo(() => {
    return pools
      .filter((p) => p.apy > 0 && p.apy <= 100 && p.tvlUsd > 0)
      .map((p) => ({
        ...p,
        apyDisplay: p.apy,
      }));
  }, [pools]);

  // Bubble size: log scale for clear differentiation across all TVL ranges
  const bubbleSize = (tvl) => {
    const minR = 30, maxR = 500;
    const minLog = Math.log10(1e6), maxLog = Math.log10(5e10);
    const t = (Math.log10(tvl) - minLog) / (maxLog - minLog);
    return minR + Math.min(Math.max(t, 0), 1) * (maxR - minR);
  };

  const scatterData = useMemo(() => data.map((d) => ({ ...d, bubbleSize: bubbleSize(d.tvlUsd) })), [data]);

  // Dynamic upper bound: 1.5x the max TVL for tight but non-overlapping padding
  const maxTvl = useMemo(() => {
    if (!data.length) return 1e10;
    const max = Math.max(...data.map((d) => d.tvlUsd));
    return max * 1.5;
  }, [data]);

  // Linear regression on log(TVL) vs APY for trend line
  const trendLine = useMemo(() => {
    if (data.length < 2) return [];
    const points = data.map((d) => ({ x: Math.log10(d.tvlUsd), y: d.apyDisplay }));
    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const minLog = Math.log10(1e6), maxLog = Math.log10(maxTvl);
    const steps = 20;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const logTvl = minLog + (maxLog - minLog) * (i / steps);
      return { tvlUsd: Math.pow(10, logTvl), apyDisplay: Math.max(slope * logTvl + intercept, 0), bubbleSize: 0 };
    });
  }, [data, maxTvl]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ left: 10, right: 20, bottom: 10 }}>
        <XAxis
          dataKey="tvlUsd"
          type="number"
          scale="log"
          domain={[1e6, maxTvl]}
          ticks={TVL_TICKS}
          reversed
          tick={{ fill: "#4a5568", fontSize: 10, fontFamily: mono }}
          tickFormatter={(v) => `${fmt(v)}`}
          axisLine={false}
          tickLine={false}
          name="TVL"
        />
        <YAxis
          dataKey="apyDisplay"
          type="number"
          tick={{ fill: "#4a5568", fontSize: 10, fontFamily: mono }}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          axisLine={false}
          tickLine={false}
          width={40}
          name="APY"
        />
        <ZAxis dataKey="bubbleSize" range={[30, 400]} />
        <Tooltip
          {...chartTooltipStyle}
          content={({ payload }) => {
            if (!payload || !payload.length) return null;
            const d = payload[0].payload;
            return (
              <div style={{ background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, padding: "8px 12px" }}>
                <div style={{ fontSize: 11, fontFamily: mono, color: "#e2e8f0", fontWeight: 600 }}>{d.symbol}</div>
                <div style={{ fontSize: 10, fontFamily: mono, color: "#94a3b8" }}>{d.project} · {d.chain}</div>
                <div style={{ fontSize: 10, fontFamily: mono, color: "#22d3ee", marginTop: 4 }}>APY: {d.apy.toFixed(2)}%</div>
                <div style={{ fontSize: 10, fontFamily: mono, color: "#94a3b8" }}>TVL: {fmt(d.tvlUsd)}</div>
              </div>
            );
          }}
        />
        <Scatter data={scatterData} isAnimationActive={false}>
          {scatterData.map((d, i) => (
            <Cell key={i} fill={CATEGORY_COLORS[d.category] || "#64748b"} fillOpacity={0.7} />
          ))}
        </Scatter>
        <Scatter data={trendLine} line={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1.5, strokeDasharray: "6 3" }} shape={() => null} isAnimationActive={false} legendType="none" tooltipType="none" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* ── Main Comparison Table ── */
function ComparisonTable({ pools, selectedPools, onTogglePool }) {
  const [sortKey, setSortKey] = useState("tvlUsd");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [filterChains, setFilterChains] = useState(new Set());
  const [filterProjects, setFilterProjects] = useState(new Set());
  const [filterCategories, setFilterCategories] = useState(new Set());

  const toggleSort = useCallback((key) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(0);
  }, [sortKey]);

  const sortIcon = (key) => sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  const filterOptions = useMemo(() => {
    const chains = [...new Set(pools.map((p) => p.chain))].sort();
    const projects = [...new Set(pools.map((p) => p.project))].sort();
    const categories = [...new Set(pools.map((p) => p.category).filter(Boolean))].sort();
    return { chains, projects, categories };
  }, [pools]);

  const toggleFilter = useCallback((setter, value) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
    setPage(0);
  }, []);

  const filtered = useMemo(() => {
    let arr = pools;
    if (filterChains.size) arr = arr.filter((p) => filterChains.has(p.chain));
    if (filterProjects.size) arr = arr.filter((p) => filterProjects.has(p.project));
    if (filterCategories.size) arr = arr.filter((p) => filterCategories.has(p.category));
    return arr;
  }, [pools, filterChains, filterProjects, filterCategories]);

  const sorted = useMemo(() => {
    const m = sortDir === "desc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return av < bv ? m : av > bv ? -m : 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontFamily: mono, color: "#4a5568", width: 65, flexShrink: 0 }}>Category</span>
          {filterOptions.categories.map((cat) => {
            const active = filterCategories.has(cat);
            const color = CATEGORY_COLORS[cat] || "#94a3b8";
            return (
              <button key={cat} onClick={() => toggleFilter(setFilterCategories, cat)} style={{
                background: active ? `${color}20` : "rgba(255,255,255,0.025)",
                border: active ? `1px solid ${color}50` : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 4, padding: "3px 10px", fontSize: 10, fontFamily: mono,
                color: active ? color : "#6b7a8d", cursor: "pointer",
              }}>{cat}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontFamily: mono, color: "#4a5568", width: 65, flexShrink: 0 }}>Protocol</span>
          {filterOptions.projects.map((proj) => {
            const active = filterProjects.has(proj);
            return (
              <button key={proj} onClick={() => toggleFilter(setFilterProjects, proj)} style={{
                background: active ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.025)",
                border: active ? "1px solid rgba(34,211,238,0.3)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 4, padding: "3px 10px", fontSize: 10, fontFamily: mono,
                color: active ? "#22d3ee" : "#6b7a8d", cursor: "pointer",
              }}>{proj}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontFamily: mono, color: "#4a5568", width: 65, flexShrink: 0 }}>Chain</span>
          {filterOptions.chains.map((chain) => {
            const active = filterChains.has(chain);
            const color = getChainColor(chain);
            return (
              <button key={chain} onClick={() => toggleFilter(setFilterChains, chain)} style={{
                background: active ? `${color}20` : "rgba(255,255,255,0.025)",
                border: active ? `1px solid ${color}50` : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 4, padding: "3px 10px", fontSize: 10, fontFamily: mono,
                color: active ? color : "#6b7a8d", cursor: "pointer",
              }}>{chain}</button>
            );
          })}
          <div style={{ fontSize: 10, fontFamily: mono, color: "#4a5568", marginLeft: "auto" }}>
            {filtered.length} pools
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 30 }}></th>
              <th style={TH}>Asset</th>
              <th style={TH}>Protocol</th>
              <th style={TH}>Category</th>
              <th style={TH}>Chain</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("apy")}>APY{sortIcon("apy")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("apyBase")}>Base{sortIcon("apyBase")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("apyReward")}>Reward{sortIcon("apyReward")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("tvlUsd")}>TVL{sortIcon("tvlUsd")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("apyPct7D")}>7D Chg{sortIcon("apyPct7D")}</th>
              <th style={{ ...TH, textAlign: "right" }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((p) => {
              const isSelected = selectedPools.includes(p.id);
              const catColor = CATEGORY_COLORS[p.category] || "#64748b";
              return (
                <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => onTogglePool(p.id)}>
                  <td style={TD}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 3,
                      border: isSelected ? `2px solid ${catColor}` : "1px solid rgba(255,255,255,0.12)",
                      background: isSelected ? `${catColor}25` : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, color: catColor,
                    }}>
                      {isSelected ? "✓" : ""}
                    </div>
                  </td>
                  <td style={{ ...TD, color: "#cbd5e1", fontWeight: 500 }}>{p.symbol}</td>
                  <td style={TD_DIM}>{p.project}</td>
                  <td style={TD}>
                    {p.category ? (
                      <span style={{
                        color: CATEGORY_COLORS[p.category] || "#94a3b8",
                        background: `${CATEGORY_COLORS[p.category] || "#94a3b8"}15`,
                        border: `1px solid ${CATEGORY_COLORS[p.category] || "#94a3b8"}30`,
                        borderRadius: 4,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontFamily: mono,
                        whiteSpace: "nowrap",
                      }}>{p.category}</span>
                    ) : "—"}
                  </td>
                  <td style={TD_DIM}>{p.chain}</td>
                  <td style={TD_APY}>{p.apy.toFixed(2)}%</td>
                  <td style={TD_NUM}>{p.apyBase > 0 ? `${p.apyBase.toFixed(2)}%` : "—"}</td>
                  <td style={TD_NUM}>{p.apyReward > 0 ? `${p.apyReward.toFixed(2)}%` : "—"}</td>
                  <td style={TD_NUM}>{fmt(p.tvlUsd)}</td>
                  <td style={{ ...TD_NUM, color: p.apyPct7D > 0 ? "#34d399" : p.apyPct7D < 0 ? "#f87171" : "#94a3b8" }}>
                    {p.apyPct7D > 0 ? "+" : ""}{p.apyPct7D.toFixed(2)}%
                  </td>
                  <td style={{ ...TD_NUM, color: "#94a3b8" }}>
                    {p.prediction || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={sorted.length} onPageChange={setPage} />
    </div>
  );
}

/* ── Main Page ── */
export default function ComparePage() {
  const { pools: allPools, assets, loading, refreshing, refreshKey, error, lastUpdated, refresh } = useYieldComparison();
  const [selectedAsset, setSelectedAsset] = useState("ETH");
  const [selectedPools, setSelectedPools] = useState([]);

  const assetPools = useMemo(() => {
    return allPools.filter((p) => p.baseAsset === selectedAsset);
  }, [allPools, selectedAsset]);

  const stats = useMemo(() => {
    if (assetPools.length === 0) return { totalTvl: 0, avgApy: 0, maxApy: 0, protocols: 0 };
    const totalTvl = assetPools.reduce((s, p) => s + p.tvlUsd, 0);
    const weightedApy = totalTvl > 0
      ? assetPools.reduce((s, p) => s + p.apy * p.tvlUsd, 0) / totalTvl
      : 0;
    const maxApy = Math.max(...assetPools.map((p) => p.apy));
    const protocols = new Set(assetPools.map((p) => p.project)).size;
    return { totalTvl, avgApy: weightedApy, maxApy, protocols };
  }, [assetPools]);

  const togglePool = useCallback((id) => {
    setSelectedPools((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 5 ? prev : [...prev, id]
    );
  }, []);

  if (error) {
    return (
      <div style={{ background: "#0a0e17", color: "#f87171", padding: 40, fontFamily: mono, textAlign: "center", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Failed to load data</div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>{error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: "#0a0e17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner message="Loading yield data across protocols..." />
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0e17", color: "#e2e8f0", minHeight: "100vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ padding: "20px 26px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "linear-gradient(180deg, rgba(34,211,238,0.02) 0%, transparent 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
              Yield Comparison
              <span style={{ color: "#22d3ee", marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: mono, verticalAlign: "middle", background: "rgba(34,211,238,0.07)", padding: "2px 7px", borderRadius: 3, letterSpacing: 1 }}>
                CROSS-PROTOCOL
              </span>
            </h1>
            <div style={{ fontSize: 12, color: "#4f5e6f", marginTop: 2, fontFamily: mono }}>
              Compare yields across DeFi protocols
              {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            </div>
          </div>
          <button onClick={refresh} disabled={refreshing} style={{ background: refreshing ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "7px 14px", fontSize: 11, fontFamily: mono, color: refreshing ? "#22d3ee" : "#94a3b8", cursor: refreshing ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", letterSpacing: 0.5 }}>
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none", fontSize: 13 }}>&#x21bb;</span>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Asset tabs */}
        <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
          {ASSET_TABS.map((asset) => {
            const count = allPools.filter((p) => p.baseAsset === asset).length;
            const color = ASSET_COLORS[asset];
            return (
              <button
                key={asset}
                onClick={() => { setSelectedAsset(asset); setSelectedPools([]); }}
                style={TAB_STYLE(asset === selectedAsset, color)}
              >
                {asset} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Hero stats */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard label="Total TVL" value={fmt(stats.totalTvl)} />
          <StatCard label="Avg APY (TVL-weighted)" value={`${stats.avgApy.toFixed(2)}%`} color="#22d3ee" />
          <StatCard label="Best APY" value={`${stats.maxApy.toFixed(2)}%`} color="#34d399" />
          <StatCard label="Protocols" value={stats.protocols} />
        </div>

        {/* Charts row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <ModuleCard>
            <SectionHeader title="Avg APY by Protocol" subtitle="TVL-weighted average yield" />
            {refreshing ? <ChartShimmer height={280} /> : <div key={refreshKey}><ApyByProtocol pools={assetPools} /></div>}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="TVL by Protocol" subtitle="Total value locked" />
            {refreshing ? <ChartShimmer height={280} /> : <div key={refreshKey}><TvlByProtocol pools={assetPools} /></div>}
          </ModuleCard>
        </div>

        {/* Risk/Return scatter */}
        <ModuleCard>
          <SectionHeader title="Risk / Return" subtitle="APY vs TVL — larger bubbles = more liquidity" />
          {refreshing ? <ChartShimmer height={300} /> : <div key={refreshKey}><RiskReturnScatter pools={assetPools} /></div>}
        </ModuleCard>

        {/* Yield history */}
        <ModuleCard>
          <SectionHeader title="Yield History" subtitle="Select up to 5 pools to compare historical APY (90 days)" />
          <YieldHistoryPanel selectedPools={selectedPools} allPools={assetPools} onClear={() => setSelectedPools([])} />
        </ModuleCard>

        {/* Comparison table */}
        <ModuleCard>
          <SectionHeader title={`${selectedAsset} Opportunities`} subtitle="Click rows to add to yield history comparison" />
          {refreshing ? <ChartShimmer height={400} /> : (
            <div key={refreshKey}>
              <ComparisonTable pools={assetPools} selectedPools={selectedPools} onTogglePool={togglePool} />
            </div>
          )}
        </ModuleCard>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "12px 0", fontSize: 10, color: "#3a4a5a", fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.025)" }}>
          Yield Comparison · Live data from DeFiLlama yields API
        </div>
      </div>
    </div>
  );
}

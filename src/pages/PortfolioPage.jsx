import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useYieldComparison } from "../hooks/useYieldComparison";
import { usePortfolioChart } from "../hooks/usePortfolioChart";
import { fmt, fmtPct } from "../utils/format";
import { SectionHeader, LoadingSpinner, ModuleCard, StatCard, ChartShimmer } from "../components/Shared";
import { CATEGORY_COLORS } from "../utils/constants";

const mono = "'JetBrains Mono', monospace";
const ASSET_TABS = ["ETH", "BTC", "USD", "SOL", "HYPE", "EUR"];
const PAGE_SIZE = 15;
const MAX_POOLS = 25;
const LS_KEY = "defi-dash-portfolios";
const AUTOSAVE_NAME = "__autosave__";

function loadSavedPortfolios() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
function writeSavedPortfolios(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}
function encodePortfolioHash(asset, portfolio) {
  if (!portfolio.length) return "";
  const pools = portfolio.map((e) => `${e.poolId}:${e.weight}`).join(",");
  return `#a=${asset}&p=${pools}`;
}
function decodePortfolioHash(hash) {
  if (!hash || !hash.startsWith("#")) return null;
  try {
    const params = new URLSearchParams(hash.slice(1));
    const asset = params.get("a");
    const poolsStr = params.get("p");
    if (!asset || !poolsStr) return null;
    const portfolio = poolsStr.split(",").map((s) => {
      const [poolId, w] = s.split(":");
      return { poolId, weight: Number(w) || 0 };
    }).filter((e) => e.poolId);
    return { asset, portfolio };
  } catch { return null; }
}

const ASSET_COLORS = {
  ETH: "#627eea", BTC: "#f7931a", USD: "#26a17b", SOL: "#9945ff", HYPE: "#50E3C2", EUR: "#1a4fc4",
};

const CHAIN_COLORS = {
  Ethereum: "#627eea", Base: "#2563eb", Arbitrum: "#28a0f0",
  Optimism: "#ff0420", Polygon: "#8247e5", HyperEVM: "#22d3ee",
  Unichain: "#f472b6", Monad: "#a855f7", Katana: "#fb923c",
  BSC: "#f0b90b", Mantle: "#fb923c", Plasma: "#8b5cf6",
  Linea: "#60a5fa", Scroll: "#fbbf24", Avalanche: "#e84142",
  Fraxtal: "#818cf8", Solana: "#9945ff", Celo: "#35d07f",
};
function getChainColor(name) { return CHAIN_COLORS[name] || "#6b7a8d"; }

const PROTOCOL_COLORS = [
  "#22d3ee", "#a78bfa", "#34d399", "#f472b6", "#fbbf24",
  "#60a5fa", "#fb923c", "#c084fc", "#4ade80", "#f87171",
  "#38bdf8", "#e879f9", "#facc15", "#2dd4bf", "#818cf8",
];

const TAB_STYLE = (active, color) => ({
  background: active ? `${color}18` : "rgba(255,255,255,0.025)",
  border: active ? `1px solid ${color}50` : "1px solid rgba(255,255,255,0.05)",
  borderRadius: 5, padding: "7px 16px", fontSize: 10, fontFamily: mono,
  color: active ? color : "#6b7a8d", cursor: "pointer", letterSpacing: 0.5, fontWeight: active ? 600 : 400,
});

const TH = { padding: "8px 8px", textAlign: "left", fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 };
const TD = { padding: "8px 8px", fontSize: 12, fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.03)" };
const TD_NUM = { ...TD, textAlign: "right" };
const TD_APY = { ...TD_NUM, color: "#22d3ee" };
const TD_DIM = { ...TD, color: "#94a3b8" };

const chartTooltipStyle = {
  contentStyle: { background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, fontFamily: mono, fontSize: 11 },
  labelStyle: { color: "#94a3b8", marginBottom: 4 },
  itemStyle: { color: "#e2e8f0" },
};

const PIE_COLORS = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c", "#c084fc", "#4ade80", "#f87171"];

/* ── Exposure Pie Chart ── */
function ExposurePie({ portfolio, poolMap, groupBy, colorMap }) {
  const data = useMemo(() => {
    const byGroup = {};
    portfolio.forEach(({ poolId, weight }) => {
      const pool = poolMap[poolId];
      if (!pool) return;
      const key = pool[groupBy] || "Other";
      byGroup[key] = (byGroup[key] || 0) + weight;
    });
    return Object.entries(byGroup)
      .map(([name, value]) => ({ name, value: +value.toFixed(1) }))
      .sort((a, b) => b.value - a.value);
  }, [portfolio, poolMap, groupBy]);

  if (!data.length) return <div style={{ color: "#4a5568", fontSize: 12, fontFamily: mono, textAlign: "center", padding: 40 }}>No pools selected</div>;

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} strokeWidth={0}>
            {data.map((d, i) => (
              <Cell key={d.name} fill={colorMap?.[d.name] || PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={0.85} />
            ))}
          </Pie>
          <Tooltip {...chartTooltipStyle} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div style={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "6px 10px", fontFamily: mono, fontSize: 11 }}>
                <div style={{ color: "#e2e8f0", marginBottom: 2 }}>{d.name}</div>
                <div style={{ color: "#22d3ee" }}>{d.value}%</div>
              </div>
            );
          }} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 4 }}>
        {data.map((d, i) => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: 1, background: colorMap?.[d.name] || PIE_COLORS[i % PIE_COLORS.length] }} />
            <span style={{ fontSize: 9, fontFamily: mono, color: "#94a3b8" }}>{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Weighted Yield History Chart ── */
// Custom tooltip: shows the day's weighted APY plus a per-pool contribution
// breakdown (weight × APY = pp), sorted descending so the spike-driver is
// always at the top. Top 8 by default; "+N more" footnote if portfolio is
// larger.
function WeightedYieldTooltip({ active, payload, label, poolMap, isCumulative }) {
  if (!active || !payload || !payload.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  const main = isCumulative ? datum.cumulativeYield : datum.weightedApy;
  const mainLabel = isCumulative ? "Cumulative" : "Weighted APY";
  const contributions = datum.contributions || [];
  const symbolFor = (poolId) => {
    const p = poolMap[poolId];
    if (p) return `${p.symbol}${p.project ? ` (${p.project})` : ""}`;
    // Pool isn't in the current catalog (likely filtered out: TVL < $1M, APY
    // out of range, or delisted). The portfolio entry is "stale" — chart
    // history still resolves but the pool's metadata is gone. Surface this
    // clearly so the user can identify and remove it.
    return `Stale pool · ${poolId.slice(0, 8)}…`;
  };
  const hasStale = contributions.some((c) => !poolMap[c.poolId]);
  return (
    <div style={{
      background: "#131926", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 5, padding: "10px 12px", fontFamily: mono, fontSize: 11,
      color: "#e2e8f0", maxWidth: 400, boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: "#94a3b8" }}>{mainLabel}: </span>
        <span style={{ color: "#22d3ee", fontWeight: 600 }}>{main?.toFixed(2)}%</span>
      </div>
      {!isCumulative && contributions.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: "#6b7a8d", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            By contribution
          </div>
          {/* Show all contributions — users want to see what's driving the
              blend, even for 20+ pool portfolios. Tooltip is tall but readable
              and the cursor stays inside the chart hover area while scanning. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "2px 8px", fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
            {contributions.map((c) => {
              const stale = !poolMap[c.poolId];
              return (
                <React.Fragment key={c.poolId}>
                  <span style={{
                    color: stale ? "#fbbf24" : "#cbd5e1",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontStyle: stale ? "italic" : "normal",
                  }}>{symbolFor(c.poolId)}</span>
                  <span style={{ color: "#6b7a8d" }}>{(c.weightShare * 100).toFixed(0)}%</span>
                  <span style={{ color: "#94a3b8" }}>× {c.apy.toFixed(2)}%</span>
                  <span style={{ color: "#22d3ee" }}>= {c.contributionPp.toFixed(2)}pp</span>
                </React.Fragment>
              );
            })}
          </div>
          {hasStale && (
            <div style={{ fontSize: 9, color: "#fbbf24", marginTop: 6 }}>
              ⚠ Stale pool(s) no longer in catalog. They contribute to the historical chart but aren't visible in your portfolio table. Clear All + rebuild to remove.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WeightedYieldChart({ entries, poolMap }) {
  const { data, loading } = usePortfolioChart(entries, poolMap);
  const [mode, setMode] = useState("apy");

  if (!entries.length) return <div style={{ color: "#4a5568", fontSize: 12, fontFamily: mono, textAlign: "center", padding: 60 }}>Add pools to see historical yield trend</div>;
  if (loading) return <ChartShimmer height={280} />;
  if (!data.length) return <div style={{ color: "#4a5568", fontSize: 12, fontFamily: mono, textAlign: "center", padding: 60 }}>No historical data available</div>;

  const isCumulative = mode === "cumulative";
  const dataKey = isCumulative ? "cumulativeYield" : "weightedApy";

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {["apy", "cumulative"].map((m) => (
          <button key={m} onClick={() => setMode(m)} style={{
            background: mode === m ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.025)",
            border: mode === m ? "1px solid rgba(34,211,238,0.3)" : "1px solid rgba(255,255,255,0.06)",
            borderRadius: 4, padding: "4px 12px", fontSize: 10, fontFamily: mono,
            color: mode === m ? "#22d3ee" : "#6b7a8d", cursor: "pointer",
          }}>{m === "apy" ? "APY" : "Cumulative"}</button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <XAxis dataKey="date" tick={{ fill: "#4a5568", fontSize: 10, fontFamily: mono }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis tick={{ fill: "#4a5568", fontSize: 10, fontFamily: mono }} tickFormatter={(v) => `${v.toFixed(isCumulative ? 1 : 1)}%`} axisLine={false} tickLine={false} width={45} />
          <Tooltip
            content={<WeightedYieldTooltip poolMap={poolMap} isCumulative={isCumulative} />}
            cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
          />
          <Line dataKey={dataKey} stroke="#22d3ee" dot={false} strokeWidth={2} name="Portfolio" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Risk Metrics ── */
function RiskMetrics({ portfolio, poolMap }) {
  const metrics = useMemo(() => {
    if (!portfolio.length) return null;

    const pools = portfolio.map(({ poolId, weight }) => ({ pool: poolMap[poolId], weight })).filter((p) => p.pool);
    if (!pools.length) return null;

    // HHI by protocol
    const byProto = {};
    pools.forEach(({ pool, weight }) => {
      byProto[pool.project] = (byProto[pool.project] || 0) + weight;
    });
    const hhi = Object.values(byProto).reduce((s, w) => s + (w / 100) ** 2, 0);

    // Chain count
    const chains = new Set(pools.map(({ pool }) => pool.chain));

    // Max single pool
    const maxWeight = Math.max(...portfolio.map((e) => e.weight));

    // Reward dependency
    const totalWeight = pools.reduce((s, p) => s + p.weight, 0);
    const rewardPct = totalWeight > 0
      ? pools.reduce((s, { pool, weight }) => s + ((pool.apyReward || 0) / Math.max(pool.apy, 0.01)) * weight, 0) / totalWeight * 100
      : 0;

    return {
      hhi,
      hhiLabel: hhi > 0.5 ? "Concentrated" : hhi > 0.25 ? "Moderate" : "Diversified",
      hhiColor: hhi > 0.5 ? "#f87171" : hhi > 0.25 ? "#fbbf24" : "#4ade80",
      chains: chains.size,
      maxWeight,
      maxWeightColor: maxWeight > 50 ? "#f87171" : maxWeight > 30 ? "#fbbf24" : "#4ade80",
      rewardPct: rewardPct.toFixed(0),
      rewardColor: rewardPct > 60 ? "#f87171" : rewardPct > 30 ? "#fbbf24" : "#4ade80",
      poolCount: pools.length,
    };
  }, [portfolio, poolMap]);

  if (!metrics) return <div style={{ color: "#4a5568", fontSize: 12, fontFamily: mono, textAlign: "center", padding: 40 }}>Add pools to see risk metrics</div>;

  const card = (label, value, color) => (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "12px 16px", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 9, fontFamily: mono, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontFamily: mono, fontWeight: 600, color: color || "#e2e8f0" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {card("Concentration (HHI)", metrics.hhiLabel, metrics.hhiColor)}
      {card("Max Single Pool", `${metrics.maxWeight}%`, metrics.maxWeightColor)}
      {card("Chains", metrics.chains, metrics.chains >= 3 ? "#4ade80" : "#fbbf24")}
      {card("Reward Dependency", `${metrics.rewardPct}%`, metrics.rewardColor)}
    </div>
  );
}

/* ── Main Page ── */
export default function PortfolioPage() {
  const { pools: allPools, assets, loading, refreshing, refreshKey, lastUpdated, refresh } = useYieldComparison({ mode: "all" });
  const [selectedAsset, setSelectedAsset] = useState("USD");
  const [portfolio, setPortfolio] = useState([]); // [{poolId, weight}]
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("tvlUsd");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);

  // ─── Persistence state ───
  const [savedPortfolios, setSavedPortfolios] = useState([]);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  // Tracks the name of the saved portfolio the user is currently editing,
  // so we can offer a one-click "Update {name}" action without retyping.
  // Cleared if the user starts a fresh portfolio.
  const [loadedPortfolioName, setLoadedPortfolioName] = useState(null);
  const fileInputRef = useRef(null);
  const hasRestored = useRef(false);

  // Load saved portfolios from localStorage on mount + close menu on outside click
  useEffect(() => { setSavedPortfolios(loadSavedPortfolios()); }, []);
  useEffect(() => {
    if (!showSaveMenu) return;
    const close = (e) => {
      if (!e.target.closest("[data-save-menu]")) setShowSaveMenu(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showSaveMenu]);

  // Restore from URL hash (priority) or autosave on mount — wait for pools to load
  useEffect(() => {
    if (hasRestored.current || !allPools.length) return;
    hasRestored.current = true;
    const hashData = decodePortfolioHash(window.location.hash);
    if (hashData) {
      setSelectedAsset(hashData.asset);
      setPortfolio(hashData.portfolio);
      window.location.hash = ""; // clean up URL
      return;
    }
    const saved = loadSavedPortfolios();
    const autosave = saved.find((s) => s.name === AUTOSAVE_NAME);
    if (autosave && autosave.portfolio.length) {
      setSelectedAsset(autosave.selectedAsset);
      setPortfolio(autosave.portfolio);
    }
  }, [allPools]);

  // Auto-save to localStorage on portfolio or asset change
  useEffect(() => {
    if (!hasRestored.current) return; // don't save before initial restore
    const saved = loadSavedPortfolios();
    const filtered = saved.filter((s) => s.name !== AUTOSAVE_NAME);
    filtered.unshift({ name: AUTOSAVE_NAME, selectedAsset, portfolio, createdAt: Date.now() });
    writeSavedPortfolios(filtered);
    setSavedPortfolios(filtered);
  }, [portfolio, selectedAsset]);

  // ─── Save/Load/Share/Export/Import actions ───
  const savePortfolio = useCallback((name) => {
    if (!name || !portfolio.length) return;
    const saved = loadSavedPortfolios();
    const existing = saved.findIndex((s) => s.name === name && s.name !== AUTOSAVE_NAME);
    const entry = { name, selectedAsset, portfolio, createdAt: Date.now() };
    if (existing >= 0) saved[existing] = entry;
    else saved.push(entry);
    writeSavedPortfolios(saved);
    setSavedPortfolios(saved);
    setLoadedPortfolioName(name); // mark this as the active portfolio for future one-click updates
    setShowSaveMenu(false);
  }, [portfolio, selectedAsset]);

  const loadPortfolio = useCallback((entry) => {
    setSelectedAsset(entry.selectedAsset);
    setPortfolio(entry.portfolio);
    setLoadedPortfolioName(entry.name);
    setShowSaveMenu(false);
    setPage(0);
    setSearchQuery("");
  }, []);

  const deletePortfolio = useCallback((name) => {
    const saved = loadSavedPortfolios().filter((s) => s.name !== name);
    writeSavedPortfolios(saved);
    setSavedPortfolios(saved);
    // If the user just deleted the portfolio they were editing, drop the active mark.
    setLoadedPortfolioName((prev) => (prev === name ? null : prev));
  }, []);

  // Clear the loaded-portfolio mark when the user starts from scratch (empty portfolio).
  // Avoids "Update X" lingering after Clear All.
  useEffect(() => {
    if (portfolio.length === 0) setLoadedPortfolioName(null);
  }, [portfolio.length]);

  const sharePortfolio = useCallback(() => {
    const hash = encodePortfolioHash(selectedAsset, portfolio);
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareMsg("Copied!");
      setTimeout(() => setShareMsg(""), 2000);
    }).catch(() => {
      setShareMsg("Copy failed");
      setTimeout(() => setShareMsg(""), 2000);
    });
  }, [selectedAsset, portfolio]);

  // Filter pools by asset
  const assetPools = useMemo(() => allPools.filter((p) => p.baseAsset === selectedAsset), [allPools, selectedAsset]);

  // Pool lookup
  const poolMap = useMemo(() => {
    const map = {};
    allPools.forEach((p) => { map[p.id] = p; });
    return map;
  }, [allPools]);

  // Stale entries: portfolio pools no longer in the active catalog (TVL <$1M,
  // APY out of range, or delisted). They contribute to the historical chart
  // but aren't visible in the portfolio table — surfaced via banner so the
  // user can identify and remove them. Only flag once the catalog has loaded
  // (otherwise everything looks "stale" during initial load).
  const stalePoolEntries = useMemo(() => {
    if (!allPools.length) return [];
    return portfolio.filter((e) => !poolMap[e.poolId]);
  }, [portfolio, poolMap, allPools.length]);

  const removeStalePools = useCallback(() => {
    setPortfolio((prev) => prev.filter((e) => poolMap[e.poolId]));
  }, [poolMap]);

  // Export/Import (needs poolMap)
  const exportPortfolio = useCallback(() => {
    const data = {
      name: "Portfolio Export",
      selectedAsset,
      portfolio: portfolio.map((e) => {
        const pool = poolMap[e.poolId];
        return { poolId: e.poolId, weight: e.weight, symbol: pool?.symbol, project: pool?.project, chain: pool?.chain };
      }),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-${selectedAsset}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedAsset, portfolio, poolMap]);

  const importPortfolio = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.portfolio?.length) return;
        const validPortfolio = data.portfolio
          .filter((e) => e.poolId && typeof e.weight === "number")
          .slice(0, MAX_POOLS)
          .map((e) => ({ poolId: e.poolId, weight: Math.max(0, Math.min(100, e.weight)) }));
        if (data.selectedAsset) setSelectedAsset(data.selectedAsset);
        setPortfolio(validPortfolio);
        setPage(0);
        setSearchQuery("");
      } catch { /* invalid JSON — silently ignore */ }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  // Portfolio set for quick lookup
  const portfolioIds = useMemo(() => new Set(portfolio.map((e) => e.poolId)), [portfolio]);

  // Filtered + sorted pool list for browser
  const browsePools = useMemo(() => {
    let filtered = assetPools;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((p) =>
        p.symbol.toLowerCase().includes(q) || p.project.toLowerCase().includes(q) || p.chain.toLowerCase().includes(q)
      );
    }
    filtered.sort((a, b) => sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]);
    return filtered;
  }, [assetPools, searchQuery, sortKey, sortDir]);

  const pagedPools = browsePools.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(browsePools.length / PAGE_SIZE);

  // Summary stats
  const totalWeight = portfolio.reduce((s, e) => s + e.weight, 0);
  const weightedApy = useMemo(() => {
    if (!portfolio.length || totalWeight === 0) return 0;
    return portfolio.reduce((s, { poolId, weight }) => {
      const pool = poolMap[poolId];
      return s + (pool ? pool.apy * weight / totalWeight : 0);
    }, 0);
  }, [portfolio, poolMap, totalWeight]);

  const totalTvl = useMemo(() => {
    return portfolio.reduce((s, { poolId }) => {
      const pool = poolMap[poolId];
      return s + (pool ? pool.tvlUsd : 0);
    }, 0);
  }, [portfolio, poolMap]);

  // Actions
  const addPool = useCallback((poolId) => {
    if (portfolioIds.has(poolId) || portfolio.length >= MAX_POOLS) return;
    setPortfolio((prev) => [...prev, { poolId, weight: 0 }]);
  }, [portfolioIds, portfolio.length]);

  const removePool = useCallback((poolId) => {
    setPortfolio((prev) => prev.filter((e) => e.poolId !== poolId));
  }, []);

  const setWeight = useCallback((poolId, weight) => {
    const w = Math.max(0, Math.min(100, Number(weight) || 0));
    setPortfolio((prev) => prev.map((e) => e.poolId === poolId ? { ...e, weight: w } : e));
  }, []);

  const equalWeight = useCallback(() => {
    if (!portfolio.length) return;
    const w = Math.floor(100 / portfolio.length);
    const remainder = 100 - w * portfolio.length;
    setPortfolio((prev) => prev.map((e, i) => ({ ...e, weight: i === 0 ? w + remainder : w })));
  }, [portfolio.length]);

  const clearAll = useCallback(() => setPortfolio([]), []);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sortIcon = (key) => sortKey === key ? (sortDir === "desc" ? " \u2193" : " \u2191") : "";

  // Reset portfolio on asset change
  const handleAssetChange = (asset) => {
    setSelectedAsset(asset);
    setPortfolio([]);
    setPage(0);
    setSearchQuery("");
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ background: "#0a0e17", color: "#e2e8f0", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ padding: "20px 26px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontFamily: mono, fontWeight: 700 }}>Portfolio Builder</h1>
            <span style={{ fontSize: 9, fontFamily: mono, color: "#22d3ee", background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)", padding: "3px 10px", borderRadius: 4, letterSpacing: 1.5, textTransform: "uppercase" }}>TOOL</span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, fontFamily: mono, color: "#4a5568" }}>
            Build a hypothetical yield portfolio{lastUpdated && <> &middot; Updated {lastUpdated.toLocaleTimeString()}</>}
          </p>
        </div>
      </div>

      {/* Asset tabs */}
      <div style={{ padding: "0 26px 16px", display: "flex", gap: 6 }}>
        {ASSET_TABS.filter((a) => assets.includes(a)).map((asset) => {
          const count = allPools.filter((p) => p.baseAsset === asset).length;
          return (
            <button key={asset} onClick={() => handleAssetChange(asset)} style={TAB_STYLE(selectedAsset === asset, ASSET_COLORS[asset] || "#6b7a8d")}>
              {asset} ({count})
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ padding: "0 26px 40px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Hero stats */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard label="Pools Selected" value={portfolio.length} />
          <StatCard label="Weighted Avg APY" value={totalWeight > 0 ? `${weightedApy.toFixed(2)}%` : "—"} color="#22d3ee" />
          <StatCard label="Combined Pool TVL" value={totalTvl > 0 ? fmt(totalTvl) : "—"} />
          <StatCard label="Allocation" value={`${totalWeight}%`} color={totalWeight === 100 ? "#34d399" : totalWeight > 0 ? "#fbbf24" : "#4a5568"} />
        </div>

        {/* Allocation warning */}
        {portfolio.length > 0 && totalWeight !== 100 && (
          <div style={{ background: totalWeight > 100 ? "rgba(248,113,113,0.08)" : "rgba(251,191,36,0.08)", border: `1px solid ${totalWeight > 100 ? "rgba(248,113,113,0.2)" : "rgba(251,191,36,0.2)"}`, borderRadius: 6, padding: "8px 16px", fontSize: 11, fontFamily: mono, color: totalWeight > 100 ? "#f87171" : "#fbbf24" }}>
            {totalWeight > 100
              ? `Allocation exceeds 100% by ${totalWeight - 100}%. Please reduce weights.`
              : `Allocation is ${totalWeight}% — ${100 - totalWeight}% unallocated.`}
          </div>
        )}

        {/* Stale pool banner — pools in the saved portfolio that aren't in the
            current catalog (likely filtered out by TVL/APY thresholds or
            delisted). They're invisible in the portfolio table but still
            contribute weight to the historical chart. */}
        {stalePoolEntries.length > 0 && (
          <div style={{
            background: "rgba(251,191,36,0.06)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: 6,
            padding: "10px 16px",
            fontSize: 11,
            fontFamily: mono,
            color: "#fbbf24",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {stalePoolEntries.length} stale pool{stalePoolEntries.length === 1 ? "" : "s"} in your portfolio
                </div>
                <div style={{ color: "#cbd5e1", fontSize: 10, lineHeight: 1.5, marginBottom: 6 }}>
                  No longer in the active catalog (TVL dropped below $1M, APY out of range, or delisted).
                  They contribute to the weighted yield chart but aren't shown in the portfolio table —
                  totaling <span style={{ color: "#fbbf24" }}>{stalePoolEntries.reduce((s, e) => s + (e.weight || 0), 0)}%</span> of your allocation.
                </div>
                <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
                  {stalePoolEntries.slice(0, 5).map((e) => (
                    <span key={e.poolId} style={{ display: "inline-block", marginRight: 12 }}>
                      <span style={{ fontFamily: mono, color: "#cbd5e1" }}>{e.poolId.slice(0, 10)}…</span>
                      <span style={{ color: "#6b7a8d", marginLeft: 4 }}>{e.weight}%</span>
                    </span>
                  ))}
                  {stalePoolEntries.length > 5 && (
                    <span style={{ color: "#6b7a8d" }}>+{stalePoolEntries.length - 5} more</span>
                  )}
                </div>
              </div>
              <button
                onClick={removeStalePools}
                style={{
                  background: "rgba(251,191,36,0.15)",
                  border: "1px solid rgba(251,191,36,0.3)",
                  borderRadius: 4,
                  padding: "6px 12px",
                  fontSize: 10,
                  fontFamily: mono,
                  color: "#fbbf24",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                Remove stale pools
              </button>
            </div>
          </div>
        )}

        {/* Two-column: Pool Browser + Portfolio */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Pool Browser */}
          <ModuleCard>
            <SectionHeader title="Available Pools" subtitle={`${browsePools.length} ${selectedAsset} pools`} />
            <input
              type="text"
              placeholder="Search by symbol, protocol, or chain..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "7px 10px", fontSize: 12, fontFamily: mono, color: "#cbd5e1", outline: "none", marginBottom: 10, boxSizing: "border-box" }}
            />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>Symbol</th>
                    <th style={TH}>Protocol</th>
                    <th style={TH}>Chain</th>
                    <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("apy")}>APY{sortIcon("apy")}</th>
                    <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("tvlUsd")}>TVL{sortIcon("tvlUsd")}</th>
                    <th style={{ ...TH, width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPools.map((p) => {
                    const inPortfolio = portfolioIds.has(p.id);
                    return (
                      <tr key={p.id}>
                        <td style={{ ...TD, color: "#cbd5e1", fontWeight: 500 }}>
                          {p.symbol}
                          {p.poolMeta && p.poolMeta.startsWith("For buying PT") && (
                            <span style={{ marginLeft: 5, fontSize: 8, fontFamily: mono, color: "#a78bfa", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", padding: "1px 4px", borderRadius: 2, verticalAlign: "middle" }}>PT</span>
                          )}
                          {p.poolMeta && p.poolMeta.startsWith("For LP") && (
                            <span style={{ marginLeft: 5, fontSize: 8, fontFamily: mono, color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", padding: "1px 4px", borderRadius: 2, verticalAlign: "middle" }}>LP</span>
                          )}
                        </td>
                        <td style={TD_DIM}>{p.project}</td>
                        <td style={TD_DIM}>{p.chain}</td>
                        <td style={TD_APY}>{p.apy.toFixed(2)}%</td>
                        <td style={TD_NUM}>{fmt(p.tvlUsd)}</td>
                        <td style={TD}>
                          <button
                            onClick={() => addPool(p.id)}
                            disabled={inPortfolio || portfolio.length >= MAX_POOLS}
                            style={{
                              background: inPortfolio ? "rgba(74,222,128,0.1)" : "rgba(34,211,238,0.08)",
                              border: inPortfolio ? "1px solid rgba(74,222,128,0.2)" : "1px solid rgba(34,211,238,0.15)",
                              borderRadius: 3, padding: "2px 8px", fontSize: 10, fontFamily: mono,
                              color: inPortfolio ? "#4ade80" : "#22d3ee",
                              cursor: inPortfolio ? "default" : "pointer",
                              opacity: (!inPortfolio && portfolio.length >= MAX_POOLS) ? 0.3 : 1,
                            }}
                          >{inPortfolio ? "\u2713" : "+"}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={() => setPage(0)} disabled={page === 0} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page === 0 ? 0.3 : 1 }}>{"«"}</button>
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page === 0 ? 0.3 : 1 }}>{"‹"}</button>
                {(() => {
                  const pages = [];
                  let start = Math.max(0, page - 2);
                  let end = Math.min(totalPages - 1, start + 4);
                  start = Math.max(0, end - 4);
                  if (start > 0) {
                    pages.push(0);
                    if (start > 1) pages.push("...");
                  }
                  for (let i = start; i <= end; i++) pages.push(i);
                  if (end < totalPages - 1) {
                    if (end < totalPages - 2) pages.push("...");
                    pages.push(totalPages - 1);
                  }
                  return pages.map((p, idx) =>
                    p === "..." ? (
                      <span key={`dot-${idx}`} style={{ fontSize: 10, fontFamily: mono, color: "#4a5568", padding: "3px 2px" }}>…</span>
                    ) : (
                      <button key={p} onClick={() => setPage(p)} style={{ background: p === page ? "rgba(34,211,238,0.15)" : "none", border: p === page ? "1px solid rgba(34,211,238,0.3)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: p === page ? "#22d3ee" : "#94a3b8", cursor: "pointer", fontWeight: p === page ? 600 : 400, minWidth: 28, textAlign: "center" }}>{p + 1}</button>
                    )
                  );
                })()}
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page >= totalPages - 1 ? 0.3 : 1 }}>{"›"}</button>
                <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page >= totalPages - 1 ? 0.3 : 1 }}>{"»"}</button>
              </div>
            )}
          </ModuleCard>

          {/* Portfolio Allocations */}
          <ModuleCard>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <SectionHeader title="Your Portfolio" subtitle={portfolio.length ? `${portfolio.length} pools selected` : "Add pools from the left"} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {portfolio.length > 0 && (
                  <>
                    <button onClick={equalWeight} style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)", borderRadius: 3, padding: "4px 10px", fontSize: 10, fontFamily: mono, color: "#22d3ee", cursor: "pointer" }}>Equal Weight</button>
                    <button onClick={clearAll} style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 3, padding: "4px 10px", fontSize: 10, fontFamily: mono, color: "#f87171", cursor: "pointer" }}>Clear All</button>
                  </>
                )}
              </div>
            </div>

            {/* Save / Load / Share / Export / Import toolbar */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center", position: "relative" }}>
              {/* Save button with dropdown */}
              <div data-save-menu style={{ position: "relative" }}>
                <button
                  onClick={() => setShowSaveMenu(!showSaveMenu)}
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, padding: "4px 10px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer" }}
                >
                  Save {"\u25BE"}
                </button>
                {showSaveMenu && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 50,
                    background: "#131926", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5,
                    padding: 8, minWidth: 240, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}>
                    {/* One-click update for the currently-loaded portfolio */}
                    {loadedPortfolioName && portfolio.length > 0 && (
                      <button
                        onClick={() => savePortfolio(loadedPortfolioName)}
                        style={{
                          width: "100%", marginBottom: 8,
                          background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.25)",
                          borderRadius: 3, padding: "6px 10px", fontSize: 11, fontFamily: mono,
                          color: "#22d3ee", cursor: "pointer", textAlign: "left",
                        }}
                      >
                        {"↻"} Update "{loadedPortfolioName}"
                      </button>
                    )}
                    {/* Save as new */}
                    <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                      <input
                        type="text"
                        placeholder={loadedPortfolioName ? "Save as new..." : "Portfolio name..."}
                        id="portfolio-save-name"
                        style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, padding: "4px 8px", fontSize: 10, fontFamily: mono, color: "#cbd5e1", outline: "none" }}
                        onKeyDown={(e) => { if (e.key === "Enter") savePortfolio(e.target.value.trim()); }}
                      />
                      <button
                        onClick={() => {
                          const input = document.getElementById("portfolio-save-name");
                          savePortfolio(input?.value?.trim() || `Portfolio ${savedPortfolios.filter((s) => s.name !== AUTOSAVE_NAME).length + 1}`);
                        }}
                        style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)", borderRadius: 3, padding: "4px 8px", fontSize: 10, fontFamily: mono, color: "#22d3ee", cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Save
                      </button>
                    </div>
                    {/* Saved portfolios list */}
                    {savedPortfolios.filter((s) => s.name !== AUTOSAVE_NAME).length > 0 && (
                      <>
                        <div style={{ fontSize: 9, fontFamily: mono, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Saved Portfolios</div>
                        {savedPortfolios.filter((s) => s.name !== AUTOSAVE_NAME).map((s) => {
                          const isActive = s.name === loadedPortfolioName;
                          return (
                          <div key={s.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                            <button
                              onClick={() => loadPortfolio(s)}
                              style={{ background: "none", border: "none", color: isActive ? "#22d3ee" : "#cbd5e1", fontSize: 11, fontFamily: mono, cursor: "pointer", textAlign: "left", flex: 1, padding: "2px 0", fontWeight: isActive ? 600 : 400 }}
                            >
                              {s.name} <span style={{ color: "#4a5568", fontSize: 9 }}>({s.portfolio.length} pools · {s.selectedAsset})</span>
                            </button>
                            {/* Per-row update: overwrite this saved entry with the current portfolio */}
                            {portfolio.length > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); savePortfolio(s.name); }}
                                title={`Overwrite "${s.name}" with current portfolio`}
                                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer", padding: "0 4px" }}
                              >
                                {"\u21BB"}
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); deletePortfolio(s.name); }}
                              style={{ background: "none", border: "none", color: "#f87171", fontSize: 12, cursor: "pointer", padding: "0 4px" }}
                            >
                              {"\u00D7"}
                            </button>
                          </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Share */}
              <button
                onClick={sharePortfolio}
                disabled={!portfolio.length}
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, padding: "4px 10px", fontSize: 10, fontFamily: mono, color: portfolio.length ? "#94a3b8" : "#2d3a4a", cursor: portfolio.length ? "pointer" : "default" }}
              >
                Share
              </button>
              {shareMsg && <span style={{ fontSize: 10, fontFamily: mono, color: "#4ade80" }}>{shareMsg}</span>}

              {/* Export */}
              <button
                onClick={exportPortfolio}
                disabled={!portfolio.length}
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, padding: "4px 10px", fontSize: 10, fontFamily: mono, color: portfolio.length ? "#94a3b8" : "#2d3a4a", cursor: portfolio.length ? "pointer" : "default" }}
              >
                Export
              </button>

              {/* Import */}
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, padding: "4px 10px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer" }}
              >
                Import
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={importPortfolio} style={{ display: "none" }} />
            </div>
            {!portfolio.length ? (
              <div style={{ color: "#4a5568", fontSize: 12, fontFamily: mono, textAlign: "center", padding: 60 }}>
                Click + on pools to add them to your portfolio
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {portfolio.map(({ poolId, weight }) => {
                  const pool = poolMap[poolId];
                  if (!pool) return null;
                  const contribution = totalWeight > 0 ? (pool.apy * weight / totalWeight).toFixed(2) : "0.00";
                  return (
                    <div key={poolId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontFamily: mono, color: "#cbd5e1", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pool.symbol}</div>
                        <div style={{ fontSize: 10, fontFamily: mono, color: "#4a5568" }}>{pool.project} &middot; {pool.chain} &middot; {pool.apy.toFixed(2)}%</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={weight || ""}
                          onChange={(e) => setWeight(poolId, e.target.value)}
                          placeholder="0"
                          style={{ width: 52, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3, padding: "4px 6px", fontSize: 12, fontFamily: mono, color: "#e2e8f0", textAlign: "right", outline: "none" }}
                        />
                        <span style={{ fontSize: 10, fontFamily: mono, color: "#4a5568" }}>%</span>
                      </div>
                      <div style={{ fontSize: 10, fontFamily: mono, color: "#22d3ee", width: 55, textAlign: "right" }}>+{contribution}%</div>
                      <button onClick={() => removePool(poolId)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14, fontFamily: mono, padding: "0 4px" }}>{"\u00d7"}</button>
                    </div>
                  );
                })}
                {/* Total row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0 4px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ flex: 1, fontSize: 11, fontFamily: mono, color: "#94a3b8", fontWeight: 600 }}>Total</div>
                  <div style={{ fontSize: 13, fontFamily: mono, fontWeight: 700, color: totalWeight === 100 ? "#4ade80" : "#fbbf24" }}>{totalWeight}%</div>
                  <div style={{ fontSize: 11, fontFamily: mono, color: "#22d3ee", width: 55, textAlign: "right", fontWeight: 600 }}>{weightedApy.toFixed(2)}%</div>
                  <div style={{ width: 22 }} />
                </div>
              </div>
            )}
          </ModuleCard>
        </div>

        {/* Exposure Pie Charts */}
        {portfolio.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            <ModuleCard>
              <SectionHeader title="Protocol Exposure" subtitle="Allocation by protocol" />
              <ExposurePie portfolio={portfolio} poolMap={poolMap} groupBy="project" colorMap={null} />
            </ModuleCard>
            <ModuleCard>
              <SectionHeader title="Chain Exposure" subtitle="Allocation by chain" />
              <ExposurePie portfolio={portfolio} poolMap={poolMap} groupBy="chain" colorMap={CHAIN_COLORS} />
            </ModuleCard>
            <ModuleCard>
              <SectionHeader title="Category Exposure" subtitle="Allocation by category" />
              <ExposurePie portfolio={portfolio} poolMap={poolMap} groupBy="category" colorMap={CATEGORY_COLORS} />
            </ModuleCard>
          </div>
        )}

        {/* Historical Weighted Yield */}
        {portfolio.length > 0 && totalWeight > 0 && (
          <ModuleCard>
            <SectionHeader title="Historical Weighted Yield" subtitle="Weighted average APY trend based on your portfolio (90 days)" />
            <WeightedYieldChart entries={portfolio.filter((e) => e.weight > 0)} poolMap={poolMap} />
          </ModuleCard>
        )}

        {/* Risk Metrics */}
        {portfolio.length > 0 && (
          <ModuleCard>
            <SectionHeader title="Risk Metrics" subtitle="Concentration and diversification analysis" />
            <RiskMetrics portfolio={portfolio} poolMap={poolMap} />
          </ModuleCard>
        )}
      </div>
    </div>
  );
}

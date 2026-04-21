import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { useSparklendData } from "../hooks/useSparklendData";
import { fmt, fmtPct } from "../utils/format";
import { SectionHeader, LoadingSpinner, ModuleCard, ChartShimmer } from "../components/Shared";

const mono = "'JetBrains Mono', monospace";
const ACCENT = "#ff4d8f"; // Spark pink — matches spark.fi brand

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
  contentStyle: { background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#e2e8f0" },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#e2e8f0" },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};

function utilColor(util) {
  if (util == null) return "#94a3b8";
  return util >= 95 ? "#f87171" : util >= 85 ? "#fb923c" : util >= 70 ? "#fbbf24" : "#4ade80";
}

// Asset class classification (shared with AavePage pattern)
const USD_TOKENS = new Set(["USDC", "USDT", "DAI", "PYUSD", "GHO", "FRAX", "LUSD", "crvUSD", "FDUSD", "TUSD", "USDS", "USDM", "sUSDe", "sUSDS", "sDAI", "DOLA", "USD0", "RLUSD", "USDG", "frxUSD"]);
const ETH_TOKENS = new Set(["WETH", "ETH", "wstETH", "stETH", "cbETH", "rETH", "weETH", "ezETH", "mETH", "sfrxETH", "osETH", "swETH", "OETH", "rsETH"]);
const BTC_TOKENS = new Set(["WBTC", "cbBTC", "tBTC", "LBTC", "FBTC", "eBTC", "solvBTC"]);

function getAssetClass(symbol) {
  if (!symbol) return null;
  const s = symbol.toUpperCase();
  if (USD_TOKENS.has(symbol) || s.includes("USD") || s.includes("DAI") || s.includes("GHO")) return "USD";
  if (ETH_TOKENS.has(symbol) || s.includes("ETH")) return "ETH";
  if (BTC_TOKENS.has(symbol) || s.includes("BTC")) return "BTC";
  return "Other";
}

const ASSET_CLASSES = ["All", "USD", "ETH", "BTC", "Other"];

const CHAIN_COLORS = {
  Ethereum: "#627eea", Gnosis: "#04795b", Base: "#2563eb",
  Arbitrum: "#28a0f0", Optimism: "#ff0420", Unichain: "#f472b6",
};
function getChainColor(name) { return CHAIN_COLORS[name] || "#6b7a8d"; }

const PAGE_SIZE = 25;

function Pagination({ page, totalPages, total, onPageChange }) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
      <button onClick={() => onPageChange(0)} disabled={page === 0} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page === 0 ? 0.3 : 1 }}>{"\u00AB"}</button>
      <button onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page === 0 ? 0.3 : 1 }}>{"\u2039"}</button>
      {(() => {
        const pages = [];
        let start = Math.max(0, page - 2);
        let end = Math.min(totalPages - 1, start + 4);
        start = Math.max(0, end - 4);
        if (start > 0) { pages.push(0); if (start > 1) pages.push("..."); }
        for (let i = start; i <= end; i++) pages.push(i);
        if (end < totalPages - 1) { if (end < totalPages - 2) pages.push("..."); pages.push(totalPages - 1); }
        return pages.map((p, idx) =>
          p === "..." ? (
            <span key={`dot-${idx}`} style={{ fontSize: 10, fontFamily: mono, color: "#4a5568", padding: "3px 2px" }}>{"\u2026"}</span>
          ) : (
            <button key={p} onClick={() => onPageChange(p)} style={{ background: p === page ? "rgba(255,77,143,0.15)" : "none", border: p === page ? "1px solid rgba(255,77,143,0.3)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: p === page ? ACCENT : "#94a3b8", cursor: "pointer", fontWeight: p === page ? 600 : 400, minWidth: 28, textAlign: "center" }}>{p + 1}</button>
          )
        );
      })()}
      <button onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page >= totalPages - 1 ? 0.3 : 1 }}>{"\u203A"}</button>
      <button onClick={() => onPageChange(totalPages - 1)} disabled={page >= totalPages - 1} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page >= totalPages - 1 ? 0.3 : 1 }}>{"\u00BB"}</button>
    </div>
  );
}

// ─── Charts ───

function TvlHistoryChart({ tvlHistory }) {
  const data = useMemo(() => {
    if (!tvlHistory?.length) return [];
    return tvlHistory
      .filter((d) => d.supply > 0 || d.tvl > 0)
      .map((d) => ({
        date: new Date(d.date * 1000).toISOString().slice(0, 10),
        supply: d.supply || d.tvl,
        borrow: d.borrow || 0,
      }));
  }, [tvlHistory]);
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <defs>
          <linearGradient id="sparkSupplyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="sparkBorrowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} interval={Math.floor(data.length / 6)} tickFormatter={(v) => v.slice(5)} />
        <YAxis tickFormatter={(v) => fmt(v)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} labelFormatter={(v) => v} formatter={(v, name) => [fmt(v), name === "supply" ? "Supply" : "Borrow"]} />
        <Legend formatter={(value) => value === "supply" ? "Supply" : "Borrow"} wrapperStyle={{ fontSize: 10, fontFamily: mono, color: "#94a3b8" }} />
        <Area type="monotone" dataKey="supply" stroke={ACCENT} fill="url(#sparkSupplyGrad)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="borrow" stroke="#f87171" fill="url(#sparkBorrowGrad)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TvlByChainChart({ pools }) {
  const data = useMemo(() => {
    const byChain = {};
    pools.forEach((p) => {
      byChain[p.chain] = (byChain[p.chain] || 0) + p.tvlUsd;
    });
    return Object.entries(byChain).map(([name, tvl]) => ({ name, tvl })).sort((a, b) => b.tvl - a.tvl);
  }, [pools]);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tickFormatter={(v) => fmt(v, 1)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => fmt(v)} {...chartTooltipStyle} />
        <Bar dataKey="tvl" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {data.map((d) => <Cell key={d.name} fill={getChainColor(d.name)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopAssetsByTvlChart({ pools }) {
  const data = useMemo(() => {
    const byAsset = {};
    pools.forEach((p) => {
      byAsset[p.symbol] = (byAsset[p.symbol] || 0) + p.tvlUsd;
    });
    return Object.entries(byAsset).map(([name, tvl]) => ({ name, tvl })).sort((a, b) => b.tvl - a.tvl).slice(0, 12);
  }, [pools]);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tickFormatter={(v) => fmt(v, 1)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={70} tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => fmt(v)} {...chartTooltipStyle} />
        <Bar dataKey="tvl" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {data.map((_, i) => <Cell key={i} fill={i === 0 ? ACCENT : `rgba(255,77,143,${0.6 - i * 0.04})`} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Pools Table ───

function PoolsTable({ pools }) {
  const [sortKey, setSortKey] = useState("tvlUsd");
  const [sortDir, setSortDir] = useState("desc");
  const [filters, setFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);

  const filterOptions = useMemo(() => {
    const chains = [...new Set(pools.map((p) => p.chain))].sort();
    return {
      assetClass: { label: "Asset", values: ASSET_CLASSES.filter((a) => a !== "All") },
      chain: { label: "Chain", values: chains },
    };
  }, [pools]);

  const filtered = useMemo(() => {
    return pools.filter((p) => {
      if (filters.assetClass && getAssetClass(p.symbol) !== filters.assetClass) return false;
      if (filters.chain && p.chain !== filters.chain) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!(p.symbol || "").toLowerCase().includes(q) && !(p.chain || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [pools, filters, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] || 0;
      const bv = b[sortKey] || 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(0);
  };

  const sortIcon = (key) => sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  if (!pools.length) return <div style={{ color: "#6b7a8d", fontSize: 13, fontFamily: mono, padding: 16 }}>No pools found</div>;

  return (
    <div>
      <input
        type="text"
        placeholder="Search by asset or chain..."
        value={searchQuery}
        onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
        style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "7px 10px", fontSize: 12, fontFamily: mono, color: "#cbd5e1", outline: "none", marginBottom: 10, boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {Object.entries(filterOptions).map(([key, { label, values }]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>{label}</span>
            <select
              style={FILTER_STYLE}
              value={filters[key] || ""}
              onChange={(e) => { setFilters({ ...filters, [key]: e.target.value }); setPage(0); }}
            >
              <option value="">All</option>
              {values.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        ))}
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, alignSelf: "center" }}>{filtered.length} of {pools.length} pools</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>Asset</th>
              <th style={TH}>Chain</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("supplyApy")}>Supply APY{sortIcon("supplyApy")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("apyBase")}>Base APY{sortIcon("apyBase")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("apyReward")}>Reward APY{sortIcon("apyReward")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("borrowApy")}>Borrow APY{sortIcon("borrowApy")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("tvlUsd")}>TVL{sortIcon("tvlUsd")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("utilization")}>Util%{sortIcon("utilization")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("apyPct7D")}>7d Δ{sortIcon("apyPct7D")}</th>
              <th style={{ ...TH, textAlign: "right" }}>30d Avg</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((p, i) => (
              <tr
                key={p.id || i}
                onClick={() => window.open(`https://defillama.com/yields/pool/${p.id}`, "_blank")}
                style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)", cursor: "pointer" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)"}
              >
                <td style={{ ...TD, color: "#cbd5e1", fontWeight: 500 }}>{p.symbol}</td>
                <td style={TD_DIM}>{p.chain}</td>
                <td style={TD_APY}>{fmtPct(p.supplyApy)}</td>
                <td style={TD_NUM}>{fmtPct(p.apyBase)}</td>
                <td style={{ ...TD_NUM, color: p.apyReward > 0 ? "#a78bfa" : "#94a3b8" }}>{fmtPct(p.apyReward)}</td>
                <td style={{ ...TD_NUM, color: "#f87171" }}>{fmtPct(p.borrowApy)}</td>
                <td style={TD_NUM}>{fmt(p.tvlUsd)}</td>
                <td style={{ ...TD_NUM, color: utilColor(p.utilization) }}>{fmtPct(p.utilization)}</td>
                <td style={{ ...TD_NUM, color: p.apyPct7D > 0 ? "#4ade80" : p.apyPct7D < 0 ? "#f87171" : "#94a3b8" }}>
                  {p.apyPct7D > 0 ? "+" : ""}{fmtPct(p.apyPct7D)}
                </td>
                <td style={TD_NUM}>{fmtPct(p.apyMean30d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={Math.ceil(sorted.length / PAGE_SIZE)} total={sorted.length} onPageChange={setPage} />
      </div>
    </div>
  );
}

// ─── Main Page ───

export default function SparklendPage() {
  const { pools, tvlHistory, loading, refreshing, refreshKey, error, lastUpdated, refresh } = useSparklendData();

  const stats = useMemo(() => {
    const poolList = pools || [];
    const totalTvl = poolList.reduce((s, p) => s + p.tvlUsd, 0);
    const chains = new Set(poolList.map((p) => p.chain)).size;
    return { totalTvl, chains, poolCount: poolList.length };
  }, [pools]);

  // Weighted avg supply & borrow rates for key assets
  // Filters out micro-liquidity (<$100K TVL) and APY outliers (>50%) to prevent skew
  const assetRates = useMemo(() => {
    const poolList = pools || [];
    const KEY_ASSETS = ["USDC", "USDT", "WETH"];
    const MIN_TVL = 100_000;
    const MAX_APY = 50;
    return KEY_ASSETS.map((sym) => {
      const matched = poolList.filter((p) => {
        if ((p.symbol || "").toUpperCase() !== sym) return false;
        if ((p.tvlUsd || 0) < MIN_TVL) return false;
        if ((p.supplyApy || 0) > MAX_APY) return false;
        if ((p.borrowApy || 0) > MAX_APY) return false;
        return true;
      });
      const totalSupply = matched.reduce((s, p) => s + (p.totalSupplyUsd || 0), 0);
      const totalBorrow = matched.reduce((s, p) => s + (p.totalBorrowUsd || 0), 0);
      const avgSupplyApy = totalSupply > 0
        ? matched.reduce((s, p) => s + p.supplyApy * (p.totalSupplyUsd || 0), 0) / totalSupply
        : 0;
      const avgBorrowApy = totalBorrow > 0
        ? matched.reduce((s, p) => s + (p.borrowApy || 0) * (p.totalBorrowUsd || 0), 0) / totalBorrow
        : 0;
      return { symbol: sym, avgSupplyApy, avgBorrowApy, totalSupply, totalBorrow, poolCount: matched.length };
    });
  }, [pools]);

  if (error) {
    return (
      <div style={{ background: "#0a0e17", color: "#f87171", padding: 40, fontFamily: mono, textAlign: "center", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Failed to load SparkLend data</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>{error}</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: "#0a0e17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner message="Pulling data from DeFiLlama..." />
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0e17", color: "#e2e8f0", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>

      {/* Header */}
      <div style={{ padding: "20px 26px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
              SparkLend
              <span style={{ color: ACCENT, marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: mono, verticalAlign: "middle", background: "rgba(255,77,143,0.07)", padding: "2px 7px", borderRadius: 3, letterSpacing: 1 }}>
                PROTOCOL
              </span>
            </h1>
            <div style={{ fontSize: 12, color: "#4f5e6f", marginTop: 2, fontFamily: mono }}>
              Data from DeFiLlama
              {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              background: refreshing ? "rgba(255,77,143,0.15)" : "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 11,
              fontFamily: mono,
              color: refreshing ? ACCENT : "#94a3b8",
              cursor: refreshing ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s",
              letterSpacing: 0.5,
            }}
          >
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none", fontSize: 13 }}>&#x21bb;</span>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* TVL hero card */}
        <div style={{ marginTop: 14 }}>
          <div style={{
            background: "rgba(255,77,143,0.06)",
            border: "1px solid rgba(255,77,143,0.15)",
            borderRadius: 6,
            padding: "20px 24px",
            position: "relative",
            overflow: "hidden",
          }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,77,143,0.08) 40%, rgba(255,77,143,0.12) 50%, rgba(255,77,143,0.08) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: ACCENT, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Total Value Locked</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 4 }}>{fmt(stats.totalTvl)}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>{stats.chains} chains · {stats.poolCount} pools</div>
          </div>
        </div>

        {/* Weighted avg rates for key assets */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
          {assetRates.map((a) => (
            <div key={a.symbol} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "12px 16px", position: "relative", overflow: "hidden" }}>
              {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", fontFamily: mono }}>{a.symbol}</div>
                <div style={{ fontSize: 9, color: "#4f5e6f", fontFamily: mono }}>{a.poolCount} pools · wt avg</div>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 9, color: "#4ade80", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.5 }}>Supply APY</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#4ade80", fontFamily: mono, marginTop: 2 }}>{fmtPct(a.avgSupplyApy)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#f87171", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.5 }}>Borrow APY</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#f87171", fontFamily: mono, marginTop: 2 }}>{fmtPct(a.avgBorrowApy)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div style={{ padding: "20px 26px 0", display: "flex", flexDirection: "column", gap: 16 }}>
        {tvlHistory?.length > 0 && (
          <ModuleCard>
            <SectionHeader title="Supply & Borrow History" subtitle="Historical supply and borrow across all chains" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><TvlHistoryChart tvlHistory={tvlHistory} /></div>
            )}
          </ModuleCard>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <ModuleCard>
            <SectionHeader title="TVL by Chain" subtitle="Pool TVL per chain" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><TvlByChainChart pools={pools || []} /></div>
            )}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="Top Assets" subtitle="Largest pools by TVL" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><TopAssetsByTvlChart pools={pools || []} /></div>
            )}
          </ModuleCard>
        </div>
      </div>

      {/* Pools Table */}
      <div style={{ padding: "20px 26px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
        <ModuleCard>
          <SectionHeader title="SparkLend Pools" subtitle={`${(pools || []).length} lending pools across ${stats.chains} chains`} />
          {refreshing ? <ChartShimmer height={300} /> : (
            <div key={refreshKey}><PoolsTable pools={pools || []} /></div>
          )}
        </ModuleCard>
      </div>
    </div>
  );
}

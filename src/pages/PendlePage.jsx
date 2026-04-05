import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { usePendleData } from "../hooks/usePendleData";
import { fmt, fmtPct } from "../utils/format";
import { SectionHeader, LoadingSpinner, ModuleCard, ChartShimmer } from "../components/Shared";

const mono = "'JetBrains Mono', monospace";

const TAB_STYLE = (active) => ({
  background: active ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.025)",
  border: active ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(255,255,255,0.05)",
  borderRadius: 5,
  padding: "7px 16px",
  fontSize: 10,
  fontFamily: mono,
  color: active ? "#34d399" : "#6b7a8d",
  cursor: "pointer",
  letterSpacing: 0.5,
  fontWeight: active ? 600 : 400,
});

const TH = { padding: "8px 8px", textAlign: "left", fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 };
const TD = { padding: "8px 8px", fontSize: 13, fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.03)" };
const TD_NUM = { ...TD, textAlign: "right" };
const TD_APY = { ...TD_NUM, color: "#22d3ee" };
const TD_DIM = { ...TD, color: "#94a3b8" };

const CHAIN_COLORS = {
  Ethereum: "#627eea", Arbitrum: "#28a0f0", Base: "#2563eb",
  Optimism: "#ff0420", Polygon: "#8247e5", HyperEVM: "#22d3ee",
  "BNB Chain": "#f0b90b", Sonic: "#60a5fa", Mantle: "#fb923c",
  Berachain: "#b45309", Plasma: "#8b5cf6",
};
function getChainColor(name) { return CHAIN_COLORS[name] || "#6b7a8d"; }

const CHAIN_SLUGS = {
  Ethereum: "ethereum", Arbitrum: "arbitrum", Base: "base",
  Optimism: "optimism", "BNB Chain": "bsc", Sonic: "sonic",
  HyperEVM: "hyperevm", Mantle: "mantle", Berachain: "berachain",
  Plasma: "plasma", Polygon: "polygon",
};
function getChainSlug(name) { return CHAIN_SLUGS[name] || name.toLowerCase(); }

// Asset class classification based on market name and categories
const ASSET_CLASSES = ["All", "USD", "ETH", "BTC", "HYPE", "Other"];

function getAssetClass(market) {
  const name = (market.name || "").toUpperCase();
  const cats = market.categories || [];
  // Check categories first
  if (cats.includes("stables") || cats.includes("rwa")) return "USD";
  if (cats.includes("eth")) return "ETH";
  if (cats.includes("btc")) return "BTC";
  if (cats.includes("hype")) return "HYPE";
  // Fallback to name matching
  if (name.includes("USD") || name.includes("DAI") || name.includes("FRAX") || name.includes("LUSD") || name.includes("GHO")) return "USD";
  if (name.includes("ETH") || name.includes("STETH") || name.includes("EETH") || name.includes("RETH")) return "ETH";
  if (name.includes("BTC") || name.includes("WBTC") || name.includes("CBBTC") || name.includes("TBTC")) return "BTC";
  if (name.includes("HYPE")) return "HYPE";
  return "Other";
}

const chartTooltipStyle = {
  contentStyle: { background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#e2e8f0" },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#e2e8f0" },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};

const CATEGORY_COLORS = {
  stables: "#26a17b", eth: "#627eea", btc: "#f7931a", points: "#a855f7",
  rwa: "#fb923c", ethena: "#818cf8", pendle: "#34d399", hype: "#22d3ee",
  _featured: "#f472b6", others: "#94a3b8",
};
function categoryLabel(c) { return c.startsWith("_") ? c.slice(1) : c; }

function expiryColor(expiry) {
  if (!expiry) return "#94a3b8";
  const days = (new Date(expiry) - new Date()) / 86400000;
  if (days < 0) return "#f87171";
  if (days < 30) return "#4ade80";
  if (days < 90) return "#fbbf24";
  return "#f87171";
}

function daysUntil(expiry) {
  if (!expiry) return "—";
  const days = Math.round((new Date(expiry) - new Date()) / 86400000);
  if (days < 0) return "Expired";
  if (days === 0) return "Today";
  return `${days}d`;
}

// ─── Charts ───

function ProtocolTvlChart({ tvlHistory }) {
  const data = useMemo(() => {
    if (!tvlHistory?.length) return [];
    return tvlHistory.map((d) => ({
      date: new Date(d.date * 1000).toISOString().slice(0, 10),
      tvl: d.tvl,
    }));
  }, [tvlHistory]);
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <defs>
          <linearGradient id="pendleTvlGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} interval={Math.floor(data.length / 6)} tickFormatter={(v) => v.slice(5)} />
        <YAxis tickFormatter={(v) => fmt(v)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => fmt(v)} labelFormatter={(v) => v} {...chartTooltipStyle} />
        <Area type="monotone" dataKey="tvl" stroke="#34d399" fill="url(#pendleTvlGrad)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TvlByChainChart({ markets }) {
  const data = useMemo(() => {
    const byChain = {};
    markets.forEach((m) => {
      byChain[m.chain] = (byChain[m.chain] || 0) + m.tvlUsd;
    });
    return Object.entries(byChain).map(([name, tvl]) => ({ name, tvl })).sort((a, b) => b.tvl - a.tvl).slice(0, 10);
  }, [markets]);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tickFormatter={(v) => fmt(v, 1)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => fmt(v)} {...chartTooltipStyle} />
        <Bar dataKey="tvl" radius={[0, 3, 3, 0]}>
          {data.map((d) => <Cell key={d.name} fill={getChainColor(d.name)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TvlByCategoryChart({ markets }) {
  const data = useMemo(() => {
    const byCat = {};
    markets.forEach((m) => {
      (m.categories || []).forEach((cat) => {
        byCat[cat] = (byCat[cat] || 0) + m.tvlUsd;
      });
    });
    return Object.entries(byCat).map(([key, tvl]) => ({ name: categoryLabel(key), key, tvl })).sort((a, b) => b.tvl - a.tvl).slice(0, 10);
  }, [markets]);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tickFormatter={(v) => fmt(v, 1)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={70} tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => fmt(v)} {...chartTooltipStyle} />
        <Bar dataKey="tvl" radius={[0, 3, 3, 0]}>
          {data.map((d) => <Cell key={d.name} fill={CATEGORY_COLORS[d.key] || "#6b7a8d"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ImpliedApyDistributionChart({ markets }) {
  const data = useMemo(() => {
    const active = markets.filter((m) => !m.isExpired && m.impliedApy > 0);
    const buckets = [
      { label: "0-3%", min: 0, max: 3 },
      { label: "3-5%", min: 3, max: 5 },
      { label: "5-10%", min: 5, max: 10 },
      { label: "10-15%", min: 10, max: 15 },
      { label: "15-25%", min: 15, max: 25 },
      { label: "25%+", min: 25, max: Infinity },
    ];
    return buckets.map((b) => ({
      label: b.label,
      count: active.filter((m) => m.impliedApy >= b.min && m.impliedApy < b.max).length,
    }));
  }, [markets]);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} />
        <Bar dataKey="count" fill="#34d399" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ExpiryTimelineChart({ markets }) {
  const data = useMemo(() => {
    const active = markets.filter((m) => !m.isExpired && m.expiry);
    const byMonth = {};
    active.forEach((m) => {
      const d = new Date(m.expiry);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!byMonth[key]) byMonth[key] = { month: key, count: 0, tvl: 0 };
      byMonth[key].count += 1;
      byMonth[key].tvl += m.tvlUsd;
    });
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  }, [markets]);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} tickFormatter={(v) => fmt(v, 1)} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v, name) => name === "tvl" ? fmt(v) : v} {...chartTooltipStyle} />
        <Bar dataKey="tvl" fill="#34d399" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SPendleAprChart({ spendle }) {
  const data = useMemo(() => {
    if (!spendle?.historicalData) return [];
    const sorted = [...spendle.historicalData]
      .map((d) => ({
        date: d.date?.slice(0, 10) || "",
        apr: d.apr,
        revenue: d.revenue,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return sorted.slice(-52);
  }, [spendle]);
  const transitionDate = spendle?.transitionDate?.slice(0, 10) || null;
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <defs>
          <linearGradient id="spendleGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: "#6b7a8d", fontSize: 9, fontFamily: mono }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} tickFormatter={(v) => fmtPct(v)} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v, name) => name === "apr" ? fmtPct(v) : fmt(v)} labelFormatter={(v) => v} {...chartTooltipStyle} />
        {transitionDate && (
          <ReferenceLine
            x={transitionDate}
            stroke="rgba(255,255,255,0.35)"
            strokeDasharray="4 4"
            label={{ value: "vePENDLE → sPENDLE", position: "insideTopRight", fill: "#94a3b8", fontSize: 10, fontFamily: mono, offset: 10 }}
          />
        )}
        <Area type="monotone" dataKey="apr" stroke="#34d399" fill="url(#spendleGrad)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Tables ───

const PAGE_SIZE = 20;

function paginate(items, page, perPage = PAGE_SIZE) {
  const start = page * perPage;
  return items.slice(start, start + perPage);
}

function Pagination({ page, totalPages, total, label, onPageChange }) {
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
          borderRadius: 4,
          padding: "4px 10px",
          fontSize: 10,
          fontFamily: mono,
          color: page === 0 ? "#2d3a4a" : "#94a3b8",
          cursor: page === 0 ? "default" : "pointer",
        }}
      >
        ← Prev
      </button>
      <span>{start}–{end} of {total} {label}</span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages - 1}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 4,
          padding: "4px 10px",
          fontSize: 10,
          fontFamily: mono,
          color: page >= totalPages - 1 ? "#2d3a4a" : "#94a3b8",
          cursor: page >= totalPages - 1 ? "default" : "pointer",
        }}
      >
        Next →
      </button>
    </div>
  );
}

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

function ActiveMarketsTable({ markets }) {
  const [sortKey, setSortKey] = useState("tvlUsd");
  const [sortDir, setSortDir] = useState("desc");
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(0);
  const active = useMemo(() => markets.filter((m) => !m.isExpired), [markets]);

  const filterOptions = useMemo(() => {
    const chains = [...new Set(active.map((m) => m.chain))].sort();
    const cats = [...new Set(active.flatMap((m) => m.categories || []))].sort();
    return {
      chain: { label: "Chain", values: chains },
      category: { label: "Category", values: cats },
    };
  }, [active]);

  const filtered = useMemo(() => {
    return active.filter((m) => {
      if (filters.chain && m.chain !== filters.chain) return false;
      if (filters.category && !(m.categories || []).includes(filters.category)) return false;
      return true;
    });
  }, [active, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av, bv;
      if (sortKey === "expiry") {
        av = a.expiry ? new Date(a.expiry).getTime() : 0;
        bv = b.expiry ? new Date(b.expiry).getTime() : 0;
      } else {
        av = a[sortKey] || 0;
        bv = b[sortKey] || 0;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(0);
  };

  const sortIcon = (key) => sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const rows = paginate(sorted, page);

  return (
    <div>
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
              {values.map((v) => <option key={v} value={v}>{categoryLabel(v)}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, marginBottom: 8 }}>
        {filtered.length} of {active.length} markets
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>Name</th>
              <th style={TH}>Chain</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("impliedApy")}>Fixed APY{sortIcon("impliedApy")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("underlyingApy")}>Underlying APY{sortIcon("underlyingApy")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("tvlUsd")}>Liquidity{sortIcon("tvlUsd")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("expiry")}>Expiry{sortIcon("expiry")}</th>
              <th style={TH}>Categories</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr
                key={m.address + i}
                onClick={() => window.open(`https://app.pendle.finance/trade/markets/${m.address}/swap?view=pt&chain=${getChainSlug(m.chain)}`, "_blank")}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <td style={{ ...TD, color: "#cbd5e1", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.name}>{m.name}</td>
                <td style={TD_DIM}>{m.chain}</td>
                <td style={TD_APY}>{fmtPct(m.impliedApy)}</td>
                <td style={{ ...TD_NUM, color: "#94a3b8" }}>{fmtPct(m.underlyingApy)}</td>
                <td style={TD_NUM}>{fmt(m.tvlUsd)}</td>
                <td style={{ ...TD_NUM, color: expiryColor(m.expiry) }}>{daysUntil(m.expiry)}</td>
                <td style={TD_DIM}>
                  {(m.categories || []).slice(0, 3).map((c) => (
                    <span key={c} style={{ display: "inline-block", background: `${CATEGORY_COLORS[c] || "#6b7a8d"}20`, color: CATEGORY_COLORS[c] || "#6b7a8d", padding: "2px 6px", borderRadius: 3, fontSize: 12, fontFamily: mono, marginRight: 4 }}>{categoryLabel(c)}</span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={sorted.length} label="markets" onPageChange={setPage} />
    </div>
  );
}

function ExpiredMarketsTable({ markets }) {
  const [page, setPage] = useState(0);
  const expired = useMemo(() =>
    markets.filter((m) => m.isExpired).sort((a, b) => b.tvlUsd - a.tvlUsd),
    [markets]
  );
  const totalPages = Math.ceil(expired.length / 20);
  const rows = paginate(expired, page);

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>Name</th>
              <th style={TH}>Chain</th>
              <th style={{ ...TH, textAlign: "right" }}>Final APY</th>
              <th style={{ ...TH, textAlign: "right" }}>TVL Remaining</th>
              <th style={{ ...TH, textAlign: "right" }}>Expired</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.address + i}>
                <td style={{ ...TD, color: "#94a3b8", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.name}>{m.name}</td>
                <td style={TD_DIM}>{m.chain}</td>
                <td style={{ ...TD_NUM, color: "#94a3b8" }}>{fmtPct(m.impliedApy)}</td>
                <td style={TD_NUM}>{fmt(m.tvlUsd)}</td>
                <td style={{ ...TD_NUM, color: "#f87171" }}>{new Date(m.expiry).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={expired.length} label="markets" onPageChange={setPage} />
    </div>
  );
}

// ─── Main Page ───

export default function PendlePage() {
  const { markets, spendle, tvlHistory, loading, refreshing, refreshKey, error, lastUpdated, refresh } = usePendleData();
  const [tab, setTab] = useState("active");
  const [assetFilter, setAssetFilter] = useState("All");

  const filteredMarkets = useMemo(() => {
    if (assetFilter === "All") return markets;
    return markets.filter((m) => getAssetClass(m) === assetFilter);
  }, [markets, assetFilter]);

  const activeMarkets = useMemo(() => filteredMarkets.filter((m) => !m.isExpired), [filteredMarkets]);
  const expiredMarkets = useMemo(() => filteredMarkets.filter((m) => m.isExpired), [filteredMarkets]);

  const stats = useMemo(() => {
    const totalTvl = activeMarkets.reduce((s, m) => s + m.tvlUsd, 0);
    const avgImpliedApy = activeMarkets.length
      ? activeMarkets.reduce((s, m) => s + m.impliedApy * m.tvlUsd, 0) / totalTvl
      : 0;
    const chains = new Set(activeMarkets.map((m) => m.chain)).size;
    const now = new Date();
    const withExpiry = activeMarkets.filter((m) => m.expiry);
    const avgMaturityDays = withExpiry.length
      ? Math.round(withExpiry.reduce((s, m) => s + (new Date(m.expiry) - now) / 86400000, 0) / withExpiry.length)
      : 0;
    return { totalTvl, avgImpliedApy, activeCount: activeMarkets.length, expiredCount: expiredMarkets.length, chains, avgMaturityDays };
  }, [activeMarkets, expiredMarkets]);

  if (error) {
    return (
      <div style={{ background: "#0a0e17", color: "#f87171", padding: 40, fontFamily: mono, textAlign: "center", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Failed to load Pendle data</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>{error}</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: "#0a0e17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner message="Pulling data from Pendle API..." />
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
              Pendle
              <span style={{ color: "#34d399", marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: mono, verticalAlign: "middle", background: "rgba(52,211,153,0.07)", padding: "2px 7px", borderRadius: 3, letterSpacing: 1 }}>
                PROTOCOL
              </span>
            </h1>
            <div style={{ fontSize: 12, color: "#4f5e6f", marginTop: 2, fontFamily: mono }}>
              Live data from Pendle API
              {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              background: refreshing ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 11,
              fontFamily: mono,
              color: refreshing ? "#34d399" : "#94a3b8",
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

        {/* Stats hero + grid */}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {/* Hero TVL card */}
          <div style={{
            background: "rgba(52,211,153,0.06)",
            border: "1px solid rgba(52,211,153,0.15)",
            borderRadius: 6,
            padding: "20px 24px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(52,211,153,0.08) 40%, rgba(52,211,153,0.12) 50%, rgba(52,211,153,0.08) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: "#34d399", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Total Value Locked</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 4 }}>{fmt(stats.totalTvl)}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>{stats.activeCount} active PT markets</div>
          </div>
          {/* 2×2 grid */}
          <div style={{ flex: 2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Avg Fixed APY", value: fmtPct(stats.avgImpliedApy), sub: "TVL-weighted" },
              { label: "Chains", value: stats.chains, sub: `${stats.activeCount} active markets` },
              { label: "sPENDLE Staked", value: spendle ? fmt(spendle.totalPendleStaked) : "—", sub: spendle ? `${fmtPct(spendle.lastEpochApr)} APR` : "" },
              { label: "Avg Maturity", value: `${stats.avgMaturityDays}d`, sub: `across ${stats.activeCount} markets` },
            ].map((card) => (
              <div key={card.label} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "10px 16px", position: "relative", overflow: "hidden" }}>
                {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
                <div style={{ fontSize: 11, color: "#5a6678", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>{card.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 2 }}>{card.value}</div>
                <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono }}>{card.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Asset Class Filter */}
      <div style={{ padding: "12px 26px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ASSET_CLASSES.map((cls) => {
          const active = assetFilter === cls;
          const count = cls === "All" ? markets.length : markets.filter((m) => getAssetClass(m) === cls).length;
          return (
            <button
              key={cls}
              onClick={() => setAssetFilter(cls)}
              style={{
                background: active ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.025)",
                border: active ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(255,255,255,0.05)",
                borderRadius: 5,
                padding: "6px 14px",
                fontSize: 10,
                fontFamily: mono,
                color: active ? "#34d399" : "#6b7a8d",
                cursor: "pointer",
                letterSpacing: 0.5,
                fontWeight: active ? 600 : 400,
              }}
            >
              {cls} ({count})
            </button>
          );
        })}
      </div>

      {/* Charts */}
      <div style={{ padding: "20px 26px 0", display: "flex", flexDirection: "column", gap: 16 }}>
        {tvlHistory?.length > 0 && (
          <ModuleCard>
            <SectionHeader title="Protocol TVL" subtitle="Total value locked over time (via DeFiLlama)" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><ProtocolTvlChart tvlHistory={tvlHistory} /></div>
            )}
          </ModuleCard>
        )}

        {spendle && spendle.historicalData?.length > 0 && (
          <ModuleCard>
            <SectionHeader title="sPENDLE APR" subtitle="Historical staking APR over time" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><SPendleAprChart spendle={spendle} /></div>
            )}
          </ModuleCard>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <ModuleCard>
            <SectionHeader title="TVL by Chain" subtitle="Active market TVL per chain" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><TvlByChainChart markets={activeMarkets} /></div>
            )}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="TVL by Category" subtitle="Market TVL grouped by asset category" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><TvlByCategoryChart markets={activeMarkets} /></div>
            )}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="Fixed APY Distribution" subtitle="Number of active PT markets by yield range" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><ImpliedApyDistributionChart markets={filteredMarkets} /></div>
            )}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="Expiry Timeline" subtitle="TVL by market expiry month" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><ExpiryTimelineChart markets={filteredMarkets} /></div>
            )}
          </ModuleCard>
        </div>
      </div>

      {/* Tabs + Tables */}
      <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={TAB_STYLE(tab === "active")} onClick={() => setTab("active")}>Active ({activeMarkets.length})</button>
          <button style={TAB_STYLE(tab === "expired")} onClick={() => setTab("expired")}>Expired ({expiredMarkets.length})</button>
        </div>

        {tab === "active" && (
          <ModuleCard>
            <SectionHeader title="Active PT Markets" subtitle={`${activeMarkets.length} fixed-yield markets`} />
            {refreshing ? <ChartShimmer height={300} /> : (
              <div key={refreshKey}><ActiveMarketsTable markets={filteredMarkets} /></div>
            )}
          </ModuleCard>
        )}
        {tab === "expired" && (
          <ModuleCard>
            <SectionHeader title="Expired PT Markets" subtitle={`${expiredMarkets.length} matured PTs`} />
            {refreshing ? <ChartShimmer height={300} /> : (
              <div key={refreshKey}><ExpiredMarketsTable markets={filteredMarkets} /></div>
            )}
          </ModuleCard>
        )}
      </div>
    </div>
  );
}

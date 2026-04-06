import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { useAaveData } from "../hooks/useAaveData";
import { fmt, fmtPct } from "../utils/format";
import { ASSET_COLORS } from "../utils/constants";
import { SectionHeader, LoadingSpinner, ModuleCard, ChartShimmer } from "../components/Shared";

const mono = "'JetBrains Mono', monospace";
const ACCENT = "#8b5cf6"; // Aave purple

const TAB_STYLE = (active) => ({
  background: active ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.025)",
  border: active ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(255,255,255,0.05)",
  borderRadius: 5,
  padding: "7px 16px",
  fontSize: 10,
  fontFamily: mono,
  color: active ? ACCENT : "#6b7a8d",
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
  contentStyle: { background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#e2e8f0" },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#e2e8f0" },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};

function utilColor(util) {
  if (util == null) return "#94a3b8";
  return util >= 95 ? "#f87171" : util >= 85 ? "#fb923c" : util >= 70 ? "#fbbf24" : "#4ade80";
}

// Asset class classification
const USD_TOKENS = new Set(["USDC", "USDT", "DAI", "PYUSD", "GHO", "FRAX", "LUSD", "crvUSD", "FDUSD", "TUSD", "USDS", "USDM", "sUSDe", "sUSDS", "sDAI", "DOLA", "USD0", "RLUSD", "USDG", "frxUSD"]);
const ETH_TOKENS = new Set(["WETH", "ETH", "wstETH", "stETH", "cbETH", "rETH", "weETH", "ezETH", "mETH", "sfrxETH", "osETH", "swETH", "OETH", "rsETH"]);
const BTC_TOKENS = new Set(["WBTC", "cbBTC", "tBTC", "LBTC", "FBTC", "eBTC", "solvBTC"]);

function getAssetClass(symbol) {
  if (!symbol) return null;
  const s = symbol.toUpperCase();
  if (USD_TOKENS.has(symbol) || s.includes("USD") || s.includes("DAI") || s.includes("GHO")) return "USD";
  if (ETH_TOKENS.has(symbol) || s.includes("ETH")) return "ETH";
  if (BTC_TOKENS.has(symbol) || s.includes("BTC")) return "BTC";
  if (s.includes("EUR")) return "EUR";
  if (s.includes("SOL")) return "SOL";
  return "Other";
}

const ASSET_CLASSES = ["All", "USD", "ETH", "BTC", "Other"];

const CHAIN_COLORS = {
  Ethereum: "#627eea", Arbitrum: "#28a0f0", Base: "#2563eb",
  Optimism: "#ff0420", Polygon: "#8247e5", Avalanche: "#e84142",
  "BNB Chain": "#f0b90b", BSC: "#f0b90b", Gnosis: "#04795b", Metis: "#00dacc",
  Linea: "#60a5fa", Scroll: "#ffdbb0", Sonic: "#60a5fa",
  zkSync: "#8b8dfc", Mantle: "#000000", Plasma: "#9f7aea",
};
function getChainColor(name) { return CHAIN_COLORS[name] || "#6b7a8d"; }

const PAGE_SIZE = 25;

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

// ─── Charts ───

function V3TvlChart({ tvlHistory }) {
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
          <linearGradient id="aaveSupplyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="aaveBorrowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} interval={Math.floor(data.length / 6)} tickFormatter={(v) => v.slice(5)} />
        <YAxis tickFormatter={(v) => fmt(v)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} labelFormatter={(v) => v} formatter={(v, name) => [fmt(v), name === "supply" ? "Supply" : "Borrow"]} />
        <Legend formatter={(value) => value === "supply" ? "Supply" : "Borrow"} wrapperStyle={{ fontSize: 10, fontFamily: mono, color: "#94a3b8" }} />
        <Area type="monotone" dataKey="supply" stroke={ACCENT} fill="url(#aaveSupplyGrad)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="borrow" stroke="#f87171" fill="url(#aaveBorrowGrad)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function V4HistoryChart({ history }) {
  const data = useMemo(() => {
    if (!history?.length) return [];
    return history
      .filter((h) => h.deposits > 0)
      .map((h) => ({
        date: new Date(h.date).toISOString().slice(0, 10),
        deposits: h.deposits,
        borrows: h.borrows,
      }));
  }, [history]);
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <defs>
          <linearGradient id="aaveDepGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="aaveBorGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} interval={Math.floor(data.length / 6)} tickFormatter={(v) => v.slice(5)} />
        <YAxis tickFormatter={(v) => fmt(v)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} labelFormatter={(v) => v} formatter={(v, name) => [fmt(v), name === "deposits" ? "Supply" : "Borrow"]} />
        <Legend formatter={(value) => value === "deposits" ? "Supply" : "Borrow"} wrapperStyle={{ fontSize: 10, fontFamily: mono, color: "#94a3b8" }} />
        <Area type="monotone" dataKey="deposits" stroke={ACCENT} fill="url(#aaveDepGrad)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="borrows" stroke="#f87171" fill="url(#aaveBorGrad)" strokeWidth={1.5} dot={false} />
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
    return Object.entries(byChain).map(([name, tvl]) => ({ name, tvl })).sort((a, b) => b.tvl - a.tvl).slice(0, 12);
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

const SPOKE_SHORT = { "Ethena Ecosystem": "Ethena Eco", "Ethena Correlated": "Ethena Corr" };
function V4SupplyByMarketChart({ reserves }) {
  const data = useMemo(() => {
    const byMarket = {};
    reserves.forEach((r) => {
      const key = r.spoke || "Unknown";
      byMarket[key] = (byMarket[key] || 0) + r.supplyUsd;
    });
    return Object.entries(byMarket).map(([name, supply]) => ({ name: SPOKE_SHORT[name] || name, fullName: name, supply })).sort((a, b) => b.supply - a.supply);
  }, [reserves]);
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tickFormatter={(v) => fmt(v, 1)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={90} tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v, name, props) => [fmt(v), props.payload.fullName || name]} {...chartTooltipStyle} />
        <Bar dataKey="supply" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {data.map((_, i) => <Cell key={i} fill={i === 0 ? ACCENT : `rgba(139,92,246,${0.7 - i * 0.05})`} />)}
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
          {data.map((_, i) => <Cell key={i} fill={i === 0 ? ACCENT : `rgba(139,92,246,${0.6 - i * 0.04})`} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── V4 Hub Summary Cards ───

function V4HubCards({ hubs }) {
  if (!hubs.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(hubs.length, 3)}, 1fr)`, gap: 10 }}>
      {hubs.map((h) => (
        <div key={h.id} style={{ background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)", borderRadius: 6, padding: "14px 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", fontFamily: mono }}>{h.name}</div>
          <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>{h.chain}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>Supply</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", fontFamily: mono }}>{fmt(h.totalSupplied)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>Borrow</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", fontFamily: mono }}>{fmt(h.totalBorrowed)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>Utilization</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: utilColor(h.utilization), fontFamily: mono }}>{fmtPct(h.utilization)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>24h Δ Supply</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: h.suppliedChange >= 0 ? "#4ade80" : "#f87171", fontFamily: mono }}>{h.suppliedChange >= 0 ? "+" : ""}{fmtPct(h.suppliedChange * 100)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── #1: Same-Asset Rate Comparison Across Markets ───

function V4RateComparisonTable({ reserves }) {
  const data = useMemo(() => {
    // Group by symbol, only include assets that appear in 2+ markets
    const bySymbol = {};
    reserves.forEach((r) => {
      if (!bySymbol[r.symbol]) bySymbol[r.symbol] = [];
      bySymbol[r.symbol].push(r);
    });
    return Object.entries(bySymbol)
      .filter(([, arr]) => arr.length >= 2)
      .map(([symbol, arr]) => ({
        symbol,
        markets: arr.sort((a, b) => b.supplyApy - a.supplyApy),
      }))
      .sort((a, b) => {
        const aMax = Math.max(...a.markets.map((m) => m.supplyUsd));
        const bMax = Math.max(...b.markets.map((m) => m.supplyUsd));
        return bMax - aMax;
      });
  }, [reserves]);

  if (!data.length) return <div style={{ color: "#6b7a8d", fontSize: 12, fontFamily: mono, padding: 10 }}>No multi-market assets found</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={TH}>Asset</th>
            <th style={TH}>Market</th>
            <th style={TH}>Hub</th>
            <th style={{ ...TH, textAlign: "right" }}>Supply APY</th>
            <th style={{ ...TH, textAlign: "right" }}>Borrow APY</th>
            <th style={{ ...TH, textAlign: "right" }}>Supply</th>
            <th style={{ ...TH, textAlign: "right" }}>Util%</th>
          </tr>
        </thead>
        <tbody>
          {data.map(({ symbol, markets }) =>
            markets.map((r, j) => (
              <tr
                key={r.id}
                onClick={() => window.open(`https://pro.aave.com/explore/asset/1/${r.address}`, "_blank")}
                style={{
                  background: j === 0 ? "rgba(139,92,246,0.04)" : "transparent",
                  cursor: "pointer",
                  borderTop: j === 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = j === 0 ? "rgba(139,92,246,0.04)" : "transparent"}
              >
                <td style={{ ...TD, color: "#cbd5e1", fontWeight: j === 0 ? 600 : 400 }}>{j === 0 ? symbol : ""}</td>
                <td style={TD_DIM}>{r.spoke}</td>
                <td style={TD_DIM}>{r.hub}</td>
                <td style={TD_APY}>{fmtPct(r.supplyApy)}</td>
                <td style={{ ...TD_NUM, color: "#f87171" }}>{fmtPct(r.borrowApy)}</td>
                <td style={TD_NUM}>{fmt(r.supplyUsd)}</td>
                <td style={{ ...TD_NUM, color: utilColor(r.utilization) }}>{fmtPct(r.utilization)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── #2: Supply vs Borrow by Hub ───

const HUB_COLORS = { Core: "#8b5cf6", Prime: "#a78bfa", Plus: "#c4b5fd" };

function V4SupplyBorrowByHubChart({ hubs }) {
  const data = useMemo(() => {
    return hubs.map((h) => ({
      name: h.name,
      supply: h.totalSupplied,
      borrow: h.totalBorrowed,
    }));
  }, [hubs]);
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => fmt(v, 1)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => fmt(v)} {...chartTooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: mono, color: "#94a3b8" }} />
        <Bar dataKey="supply" name="Supply" fill={ACCENT} radius={[3, 3, 0, 0]} maxBarSize={40} />
        <Bar dataKey="borrow" name="Borrow" fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── #3: V4 vs V3 Rate Comparison ───

function V4vsV3RateTable({ v4Reserves, v3Pools }) {
  const data = useMemo(() => {
    // Build best V3 rate per symbol (across all chains/markets)
    const v3Best = {};
    (v3Pools || []).forEach((p) => {
      const s = p.symbol;
      if (!v3Best[s] || p.supplyApy > v3Best[s].supplyApy) {
        v3Best[s] = { supplyApy: p.supplyApy, borrowApy: p.borrowApy || 0, chain: p.chain, tvl: p.tvlUsd };
      }
    });

    // Build best V4 rate per symbol
    const v4Best = {};
    (v4Reserves || []).forEach((r) => {
      const s = r.symbol;
      if (!v4Best[s] || r.supplyApy > v4Best[s].supplyApy) {
        v4Best[s] = { supplyApy: r.supplyApy, borrowApy: r.borrowApy, spoke: r.spoke, hub: r.hub, supply: r.supplyUsd };
      }
    });

    // Find overlapping assets
    const overlap = Object.keys(v4Best).filter((s) => v3Best[s]);
    return overlap
      .map((symbol) => ({
        symbol,
        v4Supply: v4Best[symbol].supplyApy,
        v4Borrow: v4Best[symbol].borrowApy,
        v4Market: v4Best[symbol].spoke,
        v3Supply: v3Best[symbol].supplyApy,
        v3Borrow: v3Best[symbol].borrowApy || 0,
        v3Chain: v3Best[symbol].chain,
        diff: v4Best[symbol].supplyApy - v3Best[symbol].supplyApy,
      }))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [v4Reserves, v3Pools]);

  if (!data.length) return <div style={{ color: "#6b7a8d", fontSize: 12, fontFamily: mono, padding: 10 }}>No overlapping assets</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={TH}>Asset</th>
            <th style={{ ...TH, textAlign: "right" }}>V4 Supply</th>
            <th style={{ ...TH, textAlign: "right" }}>V3 Supply</th>
            <th style={{ ...TH, textAlign: "right" }}>Δ</th>
            <th style={{ ...TH, textAlign: "right" }}>V4 Borrow</th>
            <th style={{ ...TH, textAlign: "right" }}>V3 Borrow</th>
            <th style={TH}>V4 Market</th>
            <th style={TH}>V3 Chain</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={d.symbol} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)" }}>
              <td style={{ ...TD, color: "#cbd5e1", fontWeight: 500 }}>{d.symbol}</td>
              <td style={TD_APY}>{fmtPct(d.v4Supply)}</td>
              <td style={TD_APY}>{fmtPct(d.v3Supply)}</td>
              <td style={{ ...TD_NUM, color: d.diff > 0 ? "#4ade80" : d.diff < 0 ? "#f87171" : "#94a3b8" }}>
                {d.diff > 0 ? "+" : ""}{fmtPct(d.diff)}
              </td>
              <td style={{ ...TD_NUM, color: "#f87171" }}>{fmtPct(d.v4Borrow)}</td>
              <td style={{ ...TD_NUM, color: "#f87171" }}>{fmtPct(d.v3Borrow)}</td>
              <td style={TD_DIM}>{d.v4Market}</td>
              <td style={TD_DIM}>{d.v3Chain}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── #5: Market Risk Composition ───

function V4MarketComposition({ reserves }) {
  const data = useMemo(() => {
    const bySpoke = {};
    reserves.forEach((r) => {
      const spoke = r.spoke || "Unknown";
      if (!bySpoke[spoke]) bySpoke[spoke] = { assets: [], totalSupply: 0 };
      bySpoke[spoke].assets.push(r);
      bySpoke[spoke].totalSupply += r.supplyUsd;
    });
    return Object.entries(bySpoke)
      .map(([spoke, { assets, totalSupply }]) => {
        const classes = {};
        assets.forEach((a) => {
          const cls = getAssetClass(a.symbol);
          classes[cls] = (classes[cls] || 0) + a.supplyUsd;
        });
        return { spoke, totalSupply, classes, assetCount: assets.length };
      })
      .sort((a, b) => b.totalSupply - a.totalSupply);
  }, [reserves]);

  const CLASS_COLORS = { ...ASSET_COLORS, Other: "#94a3b8" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
      {data.map((d) => (
        <div key={d.spoke} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", fontFamily: mono }}>{d.spoke}</div>
          <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>{d.assetCount} assets · {fmt(d.totalSupply)}</div>
          {/* Composition bar */}
          {d.totalSupply > 0 && (
            <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 8, background: "rgba(255,255,255,0.03)" }}>
              {Object.entries(d.classes).sort((a, b) => b[1] - a[1]).map(([cls, val]) => (
                <div key={cls} style={{ width: `${(val / d.totalSupply) * 100}%`, background: CLASS_COLORS[cls] || "#6b7a8d", minWidth: val > 0 ? 2 : 0 }} title={`${cls}: ${fmt(val)}`} />
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {Object.entries(d.classes).sort((a, b) => b[1] - a[1]).map(([cls]) => (
              <span key={cls} style={{ fontSize: 9, fontFamily: mono, color: CLASS_COLORS[cls] || "#6b7a8d" }}>{cls}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── V4 Reserves Table ───

function V4ReservesTable({ reserves }) {
  const [sortKey, setSortKey] = useState("supplyUsd");
  const [sortDir, setSortDir] = useState("desc");
  const [hubFilter, setHubFilter] = useState("");
  const [spokeFilter, setSpokeFilter] = useState("");
  const [assetFilter, setAssetFilter] = useState("");
  const [page, setPage] = useState(0);

  const hubs = useMemo(() => [...new Set(reserves.map((r) => r.hub))].sort(), [reserves]);
  const spokes = useMemo(() => [...new Set(reserves.map((r) => r.spoke).filter(Boolean))].sort(), [reserves]);

  const filtered = useMemo(() => {
    return reserves.filter((r) => {
      if (hubFilter && r.hub !== hubFilter) return false;
      if (spokeFilter && r.spoke !== spokeFilter) return false;
      if (assetFilter && getAssetClass(r.symbol) !== assetFilter) return false;
      return true;
    });
  }, [reserves, hubFilter, spokeFilter, assetFilter]);

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

  if (!reserves.length) return <div style={{ color: "#6b7a8d", fontSize: 13, fontFamily: mono, padding: 16 }}>No v4 reserves found</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>Hub</span>
        <select style={FILTER_STYLE} value={hubFilter} onChange={(e) => { setHubFilter(e.target.value); setPage(0); }}>
          <option value="">All</option>
          {hubs.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>Market</span>
        <select style={FILTER_STYLE} value={spokeFilter} onChange={(e) => { setSpokeFilter(e.target.value); setPage(0); }}>
          <option value="">All</option>
          {spokes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>Asset</span>
        <select style={FILTER_STYLE} value={assetFilter} onChange={(e) => { setAssetFilter(e.target.value); setPage(0); }}>
          <option value="">All</option>
          {ASSET_CLASSES.filter((a) => a !== "All").map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>{filtered.length} of {reserves.length} reserves</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>Asset</th>
              <th style={TH}>Hub</th>
              <th style={TH}>Market</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("supplyApy")}>Supply APY{sortIcon("supplyApy")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("borrowApy")}>Borrow APY{sortIcon("borrowApy")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("supplyUsd")}>Supply{sortIcon("supplyUsd")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("borrowUsd")}>Borrow{sortIcon("borrowUsd")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("utilization")}>Util%{sortIcon("utilization")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, i) => (
              <tr
                key={r.id || i}
                onClick={() => window.open(`https://pro.aave.com/explore/asset/1/${r.address}`, "_blank")}
                style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)", cursor: "pointer" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)"}
              >
                <td style={{ ...TD, color: "#cbd5e1", fontWeight: 500 }}>{r.symbol}</td>
                <td style={TD_DIM}>{r.hub}</td>
                <td style={TD_DIM}>{r.spoke}</td>
                <td style={TD_APY}>{fmtPct(r.supplyApy)}</td>
                <td style={{ ...TD_NUM, color: "#f87171" }}>{fmtPct(r.borrowApy)}</td>
                <td style={TD_NUM}>{fmt(r.supplyUsd)}</td>
                <td style={TD_NUM}>{fmt(r.borrowUsd)}</td>
                <td style={{ ...TD_NUM, color: utilColor(r.utilization) }}>{fmtPct(r.utilization)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={Math.ceil(sorted.length / PAGE_SIZE)} total={sorted.length} label="reserves" onPageChange={setPage} />
      </div>
    </div>
  );
}

// ─── V3 Pools Table ───

function V3PoolsTable({ pools }) {
  const [sortKey, setSortKey] = useState("tvlUsd");
  const [sortDir, setSortDir] = useState("desc");
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(0);

  const filterOptions = useMemo(() => {
    const chains = [...new Set(pools.map((p) => p.chain))].sort();
    const markets = [...new Set(pools.map((p) => p.market || "core"))].sort();
    return {
      assetClass: { label: "Asset", values: ASSET_CLASSES.filter((a) => a !== "All") },
      chain: { label: "Chain", values: chains },
      market: { label: "Market", values: markets },
    };
  }, [pools]);

  const filtered = useMemo(() => {
    return pools.filter((p) => {
      if (filters.assetClass && getAssetClass(p.symbol) !== filters.assetClass) return false;
      if (filters.chain && p.chain !== filters.chain) return false;
      if (filters.market && (p.market || "core") !== filters.market) return false;
      return true;
    });
  }, [pools, filters]);

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

  if (!pools.length) return <div style={{ color: "#6b7a8d", fontSize: 13, fontFamily: mono, padding: 16 }}>No v3 pools found</div>;

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
        <Pagination page={page} totalPages={Math.ceil(sorted.length / PAGE_SIZE)} total={sorted.length} label="pools" onPageChange={setPage} />
      </div>
    </div>
  );
}

// ─── Main Page ───

export default function AavePage() {
  const { v4, v3, loading, refreshing, refreshKey, error, lastUpdated, refresh } = useAaveData();
  const [tab, setTab] = useState("v3");

  const v3Stats = useMemo(() => {
    const pools = v3.pools || [];
    const totalTvl = pools.reduce((s, p) => s + p.tvlUsd, 0);
    const chains = new Set(pools.map((p) => p.chain)).size;
    return { totalTvl, chains, poolCount: pools.length };
  }, [v3.pools]);

  // Weighted avg supply & borrow rates for key assets (across V3 pools)
  const assetRates = useMemo(() => {
    const pools = v3.pools || [];
    const KEY_ASSETS = ["USDC", "USDT", "WETH"];
    return KEY_ASSETS.map((sym) => {
      const matched = pools.filter((p) => p.symbol.toUpperCase() === sym);
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
  }, [v3.pools]);

  const v4Stats = useMemo(() => {
    const hubs = v4.hubs || [];
    const totalSupplied = hubs.reduce((s, h) => s + h.totalSupplied, 0);
    const totalBorrowed = hubs.reduce((s, h) => s + h.totalBorrowed, 0);
    const reserveCount = (v4.reserves || []).length;
    return { totalSupplied, totalBorrowed, hubCount: hubs.length, reserveCount };
  }, [v4.hubs, v4.reserves]);

  if (error) {
    return (
      <div style={{ background: "#0a0e17", color: "#f87171", padding: 40, fontFamily: mono, textAlign: "center", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Failed to load Aave data</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>{error}</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: "#0a0e17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner message="Pulling data from Aave API..." />
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
              Aave
              <span style={{ color: ACCENT, marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: mono, verticalAlign: "middle", background: "rgba(139,92,246,0.07)", padding: "2px 7px", borderRadius: 3, letterSpacing: 1 }}>
                PROTOCOL
              </span>
            </h1>
            <div style={{ fontSize: 12, color: "#4f5e6f", marginTop: 2, fontFamily: mono }}>
              V3 data from DeFiLlama · V4 data from Aave API
              {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              background: refreshing ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
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

        {/* Row 1: V3 TVL + V4 TVL hero cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <div style={{
            background: "rgba(139,92,246,0.06)",
            border: "1px solid rgba(139,92,246,0.15)",
            borderRadius: 6,
            padding: "20px 24px",
            position: "relative",
            overflow: "hidden",
          }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.08) 40%, rgba(139,92,246,0.12) 50%, rgba(139,92,246,0.08) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: ACCENT, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>V3 Total Value Locked</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 4 }}>{fmt(v3Stats.totalTvl)}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>{v3Stats.chains} chains · {v3Stats.poolCount} pools</div>
          </div>
          <div style={{
            background: "rgba(139,92,246,0.04)",
            border: "1px solid rgba(139,92,246,0.10)",
            borderRadius: 6,
            padding: "20px 24px",
            position: "relative",
            overflow: "hidden",
          }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.06) 40%, rgba(139,92,246,0.08) 50%, rgba(139,92,246,0.06) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: ACCENT, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase", opacity: 0.7 }}>V4 Total Value Locked</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 4 }}>{fmt(v4Stats.totalSupplied)}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>{v4Stats.hubCount} hubs · {v4Stats.reserveCount} reserves</div>
          </div>
        </div>

        {/* Row 2: Weighted avg rates for key assets */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
          {assetRates.map((a) => (
            <div key={a.symbol} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "12px 16px", position: "relative", overflow: "hidden" }}>
              {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", fontFamily: mono }}>{a.symbol}</div>
                <div style={{ fontSize: 9, color: "#4f5e6f", fontFamily: mono }}>{a.poolCount} pools · wt avg</div>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
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
        {(v3.tvlHistory?.length > 0) && (
          <ModuleCard>
            <SectionHeader title="V3 Supply & Borrow" subtitle="Historical supply and borrow across all chains (via DeFiLlama)" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><V3TvlChart tvlHistory={v3.tvlHistory} /></div>
            )}
          </ModuleCard>
        )}

        {(v4.history?.length > 0) && (
          <ModuleCard>
            <SectionHeader title="V4 Supply & Borrow" subtitle="Aave v4 historical data (Ethereum)" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><V4HistoryChart history={v4.history} /></div>
            )}
          </ModuleCard>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <ModuleCard>
            <SectionHeader title="V3 TVL by Chain" subtitle="Pool TVL per chain" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><TvlByChainChart pools={v3.pools || []} /></div>
            )}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="V3 Top Assets" subtitle="Largest pools by TVL" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><TopAssetsByTvlChart pools={v3.pools || []} /></div>
            )}
          </ModuleCard>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <ModuleCard>
            <SectionHeader title="V4 Supply by Market" subtitle="Supply across market instances" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><V4SupplyByMarketChart reserves={v4.reserves || []} /></div>
            )}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="V4 Market Risk Composition" subtitle="Asset class breakdown per market instance" />
            {refreshing ? <ChartShimmer height={120} /> : (
              <div key={refreshKey}><V4MarketComposition reserves={v4.reserves || []} /></div>
            )}
          </ModuleCard>
        </div>

      </div>

      {/* Tabs + Tables */}
      <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={TAB_STYLE(tab === "v3")} onClick={() => setTab("v3")}>V3 Markets ({(v3.pools || []).length})</button>
          <button style={TAB_STYLE(tab === "v4")} onClick={() => setTab("v4")}>V4 Reserves ({(v4.reserves || []).length})</button>
          <button style={TAB_STYLE(tab === "v4rates")} onClick={() => setTab("v4rates")}>V4 Rate Comparison</button>
        </div>

        {tab === "v3" && (
          <ModuleCard>
            <SectionHeader title="Aave V3 Pools" subtitle={`${(v3.pools || []).length} lending pools across ${v3Stats.chains} chains`} />
            {refreshing ? <ChartShimmer height={300} /> : (
              <div key={refreshKey}><V3PoolsTable pools={v3.pools || []} /></div>
            )}
          </ModuleCard>
        )}
        {tab === "v4" && (
          <ModuleCard>
            <SectionHeader title="Aave V4 Reserves" subtitle={`${(v4.reserves || []).length} reserves across ${(v4.hubs || []).length} hubs`} />
            {refreshing ? <ChartShimmer height={300} /> : (
              <div key={refreshKey}><V4ReservesTable reserves={v4.reserves || []} /></div>
            )}
          </ModuleCard>
        )}
        {tab === "v4rates" && (
          <ModuleCard>
            <SectionHeader title="V4 Rate Comparison Across Markets" subtitle="Same asset, different rates by market instance" />
            {refreshing ? <ChartShimmer height={300} /> : (
              <div key={refreshKey}><V4RateComparisonTable reserves={v4.reserves || []} /></div>
            )}
          </ModuleCard>
        )}
      </div>
    </div>
  );
}

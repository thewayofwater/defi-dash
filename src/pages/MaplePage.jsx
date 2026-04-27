import React, { useState, useMemo } from "react";
import {
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, BarChart, Bar, LabelList,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { useMapleData } from "../hooks/useMapleData";
import { fmt, fmtPct } from "../utils/format";
import {
  SectionHeader, LoadingSpinner, ModuleCard, ChartShimmer,
} from "../components/Shared";

const mono = "'JetBrains Mono', monospace";
const ACCENT = "#F57C00"; // Maple orange

const TH = {
  padding: "8px 8px", textAlign: "left", fontSize: 10, color: "#6b7a8d",
  fontFamily: mono, textTransform: "uppercase", letterSpacing: 1,
};
const TH_R = { ...TH, textAlign: "right" };
const TD = {
  padding: "8px 8px", fontSize: 13, fontFamily: mono,
  borderTop: "1px solid rgba(255,255,255,0.03)", color: "#e2e8f0",
};
const TD_R = { ...TD, textAlign: "right" };
const TD_DIM = { ...TD, color: "#94a3b8" };
const TD_APY = { ...TD_R, color: "#22d3ee" };

const chartTooltipStyle = {
  contentStyle: {
    background: "#131926", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#e2e8f0",
  },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#e2e8f0" },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};

const DONUT_COLORS = ["#F57C00", "#22d3ee", "#94a3b8"];
// Collateral asset colors matching brand/logo colors
const ASSET_BRAND_COLORS = {
  BTC: "#F7931A",   // Bitcoin orange
  LBTC: "#48A9A6",  // Lombard teal
  XRP: "#C3C3C3",   // XRP silver/white (lightened for dark bg)
  USDC: "#2775CA",  // USDC blue
  USDT: "#26A17B",  // Tether green
  HYPE: "#50FF7F",  // Hyperliquid neon green
  PYUSD: "#FFD140", // PayPal gold/yellow
  ETH: "#627EEA",   // Ethereum purple-blue
  SOL: "#9945FF",   // Solana purple
  weETH: "#7C3AED", // wrapped eETH (ether.fi purple)
};
// Fallback palette for unmapped assets
const FALLBACK_COLORS = ["#fb923c", "#f472b6", "#fbbf24", "#94a3b8"];
function getAssetColor(name, index) {
  return ASSET_BRAND_COLORS[name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

const LOAN_PAGE_SIZE = 10;

const TABLE_STYLE = { width: "100%", borderCollapse: "collapse" };

function formatDate(unixStr) {
  return new Date(Number(unixStr) * 1000).toISOString().slice(0, 10);
}

// ─── Pagination (matches Aave / Morpho style) ───

function Pagination({ page, totalPages, total, label, onPageChange }) {
  if (total <= LOAN_PAGE_SIZE) return null;
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
            <button key={p} onClick={() => onPageChange(p)} style={{ background: p === page ? "rgba(34,211,238,0.15)" : "none", border: p === page ? "1px solid rgba(34,211,238,0.3)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: p === page ? "#22d3ee" : "#94a3b8", cursor: "pointer", fontWeight: p === page ? 600 : 400, minWidth: 28, textAlign: "center" }}>{p + 1}</button>
          )
        );
      })()}
      <button onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page >= totalPages - 1 ? 0.3 : 1 }}>{"\u203A"}</button>
      <button onClick={() => onPageChange(totalPages - 1)} disabled={page >= totalPages - 1} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page >= totalPages - 1 ? 0.3 : 1 }}>{"\u00BB"}</button>
    </div>
  );
}

// ─── Main Component ───

export default function MaplePage() {
  const { data, loading, refreshing, refreshKey, error, lastUpdated, refresh } = useMapleData();
  const [loanSort, setLoanSort] = useState({ key: "collateralValueUsd", dir: "desc" });
  const [loanPage, setLoanPage] = useState(0);
  const [backingFilters, setBackingFilters] = useState({});

  // Pool ID → name map
  const poolMap = useMemo(() => {
    if (!data?.pools) return {};
    const m = {};
    data.pools.forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [data]);

  // Hero stats
  const totalAssets = useMemo(() => {
    if (!data?.pools) return 0;
    return data.pools.reduce((s, p) => s + (p.totalAssets || 0), 0);
  }, [data]);

  // Total liquidity = sum of non-loan capital allocations (strategies, AMM
  // positions, intercompany, sky, aave). Matches Maple's own "Liquidity"
  // definition: capital actively deployed in liquid, on-demand-recoverable
  // positions — distinct from borrower loans (illiquid) and idle cash
  // sitting in the pool.
  const totalLiquidity = useMemo(() => {
    if (!data?.loans) return 0;
    return data.loans
      .filter((l) => !!l.metaType)
      .reduce((s, l) => s + (l.principal || 0), 0);
  }, [data]);

  // All positions (loans + allocations) with type label
  const allPositions = useMemo(() => {
    if (!data?.loans) return [];
    return data.loans.map((l) => ({
      ...l,
      type: l.metaType || "loan",
      cr: (l.collateralValueUsd > 0 && l.principal > 0)
        ? (l.collateralValueUsd / l.principal) * 100
        : 0,
    }));
  }, [data]);

  // Filter options for Pool Backing table
  const backingFilterOptions = useMemo(() => {
    const pools = [...new Set(allPositions.map((l) => poolMap[l.pool] || l.pool))].sort();
    const collaterals = [...new Set(allPositions.map((l) => l.collateralAsset).filter(Boolean))].sort();
    const borrowers = [...new Set(allPositions.map((l) => l.borrower).filter(Boolean))].sort();
    const types = [...new Set(allPositions.map((l) => l.type))].sort();
    return { pools, collaterals, borrowers, types };
  }, [allPositions, poolMap]);

  // Filtered + sorted positions
  const sortedLoans = useMemo(() => {
    let filtered = allPositions;
    if (backingFilters.pool) filtered = filtered.filter((l) => (poolMap[l.pool] || l.pool) === backingFilters.pool);
    if (backingFilters.collateral) filtered = filtered.filter((l) => l.collateralAsset === backingFilters.collateral);
    if (backingFilters.borrower) filtered = filtered.filter((l) => l.borrower === backingFilters.borrower);
    if (backingFilters.type) filtered = filtered.filter((l) => l.type === backingFilters.type);
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let av = a[loanSort.key] ?? 0;
      let bv = b[loanSort.key] ?? 0;
      if (loanSort.key === "pool") {
        av = poolMap[av] || String(av);
        bv = poolMap[bv] || String(bv);
      }
      if (typeof av === "number" && typeof bv === "number") {
        return loanSort.dir === "asc" ? av - bv : bv - av;
      }
      return loanSort.dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [allPositions, loanSort, poolMap, backingFilters]);

  function handleSort(key) {
    setLoanSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
    setLoanPage(0);
  }
  function sortIndicator(key) {
    if (loanSort.key !== key) return "";
    return loanSort.dir === "asc" ? " \u2191" : " \u2193";
  }

  // AUM / TVL chart data
  const aumChart = useMemo(() => {
    if (!data?.aumHistory) return [];
    return data.aumHistory.map((d) => ({
      date: formatDate(d.date),
      aum: d.aum,
      collateral: d.collateral,
    }));
  }, [data]);

  // APY chart data
  const apyChart = useMemo(() => {
    if (!data?.apyHistory) return [];
    return data.apyHistory.map((d) => ({
      date: formatDate(d.date),
      APY: d.apy,
      "Base APY": d.coreApy,
      "Reward APY": d.boostApy,
      "USD Benchmark": d.benchmarkApy,
    }));
  }, [data]);

  // Shared pool toggle for all breakdown charts
  const [poolView, setPoolView] = useState("overall");

  // Capital deployment donut data — per pool + overall
  const reconByKey = useMemo(() => {
    if (!data?.reconciliation) return {};
    const map = {};
    let totalLoans = 0, totalStrategy = 0, totalIdle = 0;
    Object.entries(data.reconciliation).forEach(([key, val]) => {
      const loans = Math.abs(val.otlRealLoans || 0);
      const strategy = Math.abs(val.strategyAUM || 0);
      const idle = Math.abs(val.idle || 0);
      map[key] = [
        { name: "Borrower Loans", value: loans },
        { name: "Strategy AUM", value: strategy },
        { name: "Idle Cash", value: idle },
      ];
      totalLoans += loans;
      totalStrategy += strategy;
      totalIdle += idle;
    });
    map.overall = [
      { name: "Borrower Loans", value: totalLoans },
      { name: "Strategy AUM", value: totalStrategy },
      { name: "Idle Cash", value: totalIdle },
    ];
    return map;
  }, [data]);
  const activeDeployData = reconByKey[poolView] || [];

  // ─── Collateral aggregation (with pool toggle) ───
  const collateralByKey = useMemo(() => {
    const loans = allPositions.filter((l) => l.type === "loan");
    if (!loans.length) return {};
    const pools = { overall: {} };
    loans.forEach((l) => {
      if (!l.collateralAsset || !l.collateralValueUsd || l.collateralValueUsd <= 0) return;
      const asset = l.collateralAsset;
      // Overall
      pools.overall[asset] = (pools.overall[asset] || 0) + l.collateralValueUsd;
      // Per pool (use pool ID key matching reconciliation keys)
      const poolKey = l.pool === "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b" ? "usdc"
        : l.pool === "0x356b8d89c1e1239cbbb9de4815c39a1474d5ba7d" ? "usdt" : null;
      if (poolKey) {
        if (!pools[poolKey]) pools[poolKey] = {};
        pools[poolKey][asset] = (pools[poolKey][asset] || 0) + l.collateralValueUsd;
      }
    });
    const result = {};
    for (const [key, byAsset] of Object.entries(pools)) {
      result[key] = Object.entries(byAsset)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
    }
    return result;
  }, [allPositions]);
  const activeCollateralData = collateralByKey[poolView] || [];

  // ─── Loan vs Collateral stacked bar data (by collateral asset, with pool toggle) ───
  const loanCollByKey = useMemo(() => {
    const loans = allPositions.filter((l) => l.type === "loan");
    if (!loans.length) return {};
    const pools = { overall: {} };
    loans.forEach((l) => {
      if (!l.collateralAsset) return;
      const asset = l.collateralAsset;
      const poolKey = l.pool === "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b" ? "usdc"
        : l.pool === "0x356b8d89c1e1239cbbb9de4815c39a1474d5ba7d" ? "usdt" : null;
      // Overall
      if (!pools.overall[asset]) pools.overall[asset] = { loan: 0, collateral: 0 };
      pools.overall[asset].loan += l.principal || 0;
      pools.overall[asset].collateral += l.collateralValueUsd || 0;
      // Per pool
      if (poolKey) {
        if (!pools[poolKey]) pools[poolKey] = {};
        if (!pools[poolKey][asset]) pools[poolKey][asset] = { loan: 0, collateral: 0 };
        pools[poolKey][asset].loan += l.principal || 0;
        pools[poolKey][asset].collateral += l.collateralValueUsd || 0;
      }
    });
    const result = {};
    for (const [key, byAsset] of Object.entries(pools)) {
      result[key] = Object.entries(byAsset)
        .map(([name, { loan, collateral }]) => ({
          name, loan, collateral,
          cr: loan > 0 ? ((collateral / loan) * 100).toFixed(0) + "%" : "\u2014",
        }))
        .sort((a, b) => (b.collateral + b.loan) - (a.collateral + a.loan));
    }
    return result;
  }, [allPositions]);
  const activeLoanCollData = loanCollByKey[poolView] || [];

  // ─── #1: Liquidation Waterfall (distance to liquidation per asset, grouped) ───
  const waterfallData = useMemo(() => {
    const loans = allPositions.filter((l) => l.type === "loan" && l.principal > 0 && l.collateralValueUsd > 0);
    const filtered = poolView === "overall" ? loans
      : poolView === "usdc" ? loans.filter((l) => l.pool === "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b")
      : loans.filter((l) => l.pool === "0x356b8d89c1e1239cbbb9de4815c39a1474d5ba7d");
    const byAsset = {};
    filtered.forEach((l) => {
      if (!l.collateralAsset) return;
      if (!byAsset[l.collateralAsset]) byAsset[l.collateralAsset] = { principal: 0, collateral: 0, amount: 0, count: 0 };
      byAsset[l.collateralAsset].principal += l.principal;
      byAsset[l.collateralAsset].collateral += l.collateralValueUsd;
      byAsset[l.collateralAsset].amount += l.collateralAmount || 0;
      byAsset[l.collateralAsset].count += 1;
    });
    return Object.entries(byAsset).map(([asset, { principal, collateral, amount, count }]) => {
      const cr = (collateral / principal) * 100;
      const distToLiq = Math.max(0, ((cr - 100) / cr) * 100);
      const currentPrice = amount > 0 ? collateral / amount : 0;
      const liqPrice = amount > 0 ? principal / amount : 0;
      return {
        label: asset,
        asset,
        principal,
        collateral,
        amount,
        cr,
        distToLiq: Math.round(distToLiq * 10) / 10,
        currentPrice,
        liqPrice,
        count,
      };
    }).sort((a, b) => a.distToLiq - b.distToLiq);
  }, [allPositions, poolView]);

  // ─── #2: Value at Risk (VaR) using live historical volatility ───
  const varData = useMemo(() => {
    const ASSET_VOLATILITY = data?.assetVolatility || {};
    const loans = allPositions.filter((l) => l.type === "loan" && l.principal > 0 && l.collateralValueUsd > 0);
    const filtered = poolView === "overall" ? loans
      : poolView === "usdc" ? loans.filter((l) => l.pool === "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b")
      : loans.filter((l) => l.pool === "0x356b8d89c1e1239cbbb9de4815c39a1474d5ba7d");
    if (!filtered.length) return [];
    // Group by asset
    const byAsset = {};
    filtered.forEach((l) => {
      if (!l.collateralAsset) return;
      if (!byAsset[l.collateralAsset]) byAsset[l.collateralAsset] = { principal: 0, collateral: 0 };
      byAsset[l.collateralAsset].principal += l.principal;
      byAsset[l.collateralAsset].collateral += l.collateralValueUsd;
    });
    const periods = [
      { label: "1 Day", days: 1 },
      { label: "7 Day", days: 7 },
      { label: "30 Day", days: 30 },
    ];
    // For each period, compute VaR at 95% and 99% confidence
    // VaR = collateral × z × σ × √(days/365)
    const z95 = 1.645, z99 = 2.326;
    return Object.entries(byAsset).map(([asset, { principal, collateral }]) => {
      const vol = ASSET_VOLATILITY[asset] || 0.6;
      const result = { asset, vol, principal, collateral };
      periods.forEach(({ label, days }) => {
        const scaledVol = vol * Math.sqrt(days / 365);
        result[`${label} 95%`] = collateral * z95 * scaledVol;
        result[`${label} 99%`] = collateral * z99 * scaledVol;
        // Surplus after VaR loss
        result[`${label} surplus95`] = collateral * (1 - z95 * scaledVol) - principal;
        result[`${label} surplus99`] = collateral * (1 - z99 * scaledVol) - principal;
      });
      return result;
    }).sort((a, b) => b.collateral - a.collateral);
  }, [allPositions, poolView, data]);

  // ─── Per-pool hero stats (driven by poolView toggle) ───
  const heroStats = useMemo(() => {
    const USDC_ID = "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b";
    const USDT_ID = "0x356b8d89c1e1239cbbb9de4815c39a1474d5ba7d";
    const loans = allPositions.filter((l) => l.type === "loan");
    const filterByPool = (items, view) => {
      if (view === "overall") return items;
      const pid = view === "usdc" ? USDC_ID : USDT_ID;
      return items.filter((l) => l.pool === pid);
    };
    const filtered = filterByPool(loans, poolView);
    const collValue = filtered.reduce((s, l) => s + (l.collateralValueUsd || 0), 0);
    const loanValue = filtered.reduce((s, l) => s + (l.principal || 0), 0);
    const loanCount = filtered.length;
    const cr = loanValue > 0 ? (collValue / loanValue) * 100 : 0;

    // Liquidity = sum of non-loan capital allocations (Maple's own definition).
    // For pool-specific views, filter the allocations to that pool.
    const allLoans = data?.loans || [];
    const allocations = allLoans.filter((l) => !!l.metaType);
    const liquidity = poolView === "overall"
      ? totalLiquidity
      : allocations
          .filter((l) => l.pool === (poolView === "usdc" ? USDC_ID : USDT_ID))
          .reduce((s, l) => s + (l.principal || 0), 0);

    // Idle cash = uncommitted USDC/USDT in the pool contract (from API reconciliation).
    const recon = data?.reconciliation || {};
    const idle = poolView === "overall"
      ? Object.values(recon).reduce((s, r) => s + (r.idle || 0), 0)
      : (recon[poolView]?.idle || 0);

    let poolAssets;
    if (poolView === "overall") {
      poolAssets = totalAssets;
    } else {
      const pool = (data?.pools || []).find((p) =>
        p.id === (poolView === "usdc" ? USDC_ID : USDT_ID)
      );
      poolAssets = pool?.totalAssets || 0;
    }
    const aum = collValue + loanValue + liquidity;

    return { aum, liquidity, idle, collValue, loanValue, loanCount, cr, poolAssets };
  }, [allPositions, poolView, totalAssets, totalLiquidity, data]);

  // ─── Loading / Error states (matching other protocol pages) ───

  if (error) {
    return (
      <div style={{ background: "#0a0e17", color: "#f87171", padding: 40, fontFamily: mono, textAlign: "center", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Failed to load Maple data</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>{error}</div>
          <button
            onClick={refresh}
            style={{ marginTop: 12, background: ACCENT, border: "none", borderRadius: 5, padding: "8px 20px", color: "#0a0e17", fontFamily: mono, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: "#0a0e17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner message="Pulling data from Maple API..." />
      </div>
    );
  }

  const loanTotalPages = Math.ceil(sortedLoans.length / LOAN_PAGE_SIZE);

  return (
    <div style={{ background: "#0a0e17", color: "#e2e8f0", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .benchmark-legend:hover .benchmark-tip { display: block !important; }
      `}</style>

      {/* ────── Header ────── */}
      <div style={{ padding: "20px 26px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
              Maple Finance
              <span style={{
                color: ACCENT, marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: mono,
                verticalAlign: "middle", background: "rgba(245,124,0,0.07)",
                padding: "2px 7px", borderRadius: 3, letterSpacing: 1,
              }}>
                PROTOCOL
              </span>
            </h1>
            <div style={{ fontSize: 12, color: "#4f5e6f", marginTop: 2, fontFamily: mono }}>
              Live data from Maple GraphQL API + Ethereum RPC
              {lastUpdated && ` \u00B7 Updated ${lastUpdated.toLocaleTimeString()}`}
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              background: refreshing ? "rgba(245,124,0,0.15)" : "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6, padding: "7px 14px", fontSize: 11, fontFamily: mono,
              color: refreshing ? ACCENT : "#94a3b8",
              cursor: refreshing ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.2s", letterSpacing: 0.5,
            }}
          >
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none", fontSize: 13 }}>&#x21bb;</span>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Row 1: Two big hero cards — AUM + Collateral Ratio */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <div style={{
            background: "rgba(245,124,0,0.06)",
            border: "1px solid rgba(245,124,0,0.15)",
            borderRadius: 6, padding: "20px 24px",
            position: "relative", overflow: "hidden",
          }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(245,124,0,0.08) 40%, rgba(245,124,0,0.12) 50%, rgba(245,124,0,0.08) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: ACCENT, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Total AUM</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 4 }}>{fmt(heroStats.aum, 2)}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>collateral + loans + liquidity</div>
          </div>
          <div style={{
            background: "rgba(245,124,0,0.04)",
            border: "1px solid rgba(245,124,0,0.10)",
            borderRadius: 6, padding: "20px 24px",
            position: "relative", overflow: "hidden",
          }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(245,124,0,0.06) 40%, rgba(245,124,0,0.08) 50%, rgba(245,124,0,0.06) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: ACCENT, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase", opacity: 0.7 }}>Collateral Ratio</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: heroStats.cr >= 150 ? "#4ade80" : heroStats.cr >= 120 ? "#fbbf24" : "#f87171", fontFamily: mono, marginTop: 4 }}>{fmtPct(heroStats.cr)}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>{heroStats.cr >= 150 ? "healthy" : heroStats.cr >= 120 ? "watch" : "at risk"}</div>
          </div>
        </div>

        {/* Row 2: Four compact stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 10 }}>
          {[
            { label: "Collateral Value", value: fmt(heroStats.collValue, 2) },
            { label: "Outstanding Loans", value: fmt(heroStats.loanValue, 2), sub: `across ${heroStats.loanCount} active loans` },
            { label: "Liquidity", value: fmt(heroStats.liquidity, 2) },
            { label: "Idle Cash", value: fmt(heroStats.idle, 2) },
          ].map((card) => (
            <div key={card.label} style={{
              background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 6, padding: "10px 16px", position: "relative", overflow: "hidden",
            }}>
              {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
              <div style={{ fontSize: 11, color: "#5a6678", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>{card.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 2 }}>{card.value}</div>
              {card.sub && <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>{card.sub}</div>}
            </div>
          ))}
        </div>

        {/* Row 3: Pool cards */}
        <div style={{ display: "grid", gridTemplateColumns: poolView === "overall" ? "1fr 1fr" : "1fr", gap: 10, marginTop: 10 }}>
          {poolView === "overall" ? (
            (data.pools || []).map((pool) => (
              <div key={pool.id} style={{
                background: "rgba(245,124,0,0.04)", border: "1px solid rgba(245,124,0,0.12)",
                borderRadius: 6, padding: "12px 16px", position: "relative", overflow: "hidden",
              }}>
                {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(245,124,0,0.06) 40%, rgba(245,124,0,0.08) 50%, rgba(245,124,0,0.06) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT, fontFamily: mono }}>{pool.name}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", fontFamily: mono }}>{fmt(pool.totalAssets, 2)}</div>
                </div>
              </div>
            ))
          ) : (
            (() => {
              const USDC_ID = "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b";
              const USDT_ID = "0x356b8d89c1e1239cbbb9de4815c39a1474d5ba7d";
              const pool = (data.pools || []).find((p) => p.id === (poolView === "usdc" ? USDC_ID : USDT_ID));
              if (!pool) return null;
              return (
                <div style={{
                  background: "rgba(245,124,0,0.04)", border: "1px solid rgba(245,124,0,0.12)",
                  borderRadius: 6, padding: "14px 16px", position: "relative", overflow: "hidden",
                }}>
                  {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(245,124,0,0.06) 40%, rgba(245,124,0,0.08) 50%, rgba(245,124,0,0.06) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
                  <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT, fontFamily: mono, marginBottom: 8 }}>{pool.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Assets</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", fontFamily: mono }}>{fmt(pool.totalAssets, 2)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.5 }}>NAV / Share</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", fontFamily: mono }}>{pool.nav != null ? pool.nav.toFixed(4) : "\u2014"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Shares</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", fontFamily: mono }}>{pool.shares != null ? pool.shares.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "\u2014"}</div>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* ────── Pool toggle + Charts ────── */}
      <div style={{ padding: "12px 26px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { key: "overall", label: "Overall" },
          { key: "usdc", label: "Syrup USDC" },
          { key: "usdt", label: "Syrup USDT" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPoolView(key)}
            style={{
              background: poolView === key ? "rgba(245,124,0,0.12)" : "rgba(255,255,255,0.025)",
              border: poolView === key ? "1px solid rgba(245,124,0,0.3)" : "1px solid rgba(255,255,255,0.05)",
              borderRadius: 5, padding: "6px 14px", fontSize: 10, fontFamily: mono,
              color: poolView === key ? ACCENT : "#6b7a8d",
              cursor: "pointer", letterSpacing: 0.5, fontWeight: poolView === key ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ padding: "12px 26px 0", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* TVL / AUM History — full width */}
        {aumChart.length > 0 && (
          <ModuleCard>
            <SectionHeader title="AUM & Collateral" subtitle="Historical total AUM and collateral posted by borrowers" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={aumChart} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="mapleAumGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="mapleCollGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E65100" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#E65100" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
                      axisLine={false} tickLine={false}
                      interval={Math.floor(aumChart.length / 6)}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis
                      tickFormatter={(v) => fmt(v)}
                      tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
                      axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      {...chartTooltipStyle}
                      formatter={(v, name) => [fmt(v, 2), name === "aum" ? "Total AUM" : "Collateral"]}
                      labelFormatter={(v) => v}
                    />
                    <Legend
                      formatter={(value) => value === "aum" ? "Total AUM" : "Collateral"}
                      wrapperStyle={{ fontSize: 10, fontFamily: mono, color: "#94a3b8" }}
                    />
                    <Area type="monotone" dataKey="aum" stroke={ACCENT} fill="url(#mapleAumGrad)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="collateral" stroke="#E65100" fill="url(#mapleCollGrad)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </ModuleCard>
        )}

        {/* APY History — full width */}
        <ModuleCard>
          <SectionHeader title="APY History" subtitle="Historical yield performance across Syrup pools" />
          {refreshing ? <ChartShimmer height={280} /> : apyChart.length > 0 ? (
            <div key={refreshKey}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={apyChart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.floor(apyChart.length / 6)}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    {...chartTooltipStyle}
                    formatter={(v, name) => [`${Number(v).toFixed(2)}%`, name]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10, fontFamily: mono, color: "#94a3b8", overflow: "visible" }}
                    content={({ payload }) => (
                      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 6 }}>
                        {(payload || []).filter((e) => e.type !== "none").map((entry) => {
                          const isBenchmark = entry.value === "USD Benchmark";
                          return (
                            <div
                              key={entry.value}
                              className={isBenchmark ? "benchmark-legend" : undefined}
                              style={{ display: "flex", alignItems: "center", gap: 5, position: "relative" }}
                            >
                              <div style={{
                                width: 12, height: 2, background: entry.color, borderRadius: 1,
                              }} />
                              <span style={{ fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: isBenchmark ? "help" : "default" }}>
                                {entry.value}{isBenchmark ? " \u24D8" : ""}
                              </span>
                              {isBenchmark && (
                                <div className="benchmark-tip" style={{
                                  display: "none", position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                                  transform: "translateX(-50%)", width: 280, padding: "8px 10px",
                                  background: "#131926", border: "1px solid rgba(255,255,255,0.1)",
                                  borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#cbd5e1",
                                  lineHeight: 1.5, zIndex: 10, pointerEvents: "none",
                                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                                }}>
                                  Weighted average lending APY across Aave v3 USDT, Aave v3 USDC, MakerDAO sDAI, and Compound v3 USDC on Ethereum mainnet, weighted by TVL.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  />
                  <Line type="monotone" dataKey="APY" stroke={ACCENT} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Base APY" stroke="#22d3ee" strokeWidth={0} dot={false} legendType="none" activeDot={false} />
                  <Line type="monotone" dataKey="Reward APY" stroke="#a78bfa" strokeWidth={0} dot={false} legendType="none" activeDot={false} />
                  <Line type="monotone" dataKey="USD Benchmark" stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartShimmer height={280} />
          )}
        </ModuleCard>

        {/* 2-column grid: Collateral Composition + Loan vs Collateral */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Collateral Composition — pie chart */}
          <ModuleCard>
            <SectionHeader title="Collateral Composition" subtitle="Collateral value breakdown by asset" />
            {refreshing ? <ChartShimmer height={280} /> : activeCollateralData.length > 0 ? (
              <div key={`${refreshKey}-${poolView}`}>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={activeCollateralData}
                      cx="50%" cy="50%"
                      innerRadius={60} outerRadius={90}
                      dataKey="value" paddingAngle={2}
                      stroke="none"
                    >
                      {activeCollateralData.map((_, i) => (
                        <Cell key={i} fill={getAssetColor(activeCollateralData[i]?.name, i)} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...chartTooltipStyle}
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const { name, value } = payload[0].payload;
                        const total = activeCollateralData.reduce((s, d) => s + d.value, 0);
                        const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                        return (
                          <div style={{ ...chartTooltipStyle.contentStyle, padding: "8px 12px" }}>
                            <div style={{ color: "#e2e8f0", marginBottom: 2 }}>{name}</div>
                            <div>{fmt(value)} ({pct}%)</div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
                  {activeCollateralData.map((entry, i) => (
                    <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: getAssetColor(entry.name, i) }} />
                      <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: mono }}>
                        {entry.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7a8d", fontSize: 12, fontFamily: mono }}>
                No collateral data available
              </div>
            )}
          </ModuleCard>

          {/* Loan vs Collateral stacked bar chart */}
          <ModuleCard>
            <SectionHeader title="Loan vs Collateral" subtitle="Loan principal and collateral value by asset" />
            {refreshing ? <ChartShimmer height={280} /> : activeLoanCollData.length > 0 ? (
              <div key={`${refreshKey}-${poolView}`}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={activeLoanCollData} margin={{ left: 10, right: 20, top: 20, bottom: 5 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => fmt(v)}
                      tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
                      axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      {...chartTooltipStyle}
                      content={({ payload, label }) => {
                        if (!payload?.length) return null;
                        const coll = payload.find(p => p.dataKey === "collateral");
                        const loan = payload.find(p => p.dataKey === "loan");
                        return (
                          <div style={{ ...chartTooltipStyle.contentStyle, padding: "8px 12px" }}>
                            <div style={{ color: "#e2e8f0", marginBottom: 4, fontWeight: 600 }}>{label}</div>
                            {coll && <div style={{ color: "#E65100" }}>Collateral Value: {fmt(coll.value, 2)}</div>}
                            {loan && <div style={{ color: "#60a5fa" }}>Loan Principal: {fmt(loan.value, 2)}</div>}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      payload={[
                        { value: "Collateral Value", type: "square", color: "#E65100" },
                        { value: "Loan Principal", type: "square", color: "#60a5fa" },
                      ]}
                      wrapperStyle={{ fontSize: 10, fontFamily: mono, color: "#94a3b8" }}
                    />
                    <Bar dataKey="loan" stackId="a" fill="#60a5fa" radius={[0, 0, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="collateral" stackId="a" fill="#E65100" radius={[3, 3, 0, 0]} maxBarSize={40}>
                      <LabelList
                        dataKey="cr"
                        position="top"
                        content={({ x, y, width, value }) => {
                          if (!value || value === "\u2014") return null;
                          const num = parseFloat(value);
                          const color = num >= 150 ? "#4ade80" : num >= 120 ? "#fbbf24" : "#f87171";
                          return (
                            <text x={x + width / 2} y={y - 6} textAnchor="middle" fill={color} fontSize={10} fontFamily={mono} fontWeight={600}>
                              {value}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7a8d", fontSize: 12, fontFamily: mono }}>
                No loan data available
              </div>
            )}
          </ModuleCard>
        </div>

        {/* Distance to Liquidation — with liquidation prices */}
        {waterfallData.length > 0 && (
          <ModuleCard>
            <SectionHeader title="Distance to Liquidation" subtitle="Price drop required per collateral asset to reach 100% CR" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={`${refreshKey}-waterfall-${poolView}`}>
                <ResponsiveContainer width="100%" height={Math.max(240, waterfallData.length * 50 + 40)}>
                  <BarChart data={waterfallData} layout="vertical" margin={{ left: 10, right: 90, top: 5, bottom: 5 }}>
                    <XAxis
                      type="number"
                      tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
                      axisLine={false} tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                      domain={[0, "auto"]}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={60}
                      tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }}
                      axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      {...chartTooltipStyle}
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        const fmtPrice = (p) => p >= 1000 ? `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : p >= 1 ? `$${p.toFixed(2)}` : `$${p.toFixed(4)}`;
                        return (
                          <div style={{ ...chartTooltipStyle.contentStyle, padding: "8px 12px" }}>
                            <div style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>{d.asset} ({d.count} loans)</div>
                            <div>Principal: {fmt(d.principal, 2)}</div>
                            <div>Collateral: {fmt(d.collateral, 2)}</div>
                            <div>CR: {d.cr.toFixed(1)}%</div>
                            <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 4 }}>
                              <div>Current Price: {fmtPrice(d.currentPrice)}</div>
                              <div style={{ color: "#f87171" }}>Liquidation Price: {fmtPrice(d.liqPrice)}</div>
                              <div style={{ color: d.distToLiq < 15 ? "#f87171" : d.distToLiq < 25 ? "#fbbf24" : "#4ade80" }}>
                                {d.distToLiq}% drop to liquidation
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="distToLiq" radius={[0, 3, 3, 0]} maxBarSize={24}>
                      <LabelList
                        content={({ x, y, width, height, value, index }) => {
                          const d = waterfallData[index];
                          if (!d) return null;
                          const fmtPrice = (p) => p >= 1000 ? `$${(p/1000).toFixed(1)}K` : p >= 1 ? `$${p.toFixed(2)}` : `$${p.toFixed(4)}`;
                          return (
                            <g>
                              <text x={x + width + 6} y={y + height / 2 - 5} fill="#e2e8f0" fontSize={10} fontFamily={mono} fontWeight={600}>
                                {d.distToLiq}%
                              </text>
                              <text x={x + width + 6} y={y + height / 2 + 7} fill="#f87171" fontSize={9} fontFamily={mono}>
                                liq {fmtPrice(d.liqPrice)}
                              </text>
                            </g>
                          );
                        }}
                      />
                      {waterfallData.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.distToLiq < 15 ? "#f87171" : d.distToLiq < 25 ? "#fbbf24" : "#4ade80"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ModuleCard>
        )}

        {/* Value at Risk (VaR) table */}
        {varData.length > 0 && (
          <ModuleCard>
            <SectionHeader title="Value at Risk" subtitle="Estimated max collateral loss at 95% and 99% confidence using 90-day realized volatility" />
            {refreshing ? <ChartShimmer height={200} /> : (
              <div key={`${refreshKey}-var-${poolView}`} style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH}>Asset</th>
                      <th style={TH_R}>Ann. Vol</th>
                      <th style={TH_R}>Collateral</th>
                      <th style={TH_R}>Loans</th>
                      <th style={TH_R}>1D VaR 95%</th>
                      <th style={TH_R}>1D VaR 99%</th>
                      <th style={TH_R}>7D VaR 95%</th>
                      <th style={TH_R}>7D VaR 99%</th>
                      <th style={TH_R}>30D VaR 95%</th>
                      <th style={TH_R}>30D VaR 99%</th>
                      <th style={TH_R}>30D Surplus 95%</th>
                      <th style={TH_R}>30D Surplus 99%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {varData.map((d) => {
                      const surplus95 = d["30 Day surplus95"];
                      const surplus99 = d["30 Day surplus99"];
                      const coll = d.collateral;
                      const principal = d.principal;
                      const varColor = (v) => {
                        if (!coll || coll <= 0) return "#94a3b8";
                        const remaining = coll - v;
                        if (remaining < principal) return "#f87171"; // underwater
                        if (remaining < principal * 1.2) return "#fbbf24"; // thin buffer (<20%)
                        return "#4ade80"; // safe
                      };
                      return (
                        <tr key={d.asset}>
                          <td style={{ ...TD, color: getAssetColor(d.asset, 0), fontWeight: 600 }}>{d.asset}</td>
                          <td style={{ ...TD_R, color: d.vol > 0.8 ? "#f87171" : d.vol > 0.5 ? "#fbbf24" : "#4ade80" }}>{(d.vol * 100).toFixed(1)}%</td>
                          <td style={TD_R}>{fmt(d.collateral, 2)}</td>
                          <td style={TD_R}>{fmt(d.principal, 2)}</td>
                          <td style={{ ...TD_R, color: varColor(d["1 Day 95%"]) }}>{fmt(d["1 Day 95%"], 2)}</td>
                          <td style={{ ...TD_R, color: varColor(d["1 Day 99%"]) }}>{fmt(d["1 Day 99%"], 2)}</td>
                          <td style={{ ...TD_R, color: varColor(d["7 Day 95%"]) }}>{fmt(d["7 Day 95%"], 2)}</td>
                          <td style={{ ...TD_R, color: varColor(d["7 Day 99%"]) }}>{fmt(d["7 Day 99%"], 2)}</td>
                          <td style={{ ...TD_R, color: varColor(d["30 Day 95%"]) }}>{fmt(d["30 Day 95%"], 2)}</td>
                          <td style={{ ...TD_R, color: varColor(d["30 Day 99%"]) }}>{fmt(d["30 Day 99%"], 2)}</td>
                          <td style={{ ...TD_R, color: surplus95 >= 0 ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                            {surplus95 >= 0 ? "+" : ""}{fmt(surplus95, 2)}
                          </td>
                          <td style={{ ...TD_R, color: surplus99 >= 0 ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                            {surplus99 >= 0 ? "+" : ""}{fmt(surplus99, 2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ModuleCard>
        )}
      </div>

      {/* ────── Tables ────── */}
      <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Active Loans */}
        <ModuleCard>
          <SectionHeader title="Pool Backing" subtitle={`${allPositions.length} positions — loans, strategies, AMM, DeFi, and intercompany`} />
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {[
              { key: "pool", label: "Pool", values: backingFilterOptions.pools },
              { key: "collateral", label: "Collateral", values: backingFilterOptions.collaterals },
              { key: "type", label: "Type", values: backingFilterOptions.types },
              { key: "borrower", label: "Borrower", values: backingFilterOptions.borrowers },
            ].map(({ key, label, values }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>{label}</span>
                <select
                  style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 4, padding: "5px 8px", fontSize: 12, fontFamily: mono,
                    color: "#cbd5e1", outline: "none", minWidth: 80,
                  }}
                  value={backingFilters[key] || ""}
                  onChange={(e) => {
                    setBackingFilters((f) => ({ ...f, [key]: e.target.value }));
                    setLoanPage(0);
                  }}
                >
                  <option value="">All</option>
                  {values.map((v) => (
                    <option key={v} value={v}>{key === "borrower" ? v.slice(0, 10) + "..." : v}</option>
                  ))}
                </select>
              </div>
            ))}
            <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>
              {sortedLoans.length} of {allPositions.length}
            </span>
          </div>
          {refreshing ? <ChartShimmer height={300} /> : (
            <div key={refreshKey} style={{ overflowX: "auto" }}>
              <table style={TABLE_STYLE}>
                <thead>
                  <tr>
                    <th style={{ ...TH, cursor: "pointer" }} onClick={() => handleSort("pool")}>
                      Pool{sortIndicator("pool")}
                    </th>
                    <th style={{ ...TH_R, cursor: "pointer" }} onClick={() => handleSort("principal")}>
                      Principal{sortIndicator("principal")}
                    </th>
                    <th style={{ ...TH_R, cursor: "pointer" }} onClick={() => handleSort("interestRate")}>
                      Rate{sortIndicator("interestRate")}
                    </th>
                    <th style={{ ...TH_R, cursor: "pointer" }} onClick={() => handleSort("paymentInterval")}>
                      Interval{sortIndicator("paymentInterval")}
                    </th>
                    <th style={{ ...TH, cursor: "pointer" }} onClick={() => handleSort("collateralAsset")}>
                      Collateral{sortIndicator("collateralAsset")}
                    </th>
                    <th style={{ ...TH_R, cursor: "pointer" }} onClick={() => handleSort("collateralAmount")}>
                      Collateral Amount{sortIndicator("collateralAmount")}
                    </th>
                    <th style={{ ...TH_R, cursor: "pointer" }} onClick={() => handleSort("collateralValueUsd")}>
                      Collateral Value{sortIndicator("collateralValueUsd")}
                    </th>
                    <th style={{ ...TH_R, cursor: "pointer" }} onClick={() => handleSort("cr")}>
                      CR{sortIndicator("cr")}
                    </th>
                    <th style={{ ...TH, cursor: "pointer" }} onClick={() => handleSort("borrower")}>
                      Borrower{sortIndicator("borrower")}
                    </th>
                    <th style={{ ...TH, cursor: "pointer" }} onClick={() => handleSort("type")}>
                      Type{sortIndicator("type")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLoans
                    .slice(loanPage * LOAN_PAGE_SIZE, (loanPage + 1) * LOAN_PAGE_SIZE)
                    .map((loan) => (
                      <tr key={loan.id}>
                        <td style={TD}>{poolMap[loan.pool] || loan.pool}</td>
                        <td style={TD_R}>{fmt(loan.principal)}</td>
                        <td style={TD_APY}>
                          {loan.interestRate != null ? fmtPct(loan.interestRate) : "\u2014"}
                        </td>
                        <td style={TD_R}>{loan.paymentInterval ? `${loan.paymentInterval}d` : "\u2014"}</td>
                        <td style={TD_DIM}>{loan.collateralAsset || "\u2014"}</td>
                        <td style={TD_R}>
                          {loan.collateralAmount != null && loan.collateralAmount > 0
                            ? loan.collateralAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })
                            : "\u2014"}
                        </td>
                        <td style={TD_R}>
                          {loan.collateralValueUsd != null && loan.collateralValueUsd > 0
                            ? fmt(loan.collateralValueUsd)
                            : "\u2014"}
                        </td>
                        <td style={{ ...TD_R, color: loan.type !== "loan" ? "#94a3b8" : loan.cr >= 150 ? "#4ade80" : loan.cr >= 120 ? "#fbbf24" : loan.cr > 0 ? "#f87171" : "#94a3b8" }}>
                          {loan.cr > 0 ? fmtPct(loan.cr) : "\u2014"}
                        </td>
                        <td style={{ ...TD_DIM, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={loan.borrower || ""}>
                          {loan.borrower || "\u2014"}
                        </td>
                        <td style={TD}>{(() => {
                          const typeColors = {
                            loan: { bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.3)", color: "#4ade80" },
                            strategy: { bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.3)", color: "#60a5fa" },
                            sky: { bg: "rgba(34,211,238,0.12)", border: "rgba(34,211,238,0.3)", color: "#22d3ee" },
                            aave: { bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.3)", color: "#a78bfa" },
                            amm: { bg: "rgba(245,124,0,0.12)", border: "rgba(245,124,0,0.3)", color: ACCENT },
                            defi: { bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.3)", color: "#a78bfa" },
                            intercompany: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)", color: "#94a3b8" },
                          };
                          const tc = typeColors[loan.type] || typeColors.loan;
                          return (
                            <span style={{
                              background: tc.bg, border: `1px solid ${tc.border}`,
                              borderRadius: 3, padding: "2px 8px", fontSize: 10, fontFamily: mono,
                              color: tc.color, textTransform: "uppercase", letterSpacing: 0.8,
                            }}>
                              {loan.type}
                            </span>
                          );
                        })()}</td>
                      </tr>
                    ))}
                  {sortedLoans.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ ...TD, textAlign: "center", color: "#6b7a8d" }}>
                        No positions
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <Pagination
                page={loanPage}
                totalPages={loanTotalPages}
                total={sortedLoans.length}
                label="loans"
                onPageChange={setLoanPage}
              />
            </div>
          )}
        </ModuleCard>


      </div>
    </div>
  );
}

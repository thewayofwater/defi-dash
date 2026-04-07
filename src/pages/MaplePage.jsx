import React, { useState, useMemo } from "react";
import {
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { useMapleData } from "../hooks/useMapleData";
import { fmt, fmtPct } from "../utils/format";
import {
  SectionHeader, LoadingSpinner, ModuleCard, StatCard, ChartShimmer,
} from "../components/Shared";

const mono = "'JetBrains Mono', monospace";
const ACCENT = "#F57C00"; // Maple orange

const TH = {
  padding: "8px 10px", textAlign: "left", fontSize: 10, color: "#6b7a8d",
  fontFamily: mono, textTransform: "uppercase", letterSpacing: 1,
};
const TH_R = { ...TH, textAlign: "right" };
const TD = {
  padding: "8px 10px", fontSize: 13, fontFamily: mono,
  borderTop: "1px solid rgba(255,255,255,0.03)", color: "#e2e8f0",
};
const TD_R = { ...TD, textAlign: "right" };
const TD_DIM = { ...TD, color: "#94a3b8" };

const chartTooltipStyle = {
  contentStyle: {
    background: "#131926", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#e2e8f0",
  },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#e2e8f0" },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};

const DONUT_COLORS = ["#F57C00", "#22d3ee", "#f87171"];

function truncAddr(addr) {
  if (!addr) return "\u2014";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function formatDate(unixStr) {
  const d = new Date(Number(unixStr) * 1000);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

export default function MaplePage() {
  const { data, loading, error, refresh } = useMapleData();
  const [loanSort, setLoanSort] = useState({ key: "principal", dir: "desc" });

  // Build pool ID -> name map
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

  const activeLoans = useMemo(() => {
    if (!data?.loans) return [];
    return data.loans.filter(
      (l) => l.metaType !== "strategy" && l.metaType !== "intercompany"
    );
  }, [data]);

  // Sorted loans
  const sortedLoans = useMemo(() => {
    const sorted = [...activeLoans];
    sorted.sort((a, b) => {
      const av = a[loanSort.key] ?? 0;
      const bv = b[loanSort.key] ?? 0;
      if (typeof av === "number" && typeof bv === "number") {
        return loanSort.dir === "asc" ? av - bv : bv - av;
      }
      const as = String(av), bs = String(bv);
      return loanSort.dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return sorted;
  }, [activeLoans, loanSort]);

  function handleSort(key) {
    setLoanSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }

  function sortIndicator(key) {
    if (loanSort.key !== key) return "";
    return loanSort.dir === "asc" ? " \u25B2" : " \u25BC";
  }

  // APY chart data
  const apyChart = useMemo(() => {
    if (!data?.apyHistory) return [];
    return data.apyHistory.map((d) => ({
      date: formatDate(d.date),
      apy: d.apy,
      coreApy: d.coreApy,
      boostApy: d.boostApy,
      benchmarkApy: d.benchmarkApy,
    }));
  }, [data]);

  // Reconciliation donut data
  const reconCharts = useMemo(() => {
    if (!data?.reconciliation) return [];
    return Object.entries(data.reconciliation).map(([key, val]) => ({
      label: key.toUpperCase(),
      data: [
        { name: "Real Loans", value: Math.abs(val.otlRealLoans || 0) },
        { name: "Strategy AUM", value: Math.abs(val.strategyAUM || 0) },
        { name: "Idle", value: Math.abs(val.idle || 0) },
      ],
    }));
  }, [data]);

  if (loading) return <LoadingSpinner message="Fetching Maple data..." />;

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ color: "#f87171", fontSize: 14, fontFamily: mono, marginBottom: 12 }}>
          Error: {error}
        </div>
        <button
          onClick={refresh}
          style={{
            background: ACCENT, border: "none", borderRadius: 5,
            padding: "8px 20px", color: "#0a0e17", fontFamily: mono,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 26px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0, fontFamily: mono }}>
          Maple Finance
        </h1>
        <span style={{
          background: "rgba(245,124,0,0.12)", border: "1px solid rgba(245,124,0,0.3)",
          borderRadius: 4, padding: "3px 10px", fontSize: 9, fontFamily: mono,
          color: ACCENT, letterSpacing: 1.2, fontWeight: 600, textTransform: "uppercase",
        }}>
          Protocol
        </span>
      </div>

      {/* Hero Stat Cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="Total Assets" value={fmt(totalAssets)} color={ACCENT} />
        <StatCard label="Collateral Value" value={fmt(data.globals?.collateralValue)} />
        <StatCard
          label="Collateral Ratio"
          value={data.globals?.collateralRatio != null
            ? fmtPct(data.globals.collateralRatio)
            : "\u2014"}
          color={data.globals?.collateralRatio >= 150 ? "#4ade80" : "#fbbf24"}
        />
        <StatCard label="Active Loans" value={activeLoans.length} />
      </div>

      {/* Pool Cards */}
      <SectionHeader title="Pools" subtitle="Maple lending pools" />
      <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
        {(data.pools || []).map((pool) => (
          <ModuleCard key={pool.id}>
            <div style={{ minWidth: 200 }}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: ACCENT,
                fontFamily: mono, marginBottom: 10,
              }}>
                {pool.name}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
                  <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 }}>Total Assets</span>
                  <span style={{ fontSize: 13, color: "#e2e8f0", fontFamily: mono, fontWeight: 600 }}>{fmt(pool.totalAssets)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
                  <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 }}>NAV / Share</span>
                  <span style={{ fontSize: 13, color: "#e2e8f0", fontFamily: mono }}>{pool.nav != null ? pool.nav.toFixed(4) : "\u2014"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
                  <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 }}>Total Shares</span>
                  <span style={{ fontSize: 13, color: "#e2e8f0", fontFamily: mono }}>{fmt(pool.shares)}</span>
                </div>
              </div>
            </div>
          </ModuleCard>
        ))}
      </div>

      {/* APY History Chart */}
      <SectionHeader title="APY History" subtitle="Historical yield performance" />
      <ModuleCard>
        {apyChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={apyChart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date" tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
                axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                {...chartTooltipStyle}
                formatter={(v) => [`${v.toFixed(2)}%`]}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: mono, color: "#94a3b8" }}
              />
              <Line type="monotone" dataKey="apy" stroke={ACCENT} strokeWidth={2} dot={false} name="APY" />
              <Line type="monotone" dataKey="coreApy" stroke="#22d3ee" strokeWidth={1.5} dot={false} name="Core APY" />
              <Line type="monotone" dataKey="boostApy" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="Boost APY" />
              <Line type="monotone" dataKey="benchmarkApy" stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="4 3" name="Benchmark" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ChartShimmer height={300} />
        )}
      </ModuleCard>

      <div style={{ height: 28 }} />

      {/* Capital Allocation Donuts */}
      <SectionHeader title="Capital Allocation" subtitle="Reconciliation breakdown per pool" />
      <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        {reconCharts.map((chart) => (
          <ModuleCard key={chart.label}>
            <div style={{ textAlign: "center", minWidth: 260 }}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: ACCENT, fontFamily: mono,
                marginBottom: 8, letterSpacing: 0.5,
              }}>
                {chart.label}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={chart.data}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80}
                    dataKey="value" paddingAngle={2}
                    stroke="none"
                  >
                    {chart.data.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...chartTooltipStyle}
                    formatter={(v) => [fmt(v)]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 6 }}>
                {chart.data.map((entry, i) => (
                  <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: 2,
                      background: DONUT_COLORS[i % DONUT_COLORS.length],
                    }} />
                    <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: mono }}>
                      {entry.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </ModuleCard>
        ))}
      </div>

      {/* Loans Table */}
      <SectionHeader title="Active Loans" subtitle={`${activeLoans.length} loans (excludes strategy & intercompany)`} />
      <ModuleCard>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>Pool</th>
                <th style={{ ...TH_R, cursor: "pointer" }} onClick={() => handleSort("principal")}>
                  Principal{sortIndicator("principal")}
                </th>
                <th style={{ ...TH_R, cursor: "pointer" }} onClick={() => handleSort("interestRate")}>
                  Rate{sortIndicator("interestRate")}
                </th>
                <th style={TH_R}>Interval</th>
                <th style={TH}>Collateral</th>
                <th style={TH_R}>Coll. Amt</th>
                <th style={{ ...TH_R, cursor: "pointer" }} onClick={() => handleSort("collateralValueUsd")}>
                  Coll. Value{sortIndicator("collateralValueUsd")}
                </th>
                <th style={TH}>Borrower</th>
              </tr>
            </thead>
            <tbody>
              {sortedLoans.map((loan) => (
                <tr key={loan.id}>
                  <td style={TD}>{poolMap[loan.pool] || truncAddr(loan.pool)}</td>
                  <td style={TD_R}>{fmt(loan.principal)}</td>
                  <td style={{ ...TD_R, color: "#22d3ee" }}>
                    {loan.interestRate != null ? fmtPct(loan.interestRate) : "\u2014"}
                  </td>
                  <td style={TD_R}>{loan.paymentInterval ? `${loan.paymentInterval}d` : "\u2014"}</td>
                  <td style={TD_DIM}>{loan.collateralAsset || "\u2014"}</td>
                  <td style={TD_R}>
                    {loan.collateralAmount != null
                      ? loan.collateralAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })
                      : "\u2014"}
                  </td>
                  <td style={TD_R}>{loan.collateralValueUsd != null ? fmt(loan.collateralValueUsd) : "\u2014"}</td>
                  <td style={TD_DIM}>{truncAddr(loan.borrower)}</td>
                </tr>
              ))}
              {sortedLoans.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...TD, textAlign: "center", color: "#6b7a8d" }}>
                    No active loans
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ModuleCard>

      <div style={{ height: 28 }} />

      {/* Strategies Table */}
      <SectionHeader title="Strategies" subtitle="DeFi strategy allocations" />
      <ModuleCard>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>Type</th>
                <th style={TH}>Pool</th>
                <th style={TH}>State</th>
                <th style={TH_R}>Deposited</th>
                <th style={TH_R}>Withdrawn</th>
                <th style={TH_R}>Net</th>
                <th style={TH_R}>On-Chain AUM</th>
              </tr>
            </thead>
            <tbody>
              {(data.strategies || []).map((s) => (
                <tr key={s.id}>
                  <td style={TD}>
                    <span style={{
                      background: s.type === "sky" ? "rgba(96,165,250,0.12)" : "rgba(139,92,246,0.12)",
                      border: s.type === "sky" ? "1px solid rgba(96,165,250,0.3)" : "1px solid rgba(139,92,246,0.3)",
                      borderRadius: 3, padding: "2px 8px", fontSize: 10, fontFamily: mono,
                      color: s.type === "sky" ? "#60a5fa" : "#a78bfa",
                      textTransform: "uppercase", letterSpacing: 0.8,
                    }}>
                      {s.type}
                    </span>
                  </td>
                  <td style={TD}>{s.pool || truncAddr(s.poolId)}</td>
                  <td style={TD}>
                    <span style={{
                      color: s.state === "active" ? "#4ade80" : "#f87171",
                      fontSize: 12,
                    }}>
                      {s.state}
                    </span>
                  </td>
                  <td style={TD_R}>{fmt(s.deposited)}</td>
                  <td style={TD_R}>{fmt(s.withdrawn)}</td>
                  <td style={{ ...TD_R, color: ACCENT }}>{fmt(s.net)}</td>
                  <td style={TD_R}>{fmt(s.onChainAUM)}</td>
                </tr>
              ))}
              {(!data.strategies || data.strategies.length === 0) && (
                <tr>
                  <td colSpan={7} style={{ ...TD, textAlign: "center", color: "#6b7a8d" }}>
                    No strategies
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ModuleCard>
    </div>
  );
}

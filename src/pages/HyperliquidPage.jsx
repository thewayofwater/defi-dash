import React, { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { useHyperliquidData } from "../hooks/useHyperliquidData";
import { fmt, fmtPct } from "../utils/format";
import {
  SectionHeader, LoadingSpinner, ModuleCard, ChartShimmer,
} from "../components/Shared";

const mono = "'JetBrains Mono', monospace";
const ACCENT = "#50FF7F"; // Hyperliquid neon green

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const chartTooltipStyle = {
  contentStyle: {
    background: "#131926", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#e2e8f0",
  },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#e2e8f0" },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};

function formatTs(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function trendColor(val) {
  if (val > 0) return "#4ade80";
  if (val < 0) return "#f87171";
  return "#94a3b8";
}

function returnCellBg(val) {
  if (val == null) return "transparent";
  const alpha = Math.min(Math.abs(val) / 10, 1) * 0.15;
  return val >= 0 ? `rgba(74,222,128,${alpha})` : `rgba(248,113,113,${alpha})`;
}

export default function HyperliquidPage() {
  const { data, loading, refreshing, refreshKey, error, lastUpdated, refresh } = useHyperliquidData();
  const [period, setPeriod] = useState("30d");
  const [chartView, setChartView] = useState("pnl"); // "tvl" or "pnl"
  const [showAnnualized, setShowAnnualized] = useState(false);

  // Period-dependent chart data
  // YTD uses allTime data but filtered to current year
  const periodKey = period === "1d" ? "day" : period === "7d" ? "week" : period === "30d" ? "month" : "allTime";
  const ts = data?.timeSeries || {};

  const ytdStart = useMemo(() => new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)).getTime(), []);
  const filterYtd = (series) => period === "ytd" ? series.filter((d) => d.date >= ytdStart) : series;

  const vaultChart = useMemo(() => {
    const series = filterYtd(ts[periodKey]?.value || []);
    return series.map((d) => ({ date: formatTs(d.date), value: d.value }));
  }, [ts, periodKey, period, ytdStart]);

  const pnlChart = useMemo(() => {
    const series = filterYtd(ts[periodKey]?.pnl || []);
    return series.map((d) => ({ date: formatTs(d.date), value: d.value }));
  }, [ts, periodKey, period, ytdStart]);

  const drawdownChart = useMemo(() => {
    const series = ts.allTime?.drawdown || [];
    return series.map((d) => ({ date: formatTs(d.date), drawdown: d.drawdown }));
  }, [ts]);

  // Monthly returns: years as rows, months as columns
  const { years: yearsList, yearlyTotals } = useMemo(() => {
    if (!data?.monthlyReturns) return { years: [], yearlyTotals: {} };
    const yrs = Object.keys(data.monthlyReturns).map(Number).sort();
    const totals = {};
    yrs.forEach((yr) => {
      const monthValues = Object.values(data.monthlyReturns[yr] || {});
      if (monthValues.length > 0) {
        totals[yr] = (monthValues.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100;
      }
    });
    return { years: yrs, yearlyTotals: totals };
  }, [data]);

  const annualize = (r) => r == null ? null : (Math.pow(1 + r / 100, 12) - 1) * 100;

  if (error) {
    return (
      <div style={{ background: "#0a0e17", color: "#f87171", padding: 40, fontFamily: mono, textAlign: "center", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Failed to load Hyperliquid data</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>{error}</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: "#0a0e17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner message="Pulling data from Hyperliquid API..." />
      </div>
    );
  }

  const h = data?.heroMetrics || {};
  const risk = data?.riskMetrics || {};

  // Period-dependent metrics
  const periodApr = period === "1d" ? h.apr1d : period === "7d" ? h.apr7d : period === "30d" ? h.apr30d : period === "ytd" ? h.ytdAnnualized : risk.annualizedReturn;
  const periodPnl = period === "1d" ? h.pnl24h : period === "7d" ? h.pnl7d : period === "30d" ? h.pnl30d : period === "ytd" ? h.ytdPnl : h.allTimePnl;
  const periodTvlChange = period === "1d" ? h.change24hPct : period === "7d" ? h.change7dPct : period === "30d" ? h.change30dPct : period === "ytd" ? h.ytdTvlChangePct : null;
  const periodLabel = period === "1d" ? "1D" : period === "7d" ? "7D" : period === "30d" ? "30D" : period === "ytd" ? "YTD" : "All-Time";

  return (
    <div style={{ background: "#0a0e17", color: "#e2e8f0", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .risk-card:hover .risk-tip { display: block !important; }
      `}</style>

      {/* ────── Header ────── */}
      <div style={{ padding: "20px 26px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
              Hyperliquid HLP
              <span style={{
                color: ACCENT, marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: mono,
                verticalAlign: "middle", background: "rgba(80,255,127,0.07)",
                padding: "2px 7px", borderRadius: 3, letterSpacing: 1,
              }}>
                VAULT
              </span>
            </h1>
            <div style={{ fontSize: 12, color: "#4f5e6f", marginTop: 2, fontFamily: mono }}>
              Live data from Hyperliquid API
              {lastUpdated && ` \u00B7 Updated ${lastUpdated.toLocaleTimeString()}`}
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              background: refreshing ? "rgba(80,255,127,0.15)" : "rgba(255,255,255,0.04)",
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

        {/* Row 1: Two big hero cards — Vault TVL + APR */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <div style={{
            background: "rgba(80,255,127,0.06)", border: "1px solid rgba(80,255,127,0.15)",
            borderRadius: 6, padding: "20px 24px", position: "relative", overflow: "hidden",
          }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(80,255,127,0.08) 40%, rgba(80,255,127,0.12) 50%, rgba(80,255,127,0.08) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: ACCENT, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Vault TVL</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 4 }}>{fmt(h.vaultValue, 2)}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>total vault equity</div>
          </div>
          <div style={{
            background: "rgba(80,255,127,0.04)", border: "1px solid rgba(80,255,127,0.10)",
            borderRadius: 6, padding: "20px 24px", position: "relative", overflow: "hidden",
          }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(80,255,127,0.06) 40%, rgba(80,255,127,0.08) 50%, rgba(80,255,127,0.06) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: "#5a6678", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>{periodLabel} APR</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: trendColor(periodApr), fontFamily: mono, marginTop: 4 }}>{fmtPct(periodApr)}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>annualized</div>
          </div>
        </div>
      </div>

      {/* Period toggle — between hero and charts */}
      <div style={{ padding: "12px 26px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { key: "1d", label: "1D" },
          { key: "7d", label: "7D" },
          { key: "30d", label: "30D" },
          { key: "all", label: "All-Time" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            style={{
              background: period === key ? "rgba(80,255,127,0.12)" : "rgba(255,255,255,0.025)",
              border: period === key ? "1px solid rgba(80,255,127,0.3)" : "1px solid rgba(255,255,255,0.05)",
              borderRadius: 5, padding: "6px 14px", fontSize: 10, fontFamily: mono,
              color: period === key ? ACCENT : "#6b7a8d",
              cursor: "pointer", letterSpacing: 0.5, fontWeight: period === key ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Period stat cards */}
      <div style={{ padding: "12px 26px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "10px 16px" }}>
            <div style={{ fontSize: 11, color: "#5a6678", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>{periodLabel} PnL</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: trendColor(periodPnl), fontFamily: mono, marginTop: 2 }}>{fmt(periodPnl, 2)}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "10px 16px" }}>
            <div style={{ fontSize: 11, color: "#5a6678", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>{periodLabel} TVL Change</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: periodTvlChange != null ? trendColor(periodTvlChange) : "#4a5568", fontFamily: mono, marginTop: 2 }}>
              {periodTvlChange != null ? `${periodTvlChange >= 0 ? "+" : ""}${fmtPct(periodTvlChange)}` : "N/A"}
            </div>
          </div>
        </div>
      </div>

      {/* ────── Charts ────── */}
      <div style={{ padding: "20px 26px 0", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Vault TVL / PnL Chart with toggle */}
        {(vaultChart.length > 0 || pnlChart.length > 0) && (
          <ModuleCard>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <SectionHeader title={chartView === "tvl" ? "Vault TVL" : "Cumulative PnL"} subtitle={chartView === "tvl" ? `${periodLabel} vault equity` : `${periodLabel} profit and loss`} />
              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                {[{ key: "pnl", label: "PnL" }, { key: "tvl", label: "TVL" }].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setChartView(key)}
                    style={{
                      background: chartView === key ? "rgba(80,255,127,0.15)" : "rgba(255,255,255,0.04)",
                      border: chartView === key ? "1px solid rgba(80,255,127,0.3)" : "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 3, padding: "3px 10px", fontSize: 10, fontFamily: mono,
                      color: chartView === key ? ACCENT : "#6b7a8d",
                      cursor: "pointer", letterSpacing: 0.5,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={`${refreshKey}-${chartView}`}>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartView === "tvl" ? vaultChart : pnlChart} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="hlpChartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} interval={Math.floor((chartView === "tvl" ? vaultChart : pnlChart).length / 6)} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tickFormatter={(v) => fmt(v)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
                    <Tooltip {...chartTooltipStyle} formatter={(v) => [fmt(v, 2), chartView === "tvl" ? "Vault TVL" : "PnL"]} labelFormatter={(v) => v} />
                    <Area type="monotone" dataKey="value" stroke={ACCENT} fill="url(#hlpChartGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </ModuleCard>
        )}

        {/* Monthly Performance Table — years as rows, months as columns */}
        {yearsList.length > 0 && (
          <ModuleCard>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <SectionHeader title="Monthly Performance (%)" subtitle={showAnnualized ? "Annualized monthly returns" : "PnL change / avg TVL per month"} />
              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                {[{ key: false, label: "Monthly" }, { key: true, label: "Annualized" }].map(({ key, label }) => (
                  <button
                    key={label}
                    onClick={() => setShowAnnualized(key)}
                    style={{
                      background: showAnnualized === key ? "rgba(80,255,127,0.15)" : "rgba(255,255,255,0.04)",
                      border: showAnnualized === key ? "1px solid rgba(80,255,127,0.3)" : "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 3, padding: "3px 10px", fontSize: 10, fontFamily: mono,
                      color: showAnnualized === key ? ACCENT : "#6b7a8d",
                      cursor: "pointer", letterSpacing: 0.5,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {refreshing ? <ChartShimmer height={200} /> : (
              <div key={refreshKey} style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "8px 6px", textAlign: "left", fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1, width: 50 }}>Year</th>
                      <th style={{ padding: "8px 6px", textAlign: "right", fontSize: 10, color: "#e2e8f0", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>YTD</th>
                      {MONTH_NAMES.map((m) => (
                        <th key={m} style={{ padding: "8px 6px", textAlign: "right", fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 }}>{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {yearsList.map((yr) => (
                      <tr key={yr} style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                        <td style={{ padding: "8px 6px", fontSize: 11, fontFamily: mono, color: "#e2e8f0", fontWeight: 600 }}>{yr}</td>
                        <td style={{
                          padding: "8px 6px", textAlign: "right", fontSize: 11, fontFamily: mono, fontWeight: 700,
                          color: yearlyTotals[yr] != null ? trendColor(yearlyTotals[yr]) : "#2d3a4a",
                          background: returnCellBg(yearlyTotals[yr]),
                        }}>
                          {yearlyTotals[yr] != null ? `${yearlyTotals[yr] >= 0 ? "+" : ""}${yearlyTotals[yr].toFixed(2)}` : "\u2014"}
                        </td>
                        {MONTH_NAMES.map((_, i) => {
                          const raw = data.monthlyReturns?.[yr]?.[i + 1] ?? null;
                          const val = raw != null && showAnnualized ? annualize(raw) : raw;
                          return (
                            <td key={i} style={{
                              padding: "8px 6px", textAlign: "right", fontSize: 11, fontFamily: mono,
                              color: val == null ? "#2d3a4a" : trendColor(val),
                              background: returnCellBg(showAnnualized ? val : raw),
                            }}>
                              {val != null ? `${val >= 0 ? "+" : ""}${val.toFixed(2)}` : "\u2014"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ModuleCard>
        )}

        {/* Drawdown — always All-Time, full width */}
        {drawdownChart.length > 0 && (
          <ModuleCard>
            <SectionHeader title="Drawdown" subtitle="All-time NAV peak-to-trough decline (net of deposits/withdrawals)" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={drawdownChart} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="hlpDdGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f87171" stopOpacity={0} />
                        <stop offset="100%" stopColor="#f87171" stopOpacity={0.2} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} interval={Math.floor(drawdownChart.length / 5)} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} domain={["dataMin", 0]} />
                    <Tooltip {...chartTooltipStyle} formatter={(v) => [`${v.toFixed(2)}%`, "Drawdown"]} labelFormatter={(v) => v} />
                    <Area type="monotone" dataKey="drawdown" stroke="#f87171" fill="url(#hlpDdGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </ModuleCard>
        )}

        {/* Risk Metrics */}
        <ModuleCard>
          <SectionHeader title="Risk Metrics" subtitle="Performance and risk statistics since inception" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              { label: "Annualized Return", value: fmtPct(risk.annualizedReturn), color: trendColor(risk.annualizedReturn), tip: "Compounded annual growth rate of NAV since inception" },
              { label: "Annualized Volatility", value: fmtPct(risk.annualizedVol), color: "#e2e8f0", tip: "Standard deviation of biweekly NAV returns, annualized. Measures how much returns fluctuate" },
              { label: "Sharpe Ratio", value: risk.sharpeRatio?.toFixed(2), color: risk.sharpeRatio >= 1 ? "#4ade80" : risk.sharpeRatio >= 0.5 ? "#fbbf24" : "#f87171", tip: "Return per unit of risk (return / volatility). >1 is good, >2 is excellent. Uses 0% risk-free rate" },
              { label: "Sortino Ratio", value: risk.sortinoRatio?.toFixed(2), color: risk.sortinoRatio >= 1.5 ? "#4ade80" : risk.sortinoRatio >= 0.5 ? "#fbbf24" : "#f87171", tip: "Like Sharpe but only penalizes downside volatility. Higher is better — ignores upside swings" },
              { label: "Calmar Ratio", value: risk.calmarRatio?.toFixed(2), color: risk.calmarRatio >= 1 ? "#4ade80" : risk.calmarRatio >= 0.5 ? "#fbbf24" : "#f87171", tip: "Annualized return / max drawdown. Measures how well returns compensate for the worst loss" },
              { label: "Max Drawdown", value: fmtPct(risk.maxDrawdown), color: "#f87171", tip: "Largest peak-to-trough NAV decline since inception. The worst loss a depositor could have experienced" },
              { label: "Current Drawdown", value: fmtPct(risk.currentDrawdown), color: risk.currentDrawdown < -5 ? "#f87171" : risk.currentDrawdown < 0 ? "#fbbf24" : "#4ade80", tip: "How far NAV is currently below its all-time high. 0% means at peak" },
              { label: "Win Rate", value: fmtPct(risk.winRate), color: risk.winRate >= 60 ? "#4ade80" : risk.winRate >= 50 ? "#fbbf24" : "#f87171", tip: "Percentage of months with positive NAV returns" },
              { label: "Best / Worst Month", value: null, bestWorst: true, color: "#e2e8f0", tip: "Highest and lowest single-month NAV returns since inception" },
            ].map((card) => (
              <div key={card.label} className="risk-card" style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 6, padding: "12px 16px", cursor: "help", position: "relative",
              }}>
                <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.8 }}>{card.label} <span style={{ color: "#4a5568" }}>{"\u24D8"}</span></div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: mono, marginTop: 4 }}>
                  {card.bestWorst ? (
                    <><span style={{ color: "#4ade80" }}>+{risk.bestMonth?.toFixed(1)}%</span><span style={{ color: "#6b7a8d" }}> / </span><span style={{ color: "#f87171" }}>{risk.worstMonth?.toFixed(1)}%</span></>
                  ) : (
                    <span style={{ color: card.color }}>{card.value}</span>
                  )}
                </div>
                <div className="risk-tip" style={{
                  display: "none", position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                  transform: "translateX(-50%)", width: 240, padding: "8px 10px",
                  background: "#131926", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#cbd5e1",
                  lineHeight: 1.5, zIndex: 10, pointerEvents: "none",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                }}>
                  {card.tip}
                </div>
              </div>
            ))}
          </div>
        </ModuleCard>

      </div>

      {/* Bottom padding */}
      <div style={{ height: 40 }} />
    </div>
  );
}

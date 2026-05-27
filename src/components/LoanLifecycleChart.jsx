import React from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const mono = "'JetBrains Mono', monospace";

/**
 * LTV deleverage chart for a single loan.
 *
 * Model:
 *   collateral(t) = originalCollateral × max(0, 1 − t/usefulLifeYears)
 *   principal(t)  = originalPrincipal × max(0, 1 − t/termYears)
 *   equity(t)     = collateral(t) − principal(t)
 *
 * Both lines are linear-to-zero (matching USDai's own visualization). The
 * "today" reference line shows where in the lifecycle the loan currently
 * sits.
 *
 * Props:
 *   originationDate: ms timestamp (number)
 *   maturityDate:    ms timestamp (number)
 *   originalPrincipal: number (we use current principal as proxy)
 *   originalCollateral: number
 *   usefulLifeDays: number (defaults 1080)
 *   accent: hex color for principal line
 */
export default function LoanLifecycleChart({
  originationDate, maturityDate, originalPrincipal, originalCollateral,
  usefulLifeDays = 1080, accent = "#c8b88a",
}) {
  if (!originationDate || !maturityDate || !originalPrincipal || !originalCollateral) {
    return (
      <div style={{ fontSize: 11, color: "#4f5e6f", fontFamily: mono, padding: 14, textAlign: "center" }}>
        Lifecycle chart unavailable — no on-chain origination data for this loan
      </div>
    );
  }

  const now = Date.now();
  const yearMs = 365 * 24 * 3600 * 1000;
  const termYears  = (maturityDate - originationDate) / yearMs;
  const lifeYears  = usefulLifeDays / 365;
  const horizonEnd = Math.max(maturityDate, originationDate + lifeYears * yearMs);

  // Sample 50 points across the lifecycle for a smooth chart
  const points = [];
  const N = 50;
  for (let i = 0; i <= N; i++) {
    const t = originationDate + (horizonEnd - originationDate) * (i / N);
    const yearsFromOrig = (t - originationDate) / yearMs;
    const collateral = originalCollateral * Math.max(0, 1 - yearsFromOrig / lifeYears);
    const principal  = originalPrincipal  * Math.max(0, 1 - yearsFromOrig / termYears);
    const equity     = Math.max(0, collateral - principal);
    points.push({ t, collateral, principal, equity });
  }

  // Today's interpolated values
  const todayYears = Math.max(0, (now - originationDate) / yearMs);
  const todayCollateral = originalCollateral * Math.max(0, 1 - todayYears / lifeYears);
  const todayPrincipal  = originalPrincipal  * Math.max(0, 1 - todayYears / termYears);
  const todayLtv = todayCollateral > 0 ? (todayPrincipal / todayCollateral) * 100 : null;

  const fmtUsd = (n) => {
    if (n == null) return "—";
    if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };
  const fmtDate = (v) => new Date(v).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

  const legendItemStyle = { display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#94a3b8", fontFamily: mono };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ letterSpacing: 1, textTransform: "uppercase" }}>LTV Deleverage</span>
        <span>Today: LTV {todayLtv != null ? `${todayLtv.toFixed(0)}%` : "—"} · Equity {fmtUsd(todayCollateral - todayPrincipal)}</span>
      </div>
      <div style={{ display: "flex", gap: 14, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={legendItemStyle}>
          <span style={{ width: 16, height: 2, background: accent, display: "inline-block" }} />
          Loan principal
        </div>
        <div style={legendItemStyle}>
          <span style={{ width: 16, display: "inline-block", borderTop: "1.5px dashed #94a3b8" }} />
          GPU collateral value
        </div>
        <div style={legendItemStyle}>
          <span style={{ width: 16, height: 10, background: accent, opacity: 0.18, display: "inline-block", border: `1px solid ${accent}33` }} />
          Equity cushion
        </div>
        <div style={legendItemStyle}>
          <span style={{ width: 16, display: "inline-block", borderTop: "1px dashed #22d3ee" }} />
          Today
        </div>
      </div>
      <div style={{ width: "100%", height: 170 }}>
        <ResponsiveContainer>
          <ComposedChart data={points} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="t" type="number" scale="time"
              domain={[originationDate, horizonEnd]}
              tickFormatter={fmtDate}
              tick={{ fill: "#6b7a8d", fontSize: 9, fontFamily: mono }}
              minTickGap={50} />
            <YAxis tickFormatter={fmtUsd}
              tick={{ fill: "#6b7a8d", fontSize: 9, fontFamily: mono }}
              width={50} />
            <Tooltip
              contentStyle={{ background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#e2e8f0" }}
              labelFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              formatter={(v, k) => [fmtUsd(v), k]} />
            <Area type="monotone" dataKey="equity" stroke="none" fill={accent} fillOpacity={0.15} name="Equity cushion" />
            <Line type="monotone" dataKey="collateral" stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1.5} dot={false} name="Collateral value" />
            <Line type="monotone" dataKey="principal"  stroke={accent}  strokeWidth={2} dot={false} name="Loan principal" />
            <ReferenceLine x={now} stroke="#22d3ee" strokeWidth={1} strokeDasharray="2 2"
              label={{ value: "today", position: "top", fill: "#22d3ee", fontSize: 9, fontFamily: mono }} />
            <ReferenceLine x={maturityDate} stroke="#4f5e6f" strokeWidth={1}
              label={{ value: "maturity", position: "top", fill: "#4f5e6f", fontSize: 9, fontFamily: mono }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

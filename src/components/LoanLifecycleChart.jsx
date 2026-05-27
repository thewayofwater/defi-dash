import React from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const mono = "'JetBrains Mono', monospace";

/**
 * LTV deleverage chart for a single loan.
 *
 * Normalized to % of original collateral value (matches USDai's own slide).
 *
 * Model (per USDai docs: "amortization calibrated to GPU depreciation curve;
 * loan originated at 80% LTV deleverages to ~65% LTV by end of year one as
 * principal pays down faster than collateral value declines"):
 *
 *   collateral(t) = 100% → residualAtMaturity% linearly over termYears,
 *                   then continues to 0% over the remaining physical life
 *   principal(t)  = origLtv → 0% linearly over termYears (straight-line)
 *
 * residualAtMaturity is the key parameter. USDai's reference slide shows the
 * GPU at ~30% of original value at term-end (year 3 for a 3-year loan), so
 * we default to 0.30. This is what causes LTV to deleverage: principal
 * amortizes to 0% while collateral retains real residual value.
 *
 * The equity cushion is the area BETWEEN the two lines — implemented as a
 * stacked Area on top of the principal Area so they sum to the collateral
 * line at every x.
 */
export default function LoanLifecycleChart({
  originationDate, maturityDate, originalPrincipal, originalCollateral,
  usefulLifeDays = 1080, residualAtMaturityPct = 0.30, accent = "#c8b88a",
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
  const termYears = (maturityDate - originationDate) / yearMs;
  const origLtv   = originalPrincipal / originalCollateral; // e.g. 0.80

  // Collateral depreciates linearly from 100% to residualAtMaturity at maturity.
  // After maturity, continues linearly to 0% over the remaining physical life
  // (we use usefulLifeDays as an upper bound for the physical-life horizon).
  const physicalLifeYears = Math.max(usefulLifeDays / 365, termYears * (1 / (1 - residualAtMaturityPct)));
  const horizonEnd = originationDate + Math.max(termYears * 1.5, physicalLifeYears) * yearMs;

  function collateralFracAt(yearsFromOrig) {
    if (yearsFromOrig <= 0) return 1;
    if (yearsFromOrig <= termYears) {
      return 1 - (1 - residualAtMaturityPct) * (yearsFromOrig / termYears);
    }
    // After maturity: linear from residualAtMaturity → 0 over remaining life
    const yearsPastMaturity = yearsFromOrig - termYears;
    const remainingLifeYears = Math.max(0.01, physicalLifeYears - termYears);
    return Math.max(0, residualAtMaturityPct * (1 - yearsPastMaturity / remainingLifeYears));
  }
  function principalFracAt(yearsFromOrig) {
    return origLtv * Math.max(0, 1 - yearsFromOrig / termYears);
  }

  // Sample 60 points across the lifecycle, with an extra point exactly at
  // maturity so the chart shows the kink there cleanly.
  const points = [];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const t = originationDate + (horizonEnd - originationDate) * (i / N);
    const yearsFromOrig = (t - originationDate) / yearMs;
    const collateralFrac = collateralFracAt(yearsFromOrig);
    const principalFrac  = principalFracAt(yearsFromOrig);
    const equityFrac = Math.max(0, collateralFrac - principalFrac);
    points.push({ t, principalFrac, equityFrac, collateralFrac });
  }
  // Insert maturity sample (sorted)
  const maturityYears = termYears;
  points.push({
    t: maturityDate,
    principalFrac: 0,
    collateralFrac: collateralFracAt(maturityYears),
    equityFrac: collateralFracAt(maturityYears),
  });
  points.sort((a, b) => a.t - b.t);

  // Today's values
  const todayYears = Math.max(0, (now - originationDate) / yearMs);
  const todayCollateralFrac = collateralFracAt(todayYears);
  const todayPrincipalFrac  = principalFracAt(todayYears);
  const todayLtv = todayCollateralFrac > 0 ? (todayPrincipalFrac / todayCollateralFrac) * 100 : null;
  const todayEquityUsd = (todayCollateralFrac - todayPrincipalFrac) * originalCollateral;

  // Year-1 LTV for the header annotation (matches USDai's example phrasing)
  const y1Collat = collateralFracAt(1);
  const y1Princ  = principalFracAt(1);
  const y1Ltv    = y1Collat > 0 && termYears >= 1 ? (y1Princ / y1Collat) * 100 : null;

  const fmtPct = (v) => `${Math.round(v * 100)}%`;
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
      <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
        <span style={{ letterSpacing: 1, textTransform: "uppercase" }}>LTV Deleverage</span>
        <span>
          Origination: <span style={{ color: "#e2e8f0" }}>{Math.round(origLtv * 100)}%</span>
          {y1Ltv != null && <>{"  ·  "}Year 1: <span style={{ color: "#e2e8f0" }}>{y1Ltv.toFixed(0)}%</span></>}
          {"  ·  "}Today: <span style={{ color: "#e2e8f0" }}>{todayLtv != null ? `${todayLtv.toFixed(0)}%` : "—"}</span>
          {"  ·  "}Equity: <span style={{ color: "#e2e8f0" }}>{fmtUsd(todayEquityUsd)}</span>
        </span>
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
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <ComposedChart data={points} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="t" type="number" scale="time"
              domain={[originationDate, horizonEnd]}
              tickFormatter={fmtDate}
              tick={{ fill: "#6b7a8d", fontSize: 9, fontFamily: mono }}
              minTickGap={50} />
            <YAxis tickFormatter={fmtPct} domain={[0, 1]}
              tick={{ fill: "#6b7a8d", fontSize: 9, fontFamily: mono }}
              width={42} />
            <Tooltip
              contentStyle={{ background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#e2e8f0" }}
              labelFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              formatter={(v, k) => {
                const labelMap = { principalFrac: "Loan principal", equityFrac: "Equity cushion", collateralFrac: "GPU collateral" };
                return [`${fmtPct(v)} (${fmtUsd(v * originalCollateral)})`, labelMap[k] || k];
              }} />
            {/* Stack principal (bottom) + equity (top) so equity area visually sits between the two lines. */}
            <Area type="monotone" dataKey="principalFrac" stackId="v" stroke={accent} strokeWidth={2}
              fill={accent} fillOpacity={0.0} name="principalFrac" />
            <Area type="monotone" dataKey="equityFrac" stackId="v" stroke="none"
              fill={accent} fillOpacity={0.18} name="equityFrac" />
            {/* Dashed collateral line on top so it's a distinct curve, not just the top edge of a fill */}
            <Line type="monotone" dataKey="collateralFrac" stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1.5} dot={false} name="collateralFrac" />
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

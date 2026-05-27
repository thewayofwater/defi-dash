import React from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const mono = "'JetBrains Mono', monospace";

/**
 * LTV deleverage chart for a single loan.
 *
 * Matches USDai's reference slide where the Y-axis carries TWO different
 * percentages plotted on the same axis:
 *   - GPU collateral line: % of ORIGINAL collateral value (depreciation)
 *   - Loan line:           CURRENT LTV ratio (= principal / current collateral)
 *
 * So at origination both lines start where the protocol underwrote them
 * (GPU = 100%, Loan = origLtv, e.g. 80%). Over time:
 *   - GPU drops because the hardware depreciates
 *   - LTV drops because principal amortizes FASTER than collateral
 *     depreciates → the loan deleverages
 *
 * The equity cushion is the gap between the two lines.
 *
 * Model per USDai docs: "amortization calibrated to GPU depreciation curve;
 * loan originated at 80% LTV deleverages to ~65% LTV by end of year one":
 *
 *   collateral(t in [0, term]) = 100% → residualAtMaturity% (linear)
 *   principal(t in [0, term])  = origLtv → 0% (linear, straight-line amort)
 *   LTV(t) = principal(t) / collateral(t)
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

  // LTV at time t = principal(t) / collateral(t). When collateral hits zero
  // post-maturity we clamp LTV to 0.
  function ltvAt(yearsFromOrig) {
    const c = collateralFracAt(yearsFromOrig);
    const p = principalFracAt(yearsFromOrig);
    return c > 0 ? p / c : 0;
  }

  // Sample 60 points across the lifecycle, with an extra point exactly at
  // maturity for a clean kink.
  const points = [];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const t = originationDate + (horizonEnd - originationDate) * (i / N);
    const yearsFromOrig = (t - originationDate) / yearMs;
    const gpu = collateralFracAt(yearsFromOrig);
    const ltv = ltvAt(yearsFromOrig);
    // For stacked-area equity cushion: ltvArea + cushionArea = gpu line.
    points.push({ t, ltv, cushion: Math.max(0, gpu - ltv), gpu });
  }
  // Insert maturity sample
  const maturityGpu = collateralFracAt(termYears);
  points.push({ t: maturityDate, ltv: 0, cushion: maturityGpu, gpu: maturityGpu });
  points.sort((a, b) => a.t - b.t);

  // Today's values
  const todayYears = Math.max(0, (now - originationDate) / yearMs);
  const todayGpu = collateralFracAt(todayYears);
  const todayLtv = ltvAt(todayYears);
  const todayEquityUsd = (todayGpu - todayLtv) * originalCollateral;

  // Year-1 LTV for the header annotation (matches USDai's example phrasing)
  const y1Ltv = termYears >= 1 ? ltvAt(1) : null;

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
          LTV → Origination: <span style={{ color: "#e2e8f0" }}>{Math.round(origLtv * 100)}%</span>
          {y1Ltv != null && <>{"  ·  "}Year 1: <span style={{ color: "#e2e8f0" }}>{Math.round(y1Ltv * 100)}%</span></>}
          {"  ·  "}Today: <span style={{ color: "#e2e8f0" }}>{todayLtv != null ? `${Math.round(todayLtv * 100)}%` : "—"}</span>
          {"  ·  "}Equity: <span style={{ color: "#e2e8f0" }}>{fmtUsd(todayEquityUsd)}</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 14, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={legendItemStyle}>
          <span style={{ width: 16, height: 2, background: accent, display: "inline-block" }} />
          Loan LTV
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
                if (k === "cushion") return [null, null];  // hide stacked-area helper from tooltip
                const labelMap = { ltv: "Loan LTV", gpu: "GPU collateral" };
                return [fmtPct(v), labelMap[k] || k];
              }} />
            {/* Stack hidden LTV-base + visible cushion so the shaded region sits between the two lines. */}
            <Area type="monotone" dataKey="ltv" stackId="v" stroke="none" fill="transparent" name="ltv-base" legendType="none" />
            <Area type="monotone" dataKey="cushion" stackId="v" stroke="none" fill={accent} fillOpacity={0.18} name="cushion" legendType="none" />
            {/* Lines on top */}
            <Line type="monotone" dataKey="gpu" stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1.5} dot={false} name="gpu" />
            <Line type="monotone" dataKey="ltv" stroke={accent} strokeWidth={2} dot={false} name="ltv" />
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

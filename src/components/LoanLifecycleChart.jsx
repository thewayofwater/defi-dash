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
 *   principal(t) = origPrincipal × max(0, 1 − t/termYears)   (straight-line amortization)
 *   collateral(t) = origCollateral × max(0, 1 − depRate × t) (linear depreciation at depRate/year)
 *   LTV(t) = principal(t) / collateral(t)
 *
 * USDai's docs state "three years, straight-line amortizing" and quote that
 * an 80% origination LTV "deleverages to approximately 65% LTV by year one."
 *
 * Default depreciation rate is 25%/year linear (4-year useful life). This is
 * a conservative liquidation/recovery view rather than the more generous
 * hyperscaler accounting standard (5-6yr life = 16-20%/yr). It accounts for:
 *   - thin secondary market liquidity for H100/H200/B200 (20-40% discount
 *     applied at sale)
 *   - generational obsolescence as NVIDIA ships a new gen every 18 months
 *   - asset specificity (GPUs lose value when divorced from their
 *     data-center infrastructure)
 *   - recovery costs (repossession, transport, refurb, vendor finding)
 *
 * Under 25%/yr, an 80% loan deleverages to ~71% by year 1 — still within
 * USDai's "approximately 65%" tolerance — and the GPU has 25% residual
 * value at the 3-year term mark, which better matches realistic liquidation
 * recovery than the 40% implied by the 20%/yr accounting standard.
 *
 * The model treats the entire collateral bundle (GPU servers + networking +
 * infrastructure NFTs) as a single asset depreciating uniformly. This is a
 * simplification — networking and infrastructure typically depreciate
 * slower (7-10yr life) than GPUs themselves — but most bundles are
 * GPU-dominant (>90% of cv) so blended impact is small.
 *
 * Y-axis: % of original collateral. Both lines are strictly comparable so
 * they cannot cross under any reasonable origination LTV < 100%.
 *   - GPU collateral line: current_collateral / origCollateral  (depreciation)
 *   - Loan line:           current_principal / origCollateral   (amortization)
 *
 * The shaded equity cushion is the gap between the two lines and always grows
 * over time when principal amortizes faster than collateral depreciates.
 *
 * The CURRENT LTV ratio (= principal / current_collateral) is shown in the
 * header annotation and tooltip, but is NOT plotted directly — plotting two
 * different ratios on the same y-axis is confusing and can produce visual
 * inversions at high origination LTVs.
 */
export default function LoanLifecycleChart({
  originationDate, maturityDate, originalPrincipal, originalCollateral,
  depreciationRatePerYear = 0.25,   // conservative liquidation view: 4-year useful life
  accent = "#c8b88a",
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
  const origLtv   = originalPrincipal / originalCollateral;

  // x-axis horizon: out to either maturity or end of GPU's physical life,
  // whichever is later. End of physical life = 1 / depRate.
  const physicalLifeYears = 1 / depreciationRatePerYear;
  const horizonYears = Math.max(termYears, physicalLifeYears);
  const horizonEnd = originationDate + horizonYears * yearMs;

  const principalFracAt = (y) => origLtv * Math.max(0, 1 - y / termYears);
  const collateralFracAt = (y) => Math.max(0, 1 - depreciationRatePerYear * y);
  const ltvAt = (y) => {
    const c = collateralFracAt(y);
    return c > 0 ? principalFracAt(y) / c : 0;
  };

  // Build data points. Each point carries everything needed for both lines,
  // the cushion-range Area, and tooltip $-value labels.
  // Both lines are % of original collateral so they're directly comparable.
  // Principal line = principal / origCollateral, GPU line = collateral / origCollateral.
  // Current LTV ratio (= principal / current_collateral) is computed for tooltip/header only.
  const points = [];
  const N = 60;
  const sampleAt = (t) => {
    const y = (t - originationDate) / yearMs;
    const gpu = collateralFracAt(y);                  // collateral % of original
    const principal = principalFracAt(y);             // principal % of original (== origLtv × amort factor)
    const ltv = gpu > 0 ? principal / gpu : 0;        // CURRENT LTV (for annotations only)
    return {
      t,
      gpu,
      principalLine: principal,
      // Range Area: from principal line up to GPU line. Since origLtv < 1 and
      // amortization is faster than depreciation (depRate × term < 1 - origLtv
      // for any sensible loan), principalLine ≤ gpu always.
      cushionRange: [principal, gpu],
      // For tooltip:
      ltv,
      gpuUsd: gpu * originalCollateral,
      principalUsd: principal * originalCollateral,
      equityUsd: Math.max(0, (gpu - principal) * originalCollateral),
    };
  };
  for (let i = 0; i <= N; i++) {
    const t = originationDate + (horizonEnd - originationDate) * (i / N);
    points.push(sampleAt(t));
  }
  // Insert an exact-maturity sample so the kink renders cleanly
  points.push(sampleAt(maturityDate));
  points.sort((a, b) => a.t - b.t);

  // Today's snapshot for header tile
  const todayYears = Math.max(0, (now - originationDate) / yearMs);
  const todayGpu = collateralFracAt(todayYears);
  const todayLtv = ltvAt(todayYears);
  const todayPrincipalUsd  = principalFracAt(todayYears) * originalCollateral;
  const todayCollateralUsd = todayGpu * originalCollateral;
  const todayEquityUsd     = Math.max(0, todayCollateralUsd - todayPrincipalUsd);

  // Year-1 LTV for the header
  const y1Ltv = termYears >= 1 ? ltvAt(1) : null;

  const fmtPct = (v) => `${Math.round((v ?? 0) * 100)}%`;
  const fmtUsd = (n) => {
    if (n == null) return "—";
    if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(1)}K`;
    return `$${Math.round(n)}`;
  };
  const fmtDate = (v) => new Date(v).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

  const legendItemStyle = { display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#94a3b8", fontFamily: mono };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
        <span style={{ letterSpacing: 1, textTransform: "uppercase" }}>LTV Deleverage</span>
        <span>
          LTV → Origination: <span style={{ color: "#e2e8f0" }}>{fmtPct(origLtv)}</span>
          {y1Ltv != null && <>{"  ·  "}Year 1: <span style={{ color: "#e2e8f0" }}>{fmtPct(y1Ltv)}</span></>}
          {"  ·  "}Today: <span style={{ color: "#e2e8f0" }}>{fmtPct(todayLtv)}</span>
          {"  ·  "}Equity: <span style={{ color: "#e2e8f0" }}>{fmtUsd(todayEquityUsd)}</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 14, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={legendItemStyle}>
          <span style={{ width: 16, height: 2, background: accent, display: "inline-block" }} />
          Loan principal (% of original)
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
      <div style={{ fontSize: 9, color: "#4f5e6f", fontFamily: mono, marginBottom: 4 }}>
        Model: straight-line amortization to 0% over loan term; linear bundle depreciation at {Math.round(depreciationRatePerYear * 100)}%/year
        (4-year useful life, conservative liquidation-recovery view — discounts hyperscaler accounting for secondary-market illiquidity).
      </div>
      <div style={{ width: "100%", height: 210 }}>
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
              formatter={(v, k, item) => {
                const p = item?.payload || {};
                if (k === "gpu")           return [`${fmtPct(v)} (${fmtUsd(p.gpuUsd)})`, "GPU collateral"];
                if (k === "principalLine") return [`${fmtPct(v)} (${fmtUsd(p.principalUsd)} · LTV ${fmtPct(p.ltv)})`, "Loan principal"];
                return [null, null];
              }} />
            {/* Range Area for the cushion between the two lines (Recharts native pattern) */}
            <Area type="monotone" dataKey="cushionRange" stroke="none" fill={accent} fillOpacity={0.18} isAnimationActive={false} legendType="none" />
            {/* Lines on top */}
            <Line type="monotone" dataKey="gpu"           stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="principalLine" stroke={accent}  strokeWidth={2} dot={false} isAnimationActive={false} />
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

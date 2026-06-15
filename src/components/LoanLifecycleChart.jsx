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
  remainingPrincipal,               // current outstanding principal — drives "today" marker
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
  const monthMs = 30.4375 * 24 * 3600 * 1000;  // average month length
  const termYears = (maturityDate - originationDate) / yearMs;
  const origLtv   = originalPrincipal / originalCollateral;

  // USDai loans pay monthly with equal principal payments. So principal balance
  // is a STEP function: drops by (origPrincipal / termMonths) on each payment
  // date, flat between payments. Approximated as 30.44-day months.
  const termMonths = Math.max(1, Math.round((maturityDate - originationDate) / monthMs));
  const principalPerPayment = originalPrincipal / termMonths;

  // x-axis horizon: out to either maturity or end of GPU's physical life,
  // whichever is later. End of physical life = 1 / depRate.
  const physicalLifeYears = 1 / depreciationRatePerYear;
  const horizonYears = Math.max(termYears, physicalLifeYears);
  const horizonEnd = originationDate + horizonYears * yearMs;

  // Discrete monthly principal balance (step function): how many full monthly
  // payments have been made by time t?
  const monthsElapsedAt = (t) => Math.max(0, Math.min(termMonths, Math.floor((t - originationDate) / monthMs)));
  const principalAt = (t) => Math.max(0, originalPrincipal - monthsElapsedAt(t) * principalPerPayment);
  const principalFracAt = (t) => principalAt(t) / originalCollateral;
  // Collateral depreciates monthly too — same step cadence for consistency
  const collateralFracAt = (t) => {
    const monthsFromOrigin = Math.max(0, Math.floor((t - originationDate) / monthMs));
    return Math.max(0, 1 - (depreciationRatePerYear / 12) * monthsFromOrigin);
  };
  const ltvAt = (t) => {
    const c = collateralFracAt(t);
    return c > 0 ? principalFracAt(t) / c : 0;
  };

  // Build data points at every monthly payment cadence — emit one point
  // just BEFORE and one AT each payment date so the line steps cleanly.
  // (Recharts type="stepAfter" handles this rendering.)
  const points = [];
  const sampleAt = (t) => {
    const gpu = collateralFracAt(t);
    const principal = principalFracAt(t);
    const ltv = gpu > 0 ? principal / gpu : 0;
    return {
      t,
      gpu,
      principalLine: principal,
      cushionRange: [Math.min(principal, gpu), gpu],
      ltv,
      gpuUsd: gpu * originalCollateral,
      principalUsd: principal * originalCollateral,
      equityUsd: Math.max(0, (gpu - principal) * originalCollateral),
    };
  };
  // Origination
  points.push(sampleAt(originationDate));
  // Monthly payment dates
  const totalMonths = Math.ceil((horizonEnd - originationDate) / monthMs);
  for (let m = 1; m <= totalMonths; m++) {
    const t = originationDate + m * monthMs;
    if (t > horizonEnd) break;
    points.push(sampleAt(t));
  }
  // Always include the exact horizon end so the chart fills to the edge
  if (points[points.length - 1].t < horizonEnd) {
    points.push(sampleAt(horizonEnd));
  }

  // Today's snapshot for header tile. Prefer the ACTUAL remaining principal
  // from the API (which reflects whether the latest monthly payment has been
  // made yet) over the modeled step-function value.
  const todayGpu = collateralFracAt(now);
  const todayPrincipalUsdActual = (remainingPrincipal != null) ? remainingPrincipal : principalAt(now);
  const todayPrincipalFrac = todayPrincipalUsdActual / originalCollateral;
  const todayLtv = todayGpu > 0 ? todayPrincipalFrac / todayGpu : 0;
  const todayCollateralUsd = todayGpu * originalCollateral;
  const todayEquityUsd     = Math.max(0, todayCollateralUsd - todayPrincipalUsdActual);

  // Year-1 LTV for the header
  const y1Ltv = termYears >= 1 ? ltvAt(originationDate + yearMs) : null;

  const fmtPct = (v) => `${Math.round((v ?? 0) * 100)}%`;
  const fmtUsd = (n) => {
    if (n == null) return "—";
    if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(1)}K`;
    return `$${Math.round(n)}`;
  };
  const fmtDate = (v) => new Date(v).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  const fmtTooltipDate = (v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

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
        Model: straight-line amortization with equal monthly principal payments ({termMonths}-month term); bundle depreciation at {Math.round(depreciationRatePerYear * 100)}%/year linear
        (4-year useful life, conservative liquidation-recovery view).
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
              labelFormatter={fmtTooltipDate}
              formatter={(v, k, item) => {
                const p = item?.payload || {};
                if (k === "gpu")           return [`${fmtPct(v)} (${fmtUsd(p.gpuUsd)})`, "GPU collateral"];
                if (k === "principalLine") return [`${fmtPct(v)} (${fmtUsd(p.principalUsd)} · LTV ${fmtPct(p.ltv)})`, "Loan principal"];
                return [null, null];
              }} />
            {/* Cushion between the two lines */}
            <Area type="linear" dataKey="cushionRange" stroke="none" fill={accent} fillOpacity={0.18} isAnimationActive={false} legendType="none" />
            {/* Lines sampled at monthly cadence but rendered as a smooth linear connect */}
            <Line type="linear" dataKey="gpu"           stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="principalLine" stroke={accent}  strokeWidth={2} dot={false} isAnimationActive={false} />
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

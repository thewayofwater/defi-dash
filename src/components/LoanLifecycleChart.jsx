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
 * an 80% origination LTV "deleverages to approximately 65% LTV by end of
 * year one as principal pays down faster than collateral value declines."
 * Back-solving that example pins the depreciation rate at ~18%/year linear
 * (equivalent to a ~5.5-year physical useful life, or a ~46% residual at the
 * 3-year term mark). The NFT's `Useful Life (days): 1080` appears to be the
 * loan amortization period, not the GPU's physical depreciation lifetime.
 *
 * Y-axis carries two ratios on the same scale (matching USDai's reference):
 *   - GPU collateral line: % of original collateral (depreciation)
 *   - Loan line:           CURRENT LTV ratio (principal / current collateral)
 *
 * The shaded equity cushion is the area between the two lines.
 */
export default function LoanLifecycleChart({
  originationDate, maturityDate, originalPrincipal, originalCollateral,
  depreciationRatePerYear = 0.18,   // back-solved from USDai's published example
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
  const points = [];
  const N = 60;
  const sampleAt = (t) => {
    const y = (t - originationDate) / yearMs;
    const gpu = collateralFracAt(y);
    const ltv = ltvAt(y);
    const principal = principalFracAt(y);
    return {
      t,
      gpu,
      ltvLine: ltv,
      // Range Area: from LTV up to GPU, clamped so it never inverts.
      cushionRange: [Math.min(ltv, gpu), Math.max(ltv, gpu)],
      // $ values for tooltip
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
      <div style={{ fontSize: 9, color: "#4f5e6f", fontFamily: mono, marginBottom: 4 }}>
        Model: straight-line amortization to 0% over loan term; linear GPU depreciation at {Math.round(depreciationRatePerYear * 100)}%/year
        (back-solved from USDai's documented 80%→65% year-1 deleverage example).
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
                if (k === "gpu")     return [`${fmtPct(v)} (${fmtUsd(p.gpuUsd)})`, "GPU collateral"];
                if (k === "ltvLine") return [`${fmtPct(v)} (${fmtUsd(p.principalUsd)} principal)`, "Loan LTV"];
                return [null, null];
              }} />
            {/* Range Area for the cushion between the two lines (Recharts native pattern) */}
            <Area type="monotone" dataKey="cushionRange" stroke="none" fill={accent} fillOpacity={0.18} isAnimationActive={false} legendType="none" />
            {/* Lines on top */}
            <Line type="monotone" dataKey="gpu"     stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="ltvLine" stroke={accent}  strokeWidth={2} dot={false} isAnimationActive={false} />
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

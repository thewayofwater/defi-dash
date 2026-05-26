// Pure functions — no React. Used by UsdaiPage and Node smoke tests.

export const DCF_DEFAULTS = {
  utilization: 0.70,
  discountRate: 0.15,
  usefulLifeYears: 4,
  residualPct: 0.20,
  annualDecline: 0.25,
};

// implied $ per unit:
//   Σ_{t=1..life} [ dph₀ × (1−d)^(t−1) × 8760 × util / (1+r)^t ]
//   + residual_pct × replacement_cost / (1+r)^life
export function impliedValuePerUnit({ medianDph, replacementCost, params }) {
  const { utilization, discountRate, usefulLifeYears, residualPct, annualDecline } = params;
  if (medianDph == null || !Number.isFinite(medianDph) || medianDph <= 0) return null;
  let pv = 0;
  for (let t = 1; t <= usefulLifeYears; t++) {
    const cf = medianDph * Math.pow(1 - annualDecline, t - 1) * 8760 * utilization;
    pv += cf / Math.pow(1 + discountRate, t);
  }
  const salvage = (replacementCost ?? 0) * residualPct / Math.pow(1 + discountRate, usefulLifeYears);
  return pv + salvage;
}

// Returns `{ implied, attested, gap, gapPct, rentalSource, proxyUsed }` per GPU model.
// `rentalSource` records which gpu_name actually supplied the median $/hr.
// `proxyUsed` is the proxy gpu_name when the native one had no rental data.
export function modelComparison({ vastGpuName, vastProxy, replacementCost, rentals, attestedPerUnit, params }) {
  let r = vastGpuName ? rentals?.[vastGpuName] : null;
  let rentalSource = vastGpuName;
  let proxyUsed = null;
  if ((!r || r.medianDph == null) && vastProxy && rentals?.[vastProxy]?.medianDph != null) {
    r = rentals[vastProxy];
    rentalSource = vastProxy;
    proxyUsed = vastProxy;
  }
  const implied = impliedValuePerUnit({ medianDph: r?.medianDph, replacementCost, params });
  const gap = (implied != null && attestedPerUnit != null) ? implied - attestedPerUnit : null;
  const gapPct = (gap != null && attestedPerUnit) ? gap / attestedPerUnit : null;
  return { implied, attested: attestedPerUnit ?? null, gap, gapPct, rentalSource, proxyUsed, medianDph: r?.medianDph ?? null, listingCount: r?.listingCount ?? 0 };
}

// Group loans by hardware model. Returns { model, vastGpuName, replacementCost, units, attestedPerUnit }[]
// attestedPerUnit = (Σ loan.attestedUsd × hwSharePct) / Σ units across all loans with that model.
export function aggregateByModel(loans) {
  const byKey = new Map();
  for (const loan of loans || []) {
    if (loan.attestedUsd == null || !loan.hardware?.length) continue;
    const totalCount = loan.hardware.reduce((s, h) => s + (h.count || 0), 0);
    if (!totalCount) continue;
    for (const h of loan.hardware) {
      const key = (h.name || "").replace(/^NVIDIA\s+/i, "").trim();
      if (!key || !h.count) continue;
      const shareUsd = loan.attestedUsd * ((h.count || 0) / totalCount);
      const e = byKey.get(key) || { model: key, vastGpuName: h.vastGpuName, vastProxy: h.vastProxy, replacementCost: h.replacementCost, units: 0, totalAttestedUsd: 0 };
      e.units += h.count;
      e.totalAttestedUsd += shareUsd;
      e.vastGpuName = e.vastGpuName ?? h.vastGpuName;
      e.vastProxy = e.vastProxy ?? h.vastProxy;
      e.replacementCost = e.replacementCost ?? h.replacementCost;
      byKey.set(key, e);
    }
  }
  return [...byKey.values()].map(e => ({
    ...e,
    attestedPerUnit: e.units > 0 ? e.totalAttestedUsd / e.units : null,
  }));
}

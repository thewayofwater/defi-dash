import { impliedValuePerUnit, modelComparison, aggregateByModel, DCF_DEFAULTS } from "../src/utils/usdai-dcf.js";

// H100 worked example:
//   $2/hr, 8760, util 0.7, disc 0.15, life 4, decline 0.25, residual 0.20, replacement 27000
//   rental annuity ≈ 25.1k, salvage ≈ 3.1k → ~28.2k
const out = impliedValuePerUnit({
  medianDph: 2.0,
  replacementCost: 27_000,
  params: DCF_DEFAULTS,
});
console.log("H100 implied:", out.toFixed(2));
if (Math.abs(out - 28200) > 500) { console.error("DCF result off, expected ~28.2k"); process.exit(1); }

// No rental → null
const none = impliedValuePerUnit({ medianDph: null, replacementCost: 27_000, params: DCF_DEFAULTS });
if (none !== null) { console.error("expected null for no rental"); process.exit(1); }

// modelComparison wiring
const cmp = modelComparison({
  vastGpuName: "H100 SXM",
  replacementCost: 27_000,
  rentals: { "H100 SXM": { medianDph: 2.0 } },
  attestedPerUnit: 25_000,
  params: DCF_DEFAULTS,
});
console.log("comparison:", cmp);
if (cmp.implied == null || cmp.gap == null) { console.error("comparison missing fields"); process.exit(1); }

// aggregateByModel: single mixed loan
const aggs = aggregateByModel([{
  attestedUsd: 100_000,
  hardware: [
    { name: "H200", count: 8, vastGpuName: "H200", replacementCost: 33_000 },
    { name: "B200", count: 2, vastGpuName: "B200", replacementCost: 50_000 },
  ],
}]);
console.log("aggs:", aggs);
if (aggs.length !== 2) { console.error("expected 2 models"); process.exit(1); }
const h = aggs.find(a => a.model === "H200");
if (h.units !== 8) { console.error("H200 units wrong"); process.exit(1); }
if (Math.abs(h.attestedPerUnit - 10_000) > 1) { console.error("H200 per-unit wrong, expected 10k"); process.exit(1); }

console.log("OK");

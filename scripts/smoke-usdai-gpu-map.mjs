import { lookupGpu, normalizeHardwareName, distinctVastNames } from "../src/utils/usdai-gpu-map.js";

const cases = [
  ["B200 [96] (Escrowed)", "B200", "B200"],
  ["NVIDIA B300 [72]",     "B300", null],
  ["RTX PRO 6000 [1]",     "RTX PRO 6000", "RTX PRO 6000 WS"],
  ["RTX PRO 6000 Blackwell", "RTX PRO 6000 Blackwell", "RTX PRO 6000 WS"],
  ["H200 [75]",            "H200", "H200"],
  ["RTX 5090 [15]",        "RTX 5090", "RTX 5090"],
];

let failed = 0;
for (const [raw, expectedNorm, expectedVast] of cases) {
  const norm = normalizeHardwareName(raw);
  const m = lookupGpu(raw);
  const vast = m?.vast ?? null;
  const ok = norm === expectedNorm && vast === expectedVast;
  console.log(`${ok ? "PASS" : "FAIL"}  ${raw}  → norm=${norm} vast=${vast}`);
  if (!ok) failed++;
}

const distinct = distinctVastNames([
  { name: "B200 [96]" },
  { name: "H200 [75]" },
  { name: "B300 [72]" },
  { name: "RTX 5090 [15]" },
]);
const ok = distinct.length === 3 && distinct.includes("B200") && distinct.includes("H200") && distinct.includes("RTX 5090");
console.log(`${ok ? "PASS" : "FAIL"}  distinctVastNames → ${JSON.stringify(distinct)}`);
if (!ok) failed++;

if (failed) { console.error(`${failed} failure(s)`); process.exit(1); }
console.log("all smoke checks passed");

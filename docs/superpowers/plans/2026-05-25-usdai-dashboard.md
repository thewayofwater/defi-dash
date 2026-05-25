# USDai Dashboard Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `/usdai` protocol page that shows USDai's loans, cash/loan reserves split, a 3D globe of GPU collateral locations, and a live DCF cross-check of GPU collateral value vs. USDai's own attested value using Vast.ai rental rates.

**Architecture:** One Vercel serverless aggregator at `/api/usdai.js` calls USDai's public REST (`api.usd.ai`), NFT metadata (`metadata.usd.ai`), and Vast.ai bundles in two phases (USDai data → fan out to Vast.ai per discovered GPU model). A React hook drives the page, which renders five modules: KPI header, reserves/TVL history, active-loans table coupled to a lazy-loaded `react-globe.gl` globe, GPU-collateral cross-check with five DCF sliders, and a T-Bills table.

**Tech Stack:** React 18 + Vite + react-router-dom + recharts (existing) + react-globe.gl + three (new, lazy-loaded). Backend: Node fetch in Vercel functions. No test framework — verification is via Node smoke scripts + `preview_*` visual screenshots.

**Spec:** `docs/superpowers/specs/2026-05-25-usdai-dashboard-design.md`

**Testing note:** This codebase has no unit-test framework. Each task ends with a *verification* step (curl probe of API, Node smoke script, or `preview_screenshot` of the page). Treat verification as the equivalent of a passing test — do not commit until verification succeeds.

---

## Task 0: Probe live APIs and lock down the unknowns

**Goal:** Resolve the three known unknowns from the spec before writing code. Produce a short notes file documenting the answers. No code changes yet.

**Files:**
- Create: `docs/superpowers/plans/2026-05-25-usdai-api-notes.md` (temp notes, will be committed with Task 1)

- [ ] **Step 1: Probe `proof-of-reserves` for stage values + check the live UI**

Run:
```bash
curl -s 'https://api.usd.ai/usdai/dashboard/proof-of-reserves' | python3 -c "
import json,sys
d=json.load(sys.stdin)
deals=[x for x in d if x.get('type')=='DEAL']
from collections import Counter
print('DEAL count:', len(deals))
print('stage values:', Counter(x.get('stage') for x in deals))
print('escrowed values:', Counter(x.get('escrowed') for x in deals))
print('escrow values:', Counter(x.get('escrow') for x in deals))
"
```
Expected output: counts per stage value. Also open `https://app.usd.ai/loans` in a browser and note how many loans appear under "Deployed" vs "Upcoming" tabs.

Cross-reference: the stage value that appears N times where N matches the "Deployed" count is the deployed stage. All other stage values group under "Upcoming". Confirmed today: stage `6` = Deployed (24+ rows), stages 1–4 + null = Upcoming. **The implementer must re-verify because counts change as loans cycle.**

- [ ] **Step 2: Verify NFT metadata join key**

Run:
```bash
curl -s 'https://metadata.usd.ai/v1/1002' | python3 -m json.tool
```
Expected: returns JSON with `name`, `attributes[].trait_type == "Collateral Value USD"`. Confirm `name` matches a `proof-of-reserves` row name (e.g. `"NVIDIA B300 [72]"`).

Then enumerate the discovered tokenId ranges to test which IDs return 200 vs 404:
```bash
for id in 101 215 250 251 262 263 300 301 353 354 400 401 500 1001 1003 1004; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "https://metadata.usd.ai/v1/$id")
  echo "id=$id status=$status"
done
```
Record the working ranges. (Starting point per prior research: 101–215, 251–262, 301–353, 401+, 1001–1003.)

**Decision:** the join from a loan to its NFT will be **by `name` equality** (e.g. `"H200 [75]"` matches across both). The serverless function will iterate over known tokenId ranges, build a `{name → tokenId, collateralValueUsd}` map per refresh, and join.

- [ ] **Step 3: Verify Vast.ai gpu_name for RTX PRO 6000 Blackwell**

Run:
```bash
curl -sG 'https://cloud.vast.ai/api/v0/bundles/' \
  --data-urlencode 'q={"gpu_name":{"in":["RTX_6000Ada","RTX_PRO_6000","RTX_PRO_6000_Blackwell"]},"rentable":{"eq":true},"limit":5}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('count:', len(d.get('offers',[]))); print('gpu_names:', set(o.get('gpu_name') for o in d.get('offers',[])))"
```
And similarly try `B300`:
```bash
curl -sG 'https://cloud.vast.ai/api/v0/bundles/' \
  --data-urlencode 'q={"gpu_name":{"eq":"B300"},"rentable":{"eq":true},"limit":5}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('B300 offers:', len(d.get('offers',[])))"
```
Record exact `gpu_name` values present (or "absent"). Expected: B300 absent (too new); RTX PRO 6000 Blackwell likely absent — falls back to `null` in the map with `note: "no rental data"`.

- [ ] **Step 4: Write findings to the notes file**

Create `docs/superpowers/plans/2026-05-25-usdai-api-notes.md` with the following exact structure (fill in the actual probed values):
```markdown
# USDai API probe notes (2026-05-25)

## Stage → status mapping
- Stage 6 → Deployed (count: N)
- Stages [list]/null → Upcoming (count: M)
- escrowed boolean field: true → show "(Escrowed)" chip; null/false → no chip

## NFT metadata tokenId ranges (verified working)
- [101, 215]
- [251, 262]
- [301, 353]
- [401, X]
- [1001, 1003]
(adjust per probe)

## Loan ↔ NFT join key
By exact `name` match. Loan row "H200 [75]" → metadata.usd.ai NFT with same name.

## Vast.ai gpu_name overrides
- B300: NOT FOUND on Vast.ai → vast: null
- RTX PRO 6000 Blackwell: NOT FOUND → vast: null
- (note any others discovered)
```

- [ ] **Step 5: No commit yet** — these notes ride along with Task 1's commit.

---

## Task 1: Create GPU mapping module

**Goal:** Static map of USDai hardware labels → Vast.ai gpu_name + replacement cost + per-model default useful life, with a normalize helper.

**Files:**
- Create: `src/utils/usdai-gpu-map.js`
- Create: `scripts/smoke-usdai-gpu-map.mjs`

- [ ] **Step 1: Create the mapping module**

Create `src/utils/usdai-gpu-map.js`:
```js
// USDai hardware-label → market metadata.
// Update replacementCost quarterly from NVIDIA list / OEM channel pricing.
// `vast` = Vast.ai `gpu_name` enum value; null means no rental data available.
// `life` = default useful life in years for this model (slider overrideable).

export const USDAI_GPU_MAP = {
  "H100":                    { vast: "H100_SXM",  life: 4, replacementCost: 27_000 },
  "H100 SXM":                { vast: "H100_SXM",  life: 4, replacementCost: 27_000 },
  "H100 PCIe":               { vast: "H100_PCIE", life: 4, replacementCost: 25_000 },
  "H200":                    { vast: "H200",      life: 4, replacementCost: 33_000 },
  "B200":                    { vast: "B200",      life: 5, replacementCost: 50_000 },
  "B300":                    { vast: null,        life: 5, replacementCost: 65_000, note: "no rental data" },
  "RTX PRO 6000":            { vast: null,        life: 4, replacementCost: 10_000, note: "no rental data" },
  "RTX PRO 6000 Blackwell":  { vast: null,        life: 4, replacementCost: 10_000, note: "no rental data" },
  "RTX 5090":                { vast: "RTX_5090",  life: 4, replacementCost: 2_500 },
  "RTX 4090":                { vast: "RTX_4090",  life: 4, replacementCost: 1_800 },
  "A100":                    { vast: "A100_SXM4", life: 4, replacementCost: 12_000 },
  "A100 PCIe":               { vast: "A100_PCIE", life: 4, replacementCost: 11_000 },
  "L40S":                    { vast: "L40S",      life: 4, replacementCost: 7_000 },
};

// Normalize USDai hardware names. Examples:
//   "B200 [96] (Escrowed)"  → "B200"
//   "RTX PRO 6000 Blackwell" → "RTX PRO 6000 Blackwell"
//   "H200" → "H200"
export function normalizeHardwareName(raw) {
  if (!raw || typeof raw !== "string") return null;
  return raw
    .replace(/\s*\[\d+\]\s*/g, "")    // strip "[N]" count
    .replace(/\s*\(.*?\)\s*/g, "")    // strip "(...)" status chips
    .replace(/^NVIDIA\s+/i, "")       // strip "NVIDIA " prefix
    .trim();
}

// Look up a mapping by normalized name. Falls back to longest-prefix match
// so "RTX PRO 6000 Blackwell" matches "RTX PRO 6000" entry if the specific
// variant isn't in the table.
export function lookupGpu(rawName) {
  const norm = normalizeHardwareName(rawName);
  if (!norm) return null;
  if (USDAI_GPU_MAP[norm]) return { key: norm, ...USDAI_GPU_MAP[norm] };
  // longest-prefix fallback
  const keys = Object.keys(USDAI_GPU_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (norm.startsWith(k)) return { key: k, ...USDAI_GPU_MAP[k], matched: "prefix" };
  }
  return null;
}

// Distinct Vast.ai gpu_name values to query for a given set of hardware entries.
export function distinctVastNames(hardwareEntries) {
  const out = new Set();
  for (const h of hardwareEntries) {
    const m = lookupGpu(h.name || h);
    if (m?.vast) out.add(m.vast);
  }
  return [...out];
}
```

- [ ] **Step 2: Write the smoke test**

Create `scripts/smoke-usdai-gpu-map.mjs`:
```js
import { lookupGpu, normalizeHardwareName, distinctVastNames } from "../src/utils/usdai-gpu-map.js";

const cases = [
  ["B200 [96] (Escrowed)", "B200", "B200"],
  ["NVIDIA B300 [72]",     "B300", null],
  ["RTX PRO 6000 [1]",     "RTX PRO 6000", null],
  ["RTX PRO 6000 Blackwell", "RTX PRO 6000 Blackwell", null],
  ["H200 [75]",            "H200", "H200"],
  ["RTX 5090 [15]",        "RTX 5090", "RTX_5090"],
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
const ok = distinct.length === 3 && distinct.includes("B200") && distinct.includes("H200") && distinct.includes("RTX_5090");
console.log(`${ok ? "PASS" : "FAIL"}  distinctVastNames → ${JSON.stringify(distinct)}`);
if (!ok) failed++;

if (failed) { console.error(`${failed} failure(s)`); process.exit(1); }
console.log("all smoke checks passed");
```

- [ ] **Step 3: Run the smoke test**

Run: `node scripts/smoke-usdai-gpu-map.mjs`
Expected: all PASS, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/utils/usdai-gpu-map.js scripts/smoke-usdai-gpu-map.mjs \
        docs/superpowers/plans/2026-05-25-usdai-api-notes.md
git commit -m "USDai: add GPU mapping utility and API probe notes"
```

---

## Task 2: Serverless `/api/usdai.js` — Phase 1 (USDai endpoints only)

**Goal:** Aggregate USDai's public endpoints into one payload. No Vast.ai, no NFT metadata yet — those are layered on in Task 3 and Task 4.

**Files:**
- Create: `api/usdai.js`

- [ ] **Step 1: Implement Phase 1 aggregator**

Create `api/usdai.js`:
```js
const USDAI = "https://api.usd.ai/usdai";
const LLAMA = "https://api.llama.fi/protocol/usd-ai";

// Stage codes confirmed via proof-of-reserves probe (see plan Task 0 notes).
// Update if USDai changes the schema.
const STAGE_DEPLOYED = 6;

async function fetchJson(url, timeoutMs = 8000) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) throw new Error(`${url} → ${resp.status}`);
  return resp.json();
}

async function safe(promise, label, warnings) {
  try { return await promise; }
  catch (e) { warnings.push(`${label}: ${e.message}`); return null; }
}

// Convert 18-decimal wei string to a Number USD value.
function fromWei18(s) {
  if (!s) return 0;
  return Number(BigInt(s)) / 1e18;
}

function parseLoanRow(d) {
  return {
    documentId: d.documentId,
    name: d.name,
    stage: d.stage,
    isDeployed: d.stage === STAGE_DEPLOYED,
    isEscrowed: Boolean(d.escrowed),
    borrower: d.borrower,
    chain: d.chain,
    principal: fromWei18(d.amount),
    apr: d.apr,
    termSeconds: d.term,
    termDays: d.term ? Math.round(d.term / 86400) : null,
    offTake: d.offTake,
    group: d.group,
    location: (d.locationLatitude != null && d.locationLongitude != null)
      ? { name: d.locationName, lat: d.locationLatitude, lng: d.locationLongitude }
      : null,
    hardware: Array.isArray(d.hardware) ? d.hardware.map(h => ({
      name: h.name,
      count: h.count,
      percentage: h.percentage,
    })) : [],
  };
}

function parseTbillRow(d) {
  return {
    name: d.name,
    chain: d.chain,
    apy: d.apy,
    amount: fromWei18(d.amount),
    iconUrl: d.iconUrl,
    reserveLink: d.reserveLink,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  const warnings = [];

  const [tvl, por, util, currentApy, expectedApy, netApy, supplyUsdai, supplySusdai, llama] = await Promise.all([
    safe(fetchJson(`${USDAI}/dashboard/tvl`),              "tvl",          warnings),
    safe(fetchJson(`${USDAI}/dashboard/proof-of-reserves`),"proof",        warnings),
    safe(fetchJson(`${USDAI}/dashboard/utilization`),      "utilization",  warnings),
    safe(fetchJson(`${USDAI}/dashboard/current-apy`),      "currentApy",   warnings),
    safe(fetchJson(`${USDAI}/dashboard/expected-apy`),     "expectedApy",  warnings),
    safe(fetchJson(`${USDAI}/dashboard/net-apy`),          "netApy",       warnings),
    safe(fetchJson(`${USDAI}/public/usdai-supply`),        "usdaiSupply",  warnings),
    safe(fetchJson(`${USDAI}/public/susdai-supply`),       "susdaiSupply", warnings),
    safe(fetchJson(LLAMA),                                 "llama",        warnings),
  ]);

  if (!tvl && !llama) {
    return res.status(502).json({ error: "USDai + DeFiLlama both unreachable", warnings });
  }

  // Reserves: prefer api.usd.ai/dashboard/tvl, fallback to DeFiLlama chain TVLs.
  const reserves = tvl
    ? {
        stablecoin: tvl.stablecoinReserves,
        loans: tvl.loansReserves,
        total: tvl.tvl,
      }
    : {
        stablecoin: null,
        loans: llama?.currentChainTvls?.["Arbitrum-borrowed"] ?? null,
        total: llama?.currentChainTvls?.Arbitrum ?? null,
      };

  // TVL history: USDai endpoint, fallback DeFiLlama.
  // DeFiLlama returns `tvl[]` with {date, totalLiquidityUSD}; we only get total there, not split.
  const tvlHistory = (llama?.tvl || []).map((p) => ({
    date: p.date * 1000,
    stablecoin: null,  // unknown from llama, only total
    loans: null,
    total: p.totalLiquidityUSD,
  }));
  // (If api.usd.ai/dashboard returns richer history, swap this in — see Task 0 notes.)

  const por_array = por || [];
  const loans = por_array.filter(x => x.type === "DEAL").map(parseLoanRow);
  const tbills = por_array.filter(x => x.type === "TBILL").map(parseTbillRow);

  const kpis = {
    tvl: reserves.total,
    currentApy: currentApy?.result ?? null,
    expectedApy: expectedApy?.result ?? null,
    netApy: netApy?.result ?? null,
    utilization: util?.result ?? null,
    usdaiSupply: supplyUsdai ? Number(BigInt(supplyUsdai)) / 1e18 : null,
    susdaiSupply: supplySusdai ? Number(BigInt(supplySusdai)) / 1e18 : null,
    mintedUsdai: tvl?.mintedUsdai ?? null,
  };

  return res.status(200).json({
    updatedAt: new Date().toISOString(),
    kpis,
    reserves,
    tvlHistory,
    loans,
    tbills,
    gpuRentals: {},  // populated in Task 4
    warnings,
  });
}
```

- [ ] **Step 2: Smoke test against local dev**

The project's API functions are designed for Vercel. The fastest way to test locally is to invoke the handler directly. Create `scripts/smoke-api-usdai.mjs`:
```js
import handler from "../api/usdai.js";

const res = {
  _status: 200, _body: null, _headers: {},
  setHeader(k,v){ this._headers[k]=v; },
  status(c){ this._status=c; return this; },
  json(b){ this._body=b; return this; },
};
await handler({}, res);

const d = res._body;
console.log("status:", res._status);
console.log("warnings:", d.warnings);
console.log("kpis:", d.kpis);
console.log("reserves:", d.reserves);
console.log("loans count:", d.loans?.length);
console.log("tbills count:", d.tbills?.length);
console.log("tvlHistory points:", d.tvlHistory?.length);

const required = ["updatedAt", "kpis", "reserves", "tvlHistory", "loans", "tbills", "gpuRentals", "warnings"];
const missing = required.filter(k => !(k in d));
if (missing.length) { console.error("MISSING keys:", missing); process.exit(1); }

if (!d.loans || d.loans.length === 0) { console.error("no loans"); process.exit(1); }
const firstLoan = d.loans[0];
for (const f of ["documentId", "name", "stage", "principal", "apr", "termDays", "hardware"]) {
  if (!(f in firstLoan)) { console.error("loan missing field:", f); process.exit(1); }
}

console.log("first loan:", JSON.stringify(firstLoan, null, 2));
console.log("OK");
```

- [ ] **Step 3: Run the smoke test**

Run: `node scripts/smoke-api-usdai.mjs`
Expected output: non-zero `loans count`, KPIs populated (`tvl ≈ 397M`, `currentApy ≈ 7`), exit 0, no missing fields.

- [ ] **Step 4: Commit**

```bash
git add api/usdai.js scripts/smoke-api-usdai.mjs
git commit -m "USDai: serverless aggregator phase 1 (USDai endpoints + DeFiLlama fallback)"
```

---

## Task 3: Add NFT metadata join for attested collateral USD

**Goal:** Enrich each loan with `attestedUsd` and per-NFT `usefulLifeDays` by enumerating known tokenId ranges on `metadata.usd.ai` and joining by `name`.

**Files:**
- Modify: `api/usdai.js`

- [ ] **Step 1: Add tokenId ranges constant and fetch helpers**

Modify `api/usdai.js`. Above the `handler` function, add:
```js
// Verified working tokenId ranges on metadata.usd.ai/v1/<id>.
// Update if USDai mints new ranges (see Task 0 notes).
const TOKEN_ID_RANGES = [
  [101, 215],
  [251, 262],
  [301, 353],
  [401, 500],
  [1001, 1010],
];

async function fetchMetadata(tokenId) {
  try {
    const r = await fetch(`https://metadata.usd.ai/v1/${tokenId}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = await r.json();
    const attrs = Object.fromEntries((j.attributes || []).map(a => [a.trait_type, a.value]));
    return {
      tokenId,
      name: j.name,
      collateralValueUsd: typeof attrs["Collateral Value USD"] === "number" ? attrs["Collateral Value USD"] : null,
      usefulLifeDays: typeof attrs["Useful Life (days)"] === "number" ? attrs["Useful Life (days)"] : null,
      quantity: typeof attrs["Quantity"] === "number" ? attrs["Quantity"] : null,
      manufacturer: attrs["Manufacturer"] || null,
    };
  } catch { return null; }
}

// Fetch all tokens across ranges with bounded concurrency.
async function fetchAllMetadata() {
  const ids = [];
  for (const [lo, hi] of TOKEN_ID_RANGES) {
    for (let i = lo; i <= hi; i++) ids.push(i);
  }
  const results = [];
  const CONCURRENCY = 12;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const rows = await Promise.all(batch.map(fetchMetadata));
    results.push(...rows.filter(Boolean));
  }
  return results;
}
```

- [ ] **Step 2: Build name → metadata index and enrich loans inside `handler`**

In `handler`, immediately after the `const por_array = ...` line, add:
```js
const metadataList = await safe(fetchAllMetadata(), "metadata", warnings) || [];
const nameToMeta = new Map();
for (const m of metadataList) {
  if (m.name && m.collateralValueUsd != null) {
    // If multiple NFTs share a name (shouldn't happen for active loans), keep the highest value.
    const prev = nameToMeta.get(m.name);
    if (!prev || m.collateralValueUsd > prev.collateralValueUsd) nameToMeta.set(m.name, m);
  }
}
```

Then change the `loans` line from:
```js
const loans = por_array.filter(x => x.type === "DEAL").map(parseLoanRow);
```
to:
```js
const loans = por_array.filter(x => x.type === "DEAL").map(parseLoanRow).map(loan => {
  const meta = nameToMeta.get(loan.name);
  return {
    ...loan,
    tokenId: meta?.tokenId ?? null,
    attestedUsd: meta?.collateralValueUsd ?? null,
    attestedUsefulLifeDays: meta?.usefulLifeDays ?? null,
    manufacturer: meta?.manufacturer ?? null,
  };
});
```

- [ ] **Step 3: Update the smoke test**

Modify `scripts/smoke-api-usdai.mjs` — add after the existing first-loan dump:
```js
const withAttested = d.loans.filter(l => l.attestedUsd != null).length;
console.log(`loans with attestedUsd: ${withAttested}/${d.loans.length}`);
if (withAttested === 0) { console.error("ZERO loans got attestedUsd — join is broken"); process.exit(1); }
```

- [ ] **Step 4: Run smoke test**

Run: `node scripts/smoke-api-usdai.mjs`
Expected: at least 20+ loans have `attestedUsd`, no fatal warnings.

- [ ] **Step 5: Commit**

```bash
git add api/usdai.js scripts/smoke-api-usdai.mjs
git commit -m "USDai: join loans to NFT metadata for attested collateral USD"
```

---

## Task 4: Add Vast.ai phase for live rental rates

**Goal:** For each distinct Vast.ai gpu_name surfaced by Task 3's loans, fetch live `bundles` listings, compute median/p25/p75 $/hr, and return in `gpuRentals`.

**Files:**
- Modify: `api/usdai.js`

- [ ] **Step 1: Add Vast.ai fetch helper near the top of `api/usdai.js`**

After `fetchAllMetadata`, before `handler`:
```js
import { distinctVastNames, USDAI_GPU_MAP } from "../src/utils/usdai-gpu-map.js";

async function fetchVastRentals(vastGpuName) {
  const q = encodeURIComponent(JSON.stringify({
    gpu_name: { eq: vastGpuName },
    rentable: { eq: true },
    order: [["dph_total", "asc"]],
    limit: 200,
  }));
  try {
    const r = await fetch(`https://cloud.vast.ai/api/v0/bundles/?q=${q}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { error: `Vast.ai ${vastGpuName} ${r.status}` };
    const data = await r.json();
    const offers = data?.offers || [];
    if (!offers.length) return { medianDph: null, p25Dph: null, p75Dph: null, listingCount: 0 };
    const dph = offers
      .map(o => Number(o.dph_total))
      .filter(x => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    const pick = (p) => dph[Math.min(dph.length - 1, Math.floor(dph.length * p))];
    return {
      medianDph: pick(0.50),
      p25Dph:    pick(0.25),
      p75Dph:    pick(0.75),
      listingCount: dph.length,
    };
  } catch (e) {
    return { error: e.message };
  }
}
```

- [ ] **Step 2: Wire it into `handler` after loans are built**

In `handler`, after `const loans = ...` block, before the final `return res.status(200).json(...)`:
```js
const vastNames = distinctVastNames(loans.flatMap(l => l.hardware));
const rentalsArr = await Promise.all(vastNames.map(async (name) => {
  const r = await fetchVastRentals(name);
  if (r.error) warnings.push(`vast ${name}: ${r.error}`);
  return [name, { ...r, updatedAt: new Date().toISOString() }];
}));
const gpuRentals = Object.fromEntries(rentalsArr);
```
And in the response, change `gpuRentals: {}` to `gpuRentals`.

- [ ] **Step 3: Annotate each loan's hardware with its mapped `vastGpuName` and `replacementCost`**

Right where the loans are enriched with attested data (in Task 3), extend the `hardware` mapping to also attach the lookup result. Replace the `hardware: [...]` field of the returned loan with:
```js
hardware: loan.hardware.map(h => {
  // Inline import — already imported at module top.
  const m = USDAI_GPU_MAP[h.name?.replace(/^NVIDIA\s+/i, "").trim()] || null;
  return {
    name: h.name,
    count: h.count,
    percentage: h.percentage,
    vastGpuName: m?.vast ?? null,
    replacementCost: m?.replacementCost ?? null,
    defaultLifeYears: m?.life ?? null,
  };
}),
```
**Note:** for clarity, use the existing `lookupGpu` helper from the GPU map module instead of re-importing the raw object. Replace the import line at the top with:
```js
import { distinctVastNames, lookupGpu } from "../src/utils/usdai-gpu-map.js";
```
and replace the body of the map with:
```js
hardware: loan.hardware.map(h => {
  const m = lookupGpu(h.name);
  return {
    name: h.name,
    count: h.count,
    percentage: h.percentage,
    vastGpuName: m?.vast ?? null,
    replacementCost: m?.replacementCost ?? null,
    defaultLifeYears: m?.life ?? null,
  };
}),
```

- [ ] **Step 4: Extend smoke test**

Modify `scripts/smoke-api-usdai.mjs` — add at the end before `console.log("OK")`:
```js
console.log("gpuRentals keys:", Object.keys(d.gpuRentals));
const populated = Object.values(d.gpuRentals).filter(v => v.medianDph != null);
console.log(`gpuRentals with medianDph: ${populated.length}/${Object.keys(d.gpuRentals).length}`);
if (populated.length === 0) console.warn("WARN: zero Vast.ai medians populated (may be transient)");
```

- [ ] **Step 5: Run smoke test**

Run: `node scripts/smoke-api-usdai.mjs`
Expected: `gpuRentals keys` includes at least `H200` and `B200`, both with non-null `medianDph` (typical: H200 ≈ $2-4/hr, B200 ≈ $4-6/hr).

- [ ] **Step 6: Commit**

```bash
git add api/usdai.js scripts/smoke-api-usdai.mjs
git commit -m "USDai: fetch live Vast.ai rentals per GPU model"
```

---

## Task 5: `useUsdaiData` hook

**Goal:** React hook that fetches `/api/usdai`, manages loading/refresh state, exposes `data`, `lastUpdated`, `refresh()`, matching `useMapleData` shape.

**Files:**
- Create: `src/hooks/useUsdaiData.js`

- [ ] **Step 1: Create the hook**

```js
import { useCallback, useEffect, useState } from "react";

export function useUsdaiData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(async (isRefresh) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const r = await fetch("/api/usdai", { cache: "no-store" });
      if (!r.ok) throw new Error(`/api/usdai ${r.status}`);
      const j = await r.json();
      setData(j);
      setLastUpdated(new Date());
      setRefreshKey(k => k + 1);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(false); }, [fetchData]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, refreshing, error, lastUpdated, refreshKey, refresh };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useUsdaiData.js
git commit -m "USDai: data fetching hook"
```

(No standalone smoke test for the hook — it's exercised when the page renders in Task 6.)

---

## Task 6: Page skeleton, route, nav link

**Goal:** A bare `/usdai` route that renders a placeholder with the header and a loading state. Confirms wiring before any module is built.

**Files:**
- Create: `src/pages/UsdaiPage.jsx`
- Modify: `src/main.jsx`
- Modify: `src/components/NavBar.jsx`

- [ ] **Step 1: Create the page**

`src/pages/UsdaiPage.jsx`:
```jsx
import React from "react";
import { useUsdaiData } from "../hooks/useUsdaiData";
import { SectionHeader, LoadingSpinner, ModuleCard } from "../components/Shared";

const mono = "'JetBrains Mono', monospace";
export const USDAI_ACCENT = "#c8b88a";

export default function UsdaiPage() {
  const { data, loading, error, refreshing, lastUpdated, refreshKey, refresh } = useUsdaiData();

  if (error) {
    return (
      <div style={{ padding: 40, color: "#f87171", fontFamily: mono, textAlign: "center" }}>
        Failed to load USDai data: {error}
      </div>
    );
  }
  if (loading) {
    return (
      <div style={{ background: "#0a0e17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner message="Loading USDai data..." />
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0e17", color: "#e2e8f0", minHeight: "100vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ padding: "20px 26px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
              USDai
              <span style={{ color: USDAI_ACCENT, marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: mono, verticalAlign: "middle", background: `${USDAI_ACCENT}1a`, padding: "2px 7px", borderRadius: 3, letterSpacing: 1 }}>
                GPU CREDIT / RWA
              </span>
            </h1>
            <div style={{ fontSize: 12, color: "#4f5e6f", marginTop: 2, fontFamily: mono }}>
              Live data from api.usd.ai{lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            </div>
          </div>
          <button onClick={refresh} disabled={refreshing}
            style={{ background: refreshing ? `${USDAI_ACCENT}26` : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "7px 14px", fontSize: 11, fontFamily: mono, color: refreshing ? USDAI_ACCENT : "#94a3b8", cursor: refreshing ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none", fontSize: 13 }}>↻</span>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 24 }} key={refreshKey}>
        {data?.warnings?.length > 0 && (
          <div style={{ fontSize: 11, fontFamily: mono, color: "#fbbf24", padding: "6px 10px", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 5, background: "rgba(251,191,36,0.05)" }}>
            {data.warnings.length} partial data warning(s): {data.warnings.slice(0,3).join(" · ")}
          </div>
        )}

        <ModuleCard>
          <SectionHeader title="USDai" subtitle="Page modules are added by subsequent tasks" />
          <pre style={{ fontSize: 10, color: "#94a3b8", overflow: "auto", maxHeight: 300 }}>
            {JSON.stringify({
              kpis: data?.kpis,
              reserves: data?.reserves,
              loans_count: data?.loans?.length,
              tbills_count: data?.tbills?.length,
              gpuRentals: data?.gpuRentals,
            }, null, 2)}
          </pre>
        </ModuleCard>

        <div style={{ textAlign: "center", padding: "12px 0", fontSize: 10, color: "#3a4a5a", fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.025)" }}>
          USDai Dashboard · Data: api.usd.ai · metadata.usd.ai · cloud.vast.ai
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route in `src/main.jsx`**

In `src/main.jsx`, add the import alongside other page imports:
```js
import UsdaiPage from "./pages/UsdaiPage";
```
And add the route inside `<Routes>`, alphabetically next to other protocols:
```jsx
<Route path="/usdai" element={<UsdaiPage />} />
```

- [ ] **Step 3: Add the nav link**

In `src/components/NavBar.jsx`, inside the Protocols nav-link block, between `{navLink("/sparklend", "SparkLend", "✦")}` and `{navLink("/wbtc", "WBTC", "₿")}`, add:
```jsx
{navLink("/usdai", "USDai", "◈")}
```

- [ ] **Step 4: Verify in the browser via preview**

Start `npm run dev` (background). Use `preview_start` + `preview_screenshot` on `http://localhost:5173/usdai`.
Expected: nav shows USDai entry; page renders header strip with sand-colored "GPU CREDIT / RWA" badge; below it a JSON dump shows non-empty `kpis.tvl`, `loans_count > 0`, and `gpuRentals` with at least 1–2 entries.

- [ ] **Step 5: Commit**

```bash
git add src/pages/UsdaiPage.jsx src/main.jsx src/components/NavBar.jsx
git commit -m "USDai: page skeleton with route + nav link"
```

---

## Task 7: Header KPI tiles

**Goal:** Replace the JSON-dump placeholder with five KPI tiles (TVL, Current APY, Expected APY, Utilization, sUSDai supply).

**Files:**
- Modify: `src/pages/UsdaiPage.jsx`

- [ ] **Step 1: Add the KPI tile component at the top of the file**

Inside `src/pages/UsdaiPage.jsx`, before the default export, add:
```jsx
function Kpi({ label, value, sub, accent }) {
  return (
    <div style={{
      flex: 1, minWidth: 120, padding: "10px 14px",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 9, fontFamily: mono, color: "#6b7a8d", letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent || "#e2e8f0", fontFamily: mono, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#4f5e6f", fontFamily: mono, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const fmtUsdShort = (n) => {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n/1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
};
const fmtPct1 = (n) => n == null ? "—" : `${n.toFixed(2)}%`;
```

- [ ] **Step 2: Add the KPI strip and remove the JSON-dump ModuleCard**

In the JSX of `UsdaiPage`, replace the placeholder `<ModuleCard>...JSON...</ModuleCard>` with:
```jsx
<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
  <Kpi label="TVL"            value={fmtUsdShort(data?.kpis?.tvl)}
       sub={`${fmtUsdShort(data?.reserves?.stablecoin)} stable · ${fmtUsdShort(data?.reserves?.loans)} loans`} />
  <Kpi label="Current APY"    value={fmtPct1(data?.kpis?.currentApy)}  accent={USDAI_ACCENT} />
  <Kpi label="Expected APY"   value={fmtPct1(data?.kpis?.expectedApy)} />
  <Kpi label="Utilization"    value={fmtPct1(data?.kpis?.utilization)} />
  <Kpi label="sUSDai Supply"  value={fmtUsdShort(data?.kpis?.susdaiSupply)} sub={`USDai mint ${fmtUsdShort(data?.kpis?.usdaiSupply)}`} />
</div>
```

- [ ] **Step 3: Visual verification**

Run dev server, screenshot `/usdai` via `preview_screenshot`.
Expected: five tile row at top, "TVL ≈ $397M", "Current APY ≈ 7.0%", etc.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UsdaiPage.jsx
git commit -m "USDai: KPI tile header"
```

---

## Task 8: Module 1 — Reserves & TVL stacked area chart

**Goal:** Stacked area chart from `tvlHistory[]` showing total TVL over time, with a utilization-percent line on a secondary axis. Note: USDai's history endpoint returns only `total` per point unless we extend the API (Task 2 said this is a known limitation if `api.usd.ai/dashboard` doesn't expose per-component history — verify during Task 0).

**Files:**
- Modify: `src/pages/UsdaiPage.jsx`

- [ ] **Step 1: Decide history granularity**

Run: `curl -s https://api.usd.ai/usdai/dashboard | python3 -c "import json,sys; d=json.load(sys.stdin); print(list(d.keys())[:30])"`

If the response has `tvlHistory[]` with `{date, stablecoin, loans}` entries (richer than DeFiLlama's `total`-only), swap that in to `api/usdai.js`'s `tvlHistory` build (replacing the DeFiLlama fallback). If only `total`, keep the chart showing total TVL as a single area.

If the field exists, modify `api/usdai.js` `handler` body to replace the existing `tvlHistory` build with:
```js
const usdaiHist = await safe(fetchJson(`${USDAI}/dashboard`), "dashboard", warnings);
const tvlHistory = (usdaiHist?.tvlHistory || []).map(p => ({
  date: typeof p.timestamp === "number" ? p.timestamp * 1000 : new Date(p.timestamp).getTime(),
  stablecoin: p.stablecoinReserves ?? p.stablecoin ?? null,
  loans:      p.loansReserves      ?? p.loans      ?? null,
  total:      p.tvl                ?? null,
}));
// Fallback to DeFiLlama only if USDai's history is empty.
if (!tvlHistory.length) {
  for (const p of (llama?.tvl || [])) {
    tvlHistory.push({ date: p.date * 1000, stablecoin: null, loans: null, total: p.totalLiquidityUSD });
  }
}
```

- [ ] **Step 2: Add the chart**

In `src/pages/UsdaiPage.jsx`, add imports at top:
```jsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart } from "recharts";
```

Add a memoized series builder above the default export:
```jsx
function buildHistorySeries(rows) {
  return (rows || []).map(r => ({
    t: r.date,
    stable: r.stablecoin,
    loans: r.loans,
    total: r.total ?? ((r.stablecoin ?? 0) + (r.loans ?? 0)) || null,
  })).filter(r => r.total != null);
}

const tooltipStyle = {
  contentStyle: { background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#e2e8f0" },
  itemStyle: { color: "#e2e8f0" }, labelStyle: { color: "#e2e8f0" },
};
```

Then insert a new `<ModuleCard>` after the KPI strip:
```jsx
<ModuleCard>
  <SectionHeader title="Reserves & TVL" subtitle="Stablecoin reserves vs deployed loans over time" />
  <div style={{ width: "100%", height: 280 }}>
    <ResponsiveContainer>
      <ComposedChart data={buildHistorySeries(data?.tvlHistory)} margin={{ top: 12, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="t" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
               tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} />
        <YAxis tickFormatter={fmtUsdShort} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} />
        <Tooltip {...tooltipStyle}
          labelFormatter={(v) => new Date(v).toLocaleDateString()}
          formatter={(v, k) => [fmtUsdShort(v), k]} />
        <Area type="monotone" dataKey="stable" stackId="1" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.25} name="Stablecoin" />
        <Area type="monotone" dataKey="loans"  stackId="1" stroke={USDAI_ACCENT} fill={USDAI_ACCENT} fillOpacity={0.30} name="Loans" />
      </ComposedChart>
    </ResponsiveContainer>
  </div>
</ModuleCard>
```

- [ ] **Step 3: Verify**

Screenshot via `preview_screenshot`.
Expected: stacked area chart, cyan stablecoin layer below, sand-colored loans layer above, total area reaching ~$400M at the right edge.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UsdaiPage.jsx api/usdai.js
git commit -m "USDai: reserves & TVL stacked-area chart"
```

---

## Task 9: Module 2a — Active loans table (no globe yet)

**Goal:** Left-column loans table with Deployed/Upcoming tabs and expandable rows showing borrower/principal/location/attested-USD.

**Files:**
- Modify: `src/pages/UsdaiPage.jsx`

- [ ] **Step 1: Add the LoansTable component to `UsdaiPage.jsx`**

Above the default export:
```jsx
function shortAddr(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—"; }
function fmtDays(termSeconds) {
  if (!termSeconds) return "—";
  const d = Math.round(termSeconds / 86400);
  if (d >= 365) return `${(d/365).toFixed(1)}y`;
  return `${d}d`;
}

function LoansTable({ loans, selectedId, onSelect, accent }) {
  const [tab, setTab] = React.useState("deployed");

  const filtered = React.useMemo(() => {
    const d = loans.filter(l => l.isDeployed);
    const u = loans.filter(l => !l.isDeployed);
    return { deployed: d, upcoming: u };
  }, [loans]);

  const rows = filtered[tab] || [];

  const Tab = ({ id, label, count }) => (
    <button onClick={() => setTab(id)} style={{
      background: tab === id ? `${accent}22` : "rgba(255,255,255,0.025)",
      border: `1px solid ${tab === id ? `${accent}55` : "rgba(255,255,255,0.05)"}`,
      borderRadius: 5, padding: "6px 10px", fontSize: 11, fontFamily: mono,
      color: tab === id ? accent : "#94a3b8", cursor: "pointer",
    }}>
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: tab === id ? accent : "#4a5568", marginRight: 6 }} />
      {label} [{count}]
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Tab id="deployed" label="Deployed Loans" count={filtered.deployed.length} />
        <Tab id="upcoming" label="Upcoming Loans" count={filtered.upcoming.length} />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono }}>
          <thead>
            <tr>
              <th style={th}>NAME</th>
              <th style={thR}>APY</th>
              <th style={thR}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(loan => {
              const isSel = loan.documentId === selectedId;
              return (
                <React.Fragment key={loan.documentId}>
                  <tr onClick={() => onSelect(loan)}
                      style={{ cursor: "pointer", background: isSel ? "rgba(200,184,138,0.08)" : undefined }}>
                    <td style={td}>
                      {loan.name}
                      {loan.isEscrowed && <span style={{ marginLeft: 6, color: "#94a3b8", fontSize: 10 }}>(Escrowed)</span>}
                    </td>
                    <td style={tdR}>{loan.apr != null ? `${loan.apr.toFixed(1)}%` : "—"}</td>
                    <td style={tdR}>{fmtUsdShort(loan.principal)}</td>
                  </tr>
                  {isSel && (
                    <tr>
                      <td colSpan={3} style={{ ...td, background: "rgba(255,255,255,0.02)", padding: "10px 8px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
                          <div><span style={dim}>Borrower:</span> {shortAddr(loan.borrower)}</div>
                          <div><span style={dim}>Location:</span> {loan.location?.name || "—"}</div>
                          <div><span style={dim}>Term:</span> {fmtDays(loan.termSeconds)}</div>
                          <div><span style={dim}>Off-take:</span> {loan.offTake || "—"}</div>
                          <div><span style={dim}>Attested $:</span> {fmtUsdShort(loan.attestedUsd)}</div>
                          <div><span style={dim}>Coverage:</span> {loan.attestedUsd && loan.principal
                            ? `${(loan.attestedUsd / loan.principal * 100).toFixed(0)}%` : "—"}</div>
                          {loan.tokenId != null && (
                            <div style={{ gridColumn: "1 / -1" }}>
                              <a href={`https://metadata.usd.ai/v1/${loan.tokenId}`} target="_blank" rel="noreferrer"
                                 style={{ color: accent, fontSize: 10 }}>
                                NFT #{loan.tokenId} ↗
                              </a>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={3} style={{ ...td, color: "#4f5e6f", textAlign: "center", padding: 20 }}>No loans in this tab</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th  = { padding: "8px 8px", textAlign: "left",  fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 };
const thR = { ...th, textAlign: "right" };
const td  = { padding: "8px 8px", fontSize: 13, fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.03)", color: "#e2e8f0" };
const tdR = { ...td, textAlign: "right" };
const dim = { color: "#6b7a8d" };
```

(Note: this component references `React` directly; add `import React from "react"` at top if not already imported as default. Current file imports `React` already.)

- [ ] **Step 2: Add selection state and render the table in a new ModuleCard**

In `UsdaiPage`, add state:
```jsx
const [selectedLoanId, setSelectedLoanId] = React.useState(null);
```

Add this `<ModuleCard>` after the reserves chart:
```jsx
<ModuleCard>
  <SectionHeader title="Loans" subtitle={`${(data?.loans || []).length} loans · click a row for detail`} />
  <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 0.4fr) 0.6fr", gap: 16 }}>
    <LoansTable
      loans={data?.loans || []}
      selectedId={selectedLoanId}
      onSelect={(l) => setSelectedLoanId(prev => prev === l.documentId ? null : l.documentId)}
      accent={USDAI_ACCENT}
    />
    <div style={{ minHeight: 360, border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#4f5e6f", fontFamily: mono, fontSize: 11 }}>
      Globe placeholder — added in Task 11
    </div>
  </div>
</ModuleCard>
```

- [ ] **Step 3: Visual verification**

Screenshot the page. Expected: loans table on the left with Deployed/Upcoming tabs, "Deployed Loans [N]" count (10+), clicking a row expands inline detail panel.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UsdaiPage.jsx
git commit -m "USDai: active loans table with deployed/upcoming tabs"
```

---

## Task 10: Install globe dependencies + lazy `UsdaiGlobe` component

**Goal:** Add `react-globe.gl` + `three`. Create a lazy-loadable globe component that takes points and a target POV.

**Files:**
- Modify: `package.json`
- Create: `src/components/UsdaiGlobe.jsx`

- [ ] **Step 1: Install deps**

Run:
```bash
npm install react-globe.gl three
```
Expected: deps appear in `package.json`. (No vite.config change required.)

- [ ] **Step 2: Create the globe component**

`src/components/UsdaiGlobe.jsx`:
```jsx
import React, { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import Globe from "react-globe.gl";

// Lazy-loaded by UsdaiPage via React.lazy(() => import("./UsdaiGlobe")).
// Props:
//   points: [{ id, lat, lng, size, color, label }]
//   onPointClick(point)
//   accent: hex string for highlight ring
// Imperative handle:
//   spinTo(lat, lng): smooth pointOfView animation
const UsdaiGlobe = forwardRef(function UsdaiGlobe({ points, onPointClick, accent }, ref) {
  const globeRef = useRef(null);
  const containerRef = useRef(null);
  const [size, setSize] = React.useState({ w: 400, h: 400 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const r = e.contentRect;
        setSize({ w: Math.floor(r.width), h: Math.max(360, Math.floor(r.width * 0.85)) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    // Initial view: zoom out enough to see most of the planet.
    g.pointOfView({ lat: 25, lng: -40, altitude: 2.0 }, 0);
    // Gentle auto-rotate disabled — we drive POV via spinTo.
  }, []);

  useImperativeHandle(ref, () => ({
    spinTo(lat, lng) {
      const g = globeRef.current;
      if (!g) return;
      g.pointOfView({ lat, lng, altitude: 1.6 }, 1200);
    },
  }), []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: size.h }}>
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere={true}
        atmosphereColor={accent}
        atmosphereAltitude={0.12}
        globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-dark.jpg"
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={(p) => 0.01 + (p.size || 0.01)}
        pointRadius={(p) => 0.3 + (p.size || 0) * 4}
        pointColor={(p) => p.color || accent}
        pointLabel={(p) => `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;background:#131926;border:1px solid rgba(255,255,255,0.08);padding:6px 8px;border-radius:4px;color:#e2e8f0;">${p.label || ""}</div>`}
        onPointClick={onPointClick}
      />
    </div>
  );
});

export default UsdaiGlobe;
```

- [ ] **Step 3: Verify the chunk builds**

Run `npm run build`. Expected: build succeeds; output shows `UsdaiGlobe-*.js` as a separate chunk (will be true after Task 11 wires the lazy import — for now Vite may bundle inline).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/UsdaiGlobe.jsx
git commit -m "USDai: add react-globe.gl + lazy globe component"
```

---

## Task 11: Wire globe ↔ loans table interaction

**Goal:** Replace the placeholder div in the Loans module with the lazy-loaded globe; clicking a row spins the globe; clicking a dot selects the row.

**Files:**
- Modify: `src/pages/UsdaiPage.jsx`

- [ ] **Step 1: Add lazy import and ref state at the top of `UsdaiPage.jsx`**

```jsx
const UsdaiGlobe = React.lazy(() => import("../components/UsdaiGlobe"));
```

Inside `UsdaiPage`, add:
```jsx
const globeRef = React.useRef(null);

const globePoints = React.useMemo(() => {
  return (data?.loans || [])
    .filter(l => l.location)
    .map(l => ({
      id: l.documentId,
      lat: l.location.lat,
      lng: l.location.lng,
      size: Math.min(0.04, Math.max(0.005, (l.principal || 0) / 8e8)),
      color: l.isDeployed ? USDAI_ACCENT : (l.isEscrowed ? "#fbbf24" : "#6b7a8d"),
      label: `${l.name}<br/>${fmtUsdShort(l.principal)} · ${l.location.name}`,
    }));
}, [data]);

const handleSelect = React.useCallback((loan) => {
  setSelectedLoanId(prev => prev === loan.documentId ? null : loan.documentId);
  if (loan.location && globeRef.current?.spinTo) {
    globeRef.current.spinTo(loan.location.lat, loan.location.lng);
  }
}, []);

const handleDotClick = React.useCallback((point) => {
  const loan = (data?.loans || []).find(l => l.documentId === point.id);
  if (loan) handleSelect(loan);
}, [data, handleSelect]);
```

- [ ] **Step 2: Replace the placeholder div with the lazy globe**

Update the Loans ModuleCard:
```jsx
<ModuleCard>
  <SectionHeader title="Loans" subtitle={`${(data?.loans || []).length} loans · click a row to spin globe`} />
  <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 0.4fr) 0.6fr", gap: 16 }}>
    <LoansTable
      loans={data?.loans || []}
      selectedId={selectedLoanId}
      onSelect={handleSelect}
      accent={USDAI_ACCENT}
    />
    <React.Suspense fallback={
      <div style={{ minHeight: 360, display: "flex", alignItems: "center", justifyContent: "center", color: "#4f5e6f", fontFamily: mono, fontSize: 11 }}>
        Loading globe…
      </div>
    }>
      <UsdaiGlobe ref={globeRef} points={globePoints} onPointClick={handleDotClick} accent={USDAI_ACCENT} />
    </React.Suspense>
  </div>
</ModuleCard>
```

- [ ] **Step 3: Visual verification**

Run dev server. Use `preview_start` + `preview_click` to:
1. Screenshot — confirm globe renders next to the table.
2. Click a Deployed Loans row — globe should spin smoothly to that lat/lng.
3. Click a dot on the globe — the corresponding row should highlight.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UsdaiPage.jsx
git commit -m "USDai: wire globe interactions to loans table"
```

---

## Task 12: Module 3 — GPU collateral cross-check

**Goal:** Collapsible "Assumptions" panel with 5 sliders, plus a bar chart per GPU model comparing USDai-attested $/unit vs DCF-implied $/unit and the gap.

**Files:**
- Modify: `src/pages/UsdaiPage.jsx`
- Create: `src/utils/usdai-dcf.js`

- [ ] **Step 1: Create the DCF math module**

`src/utils/usdai-dcf.js`:
```js
// Pure functions — no React. Used by UsdaiPage and (optionally) Node smoke tests.

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

// Returns `{ implied, attested, gap, gapPct }` per GPU model.
export function modelComparison({ vastGpuName, replacementCost, rentals, attestedPerUnit, params }) {
  const r = rentals?.[vastGpuName];
  const implied = impliedValuePerUnit({ medianDph: r?.medianDph, replacementCost, params });
  const gap = (implied != null && attestedPerUnit != null) ? implied - attestedPerUnit : null;
  const gapPct = (gap != null && attestedPerUnit) ? gap / attestedPerUnit : null;
  return { implied, attested: attestedPerUnit ?? null, gap, gapPct };
}

// Group loans by hardware model. Returns array of { model, vastGpuName, replacementCost, units, attestedPerUnit }
// attestedPerUnit = sum(loan.attestedUsd × hwSharePercent) / total units across all loans with that model.
export function aggregateByModel(loans) {
  const byKey = new Map();
  for (const loan of loans) {
    if (!loan.attestedUsd || !loan.hardware?.length) continue;
    const totalCount = loan.hardware.reduce((s, h) => s + (h.count || 0), 0);
    if (!totalCount) continue;
    for (const h of loan.hardware) {
      const key = (h.name || "").replace(/^NVIDIA\s+/i, "").trim();
      if (!key) continue;
      const shareUsd = loan.attestedUsd * ((h.count || 0) / totalCount);
      const e = byKey.get(key) || { model: key, vastGpuName: h.vastGpuName, replacementCost: h.replacementCost, units: 0, totalAttestedUsd: 0 };
      e.units += h.count || 0;
      e.totalAttestedUsd += shareUsd;
      e.vastGpuName = e.vastGpuName ?? h.vastGpuName;
      e.replacementCost = e.replacementCost ?? h.replacementCost;
      byKey.set(key, e);
    }
  }
  return [...byKey.values()].map(e => ({
    ...e,
    attestedPerUnit: e.units > 0 ? e.totalAttestedUsd / e.units : null,
  }));
}
```

- [ ] **Step 2: Smoke-test the math**

Create `scripts/smoke-usdai-dcf.mjs`:
```js
import { impliedValuePerUnit, modelComparison, DCF_DEFAULTS } from "../src/utils/usdai-dcf.js";

// H100 worked example from the spec:
//   $2/hr, 8760 hr/yr, util 0.7, disc 0.15, life 4, decline 0.25, residual 0.20, replacement 27000
//   rental annuity ≈ 23.5k, salvage ≈ 3.1k → ~26.6k
const out = impliedValuePerUnit({
  medianDph: 2.0,
  replacementCost: 27_000,
  params: DCF_DEFAULTS,
});
console.log("H100 implied:", out.toFixed(2));
if (Math.abs(out - 26600) > 1500) { console.error("DCF result off, expected ~26.6k"); process.exit(1); }

// No rental → null
const none = impliedValuePerUnit({ medianDph: null, replacementCost: 27_000, params: DCF_DEFAULTS });
if (none !== null) { console.error("expected null for no rental"); process.exit(1); }

// modelComparison wiring
const cmp = modelComparison({
  vastGpuName: "H100_SXM",
  replacementCost: 27_000,
  rentals: { H100_SXM: { medianDph: 2.0 } },
  attestedPerUnit: 25_000,
  params: DCF_DEFAULTS,
});
console.log("comparison:", cmp);
if (cmp.implied == null || cmp.gap == null) { console.error("comparison missing fields"); process.exit(1); }

console.log("OK");
```
Run: `node scripts/smoke-usdai-dcf.mjs`. Expected `H100 implied: ~26600`, exit 0.

- [ ] **Step 3: Add the GPU module UI**

In `src/pages/UsdaiPage.jsx`, add imports:
```jsx
import { BarChart, Bar, Cell, LabelList } from "recharts";
import { DCF_DEFAULTS, aggregateByModel, modelComparison } from "../utils/usdai-dcf";
```

Add a slider component near the other helpers:
```jsx
function Slider({ label, value, min, max, step, unit, onChange, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: mono, color: "#94a3b8" }}>
        <span>{label}</span>
        <span style={{ color: accent }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             style={{ accentColor: accent, width: "100%" }} />
    </div>
  );
}
```

Add state inside `UsdaiPage`:
```jsx
const [dcfParams, setDcfParams] = React.useState(DCF_DEFAULTS);
const [assumptionsOpen, setAssumptionsOpen] = React.useState(true);

const modelRows = React.useMemo(() => {
  const aggs = aggregateByModel(data?.loans || []);
  return aggs.map(a => {
    const cmp = modelComparison({
      vastGpuName: a.vastGpuName,
      replacementCost: a.replacementCost,
      rentals: data?.gpuRentals,
      attestedPerUnit: a.attestedPerUnit,
      params: dcfParams,
    });
    return {
      model: a.model,
      units: a.units,
      vastGpuName: a.vastGpuName,
      medianDph: data?.gpuRentals?.[a.vastGpuName]?.medianDph ?? null,
      listingCount: data?.gpuRentals?.[a.vastGpuName]?.listingCount ?? 0,
      attested: cmp.attested,
      implied: cmp.implied,
      gap: cmp.gap,
      gapPct: cmp.gapPct,
    };
  }).filter(r => r.attested != null || r.implied != null);
}, [data, dcfParams]);

const chartRows = modelRows.map(r => ({
  model: r.model,
  Attested: r.attested,
  Implied: r.implied,
}));
```

Add the new `<ModuleCard>` (after the loans module):
```jsx
<ModuleCard>
  <SectionHeader
    title="GPU Collateral Cross-Check"
    subtitle="USDai-attested $/unit vs DCF-implied $/unit from Vast.ai live rentals" />

  <div style={{ marginBottom: 14 }}>
    <button onClick={() => setAssumptionsOpen(o => !o)}
      style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", fontFamily: mono, fontSize: 11, padding: "5px 10px", borderRadius: 5, cursor: "pointer", marginBottom: 10 }}>
      {assumptionsOpen ? "▾" : "▸"} Assumptions
    </button>
    {assumptionsOpen && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 5, background: "rgba(255,255,255,0.015)" }}>
        <Slider label="Utilization"     value={dcfParams.utilization}    min={0.50} max={0.95} step={0.01} unit=""
                onChange={v => setDcfParams(p => ({ ...p, utilization: v }))} accent={USDAI_ACCENT} />
        <Slider label="Discount rate"    value={dcfParams.discountRate}   min={0.05} max={0.30} step={0.01} unit=""
                onChange={v => setDcfParams(p => ({ ...p, discountRate: v }))} accent={USDAI_ACCENT} />
        <Slider label="Useful life (yr)" value={dcfParams.usefulLifeYears} min={2} max={6} step={1} unit="y"
                onChange={v => setDcfParams(p => ({ ...p, usefulLifeYears: v }))} accent={USDAI_ACCENT} />
        <Slider label="Residual %"       value={dcfParams.residualPct}    min={0} max={0.50} step={0.01} unit=""
                onChange={v => setDcfParams(p => ({ ...p, residualPct: v }))} accent={USDAI_ACCENT} />
        <Slider label="Annual decline"   value={dcfParams.annualDecline}  min={0} max={0.50} step={0.01} unit=""
                onChange={v => setDcfParams(p => ({ ...p, annualDecline: v }))} accent={USDAI_ACCENT} />
      </div>
    )}
  </div>

  <div style={{ width: "100%", height: 260 }}>
    <ResponsiveContainer>
      <BarChart data={chartRows} margin={{ top: 12, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="model" tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} />
        <YAxis tickFormatter={fmtUsdShort} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} />
        <Tooltip {...tooltipStyle} formatter={(v) => fmtUsdShort(v)} />
        <Bar dataKey="Attested" fill="#22d3ee" />
        <Bar dataKey="Implied"  fill={USDAI_ACCENT} />
      </BarChart>
    </ResponsiveContainer>
  </div>

  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
    <thead>
      <tr>
        <th style={th}>MODEL</th>
        <th style={thR}>UNITS</th>
        <th style={thR}>VAST $/HR</th>
        <th style={thR}>LISTINGS</th>
        <th style={thR}>ATTESTED $/U</th>
        <th style={thR}>IMPLIED $/U</th>
        <th style={thR}>GAP</th>
      </tr>
    </thead>
    <tbody>
      {modelRows.map(r => (
        <tr key={r.model}>
          <td style={td}>{r.model}</td>
          <td style={tdR}>{r.units}</td>
          <td style={tdR}>{r.medianDph != null ? `$${r.medianDph.toFixed(2)}` : "—"}</td>
          <td style={tdR}>{r.listingCount || "—"}</td>
          <td style={tdR}>{fmtUsdShort(r.attested)}</td>
          <td style={tdR}>{r.implied != null ? fmtUsdShort(r.implied) : "—"}</td>
          <td style={{ ...tdR, color: r.gapPct == null ? "#4f5e6f" : (r.gapPct >= 0 ? "#22d3ee" : "#f87171") }}>
            {r.gapPct == null ? "—" : `${(r.gapPct * 100).toFixed(0)}%`}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</ModuleCard>
```

- [ ] **Step 4: Visual verification**

Screenshot. Expected: Assumptions panel expanded by default with 5 sliders, bar chart with at least 2-3 GPU models, footnote table with median $/hr from Vast.ai. Move a slider — chart should update reactively without page reload.

- [ ] **Step 5: Commit**

```bash
git add src/utils/usdai-dcf.js scripts/smoke-usdai-dcf.mjs src/pages/UsdaiPage.jsx
git commit -m "USDai: GPU collateral cross-check with 5-slider DCF"
```

---

## Task 13: Module 4 — T-Bill / cash leg table

**Goal:** Small table listing reserve-asset T-Bill rows from `proof-of-reserves`.

**Files:**
- Modify: `src/pages/UsdaiPage.jsx`

- [ ] **Step 1: Add the T-Bills module**

After the GPU cross-check ModuleCard, add:
```jsx
<ModuleCard>
  <SectionHeader title="Cash Reserve Assets" subtitle="T-Bills and stable reserves backing USDai" />
  <table style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead>
      <tr>
        <th style={th}>NAME</th>
        <th style={th}>CHAIN</th>
        <th style={thR}>APY</th>
        <th style={thR}>AMOUNT</th>
        <th style={thR}>RESERVE</th>
      </tr>
    </thead>
    <tbody>
      {(data?.tbills || []).map((t, i) => (
        <tr key={i}>
          <td style={td}>
            {t.iconUrl && <img src={t.iconUrl} alt="" style={{ width: 14, height: 14, verticalAlign: "middle", marginRight: 6, borderRadius: 3 }} />}
            {t.name}
          </td>
          <td style={td}>{t.chain}</td>
          <td style={tdR}>{t.apy != null ? `${t.apy.toFixed(2)}%` : "—"}</td>
          <td style={tdR}>{fmtUsdShort(t.amount)}</td>
          <td style={tdR}>
            {t.reserveLink && <a href={t.reserveLink} target="_blank" rel="noreferrer" style={{ color: USDAI_ACCENT, fontSize: 10 }}>view ↗</a>}
          </td>
        </tr>
      ))}
      {(data?.tbills || []).length === 0 && (
        <tr><td colSpan={5} style={{ ...td, color: "#4f5e6f", textAlign: "center", padding: 16 }}>No T-Bill reserves</td></tr>
      )}
    </tbody>
  </table>
</ModuleCard>
```

- [ ] **Step 2: Visual verification**

Screenshot. Expected: 1+ row (PYUSD or similar) with chain, APY, amount, view link.

- [ ] **Step 3: Commit**

```bash
git add src/pages/UsdaiPage.jsx
git commit -m "USDai: cash reserve / T-Bills table"
```

---

## Task 14: Warnings UI polish + error states

**Goal:** Improve the partial-warnings banner from Task 6, add empty-state handling per module, ensure graceful degradation when individual data pieces are missing.

**Files:**
- Modify: `src/pages/UsdaiPage.jsx`

- [ ] **Step 1: Replace the simple warnings line with a richer banner**

In `UsdaiPage`, replace the existing warnings JSX block with:
```jsx
{data?.warnings?.length > 0 && (
  <details style={{ fontSize: 11, fontFamily: mono, color: "#fbbf24", padding: "8px 12px", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 5, background: "rgba(251,191,36,0.04)" }}>
    <summary style={{ cursor: "pointer" }}>
      ⚠ {data.warnings.length} partial data warning(s) — click to expand
    </summary>
    <ul style={{ margin: "6px 0 0 14px", padding: 0, color: "#fde68a" }}>
      {data.warnings.map((w, i) => <li key={i} style={{ marginTop: 2 }}>{w}</li>)}
    </ul>
  </details>
)}
```

- [ ] **Step 2: Add empty-state guards on the chart and tables**

In the Reserves & TVL module, wrap the chart:
```jsx
{(data?.tvlHistory?.length || 0) === 0 ? (
  <div style={{ padding: 30, textAlign: "center", fontFamily: mono, fontSize: 11, color: "#4f5e6f" }}>
    TVL history unavailable
  </div>
) : (
  <div style={{ width: "100%", height: 280 }}>
    {/* existing ResponsiveContainer */}
  </div>
)}
```

In the GPU Cross-Check module, surface the no-rental case prominently:
```jsx
{Object.keys(data?.gpuRentals || {}).length === 0 && (
  <div style={{ padding: 16, fontFamily: mono, fontSize: 11, color: "#fbbf24", background: "rgba(251,191,36,0.04)", borderRadius: 5, marginBottom: 12 }}>
    No Vast.ai rental data available — implied values can't be computed. Refresh in a few minutes.
  </div>
)}
```

- [ ] **Step 3: Visual verification**

Screenshot. Expected: clean rendering. If you can simulate a failure (e.g., temporarily change `USDAI` constant to a bad URL in `api/usdai.js`), confirm the page falls back gracefully with warnings expanded. Revert after.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UsdaiPage.jsx
git commit -m "USDai: warnings banner and empty-state guards"
```

---

## Task 15: End-to-end verification + final commit

**Goal:** Confirm the page works end-to-end. Take screenshots. Lint. Build.

- [ ] **Step 1: Run build**

Run: `npm run build`
Expected: build succeeds, no errors. Look at the output — confirm `UsdaiGlobe-*.js` appears as a code-split chunk.

- [ ] **Step 2: Start dev server and visually exercise the page**

Run dev server. Use `preview_start` then `preview_screenshot` on `/usdai`. Confirm visually:
1. Header strip + 5 KPI tiles populated (TVL ~ $397M, APY ~ 7%)
2. Reserves & TVL chart renders with two-color stacked area
3. Loans module: Deployed tab shows 10+ rows, Upcoming tab non-empty, expanding a row shows details with attested $ and coverage %
4. Globe renders next to the table; clicking a Deployed row spins it; clicking a dot highlights its row
5. GPU Cross-Check: Assumptions panel open by default with 5 sliders; bar chart shows ≥2 GPU models; footnote table populated with Vast.ai $/hr
6. Move a slider — chart updates instantly
7. T-Bills table shows PYUSD (or current reserve assets)
8. No errors in the browser console (`preview_console_logs`)

- [ ] **Step 3: Run all smoke scripts one more time**

```bash
node scripts/smoke-usdai-gpu-map.mjs
node scripts/smoke-usdai-dcf.mjs
node scripts/smoke-api-usdai.mjs
```
All exit 0.

- [ ] **Step 4: Final commit (if any cleanup)**

If there were any tweaks during verification:
```bash
git add -A
git commit -m "USDai: end-to-end verification and final polish"
```

- [ ] **Step 5: Done**

The `/usdai` route is fully functional. Future iterations may add: historical APY chart, multi-protocol RWA comparison, alerts on coverage threshold breaches.

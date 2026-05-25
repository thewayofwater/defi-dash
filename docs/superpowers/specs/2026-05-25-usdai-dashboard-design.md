# USDai Dashboard Page — Design

**Date:** 2026-05-25
**Status:** Design approved, pending implementation plan

## Purpose

Add a new protocol page at `/usdai` that tracks the USDai protocol in real time:
- Loans outstanding (active + upcoming), with borrower, hardware, location, rate, term
- Cash reserves (stablecoin) vs deployed-loan split, current and historical
- An **independent cross-check** of the GPU collateral value backing the loans, sourced from live secondary-market (Vast.ai) GPU rental rates, contrasted against USDai's attested collateral value

The page mirrors the existing per-protocol pattern (Aave/Maple/Morpho/etc.): one Vercel serverless aggregator, one React hook, one page component, one nav link.

## Data sources

All public, unauthenticated:

| Source | Endpoint | Purpose |
|---|---|---|
| USDai | `api.usd.ai/usdai/dashboard/tvl` | TVL, stablecoin reserves, loan reserves |
| USDai | `api.usd.ai/usdai/dashboard/proof-of-reserves` | Per-loan rows (TBILL + DEAL) — hardware, borrower, APR, term, location, stage |
| USDai | `api.usd.ai/usdai/dashboard` | tvlHistory[] time series |
| USDai | `api.usd.ai/usdai/dashboard/utilization` | Current utilization % |
| USDai | `api.usd.ai/usdai/dashboard/current-apy`, `/expected-apy`, `/net-apy` | APY metrics |
| USDai | `api.usd.ai/usdai/public/usdai-supply`, `/susdai-supply` | Token supply |
| USDai | `metadata.usd.ai/v1/<tokenId>` | Per-NFT attested `Collateral Value USD` (only if `proof-of-reserves` doesn't expose it directly — verify in plan phase) |
| Vast.ai | `cloud.vast.ai/api/v0/bundles/?q=<filter>` | Live $/hr rental rates per GPU model |
| DeFiLlama | `api.llama.fi/protocol/usd-ai` | Historical TVL fallback |

## Architecture

### New files
```
api/usdai.js                       Vercel serverless aggregator
src/hooks/useUsdaiData.js          Fetch, retry, refresh state
src/pages/UsdaiPage.jsx            Page component
src/utils/usdai-gpu-map.js         GPU label → Vast.ai gpu_name + replacementCost + life mapping
src/components/UsdaiGlobe.jsx      Lazy-loaded react-globe.gl wrapper
```

### Modified files
```
src/main.jsx                       Add <Route path="/usdai" element={<UsdaiPage />} />
src/components/NavBar.jsx          Add nav link between SparkLend and WBTC
package.json                       Add react-globe.gl, three deps
```

### New dependencies
- `react-globe.gl` (and its peer `three`) — ~600KB gzipped, code-split to the `/usdai` route only via `React.lazy`

## Page layout

Top to bottom, using the existing `ModuleCard` + `SectionHeader` + `JetBrains Mono` styling shared across protocol pages.

### Header strip
- Title "USDai" with subtitle "GPU-collateralized credit · live data from api.usd.ai"
- Last-updated timestamp + refresh button (matches Maple/Aave pattern)
- Five KPI tiles: TVL · Current APY · Projected APY · USDai price · sUSDai price

### Module 1 — Reserves & TVL over time
- Stacked area chart from `tvlHistory[]`: stablecoin reserves (bottom layer) + loans outstanding (top layer)
- Overlaid line for utilization % on a right Y-axis

### Module 2 — Active loans + GPU globe (combined module)
Two-column layout, ~40/60 split:

**Left — loans table**
- Tabs: `Deployed [N]` / `Upcoming [N]`, matching the USDai app
- Columns: name (e.g. `B300 [72]`, with `(Escrowed)` chip), APY, amount
- Row click expands inline to show: borrower (truncated 0xabcd…1234), principal, location name, USDai-attested $, DCF-implied $, attested coverage ratio, implied coverage ratio
- Row click also triggers a `pointOfView` animation on the globe (1200ms ease) to the loan's location

**Right — globe** (lazy-loaded behind Suspense)
- `react-globe.gl` with a dotted/hex polygon style approximating USDai's own visual
- One marker per active loan, sized by principal, colored by stage (deployed / escrowed / upcoming)
- Marker hover → tooltip with loan name + principal
- Marker click → highlights the corresponding row in the table

### Module 3 — GPU collateral cross-check
- Collapsible "Assumptions" panel, **expanded by default**, containing five sliders:
  - Utilization (default 70%, range 50–95%)
  - Discount rate (default 15%, range 5–30%)
  - Useful life (default 4yr, range 2–6yr; per-model defaults can override in the mapping table)
  - Residual value as % of replacement cost (default 20%, range 0–50%)
  - Annual rental-rate decline (default 25%, range 0–50%)
- Bar chart per GPU model: USDai-attested $/unit · DCF-implied $/unit · gap %
- Footnote table beneath: GPU model → median Vast.ai $/hr · # rentable listings · rental data updated-at

### Module 4 — T-Bill / cash leg
- Smaller table from `proof-of-reserves` rows where `type === "TBILL"`
- Columns: name, chain, APY, amount, reserve link

### Footer
- "Data: api.usd.ai · metadata.usd.ai · cloud.vast.ai" with the dim mono styling

## DCF math

For each GPU unit:
```
implied_$_per_unit =
    Σ(t=1..life) [ dph₀ × (1−d)^(t−1) × 8760 × util / (1+r)^t ]
  + residual_pct × replacement_cost / (1+r)^life
```

Where:
- `dph₀` = median rentable $/hr for this GPU model on Vast.ai (today)
- `util` = utilization slider (default 0.70)
- `d` = annual rental-rate decline (default 0.25)
- `r` = discount rate (default 0.15)
- `life` = useful life in years (default 4, per-model overridable)
- `residual_pct` = residual as % of replacement cost (default 0.20)
- `replacement_cost` = published NVIDIA-list anchor from `usdai-gpu-map.js`

For each loan:
- `impliedUsd = Σ over hardware items (count × implied_$_per_unit)`
- `attestedUsd = sum from NFT metadata, or proof-of-reserves field if present`
- `attestedCoverage = attestedUsd / principal`
- `impliedCoverage = impliedUsd / principal`

DCF math runs entirely in the browser. Sliders mutate component state and recompute reactively — no API refetch on slider change.

### GPU model mapping (`src/utils/usdai-gpu-map.js`)

```js
{
  "H100":         { vast: "H100_SXM",  life: 4, replacementCost: 27_000 },
  "H200":         { vast: "H200",      life: 4, replacementCost: 33_000 },
  "B200":         { vast: "B200",      life: 5, replacementCost: 50_000 },
  "B300":         { vast: null,        life: 5, replacementCost: 65_000, note: "no rental data" },
  "RTX PRO 6000": { vast: null,        life: 4, replacementCost: 10_000, note: "no rental data" },
  "RTX 5090":     { vast: "RTX_5090",  life: 4, replacementCost: 2_500 },
  "A100":         { vast: "A100_SXM4", life: 4, replacementCost: 12_000 },
  "L40S":         { vast: "L40S",      life: 4, replacementCost: 7_000 },
}
```

USDai's hardware names (forms like `"B200 [96] (Escrowed)"`, `"B300 [9] / RTX PRO 6000 [18]"`) are normalized by stripping bracket counts and status chips, then matched against this table. Mixed-hardware loans sum across models. Unmapped models show "—" for the implied column and surface a warning chip on the loan row.

Replacement-cost values are NVIDIA-list-derived public anchors, maintained quarterly in source.

## API endpoint shape

### `/api/usdai.js` response
```js
{
  updatedAt: "2026-05-25T10:30:00Z",
  kpis: {
    tvl, currentApy, expectedApy, netApy, utilization,
    usdaiSupply, susdaiSupply, mintedUsdai
  },
  reserves: { stablecoin, loans, total },
  tvlHistory: [{ date, stablecoin, loans }, ...],
  loans: [{
    id, name, stage, isActive, isEscrowed,
    borrower, principal, apr, term, offTake, group,
    location: { name, lat, lng },
    hardware: [{ model, count, vastGpuName, attestedUsdPerUnit? }],
    attestedUsd
  }, ...],
  tbills: [{ name, chain, apy, amount, reserveLink }, ...],
  gpuRentals: {
    H100_SXM: { medianDph, p25Dph, p75Dph, listingCount, updatedAt },
    H200:     { medianDph, p25Dph, p75Dph, listingCount, updatedAt },
    // ...
  },
  warnings: ["vast.ai timeout for B200", ...]
}
```

### Fetch phases (server-side)
- **Phase 1**: All USDai endpoints + DeFiLlama in parallel with `Promise.all`, 8s timeout each
- **Phase 2**: Distinct GPU models extracted from Phase 1 hardware arrays, mapped through `usdai-gpu-map.js`, one Vast.ai query per mapped model in parallel, 10s timeout per model
- **Total budget**: 30s on Vast.ai; any individual request that times out degrades that model's row to "—"
- **Cache header**: `Cache-Control: s-maxage=300, stale-while-revalidate=60` (matches every other endpoint)

## Hook (`useUsdaiData.js`)

Same shape as `useMapleData`:
```js
const {
  data,         // the response payload above
  loading,      // true on initial load
  error,        // error message string if Phase 1 fully failed
  refreshing,   // true during a manual refresh
  lastUpdated,  // Date object
  refreshKey,   // increment-on-refresh, used as React key for chart fade
  refresh,      // manual refresh callback
} = useUsdaiData();
```

## Error handling & degradation

| Failure mode | Behavior |
|---|---|
| Vast.ai for a specific GPU model times out / fails | That model shows "—" in DCF; loan rows containing it surface a "partial" tooltip; entry added to `warnings[]` |
| `api.usd.ai/dashboard/tvl` 5xx | Fall back to `api.llama.fi/protocol/usd-ai` for total TVL and borrowed; loses granularity on stablecoin/loan split |
| `api.usd.ai/dashboard/proof-of-reserves` 5xx | Page renders with KPI tiles + history chart only; loans module shows empty state |
| `api.usd.ai` entirely unreachable | Standard error screen (same pattern as Maple page) |
| `metadata.usd.ai/v1/<id>` fails for a loan | Loan's attested column falls back to rental-DCF only |
| `react-globe.gl` chunk fails to load | Globe area shows a small "Globe unavailable" message; rest of the page is unaffected |

All non-fatal failures collected into `warnings[]` and surfaced as a small inline banner at the top of the affected module.

## Performance & bundle

- `react-globe.gl` + `three.js` are lazy-loaded via `React.lazy(() => import("./UsdaiGlobe"))` so they only ship on the `/usdai` route
- Globe component sits behind `<Suspense fallback={<small placeholder/>}>`
- Vite handles the code-split automatically; no `vite.config.js` change required
- Existing protocol pages and Overview remain unaffected

## Testing

- **Smoke test**: a Node script that hits `/api/usdai` locally (via `vercel dev` or `vite dev` with API routes) and asserts the response includes the expected top-level keys plus at least one loan row and one `gpuRentals` entry
- **Visual verification**: manual using `preview_*` tools — render the page, confirm modules display, exercise the five DCF sliders, click a loan row and confirm globe spins, screenshot
- **No new unit-test framework** added for this change (project doesn't currently have one)

## Known unknowns to verify in the plan phase

1. Does `/usdai/dashboard/proof-of-reserves` already include attested USD per loan, or do we need to call `metadata.usd.ai/v1/<id>` per token?
2. Exact `stage` field values for Deployed vs Upcoming vs Escrowed filtering
3. Vast.ai `gpu_name` enumeration: B300 confirmed absent; verify RTX PRO 6000 / RTX PRO 6000 Blackwell variants
4. Confirm `react-globe.gl` works under Vite SSR-less setup (should — it's purely client-side)

## Out of scope

- Historical APY chart (USDai's app has one; defer to v2)
- Per-loan PDF/PSA document viewer
- Comparison view across multiple RWA protocols
- Alerts / notifications on coverage ratio thresholds
- Mobile-responsive globe (desktop-first; mobile gets a static fallback list)

## Visual / brand

- Page accent color: `#c8b88a` (warm sand, matches app.usd.ai header)
- Page background and typography unchanged from the rest of the dashboard
- USDai nav entry slotted alphabetically in the Protocols section between SparkLend and WBTC

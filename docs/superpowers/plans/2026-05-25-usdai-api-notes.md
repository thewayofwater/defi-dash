# USDai API probe notes (2026-05-25)

## Stage → status mapping

Verified counts from `api.usd.ai/usdai/dashboard/proof-of-reserves`:

- **Stage `6` → Deployed** — 29 rows
- **Stages `1`, `2`, `3`, `4` → Upcoming** — 9 rows (5 at stage 2, 2 at stage 1, 1 each at 3 and 4)

Logic in `api/usdai.js`: `isDeployed = (stage === 6)`. Everything else is Upcoming.

## Escrowed field nuance

The `escrowed` field is **a string, not a boolean**:
- `null` → not escrowed (34 of 38 rows)
- `"offchain"` → escrowed off-chain (2 rows)
- `"onchain"` → escrowed on-chain (2 rows)

The plan's parser uses `Boolean(d.escrowed)` which correctly treats both string values as truthy. The UI "(Escrowed)" chip applies to both cases.

## NFT metadata tokenId ranges (verified)

`https://metadata.usd.ai/v1/<id>` returns 200 for these ranges (probed boundaries):

- **101 – 216+** (216 → 200; 250 → 404)
- **251 – 262** (262 → 200; 263 → 404)
- **301 – 353** (353 → 200; 354 → 404)
- **401 – 401** (only one ID; 450/500 → 404)
- **1001 – 1005** (1005 → 200; 1010 → 404)

The fetcher tolerates 404s (returns `null` and skips), so generous ranges in the plan are fine. The configured ranges in `api/usdai.js` should be:

```js
const TOKEN_ID_RANGES = [
  [101, 220],
  [251, 262],
  [301, 353],
  [401, 410],
  [1001, 1010],
];
```

## Loan ↔ NFT join key

By exact `name` match. Example: loan row `"H200 [75]"` matches metadata.usd.ai NFT with `name: "H200 [75]"`. Note that one loan record `name: "NVIDIA B300 [72]"` in metadata but `"B300 [72]"` in proof-of-reserves — the plan's parser strips the `"NVIDIA "` prefix during normalization. **TODO during implementation**: confirm the API code joins after stripping `NVIDIA `.

Actually — let's verify this: the API code in Task 3 builds `nameToMeta` keyed by the raw metadata `name` field. If metadata names have `"NVIDIA "` prefix but proof-of-reserves names don't, the join will miss. Need to normalize both sides during the build.

**Action item for Task 3**: when building `nameToMeta`, also store the name with `NVIDIA ` prefix stripped. When looking up by `loan.name`, try both raw and stripped forms.

## Vast.ai gpu_name probes (all confirmed absent)

- `RTX_PRO_6000`: 0 offers
- `RTX_PRO_6000_Blackwell`: 0 offers
- `RTX_6000Ada`: 0 offers
- `B300`: 0 offers

The Vast.ai `like` operator on `gpu_name` returns empty results (likely unsupported on this field). The `eq` operator is the only viable filter.

Conclusion: leave `vast: null` for `RTX PRO 6000` and `B300` entries in the GPU map; rentals API will be skipped for them and they'll show "—" in the implied column.

## TVL history endpoint — RICHER than expected

`api.usd.ai/usdai/dashboard` returns **7.2 MB** with these arrays:

- `tvlHistory[]` — total TVL `{timestamp, value}` (18-decimal wei string)
- `stablecoinReservesHistory[]` — same shape
- `loansReservesHistory[]` — same shape
- `usdaiTvlHistory[]`, `sUsdaiTvlHistory[]` — per-token TVL
- `utilizationHistory[]` — utilization %
- `apyHistory[]` — APY history (371 points, daily-ish)
- `usdaiPriceHistory[]`, `susdaiFmvHistory[]` — token prices
- `cumulativeYieldHistory[]`, `mintedUsdaiHistory[]`, `stakedUsdaiHistory[]`

Length: 18187 timestamps in `tvlHistory` (one every ~30 minutes for the past year).

**Implementation guidance for Task 8:**
1. Use the per-component arrays (`stablecoinReservesHistory`, `loansReservesHistory`) to build the stacked area chart with real layered data — NOT just total TVL.
2. **Downsample to ~daily granularity** before returning to the client to avoid shipping 7MB. Bucket by `YYYY-MM-DD`, keep last point per day.
3. Values are 18-decimal wei strings — divide by 1e18 in the API parser.

Updated `tvlHistory` builder for Task 8 step 1 should be:

```js
const usdaiHist = await safe(fetchJson(`${USDAI}/dashboard`, 15000), "dashboard", warnings);

function downsampleDaily(arr) {
  if (!Array.isArray(arr)) return [];
  const byDay = new Map();
  for (const p of arr) {
    const t = new Date(p.timestamp);
    if (isNaN(t)) continue;
    const key = t.toISOString().slice(0, 10);
    byDay.set(key, { t: t.getTime(), value: Number(BigInt(p.value)) / 1e18 });
  }
  return [...byDay.values()].sort((a, b) => a.t - b.t);
}

const stableSeries = downsampleDaily(usdaiHist?.stablecoinReservesHistory);
const loansSeries  = downsampleDaily(usdaiHist?.loansReservesHistory);
const dateSet = new Set([...stableSeries.map(p => p.t), ...loansSeries.map(p => p.t)]);
const sortedDates = [...dateSet].sort((a, b) => a - b);
const sMap = new Map(stableSeries.map(p => [p.t, p.value]));
const lMap = new Map(loansSeries.map(p => [p.t, p.value]));
const tvlHistory = sortedDates.map(t => ({
  date: t,
  stablecoin: sMap.get(t) ?? null,
  loans:      lMap.get(t) ?? null,
  total:      (sMap.get(t) ?? 0) + (lMap.get(t) ?? 0),
}));
// Fallback to DeFiLlama if USDai history is empty
if (!tvlHistory.length && llama?.tvl) {
  for (const p of llama.tvl) tvlHistory.push({ date: p.date * 1000, stablecoin: null, loans: null, total: p.totalLiquidityUSD });
}
```

## Vast.ai gpu_name values to use

The plan's `usdai-gpu-map.js` mapping uses these Vast.ai enum values (all confirmed by prior research):

- `H100_SXM`, `H100_PCIE` (variants)
- `H200`
- `B200`
- `A100_SXM4`, `A100_PCIE`
- `L40S`
- `RTX_5090`, `RTX_4090`

`B300`, `RTX_PRO_6000*` → `null` (no rental data).

import { lookupGpu, normalizeHardwareName } from "../src/utils/usdai-gpu-map.js";

const USDAI = "https://api.usd.ai/usdai";
const LLAMA = "https://api.llama.fi/protocol/usd-ai";

// Stage codes confirmed via proof-of-reserves probe (see plan Task 0 notes).
// Update if USDai changes the schema.
const STAGE_DEPLOYED = 6;

// Verified working tokenId ranges on metadata.usd.ai/v1/<id> (see plan notes).
// Generous upper bounds — fetcher tolerates 404s.
const TOKEN_ID_RANGES = [
  [101, 220],
  [251, 262],
  [301, 353],
  [401, 410],
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

// Estimate attested USD by summing hardware count × GPU map replacementCost.
// Fallback when no NFT metadata match is found by name.
function estimateFromReplacementCost(hardware) {
  if (!Array.isArray(hardware)) return null;
  let total = 0, anyHit = false;
  for (const h of hardware) {
    const m = lookupGpu(h?.name);
    if (m?.replacementCost != null && h.count) {
      total += m.replacementCost * h.count;
      anyHit = true;
    }
  }
  return anyHit ? total : null;
}

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
  if (s == null) return 0;
  try { return Number(BigInt(s)) / 1e18; } catch { return 0; }
}

function parseLoanRow(d) {
  return {
    documentId: d.documentId,
    name: d.name,
    stage: d.stage,
    isDeployed: d.stage === STAGE_DEPLOYED,
    isEscrowed: Boolean(d.escrowed),
    escrowedType: typeof d.escrowed === "string" ? d.escrowed : null,
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

// Downsample a {timestamp, value} 18-decimal-wei history array to daily granularity.
// Keeps the last point per UTC day. Returns sorted [{t, value}] (value in USD).
function downsampleDaily(arr) {
  if (!Array.isArray(arr)) return [];
  const byDay = new Map();
  for (const p of arr) {
    const t = new Date(p.timestamp);
    if (isNaN(t)) continue;
    const key = t.toISOString().slice(0, 10);
    // Last write wins; arr is chronological so this picks the latest sample per day.
    byDay.set(key, { t: t.getTime(), value: fromWei18(p.value) });
  }
  return [...byDay.values()].sort((a, b) => a.t - b.t);
}

// Build the per-component history series the page needs from the /usdai/dashboard payload.
function buildTvlHistory(usdaiHist, llama) {
  const stable = downsampleDaily(usdaiHist?.stablecoinReservesHistory);
  const loans  = downsampleDaily(usdaiHist?.loansReservesHistory);
  if (!stable.length && !loans.length) {
    // Fallback: DeFiLlama gives total only, no stable/loans split.
    return (llama?.tvl || []).map(p => ({
      date: p.date * 1000, stablecoin: null, loans: null, total: p.totalLiquidityUSD,
    }));
  }
  const sMap = new Map(stable.map(p => [p.t, p.value]));
  const lMap = new Map(loans.map(p => [p.t, p.value]));
  const dates = [...new Set([...sMap.keys(), ...lMap.keys()])].sort((a, b) => a - b);
  return dates.map(t => {
    const s = sMap.get(t) ?? null;
    const l = lMap.get(t) ?? null;
    return { date: t, stablecoin: s, loans: l, total: (s ?? 0) + (l ?? 0) };
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  const warnings = [];

  const [tvl, por, util, currentApy, expectedApy, netApy, supplyUsdai, supplySusdai, usdaiHist, llama] = await Promise.all([
    safe(fetchJson(`${USDAI}/dashboard/tvl`),              "tvl",          warnings),
    safe(fetchJson(`${USDAI}/dashboard/proof-of-reserves`),"proof",        warnings),
    safe(fetchJson(`${USDAI}/dashboard/utilization`),      "utilization",  warnings),
    safe(fetchJson(`${USDAI}/dashboard/current-apy`),      "currentApy",   warnings),
    safe(fetchJson(`${USDAI}/dashboard/expected-apy`),     "expectedApy",  warnings),
    safe(fetchJson(`${USDAI}/dashboard/net-apy`),          "netApy",       warnings),
    safe(fetchJson(`${USDAI}/public/usdai-supply`),        "usdaiSupply",  warnings),
    safe(fetchJson(`${USDAI}/public/susdai-supply`),       "susdaiSupply", warnings),
    safe(fetchJson(`${USDAI}/dashboard`, 15000),           "dashboard",    warnings),
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

  const tvlHistory = buildTvlHistory(usdaiHist, llama);

  const por_array = por || [];

  // Fetch NFT metadata across known tokenId ranges; build a name → meta index.
  // Names are normalized (strip "NVIDIA " prefix) on both sides so e.g.
  //   metadata "NVIDIA H200 [75]"  ↔  loan "H200 [75]"
  const metadataList = await safe(fetchAllMetadata(), "metadata", warnings) || [];
  const nameToMeta = new Map();
  for (const m of metadataList) {
    if (!m.name || m.collateralValueUsd == null) continue;
    const key = m.name.replace(/^NVIDIA\s+/i, "").trim();
    const prev = nameToMeta.get(key);
    // If multiple NFTs share a name, prefer the one with highest collateral value
    // (the aggregate roll-up NFT vs per-server NFTs).
    if (!prev || m.collateralValueUsd > prev.collateralValueUsd) nameToMeta.set(key, m);
  }

  const tbills = por_array.filter(x => x.type === "TBILL").map(parseTbillRow);
  const loans = por_array.filter(x => x.type === "DEAL").map(parseLoanRow).map(loan => {
    const key = (loan.name || "").replace(/^NVIDIA\s+/i, "").trim();
    const meta = nameToMeta.get(key);
    const attestedUsd = meta?.collateralValueUsd ?? estimateFromReplacementCost(loan.hardware);
    return {
      ...loan,
      tokenId: meta?.tokenId ?? null,
      attestedUsd,
      attestedSource: meta ? "nft" : (attestedUsd != null ? "replacement-cost" : null),
      attestedUsefulLifeDays: meta?.usefulLifeDays ?? null,
      manufacturer: meta?.manufacturer ?? null,
    };
  });

  // Supply endpoints return {result: "decimal string"} (NOT 18-decimal wei).
  const parseDecimal = (v) => {
    if (v == null) return null;
    const r = v?.result ?? v;
    const n = typeof r === "string" ? parseFloat(r) : Number(r);
    return Number.isFinite(n) ? n : null;
  };

  const kpis = {
    tvl: reserves.total,
    currentApy: currentApy?.result ?? null,
    // expected-apy returns {result: {projectedApy, breakdown, ...}}.
    // We surface just the headline projectedApy here; the full breakdown is in `kpis.expectedApyBreakdown`.
    expectedApy: expectedApy?.result?.projectedApy ?? null,
    expectedApyBreakdown: expectedApy?.result?.breakdown ?? null,
    netApy: netApy?.result ?? null,
    utilization: util?.result ?? null,
    usdaiSupply: parseDecimal(supplyUsdai),
    susdaiSupply: parseDecimal(supplySusdai),
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

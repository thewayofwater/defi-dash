import { lookupGpu, normalizeHardwareName, distinctVastNames } from "../src/utils/usdai-gpu-map.js";

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

async function fetchVastRentals(vastGpuName) {
  // Vast.ai bundles are multi-GPU servers; `dph_total` is the bundle hourly rate.
  // To get a per-GPU price we divide by `num_gpus`. We also keep `dph_total` order
  // for sorting so we still get the cheapest bundles first.
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
    const perGpu = offers
      .filter(o => Number.isFinite(Number(o.dph_total)) && Number.isFinite(Number(o.num_gpus)) && o.num_gpus > 0)
      .map(o => Number(o.dph_total) / Number(o.num_gpus))
      .filter(x => x > 0)
      .sort((a, b) => a - b);
    if (!perGpu.length) return { medianDph: null, p25Dph: null, p75Dph: null, listingCount: 0 };
    const pick = (p) => perGpu[Math.min(perGpu.length - 1, Math.floor(perGpu.length * p))];
    return {
      medianDph: pick(0.50),
      p25Dph:    pick(0.25),
      p75Dph:    pick(0.75),
      listingCount: perGpu.length,
    };
  } catch (e) {
    return { error: e.message };
  }
}

// Aggregate raw loans into rollup rows keyed by `group` field. USDai's UI
// shows 7 individual "RTX PRO 6000 [1]" loans as a single "RTX PRO 6000 [7]"
// row; the `group` field is the canonical key for this rollup.
function aggregateLoanGroups(loans) {
  const byKey = new Map();
  for (const l of loans) {
    const key = l.group || l.name || l.documentId;
    if (!key) continue;
    const e = byKey.get(key) || {
      groupKey: key,
      name: l.group || l.name,
      stage: l.stage,
      isDeployed: l.isDeployed,
      isEscrowed: false,
      escrowedTypes: new Set(),
      borrowers: new Set(),
      apr: l.apr,
      termSeconds: l.termSeconds,
      termDays: l.termDays,
      offTake: l.offTake,
      location: l.location,
      chain: l.chain,
      principal: 0,
      attestedUsd: 0,
      attestedSourceMix: { nft: 0, "replacement-cost": 0 },
      hardware: new Map(),  // name → { name, count, vastGpuName, replacementCost, defaultLifeYears }
      loanCount: 0,
      documentIds: [],
      tokenIds: new Set(),
    };
    e.loanCount += 1;
    e.documentIds.push(l.documentId);
    if (l.tokenId != null) e.tokenIds.add(l.tokenId);
    if (l.borrower) e.borrowers.add(l.borrower);
    if (l.isEscrowed) e.isEscrowed = true;
    if (l.escrowedType) e.escrowedTypes.add(l.escrowedType);
    if (l.principal) e.principal += l.principal;
    if (l.attestedUsd) {
      e.attestedUsd += l.attestedUsd;
      if (l.attestedSource) e.attestedSourceMix[l.attestedSource] = (e.attestedSourceMix[l.attestedSource] || 0) + 1;
    }
    for (const h of l.hardware || []) {
      const k = h.name;
      if (!k) continue;
      const prev = e.hardware.get(k);
      if (prev) prev.count += (h.count || 0);
      else e.hardware.set(k, { ...h, count: h.count || 0 });
    }
    byKey.set(key, e);
  }
  return [...byKey.values()].map(e => ({
    ...e,
    borrowers: [...e.borrowers],
    borrower: [...e.borrowers][0] || null,
    escrowedTypes: [...e.escrowedTypes],
    tokenIds: [...e.tokenIds],
    hardware: [...e.hardware.values()],
    attestedSource: e.attestedSourceMix.nft > 0 ? "nft" : (e.attestedSourceMix["replacement-cost"] > 0 ? "replacement-cost" : null),
  }))
  // Largest principal first (matches USDai UI ordering).
  .sort((a, b) => (b.principal || 0) - (a.principal || 0));
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
    // Enrich each hardware item with its GPU-map lookup (vastGpuName, replacementCost, defaultLifeYears).
    const hardware = loan.hardware.map(h => {
      const m = lookupGpu(h.name);
      return {
        name: h.name,
        count: h.count,
        percentage: h.percentage,
        vastGpuName: m?.vast ?? null,
        replacementCost: m?.replacementCost ?? null,
        defaultLifeYears: m?.life ?? null,
      };
    });
    const attestedUsd = meta?.collateralValueUsd ?? estimateFromReplacementCost(hardware);
    return {
      ...loan,
      hardware,
      tokenId: meta?.tokenId ?? null,
      attestedUsd,
      attestedSource: meta ? "nft" : (attestedUsd != null ? "replacement-cost" : null),
      attestedUsefulLifeDays: meta?.usefulLifeDays ?? null,
      manufacturer: meta?.manufacturer ?? null,
    };
  });

  // Phase 2: fan out to Vast.ai for each distinct mapped GPU model in the loans.
  const vastNames = distinctVastNames(loans.flatMap(l => l.hardware));
  const rentalsArr = await Promise.all(vastNames.map(async (name) => {
    const r = await fetchVastRentals(name);
    if (r.error) warnings.push(`vast ${name}: ${r.error}`);
    return [name, { ...r, updatedAt: new Date().toISOString() }];
  }));
  const gpuRentals = Object.fromEntries(rentalsArr);

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

  const loanGroups = aggregateLoanGroups(loans);

  return res.status(200).json({
    updatedAt: new Date().toISOString(),
    kpis,
    reserves,
    tvlHistory,
    loans,
    loanGroups,
    tbills,
    gpuRentals,
    warnings,
  });
}

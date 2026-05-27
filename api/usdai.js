import { lookupGpu, normalizeHardwareName, distinctVastNames } from "../src/utils/usdai-gpu-map.js";

const USDAI = "https://api.usd.ai/usdai";
const LLAMA = "https://api.llama.fi/protocol/usd-ai";

// Stage codes confirmed via proof-of-reserves probe (see plan Task 0 notes).
// Update if USDai changes the schema.
const STAGE_DEPLOYED = 6;

// Verified working tokenId ranges on metadata.usd.ai/v1/<id> (see plan notes).
// Generous upper bounds — fetcher tolerates 404s. Widened after discovering
// per-server NFTs extending past 410.
const TOKEN_ID_RANGES = [
  [101, 230],
  [251, 280],
  [301, 360],
  [401, 500],
  [1001, 1020],
];

// Extract a normalized GPU model key from a per-server NFT's `name` so we can
// bucket NFTs by model and compute per-GPU price stats. Examples:
//   "Supermicro NVIDIA B300 Server"            → "B300"
//   "Supermicro NVIDIA RTX 6000 Pro Server"    → "RTX PRO 6000"
//   "Octoserver NVIDIA Pro 6000 Blackwell..."  → "RTX PRO 6000"
//   "Asus NVIDIA RTX PRO 6000"                 → "RTX PRO 6000"
//   "DGC Zotac NVIDIA GeForce RTX 5090 Server" → "RTX 5090"
//   "Nvidia H200 x8 Server"                    → "H200"
//   "Supermicro B200 8-GPU Server 10.5.0.10"   → "B200"
function extractGpuFromNftName(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (/\bb300\b/.test(n))   return "B300";
  if (/\bb200\b/.test(n))   return "B200";
  if (/\bh200\b/.test(n))   return "H200";
  if (/\bh100\b/.test(n))   return "H100";
  if (/rtx[\s_]*5090/.test(n))  return "RTX 5090";
  if (/rtx[\s_]*4090/.test(n))  return "RTX 4090";
  // Various spellings: "RTX PRO 6000", "RTX 6000 Pro", "Pro 6000 Blackwell"
  if (/(?:rtx[\s_]*pro[\s_]*6000|rtx[\s_]*6000[\s_]*pro|\bpro[\s_]*6000[\s_]*blackwell)/.test(n)) return "RTX PRO 6000";
  if (/\ba100\b/.test(n))   return "A100";
  if (/\bl40s\b/.test(n))   return "L40S";
  if (/\bl40\b/.test(n))    return "L40";
  return null;
}

// Infer how many GPUs are packaged in a single per-server NFT bundle from
// its name. Most server NFTs are 1 GPU; some are explicitly multi-GPU.
//   "Supermicro B200 8-GPU Server" → 8
//   "Nvidia H200 x8 Server"        → 8
//   "Supermicro NVIDIA B300 Server" → 1
function inferGpusPerNft(name) {
  if (!name) return 1;
  const m1 = name.match(/(\d+)[-\s]?gpu/i);
  if (m1) return parseInt(m1[1], 10);
  const m2 = name.match(/\bx\s*(\d+)\b/i);
  if (m2) return parseInt(m2[1], 10);
  return 1;
}

function median(arr) {
  const a = arr.filter(x => Number.isFinite(x) && x > 0).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// From all fetched NFTs, build a per-GPU-model price index using per-server
// NFTs (qty=1). Aggregate roll-up NFTs (qty>1) are excluded from this index
// because their cv includes network fabric / infra that doesn't scale 1:1
// with GPU count.
function buildPerGpuIndexFromNfts(metadataList) {
  const buckets = new Map(); // model → { perGpuValues: [], samples: [] }
  for (const m of metadataList) {
    if (!m || m.collateralValueUsd == null) continue;
    if (m.quantity != null && m.quantity > 1) continue; // skip aggregate roll-ups
    const model = extractGpuFromNftName(m.name);
    if (!model) continue;
    const gpusPerBundle = inferGpusPerNft(m.name);
    const perGpu = m.collateralValueUsd / Math.max(1, gpusPerBundle);
    const b = buckets.get(model) || { perGpuValues: [], samples: [] };
    b.perGpuValues.push(perGpu);
    b.samples.push({ tokenId: m.tokenId, name: m.name, cv: m.collateralValueUsd, gpusPerBundle });
    buckets.set(model, b);
  }
  const out = {};
  for (const [model, b] of buckets) {
    out[model] = {
      perGpuUsd: median(b.perGpuValues),
      nftCount: b.samples.length,
      samples: b.samples.slice(0, 5),  // for transparency / UI tooltip
    };
  }
  return out;
}

// Estimate attested USD from the per-GPU NFT index. Returns null if no model
// in the loan's hardware has any NFT samples.
function estimateFromPerGpuIndex(hardware, perGpuIndex) {
  if (!Array.isArray(hardware) || !perGpuIndex) return null;
  let total = 0, anyHit = false;
  for (const h of hardware) {
    const key = (h.name || "").replace(/^NVIDIA\s+/i, "").replace(/\s*Blackwell\s*$/i, "").trim();
    const entry = perGpuIndex[key];
    if (entry?.perGpuUsd && h.count) {
      total += entry.perGpuUsd * h.count;
      anyHit = true;
    }
  }
  return anyHit ? total : null;
}

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
//
// IMPORTANT: when `group` is null, each loan stays as its own row. Falling
// back to `name` would incorrectly merge distinct loans that happen to share
// a name (e.g. two different B300 [128] loans, one in OH, USA and one in
// NSW, Australia, both have group: null and name: "B300 [128]").
function aggregateLoanGroups(loans) {
  const byKey = new Map();
  for (const l of loans) {
    const key = l.group || l.documentId;
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
      attestedSourceMix: { "nft-aggregate": 0, "nft-per-server": 0, "replacement-cost": 0 },
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
  return [...byKey.values()].map(e => {
    // Priority: aggregate > per-server > replacement-cost (best provenance first).
    let attestedSource = null;
    if (e.attestedSourceMix["nft-aggregate"] > 0)   attestedSource = "nft-aggregate";
    else if (e.attestedSourceMix["nft-per-server"] > 0) attestedSource = "nft-per-server";
    else if (e.attestedSourceMix["replacement-cost"] > 0) attestedSource = "replacement-cost";
    return {
      ...e,
      borrowers: [...e.borrowers],
      borrower: [...e.borrowers][0] || null,
      escrowedTypes: [...e.escrowedTypes],
      tokenIds: [...e.tokenIds],
      hardware: [...e.hardware.values()],
      attestedSource,
    };
  })
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

  // Fetch all NFT metadata across known tokenId ranges. We use it two ways:
  //   1. Aggregate roll-up join by exact loan name (1001+ range, e.g. "B200 [96]")
  //   2. Per-GPU price index built from per-server NFTs (qty=1) — used as
  //      attested fallback for loans without a 1001+ aggregate match.
  const metadataList = await safe(fetchAllMetadata(), "metadata", warnings) || [];

  // Build aggregate-roll-up index: ONLY NFTs with qty>1 join here. This stops
  // small per-server NFTs (e.g. "Supermicro NVIDIA B300 Server" qty=1) from
  // accidentally matching a loan that needs the full roll-up valuation.
  const nameToAggregateMeta = new Map();
  for (const m of metadataList) {
    if (!m.name || m.collateralValueUsd == null) continue;
    if (m.quantity == null || m.quantity <= 1) continue;
    const key = m.name.replace(/^NVIDIA\s+/i, "").trim();
    const prev = nameToAggregateMeta.get(key);
    if (!prev || m.collateralValueUsd > prev.collateralValueUsd) nameToAggregateMeta.set(key, m);
  }

  // Per-GPU price index from per-server NFTs.
  const perGpuIndex = buildPerGpuIndexFromNfts(metadataList);

  const tbills = por_array.filter(x => x.type === "TBILL").map(parseTbillRow);
  const loans = por_array.filter(x => x.type === "DEAL").map(parseLoanRow).map(loan => {
    const key = (loan.name || "").replace(/^NVIDIA\s+/i, "").trim();
    const aggMeta = nameToAggregateMeta.get(key);
    // Enrich each hardware item with its GPU-map lookup (Vast.ai proxy info)
    // and attach the per-GPU NFT price for transparency.
    const hardware = loan.hardware.map(h => {
      const m = lookupGpu(h.name);
      const gpuKey = (h.name || "").replace(/^NVIDIA\s+/i, "").replace(/\s*Blackwell\s*$/i, "").trim();
      const idxEntry = perGpuIndex[gpuKey];
      return {
        name: h.name,
        count: h.count,
        percentage: h.percentage,
        vastGpuName: m?.vast ?? null,
        vastProxy: m?.vastProxy ?? null,
        replacementCost: m?.replacementCost ?? null,  // last-resort fallback & DCF salvage anchor
        defaultLifeYears: m?.life ?? null,
        // NFT-derived per-GPU price (from per-server NFTs). null when the
        // model has no per-server NFT samples in the inventory.
        perGpuUsdFromNft: idxEntry?.perGpuUsd ?? null,
        nftSampleCount: idxEntry?.nftCount ?? 0,
      };
    });

    // Layered attested-USD resolution:
    //   1. Aggregate roll-up NFT by exact name (e.g. "B200 [96]") — best
    //   2. Per-server NFT price × hardware count — derived from USDai's own NFTs
    //   3. Replacement-cost guess (last resort, only when no NFT data exists)
    let attestedUsd = null, attestedSource = null;
    if (aggMeta) {
      attestedUsd = aggMeta.collateralValueUsd;
      attestedSource = "nft-aggregate";
    } else {
      const v = estimateFromPerGpuIndex(hardware, perGpuIndex);
      if (v != null) {
        attestedUsd = v;
        attestedSource = "nft-per-server";
      } else {
        const v2 = estimateFromReplacementCost(hardware);
        if (v2 != null) {
          attestedUsd = v2;
          attestedSource = "replacement-cost";
        }
      }
    }

    return {
      ...loan,
      hardware,
      tokenId: aggMeta?.tokenId ?? null,
      attestedUsd,
      attestedSource,
      attestedUsefulLifeDays: aggMeta?.usefulLifeDays ?? null,
      manufacturer: aggMeta?.manufacturer ?? null,
    };
  });

  // Phase 2: fan out to Vast.ai for each distinct mapped GPU model in the loans,
  // INCLUDING proxy names (e.g. B200 as a stand-in for B300).
  const vastNameSet = new Set();
  for (const l of loans) {
    for (const h of l.hardware) {
      if (h.vastGpuName) vastNameSet.add(h.vastGpuName);
      if (h.vastProxy)   vastNameSet.add(h.vastProxy);
    }
  }
  const vastNames = [...vastNameSet];
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
    perGpuIndex,  // NFT-derived per-GPU price index for transparency
    warnings,
  });
}

import { lookupGpu, normalizeHardwareName, distinctVastNames } from "../src/utils/usdai-gpu-map.js";

const USDAI = "https://api.usd.ai/usdai";
const LLAMA = "https://api.llama.fi/protocol/usd-ai";

// ─── On-chain bundle indexer config ─────────────────────────────────────────
const ARB_RPC = "https://arb1.arbitrum.io/rpc";
const HARDWARE_NFT = "0xb31f04f920f24eda3ad276d55c5afefad6230c5d"; // USD.AI Tokenized Hardware
const BUNDLE_WRAPPER = "0x80E3146FB2328fE1b79f92F5a3a6bF35515AEe37"; // BundleCollateralWrapper
const LOAN_ROUTER    = "0x0C2ED170F2bB1DF1a44292Ad621B577b3C9597D1"; // active-bundle holder
// keccak256("BundleMinted(uint256,address,bytes)") — computed once via web3_sha3
const TOPIC_BUNDLE_MINTED = "0x448434564de2b5ad2b94efb65ddb08d1d069f1172cff44e3092314d4b6490871";
// keccak256("Transfer(address,address,uint256)") — ERC-721 standard event
const TOPIC_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Sweep range — bundles were first minted around block 400M; widen the start
// if you find unwrapped/older ones during refresh.
const BUNDLE_SWEEP_FROM = 350_000_000;
const BUNDLE_SWEEP_CHUNK = 5_000_000;

// Module-level cache for the bundle index. Vercel keeps the module warm across
// requests, so this is a process-wide cache. TTL is 30 min — bundles are rare
// events (one per new loan).
let _bundleCache = null; // { ts, bundles, byBorrower, aggregateOrigination }
const BUNDLE_TTL_MS = 30 * 60 * 1000;

// Block timestamp cache — block timestamps never change, so cache forever.
const _blockTimestampCache = new Map();
// tokenId → origination timestamp (ms) cache for aggregate NFTs
const _aggregateOriginationCache = new Map();

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

// Module-level cache for NFT metadata — these are static per tokenId so cache
// aggressively. Once we've seen an NFT's cv, never re-fetch it.
const _metadataCache = new Map();

async function fetchMetadata(tokenId) {
  if (_metadataCache.has(tokenId)) return _metadataCache.get(tokenId);
  // Retry up to 3 times with backoff before giving up
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://metadata.usd.ai/v1/${tokenId}`, { signal: AbortSignal.timeout(6000) });
      if (r.status === 404) {
        _metadataCache.set(tokenId, null);  // cache negative for missing IDs
        return null;
      }
      if (!r.ok) {
        await new Promise(s => setTimeout(s, 200 * (attempt + 1)));
        continue;
      }
      const j = await r.json();
      const attrs = Object.fromEntries((j.attributes || []).map(a => [a.trait_type, a.value]));
      const result = {
        tokenId,
        name: j.name,
        collateralValueUsd: typeof attrs["Collateral Value USD"] === "number" ? attrs["Collateral Value USD"] : null,
        usefulLifeDays: typeof attrs["Useful Life (days)"] === "number" ? attrs["Useful Life (days)"] : null,
        quantity: typeof attrs["Quantity"] === "number" ? attrs["Quantity"] : null,
        manufacturer: attrs["Manufacturer"] || null,
      };
      _metadataCache.set(tokenId, result);
      return result;
    } catch {
      await new Promise(s => setTimeout(s, 200 * (attempt + 1)));
    }
  }
  return null; // don't cache; allow retry next refresh
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

// ─── Bundle indexer helpers ────────────────────────────────────────────────

async function rpcCall(method, params, timeoutMs = 15000) {
  const resp = await fetch(ARB_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) throw new Error(`RPC ${method} ${resp.status}`);
  const j = await resp.json();
  if (j.error) throw new Error(`RPC ${method}: ${j.error.message}`);
  return j.result;
}

// Decode BundleMinted event data bytes payload.
// Layout: 0x[32-byte offset=0x20][32-byte length L][L bytes content]
// Content: 20-byte NFT contract address + N × 32-byte tokenIds
function decodeBundlePayload(dataHex) {
  if (!dataHex || !dataHex.startsWith("0x")) return { contract: null, tokenIds: [] };
  const raw = dataHex.slice(2);
  if (raw.length < 64 + 64) return { contract: null, tokenIds: [] };
  // Skip offset (64 chars) and length (64 chars)
  const content = raw.slice(64 + 64);
  if (content.length < 40) return { contract: null, tokenIds: [] };
  const contract = "0x" + content.slice(0, 40);
  const tokenIdsHex = content.slice(40);
  const tokenIds = [];
  for (let i = 0; i + 64 <= tokenIdsHex.length; i += 64) {
    const v = BigInt("0x" + tokenIdsHex.slice(i, i + 64));
    if (v > 0n) tokenIds.push(Number(v));
  }
  return { contract: contract.toLowerCase(), tokenIds };
}

async function fetchBundleMintedEvents() {
  const latest = parseInt(await rpcCall("eth_blockNumber", []), 16);
  const chunks = [];
  for (let start = BUNDLE_SWEEP_FROM; start < latest; start += BUNDLE_SWEEP_CHUNK) {
    chunks.push([start, Math.min(start + BUNDLE_SWEEP_CHUNK - 1, latest)]);
  }
  // Parallel fetch with concurrency limit
  const CONCURRENCY = 6;
  const all = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async ([fr, to]) => {
      try {
        const logs = await rpcCall("eth_getLogs", [{
          address: BUNDLE_WRAPPER,
          topics: [TOPIC_BUNDLE_MINTED],
          fromBlock: "0x" + fr.toString(16),
          toBlock: "0x" + to.toString(16),
        }], 20000);
        return logs || [];
      } catch (e) {
        return []; // best-effort; partial sweep is fine
      }
    }));
    for (const r of results) all.push(...r);
  }
  // Dedupe by tx hash
  const seen = new Set();
  return all.filter(e => {
    const k = e.transactionHash + ":" + e.logIndex;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Resolve a block number (hex or int) to a Unix timestamp in ms.
async function getBlockTimestamp(blockHex) {
  const key = typeof blockHex === "number" ? blockHex : parseInt(blockHex, 16);
  if (_blockTimestampCache.has(key)) return _blockTimestampCache.get(key);
  try {
    const blk = await rpcCall("eth_getBlockByNumber", [
      typeof blockHex === "string" ? blockHex : "0x" + key.toString(16),
      false,
    ], 8000);
    if (!blk?.timestamp) return null;
    const ms = parseInt(blk.timestamp, 16) * 1000;
    _blockTimestampCache.set(key, ms);
    return ms;
  } catch {
    return null;
  }
}

// Find origination timestamp for an aggregate NFT (tokens 1001+) — the first
// Transfer event for that tokenId on the hardware contract is the mint.
async function getAggregateOrigination(tokenId) {
  if (_aggregateOriginationCache.has(tokenId)) return _aggregateOriginationCache.get(tokenId);
  const topic3 = "0x" + tokenId.toString(16).padStart(64, "0");
  try {
    const logs = await rpcCall("eth_getLogs", [{
      address: HARDWARE_NFT,
      topics: [TOPIC_TRANSFER, null, null, topic3],
      fromBlock: "0x" + BUNDLE_SWEEP_FROM.toString(16),
      toBlock: "latest",
    }], 15000);
    if (!logs?.length) {
      _aggregateOriginationCache.set(tokenId, null);
      return null;
    }
    // Earliest block is the mint
    logs.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16));
    const ts = await getBlockTimestamp(logs[0].blockNumber);
    _aggregateOriginationCache.set(tokenId, ts);
    return ts;
  } catch {
    return null;
  }
}

// Pattern C: find per-server NFTs that aren't in a bundle (i.e. held directly
// by the LoanRouter or some other USDai-controlled position contract). These
// back loans like RTX 5090 [15] whose original bundle was unwrapped and the
// underlying NFTs transferred to the LoanRouter individually.
//
// Returns:  { tokenId, name, collateralValueUsd, ownerAddr, model }[]
async function findDirectlyHeldNfts(metadataList, bundleTokenIdSet) {
  // Only per-server NFTs (qty=1) can be Pattern C. Aggregate roll-ups (qty>1)
  // are Pattern A and don't need this lookup. NFTs already in an active bundle
  // are Pattern B — exclude them.
  const candidates = (metadataList || []).filter(m =>
    m && m.tokenId && m.quantity === 1 && !bundleTokenIdSet.has(m.tokenId)
  );
  const CONCURRENCY = 8;
  const directlyHeld = [];
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (m) => {
      try {
        const hex = m.tokenId.toString(16).padStart(64, "0");
        const owner = await rpcCall("eth_call", [{
          to: HARDWARE_NFT,
          data: "0x6352211e" + hex,
        }, "latest"], 8000);
        if (!owner || owner === "0x") return null;
        const ownerAddr = ("0x" + owner.slice(-40)).toLowerCase();
        // Skip if held by the wrapper (those should have been in bundleTokenIdSet
        // — defensive double-check)
        if (ownerAddr === BUNDLE_WRAPPER.toLowerCase()) return null;
        // Skip 0x0 (burned) and the original deployer/mint sources
        if (ownerAddr === "0x0000000000000000000000000000000000000000") return null;
        const model = extractGpuFromNftName(m.name);
        return {
          tokenId: m.tokenId,
          name: m.name,
          collateralValueUsd: m.collateralValueUsd,
          ownerAddr,
          model,
          isLoanRouter: ownerAddr === LOAN_ROUTER.toLowerCase(),
        };
      } catch { return null; }
    }));
    directlyHeld.push(...results.filter(Boolean));
  }
  return directlyHeld;
}

// Given an array of BundleMinted events, check current owner of each bundle
// and return only those still held by the LoanRouter (i.e. active collateral).
async function filterActiveBundles(events) {
  const CONCURRENCY = 8;
  const out = [];
  for (let i = 0; i < events.length; i += CONCURRENCY) {
    const batch = events.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (e) => {
      const bundleIdHex = e.topics[1];
      try {
        const owner = await rpcCall("eth_call", [{
          to: BUNDLE_WRAPPER,
          data: "0x6352211e" + bundleIdHex.slice(2),
        }, "latest"], 8000);
        if (!owner || owner === "0x") return null;
        const ownerAddr = ("0x" + owner.slice(-40)).toLowerCase();
        if (ownerAddr !== LOAN_ROUTER.toLowerCase()) return null;
        return { event: e, owner: ownerAddr };
      } catch {
        return null;
      }
    }));
    for (const r of results) if (r) out.push(r);
  }
  return out;
}

// Main entry: build (and cache) the index of active bundles, summing cv across
// each bundle's underlying NFTs. Returns:
//   { bundles: [{ bundleId, account, tokenIds, totalCv, gpuCounts }], byBorrower: Map }
async function buildBundleIndex(metadataById, warnings) {
  if (_bundleCache && (Date.now() - _bundleCache.ts) < BUNDLE_TTL_MS) {
    return _bundleCache;
  }
  try {
    const events = await fetchBundleMintedEvents();
    const active = await filterActiveBundles(events);
    const bundles = [];
    for (const { event, owner } of active) {
      const bundleIdHex = event.topics[1];
      const accountAddr = ("0x" + event.topics[2].slice(-40)).toLowerCase();
      const { contract, tokenIds } = decodeBundlePayload(event.data);
      // Only consider bundles backed by the USD.AI Tokenized Hardware NFT
      if (contract && contract !== HARDWARE_NFT.toLowerCase()) continue;
      let totalCv = 0;
      const gpuCounts = {};
      const memberNfts = [];
      for (const tid of tokenIds) {
        const meta = metadataById.get(tid);
        if (!meta) continue;
        if (meta.collateralValueUsd != null) totalCv += meta.collateralValueUsd;
        const gpu = extractGpuFromNftName(meta.name);
        if (gpu) {
          const perBundle = inferGpusPerNft(meta.name);
          gpuCounts[gpu] = (gpuCounts[gpu] || 0) + perBundle;
        }
        memberNfts.push({ tokenId: tid, name: meta.name, cv: meta.collateralValueUsd });
      }
      bundles.push({
        bundleId: bundleIdHex,
        account: accountAddr,
        owner,
        tokenIds,
        totalCv,
        gpuCounts,
        memberNfts,
        blockNumber: event.blockNumber,
        originationDate: null,  // filled in below
      });
    }

    // Fetch block timestamps for each bundle's BundleMinted event in parallel.
    await Promise.all(bundles.map(async (b) => {
      b.originationDate = await getBlockTimestamp(b.blockNumber);
    }));

    // Group by borrower address
    const byBorrower = new Map();
    for (const b of bundles) {
      const arr = byBorrower.get(b.account) || [];
      arr.push(b);
      byBorrower.set(b.account, arr);
    }

    // Also resolve origination for aggregate NFTs (1001+). Tokens that aren't
    // aggregates will return null — we filter those out.
    const aggregateOrigination = new Map();
    const aggregateTokenIds = [];
    for (const [tid, meta] of metadataById) {
      if (meta?.quantity && meta.quantity > 1) aggregateTokenIds.push(tid);
    }
    await Promise.all(aggregateTokenIds.map(async (tid) => {
      const ts = await getAggregateOrigination(tid);
      if (ts) aggregateOrigination.set(tid, ts);
    }));

    // Pattern C: per-server NFTs held directly by the LoanRouter (or other USDai
    // position contracts) — these back loans like RTX 5090 [15] whose original
    // bundle was unwrapped.
    const bundleTokenIdSet = new Set();
    for (const b of bundles) for (const tid of b.tokenIds) bundleTokenIdSet.add(tid);
    const directlyHeldNfts = await findDirectlyHeldNfts([...metadataById.values()], bundleTokenIdSet) || [];

    // Group Pattern C NFTs by GPU model so we can match to loans by hardware spec.
    const patternCByModel = new Map();
    for (const nft of directlyHeldNfts) {
      if (!nft.model || !nft.collateralValueUsd) continue;
      if (!patternCByModel.has(nft.model)) patternCByModel.set(nft.model, []);
      patternCByModel.get(nft.model).push(nft);
    }

    // Resolve origination dates for each unique Pattern C tokenId (first
    // Transfer event for the NFT — typically the mint timestamp).
    const directlyHeldOrigination = new Map(); // tokenId -> ms
    await Promise.all(directlyHeldNfts.map(async (nft) => {
      const ts = await getAggregateOrigination(nft.tokenId);
      if (ts) directlyHeldOrigination.set(nft.tokenId, ts);
    }));

    // If any bundle came back with totalCv=0 (metadata-fetch failure mid-build),
    // don't cache so the next refresh retries. Otherwise cache for the TTL.
    const hasBrokenBundle = bundles.some(b => b.totalCv === 0 && b.tokenIds.length > 0);
    const result = {
      ts: Date.now(),
      bundles, byBorrower, aggregateOrigination,
      patternCByModel, directlyHeldOrigination,
    };
    if (!hasBrokenBundle) _bundleCache = result;
    return result;
  } catch (e) {
    if (warnings) warnings.push(`bundleIndex: ${e.message}`);
    return { ts: Date.now(), bundles: [], byBorrower: new Map(), aggregateOrigination: new Map(), patternCByModel: new Map(), directlyHeldOrigination: new Map() };
  }
}

// Score how well a bundle's hardware composition matches a loan's hardware list.
// Higher = better. Returns 0 if no overlap.
function scoreBundleLoanMatch(bundle, loan) {
  if (!bundle.gpuCounts || !loan.hardware?.length) return 0;
  let score = 0;
  for (const h of loan.hardware) {
    const k = (h.name || "").replace(/^NVIDIA\s+/i, "").replace(/\s*Blackwell\s*$/i, "").trim();
    const inBundle = bundle.gpuCounts[k] || 0;
    if (inBundle > 0) {
      // Exact GPU-count match gets a big bonus; otherwise reward presence.
      score += (inBundle === h.count) ? 100 : 10;
    }
  }
  return score;
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
function aggregateLoanGroups(loans, bundleCvById = new Map()) {
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
      attestedUsefulLifeDays: l.attestedUsefulLifeDays || 1080,
      originationDate: l.originationDate || null,
      maturityDate: l.maturityDate || null,
      attestedSourceMix: { "nft-aggregate": 0, "nft-bundle": 0, "nft-direct": 0, "nft-per-server": 0, "replacement-cost": 0 },
      hardware: new Map(),  // name → { name, count, vastGpuName, replacementCost, defaultLifeYears }
      loanCount: 0,
      documentIds: [],
      tokenIds: new Set(),
      bundleIds: new Set(),
      bundleNfts: [],
    };
    e.loanCount += 1;
    e.documentIds.push(l.documentId);
    if (l.tokenId != null) e.tokenIds.add(l.tokenId);
    if (l.bundleId) e.bundleIds.add(l.bundleId);
    if (Array.isArray(l.bundleNfts) && e.bundleNfts.length === 0) e.bundleNfts = l.bundleNfts;
    if (l.borrower) e.borrowers.add(l.borrower);
    if (l.isEscrowed) e.isEscrowed = true;
    if (l.escrowedType) e.escrowedTypes.add(l.escrowedType);
    if (l.principal) e.principal += l.principal;
    // Keep the first non-null origination/maturity we encounter in the group.
    if (e.originationDate == null && l.originationDate != null) e.originationDate = l.originationDate;
    if (e.maturityDate == null && l.maturityDate != null) e.maturityDate = l.maturityDate;
    // Dedupe attested cv at the group level:
    //   - Sources backed by a specific bundleId or NFT tokenId count ONCE per group.
    //   - Sources without a unique ID (per-server median, replacement-cost) sum per raw loan.
    if (l.attestedUsd != null) {
      e._countedBundleIds = e._countedBundleIds || new Set();
      e._countedTokenIds = e._countedTokenIds || new Set();
      let credit = 0;
      if (l.bundleId && bundleCvById.has(l.bundleId)) {
        if (!e._countedBundleIds.has(l.bundleId)) {
          credit = bundleCvById.get(l.bundleId);
          e._countedBundleIds.add(l.bundleId);
        }
      } else if (l.attestedSource === "nft-direct" && Array.isArray(l.bundleNfts)) {
        // Sum cv of each not-yet-counted tokenId
        for (const n of l.bundleNfts) {
          if (n?.tokenId == null) continue;
          if (!e._countedTokenIds.has(n.tokenId)) {
            credit += (n.cv || 0);
            e._countedTokenIds.add(n.tokenId);
          }
        }
      } else if (l.tokenId != null) {
        if (!e._countedTokenIds.has(l.tokenId)) {
          credit = l.attestedUsd;
          e._countedTokenIds.add(l.tokenId);
        }
      } else {
        credit = l.attestedUsd;
      }
      e.attestedUsd += credit;
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
    if (e.attestedSourceMix["nft-aggregate"] > 0)       attestedSource = "nft-aggregate";
    else if (e.attestedSourceMix["nft-bundle"] > 0)     attestedSource = "nft-bundle";
    else if (e.attestedSourceMix["nft-direct"] > 0)     attestedSource = "nft-direct";
    else if (e.attestedSourceMix["nft-per-server"] > 0) attestedSource = "nft-per-server";
    else if (e.attestedSourceMix["replacement-cost"] > 0) attestedSource = "replacement-cost";
    const { _countedBundleIds, _countedTokenIds, ...rest } = e;
    return {
      ...rest,
      borrowers: [...e.borrowers],
      borrower: [...e.borrowers][0] || null,
      escrowedTypes: [...e.escrowedTypes],
      tokenIds: [...e.tokenIds],
      bundleIds: [...e.bundleIds],
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
  // Pre-parse deal loans so we can do per-borrower bundle assignment in one pass.
  const rawDeals = por_array.filter(x => x.type === "DEAL").map(parseLoanRow);

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

  // tokenId → metadata map (for bundle cv summation).
  const metadataById = new Map(metadataList.map(m => [m.tokenId, m]));

  // Build the bundle index from on-chain events. Cached at module level.
  const bundleIndex = await buildBundleIndex(metadataById, warnings);

  // ── Pattern C: assign directly-held NFTs to loans by hardware spec ─────────
  // For loans not covered by an aggregate NFT or an active bundle, allocate
  // directly-held per-server NFTs (Pattern C) by matching GPU model + count.
  // Each NFT can be assigned to at most one loan.
  const patternCAssignment = new Map(); // documentId -> [nft, ...]
  const patternCOriginationByDoc = new Map(); // documentId -> earliest ms
  {
    // Make a working copy of the byModel pools so we can pop NFTs as they're assigned
    const pools = new Map();
    for (const [model, nfts] of (bundleIndex.patternCByModel || new Map())) {
      pools.set(model, nfts.slice());
    }
    // Sort loans by stage (deployed first) then by principal (largest first)
    const sortedRawDeals = rawDeals.slice().sort((a, b) => {
      if (a.isDeployed !== b.isDeployed) return a.isDeployed ? -1 : 1;
      return (b.principal || 0) - (a.principal || 0);
    });
    for (const loan of sortedRawDeals) {
      // Skip if already covered by an aggregate NFT or a bundle
      const loanNameKey = (loan.name || "").replace(/^NVIDIA\s+/i, "").trim();
      if (nameToAggregateMeta.has(loanNameKey)) continue;
      // (we'll know later if a bundle was assigned, but Pattern C is a fallback —
      // try anyway and let later logic prefer bundle if both exist)
      const assignedNfts = [];
      let earliestOrigination = null;
      for (const h of loan.hardware) {
        const k = (h.name || "").replace(/^NVIDIA\s+/i, "").replace(/\s*Blackwell\s*$/i, "").trim();
        const model = extractGpuFromNftName(k) || k;
        const pool = pools.get(model);
        if (!pool || !pool.length) continue;
        const taken = pool.splice(0, h.count || 0);
        assignedNfts.push(...taken);
        for (const nft of taken) {
          const ts = bundleIndex.directlyHeldOrigination?.get(nft.tokenId);
          if (ts && (earliestOrigination == null || ts < earliestOrigination)) {
            earliestOrigination = ts;
          }
        }
      }
      if (assignedNfts.length > 0) {
        patternCAssignment.set(loan.documentId, assignedNfts);
        if (earliestOrigination) patternCOriginationByDoc.set(loan.documentId, earliestOrigination);
      }
    }
  }

  // ── Per-borrower greedy bundle assignment ──────────────────────────────────
  // For each borrower, distribute their active bundles 1:1 across their raw
  // loans. A bundle is preferentially assigned to the loan whose hardware
  // composition best matches the bundle's gpuCounts.
  // Each bundle gets used ONCE; leftover loans (more loans than bundles) fall
  // through to per-server-NFT median or replacement-cost in the layered logic.
  const loanBundleAssignment = new Map(); // documentId → bundle object
  const loansByBorrower = new Map();
  for (const l of rawDeals) {
    const b = (l.borrower || "").toLowerCase();
    if (!loansByBorrower.has(b)) loansByBorrower.set(b, []);
    loansByBorrower.get(b).push(l);
  }
  for (const [borrower, borrowerLoans] of loansByBorrower) {
    const availableBundles = [...(bundleIndex.byBorrower.get(borrower) || [])];
    if (availableBundles.length === 0) continue;
    const remainingLoans = borrowerLoans.slice().sort((a, b) => (b.principal || 0) - (a.principal || 0));
    // Greedy: each bundle picks its best loan, removing the loan from the pool.
    const bundlesByScore = availableBundles.slice().sort((a, b) => {
      // Larger bundles (more NFTs / higher cv) get first pick
      return (b.totalCv || 0) - (a.totalCv || 0);
    });
    for (const bundle of bundlesByScore) {
      if (remainingLoans.length === 0) break;
      // Find the loan whose hardware best matches this bundle's gpuCounts
      let bestIdx = 0, bestScore = -1;
      for (let i = 0; i < remainingLoans.length; i++) {
        const s = scoreBundleLoanMatch(bundle, remainingLoans[i]);
        if (s > bestScore) { bestScore = s; bestIdx = i; }
      }
      const matched = remainingLoans.splice(bestIdx, 1)[0];
      loanBundleAssignment.set(matched.documentId, bundle);
    }
  }

  const tbills = por_array.filter(x => x.type === "TBILL").map(parseTbillRow);
  const loans = rawDeals.map(loan => {
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

    // Layered attested-USD resolution (best provenance first):
    //   1. Aggregate roll-up NFT by exact name (e.g. "B200 [96]") — direct match
    //   2. On-chain BUNDLE indexer by borrower address — sums all NFTs the loan
    //      router actually holds against this loan (per-server + infrastructure)
    //   3. Per-server NFT price × hardware count — derived but loose estimate
    //   4. Replacement-cost guess (last resort)
    let attestedUsd = null, attestedSource = null;
    let matchedBundleId = null, matchedBundleNfts = null;
    let originationDate = null;

    if (aggMeta) {
      attestedUsd = aggMeta.collateralValueUsd;
      attestedSource = "nft-aggregate";
      originationDate = bundleIndex.aggregateOrigination?.get(aggMeta.tokenId) ?? null;
    } else {
      // Use the per-borrower bundle assignment computed above (each bundle
      // assigned to exactly one raw loan).
      const assignedBundle = loanBundleAssignment.get(loan.documentId);
      // Treat a bundle as invalid if its totalCv is 0 (metadata-fetch race on
      // cold start can produce empty bundles even though the on-chain bundle
      // was matched). Fall through to per-server estimation in that case.
      if (assignedBundle && assignedBundle.totalCv > 0) {
        attestedUsd = assignedBundle.totalCv;
        attestedSource = "nft-bundle";
        matchedBundleId = assignedBundle.bundleId;
        matchedBundleNfts = assignedBundle.memberNfts;
        originationDate = assignedBundle.originationDate;
      } else if (assignedBundle) {
        // Bundle was matched but metadata was incomplete — keep the origination
        // date (still useful for the lifecycle chart) but use per-server fallback for cv.
        originationDate = assignedBundle.originationDate;
      }

      // Pattern C fallback: directly-held NFTs (e.g. RTX 5090 [15])
      if (attestedUsd == null) {
        const patternCNfts = patternCAssignment.get(loan.documentId);
        if (patternCNfts && patternCNfts.length > 0) {
          const totalCv = patternCNfts.reduce((s, n) => s + (n.collateralValueUsd || 0), 0);
          if (totalCv > 0) {
            attestedUsd = totalCv;
            attestedSource = "nft-direct";
            matchedBundleNfts = patternCNfts.map(n => ({
              tokenId: n.tokenId,
              name: n.name,
              cv: n.collateralValueUsd,
            }));
            if (originationDate == null) {
              originationDate = patternCOriginationByDoc.get(loan.documentId) ?? null;
            }
          }
        }
      }

      if (attestedUsd == null) {
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
    }

    return {
      ...loan,
      hardware,
      tokenId: aggMeta?.tokenId ?? null,
      bundleId: matchedBundleId,
      bundleNfts: matchedBundleNfts,
      attestedUsd,
      attestedSource,
      attestedUsefulLifeDays: aggMeta?.usefulLifeDays ?? 1080,
      manufacturer: aggMeta?.manufacturer ?? null,
      originationDate,
      maturityDate: (originationDate != null && loan.termSeconds)
        ? originationDate + (loan.termSeconds * 1000) : null,
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

  // Build a bundleId → totalCv lookup so aggregateLoanGroups can dedupe.
  const bundleCvById = new Map();
  for (const b of bundleIndex.bundles) bundleCvById.set(b.bundleId, b.totalCv);

  const loanGroups = aggregateLoanGroups(loans, bundleCvById);

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

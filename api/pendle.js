const PENDLE_MARKETS_API = "https://api-v2.pendle.finance/core/v2/markets/all";
const PENDLE_SPENDLE_API = "https://api-v2.pendle.finance/core/v1/spendle/data";

const CHAIN_NAMES = {
  1: "Ethereum",
  42161: "Arbitrum",
  10: "Optimism",
  8453: "Base",
  56: "BNB Chain",
  146: "Sonic",
  999: "HyperEVM",
  5000: "Mantle",
  9745: "Plasma",
  80084: "Berachain",
  80094: "Berachain",
};

function chainName(id) {
  return CHAIN_NAMES[id] || `Chain ${id}`;
}

async function fetchAllMarkets() {
  const limit = 100;
  let skip = 0;
  let allMarkets = [];
  let total = Infinity;

  while (skip < total) {
    const url = `${PENDLE_MARKETS_API}?limit=${limit}&skip=${skip}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Pendle Markets API ${resp.status}: ${body}`);
    }
    const data = await resp.json();
    total = data.total || 0;
    const results = data.results || [];
    allMarkets = allMarkets.concat(results);
    skip += limit;
    if (results.length === 0) break;
  }

  return allMarkets;
}

async function fetchSPendleData() {
  const resp = await fetch(PENDLE_SPENDLE_API);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Pendle sPENDLE API ${resp.status}: ${body}`);
  }
  return resp.json();
}

function parseMarket(m) {
  const now = new Date();
  const expiry = m.expiry || null;
  const isExpired = expiry ? new Date(expiry) < now : false;
  const d = m.details || {};

  return {
    name: m.name || "",
    address: m.address || "",
    chain: chainName(m.chainId),
    chainId: m.chainId,
    expiry,
    // Token IDs (format: "chainId-address")
    ptId: m.pt || null,
    ytId: m.yt || null,
    syId: m.sy || null,
    underlyingAssetId: m.underlyingAsset || null,
    // APY breakdown (decimals → percentages)
    impliedApy: (d.impliedApy || 0) * 100,
    underlyingApy: (d.underlyingApy || 0) * 100,
    ytFloatingApy: (d.ytFloatingApy || 0) * 100,
    swapFeeApy: (d.swapFeeApy || 0) * 100,
    pendleApy: (d.pendleApy || 0) * 100,
    maxBoostedApy: (d.maxBoostedApy || 0) * 100,
    aggregatedApy: (d.aggregatedApy || 0) * 100,
    feeRate: (d.feeRate || 0) * 100,
    // Yield range
    yieldMin: d.yieldRange ? (d.yieldRange.min || 0) * 100 : null,
    yieldMax: d.yieldRange ? (d.yieldRange.max || 0) * 100 : null,
    // TVL & volume
    tvlUsd: d.totalTvl || d.liquidity || 0,
    tradingVolume: d.tradingVolume || 0,
    // Token supplies
    totalPt: d.totalPt || 0,
    totalSy: d.totalSy || 0,
    totalSupply: d.totalSupply || 0,
    totalActiveSupply: d.totalActiveSupply || 0,
    // ROI
    ptRoi: d.ptRoi || 0,
    ytRoi: d.ytRoi || 0,
    // Status
    isExpired,
    isNew: m.isNew || false,
    isPrime: m.isPrime || false,
    categories: m.categoryIds || [],
    // Points programs
    points: (m.points || []).map((p) => ({
      key: p.key,
      type: p.type,
      value: p.value,
    })),
    // APY breakdowns
    lpApyBreakdown: m.lpApyBreakdown?.categories || [],
    ytApyBreakdown: m.ytApyBreakdown?.categories || [],
    createdAt: m.timestamp || null,
  };
}

function parseSPendle(data) {
  // totalPendleStaked is a raw BigInt string (18 decimals)
  const staked = data.totalPendleStaked
    ? Number(BigInt(data.totalPendleStaked) / BigInt(10 ** 18))
    : 0;

  // Historical data is parallel arrays, not array of objects
  const h = data.sPendleHistoricalData || {};
  const timestamps = h.timestamps || [];
  const aprs = h.aprs || [];
  const revenues = h.revenues || [];
  const fees = h.fees || [];

  const historicalData = timestamps.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    apr: (aprs[i] || 0) * 100,
    revenue: revenues[i] || 0,
    fees: fees[i] || 0,
  }));

  // Also include vePENDLE historical if sPENDLE APRs are empty
  const vh = data.vependleHistoricalData || {};
  const vTimestamps = vh.timestamps || [];
  const vAprs = vh.aprs || [];
  const vRevenues = vh.revenues || [];

  let vependleHistory = [];
  if (vTimestamps.length > 0) {
    vependleHistory = vTimestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      apr: (vAprs[i] || 0) * 100,
      revenue: vRevenues[i] || 0,
    }));
  }

  // Approximate APR for sPENDLE epochs from revenue
  // Anchor to last vePENDLE epoch which has a known APR-to-revenue relationship
  const sortedSpendle = [...historicalData].sort((a, b) => a.date.localeCompare(b.date));
  const sortedVe = [...vependleHistory].sort((a, b) => a.date.localeCompare(b.date));
  const lastVe = sortedVe.length > 0 ? sortedVe[sortedVe.length - 1] : null;

  if (sortedSpendle.length > 0 && lastVe && lastVe.revenue > 0 && lastVe.apr > 0) {
    // From last vePENDLE epoch: APR / (revenue / epochDays) = constant factor
    // This factor captures (365 / stakedUSD), assuming staked value is roughly stable
    const veEpochDays = sortedVe.length > 1
      ? (new Date(sortedVe[sortedVe.length - 1].date) - new Date(sortedVe[sortedVe.length - 2].date)) / 86400000
      : 30;
    const factor = lastVe.apr / (lastVe.revenue / veEpochDays);

    const sortedTs = [...timestamps].sort((a, b) => a - b);
    for (let i = 0; i < sortedSpendle.length; i++) {
      const epochDays = i > 0
        ? (sortedTs[i] - sortedTs[i - 1]) / 86400
        : 14;
      // APR = factor * (revenue / epochDays)
      sortedSpendle[i].apr = factor * (sortedSpendle[i].revenue / epochDays);
    }
  }

  // Merge vePENDLE + sPENDLE history for a complete timeline
  const merged = [...vependleHistory, ...sortedSpendle]
    .sort((a, b) => a.date.localeCompare(b.date));

  // Deduplicate by date (prefer later entry)
  const byDate = {};
  merged.forEach((d) => { byDate[d.date] = d; });
  const combined = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

  // Use computed APR for latest sPENDLE epoch if available
  const latestComputedApr = sortedSpendle.length > 0 && sortedSpendle[sortedSpendle.length - 1].apr > 0
    ? sortedSpendle[sortedSpendle.length - 1].apr
    : (data.lastEpochApr || 0) * 100;

  // Transition date: first sPENDLE epoch date
  const transitionDate = sortedSpendle.length > 0 ? sortedSpendle[0].date : null;

  return {
    totalPendleStaked: staked,
    lastEpochApr: latestComputedApr,
    historicalData: combined,
    transitionDate,
  };
}

async function fetchTvlHistory() {
  const resp = await fetch("https://api.llama.fi/protocol/pendle");
  if (!resp.ok) throw new Error(`DeFiLlama API ${resp.status}`);
  const data = await resp.json();
  const tvl = data.tvl || [];
  // Return last 365 days
  return tvl.slice(-365).map((d) => ({
    date: d.date,
    tvl: d.totalLiquidityUSD || 0,
  }));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  try {
    const [rawMarkets, rawSPendle, tvlHistory] = await Promise.all([
      fetchAllMarkets(),
      fetchSPendleData(),
      fetchTvlHistory(),
    ]);

    const markets = rawMarkets
      .map(parseMarket)
      .filter((m) => m.tvlUsd > 0);

    const spendle = parseSPendle(rawSPendle);

    return res.status(200).json({ markets, spendle, tvlHistory });
  } catch (err) {
    console.error("Pendle API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

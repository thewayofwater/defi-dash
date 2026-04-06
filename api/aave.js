const AAVE_GQL = "https://api.aave.com/graphql";
const DEFILLAMA_POOLS = "https://yields.llama.fi/pools";
const DEFILLAMA_LEND_BORROW = "https://yields.llama.fi/lendBorrow";
const DEFILLAMA_PROTOCOL = "https://api.llama.fi/protocol/aave-v3";

const CHAIN_NAMES = {
  1: "Ethereum", 10: "Optimism", 56: "BNB Chain", 100: "Gnosis",
  137: "Polygon", 250: "Fantom", 324: "zkSync", 1088: "Metis",
  8453: "Base", 42161: "Arbitrum", 42170: "Arbitrum Nova",
  43114: "Avalanche", 59144: "Linea", 534352: "Scroll",
  34443: "Mode", 1135: "Lisk", 146: "Sonic",
};

function chainName(id) {
  return CHAIN_NAMES[id] || `Chain ${id}`;
}

async function fetchGql(query) {
  const resp = await fetch(AAVE_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Aave GQL ${resp.status}`);
  return resp.json();
}

// Aave v4 data from their official GraphQL API
async function fetchV4Data() {
  // Get hubs (markets)
  const hubsRes = await fetchGql(`{
    hubs(request: { query: { chainIds: [1] }, orderBy: { totalSupplied: DESC } }) {
      id name address
      chain { name chainId }
      summary {
        totalBorrowed { current { value symbol } change { value } }
        totalSupplied { current { value symbol } change { value } }
        totalBorrowCap { value symbol }
        totalSupplyCap { value symbol }
        utilizationRate { value }
      }
    }
  }`);

  const hubs = hubsRes.data?.hubs || [];

  // Get all reserves with spoke (market instance) info
  const reservesRes = await fetchGql(`{
    reserves(request: { query: { chainIds: [1] } }) {
      id
      chain { chainId }
      spoke { id name }
      asset { underlying { address info { symbol name } } }
      summary {
        supplied { exchange { value symbol } }
        borrowed { exchange { value symbol } }
        supplyApy { value }
        borrowApy { value }
      }
    }
  }`).catch(() => ({ data: { reserves: [] } }));

  // Build hub lookup by spoke ID (parallel)
  const spokeToHub = {};
  await Promise.all(hubs.map(async (hub) => {
    const spokesRes = await fetchGql(`{
      spokes(request: { query: { hubId: "${hub.id}" } }) { id name }
    }`).catch(() => ({ data: { spokes: [] } }));
    for (const spoke of (spokesRes.data?.spokes || [])) {
      spokeToHub[spoke.id] = { hubId: hub.id, hubName: hub.name };
    }
  }));

  // Get protocol history
  const historyRes = await fetchGql(`{
    protocolHistory(request: { currency: USD, window: LAST_MONTH }) {
      date
      deposits { value symbol }
      borrows { value symbol }
    }
  }`).catch(() => ({ data: { protocolHistory: [] } }));

  // Parse hubs
  const parsedHubs = hubs.map((h) => ({
    id: h.id,
    name: h.name,
    address: h.address,
    chain: h.chain?.name || "Ethereum",
    chainId: h.chain?.chainId || 1,
    totalSupplied: parseFloat(h.summary?.totalSupplied?.current?.value || 0),
    totalBorrowed: parseFloat(h.summary?.totalBorrowed?.current?.value || 0),
    suppliedChange: parseFloat(h.summary?.totalSupplied?.change?.value || 0),
    borrowedChange: parseFloat(h.summary?.totalBorrowed?.change?.value || 0),
    supplyCap: parseFloat(h.summary?.totalSupplyCap?.value || 0),
    borrowCap: parseFloat(h.summary?.totalBorrowCap?.value || 0),
    utilization: parseFloat(h.summary?.utilizationRate?.value || 0) * 100,
  }));

  // Parse reserves with spoke info
  const v4Reserves = (reservesRes.data?.reserves || []).map((r) => {
    const symbol = r.asset?.underlying?.info?.symbol || "???";
    const supplyUsd = parseFloat(r.summary?.supplied?.exchange?.value || 0);
    const borrowUsd = parseFloat(r.summary?.borrowed?.exchange?.value || 0);
    const spoke = r.spoke?.name || "Unknown";
    const hubInfo = spokeToHub[r.spoke?.id] || { hubId: null, hubName: "Unknown" };
    return {
      id: r.id,
      hub: hubInfo.hubName,
      hubId: hubInfo.hubId,
      spoke,
      symbol,
      name: r.asset?.underlying?.info?.name || symbol,
      address: r.asset?.underlying?.address,
      chain: "Ethereum",
      supplyApy: parseFloat(r.summary?.supplyApy?.value || 0) * 100,
      borrowApy: parseFloat(r.summary?.borrowApy?.value || 0) * 100,
      supplyUsd,
      borrowUsd,
      utilization: supplyUsd > 0 ? (borrowUsd / supplyUsd) * 100 : 0,
    };
  });

  // Parse history
  const v4History = (historyRes.data?.protocolHistory || []).map((h) => ({
    date: h.date,
    deposits: parseFloat(h.deposits?.value || 0),
    borrows: parseFloat(h.borrows?.value || 0),
  }));

  return { hubs: parsedHubs, reserves: v4Reserves, history: v4History };
}

// Aave v3 data from DeFiLlama
async function fetchV3Data() {
  const [poolsResp, lendBorrowResp, protocolResp] = await Promise.all([
    fetch(DEFILLAMA_POOLS),
    fetch(DEFILLAMA_LEND_BORROW).catch(() => null),
    fetch(DEFILLAMA_PROTOCOL),
  ]);

  if (!poolsResp.ok) throw new Error(`DeFiLlama pools ${poolsResp.status}`);
  const poolsData = await poolsResp.json();
  const allPools = poolsData.data || [];

  // Build lookup from lendBorrow endpoint (has supply/borrow/utilization data)
  const lbMap = {};
  if (lendBorrowResp?.ok) {
    const lbData = await lendBorrowResp.json();
    for (const lb of lbData) {
      lbMap[lb.pool] = lb;
    }
  }

  // Filter to Aave v3 pools with meaningful TVL
  const v3Pools = allPools
    .filter((p) => p.project === "aave-v3" && p.tvlUsd >= 100000 && p.apy != null)
    .map((p) => {
      const lb = lbMap[p.pool] || {};
      const totalSupply = lb.totalSupplyUsd || 0;
      const totalBorrow = lb.totalBorrowUsd || 0;
      return {
        id: p.pool,
        symbol: p.symbol,
        chain: p.chain === "Hyperliquid L1" ? "HyperEVM" : p.chain,
        market: p.poolMeta ? p.poolMeta.replace("-market", "") : "core",
        supplyApy: p.apy || 0,
        apyBase: p.apyBase || 0,
        apyReward: p.apyReward || 0,
        tvlUsd: p.tvlUsd || 0,
        totalSupplyUsd: totalSupply,
        totalBorrowUsd: totalBorrow,
        utilization: totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : 0,
        borrowApy: (lb.apyBaseBorrow || 0) + (lb.apyRewardBorrow || 0),
        apyBaseBorrow: lb.apyBaseBorrow || 0,
        ltv: lb.ltv ? lb.ltv * 100 : null,
        apyPct1D: p.apyPct1D || 0,
        apyPct7D: p.apyPct7D || 0,
        apyPct30D: p.apyPct30D || 0,
        apyMean30d: p.apyMean30d || 0,
        stablecoin: p.stablecoin || false,
        exposure: p.exposure || "single",
        prediction: p.predictions?.predictedClass || null,
      };
    });

  // TVL + supply/borrow history from DeFiLlama protocol endpoint
  let tvlHistory = [];
  if (protocolResp.ok) {
    const protocolData = await protocolResp.json();
    const chainTvls = protocolData.chainTvls || {};

    // Aggregate supply (TVL) across all chains
    const supplyByDate = {};
    const borrowByDate = {};

    for (const [key, chainData] of Object.entries(chainTvls)) {
      if (key === "borrowed") {
        // Top-level "borrowed" key has aggregate borrow history
        for (const point of (chainData.tvl || [])) {
          const d = point.date;
          borrowByDate[d] = (borrowByDate[d] || 0) + (point.totalLiquidityUSD || 0);
        }
      } else if (key.endsWith("-borrowed")) {
        // Skip per-chain borrow keys — we use the aggregate "borrowed" key
        continue;
      } else {
        // Supply/TVL per chain
        for (const point of (chainData.tvl || [])) {
          const d = point.date;
          supplyByDate[d] = (supplyByDate[d] || 0) + (point.totalLiquidityUSD || 0);
        }
      }
    }

    // Merge into a single timeline
    const allDates = [...new Set([...Object.keys(supplyByDate), ...Object.keys(borrowByDate)])].sort((a, b) => a - b);
    tvlHistory = allDates.slice(-365).map((d) => ({
      date: Number(d),
      tvl: supplyByDate[d] || 0,
      supply: supplyByDate[d] || 0,
      borrow: borrowByDate[d] || 0,
    }));
  }

  return { pools: v3Pools, tvlHistory };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  try {
    const [v4, v3] = await Promise.all([
      fetchV4Data().catch((err) => {
        console.error("Aave v4 fetch error:", err);
        return { hubs: [], reserves: [], history: [] };
      }),
      fetchV3Data().catch((err) => {
        console.error("Aave v3 fetch error:", err);
        return { pools: [], tvlHistory: [] };
      }),
    ]);

    return res.status(200).json({
      v4: {
        hubs: v4.hubs,
        reserves: v4.reserves,
        history: v4.history,
      },
      v3: {
        pools: v3.pools,
        tvlHistory: v3.tvlHistory,
      },
    });
  } catch (err) {
    console.error("Aave API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

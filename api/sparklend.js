const DEFILLAMA_POOLS = "https://yields.llama.fi/pools";
const DEFILLAMA_LEND_BORROW = "https://yields.llama.fi/lendBorrow";
const DEFILLAMA_PROTOCOL = "https://api.llama.fi/protocol/spark";

async function fetchSparklendData() {
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

  // Filter to SparkLend pools with meaningful TVL
  const pools = allPools
    .filter((p) => p.project === "sparklend" && p.tvlUsd >= 100000 && p.apy != null)
    .map((p) => {
      const lb = lbMap[p.pool] || {};
      const totalSupply = lb.totalSupplyUsd || 0;
      const totalBorrow = lb.totalBorrowUsd || 0;
      return {
        id: p.pool,
        symbol: p.symbol,
        chain: p.chain,
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

    const supplyByDate = {};
    const borrowByDate = {};

    for (const [key, chainData] of Object.entries(chainTvls)) {
      if (key === "borrowed") {
        for (const point of (chainData.tvl || [])) {
          const d = point.date;
          borrowByDate[d] = (borrowByDate[d] || 0) + (point.totalLiquidityUSD || 0);
        }
      } else if (key.endsWith("-borrowed")) {
        continue;
      } else {
        for (const point of (chainData.tvl || [])) {
          const d = point.date;
          supplyByDate[d] = (supplyByDate[d] || 0) + (point.totalLiquidityUSD || 0);
        }
      }
    }

    const allDates = [...new Set([...Object.keys(supplyByDate), ...Object.keys(borrowByDate)])].sort((a, b) => a - b);
    tvlHistory = allDates.slice(-365).map((d) => ({
      date: Number(d),
      tvl: supplyByDate[d] || 0,
      supply: supplyByDate[d] || 0,
      borrow: borrowByDate[d] || 0,
    }));
  }

  return { pools, tvlHistory };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  try {
    const { pools, tvlHistory } = await fetchSparklendData();
    return res.status(200).json({ pools, tvlHistory });
  } catch (err) {
    console.error("Sparklend API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

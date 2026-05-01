const DEFILLAMA_POOLS = "https://yields.llama.fi/pools";
const DEFILLAMA_CHART = "https://yields.llama.fi/chart";
const DEFILLAMA_PROTOCOLS = "https://api.llama.fi/protocols";
const MORPHO_GRAPHQL = "https://api.morpho.org/graphql";

// Chain id → display name (matches DeFiLlama's chain naming so Morpho markets
// merge cleanly with the rest of the pool universe in the portfolio builder).
const MORPHO_CHAIN_NAMES = {
  1: "Ethereum",
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
  137: "Polygon",
  130: "Unichain",
  999: "HyperEVM",
  143: "Monad",
  988: "Plasma",
  747474: "Katana",
};

// Pull listed Morpho Blue markets (loan/collateral pairs) and shape them into
// the same pool schema the portfolio builder expects from DeFiLlama. Markets
// are NOT on DeFiLlama (only the curated vault aggregators are), so we go
// direct to Morpho's GraphQL. projectSlug stays "morpho-blue" so they group
// with the vault aggregators in protocol-exposure breakdowns.
// Per-market historical APY (and TVL) for the portfolio's weighted yield chart.
// Morpho's `marketByUniqueKey` exposes daily-resolution series via historicalState.
// supplyApy is fractional (0.04 = 4%); we convert to percent here so the shape
// matches DeFiLlama's chart payload exactly.
async function fetchMorphoMarketHistory(marketId, chainId) {
  const query = `query MarketHistory($id: String!, $chainId: Int!) {
    marketByUniqueKey(uniqueKey: $id, chainId: $chainId) {
      historicalState {
        supplyApy(options: { interval: DAY }) { x y }
        supplyAssetsUsd(options: { interval: DAY }) { x y }
      }
    }
  }`;
  const resp = await fetch(MORPHO_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id: marketId, chainId } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Morpho history HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.errors) throw new Error(`Morpho history GraphQL: ${json.errors[0].message}`);
  const hist = json.data?.marketByUniqueKey?.historicalState;
  if (!hist) return [];
  const apySeries = hist.supplyApy || [];
  const tvlSeries = hist.supplyAssetsUsd || [];
  // Index TVL by timestamp so we can join. Series are typically ordered
  // newest-first; we re-sort ascending and slice to last 365 days at the end.
  const tvlByTs = new Map();
  for (const p of tvlSeries) tvlByTs.set(p.x, p.y);
  const points = apySeries
    .map((p) => ({
      date: new Date(p.x * 1000).toISOString().slice(0, 10),
      apy: (Number(p.y) || 0) * 100, // fractional → percent
      tvl: tvlByTs.get(p.x) || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-365);
  return points;
}

async function fetchMorphoMarkets() {
  const query = `{
    markets(
      first: 500
      orderBy: SupplyAssetsUsd
      orderDirection: Desc
      where: { supplyAssetsUsd_gte: 1000000, listed: true }
    ) {
      items {
        marketId
        chain { id }
        loanAsset { symbol }
        collateralAsset { symbol }
        lltv
        state {
          supplyApy
          netSupplyApy
          supplyAssetsUsd
          rewards {
            asset { symbol }
            supplyApr
          }
        }
      }
    }
  }`;
  try {
    const resp = await fetch(MORPHO_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    if (json.errors) {
      console.error("Morpho markets query errors:", json.errors);
      return [];
    }
    const items = json.data?.markets?.items || [];
    return items
      .filter((m) => m.collateralAsset && m.loanAsset && m.state)
      .map((m) => {
        const chainId = m.chain?.id;
        const chainName = MORPHO_CHAIN_NAMES[chainId] || `chain ${chainId}`;
        const loan = m.loanAsset.symbol;
        const collateral = m.collateralAsset.symbol;
        // LLTV is fixed-point with 18 decimals
        const lltvPct = m.lltv ? (Number(m.lltv) / 1e18) * 100 : null;
        const supplyApyBase = (m.state.supplyApy || 0) * 100;
        const supplyApyNet = (m.state.netSupplyApy || 0) * 100;
        // Aggregate any reward APRs (incentives layered on top of base lending APY)
        const rewardApr = (m.state.rewards || []).reduce(
          (s, r) => s + (Number(r.supplyApr) || 0) * 100,
          0
        );
        const baseAsset = normalizeSymbol(loan, false, "single");
        const stablecoin = baseAsset === "USD";
        return {
          id: m.marketId, // hash, used as the unique pool key
          symbol: `${loan}/${collateral}`,
          baseAsset,
          project: "Morpho Blue",
          projectSlug: "morpho-blue",
          category: "Lending",
          chain: chainName,
          chainId, // needed for the per-market historical query (Phase B)
          apy: supplyApyNet, // post-fee net rate to suppliers
          apyBase: supplyApyBase,
          apyReward: rewardApr,
          tvlUsd: m.state.supplyAssetsUsd || 0,
          apyPct1D: 0,
          apyPct7D: 0,
          apyPct30D: 0,
          apyMean30d: 0,
          stablecoin,
          ilRisk: "no",
          exposure: "single",
          poolMeta: lltvPct != null ? `${collateral} @ ${lltvPct.toFixed(0)}% LLTV` : collateral,
          prediction: null,
        };
      })
      .filter((p) => p.baseAsset && p.apy > 0.01 && p.apy < 100);
  } catch (err) {
    console.error("Morpho markets fetch error:", err.message);
    return [];
  }
}

// Protocols we compare across
const TARGET_PROJECTS = [
  // Core lending
  "morpho-v1", "aave-v3", "aave-v4", "compound-v3",
  "sparklend", "fluid-lending", "euler-v2",
  "maple", "venus-core-pool",
  // Yield / stablecoins
  "pendle", "yearn-finance", "convex-finance", "curve-dex",
  "ethena-usde", "sky-lending", "spark-savings",
  "ether.fi-liquid", "lido",
  // Solana
  "jito-liquid-staking", "marinade-liquid-staking", "jupiter-lend",
  "kamino-lend", "drift-staked-sol",
  // HyperEVM
  "hyperlend-pooled",
];

// Per-token matchers — checks if a single token belongs to an asset class
const TOKEN_MATCHERS = {
  ETH: (tok) => /ETH/.test(tok),
  BTC: (tok) => /BTC/.test(tok),
  USD: (tok) => /USD|DAI|GHO|FRAX|LUSD|PYUSD|DOLA|AUSD/.test(tok),
  SOL: (tok) => /SOL/.test(tok),
  HYPE: (tok) => /HYPE/.test(tok) && !/HYPER/.test(tok),
  EUR: (tok) => /EUR/.test(tok),
};

// Check if a multi-token symbol (e.g. "WSTETH-ETH") has all tokens in the same asset class
function isSameAssetPair(symbol, assetKey) {
  const tokenTest = TOKEN_MATCHERS[assetKey];
  if (!tokenTest) return false;
  const tokens = symbol.toUpperCase().split("-");
  return tokens.length > 1 && tokens.every((tok) => tokenTest(tok));
}

// Normalize a pool's symbol to a base asset class
function normalizeSymbol(sym, stablecoin, exposure) {
  if (!sym) return null;
  const s = sym.toUpperCase();

  // For multi-exposure pools, check if all tokens match the same asset class
  if (exposure === "multi") {
    for (const asset of ["USD", "ETH", "BTC", "SOL", "HYPE", "EUR"]) {
      if (isSameAssetPair(s, asset)) return asset;
    }
    return null; // mixed asset pair — exclude
  }

  // Single-exposure: exact matches first
  if (/^(W?ETH|STETH|WSTETH|CBETH|RETH|WEETH|EZETH|METH|SWETH|OETH|ANKRETH|SFRXETH)$/.test(s)) return "ETH";
  if (/^(W?BTC|CBBTC|TBTC|LBTC|SOLVBTC|PUMPBTC|EBTC|FBTC|UNBTC)$/.test(s)) return "BTC";
  if (/^(USDC|USDT|DAI|SDAI|SUSDE|USDE|FRAX|LUSD|TUSD|GHO|PYUSD|CUSD|CRVUSD|DOLA|RUSD|USDM|USDA)$/.test(s)) return "USD";
  if (/^(EURC|EURS|EURE|AGEUR|EUROC)$/.test(s)) return "EUR";
  if (/^(W?SOL|MSOL|JITOSOL|BSOL|VSOL|HSOL)$/.test(s)) return "SOL";
  if (/^(S?HYPE)$/.test(s)) return "HYPE";

  // Substring matching for composite names (e.g. Morpho vault symbols like STEAKETH, BBQUSDC)
  // Check EUR before USD to avoid EUR stablecoins being caught by the stablecoin flag
  if (/EUR/.test(s)) return "EUR";
  if (stablecoin || /USD|DAI|GHO|FRAX|LUSD|PYUSD|DOLA|AUSD/.test(s)) return "USD";
  if (/ETH|STETH|RETH|WEETH|EZETH/.test(s)) return "ETH";
  if (/BTC|LBTC|SOLVBTC/.test(s)) return "BTC";
  if (/SOL|JITOSOL/.test(s)) return "SOL";
  if (/HYPE/.test(s) && !/HYPER/.test(s)) return "HYPE";

  return null;
}

function projectLabel(project) {
  const labels = {
    "morpho-v1": "Morpho",
    "aave-v3": "Aave V3",
    "aave-v4": "Aave V4",
    "compound-v3": "Compound",
    "sparklend": "Spark",
    "fluid-lending": "Fluid",
    "euler-v2": "Euler",
    "maple": "Maple",
    "venus-core-pool": "Venus",
    "pendle": "Pendle",
    "yearn-finance": "Yearn",
    "convex-finance": "Convex",
    "curve-dex": "Curve",
    "ethena-usde": "Ethena",
    "sky-lending": "Sky",
    "spark-savings": "Spark Savings",
    "ether.fi-liquid": "Ether.fi",
    "lido": "Lido",
    "jito-liquid-staking": "Jito",
    "marinade-liquid-staking": "Marinade",
    "jupiter-lend": "Jupiter",
    "kamino-lend": "Kamino",
    "drift-staked-sol": "Drift",
    "hyperlend-pooled": "HyperLend",
  };
  if (labels[project]) return labels[project];
  // Auto-format unknown project slugs: "some-protocol-v2" → "Some Protocol V2"
  return project.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Map DeFiLlama protocol categories to dashboard categories (matches overview page)
const CATEGORY_MAP = {
  Dexs: "DEX LP",
  Lending: "Lending",
  "NFT Lending": "Lending",
  "Uncollateralized Lending": "Lending",
  "Liquid Staking": "LST",
  "Liquid Restaking": "LST",
  Restaking: "LST",
  "Staking Pool": "LST",
  "Restaked BTC": "LST",
  CDP: "Stablecoin",
  "Stablecoin Issuer": "Stablecoin",
  "Algo-Stables": "Stablecoin",
  "Dual-Token Stablecoin": "Stablecoin",
  "Partially Algorithmic Stablecoin": "Stablecoin",
  Yield: "Yield",
  "Yield Aggregator": "Yield",
  Farm: "Yield",
  "Leveraged Farming": "Yield",
  "Yield Lottery": "Yield",
  "Liquidity Manager": "Yield",
  "Liquidity Automation": "Yield",
  "Onchain Capital Allocator": "Yield",
  "Risk Curators": "Yield",
  Indexes: "Yield",
  "Options Vault": "Yield",
  RWA: "RWA",
  "RWA Lending": "RWA",
  Derivatives: "Derivatives",
  Options: "Derivatives",
  "Basis Trading": "Stablecoin",
  Synthetics: "Derivatives",
  "Prediction Market": "Derivatives",
  Bridge: "Bridge",
  "Cross Chain Bridge": "Bridge",
  "Canonical Bridge": "Bridge",
  "Bridge Aggregator": "Bridge",
  "Bridge Aggregators": "Bridge",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  const url = new URL(req.url, "http://localhost");
  const chartPool = url.searchParams.get("chart");
  const mode = url.searchParams.get("mode"); // "all" = full universe for portfolio builder

  // If ?chart=<poolId>, return historical data for that pool
  if (chartPool) {
    // Morpho market IDs are 0x-prefixed 64-char hex hashes (vs DeFiLlama's UUIDs).
    // Route to Morpho's GraphQL historicalState. chainId required to disambiguate
    // since the same uniqueKey can theoretically exist on multiple chains.
    if (/^0x[0-9a-f]{64}$/i.test(chartPool)) {
      const chainId = parseInt(url.searchParams.get("chainId") || "1", 10);
      try {
        const points = await fetchMorphoMarketHistory(chartPool, chainId);
        return res.status(200).json({ points, source: "morpho-market" });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
    try {
      const resp = await fetch(`${DEFILLAMA_CHART}/${chartPool}`, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error(`DeFiLlama chart API ${resp.status}`);
      const data = await resp.json();
      const points = (data.data || []).slice(-365).map((d) => ({
        date: d.timestamp.slice(0, 10),
        apy: d.apy || 0,
        tvl: d.tvlUsd || 0,
      }));
      return res.status(200).json({ points });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Otherwise return all pools for comparison
  try {
    // Markets are only fetched for the portfolio-builder universe (mode=all);
    // the Compare page restricts to TARGET_PROJECTS so doesn't need them.
    const [poolsResp, protocolsResp, morphoMarkets] = await Promise.all([
      fetch(DEFILLAMA_POOLS, { signal: AbortSignal.timeout(10000) }),
      fetch(DEFILLAMA_PROTOCOLS, { signal: AbortSignal.timeout(10000) }),
      mode === "all" ? fetchMorphoMarkets() : Promise.resolve([]),
    ]);
    if (!poolsResp.ok) throw new Error(`DeFiLlama pools API ${poolsResp.status}`);
    const data = await poolsResp.json();
    const allPools = data.data || [];

    // Build project → category map from protocols API
    const projectCategoryMap = {};
    if (protocolsResp.ok) {
      const protocols = await protocolsResp.json();
      protocols.forEach((p) => {
        const cat = CATEGORY_MAP[p.category];
        if (cat) projectCategoryMap[p.slug] = cat;
      });
    }

    // Filter pools based on mode
    const EXCLUDED_PROJECTS = ["merkl"];
    const pools = allPools
      .filter((p) => mode === "all"
        ? !EXCLUDED_PROJECTS.includes(p.project)
        : TARGET_PROJECTS.includes(p.project))
      .filter((p) => (p.tvlUsd || 0) >= 1000000) // min $1M TVL
      .filter((p) => p.apy != null && p.apy > 0.01 && p.apy < 100)
      .map((p) => {
        const baseAsset = normalizeSymbol(p.symbol, p.stablecoin, p.exposure);
        // Normalize chain names to match other pages
        const chain = p.chain === "Hyperliquid L1" ? "HyperEVM" : p.chain;
        return {
          id: p.pool,
          symbol: p.symbol,
          baseAsset,
          project: projectLabel(p.project),
          projectSlug: p.project,
          category: projectCategoryMap[p.project] || null,
          chain,
          apy: p.apy || 0,
          apyBase: p.apyBase || 0,
          apyReward: p.apyReward || 0,
          tvlUsd: p.tvlUsd || 0,
          apyPct1D: p.apyPct1D || 0,
          apyPct7D: p.apyPct7D || 0,
          apyPct30D: p.apyPct30D || 0,
          apyMean30d: p.apyMean30d || 0,
          stablecoin: p.stablecoin || false,
          ilRisk: p.ilRisk || "no",
          exposure: p.exposure || "single",
          poolMeta: p.poolMeta || null,
          prediction: p.predictions?.predictedClass || null,
        };
      })
      .filter((p) => p.baseAsset); // exclude pools that don't map to any asset class

    // Merge Morpho Blue markets (they're shaped to the same schema and already
    // filtered for TVL/APY thresholds inside fetchMorphoMarkets).
    const allPoolsMerged = [...pools, ...morphoMarkets];

    // Available base assets
    const assets = [...new Set(allPoolsMerged.map((p) => p.baseAsset))].sort();

    return res.status(200).json({ pools: allPoolsMerged, assets });
  } catch (err) {
    console.error("Yields API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

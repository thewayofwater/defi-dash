const DEFILLAMA_POOLS = "https://yields.llama.fi/pools";
const DEFILLAMA_CHART = "https://yields.llama.fi/chart";
const DEFILLAMA_PROTOCOLS = "https://api.llama.fi/protocols";

// Protocols we compare across
const TARGET_PROJECTS = [
  "morpho-v1", "pendle", "aave-v3", "aave-v2",
  "compound-v3", "lido", "spark", "ethena",
  "maker", "sky", "fluid", "euler",
  "yearn-finance", "convex-finance", "curve-dex",
  // Solana protocols
  "jito-liquid-staking", "marinade-liquid-staking", "jupiter-lend",
  "kamino-lend", "drift-staked-sol",
  // HyperEVM
  "hyperlend",
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
    "pendle": "Pendle",
    "aave-v3": "Aave v3",
    "aave-v2": "Aave v2",
    "compound-v3": "Compound",
    "lido": "Lido",
    "spark": "Spark",
    "ethena": "Ethena",
    "maker": "Maker",
    "sky": "Sky",
    "fluid": "Fluid",
    "euler": "Euler",
    "yearn-finance": "Yearn",
    "convex-finance": "Convex",
    "curve-dex": "Curve",
    "jito-liquid-staking": "Jito",
    "marinade-liquid-staking": "Marinade",
    "jupiter-lend": "Jupiter",
    "kamino-lend": "Kamino",
    "drift-staked-sol": "Drift",
    "hyperlend": "HyperLend",
  };
  return labels[project] || project;
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

  // If ?chart=<poolId>, return historical data for that pool
  if (chartPool) {
    try {
      const resp = await fetch(`${DEFILLAMA_CHART}/${chartPool}`);
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
    const [poolsResp, protocolsResp] = await Promise.all([
      fetch(DEFILLAMA_POOLS),
      fetch(DEFILLAMA_PROTOCOLS),
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

    // Filter to target protocols with meaningful TVL
    const pools = allPools
      .filter((p) => TARGET_PROJECTS.includes(p.project))
      .filter((p) => (p.tvlUsd || 0) >= 1000000) // min $1M TVL
      .filter((p) => p.apy != null && p.apy > 0.01)
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
          prediction: p.predictions?.predictedClass || null,
        };
      })
      .filter((p) => p.baseAsset); // exclude pools that don't map to any asset class

    // Available base assets
    const assets = [...new Set(pools.map((p) => p.baseAsset))].sort();

    return res.status(200).json({ pools, assets });
  } catch (err) {
    console.error("Yields API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

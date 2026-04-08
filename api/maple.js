const GQL_URL = "https://api.maple.finance/v2/graphql";
const ETH_RPC = "https://ethereum-rpc.publicnode.com";

const POOLS = {
  usdc: { name: "Syrup USDC", id: "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b" },
  usdt: { name: "Syrup USDT", id: "0x356b8d89c1e1239cbbb9de4815c39a1474d5ba7d" },
};

const TOKEN_DECIMALS = {
  BTC: 8, LBTC: 8, XRP: 6, USTB: 6, jitoSOL: 9,
  HYPE: 18, ETH: 18, weETH: 18, SOL: 9, tETH: 18,
  USDC: 6, USDT: 6, PYUSD: 6, sUSDS: 18,
  PT_sUSDE: 18, PT_USDE: 18, LP_USR: 18, USR: 18,
};

// CoinGecko ID mapping for collateral price lookups (via DeFiLlama coins API)
const COINGECKO_IDS = {
  BTC: "bitcoin", LBTC: "lombard-staked-btc", XRP: "ripple",
  HYPE: "hyperliquid", ETH: "ethereum", weETH: "wrapped-eeth",
  SOL: "solana", jitoSOL: "jito-staked-sol", tETH: "threshold-ethereum",
  USDC: "usd-coin", USDT: "tether", PYUSD: "paypal-usd",
  sUSDS: "sdai", USTB: "superstate-short-duration-us-government-securities-fund-ustb",
};

async function fetchCollateralPrices() {
  const coins = [...new Set(Object.values(COINGECKO_IDS))]
    .map((id) => `coingecko:${id}`)
    .join(",");
  try {
    const resp = await fetch(
      `https://coins.llama.fi/prices/current/${coins}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) return {};
    const data = await resp.json();
    // Map symbol → USD price
    const prices = {};
    for (const [sym, geckoId] of Object.entries(COINGECKO_IDS)) {
      const entry = data.coins?.[`coingecko:${geckoId}`];
      if (entry?.price) prices[sym] = entry.price;
    }
    return prices;
  } catch {
    return {};
  }
}

// Maple APY values have 28 implied decimals (ray format)
function parseRayToPercent(rawStr) {
  if (!rawStr || rawStr === "0") return 0;
  let s = rawStr.toString();
  while (s.length < 29) s = "0" + s;
  const intPart = s.slice(0, s.length - 28);
  const fracPart = s.slice(s.length - 28, s.length - 26);
  return parseFloat(intPart + "." + fracPart);
}

function parseCollateralAmount(rawAmount, assetSymbol) {
  if (!rawAmount) return 0;
  const sym = assetSymbol?.replace(/[\s-]/g, "") || "";
  const decimals = TOKEN_DECIMALS[sym] ?? 18;
  return Number(rawAmount) / 10 ** decimals;
}

async function fetchAssetVolatility() {
  // Only fetch volatility for collateral assets (not stablecoins)
  const VOL_ASSETS = { BTC: "bitcoin", LBTC: "lombard-staked-btc", XRP: "ripple", HYPE: "hyperliquid" };
  const coins = Object.values(VOL_ASSETS).map((id) => `coingecko:${id}`).join(",");
  const now = Math.floor(Date.now() / 1000);
  const start = now - 90 * 86400; // 90 days
  try {
    const resp = await fetch(
      `https://coins.llama.fi/chart/${coins}?start=${start}&span=90&period=1d`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) return {};
    const data = await resp.json();
    const volatility = {};
    for (const [sym, geckoId] of Object.entries(VOL_ASSETS)) {
      const series = data.coins?.[`coingecko:${geckoId}`]?.prices;
      if (!series || series.length < 10) continue;
      const prices = series.map((p) => p.price);
      const returns = [];
      for (let i = 1; i < prices.length; i++) {
        if (prices[i] > 0 && prices[i - 1] > 0) {
          returns.push(Math.log(prices[i] / prices[i - 1]));
        }
      }
      if (returns.length < 5) continue;
      const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
      const dailyVol = Math.sqrt(variance);
      volatility[sym] = +(dailyVol * Math.sqrt(365)).toFixed(4); // annualized
    }
    return volatility;
  } catch {
    return {};
  }
}

async function gqlQuery(query, variables = {}) {
  const resp = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Maple GQL ${resp.status}`);
  const json = await resp.json();
  if (json.errors?.length) {
    console.warn("Maple GQL partial error:", json.errors[0].message);
    // Return data if available (GraphQL can return partial results with errors)
    if (json.data) return json.data;
    throw new Error(json.errors[0].message);
  }
  return json.data;
}

async function ethCall(to, data) {
  const resp = await fetch(ETH_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`RPC ${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function getOnChainAUM(address) {
  const hex = await ethCall(address, "0xf6de0bd2");
  return Number(BigInt(hex)) / 1e6;
}

// Fetch AUM for multiple addresses in small parallel batches to avoid rate limits
async function batchGetOnChainAUM(addresses) {
  if (!addresses.length) return {};
  const map = {};
  const BATCH = 3; // 3 concurrent calls at a time
  for (let i = 0; i < addresses.length; i += BATCH) {
    const chunk = addresses.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map((addr) => getOnChainAUM(addr).catch(() => null))
    );
    chunk.forEach((addr, j) => {
      if (results[j] != null) map[addr.toLowerCase()] = results[j];
    });
  }
  return map;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  try {
    // Fire all requests in parallel
    // Phase 1: Fire all GQL + price requests in parallel
    const [
      syrupData,
      usdcPoolData,
      usdtPoolData,
      strategiesData,
      collateralPrices,
      assetVolatility,
    ] = await Promise.all([
      // Combined syrupGlobals query (was 3 separate calls)
      gqlQuery(`{ syrupGlobals {
        collateralRatio collateralValue loansValue
        apyTimeSeries(range: YEAR) { timestamp apy boostApy coreApy usdBenchmarkApy }
        aumTimeSeries(range: YEAR) { timestamp assetsUsd assetsInStrategiesUsd loansUsd collateralUsd }
      } }`),
      gqlQuery(`{
        poolV2(id: "${POOLS.usdc.id}") {
          name totalAssets shares
          openTermLoans(first: 500) {
            id principalOwed interestRate paymentIntervalDays
            collateral { asset assetAmount assetValueUsd custodian }
            loanMeta { type }
            borrower { id }
          }
        }
      }`),
      gqlQuery(`{
        poolV2(id: "${POOLS.usdt.id}") {
          name totalAssets shares
          openTermLoans(first: 500) {
            id principalOwed interestRate paymentIntervalDays
            collateral { asset assetAmount assetValueUsd custodian }
            loanMeta { type }
            borrower { id }
          }
        }
      }`),
      gqlQuery(`{
        skyStrategies(first: 20) {
          id state depositedAssets withdrawnAssets
          pool { id name }
        }
        aavestrategies(first: 20) {
          id state depositedAssets withdrawnAssets
          aaveToken { symbol }
          pool { id name }
        }
      }`),
      fetchCollateralPrices(),
      fetchAssetVolatility(),
    ]);

    // Phase 2: Batch fetch on-chain AUM for all strategy contracts in one RPC call
    const allStrategyIds = [
      ...(strategiesData.skyStrategies || []).map((s) => s.id),
      ...(strategiesData.aavestrategies || []).map((s) => s.id),
    ].filter(Boolean);

    const onChainAUMMap = await batchGetOnChainAUM(allStrategyIds);

    // --- Globals ---
    const sg = syrupData.syrupGlobals;
    const globals = {
      collateralRatio: Number(sg.collateralRatio) / 1e6,
      collateralValue: Number(sg.collateralValue) / 1e6,
      loansValue: Number(sg.loansValue) / 1e6,
    };

    // --- APY History ---
    const apyHistory = (sg.apyTimeSeries || []).map((pt) => ({
      date: pt.timestamp,
      apy: parseRayToPercent(pt.apy),
      coreApy: parseRayToPercent(pt.coreApy),
      boostApy: parseRayToPercent(pt.boostApy),
      benchmarkApy: parseRayToPercent(pt.usdBenchmarkApy),
    }));

    // --- Collateral History (8 decimals per Maple docs) ---
    const aumHistory = (sg.aumTimeSeries || []).map((pt) => {
      const idle = Number(pt.assetsUsd) / 1e8;
      const strategies = Number(pt.assetsInStrategiesUsd) / 1e8;
      const loans = Number(pt.loansUsd) / 1e8;
      const collateral = Number(pt.collateralUsd) / 1e8;
      return {
        date: pt.timestamp,
        aum: collateral + loans + idle + strategies,
        collateral,
      };
    });

    // --- Pools & Loans ---
    function parsePool(poolData, poolId) {
      const p = poolData.poolV2;
      const totalAssets = Number(p.totalAssets) / 1e6;
      const shares = Number(p.shares) / 1e6;
      const nav = shares > 0 ? totalAssets / shares : 1;

      const loans = (p.openTermLoans || []).map((l) => {
        const collateral = Array.isArray(l.collateral) ? (l.collateral[0] || {}) : (l.collateral || {});
        const asset = collateral.asset || null;
        const amount = parseCollateralAmount(collateral.assetAmount, asset);
        const price = asset ? (collateralPrices[asset] ?? null) : null;
        const valueUsd = (amount > 0 && price != null) ? amount * price : null;
        return {
          id: l.id,
          pool: poolId,
          metaType: l.loanMeta?.type || null,
          principal: Number(l.principalOwed) / 1e6,
          interestRate: Number(l.interestRate) / 10000,
          paymentInterval: l.paymentIntervalDays,
          collateralAsset: asset,
          collateralAmount: amount,
          collateralValueUsd: valueUsd,
          custodian: collateral.custodian || null,
          borrower: l.borrower?.id || null,
        };
      }).filter((l) => l.principal > 0);

      return {
        pool: { name: p.name, id: poolId, totalAssets, shares, nav },
        loans,
      };
    }

    const usdc = parsePool(usdcPoolData, POOLS.usdc.id);
    const usdt = parsePool(usdtPoolData, POOLS.usdt.id);

    const pools = [usdc.pool, usdt.pool];

    // --- Strategies ---
    function parseStrategy(s, type) {
      const deposited = Number(s.depositedAssets) / 1e6;
      const withdrawn = Number(s.withdrawnAssets) / 1e6;
      const contractAddr = s.id?.toLowerCase();
      return {
        id: s.id,
        type,
        pool: s.pool?.name || (s.aaveToken?.symbol || null),
        poolId: s.pool?.id || null,
        state: s.state,
        deposited,
        withdrawn,
        net: deposited - withdrawn,
        onChainAUM: onChainAUMMap[contractAddr] ?? null,
      };
    }

    const skyStrategies = (strategiesData.skyStrategies || []).map((s) => parseStrategy(s, "sky"));
    const aaveStrategies = (strategiesData.aavestrategies || []).map((s) => parseStrategy(s, "aave"));
    const strategies = [...skyStrategies, ...aaveStrategies];

    // Merge Syrup USDC/USDT strategies into loans as backing entries
    const syrupStrategyLoans = strategies
      .filter((s) => {
        const pid = s.poolId?.toLowerCase();
        return (pid === POOLS.usdc.id || pid === POOLS.usdt.id) && (s.onChainAUM > 0 || s.net > 0);
      })
      .map((s) => ({
        id: s.id,
        pool: s.poolId,
        metaType: s.type, // "sky" or "aave"
        principal: null,
        interestRate: null,
        paymentInterval: null,
        collateralAsset: null,
        collateralAmount: 0,
        collateralValueUsd: s.onChainAUM ?? s.net,
        custodian: null,
        borrower: s.id,
        strategyState: s.state,
        deposited: s.deposited,
        withdrawn: s.withdrawn,
        onChainAUM: s.onChainAUM,
      }));

    const loans = [...usdc.loans, ...usdt.loans, ...syrupStrategyLoans];

    // --- Reconciliation ---
    function reconcile(pool, poolLoans, poolStrategies) {
      const otlTotal = poolLoans.reduce((sum, l) => sum + l.principal, 0);
      const otlRealLoans = poolLoans
        .filter((l) => l.metaType !== "strategy")
        .reduce((sum, l) => sum + l.principal, 0);
      const strategyAUM = poolStrategies.reduce((sum, s) => sum + (s.onChainAUM ?? s.net), 0);
      const idle = pool.totalAssets - otlTotal - strategyAUM;
      return { otlTotal, otlRealLoans, strategyAUM, idle };
    }

    const usdcStrategies = strategies.filter(
      (s) => s.poolId?.toLowerCase() === POOLS.usdc.id
    );
    const usdtStrategies = strategies.filter(
      (s) => s.poolId?.toLowerCase() === POOLS.usdt.id
    );

    const reconciliation = {
      usdc: reconcile(usdc.pool, usdc.loans, usdcStrategies),
      usdt: reconcile(usdt.pool, usdt.loans, usdtStrategies),
    };

    return res.status(200).json({
      globals,
      pools,
      loans,
      strategies,
      apyHistory,
      aumHistory,
      reconciliation,
      assetVolatility,
    });
  } catch (err) {
    console.error("Maple API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

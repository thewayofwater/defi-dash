const GQL_URL = "https://api.maple.finance/v2/graphql";
const ETH_RPC = "https://eth.llamarpc.com";

const POOLS = {
  usdc: { name: "Syrup USDC", id: "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b" },
  usdt: { name: "Syrup USDT", id: "0x356b8d89c1e1239cbbb9de4815c39a1474d5ba7d" },
};

const STRATEGY_CONTRACTS = {
  "sky-usdc":  "0x859c9980931fa0a63765fd8ef2e29918af5b038c",
  "aave-usdt": "0x2b817b822b0ddd4597a92dbed1bd0a6796ca37e0",
  "sky-hy":    "0xe3ee1b26af5396cec45c8c3b4c4fd5136a2455cc",
};

const TOKEN_DECIMALS = {
  BTC: 8, LBTC: 8, XRP: 6, USTB: 6, jitoSOL: 9,
  HYPE: 18, ETH: 18, weETH: 18, SOL: 9, tETH: 18,
  USDC: 6, USDT: 6, PYUSD: 6, sUSDS: 18,
  PT_sUSDE: 18, PT_USDE: 18, LP_USR: 18, USR: 18,
};

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

async function gqlQuery(query, variables = {}) {
  const resp = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Maple GQL ${resp.status}`);
  const json = await resp.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  try {
    // Fire all requests in parallel
    const [
      globalsData,
      apyData,
      usdcPoolData,
      usdtPoolData,
      strategiesData,
      aumSkyUsdc,
      aumAaveUsdt,
      aumSkyHy,
    ] = await Promise.all([
      // 1. Syrup globals
      gqlQuery(`{ syrupGlobals { collateralRatio collateralValue loansValue } }`),

      // 2. APY history
      gqlQuery(`{ syrupGlobals { apyTimeSeries(range: YEAR) { timestamp apy boostApy coreApy usdBenchmarkApy } } }`),

      // 3. USDC pool
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

      // 4. USDT pool
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

      // 5. Strategies (sky + aave)
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

      // 6-8. On-chain AUM for each strategy contract
      getOnChainAUM(STRATEGY_CONTRACTS["sky-usdc"]).catch(() => null),
      getOnChainAUM(STRATEGY_CONTRACTS["aave-usdt"]).catch(() => null),
      getOnChainAUM(STRATEGY_CONTRACTS["sky-hy"]).catch(() => null),
    ]);

    // --- Globals ---
    const sg = globalsData.syrupGlobals;
    const globals = {
      collateralRatio: Number(sg.collateralRatio) / 1e6,
      collateralValue: Number(sg.collateralValue) / 1e6,
      loansValue: Number(sg.loansValue) / 1e6,
    };

    // --- APY History ---
    const apyHistory = (apyData.syrupGlobals.apyTimeSeries || []).map((pt) => ({
      date: pt.timestamp,
      apy: parseRayToPercent(pt.apy),
      coreApy: parseRayToPercent(pt.coreApy),
      boostApy: parseRayToPercent(pt.boostApy),
      benchmarkApy: parseRayToPercent(pt.usdBenchmarkApy),
    }));

    // --- Pools & Loans ---
    function parsePool(poolData, poolId) {
      const p = poolData.poolV2;
      const totalAssets = Number(p.totalAssets) / 1e6;
      const shares = Number(p.shares) / 1e6;
      const nav = shares > 0 ? totalAssets / shares : 1;

      const loans = (p.openTermLoans || []).map((l) => {
        const collateral = l.collateral?.[0] || {};
        return {
          id: l.id,
          pool: poolId,
          metaType: l.loanMeta?.type || null,
          principal: Number(l.principalOwed) / 1e6,
          interestRate: Number(l.interestRate) / 10000,
          paymentInterval: l.paymentIntervalDays,
          collateralAsset: collateral.asset || null,
          collateralAmount: parseCollateralAmount(collateral.assetAmount, collateral.asset),
          collateralValueUsd: Number(collateral.assetValueUsd || 0),
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
    const loans = [...usdc.loans, ...usdt.loans];

    // --- Strategies ---
    const onChainAUMMap = {
      [STRATEGY_CONTRACTS["sky-usdc"]]: aumSkyUsdc,
      [STRATEGY_CONTRACTS["aave-usdt"]]: aumAaveUsdt,
      [STRATEGY_CONTRACTS["sky-hy"]]: aumSkyHy,
    };

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
      reconciliation,
    });
  } catch (err) {
    console.error("Maple API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

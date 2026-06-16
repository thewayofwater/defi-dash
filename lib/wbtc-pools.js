// WBTC × BTC-derivative pool health
// Tracks pools where WBTC is paired with another BTC derivative across Curve and Uniswap V3.
// Imbalance toward WBTC = market voting WBTC is the riskier asset.

// ─── Pool registry ───

const curveUrl = (addr) => `https://www.curve.finance/dex/ethereum/pools/${addr}/deposit`;
const uniV3Url = (addr) => `https://app.uniswap.org/explore/pools/ethereum/${addr}`;

const CURVE_POOLS = [
  { address: "0xb7ecb2aa52aa64a717180e030241bc75cd946726", label: "tBTC / WBTC", venue: "Curve", url: curveUrl("0xb7ecb2aa52aa64a717180e030241bc75cd946726") },
  { address: "0x404fdada7fc68b5b633d184067c9643732f8a045", label: "uniBTC / WBTC", venue: "Curve", url: curveUrl("0x404fdada7fc68b5b633d184067c9643732f8a045") },
  { address: "0x66039342c66760874047c36943b1e2d8300363bb", label: "hemiBTC / cbBTC / WBTC", venue: "Curve", url: curveUrl("0x66039342c66760874047c36943b1e2d8300363bb") },
  { address: "0x839d6bdedff886404a6d7a788ef241e4e28f4802", label: "cbBTC / WBTC", venue: "Curve", url: curveUrl("0x839d6bdedff886404a6d7a788ef241e4e28f4802") },
  { address: "0x2f3bc4c27a4437aeca13de0e37cdf1028f3706f0", label: "LBTC / WBTC", venue: "Curve", url: curveUrl("0x2f3bc4c27a4437aeca13de0e37cdf1028f3706f0") },
];

const UNISWAP_V3_POOLS = [
  { address: "0xe8f7c89C5eFa061e340f2d2F206EC78FD8f7e124", label: "WBTC / cbBTC (0.01%)", venue: "Uniswap V3", url: uniV3Url("0xe8f7c89C5eFa061e340f2d2F206EC78FD8f7e124") },
  { address: "0x73A38006d23517a1d383C88929B2014F8835B38B", label: "tBTC / WBTC (0.01%)", venue: "Uniswap V3", url: uniV3Url("0x73A38006d23517a1d383C88929B2014F8835B38B") },
  { address: "0x9dbe5dFfAEB4Ac2e0ac14F8B4e08b3bc55De5232", label: "WBTC / FBTC (0.3%)", venue: "Uniswap V3", url: uniV3Url("0x9dbe5dFfAEB4Ac2e0ac14F8B4e08b3bc55De5232") },
  { address: "0x87428a53e14d24Ab19c6Ca4939B4df93B8996cA9", label: "WBTC / LBTC (0.05%)", venue: "Uniswap V3", url: uniV3Url("0x87428a53e14d24Ab19c6Ca4939B4df93B8996cA9") },
  { address: "0x5738df8073Ad05d0c0fCF60e358033268eBF16cC", label: "WBTC / solvBTC (0.05%)", venue: "Uniswap V3", url: uniV3Url("0x5738df8073Ad05d0c0fCF60e358033268eBF16cC") },
];

// ─── Token registry (for Uniswap pools — avoids extra decimals()/symbol() calls) ───

const KNOWN_TOKENS = {
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { symbol: "WBTC", decimals: 8 },
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": { symbol: "cbBTC", decimals: 8 },
  "0x18084fba666a33d37592fa2633fd49a74dd93a88": { symbol: "tBTC", decimals: 18 },
  "0xc96de26018a54d51c097160568752c4e3bd6c364": { symbol: "FBTC", decimals: 8 },
  "0x8236a87084f8b84306f72007f36f2618a5634494": { symbol: "LBTC", decimals: 8 },
  "0x7a56e1c57c7475ccf742a1832b028f0456652f97": { symbol: "solvBTC", decimals: 18 },
  "0x004e9c3ef86bc1ca1f0bb5c7662861ee93350568": { symbol: "uniBTC", decimals: 8 },
};

// ─── Curve pool fetcher ───

const UA = { "User-Agent": "Mozilla/5.0 (compatible; DeFiDash/1.0)" };

// ─── Curve on-chain fallback ───
// Used when prices.curve.finance is down or degraded. Reads pool composition
// directly from chain: coins(i) to discover token addresses, balanceOf(pool)
// for reserves, price_oracle() / price_oracle(uint256) for implied ratio.

const CURVE_SEL = {
  coins_i: "0xc6610657",             // coins(uint256)
  price_oracle_0: "0x86fc88d3",      // price_oracle() — 2-asset stableswap-ng
  price_oracle_i: "0xe2e7d264",      // price_oracle(uint256) — multi-asset stableswap-ng
};

async function discoverCurveCoins(poolAddr) {
  const coins = [];
  for (let i = 0; i < 4; i++) {
    const idxHex = i.toString(16).padStart(64, "0");
    try {
      const raw = await ethCall(poolAddr, CURVE_SEL.coins_i + idxHex);
      if (!raw || raw === "0x" || BigInt(raw) === 0n) break;
      coins.push("0x" + raw.slice(-40).toLowerCase());
    } catch {
      break;
    }
  }
  return coins;
}

async function fetchCurvePoolOnChain(poolAddr) {
  const coinAddrs = await discoverCurveCoins(poolAddr);
  if (coinAddrs.length < 2) throw new Error("onchain: could not discover coins");
  const pad = poolAddr.slice(2).toLowerCase().padStart(64, "0");
  // Read balanceOf(pool) for each coin, plus try both price_oracle signatures in parallel.
  const balancePromises = coinAddrs.map((a) => ethCall(a, SEL.balanceOf + pad));
  const po2Promise = ethCall(poolAddr, CURVE_SEL.price_oracle_0).catch(() => null);
  const poNPromises = coinAddrs.slice(1).map((_, i) =>
    ethCall(poolAddr, CURVE_SEL.price_oracle_i + i.toString(16).padStart(64, "0")).catch(() => null)
  );
  const [balancesRaw, po2, ...poNs] = await Promise.all([
    Promise.all(balancePromises),
    po2Promise,
    ...poNPromises,
  ]);

  // Resolve price_oracle into an array matching priceInCoin0[] convention:
  // [1, <price of coin1 in coin0>, <price of coin2 in coin0>, ...]
  // Sanity check: for BTC-derivative pools, each ratio should be near 1.0.
  // Some pool variants return garbage (e.g. 854 wei or 0) from price_oracle(i);
  // treat anything outside [0.5, 2.0] as invalid and drop the whole array so
  // the UI shows no implied ratio rather than a bogus one.
  const parsePo = (raw) => {
    if (!raw || raw === "0x") return null;
    const v = Number(BigInt(raw)) / 1e18;
    return v >= 0.5 && v <= 2.0 ? v : null;
  };
  let priceInCoin0 = null;
  if (coinAddrs.length === 2) {
    const v = parsePo(po2);
    if (v != null) priceInCoin0 = [1, v];
  } else {
    const vals = poNs.map(parsePo);
    if (vals.every((v) => v != null)) priceInCoin0 = [1, ...vals];
  }

  return { coinAddrs, balancesRaw, priceInCoin0 };
}

async function resolveTokenMeta(addr) {
  const lower = addr.toLowerCase();
  if (KNOWN_TOKENS[lower]) return { address: addr, ...KNOWN_TOKENS[lower] };
  const [symRaw, decRaw] = await Promise.all([
    ethCall(addr, "0x95d89b41").catch(() => null),
    ethCall(addr, "0x313ce567").catch(() => null),
  ]);
  const decimals = decRaw ? parseInt(decRaw, 16) : 18;
  let symbol = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  if (symRaw && symRaw.length > 130) {
    try {
      const len = parseInt(symRaw.slice(66, 130), 16);
      const dataHex = symRaw.slice(130, 130 + len * 2);
      symbol = Buffer.from(dataHex, "hex").toString("utf8").replace(/\0/g, "");
    } catch {}
  }
  return { address: addr, symbol, decimals };
}

function computeCurveMetricsFromOnChain(raw, meta, tokenMetas, prices) {
  const { coinAddrs, balancesRaw, priceInCoin0 } = raw;
  const composition = coinAddrs.map((addr, i) => {
    const tm = tokenMetas[i];
    const bal = Number(BigInt(balancesRaw[i])) / 10 ** tm.decimals;
    const px = prices[addr.toLowerCase()] || 0;
    return {
      symbol: tm.symbol,
      address: addr,
      balance: bal,
      balanceUsd: bal * px,
      share: 0, // fill below
    };
  });
  const totalUsd = composition.reduce((s, c) => s + c.balanceUsd, 0);
  if (totalUsd <= 0) return null;
  composition.forEach((c) => { c.share = (c.balanceUsd / totalUsd) * 100; });

  const wbtcIdx = composition.findIndex((c) => c.symbol.toUpperCase() === "WBTC");
  if (wbtcIdx === -1) return null;

  // Implied ratios: "1 WBTC = X coin_i". Same formula as the API path uses.
  let impliedRatios = [];
  if (priceInCoin0) {
    const wbtcPriceInCoin0 = priceInCoin0[wbtcIdx] || 1;
    impliedRatios = composition.map((c, i) => {
      if (i === wbtcIdx) return null;
      const cp = priceInCoin0[i];
      if (!cp || cp <= 0) return null;
      return { symbol: c.symbol, ratio: wbtcPriceInCoin0 / cp };
    }).filter(Boolean);
  }

  return {
    address: meta.address,
    label: meta.label,
    venue: meta.venue,
    url: meta.url,
    tvlUsd: totalUsd,
    nCoins: composition.length,
    composition,
    wbtcShare: composition[wbtcIdx].share,
    impliedRatios,
    name: meta.label,
  };
}

async function fetchCurvePool(address) {
  // Curve migrated their price API from prices.curve.fi → prices.curve.finance.
  // New host is intermittently slow (seen 37s response) and 502s under parallel
  // load — retry once on failure with a small backoff to survive transient issues.
  const url = `https://prices.curve.finance/v1/pools/ethereum/${address}`;
  const attempt = async () => {
    const resp = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
    if (!resp.ok) throw new Error(`Curve ${resp.status}`);
    return resp.json();
  };
  try {
    return await attempt();
  } catch (err) {
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
    return attempt();
  }
}

function computeCurveMetrics(raw, meta) {
  const coins = raw.coins || [];
  const balances = raw.balances || [];
  const balancesUsd = raw.balances_usd || [];
  const tvl = raw.tvl_usd || 0;

  const wbtcIdx = coins.findIndex((c) => (c.symbol || "").toUpperCase() === "WBTC");
  if (wbtcIdx === -1 || tvl <= 0) return null;

  const totalUsd = balancesUsd.reduce((s, x) => s + (x || 0), 0) || tvl;
  const composition = coins.map((c, i) => ({
    symbol: c.symbol,
    address: c.address,
    balance: balances[i] || 0,
    balanceUsd: balancesUsd[i] || 0,
    share: ((balancesUsd[i] || 0) / totalUsd) * 100,
  }));

  const wbtc = composition[wbtcIdx];

  // Curve price_oracle: array of length N-1, prices of coins[1..N-1] in coins[0] (18-decimal fixed point)
  const poRaw = raw.price_oracle;
  const poArr = poRaw == null ? [] : (Array.isArray(poRaw) ? poRaw : [poRaw]);
  const priceInCoin0 = [1, ...poArr.map((p) => Number(p) / 1e18)];
  const wbtcPriceInCoin0 = priceInCoin0[wbtcIdx] || 1;

  const impliedRatios = coins.map((c, i) => {
    if (i === wbtcIdx) return null;
    const cp = priceInCoin0[i];
    if (!cp || cp <= 0) return null;
    return { symbol: c.symbol, ratio: wbtcPriceInCoin0 / cp };
  }).filter(Boolean);

  return {
    address: meta.address,
    label: meta.label,
    venue: meta.venue,
    url: meta.url,
    tvlUsd: totalUsd,
    nCoins: coins.length,
    composition,
    wbtcShare: wbtc.share,
    impliedRatios,
    name: raw.name,
  };
}

// ─── Uniswap V3 pool fetcher (via eth_call) ───

const RPC = "https://ethereum-rpc.publicnode.com";

// Function selectors
const SEL = {
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  slot0: "0x3850c7bd",
  fee: "0xddca3f43",
  balanceOf: "0x70a08231",
};

async function ethCall(to, data) {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_call", params: [{ to, data }, "latest"], id: 1 }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`RPC ${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message || "RPC error");
  return json.result;
}

function decodeAddress(hex) {
  return "0x" + (hex || "").slice(-40).toLowerCase();
}

async function fetchUniV3Pool(meta) {
  // 1) Get token0 and token1 addresses
  const [t0Raw, t1Raw] = await Promise.all([
    ethCall(meta.address, SEL.token0),
    ethCall(meta.address, SEL.token1),
  ]);
  const token0 = decodeAddress(t0Raw);
  const token1 = decodeAddress(t1Raw);

  // 2) Lookup token metadata (or call on-chain if unknown)
  async function getTokenMeta(addr) {
    const lower = addr.toLowerCase();
    if (KNOWN_TOKENS[lower]) return { address: addr, ...KNOWN_TOKENS[lower] };
    // Fallback: call symbol() and decimals() on-chain
    const [symRaw, decRaw] = await Promise.all([
      ethCall(addr, "0x95d89b41").catch(() => null),
      ethCall(addr, "0x313ce567").catch(() => null),
    ]);
    const decimals = decRaw ? parseInt(decRaw, 16) : 18;
    // Decode string symbol (dynamic): skip for brevity, fall back to short addr
    let symbol = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    if (symRaw && symRaw.length > 130) {
      try {
        const lenHex = symRaw.slice(66, 130);
        const len = parseInt(lenHex, 16);
        const dataHex = symRaw.slice(130, 130 + len * 2);
        symbol = Buffer.from(dataHex, "hex").toString("utf8").replace(/\0/g, "");
      } catch {}
    }
    return { address: addr, symbol, decimals };
  }

  const [meta0, meta1] = await Promise.all([getTokenMeta(token0), getTokenMeta(token1)]);

  // 3) Get balances + slot0 in parallel
  const padAddr = (a) => a.slice(2).padStart(64, "0");
  const [bal0Raw, bal1Raw, slot0Raw] = await Promise.all([
    ethCall(token0, SEL.balanceOf + padAddr(meta.address)),
    ethCall(token1, SEL.balanceOf + padAddr(meta.address)),
    ethCall(meta.address, SEL.slot0),
  ]);

  const bal0 = Number(BigInt(bal0Raw)) / 10 ** meta0.decimals;
  const bal1 = Number(BigInt(bal1Raw)) / 10 ** meta1.decimals;
  // slot0 layout: sqrtPriceX96 (160) | tick (24) | observationIndex | observationCardinality | observationCardinalityNext | feeProtocol | unlocked — but on struct boundaries
  // Safe: take first 32 bytes as sqrtPriceX96 (though field is uint160, high bits are 0)
  const sqrtPriceX96 = BigInt("0x" + slot0Raw.slice(2, 66));

  return { meta0, meta1, bal0, bal1, sqrtPriceX96 };
}

function computeUniV3Metrics(raw, meta, prices) {
  const { meta0, meta1, bal0, bal1, sqrtPriceX96 } = raw;

  const wbtcIdx = [meta0, meta1].findIndex((m) => m.symbol.toUpperCase() === "WBTC");
  if (wbtcIdx === -1) return null;

  const p0 = prices[meta0.address.toLowerCase()] || 0;
  const p1 = prices[meta1.address.toLowerCase()] || 0;
  const usd0 = bal0 * p0;
  const usd1 = bal1 * p1;
  const totalUsd = usd0 + usd1;
  if (totalUsd <= 0) return null;

  const composition = [
    { symbol: meta0.symbol, address: meta0.address, balance: bal0, balanceUsd: usd0, share: (usd0 / totalUsd) * 100 },
    { symbol: meta1.symbol, address: meta1.address, balance: bal1, balanceUsd: usd1, share: (usd1 / totalUsd) * 100 },
  ];

  // Implied price from sqrtPriceX96: price_of_token0_in_token1 = (sqrtPriceX96 / 2^96)^2
  // Adjust for decimals: price = (sqrtPriceX96 / 2^96)^2 * 10^(dec0 - dec1)
  // Result units: token1 per token0
  let token1PerToken0 = null;
  try {
    const Q96 = 2n ** 96n;
    const sqrt = Number(sqrtPriceX96) / Number(Q96);
    const rawRatio = sqrt * sqrt;
    const decAdj = 10 ** (meta0.decimals - meta1.decimals);
    token1PerToken0 = rawRatio * decAdj;
  } catch {}

  // We want: 1 WBTC = X paired
  let impliedRatio = null;
  const pairedMeta = wbtcIdx === 0 ? meta1 : meta0;
  if (token1PerToken0 != null && token1PerToken0 > 0) {
    impliedRatio = wbtcIdx === 0 ? token1PerToken0 : 1 / token1PerToken0;
  }

  return {
    address: meta.address,
    label: meta.label,
    venue: meta.venue,
    url: meta.url,
    tvlUsd: totalUsd,
    nCoins: 2,
    composition,
    wbtcShare: composition[wbtcIdx].share,
    impliedRatios: impliedRatio != null ? [{ symbol: pairedMeta.symbol, ratio: impliedRatio }] : [],
  };
}

// ─── Price source: DeFiLlama coins API ───

async function fetchUsdPrices(addresses) {
  if (!addresses.length) return {};
  const tokens = addresses.map((a) => `ethereum:${a}`).join(",");
  const url = `https://coins.llama.fi/prices/current/${tokens}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return {};
    const json = await resp.json();
    const out = {};
    for (const [key, val] of Object.entries(json.coins || {})) {
      const addr = key.split(":")[1]?.toLowerCase();
      if (addr && val?.price != null) out[addr] = val.price;
    }
    return out;
  } catch {
    return {};
  }
}

// ─── Risk classification (venue-specific) ───
// Curve: uniform AMM, reserves = trading direction. WBTC overweight = flight from WBTC.
// Uniswap V3: concentrated liquidity, reserves can be skewed by out-of-range LP positions.
//             Real signal is price deviation from fair value (1.0 for 1:1 pegged tokens).

function classifyCurveRisk(wbtcShare, nCoins) {
  const balanced = 100 / nCoins;
  const overweight = wbtcShare - balanced;
  if (overweight >= 30) return "red";
  if (overweight >= 15) return "yellow";
  return "green";
}

function classifyV3Risk(impliedRatio) {
  if (impliedRatio == null) return "green";
  const depegBp = Math.abs(impliedRatio - 1) * 10000;
  if (depegBp >= 100) return "red";    // ≥100 bp = ≥1% depeg
  if (depegBp >= 25) return "yellow";  // ≥25 bp = ≥0.25% depeg
  return "green";
}

function classifyRisk(pool) {
  if (pool.venue === "Uniswap V3") {
    const ratio = pool.impliedRatios?.[0]?.ratio;
    return classifyV3Risk(ratio);
  }
  return classifyCurveRisk(pool.wbtcShare, pool.nCoins);
}

// ─── Handler ───

export async function poolsHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");

  try {
    // Fetch Curve pools in parallel. For each, attempt the Curve API first;
    // on failure, fall back to on-chain reads (composition + price_oracle).
    // The on-chain branch has no USD prices yet — those come from DeFiLlama
    // in the shared batch below, so we collect the raw results and compute
    // metrics after prices arrive.
    const curveRaw = await Promise.all(
      CURVE_POOLS.map(async (meta) => {
        try {
          const raw = await fetchCurvePool(meta.address);
          return { meta, mode: "api", raw };
        } catch (apiErr) {
          try {
            const raw = await fetchCurvePoolOnChain(meta.address);
            const tokenMetas = await Promise.all(raw.coinAddrs.map(resolveTokenMeta));
            return { meta, mode: "onchain", raw, tokenMetas };
          } catch (chainErr) {
            console.error(`Curve ${meta.label}: api=${apiErr.message} onchain=${chainErr.message}`);
            return { meta, mode: "error", error: `${apiErr.message} / ${chainErr.message}` };
          }
        }
      })
    );

    // Fetch Uniswap V3 pool state in parallel
    const v3Raw = await Promise.all(
      UNISWAP_V3_POOLS.map(async (meta) => {
        try {
          const raw = await fetchUniV3Pool(meta);
          return { meta, raw };
        } catch (err) {
          console.error(`UniV3 ${meta.label}:`, err.message);
          return { meta, error: err.message };
        }
      })
    );

    // Collect all token addresses needing USD prices: V3 pool tokens + any
    // Curve fallback pool tokens (API-mode Curve pools already have USD values).
    const tokenAddrs = new Set();
    for (const { raw } of v3Raw) {
      if (raw) {
        tokenAddrs.add(raw.meta0.address.toLowerCase());
        tokenAddrs.add(raw.meta1.address.toLowerCase());
      }
    }
    for (const entry of curveRaw) {
      if (entry.mode === "onchain") {
        for (const a of entry.raw.coinAddrs) tokenAddrs.add(a.toLowerCase());
      }
    }
    const prices = await fetchUsdPrices([...tokenAddrs]);

    const v3Results = v3Raw.map(({ meta, raw, error }) => {
      if (error) return { ...meta, error };
      try {
        return computeUniV3Metrics(raw, meta, prices);
      } catch (err) {
        return { ...meta, error: err.message };
      }
    });

    const curveResults = curveRaw.map((entry) => {
      if (entry.mode === "error") return { ...entry.meta, error: entry.error };
      if (entry.mode === "api") {
        try { return computeCurveMetrics(entry.raw, entry.meta); }
        catch (err) { return { ...entry.meta, error: err.message }; }
      }
      // onchain
      try { return computeCurveMetricsFromOnChain(entry.raw, entry.meta, entry.tokenMetas, prices); }
      catch (err) { return { ...entry.meta, error: err.message }; }
    });

    // Combine and classify
    const all = [...curveResults, ...v3Results].filter(Boolean);
    const pools = all.filter((p) => !p.error).map((p) => ({ ...p, risk: classifyRisk(p) }));
    const errored = all.filter((p) => p.error);

    // Aggregate
    // "Avg WBTC share" is only meaningful across Curve pools (uniform AMM composition).
    // V3 reserves can be skewed by out-of-range LP positions, so including them would mislead.
    const totalTvl = pools.reduce((s, p) => s + p.tvlUsd, 0);
    const curvePools = pools.filter((p) => p.venue === "Curve");
    const curveTvl = curvePools.reduce((s, p) => s + p.tvlUsd, 0);
    const weightedWbtcShare = curveTvl > 0
      ? curvePools.reduce((s, p) => s + p.wbtcShare * p.tvlUsd, 0) / curveTvl
      : 0;

    // Most imbalanced: rank by risk severity (red > yellow > green), tiebreak by TVL.
    const riskOrder = { red: 2, yellow: 1, green: 0 };
    const mostImbalanced = [...pools]
      .sort((a, b) => (riskOrder[b.risk] - riskOrder[a.risk]) || (b.tvlUsd - a.tvlUsd))[0] || null;

    return res.status(200).json({
      pools,
      summary: {
        count: pools.length,
        totalTvl,
        weightedWbtcShare,          // Curve-only basket
        curveTvl,
        mostImbalanced: mostImbalanced ? {
          label: mostImbalanced.label,
          venue: mostImbalanced.venue,
          wbtcShare: mostImbalanced.wbtcShare,
          impliedRatio: mostImbalanced.impliedRatios?.[0]?.ratio ?? null,
          risk: mostImbalanced.risk,
        } : null,
        weightedRisk: classifyCurveRisk(weightedWbtcShare, 2),
      },
      errored: errored.map((e) => ({ label: e.label, venue: e.venue, error: e.error })),
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("WBTC pools API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

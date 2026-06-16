// WBTC / cbBTC historical peg tracking
// Fetches daily OHLCV from GeckoTerminal for the major direct WBTC↔cbBTC pools
// and produces a TVL-weighted blended rate series with intraday high/low bands.
//
// Output rate convention: "1 WBTC = X cbBTC"
//   - < 1.0 → WBTC trading at a discount to cbBTC
//   - > 1.0 → WBTC trading at a premium
//   - drift_bps = (rate - 1) * 10000

// ─── Pool registry ───

// For each pool we want "1 WBTC = X cbBTC" (i.e. < 1.0 = WBTC at discount).
// Empirical verification against on-chain sqrtPriceX96 on the Uni V3 pool and
// against the in-dashboard rate display shows that GeckoTerminal's
// `currency=token&token=quote` request returns the correct direction (~0.997)
// for BOTH pools in our scope, regardless of each pool's internal base/quote
// labeling. GT's base/quote assignment is not tied to on-chain token0/token1
// ordering, so we avoid guessing and use the empirically-verified parameter.

const POOLS = [
  {
    id: "uniV3_wbtc_cbbtc_001",
    label: "Uniswap V3 WBTC/cbBTC 0.01%",
    venue: "Uniswap V3",
    address: "0xe8f7c89C5eFa061e340f2d2F206EC78FD8f7e124",
    gtToken: "quote",
  },
  {
    id: "curve_cbbtc_wbtc",
    label: "Curve cbBTC/WBTC",
    venue: "Curve",
    address: "0x839d6bdedff886404a6d7a788ef241e4e28f4802",
    gtToken: "quote",
  },
  {
    // 3-asset pool: hemiBTC is included in the pool but not in our signal.
    // GT's OHLCV for this pool happens to track the cbBTC/WBTC pair directly
    // (hemiBTC ignored). For TVL weighting we intentionally only count the
    // WBTC + cbBTC portion of reserves (hemiBTC balances aren't read), so
    // this pool contributes weight proportional only to its WBTC/cbBTC depth.
    id: "curve_hemibtc_cbbtc_wbtc",
    label: "Curve hemiBTC/cbBTC/WBTC",
    venue: "Curve",
    address: "0x66039342c66760874047c36943b1e2d8300363bb",
    gtToken: "quote",
  },
];

const UA = { "User-Agent": "Mozilla/5.0 (compatible; DeFiDash/1.0)" };

// ─── GeckoTerminal OHLCV fetcher ───

async function fetchPoolOhlcv(pool, days) {
  // GT max limit is 1000; day aggregation so "limit" = days requested.
  const limit = Math.min(Math.max(days, 1), 1000);
  const url = `https://api.geckoterminal.com/api/v2/networks/eth/pools/${pool.address}/ohlcv/day`
    + `?aggregate=1&limit=${limit}&currency=token&token=${pool.gtToken}`;
  const resp = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`GT ${resp.status} for ${pool.id}`);
  const data = await resp.json();
  const list = data?.data?.attributes?.ohlcv_list || [];
  // Each candle: [timestamp, open, high, low, close, volume]
  // GT returns newest-first; normalize to oldest-first and shape it.
  // Note: with currency=token&token=quote, the volume field is denominated in
  // the BASE token (WBTC) — we convert to USD in the caller using a WBTC price.
  const candles = list
    .map((c) => ({
      date: c[0], // UTC seconds, already day-aligned
      open: +c[1],
      high: +c[2],
      low: +c[3],
      close: +c[4],
      volumeBase: +c[5],
    }))
    .filter((c) => c.close > 0 && Number.isFinite(c.close))
    .sort((a, b) => a.date - b.date);
  return candles;
}

// ─── Current TVL fetcher (for weighting) ───
// GeckoTerminal's reserve_in_usd is unreliable for Uniswap V3 pools — it sums
// virtual reserves across concentrated-liquidity tick ranges, which explodes
// for tight-range stable pools (we measured a 440x inflation for the WBTC/cbBTC
// V3 pool vs on-chain balances). So we read actual token balances from the pool
// contract and price them via DeFiLlama. Both peg pools are WBTC + cbBTC at 8
// decimals, so we can skip token discovery.

const WBTC_ADDR = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const CBBTC_ADDR = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const RPC = "https://ethereum-rpc.publicnode.com";

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

async function fetchUsdPrices() {
  const url = `https://coins.llama.fi/prices/current/ethereum:${WBTC_ADDR},ethereum:${CBBTC_ADDR}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) return { wbtc: 0, cbbtc: 0 };
  const json = await resp.json();
  return {
    wbtc: json?.coins?.[`ethereum:${WBTC_ADDR}`]?.price || 0,
    cbbtc: json?.coins?.[`ethereum:${CBBTC_ADDR}`]?.price || 0,
  };
}

// Historical daily WBTC prices — used to convert base-token volume to USD per day
// rather than using a single current price for all history.
// Returns: Map<UTC_day_start_seconds, priceUsd>
async function fetchWbtcPriceHistory(days) {
  const span = Math.min(Math.max(days, 1), 1000);
  const url = `https://coins.llama.fi/chart/ethereum:${WBTC_ADDR}?span=${span}&period=1d`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return new Map();
    const json = await resp.json();
    const prices = json?.coins?.[`ethereum:${WBTC_ADDR}`]?.prices || [];
    const DAY = 86400;
    const map = new Map();
    for (const { timestamp, price } of prices) {
      const day = Math.floor(timestamp / DAY) * DAY;
      // If multiple samples fall on the same UTC day (edge case), keep the last one.
      map.set(day, price);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchPoolTvl(pool, prices) {
  const pad = pool.address.slice(2).toLowerCase().padStart(64, "0");
  const [wRaw, cRaw] = await Promise.all([
    ethCall(WBTC_ADDR, "0x70a08231" + pad),
    ethCall(CBBTC_ADDR, "0x70a08231" + pad),
  ]);
  const wbtcBal = Number(BigInt(wRaw)) / 1e8;
  const cbbtcBal = Number(BigInt(cRaw)) / 1e8;
  return wbtcBal * prices.wbtc + cbbtcBal * prices.cbbtc;
}

// ─── TVL-weighted blend ───
// For each UTC day, compute the weighted average of close / high / low across
// pools that have a candle for that day. Weights are current TVL (static — an
// honest approximation; historical TVL would require per-day snapshots).

function blendSeries(poolCandles, weights, wbtcPriceHistory, wbtcPriceNow) {
  // poolCandles: Map<poolId, candles[]>
  // weights: Map<poolId, tvlUsd>
  const totalWeight = Array.from(weights.values()).reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return [];

  // Collect all unique dates
  const dateSet = new Set();
  poolCandles.forEach((candles) => candles.forEach((c) => dateSet.add(c.date)));
  const dates = Array.from(dateSet).sort((a, b) => a - b);

  // Pre-sort the price history keys so we can binary-search for nearest-available
  // day when a candle's exact day isn't in the price series.
  const sortedPriceDays = [...wbtcPriceHistory.keys()].sort((a, b) => a - b);
  const priceForDay = (day) => {
    const direct = wbtcPriceHistory.get(day);
    if (direct != null) return direct;
    if (sortedPriceDays.length === 0) return wbtcPriceNow || 0;
    // Binary search for the lowest index with sortedPriceDays[i] >= day
    let lo = 0, hi = sortedPriceDays.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedPriceDays[mid] < day) lo = mid + 1;
      else hi = mid;
    }
    // Candidates: sortedPriceDays[lo] (>= day) and sortedPriceDays[lo-1] (< day)
    const above = sortedPriceDays[lo];
    const below = lo > 0 ? sortedPriceDays[lo - 1] : null;
    const nearest = (below != null && Math.abs(below - day) < Math.abs(above - day))
      ? below
      : above;
    return wbtcPriceHistory.get(nearest) ?? wbtcPriceNow ?? 0;
  };

  // Index each pool's candles by date for fast lookup
  const indexed = new Map();
  poolCandles.forEach((candles, poolId) => {
    const m = new Map();
    candles.forEach((c) => m.set(c.date, c));
    indexed.set(poolId, m);
  });

  const totalPools = poolCandles.size;
  // Coverage threshold: report volume only when at least half the pools contribute on a day.
  // Days where only 1 of 3 pools have a candle usually reflect dust/test trades on older
  // pools rather than real market activity, and make volume numbers misleading when
  // sitting next to fully-covered days in the millions.
  const minContributorsForVolume = Math.ceil(totalPools / 2);

  return dates.map((date) => {
    let closeSum = 0, highSum = 0, lowSum = 0, volSum = 0, wSum = 0;
    const contributions = [];
    // Look up WBTC USD price for this UTC day; fall back to the nearest adjacent
    // day with a known price (rather than today's price) so volume conversions stay
    // accurate even when a day is absent from the history.
    const dayPrice = priceForDay(date);
    poolCandles.forEach((_, poolId) => {
      const c = indexed.get(poolId).get(date);
      if (!c) return;
      const w = weights.get(poolId) || 0;
      if (w <= 0) return;
      closeSum += c.close * w;
      highSum += c.high * w;
      lowSum += c.low * w;
      // volumeBase is in WBTC (base token); convert to USD using that day's WBTC price.
      volSum += (c.volumeBase || 0) * dayPrice;
      wSum += w;
      contributions.push({ poolId, weight: w, close: c.close });
    });
    if (wSum <= 0) return null;
    const close = closeSum / wSum;
    const high = highSum / wSum;
    const low = lowSum / wSum;
    // Report volume only when coverage is sufficient (see comment above).
    const volumeUsd = contributions.length >= minContributorsForVolume ? volSum : null;
    return {
      date,
      close,
      high,
      low,
      drift_bps: (close - 1) * 10000,
      worstIntraday_bps: (low - 1) * 10000,
      bestIntraday_bps: (high - 1) * 10000,
      volumeUsd,
      contributions, // per-pool close + weight for tooltip/debug
    };
  }).filter(Boolean);
}

// ─── Handler ───

export async function pegHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=60");

  try {
    const days = Math.min(Math.max(parseInt(req.query?.days || "365", 10), 1), 1000);

    // Fetch current prices (for TVL) and WBTC historical prices (for per-day volume USD) in parallel
    const [prices, wbtcHistoryMap] = await Promise.all([
      fetchUsdPrices().catch((err) => {
        console.error("price fetch error:", err.message);
        return { wbtc: 0, cbbtc: 0 };
      }),
      fetchWbtcPriceHistory(days).catch((err) => {
        console.error("price history error:", err.message);
        return new Map();
      }),
    ]);

    const results = await Promise.all(
      POOLS.map(async (p) => {
        const [candles, tvl] = await Promise.all([
          fetchPoolOhlcv(p, days).catch((err) => {
            console.error(`${p.id} ohlcv error:`, err.message);
            return [];
          }),
          fetchPoolTvl(p, prices).catch((err) => {
            console.error(`${p.id} tvl error:`, err.message);
            return 0;
          }),
        ]);
        return { pool: p, candles, tvl };
      })
    );

    const poolCandles = new Map();
    const weights = new Map();
    const poolsMeta = [];
    for (const { pool, candles, tvl } of results) {
      poolCandles.set(pool.id, candles);
      weights.set(pool.id, tvl);
      poolsMeta.push({
        id: pool.id,
        label: pool.label,
        venue: pool.venue,
        address: pool.address,
        tvl,
        candleCount: candles.length,
        latestClose: candles.length ? candles[candles.length - 1].close : null,
      });
    }

    const history = blendSeries(poolCandles, weights, wbtcHistoryMap, prices.wbtc);

    // Summary stats over the full returned window
    const latest = history[history.length - 1] || null;
    const driftValues = history.map((h) => h.drift_bps);
    const worstValues = history.map((h) => h.worstIntraday_bps);
    const summary = latest ? {
      latestRate: latest.close,
      latestDriftBps: latest.drift_bps,
      latestDate: latest.date,
      minDriftBps: Math.min(...driftValues),
      maxDriftBps: Math.max(...driftValues),
      minIntradayBps: Math.min(...worstValues),
      totalTvl: Array.from(weights.values()).reduce((s, v) => s + v, 0),
    } : null;

    return res.status(200).json({
      pools: poolsMeta,
      history,
      summary,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("WBTC peg API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// WBTC cross-chain transparency API
// Aggregates data from:
// - wbtc.network (BTC custodian reserves, Ethereum mint/burn txs, BitGo-attested data)
// - Per-chain RPCs (supply on each chain + mint/burn Transfer events where possible)

const WBTC_API = "https://wbtc.network/api/wbtc";

const CHAINS = [
  { id: "ethereum", name: "Ethereum", type: "evm", rpc: "https://ethereum-rpc.publicnode.com", contract: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  { id: "base", name: "Base", type: "evm", rpc: "https://base-rpc.publicnode.com", contract: "0x1ceA84203673764244E05693e42E6Ace62bE9BA5", decimals: 8 },
  { id: "kava", name: "Kava", type: "evm", rpc: "https://evm.kava-rpc.com", contract: "0xb5c4423a65B953905949548276654C96fcaE6992", decimals: 8 },
  { id: "solana", name: "Solana", type: "solana", rpc: "https://api.mainnet-beta.solana.com", mint: "5XZw2LKTyrfvfiskJ78AMpackRjPcyCif1WhUsPDuVqQ", decimals: 8 },
  { id: "tron", name: "TRON", type: "tron", rpc: "https://api.trongrid.io", contract: "TYhWwKpw43ENFWBTGpzLHn3882f2au7SMi", decimals: 8 },
  { id: "osmosis", name: "Osmosis", type: "cosmos", rpc: "https://lcd.osmosis.zone", denom: "factory/osmo1z0qrq605sjgcqpylfl4aa6s90x738j7m58wyatt0tdzflg2ha26q67k743/wbtc", decimals: 8 },
];

// ─── EVM: totalSupply via eth_call ───

const TOTAL_SUPPLY_SELECTOR = "0x18160ddd";

async function fetchEvmSupply(rpc, contract, decimals) {
  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_call", params: [{ to: contract, data: TOTAL_SUPPLY_SELECTOR }, "latest"], id: 1 }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`EVM RPC ${resp.status}`);
  const data = await resp.json();
  if (!data.result) throw new Error("No result from EVM RPC");
  return parseInt(data.result, 16) / 10 ** decimals;
}

// ─── EVM: recent Transfer events (mint = from=0x0, burn = to=0x0) ───

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000000";

async function fetchEvmMintBurnEvents(rpc, contract, decimals, chainName, lookbackBlocks = 49000) {
  // Get current block
  const blockResp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
    signal: AbortSignal.timeout(10000),
  });
  const blockData = await blockResp.json();
  const latest = parseInt(blockData.result, 16);
  const fromBlock = "0x" + (latest - lookbackBlocks).toString(16);
  const toBlock = "0x" + latest.toString(16);

  // Query mints (from=zero) and burns (to=zero) in parallel
  const [mintsResp, burnsResp] = await Promise.all([
    fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", method: "eth_getLogs", params: [{
          address: contract, fromBlock, toBlock,
          topics: [TRANSFER_TOPIC, ZERO_TOPIC],
        }], id: 1,
      }),
      signal: AbortSignal.timeout(15000),
    }),
    fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", method: "eth_getLogs", params: [{
          address: contract, fromBlock, toBlock,
          topics: [TRANSFER_TOPIC, null, ZERO_TOPIC],
        }], id: 1,
      }),
      signal: AbortSignal.timeout(15000),
    }),
  ]);

  const mintsData = await mintsResp.json();
  const burnsData = await burnsResp.json();

  const parseLog = (log, type) => ({
    chain: chainName,
    type,
    amount: parseInt(log.data, 16) / 10 ** decimals,
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
    address: type === "mint" ? "0x" + log.topics[2].slice(-40) : "0x" + log.topics[1].slice(-40),
  });

  const mints = (mintsData.result || []).map((l) => parseLog(l, "mint"));
  const burns = (burnsData.result || []).map((l) => parseLog(l, "burn"));

  return [...mints, ...burns].sort((a, b) => b.blockNumber - a.blockNumber);
}

// ─── Solana: SPL token supply ───

async function fetchSolanaSupply(rpc, mint, decimals) {
  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [mint] }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Solana RPC ${resp.status}`);
  const data = await resp.json();
  const amount = data.result?.value?.amount;
  if (!amount) throw new Error("No Solana supply data");
  return parseInt(amount) / 10 ** decimals;
}

// ─── TRON: TRC20 totalSupply via triggerconstantcontract ───

async function fetchTronSupply(rpc, contract, decimals) {
  const resp = await fetch(`${rpc}/wallet/triggerconstantcontract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_address: "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
      contract_address: contract,
      function_selector: "totalSupply()",
      visible: true,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Tron ${resp.status}`);
  const data = await resp.json();
  const hex = data.constant_result?.[0];
  if (!hex) throw new Error("No Tron supply data");
  return parseInt(hex, 16) / 10 ** decimals;
}

// ─── Cosmos: supply by denom ───

async function fetchCosmosSupply(rpc, denom, decimals) {
  const url = `${rpc}/cosmos/bank/v1beta1/supply/by_denom?denom=${encodeURIComponent(denom)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`Cosmos ${resp.status}`);
  const data = await resp.json();
  const amount = data?.amount?.amount;
  if (!amount) throw new Error("No Cosmos supply data");
  return parseInt(amount) / 10 ** decimals;
}

// ─── Main fetcher ───

// ─── Historical supply derived from mint/burn orders ───
// Walks forward from 0 at the first mint date, applying each day's net delta to
// reconstruct cumulative supply over time. Source of truth = wbtc.network orders.

function deriveHistoricalSupply(orderEvents) {
  const events = (orderEvents || [])
    .filter((o) => o.date && o.amount > 0 && (o.type === "mint" || o.type === "burn"))
    .map((o) => ({
      ts: new Date(o.date).getTime(),
      delta: o.type === "mint" ? o.amount : -o.amount,
    }))
    .filter((e) => Number.isFinite(e.ts))
    .sort((a, b) => a.ts - b.ts);

  if (!events.length) return [];

  // Bucket deltas by UTC day
  const DAY_MS = 86400 * 1000;
  const buckets = new Map();
  for (const e of events) {
    const day = Math.floor(e.ts / DAY_MS) * DAY_MS;
    buckets.set(day, (buckets.get(day) || 0) + e.delta);
  }
  const days = [...buckets.keys()].sort((a, b) => a - b);

  // Walk forward from 0 day-by-day, applying each day's net delta (or 0 on quiet days)
  // so the series has a point for every calendar day between the first activity and today.
  const series = [];
  let s = 0;
  const firstDay = days[0];
  const todayDay = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  for (let day = firstDay; day <= todayDay; day += DAY_MS) {
    if (buckets.has(day)) s += buckets.get(day);
    series.push({ date: Math.floor(day / 1000), value: s });
  }
  return series;
}

async function fetchAllChainSupplies() {
  const results = await Promise.all(
    CHAINS.map(async (c) => {
      try {
        let supply = 0;
        if (c.type === "evm") supply = await fetchEvmSupply(c.rpc, c.contract, c.decimals);
        else if (c.type === "solana") supply = await fetchSolanaSupply(c.rpc, c.mint, c.decimals);
        else if (c.type === "tron") supply = await fetchTronSupply(c.rpc, c.contract, c.decimals);
        else if (c.type === "cosmos") supply = await fetchCosmosSupply(c.rpc, c.denom, c.decimals);
        else return { chain: c.name, id: c.id, supply: null, error: "unsupported" };
        return { chain: c.name, id: c.id, supply, error: null };
      } catch (err) {
        console.error(`${c.name} supply error:`, err.message);
        return { chain: c.name, id: c.id, supply: null, error: err.message };
      }
    })
  );
  return results;
}

async function fetchWbtcNetworkData() {
  // Chains with dedicated wbtc.network custody + order endpoints
  // Note: wbtc.network uses short chain slugs (sol, trx, osmo) not full names
  const dataChains = ["eth", "base", "kava", "sol", "trx", "osmo"];

  const [summaryResp, ...chainResps] = await Promise.all([
    fetch(WBTC_API, { signal: AbortSignal.timeout(10000) }),
    // For each chain, fetch both addresses and orders in parallel
    ...dataChains.flatMap((c) => [
      fetch(`https://wbtc.network/api/chain/${c}/token/wbtc/addresses`, { signal: AbortSignal.timeout(15000) }).catch(() => null),
      fetch(`https://wbtc.network/api/chain/${c}/token/wbtc/orders`, { signal: AbortSignal.timeout(15000) }).catch(() => null),
    ]),
  ]);

  const summary = summaryResp.ok ? await summaryResp.json() : null;

  // Deduplicate addresses across chains (BTC custodians repeat across chain-specific endpoints)
  const addressMap = new Map();
  const orders = [];

  for (let i = 0; i < dataChains.length; i++) {
    const chain = dataChains[i];
    const addrsResp = chainResps[i * 2];
    const ordersResp = chainResps[i * 2 + 1];

    if (addrsResp?.ok) {
      const data = await addrsResp.json();
      for (const a of (data?.result || [])) {
        const key = `${a.chain}:${a.address}`;
        if (!addressMap.has(key)) {
          addressMap.set(key, { ...a, sourceChain: chain });
        }
      }
    }

    if (ordersResp?.ok) {
      const data = await ordersResp.json();
      for (const o of (data?.result || [])) {
        orders.push({ ...o, sourceChain: chain });
      }
    }
  }

  return {
    summary,
    addresses: Array.from(addressMap.values()),
    orders,
  };
}

// ─── Fetch mint/burn events across EVM chains ───

async function fetchAllChainEvents() {
  const evmChains = CHAINS.filter((c) => c.type === "evm");
  const results = await Promise.all(
    evmChains.map((c) =>
      fetchEvmMintBurnEvents(c.rpc, c.contract, c.decimals, c.name).catch((err) => {
        console.error(`${c.name} events error:`, err.message);
        return [];
      })
    )
  );
  return results.flat().sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 100);
}

// ─── Handler ───

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  try {
    const [chainSupplies, wbtcNetworkData] = await Promise.all([
      fetchAllChainSupplies(),
      fetchWbtcNetworkData().catch((err) => {
        console.error("wbtc.network fetch error:", err.message);
        return { summary: null, addresses: [], orders: [] };
      }),
    ]);

    // Compute totals
    const totalSupply = chainSupplies.reduce((s, c) => s + (c.supply || 0), 0);

    // Parse wbtc.network summary (amounts are in 8-decimal BTC units)
    const wbtcSupply = wbtcNetworkData.summary?.supply ? parseInt(wbtcNetworkData.summary.supply) / 1e8 : null;
    const wbtcHoldings = wbtcNetworkData.summary?.holdings ? parseInt(wbtcNetworkData.summary.holdings) / 1e8 : null;

    // Separate BTC custodian addresses from chain contracts. Balances come
    // from wbtc.network's reported values for dashboard speed; on-chain
    // verification of these balances is available via scripts/verify-reserves.js
    // (can be run manually or on a weekly/monthly cron).
    const btcAddresses = wbtcNetworkData.addresses.filter((a) => a.chain === "btc");
    const totalBtcReserves = btcAddresses.reduce((s, a) => s + (parseInt(a.balance || 0) / 1e8), 0);

    // Parse orders into clean mint/burn events with real amounts and merchant names
    // Orders come tagged with sourceChain (eth, base, kava)
    const CHAIN_LABELS = { eth: "Ethereum", base: "Base", kava: "Kava", sol: "Solana", trx: "TRON", osmo: "Osmosis" };
    // wbtc.network did a DB migration on 2020-03-03T21:02 that stamped every pre-existing
    // order with that synthetic timestamp. Real dates are preserved in history[].
    // Extract the earliest non-backfilled pending/asset history date to get the true date.
    const BACKFILL_PREFIX = "2020-03-03T21:02";
    const realDate = (o) => {
      const hist = o.history || [];
      const candidates = hist
        .filter((h) => (h.action === "pending" || h.action === "asset") && h.date && !h.date.startsWith(BACKFILL_PREFIX))
        .map((h) => h.date);
      if (candidates.length) return candidates.sort()[0];
      return o.date;
    };

    // Include orders whose on-chain effect has already landed:
    //  - Completed: always (BTC+ETH both settled)
    //  - Pending BURN: burn tx hits ETH first (reducing totalSupply) then BTC
    //    is released — if there's any eth history entry, supply already dropped.
    //  - Pending MINT: BTC deposit happens first, mint tx hits ETH last — only
    //    include if history has an eth `completed` entry (otherwise totalSupply
    //    hasn't risen yet).
    // Canceled / rejected never moved funds, always excluded.
    const hasEthHistory = (o, requireCompleted) => {
      for (const h of (o.history || [])) {
        if (h.chain !== "eth") continue;
        if (requireCompleted ? h.action === "completed" : (h.action === "completed" || h.action === "pending")) {
          return true;
        }
      }
      return false;
    };
    const orderEvents = (wbtcNetworkData.orders || [])
      .filter((o) => {
        if (o.type !== "mint" && o.type !== "burn") return false;
        if (o.status === "completed") return true;
        if (o.status === "pending") {
          if (o.type === "burn") return hasEthHistory(o, false); // eth burn tx landed
          if (o.type === "mint") return hasEthHistory(o, true);  // eth mint completed
        }
        return false;
      })
      .map((o) => {
        const chainKey = o.sourceChain || "eth";
        // Find the on-chain transaction in history for this chain
        const chainTx = (o.history || []).find((h) => h.chain === chainKey && h.action === "completed")
          || (o.history || []).find((h) => h.chain === chainKey);
        return {
          chain: CHAIN_LABELS[chainKey] || chainKey,
          type: o.type,
          amount: parseInt(o.amount || 0) / 1e8,
          txHash: chainTx?.txid || null,
          blockNumber: chainTx?.blockHeight || null,
          date: realDate(o),
          merchant: o.merchantName || null,
          status: o.status,
        };
      })
      .filter((e) => e.amount > 0)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Reserve ratio
    const reserveRatio = totalSupply > 0 && totalBtcReserves > 0
      ? (totalBtcReserves / totalSupply) * 100
      : null;

    // Historical supply: walks backwards from current cross-chain total through every
    // completed mint/burn order across all chains. Each chain's orders represent real
    // BTC-collateralized issuance (custody flows), not bridge transfers — bridge events
    // happen on-chain via LayerZero and aren't in this feed, so there's no double-counting.
    const historicalSupply = deriveHistoricalSupply(orderEvents);

    return res.status(200).json({
      summary: {
        totalSupply,
        totalBtcReserves,
        reserveRatio,
        wbtcNetworkSupply: wbtcSupply,
        wbtcNetworkHoldings: wbtcHoldings,
      },
      chainSupplies,
      custodianAddresses: btcAddresses.map((a) => ({
        address: a.address,
        balance: parseInt(a.balance || 0) / 1e8,
        type: a.type,
        verified: a.verified,
      })).sort((a, b) => b.balance - a.balance),
      recentEvents: orderEvents,
      historicalSupply,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("WBTC API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// Governance analytics API — aggregates DeFiLlama coins, Snapshot, Tally, and DeFiLlama protocols

const LLAMA_COINS = "https://coins.llama.fi";
const SNAPSHOT_GQL = "https://hub.snapshot.org/graphql";
const TALLY_GQL = "https://api.tally.xyz/query";
const DEFILLAMA = "https://api.llama.fi";
const DEFILLAMA_PRO = "https://pro-api.llama.fi";
const COINGECKO_PRO = "https://pro-api.coingecko.com/api/v3";

// Protocol registry
// model = voting mechanism (how voting power works)
// execution = who implements the outcome
// feesSlug = DeFiLlama fees API slug for revenue data
// revenueSharing = manual description (supplemented by DeFiLlama holderRevenue data)
const PROTOCOLS = [
  // Token-Weighted: 1 token = 1 vote, no staking/locking required
  { id: "uniswap", token: "UNI", cgId: "uniswap", snapshot: "uniswapgovernance.eth", tally: "uniswap", llama: "uniswap", feesSlug: "uniswap", model: "Token-Weighted", execution: "On-Chain", revenueSharing: "Fee switch activated Dec 2025", revShareModel: "Dividends" },  // fees distributed to stakers
  { id: "compound", token: "COMP", cgId: "compound-governance-token", snapshot: "comp-vote.eth", tally: "compound", llama: "compound-finance", feesSlug: "compound-finance", model: "Token-Weighted", execution: "On-Chain", revenueSharing: null, revShareModel: null },
  { id: "aave", token: "AAVE", cgId: "aave", snapshot: "aavedao.eth", tally: "aave", llama: "aave", feesSlug: "aave", model: "Token-Weighted", execution: "On-Chain", revenueSharing: "$1M/week buybacks + 50% GHO revenue", revShareModel: "Buybacks" },
  { id: "sky", token: "SKY", cgId: "sky", snapshot: null, tally: null, llama: "makerdao", feesSlug: "sky", model: "Token-Weighted", execution: "On-Chain", revenueSharing: "Smart burn engine buys SKY with surplus", revShareModel: "Buybacks" },
  { id: "lido", token: "LDO", cgId: "lido-dao", snapshot: "lido-snapshot.eth", tally: "lido", llama: "lido", feesSlug: "lido", model: "Token-Weighted", execution: "On-Chain", revenueSharing: null, revShareModel: null },
  { id: "morpho", token: "MORPHO", cgId: "morpho", snapshot: "morpho.eth", tally: "morpho", llama: "morpho-blue", feesSlug: "morpho", model: "Token-Weighted", execution: "Multisig", revenueSharing: null, revShareModel: null },
  { id: "ethena", token: "ENA", cgId: "ethena", snapshot: "ethenagovernance.eth", tally: null, llama: "ethena", feesSlug: "ethena", model: "Token-Weighted", execution: "Multisig", revenueSharing: "Fee switch + $890M buybacks in 2025", revShareModel: "Buybacks" },
  { id: "etherfi", token: "ETHFI", cgId: "ether-fi", snapshot: "etherfi-dao.eth", tally: null, llama: "ether.fi", feesSlug: "ether.fi", model: "Token-Weighted", execution: "Multisig", revenueSharing: "Revenue buybacks", revShareModel: "Buybacks" },
  { id: "fluid", token: "FLUID", cgId: "instadapp", snapshot: null, tally: null, llama: "fluid", feesSlug: "fluid", model: "Token-Weighted", execution: "Multisig", revenueSharing: "Revenue used for FLUID buybacks", revShareModel: "Buybacks" },

  // veToken: lock tokens for voting power, longer lock = more power
  { id: "curve", token: "CRV", cgId: "curve-dao-token", snapshot: "curve.eth", tally: null, llama: "curve-dex", feesSlug: "curve-dex", model: "veToken", execution: "On-Chain", revenueSharing: "Trading fees to veCRV holders", revShareModel: "Dividends" },
  { id: "aerodrome", token: "AERO", cgId: "aerodrome-finance", snapshot: null, tally: null, llama: "aerodrome", feesSlug: "aerodrome", model: "veToken", execution: "On-Chain", revenueSharing: "100% pool fees to veAERO voters", revShareModel: "Dividends" },

  // Staked Governance: must stake to vote, liquid/short cooldown
  { id: "pendle", token: "PENDLE", cgId: "pendle", snapshot: null, tally: null, llama: "pendle", feesSlug: "pendle", model: "Staked Governance", execution: "Multisig", revenueSharing: "80% of revenue to sPENDLE buybacks", revShareModel: "Buybacks" },
  { id: "maple", token: "SYRUP", cgId: "syrup", snapshot: "mapledao.eth", tally: null, llama: "maple", feesSlug: "maple", model: "Staked Governance", execution: "Multisig", revenueSharing: "25% revenue to Syrup Strategic Fund", revShareModel: "Buybacks" },
  { id: "summerfi", token: "SUMR", cgId: "summer-2", snapshot: null, tally: null, llama: "summer.fi", feesSlug: "summer.fi", model: "Staked Governance", execution: "On-Chain", revenueSharing: "20% of revenue in USDC to stakers", revShareModel: "Dividends" },
  { id: "yearn", token: "YFI", cgId: "yearn-finance", snapshot: "veyfi.eth", tally: null, llama: "yearn-finance", feesSlug: "yearn-finance", model: "Staked Governance", execution: "Multisig", revenueSharing: "90% of revenue to stYFI stakers", revShareModel: "Dividends" },
  { id: "jupiter", token: "JUP", cgId: "jupiter-exchange-solana", snapshot: null, tally: null, llama: "jupiter", feesSlug: "jupiter", model: "Staked Governance", execution: "Multisig", revenueSharing: "50% of revenue via buybacks", revShareModel: "Buybacks" },

  // None: no governance mechanism exists
  { id: "hyperliquid", token: "HYPE", cgId: "hyperliquid", snapshot: null, tally: null, llama: "hyperliquid", feesSlug: "hyperliquid", model: "No Governance", execution: "Multisig", revenueSharing: "97% of fees to HYPE buybacks", revShareModel: "Buybacks" },
  { id: "kamino", token: "KMNO", cgId: "kamino", snapshot: null, tally: null, llama: "kamino", feesSlug: "kamino", model: "No Governance", execution: "Multisig", revenueSharing: null, revShareModel: null },
];

// DeFiLlama emissions slugs (different from fees slugs)
const EMISSIONS_SLUGS = {
  uniswap: "uniswap", compound: "compound-finance", aave: "aave", sky: "sky",
  lido: "lido", morpho: "morpho", ethena: "ethena", etherfi: "ether.fi",
  fluid: "fluid", curve: "curve-finance", aerodrome: "aerodrome",
  pendle: "pendle", maple: "maple-finance", yearn: "yearn",
  jupiter: "jupiter", hyperliquid: "hyperliquid", kamino: "kamino",
};

// ─── DeFiLlama Coins API: current prices (no rate limits) ───

async function fetchLlamaCurrentPrices() {
  const coins = PROTOCOLS.filter((p) => p.cgId).map((p) => `coingecko:${p.cgId}`).join(",");
  const resp = await fetch(`${LLAMA_COINS}/prices/current/${coins}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`DeFiLlama prices ${resp.status}`);
  const data = await resp.json();

  const lookup = {};
  for (const [key, val] of Object.entries(data.coins || {})) {
    const cgId = key.replace("coingecko:", "");
    lookup[cgId] = {
      currentPrice: val.price || 0,
      confidence: val.confidence || 0,
    };
  }
  return lookup;
}

// ─── DeFiLlama Coins API: 365d price history per token (no rate limits) ───

async function fetchLlamaPriceChart(cgId) {
  const start = Math.floor(Date.now() / 1000) - 365 * 86400;
  const resp = await fetch(
    `${LLAMA_COINS}/chart/coingecko:${cgId}?start=${start}&span=365&period=1d`,
    { signal: AbortSignal.timeout(15000) }
  );

  if (!resp.ok) {
    console.warn(`DeFiLlama chart ${resp.status} for ${cgId}`);
    return [];
  }

  const data = await resp.json();
  const coinData = data.coins?.[`coingecko:${cgId}`];
  if (!coinData?.prices) return [];

  return coinData.prices.map((p) => ({
    date: p.timestamp,
    price: p.price,
  }));
}

// ─── CoinGecko: market cap, FDV, supply (bulk endpoint, 1 request) ───

async function fetchCoinGeckoMarkets() {
  const apiKey = process.env.COINGECKO_PRO_API_KEY;
  const ids = PROTOCOLS.filter((p) => p.cgId).map((p) => p.cgId).join(",");
  const resp = await fetch(
    `${COINGECKO_PRO}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=90d,1y`,
    {
      headers: apiKey ? { "x-cg-pro-api-key": apiKey } : {},
      signal: AbortSignal.timeout(15000),
    }
  );

  if (resp.status === 429) {
    console.warn("CoinGecko rate limited, skipping market data");
    return {};
  }
  if (!resp.ok) throw new Error(`CoinGecko markets ${resp.status}`);

  const coins = await resp.json();
  const lookup = {};
  for (const c of coins) {
    lookup[c.id] = {
      marketCap: c.market_cap || 0,
      fdv: c.fully_diluted_valuation || 0,
      fdvMcapRatio: c.market_cap > 0 ? (c.fully_diluted_valuation || 0) / c.market_cap : null,
      circulatingSupply: c.circulating_supply || 0,
      totalSupply: c.total_supply || 0,
      priceChange90d: c.price_change_percentage_90d_in_currency || null,
      priceChange1y: c.price_change_percentage_1y_in_currency || null,
      ath: c.ath || null,
      athDate: c.ath_date || null,
      athChangePercent: c.ath_change_percentage || null,
    };
  }
  return lookup;
}

// ─── Snapshot: proposals, votes, participation ───

async function fetchSnapshotData(space) {
  const query = `
    query {
      space(id: "${space}") {
        id
        name
        members
        followersCount
      }
      proposals(
        first: 200,
        skip: 0,
        where: { space_in: ["${space}"], state: "closed" },
        orderBy: "created",
        orderDirection: desc
      ) {
        id
        title
        state
        scores_total
        votes
        quorum
        created
        end
        choices
        scores
      }
    }
  `;

  const resp = await fetch(SNAPSHOT_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) throw new Error(`Snapshot ${resp.status}`);
  const data = await resp.json();

  const spaceData = data.data?.space || {};
  const proposals = data.data?.proposals || [];

  let passed = 0;
  const total = proposals.length;
  for (const p of proposals) {
    if (p.scores && p.scores.length > 0) {
      const maxScore = Math.max(...p.scores);
      const totalScore = p.scores.reduce((a, b) => a + b, 0);
      if (totalScore > 0 && maxScore / totalScore > 0.5) passed++;
    }
  }

  const recent = proposals.slice(0, 20);
  const avgVoters = recent.length > 0
    ? recent.reduce((sum, p) => sum + (p.votes || 0), 0) / recent.length
    : null;

  // Average total voting power used per proposal (for participation = avgScoresTotal / totalSupply)
  const avgScoresTotal = recent.length > 0
    ? recent.reduce((sum, p) => sum + (p.scores_total || 0), 0) / recent.length
    : null;

  const sixMonthsAgo = Math.floor(Date.now() / 1000) - 180 * 86400;
  const recentProposals = proposals.filter((p) => p.created > sixMonthsAgo);
  const proposalVelocity = recentProposals.length / 6;

  return {
    totalProposals: total,
    passRate: total > 0 ? (passed / total) * 100 : null,
    avgVotersPerProposal: avgVoters ? Math.round(avgVoters) : null,
    avgScoresTotal,
    proposalVelocity: Math.round(proposalVelocity * 10) / 10,
    source: "snapshot",
  };
}

// ─── Tally: on-chain governance proposals ───

async function fetchTallyData(slug) {
  const apiKey = process.env.TALLY_API_KEY;
  if (!apiKey) return null;

  // Step 1: Get org ID and proposal count
  const orgQuery = `{ organization(input: { slug: "${slug}" }) { name proposalsCount governorIds } }`;
  const orgResp = await fetch(TALLY_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": apiKey },
    body: JSON.stringify({ query: orgQuery }),
    signal: AbortSignal.timeout(10000),
  });
  if (!orgResp.ok) throw new Error(`Tally org ${orgResp.status}`);
  const orgData = await orgResp.json();
  if (orgData.errors) throw new Error(`Tally: ${orgData.errors[0].message}`);

  const org = orgData.data?.organization;
  if (!org) return null;

  const orgId = await (async () => {
    const idResp = await fetch(TALLY_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Api-Key": apiKey },
      body: JSON.stringify({ query: `{ organizationSlugToId(slug: "${slug}") }` }),
      signal: AbortSignal.timeout(10000),
    });
    const idData = await idResp.json();
    return idData.data?.organizationSlugToId;
  })();
  if (!orgId) return null;

  // Step 2: Get recent proposals with vote stats
  const propQuery = `{
    proposals(input: {
      filters: { organizationId: "${orgId}" },
      sort: { isDescending: true, sortBy: id },
      page: { limit: 50 }
    }) {
      nodes {
        ... on Proposal {
          onchainId
          status
          quorum
          voteStats { votesCount votersCount type }
        }
      }
    }
  }`;
  const propResp = await fetch(TALLY_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": apiKey },
    body: JSON.stringify({ query: propQuery }),
    signal: AbortSignal.timeout(10000),
  });
  if (!propResp.ok) throw new Error(`Tally proposals ${propResp.status}`);
  const propData = await propResp.json();

  const proposals = propData.data?.proposals?.nodes || [];
  const closed = proposals.filter((p) => p.status === "executed" || p.status === "defeated" || p.status === "expired");

  // Pass rate
  const passed = closed.filter((p) => p.status === "executed").length;
  const total = closed.length;

  // Average voters and voting power per proposal (last 20)
  const recent = closed.slice(0, 20);
  const avgVoters = recent.length > 0
    ? recent.reduce((sum, p) => sum + (p.voteStats || []).reduce((s, v) => s + (parseInt(v.votersCount) || 0), 0), 0) / recent.length
    : null;

  // Average total votes cast (in raw token units — need to divide by 10^decimals later)
  // We store raw and let the assembler convert using token decimals
  let avgScoresTotal = null;
  if (recent.length > 0) {
    const totals = recent.map((p) =>
      (p.voteStats || []).reduce((s, v) => s + parseFloat(v.votesCount || "0"), 0)
    );
    avgScoresTotal = totals.reduce((a, b) => a + b, 0) / totals.length;
  }

  // Get token decimals from quorum field length (18 decimals = typical ERC20)
  const quorumStr = proposals[0]?.quorum || "0";
  const decimals = Math.max(0, quorumStr.length - String(parseInt(quorumStr.slice(0, 3))).length);

  return {
    totalProposals: org.proposalsCount || total,
    passRate: total > 0 ? (passed / total) * 100 : null,
    avgVotersPerProposal: avgVoters ? Math.round(avgVoters) : null,
    // Normalize voting power to token units (divide by 10^18 for ERC20)
    avgScoresTotal: avgScoresTotal ? avgScoresTotal / 1e18 : null,
    source: "tally",
  };
}

// ─── CoinGecko Pro: inception price (first recorded trading price) ───

async function fetchInceptionPrice(cgId) {
  const apiKey = process.env.COINGECKO_PRO_API_KEY;
  const resp = await fetch(
    `${COINGECKO_PRO}/coins/${cgId}/market_chart?vs_currency=usd&days=max&interval=daily`,
    {
      headers: apiKey ? { "x-cg-pro-api-key": apiKey } : {},
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!resp.ok) {
    console.warn(`CoinGecko inception ${resp.status} for ${cgId}`);
    return null;
  }

  const data = await resp.json();
  const prices = data.prices || [];
  if (prices.length < 2) return null;

  const firstPrice = prices[0][1];
  const firstDate = Math.floor(prices[0][0] / 1000);
  const lastPrice = prices[prices.length - 1][1];

  return {
    inceptionPrice: firstPrice,
    inceptionDate: firstDate,
    currentPrice: lastPrice,
    changeSinceInception: firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : null,
  };
}

// ─── DeFiLlama Fees API: protocol revenue + holder revenue ───

async function fetchLlamaRevenue(feesSlug) {
  const [feesResp, revResp, holderRevResp] = await Promise.all([
    fetch(`${DEFILLAMA}/summary/fees/${feesSlug}?dataType=dailyFees`, { signal: AbortSignal.timeout(10000) }),
    fetch(`${DEFILLAMA}/summary/fees/${feesSlug}?dataType=dailyRevenue`, { signal: AbortSignal.timeout(10000) }),
    fetch(`${DEFILLAMA}/summary/fees/${feesSlug}?dataType=dailyHoldersRevenue`, { signal: AbortSignal.timeout(10000) }),
  ]);

  let fees30d = null;
  let revenue30d = null;
  let holderRevenue30d = null;

  if (feesResp.ok) {
    const data = await feesResp.json();
    const chart = data.totalDataChart || [];
    fees30d = chart.slice(-30).reduce((sum, [, v]) => sum + (v || 0), 0);
  }

  if (revResp.ok) {
    const data = await revResp.json();
    const chart = data.totalDataChart || [];
    revenue30d = chart.slice(-30).reduce((sum, [, v]) => sum + (v || 0), 0);
  }

  let holderRevenueCumulative = null;
  if (holderRevResp.ok) {
    const data = await holderRevResp.json();
    const chart = data.totalDataChart || [];
    holderRevenue30d = chart.slice(-30).reduce((sum, [, v]) => sum + (v || 0), 0);
    holderRevenueCumulative = chart.reduce((sum, [, v]) => sum + (v || 0), 0);
  }

  return { fees30d, revenue30d, holderRevenue30d, holderRevenueCumulative };
}

// ─── DeFiLlama Pro: token emissions (for fee-to-emissions ratio) ───

async function fetchEmissions30d(emissionsSlug, tokenPrice) {
  const apiKey = process.env.DEFILLAMA_API_KEY;
  if (!apiKey || !emissionsSlug) return null;

  const resp = await fetch(
    `${DEFILLAMA_PRO}/${apiKey}/api/emission/${emissionsSlug}`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!resp.ok) return null;

  const raw = await resp.json();
  const body = typeof raw.body === "string" ? JSON.parse(raw.body) : raw.body || raw;
  const categories = body?.documentedData?.data || body?.data || [];

  const now = Math.floor(Date.now() / 1000);

  // Compute daily emission rate by diffing consecutive `unlocked` values near today
  let totalDailyTokens = 0;
  for (const cat of categories) {
    const data = cat.data || [];
    // Find data points within 7 days of now for a stable average
    const recent = data
      .filter((p) => Math.abs(p.timestamp - now) < 7 * 86400)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (recent.length >= 2) {
      const diffs = [];
      for (let i = 1; i < recent.length; i++) {
        const diff = recent[i].unlocked - recent[i - 1].unlocked;
        diffs.push(diff);
      }
      // Use median diff to filter out noise from one-time cliff unlocks
      // A consistent daily diff indicates ongoing emissions
      const positiveDiffs = diffs.filter((d) => d > 0);
      if (positiveDiffs.length >= 2) {
        // Check if diffs are consistent (ongoing) vs sporadic (cliff)
        positiveDiffs.sort((a, b) => a - b);
        const median = positiveDiffs[Math.floor(positiveDiffs.length / 2)];
        // If median is close to the mean, it's a consistent daily emission
        const mean = positiveDiffs.reduce((a, b) => a + b, 0) / positiveDiffs.length;
        if (median > 0 && mean / median < 3) {
          totalDailyTokens += median;
        }
      } else if (positiveDiffs.length === 1) {
        // Only one positive diff in 7 days — could be a cliff unlock, skip
      }
    }
  }

  const price = tokenPrice || 0;
  return {
    emissions30dTokens: totalDailyTokens * 30,
    emissions30dUsd: totalDailyTokens * 30 * price,
    dailyEmissionsUsd: totalDailyTokens * price,
  };
}

// ─── veToken on-chain lock rates (CRV + AERO) ───

const ETH_RPC = "https://ethereum-rpc.publicnode.com";
const BASE_RPC = "https://mainnet.base.org";
const TOTAL_SUPPLY_SELECTOR = "0x18160ddd";

async function fetchTokensLocked(rpc, veAddress, tokenAddress) {
  // Get actual tokens locked in the ve contract via balanceOf
  const balanceOfSelector = "0x70a08231" + "000000000000000000000000" + veAddress.slice(2).toLowerCase();

  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_call", params: [{ to: tokenAddress, data: balanceOfSelector }, "latest"], id: 1 }),
    signal: AbortSignal.timeout(10000),
  });

  const data = await resp.json();
  return parseInt(data.result, 16) / 1e18;
}

async function fetchVeTokenLocked() {
  const [crvLocked, aeroLocked] = await Promise.all([
    fetchTokensLocked(
      ETH_RPC,
      "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2", // veCRV
      "0xD533a949740bb3306d119CC777fa900bA034cd52", // CRV
    ).catch((e) => { console.error("veCRV error:", e.message); return null; }),
    fetchTokensLocked(
      BASE_RPC,
      "0xeBf418Fe2512e7E6bd9b87a8F0f294aCDC67e6B4", // veAERO
      "0x940181a94A35A4569E4529A3CDfB74e38FD98631", // AERO
    ).catch((e) => { console.error("veAERO error:", e.message); return null; }),
  ]);

  return { curve: crvLocked, aerodrome: aeroLocked };
}

// ─── DeFiLlama: TVL ───

async function fetchLlamaTVL(slug) {
  // Try full protocol endpoint first (has history), fall back to simple /tvl/ endpoint
  try {
    const resp = await fetch(`${DEFILLAMA}/protocol/${slug}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (resp.ok) {
      const text = await resp.text();
      const data = JSON.parse(text);
      const tvlHistory = (data.tvl || []).slice(-365).map((p) => ({
        date: p.date,
        tvl: p.totalLiquidityUSD || 0,
      }));
      const currentTVL = tvlHistory.length > 0 ? tvlHistory[tvlHistory.length - 1].tvl : 0;
      const tvl1yAgo = tvlHistory.length >= 365 ? tvlHistory[0].tvl : null;
      const tvlChange1y = tvl1yAgo && tvl1yAgo > 0 ? ((currentTVL - tvl1yAgo) / tvl1yAgo) * 100 : null;
      return { currentTVL, tvlChange1y, tvlHistory };
    }
  } catch (e) {
    // Full endpoint failed (too large or timeout), try simple endpoint
    console.warn(`Full TVL fetch failed for ${slug}, trying simple endpoint:`, e.message);
  }

  // Fallback: simple /tvl/ endpoint (current value only, no history)
  const simpleResp = await fetch(`${DEFILLAMA}/tvl/${slug}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (simpleResp.ok) {
    const tvlValue = parseFloat(await simpleResp.text());
    return { currentTVL: tvlValue || 0, tvlChange1y: null, tvlHistory: [] };
  }

  return null;
}

// ─── Assemble per-protocol data ───

function assembleProtocol(proto, price, cgMarket, priceHistory, governance, tvl, inception, revenue, emissions) {
  const cg = cgMarket || {};

  let supplyGrowthPct = null;
  if (cg.fdvMcapRatio && cg.fdvMcapRatio > 1) {
    supplyGrowthPct = ((cg.fdvMcapRatio - 1) / cg.fdvMcapRatio) * 100;
  }

  // Compute price changes from history if CoinGecko didn't provide them
  let priceChange90d = cg.priceChange90d ?? null;
  let priceChange1y = cg.priceChange1y ?? null;
  if (priceHistory.length > 0) {
    const latest = priceHistory[priceHistory.length - 1].price;
    if (priceChange90d == null && priceHistory.length >= 90) {
      const p90 = priceHistory[priceHistory.length - 90].price;
      if (p90 > 0) priceChange90d = ((latest - p90) / p90) * 100;
    }
    if (priceChange1y == null && priceHistory.length >= 350) {
      const p1y = priceHistory[0].price;
      if (p1y > 0) priceChange1y = ((latest - p1y) / p1y) * 100;
    }
  }

  return {
    id: proto.id,
    token: proto.token,
    model: proto.model,
    execution: proto.execution,
    price: price?.currentPrice ?? null,
    marketCap: cg.marketCap ?? null,
    fdv: cg.fdv ?? null,
    fdvMcapRatio: cg.fdvMcapRatio ?? null,
    circulatingSupply: cg.circulatingSupply ?? null,
    totalSupply: cg.totalSupply ?? null,
    priceChange90d,
    priceChange1y,
    inflationAdjusted1y: priceChange1y,
    supplyGrowthPct,
    priceHistory,
    ath: cg.ath ?? null,
    athDate: cg.athDate ?? null,
    athChangePercent: cg.athChangePercent ?? null,
    totalProposals: governance?.totalProposals ?? null,
    passRate: governance?.passRate ?? null,
    avgVotersPerProposal: governance?.avgVotersPerProposal ?? null,
    // Participation = avg voting power used / circulating supply
    participationRate: governance?.avgScoresTotal && cg.circulatingSupply
      ? (governance.avgScoresTotal / cg.circulatingSupply) * 100
      : null,
    proposalVelocity: governance?.proposalVelocity ?? null,
    governanceSource: governance?.source ?? null,
    tvl: tvl?.currentTVL ?? null,
    tvlChange1y: tvl?.tvlChange1y ?? null,
    tvlHistory: tvl?.tvlHistory || [],
    revenueSharing: proto.revenueSharing ?? null,
    revShareModel: proto.revShareModel ?? null,
    fees30d: revenue?.fees30d ?? null,
    revenue30d: revenue?.revenue30d ?? null,
    holderRevenue30d: revenue?.holderRevenue30d ?? null,
    holderRevenueCumulative: revenue?.holderRevenueCumulative ?? null,
    holderRevenuePercent: (revenue?.revenue30d && revenue?.holderRevenue30d && revenue.revenue30d > 0)
      ? (revenue.holderRevenue30d / revenue.revenue30d) * 100
      : null,
    changeSinceInception: inception?.changeSinceInception ?? null,
    inceptionDate: inception?.inceptionDate ?? null,
    emissions30dUsd: emissions?.emissions30dUsd ?? null,
    dailyEmissionsUsd: emissions?.dailyEmissionsUsd ?? null,
    feeToEmissions: (revenue?.fees30d && emissions?.emissions30dUsd && emissions.emissions30dUsd > 0)
      ? revenue.fees30d / emissions.emissions30dUsd
      : null,
  };
}

// ─── Compute model averages ───

function computeModelAverages(protocols) {
  const byModel = {};
  for (const p of protocols) {
    if (!byModel[p.model]) byModel[p.model] = [];
    byModel[p.model].push(p);
  }

  const averages = {};
  for (const [model, protos] of Object.entries(byModel)) {
    const avg = (arr, key) => {
      const vals = arr.map((p) => p[key]).filter((v) => v != null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    averages[model] = {
      count: protos.length,
      tokens: protos.map((p) => p.token),
      avgPriceChange1y: avg(protos, "priceChange1y"),
      avgPriceChange90d: avg(protos, "priceChange90d"),
      avgInflationAdjusted1y: avg(protos, "inflationAdjusted1y"),
      avgPassRate: avg(protos, "passRate"),
      avgParticipationRate: avg(protos, "participationRate"),
      avgFdvMcapRatio: avg(protos, "fdvMcapRatio"),
      avgTvlChange1y: avg(protos, "tvlChange1y"),
      avgChangeSinceInception: avg(protos, "changeSinceInception"),
    };
  }

  return averages;
}

// ─── Handler ───

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=300");

  try {
    // Phase 1: Parallel fetch — prices (DeFiLlama, no rate limit), CoinGecko markets (1 req),
    // price charts (DeFiLlama, no rate limit), governance, and TVL
    const [llamaPrices, cgMarkets, ...rest] = await Promise.all([
      fetchLlamaCurrentPrices().catch((err) => {
        console.error("DeFiLlama prices error:", err.message);
        return {};
      }),
      fetchCoinGeckoMarkets().catch((err) => {
        console.error("CoinGecko markets error:", err.message);
        return {};
      }),
      // Price charts — all in parallel (DeFiLlama has no rate limit)
      ...PROTOCOLS.map((proto) =>
        proto.cgId
          ? fetchLlamaPriceChart(proto.cgId).catch((err) => {
              console.error(`Price chart error for ${proto.id}:`, err.message);
              return [];
            })
          : Promise.resolve([])
      ),
    ]);

    // Extract charts from rest array
    const charts = rest.slice(0, PROTOCOLS.length);

    // Phase 2: Governance + TVL (parallel)
    const govAndTvl = await Promise.all(
      PROTOCOLS.map(async (proto) => {
        const [governance, tvl] = await Promise.all([
          (async () => {
            // Fetch both sources in parallel, pick whichever has more proposals
            const [snap, tally] = await Promise.all([
              proto.snapshot
                ? fetchSnapshotData(proto.snapshot).catch((e) => { console.error(`Snapshot error for ${proto.id}:`, e.message); return null; })
                : Promise.resolve(null),
              proto.tally
                ? fetchTallyData(proto.tally).catch((e) => { console.error(`Tally error for ${proto.id}:`, e.message); return null; })
                : Promise.resolve(null),
            ]);
            const snapCount = snap?.totalProposals || 0;
            const tallyCount = tally?.totalProposals || 0;
            if (tallyCount >= snapCount && tallyCount > 0) return tally;
            if (snapCount > 0) return snap;
            return null;
          })(),
          proto.llama
            ? fetchLlamaTVL(proto.llama).catch((err) => {
                console.error(`DeFiLlama TVL error for ${proto.id}:`, err.message);
                return null;
              })
            : Promise.resolve(null),
        ]);
        return { governance, tvl };
      })
    );

    // Phase 2b: Fetch veToken lock rates + inception prices + revenue data (parallel, no rate limits)
    const [veLocked, ...restData] = await Promise.all([
      fetchVeTokenLocked().catch((err) => {
        console.error("veToken locked error:", err.message);
        return {};
      }),
      ...PROTOCOLS.map((proto) =>
        proto.cgId
          ? fetchInceptionPrice(proto.cgId).catch((err) => {
              console.error(`Inception price error for ${proto.id}:`, err.message);
              return null;
            })
          : Promise.resolve(null)
      ),
      // Revenue data from DeFiLlama fees API
      ...PROTOCOLS.map((proto) =>
        proto.feesSlug
          ? fetchLlamaRevenue(proto.feesSlug).catch((err) => {
              console.error(`Revenue error for ${proto.id}:`, err.message);
              return null;
            })
          : Promise.resolve(null)
      ),
    ]);

    // Split restData into inception and revenue arrays
    const inceptionData = restData.slice(0, PROTOCOLS.length);
    const revenueData = restData.slice(PROTOCOLS.length, PROTOCOLS.length * 2);

    // Phase 2c: Fetch emissions data (DeFiLlama Pro, for fee-to-emissions ratio)
    // Need token prices for USD conversion
    const emissionsData = await Promise.all(
      PROTOCOLS.map((proto) => {
        const slug = EMISSIONS_SLUGS[proto.id];
        const price = llamaPrices[proto.cgId]?.currentPrice || 0;
        return slug
          ? fetchEmissions30d(slug, price).catch((err) => {
              console.error(`Emissions error for ${proto.id}:`, err.message);
              return null;
            })
          : Promise.resolve(null);
      })
    );

    // Phase 3: Assemble
    const protocols = PROTOCOLS.map((proto, i) => {
      const { governance, tvl } = govAndTvl[i];
      const assembled = assembleProtocol(
        proto,
        llamaPrices[proto.cgId],
        cgMarkets[proto.cgId],
        charts[i],
        governance,
        tvl,
        inceptionData[i],
        revenueData[i],
        emissionsData[i],
      );
      // Override veToken protocols with on-chain lock rates (locked / total supply)
      // Using total supply because circulating often excludes locked tokens (e.g. AERO)
      // Their Snapshot is only signaling; real governance is on-chain gauge voting
      const totalSupply = cgMarkets[proto.cgId]?.totalSupply;
      if (proto.id === "curve" && veLocked.curve && totalSupply) {
        assembled.participationRate = (veLocked.curve / totalSupply) * 100;
        assembled.passRate = null;
      }
      if (proto.id === "aerodrome" && veLocked.aerodrome && totalSupply) {
        assembled.participationRate = (veLocked.aerodrome / totalSupply) * 100;
        assembled.passRate = null;
      }
      return assembled;
    });

    const modelAverages = computeModelAverages(protocols);

    return res.status(200).json({
      protocols,
      modelAverages,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Governance API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

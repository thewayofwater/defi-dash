const BEARER = process.env.TWITTER_BEARER_TOKEN;
const SEARCH_URL = "https://api.x.com/2/tweets/search/recent";

// ─── Curated accounts: yield analysts + key protocols (trimmed to fit 512-char X API query limit) ───
const ANALYSTS = [
  "DeFi_Made_Here", "0xHamz", "0xtindorr", "phtevenstrong", "yieldsandmore",
  "DefiIgnas", "Route2FI", "sassal0x", "nomaticcap",
];
const PROTOCOLS = [
  "AaveAave", "MorphoLabs", "0xfluid", "LidoFinance",
  "pendle_fi", "pendleintern", "yearnfi",
  "EthenaLabs", "HyperliquidX", "originprotocol",
];
const AGGREGATORS = [
  "DefiLlama",
];

const ALL_ACCOUNTS = [...ANALYSTS, ...PROTOCOLS, ...AGGREGATORS];
const FROM_CLAUSE = ALL_ACCOUNTS.map((a) => `from:${a}`).join(" OR ");

// ─── Asset-specific queries — require yield context, avoid bare token name matches ───
const YIELD_CONTEXT = "(yield OR APY OR APR OR earn OR vault OR bps)";
const ASSET_QUERIES = {
  ETH: `(ETH OR stETH OR wstETH OR rETH OR eETH) ${YIELD_CONTEXT}`,
  BTC: `(BTC OR WBTC OR cbBTC OR tBTC OR LBTC) ${YIELD_CONTEXT}`,
  USD: `(USDC OR USDT OR DAI OR sDAI OR USDe OR sUSDe OR GHO) ${YIELD_CONTEXT}`,
  SOL: `(SOL OR mSOL OR jitoSOL OR bSOL) ${YIELD_CONTEXT}`,
  HYPE: `(HYPE OR sHYPE OR HLP) ${YIELD_CONTEXT}`,
  EUR: `(EUR OR EURE OR EURC OR agEUR) ${YIELD_CONTEXT}`,
};

// ─── Category detection ───
const CATEGORY_PATTERNS = {
  "YIELD ALERT": /\b(apy|apr|yield|rate|earn|reward|basis point|bps)\b.*\b(\d+\.?\d*\s*%|\d+\s*bps)\b|\b(\d+\.?\d*\s*%|\d+\s*bps)\b.*\b(apy|apr|yield|rate|earn|reward)\b/i,
  "NEW POOL": /\b(launch|live now|new (pool|vault|market|strategy)|just deployed|now available|listing|onboard)/i,
  "RISK": /\b(depeg|exploit|hack|vulnerability|liquidat|bad debt|pause|emergency|risk|warning|caution)\b/i,
  "ANALYSIS": /\b(thread|breakdown|deep dive|analysis|compared?|versus|vs\.|overview|report|research|data shows)\b/i,
};

function categorize(text) {
  for (const [cat, regex] of Object.entries(CATEGORY_PATTERNS)) {
    if (regex.test(text)) return cat;
  }
  return "PROTOCOL UPDATE";
}

function buildQuery(asset) {
  const assetQ = ASSET_QUERIES[asset];
  if (assetQ) {
    return `(${FROM_CLAUSE}) ${assetQ} -is:retweet lang:en`;
  }
  return `(${FROM_CLAUSE}) (yield OR APY OR APR OR rate OR vault OR staking OR lending OR TVL OR reward) -is:retweet lang:en`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (!BEARER) {
    return res.status(500).json({ error: "Twitter Bearer Token not configured" });
  }

  const asset = (req.query.asset || "ETH").toUpperCase();
  const query = buildQuery(asset);

  // X API query max is 512 chars — if too long, drop asset keywords
  const finalQuery = query.length <= 512
    ? query
    : `(${FROM_CLAUSE}) (yield OR APY OR APR OR rate OR vault OR staking OR lending) -is:retweet lang:en`;

  const params = new URLSearchParams({
    query: finalQuery,
    max_results: "10",
    "tweet.fields": "created_at,public_metrics,author_id",
    expansions: "author_id",
    "user.fields": "name,username,profile_image_url,public_metrics",
  });

  try {
    const resp = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { Authorization: `Bearer ${BEARER}` },
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error("Twitter API error:", resp.status, body);
      return res.status(resp.status).json({ error: `Twitter API ${resp.status}`, detail: body });
    }

    const data = await resp.json();

    const users = {};
    (data.includes?.users || []).forEach((u) => {
      users[u.id] = u;
    });

    const isAnalyst = new Set(ANALYSTS.map((a) => a.toLowerCase()));

    const tweets = (data.data || []).map((t) => {
      const author = users[t.author_id] || {};
      const username = author.username || "";
      return {
        id: t.id,
        text: t.text,
        createdAt: t.created_at,
        metrics: t.public_metrics,
        category: categorize(t.text),
        authorType: isAnalyst.has(username.toLowerCase()) ? "analyst" : "protocol",
        author: {
          name: author.name,
          username,
          profileImage: author.profile_image_url,
          followers: author.public_metrics?.followers_count || 0,
        },
      };
    });

    // Sort by engagement (likes + retweets + replies)
    tweets.sort((a, b) => {
      const engA = (a.metrics?.like_count || 0) + (a.metrics?.retweet_count || 0) + (a.metrics?.reply_count || 0);
      const engB = (b.metrics?.like_count || 0) + (b.metrics?.retweet_count || 0) + (b.metrics?.reply_count || 0);
      return engB - engA;
    });

    return res.status(200).json({
      asset,
      tweets,
      meta: data.meta,
    });
  } catch (err) {
    console.error("Twitter fetch error:", err);
    return res.status(500).json({ error: err.message });
  }
}

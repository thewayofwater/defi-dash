import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

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
const ANALYST_SET = new Set(ANALYSTS.map((a) => a.toLowerCase()));

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
function categorize(text) {
  // YIELD ALERT: mentions a percentage alongside yield keywords
  if (/\b(apy|apr|yield|earn|reward|basis point|bps)\b/i.test(text) && /\d+\.?\d*\s*%|\d+\s*bps/i.test(text)) return "YIELD ALERT";
  if (/\d+\.?\d*\s*%/.test(text) && /\b(apy|apr|yield|earn)\b/i.test(text)) return "YIELD ALERT";
  // NEW POOL
  if (/\b(launch|live now|new (pool|vault|market|strategy)|just deployed|now available|listing|onboard)/i.test(text)) return "NEW POOL";
  // RISK
  if (/\b(depeg|exploit|hack|vulnerability|liquidat|bad debt|pause|emergency|risk|warning|caution)\b/i.test(text)) return "RISK";
  // ANALYSIS
  if (/\b(thread|breakdown|deep dive|analysis|compared?|versus|vs\.|overview|report|research|data shows)\b/i.test(text)) return "ANALYSIS";
  return "PROTOCOL UPDATE";
}

function buildQuery(asset) {
  const assetQ = ASSET_QUERIES[asset];
  if (assetQ) {
    return `(${FROM_CLAUSE}) ${assetQ} -is:retweet lang:en`;
  }
  return `(${FROM_CLAUSE}) (yield OR APY OR APR OR rate OR vault OR staking OR lending OR TVL OR reward) -is:retweet lang:en`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "api-proxy",
        configureServer(server) {
          server.middlewares.use("/api/twitter", async (req, res) => {
            const BEARER = env.TWITTER_BEARER_TOKEN;
            if (!BEARER) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: "TWITTER_BEARER_TOKEN not set" }));
              return;
            }

            const url = new URL(req.url, "http://localhost");
            const asset = (url.searchParams.get("asset") || "ETH").toUpperCase();
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
              const resp = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
                headers: { Authorization: `Bearer ${BEARER}` },
              });

              if (!resp.ok) {
                const body = await resp.text();
                console.error("Twitter API error:", resp.status, body);
                res.statusCode = resp.status;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: `Twitter API ${resp.status}`, detail: body }));
                return;
              }

              const data = await resp.json();
              const users = {};
              (data.includes?.users || []).forEach((u) => { users[u.id] = u; });

              const tweets = (data.data || []).map((t) => {
                const author = users[t.author_id] || {};
                const username = author.username || "";
                return {
                  id: t.id,
                  text: t.text,
                  createdAt: t.created_at,
                  metrics: t.public_metrics,
                  category: categorize(t.text),
                  authorType: ANALYST_SET.has(username.toLowerCase()) ? "analyst" : "protocol",
                  author: {
                    name: author.name,
                    username,
                    profileImage: author.profile_image_url,
                    followers: author.public_metrics?.followers_count || 0,
                  },
                };
              });

              tweets.sort((a, b) => {
                const engA = (a.metrics?.like_count || 0) + (a.metrics?.retweet_count || 0) + (a.metrics?.reply_count || 0);
                const engB = (b.metrics?.like_count || 0) + (b.metrics?.retweet_count || 0) + (b.metrics?.reply_count || 0);
                return engB - engA;
              });

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ asset, tweets, meta: data.meta }));
            } catch (err) {
              console.error("Twitter fetch error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        },
      },
      {
        name: "morpho-proxy",
        configureServer(server) {
          server.middlewares.use("/api/morpho", async (req, res) => {
            try {
              const morphoHandler = await import("./api/morpho.js");
              const fakeRes = {
                statusCode: 200,
                headers: {},
                setHeader(k, v) { this.headers[k] = v; },
                status(code) { this.statusCode = code; return this; },
                json(data) {
                  res.statusCode = this.statusCode;
                  Object.entries(this.headers).forEach(([k, v]) => res.setHeader(k, v));
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(data));
                },
              };
              await morphoHandler.default(req, fakeRes);
            } catch (err) {
              console.error("Morpho proxy error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        },
      },
      {
        name: "yields-proxy",
        configureServer(server) {
          server.middlewares.use("/api/yields", async (req, res) => {
            try {
              const yieldsHandler = await import("./api/yields.js");
              const fakeRes = {
                statusCode: 200,
                headers: {},
                setHeader(k, v) { this.headers[k] = v; },
                status(code) { this.statusCode = code; return this; },
                json(data) {
                  res.statusCode = this.statusCode;
                  Object.entries(this.headers).forEach(([k, v]) => res.setHeader(k, v));
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(data));
                },
              };
              await yieldsHandler.default({ url: req.originalUrl || req.url }, fakeRes);
            } catch (err) {
              console.error("Yields proxy error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        },
      },
      {
        name: "aave-proxy",
        configureServer(server) {
          server.middlewares.use("/api/aave", async (req, res) => {
            try {
              const aaveHandler = await import("./api/aave.js");
              const fakeRes = {
                statusCode: 200,
                headers: {},
                setHeader(k, v) { this.headers[k] = v; },
                status(code) { this.statusCode = code; return this; },
                json(data) {
                  res.statusCode = this.statusCode;
                  Object.entries(this.headers).forEach(([k, v]) => res.setHeader(k, v));
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(data));
                },
              };
              await aaveHandler.default(req, fakeRes);
            } catch (err) {
              console.error("Aave proxy error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        },
      },
      {
        name: "pendle-proxy",
        configureServer(server) {
          server.middlewares.use("/api/pendle", async (req, res) => {
            try {
              const pendleHandler = await import("./api/pendle.js");
              const fakeRes = {
                statusCode: 200,
                headers: {},
                setHeader(k, v) { this.headers[k] = v; },
                status(code) { this.statusCode = code; return this; },
                json(data) {
                  res.statusCode = this.statusCode;
                  Object.entries(this.headers).forEach(([k, v]) => res.setHeader(k, v));
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(data));
                },
              };
              await pendleHandler.default(req, fakeRes);
            } catch (err) {
              console.error("Pendle proxy error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        },
      },
      {
        name: "maple-proxy",
        configureServer(server) {
          server.middlewares.use("/api/maple", async (req, res) => {
            try {
              const mapleHandler = await import("./api/maple.js");
              const fakeRes = {
                statusCode: 200,
                headers: {},
                setHeader(k, v) { this.headers[k] = v; },
                status(code) { this.statusCode = code; return this; },
                json(data) {
                  res.statusCode = this.statusCode;
                  Object.entries(this.headers).forEach(([k, v]) => res.setHeader(k, v));
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(data));
                },
              };
              await mapleHandler.default(req, fakeRes);
            } catch (err) {
              console.error("Maple proxy error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        },
      },
      {
        name: "hyperliquid-proxy",
        configureServer(server) {
          server.middlewares.use("/api/hyperliquid", async (req, res) => {
            try {
              const hlHandler = await import("./api/hyperliquid.js");
              const fakeRes = {
                statusCode: 200,
                headers: {},
                setHeader(k, v) { this.headers[k] = v; },
                status(code) { this.statusCode = code; return this; },
                json(data) {
                  res.statusCode = this.statusCode;
                  Object.entries(this.headers).forEach(([k, v]) => res.setHeader(k, v));
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(data));
                },
              };
              await hlHandler.default(req, fakeRes);
            } catch (err) {
              console.error("Hyperliquid proxy error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        },
      },
      {
        name: "governance-proxy",
        configureServer(server) {
          server.middlewares.use("/api/governance", async (req, res) => {
            try {
              // Pass env vars to process.env for the governance handler
              if (env.TALLY_API_KEY) process.env.TALLY_API_KEY = env.TALLY_API_KEY;
              if (env.COINGECKO_PRO_API_KEY) process.env.COINGECKO_PRO_API_KEY = env.COINGECKO_PRO_API_KEY;
              if (env.DEFILLAMA_API_KEY) process.env.DEFILLAMA_API_KEY = env.DEFILLAMA_API_KEY;
              const govHandler = await import("./api/governance.js");
              const fakeRes = {
                statusCode: 200,
                headers: {},
                setHeader(k, v) { this.headers[k] = v; },
                status(code) { this.statusCode = code; return this; },
                json(data) {
                  res.statusCode = this.statusCode;
                  Object.entries(this.headers).forEach(([k, v]) => res.setHeader(k, v));
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(data));
                },
              };
              await govHandler.default(req, fakeRes);
            } catch (err) {
              console.error("Governance proxy error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        },
      },
    ],
  };
});

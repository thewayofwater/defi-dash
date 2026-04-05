import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const ACCOUNTS = [
  "DefiLlama", "DeFi_Made_Here", "yieldsandmore", "phtevenstrong",
  "AaveAave", "MorphoLabs", "0xfluid", "LidoFinance",
  "CurveFinance", "pendle_fi", "pendleintern", "yearnfi",
  "EthenaLabs", "HyperliquidX", "JitoLabs", "stakedaohq",
  "sassal0x", "0xHamz", "eigenlayer", "0xtindorr", "originprotocol",
];

const FROM_CLAUSE = ACCOUNTS.map((a) => `from:${a}`).join(" OR ");
const ASSET_QUERIES = {
  ETH: '("ETH yield" OR "ETH yields" OR "ETH APY" OR "ETH staking" OR stETH OR wstETH OR rETH)',
  BTC: '("BTC yield" OR "BTC yields" OR "BTC APY" OR "BTC staking" OR WBTC OR cbBTC)',
  USD: '("stablecoin yield" OR "USDC yield" OR "USDT yield" OR "USDC APY" OR "USDT APY" OR USDe)',
  SOL: '("SOL yield" OR "SOL yields" OR "SOL APY" OR "SOL staking" OR mSOL OR jitoSOL)',
  HYPE: '("HYPE yield" OR "HYPE APY" OR "HYPE staking" OR sHYPE)',
  EUR: '("EUR yield" OR "EUR APY" OR EURE OR EURC)',
};

function buildQuery(asset) {
  const assetQ = ASSET_QUERIES[asset];
  if (assetQ) {
    return `(${FROM_CLAUSE}) ${assetQ} -is:retweet lang:en`;
  }
  return `(${FROM_CLAUSE}) (yield OR APY OR APR OR staking OR lending OR TVL) -is:retweet lang:en`;
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

            const params = new URLSearchParams({
              query,
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
                return {
                  id: t.id,
                  text: t.text,
                  createdAt: t.created_at,
                  metrics: t.public_metrics,
                  author: {
                    name: author.name,
                    username: author.username,
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
    ],
  };
});

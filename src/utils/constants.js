// Map DeFiLlama protocol categories to dashboard categories
export const CATEGORY_MAP = {
  // DEX LP
  Dexs: "DEX LP",

  // Lending
  Lending: "Lending",
  "NFT Lending": "Lending",
  "Uncollateralized Lending": "Lending",

  // LST / Staking
  "Liquid Staking": "LST",
  "Liquid Restaking": "LST",
  Restaking: "LST",
  "Staking Pool": "LST",
  "Restaked BTC": "LST",

  // Stablecoin / CDP
  CDP: "Stablecoin",
  "Stablecoin Issuer": "Stablecoin",
  "Algo-Stables": "Stablecoin",
  "Dual-Token Stablecoin": "Stablecoin",
  "Partially Algorithmic Stablecoin": "Stablecoin",

  // Yield
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

  // RWA
  RWA: "RWA",
  "RWA Lending": "RWA",

  // Derivatives
  Derivatives: "Derivatives",
  Options: "Derivatives",
  "Basis Trading": "Stablecoin",
  Synthetics: "Derivatives",
  "Prediction Market": "Derivatives",

  // Bridge
  Bridge: "Bridge",
  "Cross Chain Bridge": "Bridge",
  "Canonical Bridge": "Bridge",
  "Bridge Aggregator": "Bridge",
  "Bridge Aggregators": "Bridge",
};

export const TRACKED_CATEGORIES = [
  "DEX LP",
  "Lending",
  "LST",
  "Stablecoin",
  "Yield",
  "RWA",
  "Derivatives",
  "Bridge",
];

export const CATEGORY_SHORT = {
  "DEX LP": "DEX",
  Lending: "Lend",
  LST: "LST",
  Stablecoin: "Stable",
  Yield: "Yield",
  RWA: "RWA",
  Derivatives: "Derivs",
  Bridge: "Bridge",
};

export const CATEGORY_COLORS = {
  "DEX LP": "#22d3ee",
  Lending: "#a78bfa",
  LST: "#34d399",
  Stablecoin: "#fbbf24",
  Yield: "#f472b6",
  RWA: "#fb923c",
  Derivatives: "#60a5fa",
  Bridge: "#c084fc",
};

export const TVL_FLOOR = 1_000_000;
export const STABLECOIN_TVL_FLOOR = 500_000;
export const CHAIN_MIN_POOLS = 5;

// Display name overrides for chains
export const CHAIN_DISPLAY_NAMES = {
  "Hyperliquid L1": "HyperEVM",
};

export function chainName(chain) {
  return CHAIN_DISPLAY_NAMES[chain] || chain;
}

export const ASSET_COLORS = {
  ETH: "#627EEA",   // ETH blue
  BTC: "#F7931A",   // BTC orange
  USD: "#26A17B",   // Tether green
  SOL: "#9945FF",   // SOL purple
  HYPE: "#50E3C2",  // Hyperliquid teal
  EUR: "#1a4fc4",   // EU blue
};

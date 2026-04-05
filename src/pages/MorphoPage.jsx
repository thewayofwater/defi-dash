import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { useMorphoData } from "../hooks/useMorphoData";
import { fmt, fmtPct } from "../utils/format";
import { SectionHeader, LoadingSpinner, ModuleCard, ChartShimmer } from "../components/Shared";

const mono = "'JetBrains Mono', monospace";

const TAB_STYLE = (active) => ({
  background: active ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.025)",
  border: active ? "1px solid rgba(168,85,247,0.3)" : "1px solid rgba(255,255,255,0.05)",
  borderRadius: 5,
  padding: "7px 16px",
  fontSize: 10,
  fontFamily: mono,
  color: active ? "#a855f7" : "#6b7a8d",
  cursor: "pointer",
  letterSpacing: 0.5,
  fontWeight: active ? 600 : 400,
});

const FILTER_STYLE = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 4,
  padding: "5px 8px",
  fontSize: 12,
  fontFamily: mono,
  color: "#cbd5e1",
  outline: "none",
  minWidth: 80,
};

const TH = { padding: "8px 8px", textAlign: "left", fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 };
const TD = { padding: "8px 8px", fontSize: 13, fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.03)" };
const TD_NUM = { ...TD, textAlign: "right" };
const TD_APY = { ...TD_NUM, color: "#22d3ee" };
const TD_DIM = { ...TD, color: "#94a3b8" };

function lltvColor(lltv) {
  if (lltv == null) return "#94a3b8";
  return lltv >= 90 ? "#f87171" : lltv >= 80 ? "#fbbf24" : "#4ade80";
}

function utilColor(util) {
  if (util == null) return "#94a3b8";
  return util >= 95 ? "#f87171" : util >= 85 ? "#fb923c" : util >= 70 ? "#fbbf24" : "#4ade80";
}

// Asset class classification
const USD_TOKENS = new Set(["USDC", "USDT", "USDS", "USDT0", "DAI", "PYUSD", "RLUSD", "USDe", "sUSDe", "sUSDS", "USDM", "GHO", "FRAX", "LUSD", "crvUSD", "mkUSD", "DOLA", "USDA", "USDB", "USD0", "AUSD", "USDbC", "sDAI", "sFRAX", "sUSD", "FDUSD", "TUSD", "BUSD", "syrupUSDC", "wUSDM", "steakUSDC", "steakPYUSD", "USDO", "Re7USDT", "GUSD", "USR"]);
const ETH_TOKENS = new Set(["WETH", "ETH", "wstETH", "stETH", "cbETH", "rETH", "weETH", "ezETH", "mETH", "sfrxETH", "frxETH", "WSTETH", "osETH", "swETH", "oETH", "ETHx", "ankrETH", "instETH", "pufETH", "rsETH", "steakETH", "HGETH", "eETH"]);
const BTC_TOKENS = new Set(["WBTC", "cbBTC", "tBTC", "sBTC", "LBTC", "FBTC", "eBTC", "pumpBTC", "solvBTC", "uniBTC", "BTCB", "dlcBTC"]);
const EUR_TOKENS = new Set(["EURC", "EURS", "EURE", "agEUR", "EURe", "EUROC"]);

function getAssetClass(symbol) {
  if (!symbol) return null;
  const upper = symbol.toUpperCase();
  if (USD_TOKENS.has(symbol) || upper.includes("USD") || upper.includes("DAI")) return "USD";
  if (ETH_TOKENS.has(symbol) || upper.includes("ETH")) return "ETH";
  if (BTC_TOKENS.has(symbol) || upper.includes("BTC")) return "BTC";
  if (EUR_TOKENS.has(symbol) || upper.includes("EUR")) return "EUR";
  return null;
}

const ASSET_CLASSES = ["USD", "ETH", "BTC", "EUR"];

// Curator address → name mapping
const CURATOR_NAMES = {
  "0x9E33faAE38ff641094fa68c65c2cE600b3410585": "Gauntlet",
  "0xb5c5b5D7a64d43bb91Dab63Ff3095F7FcB869b4e": "Gauntlet",
  "0xe3ea927a0f41B4a84fA9900812E52F8BcB84f396": "Gauntlet",
  "0x827e86072B06674a077f592A531dcE4590aDeCdB": "Steakhouse",
  "0x90D0f26025571295D18a6c041E47450B81886B51": "Yearn",
  "0x75178137D3B4B9A0F771E0e149b00fB8167BA325": "Hyperithm",
  "0x18e4961454B3E487B3f47c70b703684D894Ff979": "Felix",
  "0x72882eb5D27C7088DFA6DDE941DD42e5d184F0ef": "Clearstar",
  "0x08eDEbFFaE68970DCf751baa826182b3a4aCFC05": "Anthias Labs",
  "0x9e396dE3312D373b87F9BD8763fb48184b42aac0": "Sentora",
  "0x3F32bC09d41eE699844F8296e806417D6bf61Bba": "sky.money",
  "0x6788c8ad65E85CCa7224a0B46D061EF7D81F9Da5": "AlphaPing",
  "0xBBE0dE9757F93e3306aDBfeBE906AB285EDD13DA": "Api3",
  "0xF930EBBd05eF8b25B1797b9b2109DDC9B0d43063": "Stake DAO",
};

// For the zero address and unmapped curators, use vault name patterns
const NAME_CURATOR_MAP = {
  "Kabu": "Api3",
  "EURCV": "MEV Capital",
  "Pendle": "MEV Capital",
  "Universal": "Re7",
  "f(x)": "Re7",
  "Re7": "Re7",
  "Yield": "Clearstar",
  "fxUSD": "9Summits",
  "d3nity": "Yearn",
  "YieldNest": "UltraYield",
  "Edge": "UltraYield",
  "Stake": "Stake DAO",
  "Grove": "Steakhouse",
  "3F": "Steakhouse",
  "Cronos": "Steakhouse",
  "Farcaster": "Steakhouse",
  "Smokehouse": "Steakhouse",
  "August": "August Digital",
  "Alpha": "AlphaPing",
  "Flagship": "Block Analitica",
  "K3": "K3 Capital",
  "USDhL": "Felix",
  "Cap": "Gauntlet",
  "Compound": "Gauntlet",
  "Vault": "Gauntlet",
  "Index": "Gauntlet",
  "Metronome": "Gauntlet",
  "Extrafi": "Gauntlet",
  "Resolv": "Gauntlet",
  "Seamless": "Gauntlet",
  "SwissBorg": "Gauntlet",
  "USDT0": "Gauntlet",
  "Balanced": "Gauntlet",
};

function getCuratorName(curatorAddress, vaultName) {
  // Try address mapping first (skip zero address)
  if (curatorAddress && curatorAddress !== "0x0000000000000000000000000000000000000000") {
    const mapped = CURATOR_NAMES[curatorAddress];
    if (mapped) return mapped;
  }
  // Fallback: match vault name prefix
  if (vaultName) {
    for (const [prefix, name] of Object.entries(NAME_CURATOR_MAP)) {
      if (vaultName.startsWith(prefix)) return name;
    }
    // Known multi-word prefixes
    if (vaultName.startsWith("MEV Capital")) return "MEV Capital";
    if (vaultName.startsWith("Block Analitica")) return "Block Analitica";
    if (vaultName.startsWith("sky.money")) return "sky.money";
    // Last resort: first word
    return vaultName.split(" ")[0];
  }
  return "Unknown";
}

const PAGE_SIZE = 25;

function Pagination({ page, totalPages, total, label, onPageChange, pageSize = PAGE_SIZE }) {
  if (total <= pageSize) return null;
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "10px 0", fontSize: 10, fontFamily: mono, color: "#6b7a8d" }}>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 4,
          padding: "4px 10px",
          fontSize: 10,
          fontFamily: mono,
          color: page === 0 ? "#2d3a4a" : "#94a3b8",
          cursor: page === 0 ? "default" : "pointer",
        }}
      >
        ← Prev
      </button>
      <span>{start}–{end} of {total} {label}</span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages - 1}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 4,
          padding: "4px 10px",
          fontSize: 10,
          fontFamily: mono,
          color: page >= totalPages - 1 ? "#2d3a4a" : "#94a3b8",
          cursor: page >= totalPages - 1 ? "default" : "pointer",
        }}
      >
        Next →
      </button>
    </div>
  );
}

function FilterBar({ filters, options, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      {Object.entries(options).map(([key, { label, values }]) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>{label}</span>
          <select
            style={FILTER_STYLE}
            value={filters[key] || ""}
            onChange={(e) => onChange({ ...filters, [key]: e.target.value })}
          >
            <option value="">All</option>
            {values.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function VaultTable({ vaults, type }) {
  const [sortKey, setSortKey] = useState("tvlUsd");
  const [sortDir, setSortDir] = useState("desc");
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(0);

  const vaultsWithCurator = useMemo(() =>
    vaults.map((v) => ({ ...v, curatorName: getCuratorName(v.curator, v.name) })),
    [vaults]
  );

  const filterOptions = useMemo(() => {
    const curators = [...new Set(vaultsWithCurator.map((v) => v.curatorName))].sort();
    const assets = [...new Set(vaultsWithCurator.map((v) => v.asset))].sort();
    const chains = [...new Set(vaultsWithCurator.map((v) => v.chain))].sort();
    return {
      curatorName: { label: "Curator", values: curators },
      assetClass: { label: "Asset Class", values: ASSET_CLASSES },
      asset: { label: "Asset", values: assets },
      chain: { label: "Chain", values: chains },
    };
  }, [vaultsWithCurator]);

  const filtered = useMemo(() => {
    return vaultsWithCurator.filter((v) => {
      if (filters.curatorName && v.curatorName !== filters.curatorName) return false;
      if (filters.assetClass && getAssetClass(v.asset) !== filters.assetClass) return false;
      if (filters.asset && v.asset !== filters.asset) return false;
      if (filters.chain && v.chain !== filters.chain) return false;
      return true;
    });
  }, [vaultsWithCurator, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] || 0;
      const bv = b[sortKey] || 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortIcon = (key) => sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  if (!vaults.length) return <div style={{ color: "#6b7a8d", fontSize: 13, fontFamily: mono, padding: 16 }}>No {type} vaults found</div>;

  return (
    <div>
      <FilterBar filters={filters} options={filterOptions} onChange={(f) => { setFilters(f); setPage(0); }} />
      <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, marginBottom: 8 }}>
        {filtered.length} of {vaults.length} vaults
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>Vault</th>
              <th style={TH}>Curator</th>
              <th style={TH}>Asset</th>
              <th style={TH}>Chain</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("apy")}>Net APY{sortIcon("apy")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("grossApy")}>Gross APY{sortIcon("grossApy")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("tvlUsd")}>TVL{sortIcon("tvlUsd")}</th>
              <th style={{ ...TH, textAlign: "right" }}>Fee</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((v, i) => (
              <tr
                key={v.address || i}
                onClick={() => window.open(`https://app.morpho.org/${v.chain.toLowerCase()}/vault/${v.address}`, "_blank")}
                style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)", cursor: "pointer" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)"}
              >
                <td style={{ ...TD, color: "#cbd5e1", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.name}>{v.name}</td>
                <td style={TD_DIM}>{v.curatorName}</td>
                <td style={TD_DIM}>{v.asset}</td>
                <td style={TD_DIM}>{v.chain}</td>
                <td style={TD_APY}>{fmtPct(v.apy)}</td>
                <td style={TD_NUM}>{fmtPct(v.grossApy)}</td>
                <td style={TD_NUM}>{fmt(v.tvlUsd)}</td>
                <td style={{ ...TD_NUM, color: "#94a3b8" }}>{fmtPct(v.fee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={Math.ceil(sorted.length / PAGE_SIZE)} total={sorted.length} label="vaults" onPageChange={setPage} />
      </div>
    </div>
  );
}

function MarketTable({ markets }) {
  const [sortKey, setSortKey] = useState("supplyUsd");
  const [sortDir, setSortDir] = useState("desc");
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(0);

  const filterOptions = useMemo(() => {
    const loanAssets = [...new Set(markets.map((m) => m.loanAsset))].sort();
    const collaterals = [...new Set(markets.map((m) => m.collateralAsset).filter(Boolean))].sort();
    const chains = [...new Set(markets.map((m) => m.chain))].sort();
    return {
      loanAssetClass: { label: "Loan Class", values: ASSET_CLASSES },
      loanAsset: { label: "Loan", values: loanAssets },
      collateralAsset: { label: "Collateral", values: collaterals },
      chain: { label: "Chain", values: chains },
    };
  }, [markets]);

  const filtered = useMemo(() => {
    return markets.filter((m) => {
      if (filters.loanAssetClass && getAssetClass(m.loanAsset) !== filters.loanAssetClass) return false;
      if (filters.loanAsset && m.loanAsset !== filters.loanAsset) return false;
      if (filters.collateralAsset && m.collateralAsset !== filters.collateralAsset) return false;
      if (filters.chain && m.chain !== filters.chain) return false;
      return true;
    });
  }, [markets, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] || 0;
      const bv = b[sortKey] || 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortIcon = (key) => sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  if (!markets.length) return <div style={{ color: "#6b7a8d", fontSize: 13, fontFamily: mono, padding: 16 }}>No markets found</div>;

  return (
    <div>
      <FilterBar filters={filters} options={filterOptions} onChange={(f) => { setFilters(f); setPage(0); }} />
      <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, marginBottom: 8 }}>
        {filtered.length} of {markets.length} markets
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>Loan Asset</th>
              <th style={TH}>Collateral</th>
              <th style={TH}>Chain</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("supplyApy")}>Supply APY{sortIcon("supplyApy")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("borrowApy")}>Borrow APY{sortIcon("borrowApy")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("supplyUsd")}>Supply{sortIcon("supplyUsd")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("borrowUsd")}>Borrow{sortIcon("borrowUsd")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("utilization")}>Util%{sortIcon("utilization")}</th>
              <th style={{ ...TH, textAlign: "right" }}>LLTV</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((m, i) => (
              <tr
                key={m.marketId || i}
                onClick={() => window.open(`https://app.morpho.org/${m.chain.toLowerCase()}/market/${m.marketId}`, "_blank")}
                style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)", cursor: "pointer" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)"}
              >
                <td style={{ ...TD, color: "#cbd5e1" }}>{m.loanAsset}</td>
                <td style={TD_DIM}>{m.collateralAsset || "—"}</td>
                <td style={TD_DIM}>{m.chain}</td>
                <td style={TD_APY}>{fmtPct(m.supplyApy)}</td>
                <td style={{ ...TD_NUM, color: "#f87171" }}>{fmtPct(m.borrowApy)}</td>
                <td style={TD_NUM}>{fmt(m.supplyUsd)}</td>
                <td style={TD_NUM}>{fmt(m.borrowUsd)}</td>
                <td style={{ ...TD_NUM, color: utilColor(m.utilization) }}>{fmtPct(m.utilization)}</td>
                <td style={{ ...TD_NUM, color: lltvColor(m.lltv) }}>{m.lltv ? fmtPct(m.lltv) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={Math.ceil(sorted.length / PAGE_SIZE)} total={sorted.length} label="markets" onPageChange={setPage} />
      </div>
    </div>
  );
}

const chartTooltipStyle = {
  contentStyle: {
    background: "#131926",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 5,
    fontSize: 10,
    fontFamily: mono,
    color: "#e2e8f0",
  },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#e2e8f0" },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};

function ProtocolTvlChart({ history }) {
  const data = useMemo(() =>
    history
      .filter((h) => h.tvl > 0)
      .map((h) => ({
        date: new Date(h.date * 1000).toISOString().slice(0, 10),
        tvl: h.tvl,
        supply: h.supply,
        borrow: h.borrow,
      })),
    [history]
  );

  if (!data.length) return null;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <defs>
          <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="supplyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="borrowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} interval={Math.floor(data.length / 6)} tickFormatter={(v) => v.slice(5)} />
        <YAxis tickFormatter={(v) => fmt(v)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} labelFormatter={(v) => v} formatter={(v, name) => [fmt(v), name === "tvl" ? "TVL" : name === "supply" ? "Supply" : "Borrow"]} />
        <Legend
          formatter={(value) => value === "tvl" ? "TVL" : value === "supply" ? "Supply" : "Borrow"}
          wrapperStyle={{ fontSize: 10, fontFamily: mono, color: "#94a3b8" }}
        />
        <Area type="monotone" dataKey="tvl" stroke="#a855f7" fill="url(#tvlGrad)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="supply" stroke="#22d3ee" fill="url(#supplyGrad)" strokeWidth={1.5} dot={false} />
        <Area type="monotone" dataKey="borrow" stroke="#f87171" fill="url(#borrowGrad)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const CURATOR_PALETTE = [
  "#a855f7", "#818cf8", "#c084fc", "#e879f9", "#f472b6",
  "#fb923c", "#fbbf24", "#34d399", "#22d3ee", "#60a5fa",
  "#f87171", "#94a3b8",
];

const CHAIN_COLORS = {
  Ethereum: "#627eea", Base: "#2563eb", Arbitrum: "#28a0f0",
  Optimism: "#ff0420", Polygon: "#8247e5", HyperEVM: "#22d3ee",
  Unichain: "#f472b6", Monad: "#a855f7", Stable: "#34d399",
  Katana: "#fb923c",
};
function getChainColor(name) {
  return CHAIN_COLORS[name] || "#6b7a8d";
}

function CuratorTvlChart({ vaults, curatorColorMap }) {
  const data = useMemo(() => {
    const byCurator = {};
    vaults.forEach((v) => {
      const c = getCuratorName(v.curator, v.name);
      byCurator[c] = (byCurator[c] || 0) + v.tvlUsd;
    });
    return Object.entries(byCurator)
      .map(([name, tvl]) => ({ name, tvl }))
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 12);
  }, [vaults]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={100} tick={{ fill: "#cbd5e1", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} formatter={(v) => [fmt(v), "TVL"]} />
        <Bar dataKey="tvl" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {data.map((d, i) => <Cell key={i} fill={curatorColorMap[d.name] || "#6b7a8d"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function CollateralChart({ markets }) {
  const data = useMemo(() => {
    const byCollateral = {};
    markets.forEach((m) => {
      if (!m.collateralAsset) return;
      byCollateral[m.collateralAsset] = (byCollateral[m.collateralAsset] || 0) + m.supplyUsd;
    });
    return Object.entries(byCollateral)
      .map(([name, supply]) => ({ name, supply }))
      .sort((a, b) => b.supply - a.supply)
      .slice(0, 12);
  }, [markets]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#cbd5e1", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} formatter={(v) => [fmt(v), "Supply"]} />
        <Bar dataKey="supply" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {data.map((_, i) => <Cell key={i} fill={i === 0 ? "#4ade80" : "rgba(74,222,128,0.4)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChainTvlChart({ vaults, vaultsV2, markets }) {
  const data = useMemo(() => {
    const byChain = {};
    [...vaults, ...vaultsV2].forEach((v) => {
      byChain[v.chain] = (byChain[v.chain] || 0) + v.tvlUsd;
    });
    markets.forEach((m) => {
      byChain[m.chain] = (byChain[m.chain] || 0) + m.supplyUsd;
    });
    return Object.entries(byChain)
      .map(([name, tvl]) => ({ name, tvl }))
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 10);
  }, [vaults, vaultsV2, markets]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#cbd5e1", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} formatter={(v) => [fmt(v), "TVL"]} />
        <Bar dataKey="tvl" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {data.map((d, i) => <Cell key={i} fill={getChainColor(d.name)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function FeeRevenueChart({ vaults, curatorColorMap }) {
  const data = useMemo(() => {
    const byCurator = {};
    vaults.forEach((v) => {
      const c = getCuratorName(v.curator, v.name);
      // Annualized fee revenue = TVL × grossAPY × fee rate
      const feeRevenue = v.tvlUsd * (v.grossApy / 100) * (v.fee / 100);
      byCurator[c] = (byCurator[c] || 0) + feeRevenue;
    });
    return Object.entries(byCurator)
      .filter(([, rev]) => rev > 0)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 12);
  }, [vaults]);

  if (!data.length) return <div style={{ color: "#6b7a8d", fontSize: 12, fontFamily: mono, padding: 16 }}>No fee data available</div>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={100} tick={{ fill: "#cbd5e1", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} formatter={(v) => [fmt(v), "Ann. Revenue"]} />
        <Bar dataKey="revenue" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {data.map((d, i) => <Cell key={i} fill={curatorColorMap[d.name] || "#6b7a8d"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function VaultCountByChainChart({ vaults, vaultsV2 }) {
  const data = useMemo(() => {
    const byChain = {};
    [...vaults, ...vaultsV2].forEach((v) => {
      byChain[v.chain] = (byChain[v.chain] || 0) + 1;
    });
    return Object.entries(byChain)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [vaults, vaultsV2]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#cbd5e1", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} formatter={(v) => [v, "Vaults"]} />
        <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {data.map((d, i) => <Cell key={i} fill={getChainColor(d.name)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function LltvDistributionChart({ markets }) {
  const data = useMemo(() => {
    const buckets = {};
    markets.forEach((m) => {
      if (m.lltv == null) return;
      const bucket = `${Math.round(m.lltv)}%`;
      if (!buckets[bucket]) buckets[bucket] = { name: bucket, count: 0, value: Math.round(m.lltv) };
      buckets[bucket].count += 1;
    });
    return Object.values(buckets).sort((a, b) => a.value - b.value);
  }, [markets]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis dataKey="name" tick={{ fill: "#cbd5e1", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} formatter={(v) => [v, "Markets"]} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={28}>
          {data.map((d, i) => <Cell key={i} fill={d.value >= 90 ? "#f87171" : d.value >= 80 ? "#fbbf24" : "#4ade80"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Collateral type classification (by yield mechanism / wrapper type)
const LST_TOKENS_COL = new Set(["wstETH", "stETH", "cbETH", "rETH", "osETH", "swETH", "oETH", "ETHx", "ankrETH", "sfrxETH", "frxETH", "mETH", "cmETH", "OETH", "superOETHb", "wsuperOETHb", "ETH+", "kHYPE", "wstHYPE", "lstHYPE", "beHYPE", "MaticX", "uniBTC", "wstLINK", "pumpBTC"]);
const LRT_TOKENS_COL = new Set(["weETH", "ezETH", "pufETH", "rsETH", "wrsETH", "rswETH", "ynETHx"]);
const YIELD_VAULT_TOKENS = new Set(["sUSDe", "sUSDS", "sUSDD", "sUSDai", "sUSDf", "sUSN", "sNUSD", "siUSD", "stUSDS", "stcUSD", "sUSDC", "savUSD", "apyUSD", "reUSD", "syrupUSDC", "syrupUSDT", "steakUSDC", "fxSAVE", "srRoyUSDC", "syzUSD", "earnAUSD", "yoUSD", "jrUSDe", "USP", "upUSDC", "upGAMMAusdc", "wbravUSDC", "wsrUSD", "wstUSR", "yvvbUSDC", "yvvbUSDT", "yvAUSD", "vbETH", "yvvbETH", "vbWBTC", "yvvbWBTC", "compWETH", "mHyperBTC", "mHyperETH", "agETH", "yoETH", "savETH", "hgETH", "hbHYPE", "mHYPER"]);
const RWA_TOKENS_COL = new Set(["thBILL", "EUTBL", "ynRWAx", "PAXG", "XAUt", "muBOND", "mF-ONE", "mAPOLLO", "AA_FalconXUSDC", "ACRDX", "AZND", "SPYx", "RLP"]);
const WRAPPED_TOKENS = new Set(["WBTC", "cbBTC", "tBTC", "LBTC", "FBTC", "SolvBTC", "solvBTC", "BTCB", "UBTC", "WETH", "WHYPE", "WPOL", "cbADA", "cbXRP", "cbDOGE", "cbLTC"]);
const PERP_LP_TOKENS = new Set(["hwHLP"]);
const CURVE_LP_TOKENS = new Set(["stakedao-FrxMsUSD", "stakedao-av/frxUSD", "stakedao-crvfrxUSD", "stakedao-frxUSDOUSD", "triBTC"]);

function getCollateralType(symbol) {
  if (!symbol) return "Other";
  if (symbol.startsWith("PT-")) return "Pendle PT";
  if (symbol.startsWith("GLV")) return "Perp LP";
  if (LST_TOKENS_COL.has(symbol)) return "LST";
  if (LRT_TOKENS_COL.has(symbol)) return "LRT";
  if (YIELD_VAULT_TOKENS.has(symbol)) return "Yield Vault";
  if (RWA_TOKENS_COL.has(symbol)) return "RWA";
  if (WRAPPED_TOKENS.has(symbol)) return "Wrapped";
  if (PERP_LP_TOKENS.has(symbol)) return "Perp LP";
  if (CURVE_LP_TOKENS.has(symbol)) return "Curve LP";
  if (USD_TOKENS.has(symbol)) return "Stablecoin";
  return "Other";
}

const COLLATERAL_TYPE_COLORS = {
  "LST": "#818cf8",
  "LRT": "#a78bfa",
  "Yield Vault": "#34d399",
  "Pendle PT": "#f472b6",
  "RWA": "#fb923c",
  "Wrapped": "#94a3b8",
  "Stablecoin": "#4ade80",
  "Curve LP": "#fbbf24",
  "Perp LP": "#fbbf24",
  "Other": "#6b7a8d",
};

function CollateralExplorer({ markets }) {
  const [sortKey, setSortKey] = useState("supply");
  const [sortDir, setSortDir] = useState("desc");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(0);

  const data = useMemo(() => {
    const byCollateral = {};
    markets.forEach((m) => {
      if (!m.collateralAsset) return;
      const c = m.collateralAsset;
      if (!byCollateral[c]) {
        byCollateral[c] = { name: c, type: getCollateralType(c), markets: 0, supply: 0, lltvSum: 0, lltvCount: 0, loanAssets: new Set(), chains: new Set() };
      }
      byCollateral[c].markets += 1;
      byCollateral[c].supply += m.supplyUsd;
      if (m.lltv != null) { byCollateral[c].lltvSum += m.lltv; byCollateral[c].lltvCount += 1; }
      byCollateral[c].loanAssets.add(m.loanAsset);
      byCollateral[c].chains.add(m.chain);
    });
    return Object.values(byCollateral).map((c) => ({
      ...c,
      avgLltv: c.lltvCount > 0 ? c.lltvSum / c.lltvCount : null,
      loanAssets: [...c.loanAssets],
      chains: [...c.chains],
    }));
  }, [markets]);

  const types = useMemo(() => [...new Set(data.map((d) => d.type))].sort(), [data]);

  const filtered = useMemo(() => {
    if (!typeFilter) return data;
    return data.filter((d) => d.type === typeFilter);
  }, [data, typeFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] || 0;
      const bv = b[sortKey] || 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortIcon = (key) => sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>Type</span>
        <select
          style={FILTER_STYLE}
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
        >
          <option value="">All ({data.length})</option>
          {types.map((t) => {
            const count = data.filter((d) => d.type === t).length;
            return <option key={t} value={t}>{t} ({count})</option>;
          })}
        </select>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>{filtered.length} collateral assets</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>Collateral</th>
              <th style={TH}>Type</th>
              <th style={TH}>Loan Asset</th>
              <th style={TH}>Chains</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("markets")}>Markets{sortIcon("markets")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("supply")}>Supply{sortIcon("supply")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("avgLltv")}>Avg LLTV{sortIcon("avgLltv")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(page * 10, (page + 1) * 10).map((c, i) => (
              <tr
                key={c.name}
                style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)" }}
              >
                <td style={{ ...TD, color: "#cbd5e1", fontWeight: 500 }}>{c.name}</td>
                <td style={TD}>
                  <span style={{
                    fontSize: 11,
                    fontFamily: mono,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background: `${COLLATERAL_TYPE_COLORS[c.type]}18`,
                    color: COLLATERAL_TYPE_COLORS[c.type],
                    letterSpacing: 0.5,
                  }}>
                    {c.type}
                  </span>
                </td>
                <td style={TD_DIM}>{c.loanAssets.join(", ")}</td>
                <td style={TD_DIM}>{c.chains.join(", ")}</td>
                <td style={TD_NUM}>{c.markets}</td>
                <td style={TD_NUM}>{fmt(c.supply)}</td>
                <td style={{ ...TD_NUM, color: lltvColor(c.avgLltv) }}>
                  {c.avgLltv != null ? fmtPct(c.avgLltv) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={Math.ceil(sorted.length / 10)} total={sorted.length} label="collateral assets" onPageChange={setPage} pageSize={10} />
      </div>
    </div>
  );
}

function CollateralTypeChart({ markets }) {
  const data = useMemo(() => {
    const byType = {};
    markets.forEach((m) => {
      if (!m.collateralAsset) return;
      const type = getCollateralType(m.collateralAsset);
      byType[type] = (byType[type] || 0) + m.supplyUsd;
    });
    return Object.entries(byType)
      .map(([name, supply]) => ({ name, supply }))
      .sort((a, b) => b.supply - a.supply);
  }, [markets]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#cbd5e1", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltipStyle} formatter={(v) => [fmt(v), "Supply"]} />
        <Bar dataKey="supply" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {data.map((d) => <Cell key={d.name} fill={COLLATERAL_TYPE_COLORS[d.name] || "#6b7a8d"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const NEW_PERIOD_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysAgo(ts) {
  const d = Math.floor((Date.now() / 1000 - ts) / 86400);
  return d === 0 ? "Today" : d === 1 ? "1d ago" : `${d}d ago`;
}

function NewMarketsTable({ markets, cutoff }) {
  const newMarkets = useMemo(() =>
    markets
      .filter((m) => m.createdAt && m.createdAt > cutoff)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20),
    [markets, cutoff]
  );

  if (!newMarkets.length) return <div style={{ color: "#6b7a8d", fontSize: 12, fontFamily: mono, padding: 16 }}>No new markets in this period</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={TH}>Created</th>
            <th style={TH}>Loan</th>
            <th style={TH}>Collateral</th>
            <th style={TH}>Chain</th>
            <th style={{ ...TH, textAlign: "right" }}>Supply APY</th>
            <th style={{ ...TH, textAlign: "right" }}>Supply</th>
            <th style={{ ...TH, textAlign: "right" }}>LLTV</th>
          </tr>
        </thead>
        <tbody>
          {newMarkets.map((m, i) => (
            <tr
              key={m.marketId || i}
              onClick={() => window.open(`https://app.morpho.org/${m.chain.toLowerCase()}/market/${m.marketId}`, "_blank")}
              style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)", cursor: "pointer" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)"}
            >
              <td style={{ ...TD, color: "#4ade80" }} title={formatDate(m.createdAt)}>{daysAgo(m.createdAt)}</td>
              <td style={{ ...TD, color: "#cbd5e1" }}>{m.loanAsset}</td>
              <td style={TD_DIM}>{m.collateralAsset || "—"}</td>
              <td style={TD_DIM}>{m.chain}</td>
              <td style={TD_APY}>{fmtPct(m.supplyApy)}</td>
              <td style={TD_NUM}>{fmt(m.supplyUsd)}</td>
              <td style={{ ...TD_NUM, color: lltvColor(m.lltv) }}>{m.lltv ? fmtPct(m.lltv) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewVaultsTable({ vaults, cutoff }) {
  const newVaults = useMemo(() =>
    vaults
      .filter((v) => v.createdAt && v.createdAt > cutoff)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20),
    [vaults, cutoff]
  );

  if (!newVaults.length) return <div style={{ color: "#6b7a8d", fontSize: 12, fontFamily: mono, padding: 16 }}>No new vaults in this period</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={TH}>Created</th>
            <th style={TH}>Vault</th>
            <th style={TH}>Asset</th>
            <th style={TH}>Chain</th>
            <th style={{ ...TH, textAlign: "right" }}>Net APY</th>
            <th style={{ ...TH, textAlign: "right" }}>TVL</th>
          </tr>
        </thead>
        <tbody>
          {newVaults.map((v, i) => (
            <tr
              key={v.address || i}
              onClick={() => window.open(`https://app.morpho.org/${v.chain.toLowerCase()}/vault/${v.address}`, "_blank")}
              style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)", cursor: "pointer" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)"}
            >
              <td style={{ ...TD, color: "#4ade80" }} title={formatDate(v.createdAt)}>{daysAgo(v.createdAt)}</td>
              <td style={{ ...TD, color: "#cbd5e1", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.name}>{v.name}</td>
              <td style={TD_DIM}>{v.asset}</td>
              <td style={TD_DIM}>{v.chain}</td>
              <td style={TD_APY}>{fmtPct(v.apy)}</td>
              <td style={TD_NUM}>{fmt(v.tvlUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MorphoPage() {
  const { vaults, vaultsV2, markets, history, loading, refreshing, refreshKey, error, lastUpdated, refresh } = useMorphoData();
  const [tab, setTab] = useState("markets");
  const [newPeriodDays, setNewPeriodDays] = useState(14);

  const newCutoff = useMemo(() => Math.floor(Date.now() / 1000) - newPeriodDays * 86400, [newPeriodDays]);

  const curatorColorMap = useMemo(() => {
    const byCurator = {};
    vaults.forEach((v) => {
      const c = getCuratorName(v.curator, v.name);
      byCurator[c] = (byCurator[c] || 0) + v.tvlUsd;
    });
    const sorted = Object.entries(byCurator).sort((a, b) => b[1] - a[1]);
    const map = {};
    sorted.forEach(([name], i) => { map[name] = CURATOR_PALETTE[i % CURATOR_PALETTE.length]; });
    return map;
  }, [vaults]);

  const stats = useMemo(() => {
    const totalVaultTvl = vaults.reduce((s, v) => s + v.tvlUsd, 0);
    const totalV2Tvl = vaultsV2.reduce((s, v) => s + v.tvlUsd, 0);
    // Use latest historical data point for protocol-wide totals
    const latest = history.length ? history[history.length - 1] : null;
    const totalTvl = latest?.tvl || 0;
    const totalMarketSupply = latest?.supply || 0;
    const totalMarketBorrow = latest?.borrow || 0;
    return { totalTvl, totalVaultTvl, totalV2Tvl, totalMarketSupply, totalMarketBorrow };
  }, [vaults, vaultsV2, history]);

  if (error) {
    return (
      <div style={{ background: "#0a0e17", color: "#f87171", padding: 40, fontFamily: mono, textAlign: "center", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Failed to load Morpho data</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>{error}</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: "#0a0e17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner message="Pulling data from Morpho API..." />
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0e17", color: "#e2e8f0", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
      {/* Header */}
      <div style={{ padding: "20px 26px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
              Morpho
              <span style={{ color: "#a855f7", marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: mono, verticalAlign: "middle", background: "rgba(168,85,247,0.07)", padding: "2px 7px", borderRadius: 3, letterSpacing: 1 }}>
                PROTOCOL
              </span>
            </h1>
            <div style={{ fontSize: 12, color: "#4f5e6f", marginTop: 2, fontFamily: mono }}>
              Live data from Morpho API
              {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              background: refreshing ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 11,
              fontFamily: mono,
              color: refreshing ? "#a855f7" : "#94a3b8",
              cursor: refreshing ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s",
              letterSpacing: 0.5,
            }}
          >
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none", fontSize: 13 }}>&#x21bb;</span>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Stats hero + grid */}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {/* Hero TVL card */}
          <div style={{
            background: "rgba(168,85,247,0.06)",
            border: "1px solid rgba(168,85,247,0.15)",
            borderRadius: 6,
            padding: "20px 24px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.08) 40%, rgba(168,85,247,0.12) 50%, rgba(168,85,247,0.08) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: "#a855f7", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Total Value Locked</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 4 }}>{fmt(stats.totalTvl)}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>protocol-wide</div>
          </div>
          {/* 2×2 grid */}
          <div style={{ flex: 2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "V1 Vaults", value: fmt(stats.totalVaultTvl), sub: `${vaults.length} vaults` },
              { label: "V2 Vaults", value: fmt(stats.totalV2Tvl), sub: `${vaultsV2.length} vaults` },
              { label: "Supply", value: fmt(stats.totalMarketSupply), sub: `${markets.length} markets` },
              { label: "Borrow", value: fmt(stats.totalMarketBorrow), sub: stats.totalMarketSupply > 0 ? `${fmtPct(stats.totalMarketBorrow / stats.totalMarketSupply * 100)} util` : "—" },
            ].map((card) => (
              <div key={card.label} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "10px 16px", position: "relative", overflow: "hidden" }}>
                {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
                <div style={{ fontSize: 11, color: "#5a6678", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>{card.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 2 }}>{card.value}</div>
                <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono }}>{card.sub}</div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Charts */}
      <div style={{ padding: "20px 26px 0", display: "flex", flexDirection: "column", gap: 16 }}>
        {history.length > 0 && (
          <ModuleCard>
            <SectionHeader title="Protocol TVL" subtitle="Historical TVL, supply, and borrow across all chains" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><ProtocolTvlChart history={history} /></div>
            )}
          </ModuleCard>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <ModuleCard>
            <SectionHeader title="TVL by Curator" subtitle="Combined V1 + V2 vault deposits per curator" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><CuratorTvlChart vaults={[...vaults, ...vaultsV2]} curatorColorMap={curatorColorMap} /></div>
            )}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="Fee Revenue by Curator" subtitle="Estimated annualized performance fee revenue (TVL × yield × fee rate)" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><FeeRevenueChart vaults={[...vaults, ...vaultsV2]} curatorColorMap={curatorColorMap} /></div>
            )}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="TVL by Chain" subtitle="Combined vault and market TVL per chain" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><ChainTvlChart vaults={vaults} vaultsV2={vaultsV2} markets={markets} /></div>
            )}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="Vault Count by Chain" subtitle="Number of V1 + V2 vaults deployed per chain" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><VaultCountByChainChart vaults={vaults} vaultsV2={vaultsV2} /></div>
            )}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="Collateral by Type" subtitle="Total supply by collateral mechanism" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><CollateralTypeChart markets={markets} /></div>
            )}
          </ModuleCard>
          <ModuleCard>
            <SectionHeader title="LLTV Distribution" subtitle="Liquidation LTV across markets" />
            {refreshing ? <ChartShimmer height={280} /> : (
              <div key={refreshKey}><LltvDistributionChart markets={markets} /></div>
            )}
          </ModuleCard>
        </div>
        <ModuleCard>
          <SectionHeader title="Collateral Explorer" subtitle="All collateral assets by type, supply, and loan pairings" />
          {refreshing ? <ChartShimmer height={200} /> : (
            <div key={refreshKey}><CollateralExplorer markets={markets} /></div>
          )}
        </ModuleCard>
      </div>

      {/* Tabs + New + Content */}
      <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={TAB_STYLE(tab === "markets")} onClick={() => setTab("markets")}>Markets</button>
          <button style={TAB_STYLE(tab === "v1")} onClick={() => setTab("v1")}>V1 Vaults</button>
          <button style={TAB_STYLE(tab === "v2")} onClick={() => setTab("v2")}>V2 Vaults</button>
        </div>

        <ModuleCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <SectionHeader
              title={tab === "markets" ? "New Markets" : tab === "v1" ? "New V1 Vaults" : "New V2 Vaults"}
              subtitle={tab === "markets" ? "Recently created markets" : "Recently created vaults"}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {NEW_PERIOD_OPTIONS.map(({ label, days }) => (
                <button
                  key={days}
                  onClick={() => setNewPeriodDays(days)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 10,
                    fontFamily: mono,
                    fontWeight: 500,
                    letterSpacing: 0.5,
                    border: newPeriodDays === days
                      ? "1px solid rgba(74,222,128,0.3)"
                      : "1px solid rgba(255,255,255,0.06)",
                    background: newPeriodDays === days
                      ? "rgba(74,222,128,0.1)"
                      : "rgba(255,255,255,0.02)",
                    color: newPeriodDays === days ? "#4ade80" : "#4a5568",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {refreshing ? <ChartShimmer height={200} /> : (
            <div key={refreshKey}>
              {tab === "markets" && <NewMarketsTable markets={markets} cutoff={newCutoff} />}
              {tab === "v1" && <NewVaultsTable vaults={vaults} cutoff={newCutoff} />}
              {tab === "v2" && <NewVaultsTable vaults={vaultsV2} cutoff={newCutoff} />}
            </div>
          )}
        </ModuleCard>

        {tab === "markets" && (
          <ModuleCard>
            <SectionHeader title="Morpho Markets" subtitle={`${markets.length} active markets`} />
            {refreshing ? <ChartShimmer height={300} /> : (
              <div key={refreshKey}><MarketTable markets={markets} /></div>
            )}
          </ModuleCard>
        )}
        {tab === "v1" && (
          <ModuleCard>
            <SectionHeader title="Morpho V1 Vaults" subtitle={`${vaults.length} vaults`} />
            {refreshing ? <ChartShimmer height={300} /> : (
              <div key={refreshKey}><VaultTable vaults={vaults} type="V1" /></div>
            )}
          </ModuleCard>
        )}
        {tab === "v2" && (
          <ModuleCard>
            <SectionHeader title="Morpho V2 Vaults" subtitle={`${vaultsV2.length} vaults`} />
            {refreshing ? <ChartShimmer height={300} /> : (
              <div key={refreshKey}><VaultTable vaults={vaultsV2} type="V2" /></div>
            )}
          </ModuleCard>
        )}
      </div>

    </div>
  );
}

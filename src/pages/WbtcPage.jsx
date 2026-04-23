import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, AreaChart, Area, ComposedChart, Line, ReferenceLine,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useWbtcData } from "../hooks/useWbtcData";
import { useWbtcPoolsData } from "../hooks/useWbtcPoolsData";
import { useWbtcPegData } from "../hooks/useWbtcPegData";
import { fmt, fmtPct } from "../utils/format";
import { SectionHeader, LoadingSpinner, ModuleCard, ChartShimmer } from "../components/Shared";

const mono = "'JetBrains Mono', monospace";
const ACCENT = "#f7931a"; // Bitcoin orange

const TH = { padding: "8px 8px", textAlign: "left", fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 };
const TD = { padding: "8px 8px", fontSize: 13, fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.03)" };
const TD_NUM = { ...TD, textAlign: "right" };
const TD_DIM = { ...TD, color: "#94a3b8" };

const chartTooltipStyle = {
  contentStyle: { background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#e2e8f0" },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#e2e8f0" },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};

const CHAIN_COLORS = {
  Ethereum: "#627eea", Solana: "#9945ff", TRON: "#ff0013",
  Base: "#2563eb", Kava: "#ff564f", Osmosis: "#750bbb",
};
function getChainColor(name) { return CHAIN_COLORS[name] || "#6b7a8d"; }

function shortAddr(addr) {
  if (!addr) return "";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function explorerUrl(chain, address) {
  const url = {
    btc: `https://mempool.space/address/${address}`,
    Ethereum: `https://etherscan.io/address/${address}`,
    Base: `https://basescan.org/address/${address}`,
    Kava: `https://kavascan.com/address/${address}`,
  };
  return url[chain] || null;
}

function txUrl(chain, txHash) {
  const url = {
    Ethereum: `https://etherscan.io/tx/${txHash}`,
    Base: `https://basescan.org/tx/${txHash}`,
    Kava: `https://kavascan.com/tx/${txHash}`,
    Solana: `https://solscan.io/tx/${txHash}`,
    TRON: `https://tronscan.org/#/transaction/${txHash}`,
    Osmosis: `https://www.mintscan.io/osmosis/txs/${txHash}`,
  };
  return url[chain] || null;
}

// ─── Shared Pagination ───

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
      <button onClick={() => onPageChange(0)} disabled={page === 0} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page === 0 ? 0.3 : 1 }}>{"\u00AB"}</button>
      <button onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page === 0 ? 0.3 : 1 }}>{"\u2039"}</button>
      {(() => {
        const pages = [];
        let start = Math.max(0, page - 2);
        let end = Math.min(totalPages - 1, start + 4);
        start = Math.max(0, end - 4);
        if (start > 0) { pages.push(0); if (start > 1) pages.push("..."); }
        for (let i = start; i <= end; i++) pages.push(i);
        if (end < totalPages - 1) { if (end < totalPages - 2) pages.push("..."); pages.push(totalPages - 1); }
        return pages.map((p, idx) =>
          p === "..." ? (
            <span key={`dot-${idx}`} style={{ fontSize: 10, fontFamily: mono, color: "#4a5568", padding: "3px 2px" }}>{"\u2026"}</span>
          ) : (
            <button key={p} onClick={() => onPageChange(p)} style={{ background: p === page ? "rgba(247,147,26,0.15)" : "none", border: p === page ? "1px solid rgba(247,147,26,0.3)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: p === page ? ACCENT : "#94a3b8", cursor: "pointer", fontWeight: p === page ? 600 : 400, minWidth: 28, textAlign: "center" }}>{p + 1}</button>
          )
        );
      })()}
      <button onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page >= totalPages - 1 ? 0.3 : 1 }}>{"\u203A"}</button>
      <button onClick={() => onPageChange(totalPages - 1)} disabled={page >= totalPages - 1} style={{ background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: mono, color: "#94a3b8", cursor: "pointer", opacity: page >= totalPages - 1 ? 0.3 : 1 }}>{"\u00BB"}</button>
    </div>
  );
}

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

// ─── Supply by Chain Chart ───

function SupplyByChainChart({ chainSupplies }) {
  const { dominant, rest, total } = useMemo(() => {
    const all = chainSupplies
      .filter((c) => c.supply != null && c.supply > 0)
      .map((c) => ({ name: c.chain, supply: c.supply }))
      .sort((a, b) => b.supply - a.supply);
    const total = all.reduce((s, c) => s + c.supply, 0);
    return { dominant: all[0] || null, rest: all.slice(1), total };
  }, [chainSupplies]);

  if (!dominant) return null;

  const dominantPct = total > 0 ? (dominant.supply / total) * 100 : 0;
  const restTotal = total - dominant.supply;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 2fr", gap: 16, alignItems: "stretch" }}>
      {/* Dominant chain card */}
      <div style={{
        background: `linear-gradient(135deg, ${getChainColor(dominant.name)}12 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${getChainColor(dominant.name)}25`,
        borderRadius: 6,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: getChainColor(dominant.name), display: "inline-block" }} />
          <span style={{ fontSize: 12, color: "#cbd5e1", fontFamily: mono, fontWeight: 600 }}>{dominant.name}</span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, lineHeight: 1.1 }}>
          {dominant.supply.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>WBTC</span>
        </div>
        <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 6 }}>
          {dominantPct.toFixed(2)}% of total cross-chain supply
        </div>
      </div>

      {/* Zoomed bar chart for non-dominant chains */}
      <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 6, padding: "16px 18px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>
            Other chains (zoomed)
          </div>
          <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>
            {restTotal.toLocaleString(undefined, { maximumFractionDigits: 1 })} WBTC · {((restTotal / total) * 100).toFixed(2)}%
          </div>
        </div>
        {rest.length === 0 ? (
          <div style={{ color: "#6b7a8d", fontSize: 12, fontFamily: mono, padding: 12 }}>No other chains with supply</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, rest.length * 36)}>
            <BarChart data={rest} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
              <XAxis type="number" tickFormatter={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [`${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} WBTC`, "Supply"]}
                {...chartTooltipStyle}
              />
              <Bar dataKey="supply" radius={[0, 3, 3, 0]} maxBarSize={20}>
                {rest.map((d) => <Cell key={d.name} fill={getChainColor(d.name)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Custodian Addresses Table ───

function CustodianTable({ addresses }) {
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState("all");
  const [hideZero, setHideZero] = useState(false);
  const [sortKey, setSortKey] = useState("balance");
  const [sortDir, setSortDir] = useState("desc");
  const PAGE_SIZE = 10;

  const types = useMemo(() => {
    return Array.from(new Set(addresses.map((a) => a.type).filter(Boolean))).sort();
  }, [addresses]);

  const sorted = useMemo(() => {
    let list = addresses;
    if (typeFilter !== "all") list = list.filter((a) => a.type === typeFilter);
    if (hideZero) list = list.filter((a) => a.balance > 0);
    return [...list].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === "address" || sortKey === "type") {
        av = (av || "").toString();
        bv = (bv || "").toString();
        return sortDir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
      }
      av = av || 0;
      bv = bv || 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [addresses, typeFilter, hideZero, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(0);
  };
  const sortIcon = (key) => sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const nonZeroCount = addresses.filter((a) => a.balance > 0).length;

  if (!addresses.length) return <div style={{ color: "#6b7a8d", fontSize: 13, fontFamily: mono, padding: 16 }}>No custodian addresses</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>Type</span>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }} style={FILTER_STYLE}>
          <option value="all">All</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>
          <input type="checkbox" checked={hideZero} onChange={(e) => { setHideZero(e.target.checked); setPage(0); }} style={{ accentColor: ACCENT }} />
          Hide zero balances
        </label>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>{sorted.length} of {addresses.length} · {nonZeroCount} active</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...TH, cursor: "pointer" }} onClick={() => toggleSort("address")}>Address{sortIcon("address")}</th>
              <th style={{ ...TH, cursor: "pointer" }} onClick={() => toggleSort("type")}>Type{sortIcon("type")}</th>
              <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("balance")}>Balance (BTC){sortIcon("balance")}</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((a, i) => {
              const url = explorerUrl("btc", a.address);
              const isZero = !a.balance;
              return (
                <tr key={a.address || i}
                  onClick={() => url && window.open(url, "_blank")}
                  style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)", cursor: url ? "pointer" : "default", opacity: isZero ? 0.5 : 1 }}
                  onMouseEnter={(e) => url && (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                  onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)"}
                >
                  <td style={{ ...TD, color: "#cbd5e1" }}>{shortAddr(a.address)}</td>
                  <td style={TD_DIM}>{a.type}</td>
                  <td style={{ ...TD_NUM, color: isZero ? "#4a5568" : ACCENT }}>{(a.balance || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

// ─── Activity Feed ───

function ActivityFeed({ events }) {
  const [chainFilter, setChainFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [merchantFilter, setMerchantFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const PAGE_SIZE = 20;

  const chains = useMemo(() => Array.from(new Set(events.map((e) => e.chain))).sort(), [events]);
  const merchants = useMemo(() => Array.from(new Set(events.map((e) => e.merchant).filter(Boolean))).sort(), [events]);

  const filtered = useMemo(() => {
    let list = events;
    if (chainFilter !== "all") list = list.filter((e) => e.chain === chainFilter);
    if (typeFilter !== "all") list = list.filter((e) => e.type === typeFilter);
    if (merchantFilter !== "all") list = list.filter((e) => e.merchant === merchantFilter);
    return [...list].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === "date") {
        av = av ? new Date(av).getTime() : 0;
        bv = bv ? new Date(bv).getTime() : 0;
      } else if (sortKey === "type" || sortKey === "chain" || sortKey === "merchant") {
        av = (av || "").toString();
        bv = (bv || "").toString();
        return sortDir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
      } else {
        av = av || 0;
        bv = bv || 0;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [events, chainFilter, typeFilter, merchantFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(0);
  };
  const sortIcon = (key) => sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (!events.length) return <div style={{ color: "#6b7a8d", fontSize: 13, fontFamily: mono, padding: 16 }}>No recent events</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>Chain</span>
        <select value={chainFilter} onChange={(e) => { setChainFilter(e.target.value); setPage(0); }} style={FILTER_STYLE}>
          <option value="all">All</option>
          {chains.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>Type</span>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }} style={FILTER_STYLE}>
          <option value="all">All</option>
          <option value="mint">Mint</option>
          <option value="burn">Burn</option>
        </select>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>Merchant</span>
        <select value={merchantFilter} onChange={(e) => { setMerchantFilter(e.target.value); setPage(0); }} style={FILTER_STYLE}>
          <option value="all">All</option>
          {merchants.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>{filtered.length} events</span>
      </div>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...TH, cursor: "pointer" }} onClick={() => toggleSort("type")}>Type{sortIcon("type")}</th>
            <th style={{ ...TH, cursor: "pointer" }} onClick={() => toggleSort("chain")}>Chain{sortIcon("chain")}</th>
            <th style={{ ...TH, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("amount")}>Amount{sortIcon("amount")}</th>
            <th style={{ ...TH, cursor: "pointer" }} onClick={() => toggleSort("merchant")}>Merchant{sortIcon("merchant")}</th>
            <th style={{ ...TH, cursor: "pointer" }} onClick={() => toggleSort("date")}>Date{sortIcon("date")}</th>
            <th style={TH}>Tx</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((e, i) => {
            const url = e.txHash ? txUrl(e.chain, e.txHash) : null;
            const color = e.type === "mint" ? "#4ade80" : "#f87171";
            return (
              <tr key={(e.txHash || e.date) + i}
                onClick={() => url && window.open(url, "_blank")}
                style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)", cursor: url ? "pointer" : "default" }}
                onMouseEnter={(e2) => url && (e2.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={(e2) => e2.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)"}
              >
                <td style={{ ...TD, color, fontWeight: 600, textTransform: "uppercase" }}>{e.type}</td>
                <td style={TD}>{e.chain}</td>
                <td style={{ ...TD_NUM, color: ACCENT }}>{e.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td style={TD}>{e.merchant || "—"}</td>
                <td style={TD_DIM}>{e.date ? new Date(e.date).toLocaleDateString() : "—"}</td>
                <td style={{ ...TD, color: "#22d3ee" }}>{e.txHash ? shortAddr(e.txHash) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

// ─── Historical Supply Chart (BTC-denominated) ───

function HistoricalSupplyTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const net = (p.mints || 0) - (p.burns || 0);
  const netColor = net > 0 ? "#4ade80" : net < 0 ? "#f87171" : "#94a3b8";
  return (
    <div style={{ background: "#131926", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "10px 12px", fontSize: 11, fontFamily: mono, color: "#e2e8f0", minWidth: 200 }}>
      <div style={{ color: "#6b7a8d", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 14px", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: ACCENT }}>Supply</span>
        <span style={{ textAlign: "right", color: "#e2e8f0" }}>{(p.supply || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} BTC</span>
        {(p.mints > 0 || p.burns > 0) && (
          <>
            <span style={{ color: "#4ade80" }}>Minted</span>
            <span style={{ textAlign: "right", color: "#4ade80" }}>+{(p.mints || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span style={{ color: "#f87171" }}>Burned</span>
            <span style={{ textAlign: "right", color: "#f87171" }}>-{(p.burns || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span style={{ color: "#94a3b8" }}>Net</span>
            <span style={{ textAlign: "right", color: netColor, fontWeight: 600 }}>
              {net > 0 ? "+" : ""}{net.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function HistoricalSupplyChart({ historicalSupply, events, days }) {
  const data = useMemo(() => {
    const filtered = days === "all"
      ? historicalSupply || []
      : (historicalSupply || []).slice(-days);

    // Aggregate mint/burn events by UTC day
    const DAY_MS = 86400 * 1000;
    const flowsByDay = new Map();
    for (const e of events || []) {
      if (!e.date || (e.type !== "mint" && e.type !== "burn")) continue;
      const ts = new Date(e.date).getTime();
      if (!Number.isFinite(ts)) continue;
      const dayKey = new Date(Math.floor(ts / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
      const bucket = flowsByDay.get(dayKey) || { mints: 0, burns: 0 };
      if (e.type === "mint") bucket.mints += e.amount || 0;
      else bucket.burns += e.amount || 0;
      flowsByDay.set(dayKey, bucket);
    }

    return filtered.map((d) => {
      const dayKey = new Date(d.date * 1000).toISOString().slice(0, 10);
      const flows = flowsByDay.get(dayKey) || { mints: 0, burns: 0 };
      return {
        date: dayKey,
        supply: d.value,
        mints: flows.mints,
        burnsNeg: -flows.burns, // negative so it renders below zero on the flow axis
        burns: flows.burns,
      };
    });
  }, [historicalSupply, events, days]);

  if (!data.length) return <div style={{ color: "#6b7a8d", fontSize: 13, fontFamily: mono, padding: 16 }}>No historical data</div>;

  // Right Y-axis bounds (daily flows): make symmetric around zero so mint/burn scales match
  const maxFlow = Math.max(
    ...data.map((d) => Math.max(d.mints || 0, d.burns || 0)),
    1
  );
  const flowDomain = [-maxFlow * 1.1, maxFlow * 1.1];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ left: 10, right: 20, top: 8, bottom: 5 }}>
        <defs>
          <linearGradient id="wbtcSupplyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
          axisLine={false}
          tickLine={false}
          interval={Math.floor(data.length / 6)}
          tickFormatter={(v) => v.slice(5)}
        />
        <YAxis
          yAxisId="supply"
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0))}
          tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <YAxis
          yAxisId="flow"
          orientation="right"
          domain={flowDomain}
          tickFormatter={(v) => (v === 0 ? "0" : `${v > 0 ? "+" : ""}${v.toFixed(0)}`)}
          tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <ReferenceLine y={0} yAxisId="flow" stroke="rgba(148,163,184,0.25)" strokeWidth={1} />
        <Tooltip content={<HistoricalSupplyTooltip />} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }} />
        <Bar yAxisId="flow" dataKey="mints" fill="#4ade80" fillOpacity={0.75} isAnimationActive={false} />
        <Bar yAxisId="flow" dataKey="burnsNeg" fill="#f87171" fillOpacity={0.75} isAnimationActive={false} />
        <Area yAxisId="supply" type="monotone" dataKey="supply" stroke={ACCENT} fill="url(#wbtcSupplyGrad)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── Net Flow Card ───

function NetFlowCard({ events, days, periodLabel }) {
  const stats = useMemo(() => {
    const cutoff = days === "all" ? 0 : Date.now() - days * 86400 * 1000;
    let mints = 0, burns = 0, mintCount = 0, burnCount = 0;
    for (const e of events) {
      if (!e.date) continue;
      const ts = new Date(e.date).getTime();
      if (ts < cutoff) continue;
      if (e.type === "mint") { mints += e.amount; mintCount++; }
      else if (e.type === "burn") { burns += e.amount; burnCount++; }
    }
    return { mints, burns, mintCount, burnCount, net: mints - burns };
  }, [events, days]);

  const isPositive = stats.net >= 0;
  const netColor = isPositive ? "#4ade80" : "#f87171";

  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "16px 20px", height: "100%", boxSizing: "border-box" }}>
      <div style={{ fontSize: 11, color: ACCENT, fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 }}>{periodLabel} Net Flow</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: netColor, fontFamily: mono }}>
          {isPositive ? "+" : ""}{stats.net.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span style={{ fontSize: 14, color: "#94a3b8" }}>BTC</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 11, fontFamily: mono, marginTop: 6, flexWrap: "wrap" }}>
        <span style={{ color: "#4ade80" }}>+{stats.mints.toLocaleString(undefined, { maximumFractionDigits: 1 })} minted</span>
        <span style={{ color: "#f87171" }}>-{stats.burns.toLocaleString(undefined, { maximumFractionDigits: 1 })} burned</span>
        <span style={{ color: "#6b7a8d" }}>{stats.mintCount + stats.burnCount} txs</span>
      </div>
    </div>
  );
}

// ─── Active Merchants Card ───

function ActiveMerchantsCard({ events, days, periodLabel }) {
  const stats = useMemo(() => {
    const cutoff = days === "all" ? 0 : Date.now() - days * 86400 * 1000;
    const mintMerchants = new Set();
    const burnMerchants = new Set();
    for (const e of events) {
      if (!e.date || !e.merchant) continue;
      if (new Date(e.date).getTime() < cutoff) continue;
      if (e.type === "mint") mintMerchants.add(e.merchant);
      else if (e.type === "burn") burnMerchants.add(e.merchant);
    }
    const all = new Set([...mintMerchants, ...burnMerchants]);
    return { total: all.size, minters: mintMerchants.size, burners: burnMerchants.size };
  }, [events, days]);

  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "16px 20px", height: "100%", boxSizing: "border-box" }}>
      <div style={{ fontSize: 11, color: ACCENT, fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 }}>{periodLabel} Active Merchants</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 6 }}>
        {stats.total}
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 11, fontFamily: mono, marginTop: 6, flexWrap: "wrap" }}>
        <span style={{ color: "#4ade80" }}>{stats.minters} minting</span>
        <span style={{ color: "#f87171" }}>{stats.burners} burning</span>
      </div>
    </div>
  );
}

// ─── ATH Supply Card ───

function AthSupplyCard({ historicalSupply, currentSupply }) {
  const stats = useMemo(() => {
    if (!historicalSupply?.length) return null;
    let ath = 0, athDate = null;
    for (const p of historicalSupply) {
      if (p.value > ath) { ath = p.value; athDate = p.date; }
    }
    return {
      ath,
      athDate,
      pctOfAth: ath > 0 ? (currentSupply / ath) * 100 : null,
      drawdown: ath > 0 ? ((currentSupply - ath) / ath) * 100 : null,
    };
  }, [historicalSupply, currentSupply]);

  if (!stats) return null;
  const ddColor = stats.drawdown >= -10 ? "#4ade80" : stats.drawdown >= -40 ? "#fbbf24" : "#f87171";
  const athDateStr = stats.athDate ? new Date(stats.athDate * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—";

  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "16px 20px", height: "100%", boxSizing: "border-box" }}>
      <div style={{ fontSize: 11, color: ACCENT, fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 }}>% of All-Time High</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", fontFamily: mono }}>
          {stats.pctOfAth.toFixed(1)}<span style={{ fontSize: 14, color: "#94a3b8" }}>%</span>
        </div>
        <div style={{ fontSize: 12, color: ddColor, fontFamily: mono }}>
          {stats.drawdown >= 0 ? "+" : ""}{stats.drawdown.toFixed(1)}%
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 6 }}>
        ATH {stats.ath.toLocaleString(undefined, { maximumFractionDigits: 0 })} BTC · {athDateStr}
      </div>
    </div>
  );
}

// ─── Top Merchants Bar Chart ───

function MerchantsBarChart({ events }) {
  const [periodDays, setPeriodDays] = useState(90);
  const [metric, setMetric] = useState("total"); // "total" | "net" | "mints" | "burns"

  const merchants = useMemo(() => {
    const cutoff = Date.now() - periodDays * 86400 * 1000;
    const map = {};
    for (const e of events) {
      if (!e.merchant) continue;
      if (e.date && new Date(e.date).getTime() < cutoff) continue;
      const m = map[e.merchant] || { merchant: e.merchant, mints: 0, burns: 0, mintCount: 0, burnCount: 0 };
      if (e.type === "mint") { m.mints += e.amount; m.mintCount++; }
      else if (e.type === "burn") { m.burns += e.amount; m.burnCount++; }
      map[e.merchant] = m;
    }
    return Object.values(map).map((m) => ({
      ...m,
      total: m.mints + m.burns,
      net: m.mints - m.burns,
      txs: m.mintCount + m.burnCount,
    }));
  }, [events, periodDays]);

  const sorted = useMemo(() => {
    const sortBy = (m) => metric === "net" ? Math.abs(m.net) : m[metric];
    // Add an absolute version of net for the bar so negative bars don't flip the chart
    return [...merchants]
      .sort((a, b) => sortBy(b) - sortBy(a))
      .slice(0, 12)
      .map((m) => ({ ...m, netAbs: Math.abs(m.net) }));
  }, [merchants, metric]);

  if (!merchants.length) return <div style={{ color: "#6b7a8d", fontSize: 13, fontFamily: mono, padding: 16 }}>No merchant data</div>;

  const METRIC_LABEL = { total: "Total Volume", net: "Net Flow", mints: "Minted", burns: "Burned" };
  const METRIC_COLOR = { total: ACCENT, mints: "#4ade80", burns: "#f87171" };

  // For stacked: show mints (green) + burns (red) bars
  const isStacked = metric === "total";

  // Chart height scales with number of merchants
  const chartHeight = Math.max(220, sorted.length * 28 + 40);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 3 }}>
          {[30, 90, 180, 365].map((d) => (
            <button key={d} onClick={() => setPeriodDays(d)} style={{
              background: periodDays === d ? "rgba(247,147,26,0.15)" : "rgba(255,255,255,0.04)",
              border: periodDays === d ? "1px solid rgba(247,147,26,0.3)" : "1px solid rgba(255,255,255,0.06)",
              borderRadius: 3, padding: "3px 10px", fontSize: 10, fontFamily: mono,
              color: periodDays === d ? ACCENT : "#6b7a8d", cursor: "pointer", letterSpacing: 0.5,
            }}>{d}D</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {Object.keys(METRIC_LABEL).map((m) => (
            <button key={m} onClick={() => setMetric(m)} style={{
              background: metric === m ? "rgba(255,255,255,0.07)" : "transparent",
              border: metric === m ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
              borderRadius: 3, padding: "3px 10px", fontSize: 10, fontFamily: mono,
              color: metric === m ? "#e2e8f0" : "#6b7a8d", cursor: "pointer", letterSpacing: 0.5,
            }}>{METRIC_LABEL[m]}</button>
          ))}
        </div>
        <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, marginLeft: "auto" }}>{merchants.length} merchants · top {sorted.length} shown</span>
      </div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={sorted} layout="vertical" margin={{ left: 10, right: 40, top: 5, bottom: 5 }}>
          <XAxis type="number" tickFormatter={(v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="merchant" width={130} tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} />
          <Tooltip
            {...chartTooltipStyle}
            formatter={(v, name, item) => {
              if (name === "mints") return [`${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} BTC`, "Minted"];
              if (name === "burns") return [`${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} BTC`, "Burned"];
              if (metric === "net") {
                const signed = item?.payload?.net ?? v;
                return [`${signed >= 0 ? "+" : ""}${signed.toLocaleString(undefined, { maximumFractionDigits: 1 })} BTC`, "Net Flow"];
              }
              return [`${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} BTC`, METRIC_LABEL[metric]];
            }}
          />
          {isStacked ? (
            <>
              <Bar dataKey="mints" stackId="vol" fill="#4ade80" radius={[0, 0, 0, 0]} maxBarSize={18} />
              <Bar dataKey="burns" stackId="vol" fill="#f87171" radius={[0, 3, 3, 0]} maxBarSize={18} />
            </>
          ) : (
            <Bar dataKey={metric === "net" ? "netAbs" : metric} radius={[0, 3, 3, 0]} maxBarSize={18}>
              {sorted.map((m) => {
                const color = metric === "net"
                  ? (m.net >= 0 ? "#4ade80" : "#f87171")
                  : METRIC_COLOR[metric];
                return <Cell key={m.merchant} fill={color} />;
              })}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Page ───

// ─── BTC Derivative Pool Health ───

const RISK_COLOR = { green: "#4ade80", yellow: "#fbbf24", red: "#f87171" };
const RISK_LABEL = { green: "Healthy", yellow: "Mild flight", red: "Active flight" };

// Per-token color palette for composition bars
const TOKEN_COLORS = {
  WBTC: "#f7931a",
  cbBTC: "#2563eb",
  tBTC: "#ec4899",
  tBTCv2: "#ec4899",
  LBTC: "#facc15",
  uniBTC: "#22d3ee",
  hemiBTC: "#a855f7",
  FBTC: "#10b981",
  sBTC: "#94a3b8",
  eBTC: "#fb923c",
  solvBTC: "#dc2626",
};
function tokenColor(sym) { return TOKEN_COLORS[sym] || "#6b7a8d"; }

function fmtUsd(n) {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function PoolCompositionCard({ pool }) {
  const riskColor = RISK_COLOR[pool.risk] || "#6b7a8d";
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [hovering, setHovering] = useState(false);

  const handleClick = () => {
    if (pool.url) window.open(pool.url, "_blank", "noopener,noreferrer");
  };

  // Compute midpoint x% for tooltip positioning
  const midpointPct = (idx) => {
    let start = 0;
    for (let i = 0; i < idx; i++) start += pool.composition[i].share;
    return start + pool.composition[idx].share / 2;
  };

  const hovered = hoveredIdx != null ? pool.composition[hoveredIdx] : null;

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => { setHovering(false); setHoveredIdx(null); }}
      style={{
        background: hovering ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.025)",
        border: `1px solid ${hovering ? `${riskColor}60` : `${riskColor}30`}`,
        borderRadius: 6,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        cursor: pool.url ? "pointer" : "default",
        transition: "background 0.15s, border-color 0.15s",
        position: "relative",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 12, fontFamily: mono, color: "#e2e8f0", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          {pool.label}
          {pool.url && hovering && (
            <span style={{ fontSize: 10, color: "#6b7a8d", fontWeight: 400 }}>↗</span>
          )}
        </div>
        <div style={{ fontSize: 10, fontFamily: mono, color: "#6b7a8d" }}>
          {pool.venue} · {fmtUsd(pool.tvlUsd)}
        </div>
      </div>

      {/* Composition bar + tooltip */}
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", height: 22, borderRadius: 4, overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
          {pool.composition.map((c, i) => (
            <div
              key={c.symbol}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{
                width: `${c.share}%`,
                background: tokenColor(c.symbol),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontFamily: mono,
                color: "#0a0e17",
                fontWeight: 600,
                overflow: "hidden",
                whiteSpace: "nowrap",
                opacity: hoveredIdx == null || hoveredIdx === i ? 1 : 0.5,
                transition: "opacity 0.12s",
                cursor: "pointer",
              }}
            >
              {c.share >= 12 ? `${c.symbol} ${c.share.toFixed(0)}%` : ""}
            </div>
          ))}
        </div>
        {/* Hover tooltip */}
        {hovered && (
          <div
            style={{
              position: "absolute",
              top: 30,
              left: `${midpointPct(hoveredIdx)}%`,
              transform: "translateX(-50%)",
              background: "#131926",
              border: `1px solid ${tokenColor(hovered.symbol)}40`,
              borderRadius: 5,
              padding: "8px 11px",
              fontSize: 10,
              fontFamily: mono,
              color: "#e2e8f0",
              whiteSpace: "nowrap",
              zIndex: 20,
              boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
              pointerEvents: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: tokenColor(hovered.symbol), display: "inline-block" }} />
              <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{hovered.symbol}</span>
              <span style={{ color: "#6b7a8d" }}>· {hovered.share.toFixed(2)}%</span>
            </div>
            <div style={{ color: "#94a3b8" }}>
              {hovered.balance.toLocaleString(undefined, { maximumFractionDigits: hovered.balance >= 1 ? 2 : 6 })} {hovered.symbol}
            </div>
            <div style={{ color: "#94a3b8" }}>{fmtUsd(hovered.balanceUsd)}</div>
          </div>
        )}
        {/* Legend below bar for tiny segments */}
        <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 10, fontFamily: mono, color: "#94a3b8", flexWrap: "wrap" }}>
          {pool.composition.map((c) => (
            <span key={c.symbol} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: tokenColor(c.symbol), display: "inline-block" }} />
              {c.symbol} {c.share.toFixed(1)}%
            </span>
          ))}
        </div>
      </div>

      {/* Footer: implied ratio(s) + risk indicator */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.04)", gap: 8 }}>
        <div style={{ fontSize: 11, fontFamily: mono, color: "#94a3b8", display: "flex", flexDirection: "column", gap: 2 }}>
          {(pool.impliedRatios || []).length > 0 ? (
            pool.impliedRatios.map((r) => {
              const bp = (r.ratio - 1) * 10000;
              const bpColor = Math.abs(bp) < 1 ? "#cbd5e1" : bp < 0 ? "#f87171" : "#4ade80";
              return (
                <div key={r.symbol}>
                  1 WBTC = <span style={{ color: bpColor }}>{r.ratio.toFixed(4)}</span> {r.symbol}
                  {Math.abs(bp) >= 1 && (
                    <span style={{ color: bpColor, marginLeft: 6 }}>
                      ({bp >= 0 ? "+" : ""}{bp.toFixed(0)} bp)
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <span style={{ color: "#6b7a8d" }}>{pool.nCoins}-asset pool</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: riskColor, display: "inline-block" }} />
          <span style={{ fontSize: 10, fontFamily: mono, color: riskColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {RISK_LABEL[pool.risk]}
          </span>
        </div>
      </div>
    </div>
  );
}

function BtcDerivativePoolHealth({ pools, summary }) {
  if (!pools?.length) {
    return <div style={{ color: "#6b7a8d", fontSize: 13, fontFamily: mono, padding: 16 }}>No pool data available</div>;
  }
  const aggColor = summary ? RISK_COLOR[summary.weightedRisk] : "#6b7a8d";
  return (
    <div>
      {/* Summary strip */}
      {summary && (
        <div style={{
          display: "flex",
          gap: 18,
          padding: "10px 14px",
          background: "rgba(255,255,255,0.015)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 6,
          marginBottom: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Avg WBTC Share (Curve)</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: aggColor, fontFamily: mono, marginTop: 2 }}>
              {summary.weightedWbtcShare.toFixed(1)}%
              <span style={{ fontSize: 10, color: aggColor, fontWeight: 500, marginLeft: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {RISK_LABEL[summary.weightedRisk]}
              </span>
            </div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.04)" }} />
          <div>
            <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Tracked TVL</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 2 }}>
              {fmtUsd(summary.totalTvl)}
            </div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.04)" }} />
          <div>
            <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Pools</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 2 }}>
              {summary.count}
            </div>
          </div>
          {summary.mostImbalanced && (
            <>
              <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.04)" }} />
              <div>
                <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Most Imbalanced</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: RISK_COLOR[summary.mostImbalanced.risk], fontFamily: mono, marginTop: 2 }}>
                  {summary.mostImbalanced.label.replace(/\s*\([^)]*\)\s*/g, "")}
                  <span style={{ fontSize: 10, color: RISK_COLOR[summary.mostImbalanced.risk], fontWeight: 500, marginLeft: 6, letterSpacing: 0.5 }}>
                    {summary.mostImbalanced.wbtcShare.toFixed(0)}% WBTC
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Pool composition cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        {pools
          .slice()
          .sort((a, b) => b.tvlUsd - a.tvlUsd)
          .map((p) => <PoolCompositionCard key={p.address} pool={p} />)}
      </div>
    </div>
  );
}

// ─── WBTC / cbBTC Peg Chart ───

function PegTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const date = new Date(d.date * 1000);
  const dateStr = date.toISOString().slice(0, 10);
  const drift = d.drift_bps;
  const worst = d.worstIntraday_bps;
  const driftColor = Math.abs(drift) < 15 ? "#4ade80" : Math.abs(drift) < 50 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ background: "#131926", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "10px 12px", fontSize: 11, fontFamily: mono, color: "#e2e8f0", minWidth: 220 }}>
      <div style={{ color: "#6b7a8d", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{dateStr}</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 14px", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: "#94a3b8" }}>Close</span>
        <span style={{ textAlign: "right", color: "#e2e8f0" }}>{d.close.toFixed(6)}</span>
        <span style={{ color: "#94a3b8" }}>High</span>
        <span style={{ textAlign: "right", color: "#94a3b8" }}>{d.high.toFixed(6)}</span>
        <span style={{ color: "#94a3b8" }}>Low</span>
        <span style={{ textAlign: "right", color: "#94a3b8" }}>{d.low.toFixed(6)}</span>
        <span style={{ color: "#94a3b8" }}>Drift (close)</span>
        <span style={{ textAlign: "right", color: driftColor, fontWeight: 600 }}>
          {drift > 0 ? "+" : ""}{drift.toFixed(1)} bps
        </span>
        <span style={{ color: "#94a3b8" }}>Intraday worst</span>
        <span style={{ textAlign: "right", color: "#94a3b8" }}>
          {worst > 0 ? "+" : ""}{worst.toFixed(1)} bps
        </span>
        {Number.isFinite(d.volumeUsd) && d.volumeUsd > 0 && (
          <>
            <span style={{ color: "#94a3b8" }}>Volume</span>
            <span style={{ textAlign: "right", color: "#94a3b8" }}>{fmtUsd(d.volumeUsd)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function PegChart({ history, summary, pools }) {
  if (!history || history.length === 0) {
    return (
      <div style={{ padding: "30px 0", color: "#6b7a8d", fontSize: 12, fontFamily: mono, textAlign: "center" }}>
        No peg data available.
      </div>
    );
  }

  // Transform for Recharts: each datum gets a `range: [low, high]` for the range bar
  const data = history.map((h) => ({
    ...h,
    range: [h.low, h.high],
  }));

  // Compute y-axis bounds with a small padding so bars don't hit the edge
  const allLows = history.map((h) => h.low);
  const allHighs = history.map((h) => h.high);
  const dataMin = Math.min(...allLows);
  const dataMax = Math.max(...allHighs);
  // Ensure peg (1.0) is always visible in the axis range
  const yLo = Math.min(dataMin, 1) - 0.0005;
  const yHi = Math.max(dataMax, 1) + 0.0005;

  const driftColor = summary?.latestDriftBps == null ? "#6b7a8d"
    : Math.abs(summary.latestDriftBps) < 15 ? "#4ade80"
    : Math.abs(summary.latestDriftBps) < 50 ? "#fbbf24" : "#f87171";

  const formatDate = (ts) => {
    const dt = new Date(ts * 1000);
    return dt.toISOString().slice(5, 10); // "MM-DD"
  };

  return (
    <div>
      {/* Summary strip */}
      {summary && (() => {
        // Find the days matching the window extremes so we can show them in tooltips.
        const minDriftDay = history.reduce((best, h) => (best == null || h.drift_bps < best.drift_bps) ? h : best, null);
        const maxDriftDay = history.reduce((best, h) => (best == null || h.drift_bps > best.drift_bps) ? h : best, null);
        const worstIntradayDay = history.reduce((best, h) => (best == null || h.worstIntraday_bps < best.worstIntraday_bps) ? h : best, null);
        const fmtDay = (ts) => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : "";
        return (
          <div style={{ display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, marginBottom: 14 }}>
            <StatWithTooltip
              label="Latest Rate"
              primary={summary.latestRate.toFixed(6)}
              suffix={`${summary.latestDriftBps > 0 ? "+" : ""}${summary.latestDriftBps.toFixed(1)} bps`}
              suffixColor={driftColor}
              tooltipRows={[
                ["Date", fmtDay(summary.latestDate)],
                ["Close", summary.latestRate.toFixed(6)],
                ["Drift", `${summary.latestDriftBps > 0 ? "+" : ""}${summary.latestDriftBps.toFixed(1)} bps`],
              ]}
            />
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.04)" }} />
            <StatWithTooltip
              label="Window Low"
              primary={`${summary.minDriftBps.toFixed(1)} bps`}
              primaryColor="#f87171"
              tooltipRows={minDriftDay ? [
                ["Date", fmtDay(minDriftDay.date)],
                ["Close", minDriftDay.close.toFixed(6)],
                ["Drift", `${minDriftDay.drift_bps.toFixed(1)} bps`],
              ] : []}
            />
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.04)" }} />
            <StatWithTooltip
              label="Window High"
              primary={`${summary.maxDriftBps > 0 ? "+" : ""}${summary.maxDriftBps.toFixed(1)} bps`}
              primaryColor="#4ade80"
              tooltipRows={maxDriftDay ? [
                ["Date", fmtDay(maxDriftDay.date)],
                ["Close", maxDriftDay.close.toFixed(6)],
                ["Drift", `${maxDriftDay.drift_bps > 0 ? "+" : ""}${maxDriftDay.drift_bps.toFixed(1)} bps`],
              ] : []}
            />
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.04)" }} />
            <StatWithTooltip
              label="Worst Intraday"
              primary={`${summary.minIntradayBps.toFixed(1)} bps`}
              primaryColor="#f87171"
              tooltipRows={worstIntradayDay ? [
                ["Date", fmtDay(worstIntradayDay.date)],
                ["Intraday low", worstIntradayDay.low.toFixed(6)],
                ["That day's close", worstIntradayDay.close.toFixed(6)],
                ["Recovered by", `${(worstIntradayDay.drift_bps - worstIntradayDay.worstIntraday_bps).toFixed(1)} bps`],
              ] : []}
            />
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.04)" }} />
            <TrackedTvlStat summary={summary} pools={pools} />
          </div>
        );
      })()}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: 12, bottom: 10 }}>
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="#4a5568"
            tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: mono }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
            minTickGap={40}
          />
          <YAxis
            domain={[yLo, yHi]}
            tickFormatter={(v) => v.toFixed(4)}
            stroke="#4a5568"
            tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: mono }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
            width={62}
          />
          <Tooltip
            content={<PegTooltip />}
            cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
          />
          <ReferenceLine
            y={1}
            stroke="rgba(148,163,184,0.5)"
            strokeDasharray="4 4"
            label={{ value: "Peg 1.0000", fill: "#94a3b8", fontSize: 9, fontFamily: mono, position: "insideTopRight" }}
          />
          <Bar
            dataKey="range"
            fill={ACCENT}
            fillOpacity={0.22}
            isAnimationActive={false}
            barSize={6}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke={ACCENT}
            strokeWidth={1.6}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

    </div>
  );
}

function StatWithTooltip({ label, primary, primaryColor = "#e2e8f0", suffix, suffixColor, tooltipRows = [] }) {
  const [hover, setHover] = useState(false);
  const hasTooltip = tooltipRows.length > 0;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "relative", cursor: hasTooltip ? "help" : "default" }}
    >
      <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: primaryColor, fontFamily: mono, marginTop: 2 }}>
        <span style={hasTooltip ? { borderBottom: "1px dotted rgba(148,163,184,0.4)" } : {}}>
          {primary}
        </span>
        {suffix && (
          <span style={{ fontSize: 10, color: suffixColor || primaryColor, fontWeight: 500, marginLeft: 6, letterSpacing: 0.5 }}>
            {suffix}
          </span>
        )}
      </div>
      {hasTooltip && hover && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          left: 0,
          background: "#131926",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          padding: "10px 12px",
          zIndex: 30,
          minWidth: 200,
          boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
          fontSize: 10,
          fontFamily: mono,
          color: "#94a3b8",
          whiteSpace: "nowrap",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 14px", fontVariantNumeric: "tabular-nums" }}>
            {tooltipRows.map(([k, v]) => (
              <React.Fragment key={k}>
                <span style={{ color: "#6b7a8d" }}>{k}</span>
                <span style={{ textAlign: "right", color: "#e2e8f0" }}>{v}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrackedTvlStat({ summary, pools }) {
  const [hover, setHover] = useState(false);
  const totalTvl = (pools || []).reduce((s, p) => s + (p.tvl || 0), 0);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "relative", cursor: "help" }}
    >
      <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Tracked TVL</div>
      <div style={{
        fontSize: 18, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 2,
        borderBottom: "1px dotted rgba(148,163,184,0.4)",
        display: "inline-block",
      }}>
        {fmtUsd(summary.totalTvl)}
      </div>
      {hover && pools && pools.length > 0 && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          left: 0,
          background: "#131926",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          padding: "10px 12px",
          zIndex: 30,
          minWidth: 260,
          boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
          fontSize: 10,
          fontFamily: mono,
          color: "#94a3b8",
        }}>
          <div style={{ textTransform: "uppercase", letterSpacing: 1, color: "#6b7a8d", marginBottom: 8 }}>TVL Weights</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...pools].sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).map((p) => {
              const weight = totalTvl > 0 ? ((p.tvl || 0) / totalTvl) * 100 : 0;
              return (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#e2e8f0" }}>{p.label}</span>
                  <span>
                    <span style={{ color: "#94a3b8" }}>{fmtUsd(p.tvl)}</span>
                    <span style={{ color: "#6b7a8d", marginLeft: 6 }}>{weight.toFixed(0)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const TIMEFRAMES = [
  { key: 30, label: "30D" },
  { key: 90, label: "90D" },
  { key: 365, label: "1Y" },
  { key: "all", label: "All-Time" },
];

export default function WbtcPage() {
  const { summary, chainSupplies, custodianAddresses, recentEvents, historicalSupply, loading, refreshing, refreshKey, error, lastUpdated, refresh } = useWbtcData();
  const { pools: btcPools, summary: poolsSummary, refreshing: poolsRefreshing, refreshKey: poolsRefreshKey, refresh: refreshPools } = useWbtcPoolsData();
  const feedEvents = recentEvents || [];
  const [period, setPeriod] = useState(30);
  const periodLabel = TIMEFRAMES.find((t) => t.key === period)?.label || "";
  const { pools: pegPools, history: pegHistory, summary: pegSummary, loading: pegLoading, refreshing: pegRefreshing, refreshKey: pegRefreshKey, refresh: refreshPeg } = useWbtcPegData(period);

  if (error) {
    return (
      <div style={{ background: "#0a0e17", color: "#f87171", padding: 40, fontFamily: mono, textAlign: "center", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Failed to load WBTC data</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>{error}</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: "#0a0e17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner message="Pulling data from wbtc.network + chain RPCs..." />
      </div>
    );
  }

  const totalSupply = summary?.totalSupply || 0;
  const totalReserves = summary?.totalBtcReserves || summary?.wbtcNetworkHoldings || 0;
  const reserveRatio = summary?.reserveRatio;

  const reserveColor = reserveRatio == null ? "#94a3b8" : reserveRatio >= 100 ? "#4ade80" : reserveRatio >= 99 ? "#fbbf24" : "#f87171";

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
              WBTC
              <span style={{ color: ACCENT, marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: mono, verticalAlign: "middle", background: "rgba(247,147,26,0.07)", padding: "2px 7px", borderRadius: 3, letterSpacing: 1 }}>
                TRANSPARENCY
              </span>
            </h1>
            <div style={{ fontSize: 12, color: "#4f5e6f", marginTop: 2, fontFamily: mono }}>
              Cross-chain supply + BTC reserve tracking · Data from wbtc.network and chain RPCs
              {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            </div>
          </div>
          <button
            onClick={() => { refresh(); refreshPools(); refreshPeg(); }}
            disabled={refreshing || poolsRefreshing || pegRefreshing}
            style={{
              background: (refreshing || poolsRefreshing || pegRefreshing) ? "rgba(247,147,26,0.15)" : "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 11,
              fontFamily: mono,
              color: (refreshing || poolsRefreshing || pegRefreshing) ? ACCENT : "#94a3b8",
              cursor: (refreshing || poolsRefreshing || pegRefreshing) ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s",
              letterSpacing: 0.5,
            }}
          >
            <span style={{ display: "inline-block", animation: (refreshing || poolsRefreshing) ? "spin 1s linear infinite" : "none", fontSize: 13 }}>&#x21bb;</span>
            {(refreshing || poolsRefreshing) ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Hero: Reserve Ratio + Supply + Reserves */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14 }}>
          <div style={{ background: "rgba(247,147,26,0.06)", border: "1px solid rgba(247,147,26,0.15)", borderRadius: 6, padding: "20px 24px", position: "relative", overflow: "hidden" }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(247,147,26,0.08) 40%, rgba(247,147,26,0.12) 50%, rgba(247,147,26,0.08) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: ACCENT, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Total WBTC Supply</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 4 }}>{totalSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>across {chainSupplies.filter((c) => c.supply > 0).length} chains</div>
          </div>
          <div style={{ background: "rgba(247,147,26,0.06)", border: "1px solid rgba(247,147,26,0.15)", borderRadius: 6, padding: "20px 24px", position: "relative", overflow: "hidden" }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(247,147,26,0.08) 40%, rgba(247,147,26,0.12) 50%, rgba(247,147,26,0.08) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: ACCENT, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>BTC Reserves</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", fontFamily: mono, marginTop: 4 }}>{totalReserves.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>{custodianAddresses.filter((a) => a.balance > 0).length} active of {custodianAddresses.length} addresses</div>
          </div>
          <div style={{ background: reserveColor === "#4ade80" ? "rgba(74,222,128,0.06)" : "rgba(247,147,26,0.06)", border: `1px solid ${reserveColor}25`, borderRadius: 6, padding: "20px 24px", position: "relative", overflow: "hidden" }}>
            {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />}
            <div style={{ fontSize: 11, color: reserveColor, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" }}>Reserve Ratio</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: reserveColor, fontFamily: mono, marginTop: 4 }}>{reserveRatio != null ? `${reserveRatio.toFixed(2)}%` : "—"}</div>
            <div style={{ fontSize: 11, color: "#6b7a8d", fontFamily: mono, marginTop: 2 }}>reserves / supply · ≥100% = fully backed</div>
          </div>
        </div>
      </div>

      {/* Period toggle — controls cards below + historical chart */}
      <div style={{ padding: "14px 26px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TIMEFRAMES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            style={{
              background: period === key ? "rgba(247,147,26,0.12)" : "rgba(255,255,255,0.025)",
              border: period === key ? "1px solid rgba(247,147,26,0.3)" : "1px solid rgba(255,255,255,0.05)",
              borderRadius: 5, padding: "6px 14px", fontSize: 10, fontFamily: mono,
              color: period === key ? ACCENT : "#6b7a8d",
              cursor: "pointer", letterSpacing: 0.5, fontWeight: period === key ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Period-dependent cards */}
      <div style={{ padding: "10px 26px 0" }}>
        {refreshing ? <ChartShimmer height={90} /> : (
          <div key={refreshKey} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <NetFlowCard events={feedEvents} days={period} periodLabel={periodLabel} />
            <ActiveMerchantsCard events={feedEvents} days={period} periodLabel={periodLabel} />
            <AthSupplyCard historicalSupply={historicalSupply} currentSupply={totalSupply} />
          </div>
        )}
      </div>

      {/* Charts */}
      <div style={{ padding: "20px 26px 0", display: "flex", flexDirection: "column", gap: 16 }}>
        <ModuleCard>
          <SectionHeader title="Historical WBTC Supply" subtitle="Cumulative supply with daily mint / burn activity" />
          {refreshing ? <ChartShimmer height={300} /> : (
            <div key={refreshKey}><HistoricalSupplyChart historicalSupply={historicalSupply} events={feedEvents} days={period} /></div>
          )}
        </ModuleCard>

        <ModuleCard>
          <SectionHeader title="WBTC Supply by Chain" subtitle="Natively minted supply on each chain (excludes bridged balances)" />
          {refreshing ? <ChartShimmer height={280} /> : (
            <div key={refreshKey}><SupplyByChainChart chainSupplies={chainSupplies} /></div>
          )}
        </ModuleCard>

        <ModuleCard>
          <SectionHeader title="WBTC / cbBTC Peg" subtitle="TVL-weighted rate across major pools" />
          {(pegRefreshing || pegLoading) ? <ChartShimmer height={340} /> : (
            <div key={pegRefreshKey}><PegChart history={pegHistory} summary={pegSummary} pools={pegPools} /></div>
          )}
        </ModuleCard>

        <ModuleCard>
          <SectionHeader title="WBTC Pool Health" subtitle="WBTC composition in DEX pools" />
          {poolsRefreshing ? <ChartShimmer height={280} /> : (
            <div key={poolsRefreshKey}><BtcDerivativePoolHealth pools={btcPools} summary={poolsSummary} /></div>
          )}
        </ModuleCard>

        <ModuleCard>
          <SectionHeader title="Top Merchants" subtitle="Mint and burn activity by merchant" />
          {refreshing ? <ChartShimmer height={280} /> : (
            <div key={refreshKey}><MerchantsBarChart events={feedEvents} /></div>
          )}
        </ModuleCard>

        <ModuleCard>
          <SectionHeader title="Recent Mint / Burn Activity" subtitle="Latest issuance and redemption events across chains" />
          {refreshing ? <ChartShimmer height={280} /> : (
            <div key={refreshKey}><ActivityFeed events={feedEvents} /></div>
          )}
        </ModuleCard>

        <ModuleCard>
          <SectionHeader title="Custodian BTC Addresses" subtitle="Bitcoin addresses holding the custody reserves" />
          {refreshing ? <ChartShimmer height={280} /> : (
            <div key={refreshKey}><CustodianTable addresses={custodianAddresses} /></div>
          )}
        </ModuleCard>
      </div>

      <div style={{ height: 40 }} />
    </div>
  );
}

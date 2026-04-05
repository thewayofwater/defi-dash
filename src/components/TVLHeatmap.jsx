import React, { useState, useMemo } from "react";
import { TRACKED_CATEGORIES, CATEGORY_COLORS, CATEGORY_SHORT, CHAIN_MIN_POOLS, chainName } from "../utils/constants";
import { fmt, fmtPct } from "../utils/format";
import { SectionHeader } from "./Shared";

const NUM_CHAINS = 15;
const mono = "'JetBrains Mono', monospace";
// No fixed widths — let table auto-size with min-width for scroll


export default function TVLHeatmap({ pools, asset }) {
  const [mode, setMode] = useState("apy");
  const [selected, setSelected] = useState(null); // { chain, category }
  const isApy = mode === "apy";

  const topChains = useMemo(() => {
    const chainTvl = {};
    const chainPools = {};
    pools.forEach((p) => {
      if (!p.dashCategory || !TRACKED_CATEGORIES.includes(p.dashCategory)) return;
      chainTvl[p.chain] = (chainTvl[p.chain] || 0) + (p.tvlUsd || 0);
      chainPools[p.chain] = (chainPools[p.chain] || 0) + 1;
    });
    return Object.entries(chainTvl)
      .filter(([ch]) => (chainPools[ch] || 0) >= CHAIN_MIN_POOLS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, NUM_CHAINS)
      .map(([ch]) => ch);
  }, [pools]);

  const tvlData = useMemo(() => {
    const matrix = {};
    topChains.forEach((ch) => {
      matrix[ch] = {};
      TRACKED_CATEGORIES.forEach((ct) => { matrix[ch][ct] = 0; });
    });
    pools.forEach((p) => {
      const cat = p.dashCategory;
      if (!cat || !TRACKED_CATEGORIES.includes(cat) || !matrix[p.chain]) return;
      matrix[p.chain][cat] += p.tvlUsd || 0;
    });
    const rows = topChains.map((ch) => {
      const total = TRACKED_CATEGORIES.reduce((s, ct) => s + matrix[ch][ct], 0);
      return { chain: ch, ...matrix[ch], Total: total };
    });
    const totalsRow = { chain: "Total" };
    let grandTotal = 0;
    TRACKED_CATEGORIES.forEach((ct) => {
      const sum = topChains.reduce((s, ch) => s + matrix[ch][ct], 0);
      totalsRow[ct] = sum;
      grandTotal += sum;
    });
    totalsRow.Total = grandTotal;
    return { rows, totalsRow };
  }, [pools, topChains]);

  const apyData = useMemo(() => {
    const matrix = {};
    topChains.forEach((ch) => {
      matrix[ch] = {};
      TRACKED_CATEGORIES.forEach((ct) => { matrix[ch][ct] = { tvl: 0, wa: 0 }; });
    });
    pools.forEach((p) => {
      const cat = p.dashCategory;
      if (!cat || !TRACKED_CATEGORIES.includes(cat) || !matrix[p.chain]) return;
      if (p.apy > 0 && p.apy < 100) {
        matrix[p.chain][cat].tvl += p.tvlUsd || 0;
        matrix[p.chain][cat].wa += (p.apy * (p.tvlUsd || 0));
      }
    });
    const rows = topChains.map((ch) => {
      const row = { chain: ch };
      let totalTvl = 0, totalWa = 0;
      TRACKED_CATEGORIES.forEach((ct) => {
        const { tvl, wa } = matrix[ch][ct];
        row[ct] = tvl > 0 ? wa / tvl : null;
        totalTvl += tvl;
        totalWa += wa;
      });
      row.Total = totalTvl > 0 ? totalWa / totalTvl : null;
      return row;
    });
    const totalsRow = { chain: "Avg" };
    let grandTvl = 0, grandWa = 0;
    TRACKED_CATEGORIES.forEach((ct) => {
      const tvl = topChains.reduce((s, ch) => s + matrix[ch][ct].tvl, 0);
      const wa = topChains.reduce((s, ch) => s + matrix[ch][ct].wa, 0);
      totalsRow[ct] = tvl > 0 ? wa / tvl : null;
      grandTvl += tvl;
      grandWa += wa;
    });
    totalsRow.Total = grandTvl > 0 ? grandWa / grandTvl : null;
    return { rows, totalsRow };
  }, [pools, topChains]);

  const { rows: heatRows, totalsRow } = isApy ? apyData : tvlData;

  const maxVal = Math.max(
    ...heatRows.flatMap((r) => TRACKED_CATEGORIES.map((c) => r[c] || 0)),
    1
  );

  const getColor = (val) => {
    if (val == null || val === 0) return "rgba(255,255,255,0.012)";
    const intensity = Math.pow(Math.min(val / (maxVal * 0.25), 1), 0.55);
    return `rgba(34, 211, 238, ${0.03 + intensity * 0.55})`;
  };

  const formatCell = (val) => {
    if (val == null || val === 0) return "\u2014";
    return isApy ? fmtPct(val) : fmt(val, 1);
  };

  const drillPools = useMemo(() => {
    if (!selected) return [];
    return pools
      .filter((p) => p.chain === selected.chain && p.dashCategory === selected.category)
      .sort((a, b) => b.tvlUsd - a.tvlUsd);
  }, [pools, selected]);

  const title = isApy
    ? `${asset} APY by Chain × Category`
    : `${asset} TVL Distribution by Chain × Category`;
  const subtitle = isApy
    ? `TVL-weighted average APY across ${asset} pools per chain and category`
    : `Current ${asset} TVL allocation across top chains`;

  return (
    <div>
      <SectionHeader number="01" title={title} subtitle={subtitle} />

      {/* Toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {[
          { key: "apy", label: "APY" },
          { key: "tvl", label: "TVL" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            style={{
              padding: "4px 12px",
              fontSize: 10,
              fontFamily: mono,
              fontWeight: 500,
              letterSpacing: 0.5,
              border: mode === key
                ? "1px solid rgba(34,211,238,0.3)"
                : "1px solid rgba(255,255,255,0.06)",
              background: mode === key
                ? "rgba(34,211,238,0.1)"
                : "rgba(255,255,255,0.02)",
              color: mode === key ? "#22d3ee" : "#4a5568",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            fontFamily: mono,
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            <col style={{ width: "13%" }} />
            {TRACKED_CATEGORIES.map((cat) => (
              <col key={cat} style={{ width: `${87 / (TRACKED_CATEGORIES.length + 1)}%` }} />
            ))}
            <col style={{ width: `${87 / (TRACKED_CATEGORIES.length + 1)}%` }} />
          </colgroup>
          <thead>
            <tr>
              <th
                style={{
                                    textAlign: "left",
                  padding: "8px 10px",
                  color: "#6b7a8d",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  fontWeight: 500,
                  fontSize: 10,
                }}
              >
                Chain
              </th>
              {TRACKED_CATEGORIES.map((cat) => (
                <th
                  key={cat}
                  style={{
                                        textAlign: "right",
                    padding: "8px 10px",
                    color: CATEGORY_COLORS[cat],
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    fontWeight: 500,
                    opacity: 0.75,
                    fontSize: 10,
                  }}
                >
                  {CATEGORY_SHORT[cat] || cat}
                </th>
              ))}
              <th
                style={{
                                    textAlign: "right",
                  padding: "8px 10px",
                  color: "#e2e8f0",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  fontWeight: 600,
                  fontSize: 10,
                }}
              >
                {isApy ? "Avg" : "Total"}
              </th>
            </tr>
          </thead>
          <tbody>
            {heatRows.map((row) => (
              <tr key={row.chain}>
                <td
                  style={{
                    padding: "8px 10px",
                    color: "#cbd5e1",
                    borderBottom: "1px solid rgba(255,255,255,0.02)",
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {chainName(row.chain)}
                </td>
                {TRACKED_CATEGORIES.map((cat) => {
                  const isSelected = selected?.chain === row.chain && selected?.category === cat;
                  return (
                    <td
                      key={cat}
                      onClick={() => {
                        if (row[cat] != null && row[cat] > 0) {
                          setSelected(isSelected ? null : { chain: row.chain, category: cat });
                        }
                      }}
                      style={{
                        textAlign: "right",
                        padding: "8px 10px",
                        background: isSelected
                          ? "rgba(34, 211, 238, 0.25)"
                          : getColor(row[cat]),
                        borderBottom: "1px solid rgba(255,255,255,0.02)",
                        color: row[cat] != null && row[cat] > 0 ? "#d0d8e4" : "#1e2838",
                        cursor: row[cat] != null && row[cat] > 0 ? "pointer" : "default",
                        outline: isSelected ? "1px solid rgba(34,211,238,0.5)" : "none",
                      }}
                    >
                      {formatCell(row[cat])}
                    </td>
                  );
                })}
                <td
                  style={{
                    textAlign: "right",
                    padding: "8px 10px",
                    background: getColor(row.Total),
                    borderBottom: "1px solid rgba(255,255,255,0.02)",
                    color: row.Total != null && row.Total > 0 ? "#e2e8f0" : "#1e2838",
                    fontWeight: 600,
                  }}
                >
                  {formatCell(row.Total)}
                </td>
              </tr>
            ))}
            <tr>
              <td
                style={{
                  padding: "8px 10px",
                  color: "#e2e8f0",
                  borderTop: "1px solid rgba(255,255,255,0.1)",
                  fontWeight: 600,
                }}
              >
                {totalsRow.chain}
              </td>
              {TRACKED_CATEGORIES.map((cat) => (
                <td
                  key={cat}
                  style={{
                    textAlign: "right",
                    padding: "8px 10px",
                    background: getColor(totalsRow[cat]),
                    borderTop: "1px solid rgba(255,255,255,0.1)",
                    color: totalsRow[cat] != null && totalsRow[cat] > 0 ? CATEGORY_COLORS[cat] : "#1e2838",
                    fontWeight: 600,
                  }}
                >
                  {formatCell(totalsRow[cat])}
                </td>
              ))}
              <td
                style={{
                  textAlign: "right",
                  padding: "8px 10px",
                  borderTop: "1px solid rgba(255,255,255,0.1)",
                  color: "#e2e8f0",
                  fontWeight: 700,
                }}
              >
                {formatCell(totalsRow.Total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Drill-down pool list */}
      {selected && drillPools.length > 0 && (
        <div
          style={{
            marginTop: 12,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(34,211,238,0.15)",
            borderRadius: 5,
            padding: "10px 14px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: mono,
                color: "#22d3ee",
              }}
            >
              {chainName(selected.chain)} × {selected.category} — {drillPools.length} pools
            </div>
            <button
              onClick={() => setSelected(null)}
              style={{
                background: "none",
                border: "none",
                color: "#4a5568",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: mono,
                padding: "2px 6px",
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                fontFamily: mono,
              }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 8px", color: "#6b7a8d", fontWeight: 500, fontSize: 10 }}>Protocol</th>
                  <th style={{ textAlign: "left", padding: "8px 8px", color: "#6b7a8d", fontWeight: 500, fontSize: 10 }}>Symbol</th>
                  <th style={{ textAlign: "right", padding: "8px 8px", color: "#6b7a8d", fontWeight: 500, fontSize: 10 }}>TVL</th>
                  <th style={{ textAlign: "right", padding: "8px 8px", color: "#6b7a8d", fontWeight: 500, fontSize: 10 }}>APY</th>
                </tr>
              </thead>
              <tbody>
                {drillPools.map((p, i) => (
                  <tr
                    key={p.pool || i}
                    onClick={() => {
                      if (p.url) window.open(p.url, "_blank");
                      else if (p.pool && !p.pool.startsWith("morpho-")) window.open(`https://defillama.com/yields/pool/${p.pool}`, "_blank");
                    }}
                    style={{
                      background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                      cursor: p.url || (p.pool && !p.pool.startsWith("morpho-")) ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent"}
                  >
                    <td style={{ padding: "8px 8px", color: "#cbd5e1" }}>{p.project}</td>
                    <td style={{ padding: "8px 8px", color: "#94a3b8" }}>{p.displaySymbol || p.symbol}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", color: "#cbd5e1" }}>{fmt(p.tvlUsd)}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", color: "#22d3ee" }}>{fmtPct(p.apy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

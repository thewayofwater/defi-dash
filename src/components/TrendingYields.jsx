import React from "react";
import { fmt, fmtPct } from "../utils/format";
import { chainName } from "../utils/constants";

const mono = "'JetBrains Mono', monospace";

const truncCell = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const tableBase = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  fontFamily: mono,
  tableLayout: "fixed",
};

const thStyle = { textAlign: "left", padding: "8px 6px", color: "#6b7a8d", fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 };

export default function TrendingYields({ trending, asset }) {
  if (!trending) return null;
  const { topApy = [] } = trending;
  if (!topApy.length) return null;

  return (
    <table style={tableBase}>
      <colgroup>
        <col style={{ width: "24%" }} />
        <col style={{ width: "24%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "16%" }} />
        <col style={{ width: "18%" }} />
      </colgroup>
      <thead>
        <tr>
          <th style={thStyle}>Protocol</th>
          <th style={thStyle}>Pool</th>
          <th style={thStyle}>Chain</th>
          <th style={thStyle}>APY</th>
          <th style={thStyle}>TVL</th>
        </tr>
      </thead>
      <tbody>
        {topApy.map((p, i) => (
          <tr
            key={p.pool || i}
            onClick={() => {
              if (p.url) window.open(p.url, "_blank");
              else if (p.pool && !p.pool.startsWith("morpho-")) window.open(`https://defillama.com/yields/pool/${p.pool}`, "_blank");
            }}
            style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.012)" : "transparent", cursor: p.url || (p.pool && !p.pool.startsWith("morpho-")) ? "pointer" : "default" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "rgba(255,255,255,0.012)" : "transparent"}
          >
            <td style={{ ...truncCell, padding: "8px 6px", color: "#94a3b8" }} title={p.project}>
              {p.project}
            </td>
            <td style={{ ...truncCell, padding: "8px 6px", color: "#cbd5e1" }} title={p.displaySymbol || p.symbol}>
              {p.displaySymbol || p.symbol}
              {p.poolMeta && p.poolMeta.startsWith("For buying PT") && (
                <span style={{ marginLeft: 5, fontSize: 8, fontFamily: mono, color: "#a78bfa", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", padding: "1px 4px", borderRadius: 2, verticalAlign: "middle" }}>PT</span>
              )}
              {p.poolMeta && p.poolMeta.startsWith("For LP") && (
                <span style={{ marginLeft: 5, fontSize: 8, fontFamily: mono, color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", padding: "1px 4px", borderRadius: 2, verticalAlign: "middle" }}>LP</span>
              )}
            </td>
            <td style={{ ...truncCell, padding: "8px 6px", color: "#94a3b8" }}>
              {chainName(p.chain)}
            </td>
            <td style={{ padding: "8px 6px", color: "#60a5fa", fontWeight: 500 }}>
              {fmtPct(p.apy)}
            </td>
            <td style={{ padding: "8px 6px", color: "#94a3b8" }}>
              {fmt(p.tvlUsd)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

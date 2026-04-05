import React from "react";
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import { fmtPct } from "../utils/format";
import { StatCard, tooltipStyle } from "./Shared";

const mono = "'JetBrains Mono', monospace";

export default function RateOverlay({ rateData, asset, yieldIndex, color }) {
  if (!rateData?.protocols?.length) return null;

  const { protocols } = rateData;
  const top = protocols[0];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <StatCard label={`${asset} Yield Index`} value={fmtPct(yieldIndex)} color={color} />
        <StatCard label="Top Lending Rate" value={fmtPct(top?.supplyApy)} sub={top?.name} color="#a78bfa" />
        <StatCard
          label="Spread to Index"
          value={fmtPct((top?.supplyApy || 0) - yieldIndex)}
          sub={(top?.supplyApy || 0) > yieldIndex ? "above index" : "below index"}
          trend={(top?.supplyApy || 0) > yieldIndex ? "up" : "down"}
        />
      </div>

      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <ComposedChart data={protocols} margin={{ top: 5, right: 15, bottom: 42, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.035)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "#6b7a8d", fontFamily: mono }}
              stroke="rgba(255,255,255,0.05)"
              angle={-35}
              textAnchor="end"
              height={58}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#6b7a8d", fontFamily: mono }}
              tickFormatter={(v) => `${v.toFixed(1)}%`}
              stroke="rgba(255,255,255,0.05)"
            />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#e2e8f0" }} itemStyle={{ color: "#e2e8f0" }} formatter={(v) => [`${v.toFixed(2)}%`, "Supply APY"]} />
            <ReferenceLine
              y={yieldIndex}
              stroke={color}
              strokeDasharray="5 5"
              strokeWidth={1.5}
              label={{
                value: `Index: ${fmtPct(yieldIndex)}`,
                fill: color,
                fontSize: 10,
                fontFamily: mono,
                position: "right",
              }}
            />
            <Bar dataKey="supplyApy" radius={[3, 3, 0, 0]} name="Supply APY">
              {protocols.map((e, i) => (
                <Cell
                  key={i}
                  fill={e.supplyApy > yieldIndex ? "rgba(167,139,250,0.75)" : "rgba(167,139,250,0.25)"}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div
        style={{
          fontSize: 10,
          color: "#4f5e6f",
          textAlign: "center",
          marginTop: 3,
          fontFamily: mono,
        }}
      >
        Brighter bars outperform the TVL-weighted {asset} yield index
      </div>
    </div>
  );
}

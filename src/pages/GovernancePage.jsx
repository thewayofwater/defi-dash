import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom";
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, ZAxis,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { useGovernanceData } from "../hooks/useGovernanceData";
import { fmt, fmtPct, fmtDate } from "../utils/format";
import { SectionHeader, LoadingSpinner, ModuleCard, StatCard, ChartShimmer } from "../components/Shared";
import { GOVERNANCE_MODELS, GOVERNANCE_MODEL_COLORS, REV_SHARE_MODEL_COLORS } from "../utils/constants";

const mono = "'JetBrains Mono', monospace";

const TAB_STYLE = (active, color = "#22d3ee") => ({
  background: active ? `${color}18` : "rgba(255,255,255,0.025)",
  border: active ? `1px solid ${color}50` : "1px solid rgba(255,255,255,0.05)",
  borderRadius: 5,
  padding: "7px 16px",
  fontSize: 10,
  fontFamily: mono,
  color: active ? color : "#6b7a8d",
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

const TH = { padding: "8px 8px", textAlign: "left", fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer" };
const TH_R = { ...TH, textAlign: "right" };
const TD = { padding: "8px 8px", fontSize: 13, fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.03)" };
const TD_NUM = { ...TD, textAlign: "right" };
const TD_DIM = { ...TD_NUM, color: "#4a5568" };

// Render a numeric cell — dim if null/zero
function NumCell({ value, formatter, style }) {
  const display = formatter ? formatter(value) : fmt(value);
  const isNull = value == null || isNaN(value);
  return <td style={isNull ? { ...TD_NUM, ...style, color: "#4a5568" } : { ...TD_NUM, ...style }}>{display}</td>;
}

const chartTooltipStyle = {
  contentStyle: { background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, fontSize: 11, fontFamily: mono },
  itemStyle: { color: "#e2e8f0", fontSize: 11, fontFamily: mono },
  labelStyle: { color: "#94a3b8", fontSize: 10, fontFamily: mono, marginBottom: 4 },
  cursor: { stroke: "rgba(255,255,255,0.1)" },
};

function pctColor(val) {
  if (val == null) return "#4a5568";
  return val >= 0 ? "#34d399" : "#f87171";
}

function formatPctCell(val) {
  if (val == null) return "\u2014";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}%`;
}

function holderPctColor(pct) {
  if (pct == null || pct === 0) return "#4a5568";
  if (pct >= 80) return "#34d399";  // bright green
  if (pct >= 50) return "#6ee7b7";  // medium green
  if (pct >= 20) return "#a7f3d0";  // light green
  return "#d1fae5";                  // faint green
}

function ThTip({ label, tip, onClick, arrow, align }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = React.useRef(null);

  const handleEnter = () => {
    if (!tip || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShow(true);
  };

  return (
    <th
      ref={ref}
      style={{ ...TH, ...(align === "right" ? { textAlign: "right" } : {}), cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      {label}{arrow || ""} {tip && <span style={{ color: "#4a5568" }}>{"\u24D8"}</span>}
      {show && tip && ReactDOM.createPortal(
        <div style={{
          position: "fixed", top: pos.y - 8, left: pos.x, transform: "translate(-50%, -100%)",
          width: 220, padding: "8px 10px",
          background: "#131926", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#cbd5e1",
          lineHeight: 1.5, zIndex: 9999, pointerEvents: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>
          {tip}
        </div>,
        document.body
      )}
    </th>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{ fontSize: 10, fontFamily: mono, color, background: `${color}15`, padding: "2px 8px", borderRadius: 3, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

// ─── Model Legend ───

function ModelLegend({ models }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: 10 }}>
      {models.map((m) => (
        <div key={m} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#94a3b8", fontFamily: mono }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: GOVERNANCE_MODEL_COLORS[m] || "#6b7a8d" }} />
          {m}
        </div>
      ))}
    </div>
  );
}

// ─── Section 2: Model Comparison Bar Chart ───

function ModelComparisonChart({ modelAverages, timeframe }) {
  const data = useMemo(() => {
    return Object.entries(modelAverages)
      .map(([model, avg]) => ({
        model,
        count: avg.count,
        priceChange: timeframe === "90d" ? avg.avgPriceChange90d : timeframe === "all" ? avg.avgChangeSinceInception : avg.avgPriceChange1y,
      }))
      .sort((a, b) => (b.priceChange || -999) - (a.priceChange || -999));
  }, [modelAverages, timeframe]);

  if (data.length === 0) return <ChartShimmer height={300} />;

  // Compute nice Y ticks with even intervals including 0
  const vals = data.map((d) => d.priceChange || 0);
  const rawMin = Math.min(0, ...vals);
  const rawMax = Math.max(0, ...vals);
  const range = Math.max(Math.abs(rawMin), Math.abs(rawMax));
  const step = range <= 5 ? 2 : range <= 15 ? 5 : range <= 40 ? 10 : range <= 100 ? 20 : 50;
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.ceil(rawMax / step) * step;
  const ticks = [];
  for (let v = yMin; v <= yMax; v += step) ticks.push(v);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <XAxis dataKey="model" tick={{ fontSize: 9, fontFamily: mono, fill: "#6b7a8d" }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 10, fontFamily: mono, fill: "#6b7a8d" }} axisLine={false} tickLine={false} domain={[yMin, yMax]} ticks={ticks} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`} />
        <Tooltip
          {...chartTooltipStyle}
          content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0]?.payload;
            if (!d) return null;
            const val = d.priceChange;
            return (
              <div style={{ ...chartTooltipStyle.contentStyle, padding: 8 }}>
                <div style={{ color: GOVERNANCE_MODEL_COLORS[d.model] || "#e2e8f0", fontWeight: 600, marginBottom: 3 }}>{d.model}</div>
                <div style={{ color: "#94a3b8" }}>n={d.count} protocols</div>
                <div style={{ color: val != null && val >= 0 ? "#34d399" : "#f87171" }}>
                  {val != null ? `${val > 0 ? "+" : ""}${val.toFixed(1)}%` : "N/A"}
                </div>
              </div>
            );
          }}
        />
        <Bar dataKey="priceChange" name={`Price ${timeframe}`} radius={[3, 3, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.model} fill={GOVERNANCE_MODEL_COLORS[entry.model] || "#6b7a8d"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Revenue Chart (Rev Share vs No Rev Share, or by Rev Model) ───

function RevenueChart({ protocols, timeframe, mode }) {
  const avg = (arr) => {
    const vals = arr.map((p) => timeframe === "90d" ? p.priceChange90d : timeframe === "all" ? p.changeSinceInception : p.priceChange1y).filter((v) => v != null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const data = useMemo(() => {
    if (mode === "sharing") {
      const withRev = protocols.filter((p) => (p.holderRevenue30d || 0) > 0 || p.revenueSharing != null);
      const withoutRev = protocols.filter((p) => (p.holderRevenue30d || 0) === 0 && p.revenueSharing == null);
      return [
        { label: "Rev Share", count: withRev.length, priceChange: avg(withRev), color: "#34d399" },
        { label: "No Rev Share", count: withoutRev.length, priceChange: avg(withoutRev), color: "#6b7280" },
      ].sort((a, b) => (b.priceChange || -999) - (a.priceChange || -999));
    } else {
      const byModel = {};
      for (const p of protocols) {
        if (!p.revShareModel) continue;
        if (!byModel[p.revShareModel]) byModel[p.revShareModel] = [];
        byModel[p.revShareModel].push(p);
      }
      return Object.entries(byModel)
        .map(([model, arr]) => ({
          label: model,
          count: arr.length,
          priceChange: avg(arr),
          color: REV_SHARE_MODEL_COLORS[model] || "#6b7280",
        }))
        .sort((a, b) => (b.priceChange || -999) - (a.priceChange || -999));
    }
  }, [protocols, timeframe, mode]);

  // Compute nice Y domain that always includes 0 with even intervals
  const vals = data.map((d) => d.priceChange || 0);
  const rawMin = Math.min(0, ...vals);
  const rawMax = Math.max(0, ...vals);
  const range = Math.max(Math.abs(rawMin), Math.abs(rawMax));
  const step = range <= 5 ? 2 : range <= 15 ? 5 : range <= 40 ? 10 : range <= 100 ? 20 : 50;
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.ceil(rawMax / step) * step;
  const ticks = [];
  for (let v = yMin; v <= yMax; v += step) ticks.push(v);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: mono, fill: "#6b7a8d" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fontFamily: mono, fill: "#6b7a8d" }} axisLine={false} tickLine={false} domain={[yMin, yMax]} ticks={ticks} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`} />
        <Tooltip
          {...chartTooltipStyle}
          content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0]?.payload;
            if (!d) return null;
            const val = d.priceChange;
            return (
              <div style={{ ...chartTooltipStyle.contentStyle, padding: 8 }}>
                <div style={{ color: d.color, fontWeight: 600, marginBottom: 3 }}>{d.label}</div>
                <div style={{ color: "#94a3b8" }}>n={d.count} protocols</div>
                <div style={{ color: val != null && val >= 0 ? "#34d399" : "#f87171" }}>
                  {val != null ? `${val > 0 ? "+" : ""}${val.toFixed(1)}%` : "N/A"}
                </div>
              </div>
            );
          }}
        />
        <Bar dataKey="priceChange" name={`Price ${timeframe}`} radius={[3, 3, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.label} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Section 4: Normalized Price Chart ───

function NormalizedPriceChart({ protocols, timeframe }) {
  const chartData = useMemo(() => {
    if (!protocols.length) return [];

    const days = timeframe === "90d" ? 90 : timeframe === "1y" ? 365 : 99999;

    // Get the shortest price history and align all to same dates
    const dateMap = {};
    for (const p of protocols) {
      const history = (p.priceHistory || []).slice(-days);
      if (history.length === 0) continue;
      const basePrice = history[0].price;
      if (!basePrice) continue;

      for (const point of history) {
        const dateKey = new Date(point.date * 1000).toISOString().slice(0, 10);
        if (!dateMap[dateKey]) dateMap[dateKey] = { date: dateKey };
        dateMap[dateKey][p.token] = (point.price / basePrice) * 100;
      }
    }

    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [protocols, timeframe]);

  if (chartData.length === 0) return <ChartShimmer height={350} />;

  const tokens = protocols.filter((p) => p.priceHistory?.length > 0).map((p) => p.token);

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 9, fontFamily: mono, fill: "#6b7a8d" }} axisLine={false} tickLine={false} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}`; }} interval={Math.floor(chartData.length / 8)} />
        <YAxis tick={{ fontSize: 10, fontFamily: mono, fill: "#6b7a8d" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v) => `${v.toFixed(0)}`} />
        <Tooltip
          {...chartTooltipStyle}
          formatter={(value, name) => [`${value?.toFixed(1)}`, name]}
          labelFormatter={(label) => label}
        />
        {tokens.map((token) => {
          const proto = protocols.find((p) => p.token === token);
          const color = GOVERNANCE_MODEL_COLORS[proto?.model] || "#6b7a8d";
          return (
            <Line
              key={token}
              type="monotone"
              dataKey={token}
              stroke={color}
              dot={false}
              strokeWidth={1.5}
              strokeOpacity={0.8}
              connectNulls
            />
          );
        })}
        {/* Reference line at 100 */}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Section 5: Governance Health Scatter ───

function GovernanceScatter({ protocols, timeframe }) {
  const scatterData = useMemo(() => {
    return protocols
      .filter((p) => p.participationRate != null && p.priceChange1y != null)
      .map((p) => ({
        x: p.participationRate,
        y: timeframe === "90d" ? p.priceChange90d : timeframe === "all" ? p.changeSinceInception : p.priceChange1y,
        z: p.marketCap || 1e8,
        token: p.token,
        model: p.model,
      }));
  }, [protocols, timeframe]);

  if (scatterData.length < 2) {
    return (
      <div style={{ color: "#4a5568", fontSize: 12, fontFamily: mono, textAlign: "center", padding: 40 }}>
        Insufficient participation data for scatter plot — requires governance data from Snapshot or Tally
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
        <XAxis type="number" dataKey="x" name="Participation" tick={{ fontSize: 10, fontFamily: mono, fill: "#6b7a8d" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(1)}%`} label={{ value: "Voter Participation %", position: "insideBottom", offset: -5, fontSize: 10, fontFamily: mono, fill: "#6b7a8d" }} />
        <YAxis type="number" dataKey="y" name="Price Change" tick={{ fontSize: 10, fontFamily: mono, fill: "#6b7a8d" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} label={{ value: `Price Change (${timeframe})`, angle: -90, position: "insideLeft", fontSize: 10, fontFamily: mono, fill: "#6b7a8d" }} />
        <ZAxis type="number" dataKey="z" range={[60, 400]} />
        <Tooltip
          {...chartTooltipStyle}
          formatter={(value, name) => {
            if (name === "Participation") return [`${value.toFixed(1)}%`, "Participation"];
            if (name === "Price Change") return [`${value > 0 ? "+" : ""}${value.toFixed(1)}%`, "Price Change"];
            return [fmt(value), name];
          }}
          labelFormatter={() => ""}
          content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0]?.payload;
            if (!d) return null;
            return (
              <div style={{ ...chartTooltipStyle.contentStyle, padding: 8 }}>
                <div style={{ color: GOVERNANCE_MODEL_COLORS[d.model] || "#e2e8f0", fontWeight: 600, marginBottom: 3 }}>{d.token}</div>
                <div style={{ color: "#94a3b8" }}>Model: {d.model}</div>
                <div style={{ color: "#94a3b8" }}>Participation: {d.x.toFixed(1)}%</div>
                <div style={{ color: pctColor(d.y) }}>Price: {d.y > 0 ? "+" : ""}{d.y.toFixed(1)}%</div>
              </div>
            );
          }}
        />
        <Scatter data={scatterData}>
          {scatterData.map((entry, i) => (
            <Cell key={i} fill={GOVERNANCE_MODEL_COLORS[entry.model] || "#6b7a8d"} fillOpacity={0.8} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ─── Section 6: Key Takeaways ───

function KeyTakeaways({ protocols, modelAverages }) {
  const insights = useMemo(() => {
    const result = [];
    if (!Object.keys(modelAverages).length) return result;

    // Best model by 1Y price change
    const models = Object.entries(modelAverages).filter(([, avg]) => avg.avgPriceChange1y != null);
    if (models.length > 0) {
      models.sort((a, b) => (b[1].avgPriceChange1y || -999) - (a[1].avgPriceChange1y || -999));
      const [bestModel, bestAvg] = models[0];
      const [worstModel, worstAvg] = models[models.length - 1];
      result.push({
        icon: "📈",
        text: `${bestModel} tokens averaged ${bestAvg.avgPriceChange1y > 0 ? "+" : ""}${bestAvg.avgPriceChange1y?.toFixed(1)}% over the past year, outperforming ${worstModel} at ${worstAvg.avgPriceChange1y > 0 ? "+" : ""}${worstAvg.avgPriceChange1y?.toFixed(1)}%.`,
      });
    }

    // Lowest FDV/MCap ratio (least future dilution)
    const fdvModels = Object.entries(modelAverages).filter(([, avg]) => avg.avgFdvMcapRatio != null);
    if (fdvModels.length > 0) {
      fdvModels.sort((a, b) => (a[1].avgFdvMcapRatio || 999) - (b[1].avgFdvMcapRatio || 999));
      const [lowestModel, lowestAvg] = fdvModels[0];
      result.push({
        icon: "🔒",
        text: `${lowestModel} tokens have the lowest dilution risk with an average FDV/MCap ratio of ${lowestAvg.avgFdvMcapRatio?.toFixed(1)}x.`,
      });
    }

    // Highest participation
    const partModels = Object.entries(modelAverages).filter(([, avg]) => avg.avgParticipationRate != null);
    if (partModels.length > 0) {
      partModels.sort((a, b) => (b[1].avgParticipationRate || 0) - (a[1].avgParticipationRate || 0));
      const [highPartModel, highPartAvg] = partModels[0];
      result.push({
        icon: "🗳️",
        text: `${highPartModel} governance shows the highest voter participation at ${highPartAvg.avgParticipationRate?.toFixed(1)}% of total supply voting on recent proposals.`,
      });
    }

    // Revenue-sharing tokens vs non-revenue-sharing
    const withRevenue = protocols.filter((p) => p.revenueSharing != null && p.priceChange1y != null);
    const withoutRevenue = protocols.filter((p) => p.revenueSharing == null && p.priceChange1y != null);
    if (withRevenue.length > 0 && withoutRevenue.length > 0) {
      const avgWith = withRevenue.reduce((s, p) => s + p.priceChange1y, 0) / withRevenue.length;
      const avgWithout = withoutRevenue.reduce((s, p) => s + p.priceChange1y, 0) / withoutRevenue.length;
      const diff = avgWith - avgWithout;
      result.push({
        icon: "💰",
        text: `Tokens with revenue sharing averaged ${avgWith > 0 ? "+" : ""}${avgWith.toFixed(1)}% vs ${avgWithout > 0 ? "+" : ""}${avgWithout.toFixed(1)}% for tokens without — a ${Math.abs(diff).toFixed(1)}pp ${diff > 0 ? "advantage" : "gap"}.`,
      });
    }

    // Team-controlled vs governed
    const teamControlled = modelAverages["Team-Controlled"];
    const governed = Object.entries(modelAverages).filter(([m]) => m !== "Team-Controlled");
    const governedAvg = governed.filter(([, a]) => a.avgPriceChange1y != null);
    if (teamControlled?.avgPriceChange1y != null && governedAvg.length > 0) {
      const avgGoverned = governedAvg.reduce((s, [, a]) => s + a.avgPriceChange1y, 0) / governedAvg.length;
      result.push({
        icon: "⚖️",
        text: `Team-controlled tokens averaged ${teamControlled.avgPriceChange1y > 0 ? "+" : ""}${teamControlled.avgPriceChange1y.toFixed(1)}% vs ${avgGoverned > 0 ? "+" : ""}${avgGoverned.toFixed(1)}% for tokens with formal governance.`,
      });
    }

    return result;
  }, [protocols, modelAverages]);

  if (insights.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {insights.map((insight, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.04)" }}>
          <span style={{ fontSize: 18, lineHeight: 1.4 }}>{insight.icon}</span>
          <span style={{ fontSize: 12, fontFamily: mono, color: "#cbd5e1", lineHeight: 1.6 }}>{insight.text}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ───

export default function GovernancePage() {
  const { protocols, modelAverages, loading, refreshing, refreshKey, error, lastUpdated, refresh } = useGovernanceData();
  const [timeframe, setTimeframe] = useState("1y");
  const [revChartMode, setRevChartMode] = useState("sharing");
  const [modelFilter, setModelFilter] = useState("all");
  const [revModelFilter, setRevModelFilter] = useState("all");
  const [executionFilter, setExecutionFilter] = useState("all");
  const [sortCol, setSortCol] = useState("priceChange1y");
  const [sortDir, setSortDir] = useState("desc");

  const activeModels = useMemo(() => {
    const models = [...new Set(protocols.map((p) => p.model))];
    return models;
  }, [protocols]);

  const activeRevModels = useMemo(() => {
    return [...new Set(protocols.map((p) => p.revShareModel).filter(Boolean))];
  }, [protocols]);

  const filteredProtocols = useMemo(() => {
    let list = protocols;
    if (modelFilter !== "all") {
      list = list.filter((p) => p.model === modelFilter);
    }
    if (revModelFilter !== "all") {
      if (revModelFilter === "none") {
        list = list.filter((p) => !p.revShareModel);
      } else {
        list = list.filter((p) => p.revShareModel === revModelFilter);
      }
    }
    if (executionFilter !== "all") {
      list = list.filter((p) => p.execution === executionFilter);
    }
    // Sort
    list = [...list].sort((a, b) => {
      let aVal = a[sortCol];
      let bVal = b[sortCol];
      if (aVal == null) aVal = -Infinity;
      if (bVal == null) bVal = -Infinity;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
    return list;
  }, [protocols, modelFilter, revModelFilter, executionFilter, sortCol, sortDir]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sortArrow = (col) => {
    if (sortCol !== col) return "";
    return sortDir === "desc" ? " ↓" : " ↑";
  };

  // Summary stats
  const summaryStats = useMemo(() => {
    if (!protocols.length) return {};

    // Best model by 1Y
    const models = Object.entries(modelAverages);
    const bestModel = models.sort((a, b) => (b[1].avgPriceChange1y || -999) - (a[1].avgPriceChange1y || -999))[0];

    // Highest participation protocol
    const withPart = protocols.filter((p) => p.participationRate != null);
    const highPart = withPart.sort((a, b) => (b.participationRate || 0) - (a.participationRate || 0))[0];

    // Average FDV/MCap
    const fdvVals = protocols.map((p) => p.fdvMcapRatio).filter((v) => v != null);
    const avgFdvMcap = fdvVals.length > 0 ? fdvVals.reduce((a, b) => a + b, 0) / fdvVals.length : null;

    // Average pass rate
    const passVals = protocols.map((p) => p.passRate).filter((v) => v != null);
    const avgPassRate = passVals.length > 0 ? passVals.reduce((a, b) => a + b, 0) / passVals.length : null;

    return { bestModel, highPart, avgFdvMcap, avgPassRate };
  }, [protocols, modelAverages]);

  if (loading) {
    return (
      <div style={{ background: "#0a0e17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner message="Loading governance data..." />
      </div>
    );
  }
  if (error && !protocols.length) {
    return (
      <div style={{ background: "#0a0e17", color: "#f87171", padding: 40, fontFamily: mono, textAlign: "center", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 14 }}>Error loading governance data</div>
        <div style={{ color: "#4a5568", fontSize: 12 }}>{error}</div>
        <button onClick={refresh} style={{ marginTop: 8, padding: "8px 16px", background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 6, color: "#22d3ee", fontFamily: mono, fontSize: 12, cursor: "pointer" }}>Retry</button>
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
              Governance Performance
              <span style={{ color: "#22d3ee", marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: mono, verticalAlign: "middle", background: "rgba(34,211,238,0.07)", padding: "2px 7px", borderRadius: 3, letterSpacing: 1 }}>
                RESEARCH
              </span>
            </h1>
            <div style={{ fontSize: 12, color: "#4f5e6f", marginTop: 2, fontFamily: mono }}>
              Tracking how governance models correlate with token price across major DeFi protocols
              {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              background: refreshing ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 11,
              fontFamily: mono,
              color: refreshing ? "#22d3ee" : "#94a3b8",
              cursor: refreshing ? "default" : "pointer",
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Section 1: StatCards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard
          label="Best Model (1Y)"
          value={summaryStats.bestModel?.[0] || "\u2014"}
          sub={summaryStats.bestModel ? formatPctCell(summaryStats.bestModel[1].avgPriceChange1y) : "\u2014"}
          trend={summaryStats.bestModel?.[1]?.avgPriceChange1y >= 0 ? "up" : "down"}
          color={GOVERNANCE_MODEL_COLORS[summaryStats.bestModel?.[0]] || "#e2e8f0"}
        />
        <StatCard
          label="Highest Participation"
          value={summaryStats.highPart?.token || "\u2014"}
          sub={summaryStats.highPart ? `${summaryStats.highPart.participationRate.toFixed(1)}% of supply` : "N/A"}
        />
        <StatCard label="Protocols Tracked" value={protocols.length} />
        <StatCard
          label="Avg FDV/MCap"
          value={summaryStats.avgFdvMcap ? `${summaryStats.avgFdvMcap.toFixed(1)}x` : "\u2014"}
          sub="Dilution risk indicator"
        />
        <StatCard
          label="Avg Pass Rate"
          value={summaryStats.avgPassRate ? fmtPct(summaryStats.avgPassRate, 0) : "N/A"}
          sub="Across tracked DAOs"
        />
      </div>

      {/* Timeframe */}
      <div style={{ display: "flex", gap: 6 }}>
        {["90d", "1y", "all"].map((tf) => (
          <button key={tf} onClick={() => setTimeframe(tf)} style={TAB_STYLE(timeframe === tf)}>
            {tf === "all" ? "All-Time" : tf.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Section 2: Model Comparison + Revenue Share Comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <ModuleCard>
          <SectionHeader title="By Voting Model" subtitle={`Average price change (${timeframe.toUpperCase()})`} />
          {refreshing ? <ChartShimmer height={300} /> : (
            <div key={refreshKey}><ModelComparisonChart modelAverages={modelAverages} timeframe={timeframe} /></div>
          )}
          <ModelLegend models={activeModels} />
        </ModuleCard>
        <ModuleCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <SectionHeader title={revChartMode === "sharing" ? "By Revenue Sharing" : "By Revenue Model"} subtitle={`Average price change (${timeframe === "all" ? "All-Time" : timeframe.toUpperCase()})`} />
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
              {[{ key: "sharing", label: "Rev Share" }, { key: "model", label: "Rev Model" }].map(({ key, label }) => (
                <button key={key} onClick={() => setRevChartMode(key)} style={{
                  background: revChartMode === key ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.04)",
                  border: revChartMode === key ? "1px solid rgba(34,211,238,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 3, padding: "3px 10px", fontSize: 10, fontFamily: mono, color: revChartMode === key ? "#22d3ee" : "#6b7a8d", cursor: "pointer", letterSpacing: 0.5,
                }}>{label}</button>
              ))}
            </div>
          </div>
          {refreshing ? <ChartShimmer height={280} /> : (
            <div key={`${refreshKey}-${revChartMode}`}><RevenueChart protocols={protocols} timeframe={timeframe} mode={revChartMode} /></div>
          )}
        </ModuleCard>
      </div>


      {/* Section 3: Token Performance Table */}
      <div style={{ position: "relative", overflow: "hidden", background: "rgba(255,255,255,0.012)", border: "1px solid rgba(255,255,255,0.035)", borderRadius: 7, padding: 20 }}>
        {refreshing && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.06) 40%, rgba(34,211,238,0.10) 50%, rgba(34,211,238,0.06) 60%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite", zIndex: 1, pointerEvents: "none" }} />}
        <SectionHeader title="Token Performance" subtitle="Sortable comparison across all tracked governance tokens" />
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>Voting Model</span>
          <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} style={FILTER_STYLE}>
            <option value="all">All</option>
            {activeModels.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
          <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>Execution</span>
          <select value={executionFilter} onChange={(e) => setExecutionFilter(e.target.value)} style={FILTER_STYLE}>
            <option value="all">All</option>
            <option value="On-Chain">On-Chain</option>
            <option value="Multisig">Multisig</option>
          </select>
          <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono, letterSpacing: 0.5 }}>Rev Model</span>
          <select value={revModelFilter} onChange={(e) => setRevModelFilter(e.target.value)} style={FILTER_STYLE}>
            <option value="all">All</option>
            {activeRevModels.map((m) => (<option key={m} value={m}>{m}</option>))}
            <option value="none">No Rev Share</option>
          </select>
          <span style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono }}>{filteredProtocols.length} of {protocols.length} protocols</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>Token</th>
                <ThTip label="Voting Model" tip="How voting power is distributed: Token-Weighted (1 token = 1 vote), veToken (lock for power), Staked Governance (stake to vote, liquid cooldown), or No Governance." />
                <ThTip label="Execution" tip="How governance outcomes are implemented: On-Chain (auto-executed by smart contract) or Multisig (signed by a group of keyholders)." />
                <th style={TH_R} onClick={() => handleSort("price")}>Price{sortArrow("price")}</th>
                <th style={TH_R} onClick={() => handleSort("priceChange90d")}>90D %{sortArrow("priceChange90d")}</th>
                <th style={TH_R} onClick={() => handleSort("priceChange1y")}>1Y %{sortArrow("priceChange1y")}</th>
                <th style={TH_R} onClick={() => handleSort("changeSinceInception")}>Inception %{sortArrow("changeSinceInception")}</th>
                <th style={TH_R} onClick={() => handleSort("fdv")}>FDV{sortArrow("fdv")}</th>
                <th style={TH_R} onClick={() => handleSort("marketCap")}>MCap{sortArrow("marketCap")}</th>
                <th style={TH_R} onClick={() => handleSort("fdvMcapRatio")}>FDV/MCap{sortArrow("fdvMcapRatio")}</th>
                <ThTip label="Participation" tip="Percentage of circulating supply that votes on recent proposals. For veToken protocols, this is the % of total supply locked. Higher = more engaged governance." onClick={() => handleSort("participationRate")} arrow={sortArrow("participationRate")} align="right" />
                <ThTip label="Pass Rate" tip="Percentage of closed governance proposals that passed. Data from Snapshot (off-chain) or Tally (on-chain), whichever has more proposals." onClick={() => handleSort("passRate")} arrow={sortArrow("passRate")} align="right" />
                <th style={TH_R} onClick={() => handleSort("tvl")}>TVL{sortArrow("tvl")}</th>
                <ThTip label="Fees 30D" tip="Total fees generated by the protocol over 30 days — includes all user-paid fees before any splits to LPs or supply side. Source: DeFiLlama." onClick={() => handleSort("fees30d")} arrow={sortArrow("fees30d")} align="right" />
                <ThTip label="Rev 30D" tip="Protocol revenue over the last 30 days — fees earned by the protocol after paying LPs and supply-side costs. Source: DeFiLlama." onClick={() => handleSort("revenue30d")} arrow={sortArrow("revenue30d")} align="right" />
                <ThTip label="Holder Rev 30D" tip="Revenue distributed to token holders over the last 30 days via buybacks, dividends, or fee sharing. Source: DeFiLlama." onClick={() => handleSort("holderRevenue30d")} arrow={sortArrow("holderRevenue30d")} align="right" />
                <ThTip label="% to Holders" tip="Percentage of protocol revenue directed to token holders. Higher = more value returned to holders vs retained by the protocol." onClick={() => handleSort("holderRevenuePercent")} arrow={sortArrow("holderRevenuePercent")} align="right" />
                <ThTip label="Cum. Rev" tip="Cumulative all-time revenue distributed to token holders since the protocol started sharing revenue. Source: DeFiLlama." onClick={() => handleSort("holderRevenueCumulative")} arrow={sortArrow("holderRevenueCumulative")} align="right" />
                <ThTip label="Fees/Unlocks" tip="Total protocol fees divided by USD value of new tokens unlocked over 30 days. Above 1x = fees exceed dilution. Below 1x = more supply entering than fees earned. N/A = fully vested (no active unlocks)." onClick={() => handleSort("feeToEmissions")} arrow={sortArrow("feeToEmissions")} align="right" />
                <ThTip label="Rev Model" tip="How the protocol returns value to holders: Buybacks (protocol buys tokens from market) or Dividends (revenue paid directly to stakers/holders)." />
              </tr>
            </thead>
            <tbody>
              {filteredProtocols.map((p) => (
                <tr key={p.id} onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"} onMouseOut={(e) => e.currentTarget.style.background = "transparent"}>
                  <td style={{ ...TD, fontWeight: 600, color: "#e2e8f0" }}>{p.token}</td>
                  <td style={TD}><Badge label={p.model} color={GOVERNANCE_MODEL_COLORS[p.model] || "#6b7a8d"} /></td>
                  <td style={p.execution ? TD : { ...TD, color: "#4a5568" }}>{p.execution || "\u2014"}</td>
                  <td style={p.price != null ? TD_NUM : TD_DIM}>{p.price != null ? `$${p.price < 1 ? p.price.toFixed(4) : p.price.toFixed(2)}` : "\u2014"}</td>
                  <td style={{ ...TD_NUM, color: pctColor(p.priceChange90d) }}>{formatPctCell(p.priceChange90d)}</td>
                  <td style={{ ...TD_NUM, color: pctColor(p.priceChange1y) }}>{formatPctCell(p.priceChange1y)}</td>
                  <td style={{ ...TD_NUM, color: pctColor(p.changeSinceInception) }}>{formatPctCell(p.changeSinceInception)}</td>
                  <td style={p.fdv ? TD_NUM : TD_DIM}>{fmt(p.fdv)}</td>
                  <td style={p.marketCap ? TD_NUM : TD_DIM}>{fmt(p.marketCap)}</td>
                  <td style={p.fdvMcapRatio != null ? TD_NUM : TD_DIM}>{p.fdvMcapRatio != null ? `${p.fdvMcapRatio.toFixed(1)}x` : "\u2014"}</td>
                  <td style={p.participationRate != null ? TD_NUM : TD_DIM}>{p.participationRate != null ? `${p.participationRate.toFixed(1)}%` : "\u2014"}</td>
                  <td style={p.passRate != null ? TD_NUM : TD_DIM}>{p.passRate != null ? `${p.passRate.toFixed(0)}%` : "\u2014"}</td>
                  <td style={p.tvl ? TD_NUM : TD_DIM}>{fmt(p.tvl)}</td>
                  <td style={p.fees30d ? TD_NUM : TD_DIM}>{fmt(p.fees30d)}</td>
                  <td style={p.revenue30d ? TD_NUM : TD_DIM}>{fmt(p.revenue30d)}</td>
                  <td style={p.holderRevenue30d ? TD_NUM : TD_DIM}>{fmt(p.holderRevenue30d)}</td>
                  <td style={{ ...TD_NUM, color: holderPctColor(p.holderRevenuePercent) }}>{p.holderRevenuePercent != null ? `${p.holderRevenuePercent.toFixed(0)}%` : "\u2014"}</td>
                  <td style={p.holderRevenueCumulative ? TD_NUM : TD_DIM}>{fmt(p.holderRevenueCumulative)}</td>
                  <td style={{ ...TD_NUM, color: p.feeToEmissions != null ? (p.feeToEmissions >= 1 ? "#34d399" : p.feeToEmissions >= 0.5 ? "#fbbf24" : "#f87171") : "#4a5568" }}>
                    {p.feeToEmissions != null ? `${p.feeToEmissions.toFixed(2)}x` : "\u2014"}
                  </td>
                  <td style={p.revShareModel ? TD : { ...TD, color: "#4a5568" }}>{p.revShareModel ? <Badge label={p.revShareModel} color={REV_SHARE_MODEL_COLORS[p.revShareModel] || "#94a3b8"} /> : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>


      {/* Section 4: Normalized Price Chart */}
      <ModuleCard>
        <SectionHeader title="Normalized Price Performance" subtitle="All tokens indexed to 100 at start of period — colored by governance model" />
        {refreshing ? <ChartShimmer height={350} /> : (
          <div key={refreshKey}><NormalizedPriceChart protocols={filteredProtocols} timeframe={timeframe} /></div>
        )}
        <ModelLegend models={activeModels} />
      </ModuleCard>


      {/* Section 5: Governance Health Scatter */}
      <ModuleCard>
        <SectionHeader title="Governance Health vs. Price" subtitle="Voter participation vs. price change — bubble size = market cap" />
        {refreshing ? <ChartShimmer height={300} /> : (
          <div key={refreshKey}><GovernanceScatter protocols={protocols} timeframe={timeframe} /></div>
        )}
        <ModelLegend models={activeModels} />
      </ModuleCard>


      {/* Section 6: Key Takeaways */}
      <ModuleCard>
        <SectionHeader title="Key Takeaways" subtitle="Auto-computed insights from the data" />
        <KeyTakeaways protocols={protocols} modelAverages={modelAverages} />
      </ModuleCard>

      </div>{/* end content wrapper */}
    </div>
  );
}

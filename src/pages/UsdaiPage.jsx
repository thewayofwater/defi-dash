import React from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";
import { useUsdaiData } from "../hooks/useUsdaiData";
import { SectionHeader, LoadingSpinner, ModuleCard } from "../components/Shared";
import { DCF_DEFAULTS, aggregateByModel, modelComparison } from "../utils/usdai-dcf";

const UsdaiGlobe = React.lazy(() => import("../components/UsdaiGlobe"));

const mono = "'JetBrains Mono', monospace";
export const USDAI_ACCENT = "#c8b88a";

// Common EVM chain IDs → display name. Add more as needed.
const CHAIN_NAMES = {
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  43114: "Avalanche",
};
const chainName = (id) => CHAIN_NAMES[id] || (id != null ? `Chain ${id}` : "—");

const fmtUsdShort = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 1e9) return `$${(v/1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v/1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
};
const fmtPct = (n) => (n == null || !Number.isFinite(Number(n))) ? "—" : `${Number(n).toFixed(2)}%`;

const tooltipStyle = {
  contentStyle: { background: "#131926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, fontSize: 10, fontFamily: mono, color: "#e2e8f0" },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#e2e8f0" },
};

const th  = { padding: "8px 8px", textAlign: "left",  fontSize: 10, color: "#6b7a8d", fontFamily: mono, textTransform: "uppercase", letterSpacing: 1 };
const thR = { ...th, textAlign: "right" };
const td  = { padding: "8px 8px", fontSize: 13, fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.03)", color: "#e2e8f0" };
const tdR = { ...td, textAlign: "right" };
const dim = { color: "#6b7a8d" };

function shortAddr(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—"; }
function fmtTerm(termSeconds) {
  if (!termSeconds) return "—";
  const d = Math.round(termSeconds / 86400);
  if (d >= 365) return `${(d/365).toFixed(1)}y`;
  return `${d}d`;
}

function LoansTable({ groups, selectedKey, onSelect, accent }) {
  const [tab, setTab] = React.useState("deployed");

  const buckets = React.useMemo(() => {
    const d = groups.filter(g => g.isDeployed);
    const u = groups.filter(g => !g.isDeployed);
    return { deployed: d, upcoming: u };
  }, [groups]);

  const rows = buckets[tab] || [];

  const Tab = ({ id, label, count }) => (
    <button onClick={() => setTab(id)} style={{
      background: tab === id ? `${accent}22` : "rgba(255,255,255,0.025)",
      border: `1px solid ${tab === id ? `${accent}55` : "rgba(255,255,255,0.05)"}`,
      borderRadius: 5, padding: "6px 10px", fontSize: 11, fontFamily: mono,
      color: tab === id ? accent : "#94a3b8", cursor: "pointer",
    }}>
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: tab === id ? accent : "#4a5568", marginRight: 6 }} />
      {label} [{count}]
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Tab id="deployed" label="Deployed Loans" count={buckets.deployed.length} />
        <Tab id="upcoming" label="Upcoming Loans" count={buckets.upcoming.length} />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono }}>
          <thead>
            <tr>
              <th style={th}>NAME</th>
              <th style={thR}>APY</th>
              <th style={thR}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(g => {
              const isSel = g.groupKey === selectedKey;
              const ltv = (g.attestedUsd && g.principal) ? (g.principal / g.attestedUsd) : null;
              return (
                <React.Fragment key={g.groupKey}>
                  <tr onClick={() => onSelect(g)}
                      style={{ cursor: "pointer", background: isSel ? `${accent}14` : undefined }}>
                    <td style={td}>
                      {g.name}
                      {g.isEscrowed && <span style={{ marginLeft: 6, color: "#94a3b8", fontSize: 10 }}>(Escrowed)</span>}
                    </td>
                    <td style={tdR}>{g.apr != null ? `${g.apr.toFixed(1)}%` : "—"}</td>
                    <td style={tdR}>{fmtUsdShort(g.principal)}</td>
                  </tr>
                  {isSel && (
                    <tr>
                      <td colSpan={3} style={{ ...td, background: "rgba(255,255,255,0.02)", padding: "10px 8px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
                          <div>
                            <span style={dim}>Borrower:</span> {shortAddr(g.borrower)}
                            {g.borrowers?.length > 1 && <span style={{ ...dim, fontSize: 9, marginLeft: 4 }}>(+{g.borrowers.length - 1})</span>}
                          </div>
                          <div><span style={dim}>Location:</span> {g.location?.name || "—"}</div>
                          <div><span style={dim}>Term:</span> {fmtTerm(g.termSeconds)}</div>
                          <div><span style={dim}>Off-take:</span> {g.offTake || "—"}</div>
                          <div>
                            <span style={dim}>
                              {g.attestedSource === "nft-aggregate" ? "Attested $ (aggregate NFT):"
                                : g.attestedSource === "nft-bundle" ? "Attested $ (bundle NFTs):"
                                : g.attestedSource === "nft-per-server" ? "Attested $ (per-server NFTs):"
                                : g.attestedSource === "replacement-cost" ? "Replacement-cost est:"
                                : "Attested $:"}
                            </span> {fmtUsdShort(g.attestedUsd)}
                            {g.attestedSource === "nft-bundle" && g.bundleIds?.length > 1 && (
                              <span style={{ ...dim, fontSize: 9, marginLeft: 4 }} title={`Sum of ${g.bundleIds.length} on-chain bundles backing this loan group`}>
                                ({g.bundleIds.length} bundles)
                              </span>
                            )}
                            {g.attestedSource === "nft-per-server" && (
                              <span style={{ ...dim, fontSize: 9, marginLeft: 4 }} title="No on-chain bundle found for this borrower yet (likely upcoming/not-yet-deployed). Estimated from per-server NFT median price × hardware count.">
                                (estimate)
                              </span>
                            )}
                            {g.attestedSource === "replacement-cost" && (
                              <span style={{ ...dim, fontSize: 9, marginLeft: 4 }} title="No NFT data available — fallback estimate using public NVIDIA list prices × GPU count">
                                (no NFT data)
                              </span>
                            )}
                          </div>
                          <div>
                            <span style={dim}>LTV:</span> {ltv != null ? `${(ltv * 100).toFixed(0)}%` : "—"}
                            {ltv != null && ltv > 0.8 && <span style={{ color: "#fbbf24", fontSize: 9, marginLeft: 4 }}>(above 80% cap)</span>}
                          </div>
                          {g.hardware?.length > 0 && (
                            <div style={{ gridColumn: "1 / -1", ...dim, fontSize: 10 }}>
                              Hardware: {g.hardware.map(h => `${h.name} ×${h.count}`).join(" · ")}
                            </div>
                          )}
                          {g.tokenIds?.length > 0 && (
                            <div style={{ gridColumn: "1 / -1" }}>
                              {g.tokenIds.map(tid => (
                                <a key={tid} href={`https://metadata.usd.ai/v1/${tid}`} target="_blank" rel="noreferrer"
                                   style={{ color: accent, fontSize: 10, marginRight: 10 }}>
                                  NFT #{tid} ↗
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={3} style={{ ...td, color: "#4f5e6f", textAlign: "center", padding: 20 }}>No loans in this tab</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: mono, color: "#94a3b8" }}>
        <span>{label}</span>
        <span style={{ color: accent }}>{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             style={{ accentColor: accent, width: "100%" }} />
    </div>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div style={{
      flex: 1, minWidth: 140, padding: "10px 14px",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 9, fontFamily: mono, color: "#6b7a8d", letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent || "#e2e8f0", fontFamily: mono, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#4f5e6f", fontFamily: mono, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function UsdaiPage() {
  const { data, loading, error, refreshing, lastUpdated, refreshKey, refresh } = useUsdaiData();
  const [selectedGroupKey, setSelectedGroupKey] = React.useState(null);
  const globeRef = React.useRef(null);

  const globePoints = React.useMemo(() => {
    return (data?.loanGroups || [])
      .filter(g => g.location)
      .map(g => ({
        id: g.groupKey,
        lat: g.location.lat,
        lng: g.location.lng,
        size: Math.min(0.06, Math.max(0.008, (g.principal || 0) / 5e8)),
        color: g.isDeployed ? USDAI_ACCENT : (g.isEscrowed ? "#fbbf24" : "#6b7a8d"),
        label: `${g.name}<br/>${fmtUsdShort(g.principal)} · ${g.location.name}${g.loanCount > 1 ? `<br/>${g.loanCount} loans` : ""}`,
      }));
  }, [data]);

  const handleSelectGroup = React.useCallback((g) => {
    setSelectedGroupKey(prev => prev === g.groupKey ? null : g.groupKey);
    if (g.location && globeRef.current?.spinTo) {
      globeRef.current.spinTo(g.location.lat, g.location.lng);
    }
  }, []);

  const handleDotClick = React.useCallback((point) => {
    const g = (data?.loanGroups || []).find(x => x.groupKey === point.id);
    if (g) handleSelectGroup(g);
  }, [data, handleSelectGroup]);

  const [dcfParams, setDcfParams] = React.useState(DCF_DEFAULTS);
  const [assumptionsOpen, setAssumptionsOpen] = React.useState(true);

  const modelRows = React.useMemo(() => {
    const aggs = aggregateByModel(data?.loans || []);
    return aggs.map(a => {
      const cmp = modelComparison({
        vastGpuName: a.vastGpuName,
        vastProxy: a.vastProxy,
        replacementCost: a.replacementCost,
        rentals: data?.gpuRentals,
        attestedPerUnit: a.attestedPerUnit,
        params: dcfParams,
      });
      return {
        model: a.model,
        units: a.units,
        vastGpuName: a.vastGpuName,
        rentalSource: cmp.rentalSource,
        proxyUsed: cmp.proxyUsed,
        medianDph: cmp.medianDph,
        listingCount: cmp.listingCount,
        attested: cmp.attested,
        implied: cmp.implied,
        gap: cmp.gap,
        gapPct: cmp.gapPct,
      };
    }).filter(r => r.attested != null || r.implied != null);
  }, [data, dcfParams]);

  const chartRows = modelRows.map(r => ({
    model: r.model,
    Attested: r.attested,
    Implied: r.implied,
  }));

  if (error) {
    return (
      <div style={{ padding: 40, color: "#f87171", fontFamily: mono, textAlign: "center" }}>
        Failed to load USDai data: {error}
      </div>
    );
  }
  if (loading) {
    return (
      <div style={{ background: "#0a0e17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner message="Loading USDai data..." />
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0e17", color: "#e2e8f0", minHeight: "100vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ padding: "20px 26px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
              USDai
              <span style={{ color: USDAI_ACCENT, marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: mono, verticalAlign: "middle", background: `${USDAI_ACCENT}1a`, padding: "2px 7px", borderRadius: 3, letterSpacing: 1 }}>
                GPU CREDIT / RWA
              </span>
            </h1>
            <div style={{ fontSize: 12, color: "#4f5e6f", marginTop: 2, fontFamily: mono }}>
              Live data from api.usd.ai{lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            </div>
          </div>
          <button onClick={refresh} disabled={refreshing}
            style={{ background: refreshing ? `${USDAI_ACCENT}26` : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "7px 14px", fontSize: 11, fontFamily: mono, color: refreshing ? USDAI_ACCENT : "#94a3b8", cursor: refreshing ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none", fontSize: 13 }}>↻</span>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 24 }} key={refreshKey}>
        {data?.warnings?.length > 0 && (
          <details style={{ fontSize: 11, fontFamily: mono, color: "#fbbf24", padding: "8px 12px", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 5, background: "rgba(251,191,36,0.04)" }}>
            <summary style={{ cursor: "pointer" }}>
              ⚠ {data.warnings.length} partial data warning(s) — click to expand
            </summary>
            <ul style={{ margin: "6px 0 0 14px", padding: 0, color: "#fde68a" }}>
              {data.warnings.map((w, i) => <li key={i} style={{ marginTop: 2 }}>{w}</li>)}
            </ul>
          </details>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Kpi label="TVL"            value={fmtUsdShort(data?.kpis?.tvl)}
               sub={`${fmtUsdShort(data?.reserves?.stablecoin)} stable · ${fmtUsdShort(data?.reserves?.loans)} loans`} />
          <Kpi label="Current APY"    value={fmtPct(data?.kpis?.currentApy)}  accent={USDAI_ACCENT} />
          <Kpi label="Projected APY"  value={fmtPct(data?.kpis?.expectedApy)} />
          <Kpi label="Utilization"    value={fmtPct(data?.kpis?.utilization)} />
          <Kpi label="sUSDai Supply"  value={fmtUsdShort(data?.kpis?.susdaiSupply)} sub={`USDai supply ${fmtUsdShort(data?.kpis?.usdaiSupply)}`} />
        </div>

        <ModuleCard>
          <SectionHeader title="Reserves & TVL" subtitle="Stablecoin reserves vs deployed loans over time" />
          {(data?.tvlHistory?.length || 0) === 0 ? (
            <div style={{ padding: 30, textAlign: "center", fontFamily: mono, fontSize: 11, color: "#4f5e6f" }}>
              TVL history unavailable
            </div>
          ) : (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <ComposedChart data={data.tvlHistory} margin={{ top: 12, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date"
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
                    minTickGap={40} />
                  <YAxis yAxisId="left" tickFormatter={fmtUsdShort}
                    tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} />
                  <Tooltip {...tooltipStyle}
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                    formatter={(v, k) => [fmtUsdShort(v), k]} />
                  <Area yAxisId="left" type="monotone" dataKey="stablecoin" stackId="1"
                        stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.22} name="Stablecoin" />
                  <Area yAxisId="left" type="monotone" dataKey="loans" stackId="1"
                        stroke={USDAI_ACCENT} fill={USDAI_ACCENT} fillOpacity={0.30} name="Loans" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </ModuleCard>

        <ModuleCard>
          <SectionHeader title="Loans" subtitle={`${(data?.loanGroups || []).length} loan groups · ${(data?.loans || []).length} underlying loans · click a row for detail`} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 0.42fr) 0.58fr", gap: 16 }}>
            <LoansTable
              groups={data?.loanGroups || []}
              selectedKey={selectedGroupKey}
              onSelect={handleSelectGroup}
              accent={USDAI_ACCENT}
            />
            <React.Suspense fallback={
              <div style={{ minHeight: 380, display: "flex", alignItems: "center", justifyContent: "center", color: "#4f5e6f", fontFamily: mono, fontSize: 11 }}>
                Loading globe…
              </div>
            }>
              <UsdaiGlobe ref={globeRef} points={globePoints} onPointClick={handleDotClick} accent={USDAI_ACCENT} />
            </React.Suspense>
          </div>
        </ModuleCard>

        <ModuleCard>
          <SectionHeader
            title="GPU Collateral Cross-Check"
            subtitle="Per-unit attested collateral $ (USDai's metadata.usd.ai per-server NFT median) vs DCF-implied $/unit from live Vast.ai rentals." />

          <div style={{ marginBottom: 14 }}>
            <button onClick={() => setAssumptionsOpen(o => !o)}
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", fontFamily: mono, fontSize: 11, padding: "5px 10px", borderRadius: 5, cursor: "pointer", marginBottom: 10 }}>
              {assumptionsOpen ? "▾" : "▸"} Assumptions
            </button>
            {assumptionsOpen && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 5, background: "rgba(255,255,255,0.015)" }}>
                <Slider label="Utilization"     value={dcfParams.utilization}    min={0.50} max={0.95} step={0.01}
                        fmt={v => `${(v*100).toFixed(0)}%`}
                        onChange={v => setDcfParams(p => ({ ...p, utilization: v }))} accent={USDAI_ACCENT} />
                <Slider label="Discount rate"    value={dcfParams.discountRate}   min={0.05} max={0.30} step={0.01}
                        fmt={v => `${(v*100).toFixed(0)}%`}
                        onChange={v => setDcfParams(p => ({ ...p, discountRate: v }))} accent={USDAI_ACCENT} />
                <Slider label="Useful life"      value={dcfParams.usefulLifeYears} min={2} max={6} step={1}
                        fmt={v => `${v}y`}
                        onChange={v => setDcfParams(p => ({ ...p, usefulLifeYears: v }))} accent={USDAI_ACCENT} />
                <Slider label="Residual %"       value={dcfParams.residualPct}    min={0} max={0.50} step={0.01}
                        fmt={v => `${(v*100).toFixed(0)}%`}
                        onChange={v => setDcfParams(p => ({ ...p, residualPct: v }))} accent={USDAI_ACCENT} />
                <Slider label="Annual decline"   value={dcfParams.annualDecline}  min={0} max={0.50} step={0.01}
                        fmt={v => `${(v*100).toFixed(0)}%`}
                        onChange={v => setDcfParams(p => ({ ...p, annualDecline: v }))} accent={USDAI_ACCENT} />
              </div>
            )}
          </div>

          {Object.keys(data?.gpuRentals || {}).length === 0 && (
            <div style={{ padding: 16, fontFamily: mono, fontSize: 11, color: "#fbbf24", background: "rgba(251,191,36,0.04)", borderRadius: 5, marginBottom: 12 }}>
              No Vast.ai rental data available — implied values can't be computed.
            </div>
          )}

          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chartRows} margin={{ top: 12, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="model" tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} />
                <YAxis tickFormatter={fmtUsdShort} tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} />
                <Tooltip {...tooltipStyle} formatter={(v) => fmtUsdShort(v)} />
                <Legend wrapperStyle={{ fontSize: 10, fontFamily: mono }} />
                <Bar dataKey="Attested" fill="#22d3ee" />
                <Bar dataKey="Implied"  fill={USDAI_ACCENT} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
            <thead>
              <tr>
                <th style={th}>MODEL</th>
                <th style={thR}>UNITS</th>
                <th style={thR}>VAST $/HR</th>
                <th style={thR}>LISTINGS</th>
                <th style={thR}>ATTESTED $/U</th>
                <th style={thR}>IMPLIED $/U</th>
                <th style={thR}>GAP</th>
              </tr>
            </thead>
            <tbody>
              {modelRows.map(r => (
                <tr key={r.model}>
                  <td style={td}>
                    {r.model}
                    {r.proxyUsed && <span style={{ ...dim, fontSize: 9, marginLeft: 6 }}>({r.proxyUsed} proxy)</span>}
                  </td>
                  <td style={tdR}>{r.units}</td>
                  <td style={tdR}>{r.medianDph != null ? `$${r.medianDph.toFixed(2)}` : "—"}</td>
                  <td style={tdR}>{r.listingCount || "—"}</td>
                  <td style={tdR}>{fmtUsdShort(r.attested)}</td>
                  <td style={tdR}>{r.implied != null ? fmtUsdShort(r.implied) : "—"}</td>
                  <td style={{ ...tdR, color: r.gapPct == null ? "#4f5e6f" : (r.gapPct >= 0 ? "#22d3ee" : "#f87171") }}>
                    {r.gapPct == null ? "—" : `${(r.gapPct * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
              {modelRows.length === 0 && (
                <tr><td colSpan={7} style={{ ...td, color: "#4f5e6f", textAlign: "center", padding: 16 }}>No data</td></tr>
              )}
            </tbody>
          </table>
        </ModuleCard>

        <ModuleCard>
          <SectionHeader title="Cash Reserve Assets" subtitle="T-Bills and stable reserves backing USDai" />
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>NAME</th>
                <th style={th}>CHAIN</th>
                <th style={thR}>APY</th>
                <th style={thR}>AMOUNT</th>
                <th style={thR}>RESERVE</th>
              </tr>
            </thead>
            <tbody>
              {(data?.tbills || []).map((t, i) => (
                <tr key={i}>
                  <td style={td}>
                    {t.iconUrl && <img src={t.iconUrl} alt="" style={{ width: 14, height: 14, verticalAlign: "middle", marginRight: 6, borderRadius: 3 }} />}
                    {t.name}
                  </td>
                  <td style={td}>{chainName(t.chain)}</td>
                  <td style={tdR}>{t.apy != null ? `${t.apy.toFixed(2)}%` : "—"}</td>
                  <td style={tdR}>{fmtUsdShort(t.amount)}</td>
                  <td style={tdR}>
                    {t.reserveLink && <a href={t.reserveLink} target="_blank" rel="noreferrer" style={{ color: USDAI_ACCENT, fontSize: 10 }}>view ↗</a>}
                  </td>
                </tr>
              ))}
              {(data?.tbills || []).length === 0 && (
                <tr><td colSpan={5} style={{ ...td, color: "#4f5e6f", textAlign: "center", padding: 16 }}>No reserve assets</td></tr>
              )}
            </tbody>
          </table>
        </ModuleCard>

        <div style={{ textAlign: "center", padding: "12px 0", fontSize: 10, color: "#3a4a5a", fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.025)" }}>
          USDai Dashboard · Data: api.usd.ai · metadata.usd.ai · cloud.vast.ai
        </div>
      </div>
    </div>
  );
}

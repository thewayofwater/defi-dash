import React from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useUsdaiData } from "../hooks/useUsdaiData";
import { SectionHeader, LoadingSpinner, ModuleCard } from "../components/Shared";

const mono = "'JetBrains Mono', monospace";
export const USDAI_ACCENT = "#c8b88a";

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

function LoansTable({ loans, selectedId, onSelect, accent }) {
  const [tab, setTab] = React.useState("deployed");

  const buckets = React.useMemo(() => {
    const d = loans.filter(l => l.isDeployed);
    const u = loans.filter(l => !l.isDeployed);
    return { deployed: d, upcoming: u };
  }, [loans]);

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
            {rows.map(loan => {
              const isSel = loan.documentId === selectedId;
              const coverage = (loan.attestedUsd && loan.principal) ? (loan.attestedUsd / loan.principal) : null;
              return (
                <React.Fragment key={loan.documentId}>
                  <tr onClick={() => onSelect(loan)}
                      style={{ cursor: "pointer", background: isSel ? `${accent}14` : undefined }}>
                    <td style={td}>
                      {loan.name}
                      {loan.isEscrowed && <span style={{ marginLeft: 6, color: "#94a3b8", fontSize: 10 }}>(Escrowed)</span>}
                    </td>
                    <td style={tdR}>{loan.apr != null ? `${loan.apr.toFixed(1)}%` : "—"}</td>
                    <td style={tdR}>{fmtUsdShort(loan.principal)}</td>
                  </tr>
                  {isSel && (
                    <tr>
                      <td colSpan={3} style={{ ...td, background: "rgba(255,255,255,0.02)", padding: "10px 8px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
                          <div><span style={dim}>Borrower:</span> {shortAddr(loan.borrower)}</div>
                          <div><span style={dim}>Location:</span> {loan.location?.name || "—"}</div>
                          <div><span style={dim}>Term:</span> {fmtTerm(loan.termSeconds)}</div>
                          <div><span style={dim}>Off-take:</span> {loan.offTake || "—"}</div>
                          <div>
                            <span style={dim}>Attested $:</span> {fmtUsdShort(loan.attestedUsd)}
                            {loan.attestedSource === "replacement-cost" && (
                              <span style={{ ...dim, fontSize: 9, marginLeft: 4 }}>(est)</span>
                            )}
                          </div>
                          <div>
                            <span style={dim}>Coverage:</span> {coverage != null ? `${(coverage * 100).toFixed(0)}%` : "—"}
                          </div>
                          {loan.tokenId != null && (
                            <div style={{ gridColumn: "1 / -1" }}>
                              <a href={`https://metadata.usd.ai/v1/${loan.tokenId}`} target="_blank" rel="noreferrer"
                                 style={{ color: accent, fontSize: 10 }}>
                                NFT #{loan.tokenId} ↗
                              </a>
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
  const [selectedLoanId, setSelectedLoanId] = React.useState(null);

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
          <div style={{ fontSize: 11, fontFamily: mono, color: "#fbbf24", padding: "6px 10px", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 5, background: "rgba(251,191,36,0.05)" }}>
            {data.warnings.length} partial data warning(s): {data.warnings.slice(0,3).join(" · ")}
          </div>
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
          <SectionHeader title="Loans" subtitle={`${(data?.loans || []).length} loans · click a row for detail`} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 0.42fr) 0.58fr", gap: 16 }}>
            <LoansTable
              loans={data?.loans || []}
              selectedId={selectedLoanId}
              onSelect={(l) => setSelectedLoanId(prev => prev === l.documentId ? null : l.documentId)}
              accent={USDAI_ACCENT}
            />
            <div style={{ minHeight: 380, border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#4f5e6f", fontFamily: mono, fontSize: 11 }}>
              Globe — added in T11
            </div>
          </div>
        </ModuleCard>

        <div style={{ textAlign: "center", padding: "12px 0", fontSize: 10, color: "#3a4a5a", fontFamily: mono, borderTop: "1px solid rgba(255,255,255,0.025)" }}>
          USDai Dashboard · Data: api.usd.ai · metadata.usd.ai · cloud.vast.ai
        </div>
      </div>
    </div>
  );
}

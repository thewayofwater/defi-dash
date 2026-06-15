import React from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot,
} from "recharts";
import { useUsdaiData } from "../hooks/useUsdaiData";
import { SectionHeader, LoadingSpinner, ModuleCard } from "../components/Shared";
import { DCF_DEFAULTS } from "../utils/usdai-dcf";
import LoanLifecycleChart from "../components/LoanLifecycleChart";

const UsdaiGlobe = React.lazy(() => import("../components/UsdaiGlobe"));

const mono = "'JetBrains Mono', monospace";
export const USDAI_ACCENT = "#c8b88a";

// USDai off-take enum (decoded from app.usd.ai source).
// 0 = NO_OFFTAKE, 1 = ON_DEMAND, 2 = CONTRACT
const OFFTAKE_LABELS = {
  0: "No Offtake",
  1: "On-Demand",
  2: "Contract",
};
const offtakeLabel = (v) => (v == null) ? "—" : (OFFTAKE_LABELS[v] || `code ${v}`);

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

// Interactive single-bar composition chart (matches the WBTC pool-health bar):
// one horizontal bar of proportional segments; hovering a segment dims the rest
// and pops a #131926 detail tooltip, with a color-dot legend below.
//   items = [{ key, label, color, value, tip: [lines] }]
function CompositionBar({ items }) {
  const [hoveredIdx, setHoveredIdx] = React.useState(null);
  const total = items.reduce((s, it) => s + (it.value || 0), 0) || 1;
  const shares = items.map(it => ((it.value || 0) / total) * 100);
  const midpointPct = (idx) => {
    let start = 0;
    for (let i = 0; i < idx; i++) start += shares[i];
    return start + shares[idx] / 2;
  };
  const hov = hoveredIdx != null ? items[hoveredIdx] : null;
  return (
    <div style={{ position: "relative", marginTop: 14 }}>
      <div style={{ display: "flex", height: 24, borderRadius: 4, overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
        {items.map((it, i) => (
          <div key={it.key}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{
              width: `${shares[i]}%`, background: it.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontFamily: mono, color: "#0a0e17", fontWeight: 600,
              overflow: "hidden", whiteSpace: "nowrap",
              opacity: hoveredIdx == null || hoveredIdx === i ? 1 : 0.45,
              transition: "opacity 0.12s", cursor: "default",
            }}>
            {shares[i] >= 10 ? `${shares[i].toFixed(0)}%` : ""}
          </div>
        ))}
      </div>
      {hov && (
        <div style={{
          position: "absolute", top: 32, left: `${midpointPct(hoveredIdx)}%`,
          transform: "translateX(-50%)", background: "#131926",
          border: `1px solid ${hov.color}40`, borderRadius: 5, padding: "8px 11px",
          fontSize: 10, fontFamily: mono, color: "#e2e8f0", whiteSpace: "nowrap",
          zIndex: 20, boxShadow: "0 4px 14px rgba(0,0,0,0.4)", pointerEvents: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: (hov.tip || []).length ? 4 : 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: hov.color, display: "inline-block" }} />
            <span style={{ fontWeight: 600 }}>{hov.label}</span>
            <span style={{ color: "#6b7a8d" }}>· {shares[hoveredIdx].toFixed(1)}%</span>
          </div>
          {(hov.tip || []).map((line, j) => <div key={j} style={{ color: "#94a3b8" }}>{line}</div>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10, fontFamily: mono, color: "#94a3b8", flexWrap: "wrap" }}>
        {items.map((it, i) => (
          <span key={it.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: it.color, display: "inline-block" }} />
            {it.label} {shares[i].toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}

// Reusable hover tooltip — matches the recharts tooltip styling (#131926 card)
// so every explanatory tooltip across the dashboard looks the same.
//   heading  — optional bold lead line (what the thing IS)
//   text     — body (how it's computed / how to read it)
//   children — the trigger; omit to render a small ⓘ marker
//   align    — horizontal anchor so edge columns don't clip
function InfoTip({ text, heading, children, align = "center", width = 260 }) {
  const [show, setShow] = React.useState(false);
  const pos =
    align === "left"  ? { left: 0,   transform: "none" } :
    align === "right" ? { right: 0,  transform: "none" } :
                        { left: "50%", transform: "translateX(-50%)" };
  return (
    <span style={{ position: "relative", display: "inline-block" }}
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}>
      {children ?? (
        <span style={{ marginLeft: 4, opacity: 0.55, cursor: "help", fontSize: 10 }}>ⓘ</span>
      )}
      {show && (
        <span style={{
          position: "absolute",
          bottom: "calc(100% + 7px)",
          ...pos,
          width,
          background: "#131926",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 6,
          padding: "9px 11px",
          fontSize: 10.5,
          lineHeight: 1.55,
          fontFamily: mono,
          fontWeight: 400,
          color: "#cbd5e1",
          textTransform: "none",
          letterSpacing: 0,
          textAlign: "left",
          boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
          zIndex: 1000,
          whiteSpace: "normal",
          pointerEvents: "none",
        }}>
          {heading && (
            <span style={{ display: "block", color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>{heading}</span>
          )}
          {text}
        </span>
      )}
    </span>
  );
}

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
                    <td style={tdR}>{fmtUsdShort(g.remainingPrincipal ?? g.principal)}</td>
                  </tr>
                  {isSel && (
                    <tr>
                      <td colSpan={3} style={{ ...td, background: "rgba(255,255,255,0.02)", padding: "10px 8px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
                          <div>
                            <span style={dim}>Operator:</span>{" "}
                            {g.operator
                              ? <span style={{ color: "#e2e8f0" }}>{g.operator}</span>
                              : <span style={dim}>unknown</span>}
                          </div>
                          <div>
                            <span style={dim}>Borrower:</span> {shortAddr(g.borrower)}
                            {g.borrowers?.length > 1 && <span style={{ ...dim, fontSize: 9, marginLeft: 4 }}>(+{g.borrowers.length - 1})</span>}
                          </div>
                          <div><span style={dim}>Location:</span> {g.location?.name || "—"}</div>
                          <div><span style={dim}>Term:</span> {fmtTerm(g.termSeconds)}</div>
                          <div>
                            <span style={dim}>Off-take:</span>{" "}
                            <InfoTip align="left" width={240}
                              heading={offtakeLabel(g.offTake)}
                              text={
                                g.offTake === 2 ? "A buyer is contractually locked in to purchase this loan's compute output at a fixed rate — the most predictable revenue profile." :
                                g.offTake === 1 ? "Compute is sold ad-hoc through a broker or marketplace — rates can beat contract pricing, but revenue is variable." :
                                g.offTake === 0 ? "No compute buyer secured yet — revenue depends on the borrower finding renters. The most speculative profile." :
                                "Off-take status not reported for this loan."
                              }>
                              <span style={{ cursor: "help", borderBottom: "1px dotted rgba(255,255,255,0.25)" }}>{offtakeLabel(g.offTake)}</span>
                            </InfoTip>
                          </div>
                          <div>
                            <InfoTip align="left" width={260} heading="Attested collateral value"
                              text="The USD value of GPU hardware pledged against this loan, read from USDai's on-chain collateral NFTs (each carries a 'Collateral Value USD' attribute). The label in parentheses shows how it was sourced — aggregate roll-up NFT, on-chain bundle, directly-held NFTs, or an estimate when no NFT is linked yet. LTV below = principal ÷ this value.">
                              <span style={{ ...dim, cursor: "help", borderBottom: "1px dotted rgba(255,255,255,0.25)" }}>
                                {g.attestedSource === "nft-aggregate" ? "Attested $ (aggregate NFT):"
                                  : g.attestedSource === "nft-bundle" ? "Attested $ (bundle NFTs):"
                                  : g.attestedSource === "nft-direct" ? "Attested $ (direct NFTs):"
                                  : g.attestedSource === "nft-per-server" ? "Attested $ (per-server NFTs):"
                                  : g.attestedSource === "replacement-cost" ? "Replacement-cost est:"
                                  : "Attested $:"}
                              </span>
                            </InfoTip> {fmtUsdShort(g.attestedUsd)}
                            {g.attestedSource === "nft-bundle" && g.bundleIds?.length > 1 && (
                              <InfoTip align="left" width={240} heading="Multiple bundles"
                                text={`Collateral value summed across the ${g.bundleIds.length} on-chain NFT bundles pledged against this loan group.`}>
                                <span style={{ ...dim, fontSize: 9, marginLeft: 4, cursor: "help" }}>({g.bundleIds.length} bundles)</span>
                              </InfoTip>
                            )}
                            {g.attestedSource === "nft-per-server" && (
                              <InfoTip align="left" width={250} heading="Estimated collateral"
                                text="No on-chain collateral bundle is linked to this borrower yet (typical for loans not fully deployed). Value estimated from the median price of comparable per-server NFTs × GPU count.">
                                <span style={{ ...dim, fontSize: 9, marginLeft: 4, cursor: "help" }}>(estimate)</span>
                              </InfoTip>
                            )}
                            {g.attestedSource === "replacement-cost" && (
                              <InfoTip align="left" width={250} heading="No on-chain data"
                                text="No NFT collateral data found for this loan. Last-resort estimate using published NVIDIA list prices × GPU count — the least reliable figure here.">
                                <span style={{ ...dim, fontSize: 9, marginLeft: 4, cursor: "help" }}>(no NFT data)</span>
                              </InfoTip>
                            )}
                          </div>
                          <div>
                            <span style={dim}>{g.isDeployed ? "LTV:" : "Projected LTV:"}</span> {ltv != null ? `${(ltv * 100).toFixed(0)}%` : "—"}
                            {ltv != null && g.isDeployed && ltv > 0.8 && (
                              <span style={{ color: "#fbbf24", fontSize: 9, marginLeft: 4 }}>(above 80% cap)</span>
                            )}
                            {ltv != null && !g.isDeployed && (
                              <InfoTip align="left" width={280} heading="Projected — not yet funded"
                                text="This loan is still in the pipeline (not deployed), so its collateral NFTs aren't on-chain yet. LTV is estimated from comparable per-server NFT values × unit count; the final ratio is locked when the loan funds and collateral is posted — so an estimate above the 80% cap here isn't a breach.">
                                <span style={{ ...dim, fontSize: 9, marginLeft: 4, cursor: "help", borderBottom: "1px dotted rgba(255,255,255,0.25)" }}>(collateral not yet on-chain)</span>
                              </InfoTip>
                            )}
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
                        <LoanLifecycleChart
                          originationDate={g.originationDate}
                          maturityDate={g.maturityDate}
                          originalPrincipal={g.principal}
                          remainingPrincipal={g.remainingPrincipal}
                          originalCollateral={g.attestedUsd}
                          accent={accent}
                        />
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

// Compact risk-summary stat tile with a hover InfoTip.
function RiskStat({ label, value, sub, accent, tip }) {
  return (
    <div style={{
      flex: 1, minWidth: 130, padding: "9px 12px",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 9, fontFamily: mono, color: "#6b7a8d", letterSpacing: 1, textTransform: "uppercase" }}>
        {label}{tip && <InfoTip heading={tip.heading} text={tip.text} align="left" />}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent || "#e2e8f0", fontFamily: mono, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#4f5e6f", fontFamily: mono, marginTop: 2 }}>{sub}</div>}
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

function Kpi({ label, value, sub, accent, title }) {
  return (
    <div style={{
      flex: 1, minWidth: 140, padding: "10px 14px",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 9, fontFamily: mono, color: "#6b7a8d", letterSpacing: 1, textTransform: "uppercase" }}>
        {label}{title && <InfoTip text={title} align="left" />}
      </div>
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

  // Only utilization remains tunable; the rest of the DCF knobs were retired
  // when the GPU cross-check was replaced by the loan income coverage table.
  const [utilization, setUtilization] = React.useState(DCF_DEFAULTS.utilization);
  const dcfParams = React.useMemo(() => ({ ...DCF_DEFAULTS, utilization }), [utilization]);

  // Reserves & TVL chart view: "reserves" (stablecoin vs loans) or "staking" (USDai vs sUSDai).
  const [tvlView, setTvlView] = React.useState("reserves");

  // For each deployed loan, compute annual interest, projected rental income
  // at the current utilization slider, and coverage ratio (revenue / interest).
  const coverageRows = React.useMemo(() => {
    const rentals = data?.gpuRentals || {};
    const util = dcfParams.utilization;

    // Reconcile name-encoded GPU count vs hardware.count field. USDai's loan
    // names embed counts in brackets (e.g. "B200 [8]" → 8 GPUs). For most
    // loans this matches hardware.count exactly. When it doesn't (data entry
    // error on USDai's side — currently only "B200 [8]" disagrees), prefer
    // the larger value so we don't under-count GPUs in revenue calculation.
    const reconcile = (name, hardware) => {
      const brackets = (name || "").match(/\[(\d+)\]/g);
      if (!brackets || brackets.length !== hardware.length) return { hardware, mismatch: false };
      const bracketNums = brackets.map(b => parseInt(b.slice(1, -1), 10));
      let mismatch = false;
      const reconciled = hardware.map((h, i) => {
        const fromName = bracketNums[i] || 0;
        if (fromName !== (h.count || 0)) mismatch = true;
        return { ...h, count: Math.max(h.count || 0, fromName) };
      });
      return { hardware: reconciled, mismatch };
    };

    const rows = (data?.loanGroups || [])
      .filter(g => g.isDeployed && g.principal > 0 && g.apr != null)
      .map(g => {
        const { hardware, mismatch } = reconcile(g.name, g.hardware || []);
        const principal = g.remainingPrincipal ?? g.principal;
        const annualInterest = principal * (g.apr / 100);
        let annualRental = 0;
        let missing = [];
        const sources = new Set();
        for (const h of hardware) {
          if (!h.count) continue;
          // Prefer the server-computed effectiveDph (ORN primary, Vast.ai fallback).
          // Fall back to a direct Vast.ai lookup if effectiveDph is absent.
          const dph = h.effectiveDph
                  ?? (h.vastGpuName && rentals[h.vastGpuName]?.medianDph)
                  ?? (h.vastProxy   && rentals[h.vastProxy]?.medianDph)
                  ?? null;
          if (dph) {
            annualRental += h.count * dph * 8760 * util;
            if (h.rateSource) sources.add(h.rateSource);
          } else {
            missing.push(h.name);
          }
        }
        const coverage = annualInterest > 0 ? annualRental / annualInterest : null;
        return {
          groupKey: g.groupKey,
          name: g.name,
          hardware,
          principal,
          apr: g.apr,
          offTake: g.offTake,
          annualInterest,
          annualRental,
          coverage,
          missingHardware: missing,
          reconciled: mismatch,
          rateSources: [...sources],   // ["orn"], ["vast"], or both
        };
      })
      .sort((a, b) => (b.principal || 0) - (a.principal || 0));
    return rows;
  }, [data, dcfParams.utilization]);

  // ORN Compute Index 90-day history → recharts series (one field per GPU model).
  const ornTrend = React.useMemo(() => {
    const idx = data?.ornIndex || {};
    const models = Object.keys(idx).filter(m => idx[m]?.history?.length);
    if (!models.length) return { rows: [], models: [] };
    // Merge all GPU histories into rows keyed by date.
    const byDate = new Map();
    for (const m of models) {
      for (const pt of idx[m].history) {
        const row = byDate.get(pt.date) || { date: pt.date };
        row[m] = pt.value;
        byDate.set(pt.date, row);
      }
    }
    const rows = [...byDate.values()].sort((a, b) => a.date - b.date);
    return { rows, models };
  }, [data]);

  // Distinct colors for GPU trend lines
  const ORN_COLORS = ["#22d3ee", USDAI_ACCENT, "#fb923c", "#a78bfa", "#4ade80", "#f472b6"];

  // ── Operator (borrower) concentration ──────────────────────────────────────
  const operatorConcentration = React.useMemo(() => {
    const deployed = (data?.loanGroups || []).filter(g => g.isDeployed);
    const totalLoanBook = deployed.reduce((s, g) => s + (g.remainingPrincipal ?? g.principal ?? 0), 0);
    const byOp = new Map();
    for (const g of deployed) {
      const key = g.operator || "Unknown";
      const principal = g.remainingPrincipal ?? g.principal ?? 0;
      const att = g.attestedUsd || 0;
      const e = byOp.get(key) || { operator: key, principal: 0, attested: 0, loanCount: 0, locations: new Set() };
      e.principal += principal;
      e.attested += att;
      e.loanCount += 1;
      if (g.location?.name) e.locations.add(g.location.name);
      byOp.set(key, e);
    }
    return {
      totalLoanBook,
      rows: [...byOp.values()].map(e => ({
        ...e,
        locations: [...e.locations],
        share: totalLoanBook ? e.principal / totalLoanBook : 0,
        ltv: e.attested ? e.principal / e.attested : null,
      })).sort((a, b) => b.principal - a.principal),
    };
  }, [data]);

  // ── Portfolio risk summary ─────────────────────────────────────────────────
  const portfolio = React.useMemo(() => {
    const deployed = (data?.loanGroups || []).filter(g => g.isDeployed);
    const book = deployed.reduce((s, g) => s + (g.remainingPrincipal ?? g.principal ?? 0), 0);
    const attested = deployed.reduce((s, g) => s + (g.attestedUsd || 0), 0);
    // Principal-weighted LTV
    const wLtv = attested ? book / attested : null;
    // Principal-weighted coverage (from coverageRows)
    const totalInt = coverageRows.reduce((s, r) => s + r.annualInterest, 0);
    const totalRent = coverageRows.reduce((s, r) => s + r.annualRental, 0);
    const wCoverage = totalInt ? totalRent / totalInt : null;
    // Off-take mix by principal
    let contracted = 0;
    for (const g of deployed) if (g.offTake === 2) contracted += (g.remainingPrincipal ?? g.principal ?? 0);
    const contractedPct = book ? contracted / book : null;
    // Liquidity buffer
    const stable = data?.reserves?.stablecoin ?? null;
    const total = data?.reserves?.total ?? null;
    const liquidPct = (stable != null && total) ? stable / total : null;
    return { book, attested, wLtv, wCoverage, contractedPct, stable, total, liquidPct,
             topOperatorShare: operatorConcentration.rows[0]?.share ?? null,
             topOperator: operatorConcentration.rows[0]?.operator ?? null };
  }, [data, coverageRows, operatorConcentration]);

  // ── Loan cash-flow coverage curve ───────────────────────────────────────────
  // sUSDai is the only tranche exposed to the GPU loans, and within it the loan
  // book is the only illiquid asset — so the liquidity question reduces to "how
  // fast does the loan book convert back to cash?". We plot cumulative cash
  // returned (principal repaid + interest accrued under straight-line
  // amortization to maturity) as a % of today's deployed book — ~25% by 6mo,
  // ~50% by 1yr — and keep outstanding principal ($) as a secondary line for the
  // duration / maturity-wind-down story.
  const runoff = React.useMemo(() => {
    const deployed = (data?.loanGroups || []).filter(g => g.isDeployed && g.maturityDate);
    if (!deployed.length) return { rows: [], wadYears: null, lastMaturity: null, book: 0 };
    const now = Date.now();
    const monthMs = 30.4375 * 24 * 3600 * 1000;
    const YEAR = 365 * 24 * 3600 * 1000;
    const lastMaturity = Math.max(...deployed.map(g => g.maturityDate));
    const principalOf = (g) => g.remainingPrincipal ?? g.principal ?? 0;
    const book = deployed.reduce((s, g) => s + principalOf(g), 0);

    let wadNum = 0, wadDen = 0;
    for (const g of deployed) {
      const p = principalOf(g);
      wadNum += p * Math.max(0, (g.maturityDate - now) / YEAR);
      wadDen += p;
    }

    // Outstanding principal for one loan at time t (straight-line, now→maturity).
    const loanOutstanding = (g, t) => {
      const p = principalOf(g);
      if (t >= g.maturityDate) return 0;
      if (t <= now) return p;
      const span = g.maturityDate - now;
      return span > 0 ? p * (g.maturityDate - t) / span : 0;
    };
    const totalOutstanding = (t) => deployed.reduce((s, g) => s + loanOutstanding(g, t), 0);
    // Interest accrued across [t0,t1] = Σ loans (avg outstanding × apr × Δyears).
    const intervalInterest = (t0, t1) => {
      const dYears = (t1 - t0) / YEAR;
      let intr = 0;
      for (const g of deployed) {
        const apr = (g.apr || 0) / 100;
        intr += ((loanOutstanding(g, t0) + loanOutstanding(g, t1)) / 2) * apr * dYears;
      }
      return intr;
    };

    const rows = [{ t: now, outstanding: book, coverage: 0 }];
    const steps = Math.ceil((lastMaturity - now) / monthMs) + 1;
    let cumInterest = 0;
    for (let i = 1; i <= steps; i++) {
      const t0 = now + (i - 1) * monthMs;
      const t = now + i * monthMs;
      cumInterest += intervalInterest(t0, t);
      const out = totalOutstanding(t);
      const coverage = book ? ((book - out + cumInterest) / book) * 100 : 0;
      rows.push({ t, outstanding: out, coverage });
      if (t > lastMaturity) break;
    }
    const at = (m) => rows[m] || rows[rows.length - 1];
    return {
      rows,
      book,
      wadYears: wadDen ? wadNum / wadDen : null,
      lastMaturity,
      m6: { t: at(6).t, coverage: at(6).coverage },
      m12: { t: at(12).t, coverage: at(12).coverage },
    };
  }, [data]);

  // ── Deployment pipeline by stage (from expected-APY breakdown) ──────────────
  // Capital by deal stage, bucketed directly from the loan groups so it's
  // discrete and non-overlapping (reconciles with the loans table + loan book).
  // NB: do NOT source this from kpis.expectedApyBreakdown — its "committed"
  // figure is a cumulative roll-up of the entire book (it already contains the
  // "active"/escrowed/term-sheet capital), so shown as peer buckets it
  // double-counts to ~$860M. Deployed uses remaining outstanding (matches the
  // Loan Book); not-yet-funded loans use full principal (== remaining anyway).
  const pipeline = React.useMemo(() => {
    const groups = data?.loanGroups || [];
    if (!groups.length) return [];
    const amtOf = (g) => g.isDeployed ? (g.remainingPrincipal ?? g.principal ?? 0) : (g.principal ?? 0);
    const buckets = [
      ["deployed", "Deployed", "#22d3ee", (g) => g.isDeployed],
      ["escrowed", "Escrowed", "#fb923c", (g) => !g.isDeployed && g.isEscrowed],
      ["upcoming", "Upcoming", USDAI_ACCENT, (g) => !g.isDeployed && !g.isEscrowed],
    ];
    return buckets
      .map(([key, label, color, pred]) => {
        const gs = groups.filter(pred);
        const amount = gs.reduce((s, g) => s + amtOf(g), 0);
        const wApr = amount ? gs.reduce((s, g) => s + amtOf(g) * (g.apr || 0), 0) / amount : null;
        return { key, label, color, amount, count: gs.length, apy: wApr };
      })
      .filter((b) => b.count > 0);
  }, [data]);

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
          <Kpi label="Stake Rate"     value={fmtPct(data?.kpis?.stakeRate)}
               sub={`sUSDai vault / TVL`}
               title="Share of all USDai staked into the sUSDai yield vault (sUSDai TVL ÷ total TVL). USDai's own dashboard labels this 'Utilization'." />
          <Kpi label="sUSDai TVL"     value={fmtUsdShort(data?.kpis?.sUsdaiTvl)}
               sub={`USDai TVL ${fmtUsdShort(data?.kpis?.usdaiTvl)}`} />
        </div>

        <ModuleCard>
          <SectionHeader title="Portfolio Risk Summary" subtitle="Book-level view of the deployed loan portfolio and depositor liquidity." />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <RiskStat label="Loan book" value={fmtUsdShort(portfolio.book)}
              tip={{ heading: "Deployed loan book", text: "Total outstanding principal across all deployed loans — the capital currently at credit risk." }} />
            <RiskStat label="Wtd. LTV" value={portfolio.wLtv != null ? `${(portfolio.wLtv*100).toFixed(0)}%` : "—"}
              accent={portfolio.wLtv > 0.8 ? "#fbbf24" : "#e2e8f0"}
              tip={{ heading: "Principal-weighted LTV", text: "Loan book ÷ total attested collateral, weighted by loan size. USDai caps individual loans at 80% LTV; the book sits well below that." }} />
            <RiskStat label="Wtd. coverage" value={portfolio.wCoverage != null ? `${portfolio.wCoverage.toFixed(2)}×` : "—"}
              accent={portfolio.wCoverage >= 1.2 ? "#22d3ee" : portfolio.wCoverage >= 0.8 ? "#fbbf24" : "#f87171"}
              tip={{ heading: "Portfolio income coverage", text: "Total annual rental income ÷ total annual interest across the book. Above 1.0× the portfolio's GPU rentals cover its interest at current market rates." }} />
            <RiskStat label="Contracted off-take" value={portfolio.contractedPct != null ? `${(portfolio.contractedPct*100).toFixed(0)}%` : "—"}
              tip={{ heading: "Share with contracted revenue", text: "% of the loan book where the borrower has a fixed-rate compute off-take contract (most predictable revenue). The rest relies on spot rental or is unsold." }} />
            <RiskStat label="Liquidity buffer" value={portfolio.liquidPct != null ? `${(portfolio.liquidPct*100).toFixed(0)}%` : "—"}
              accent={portfolio.liquidPct >= 0.5 ? "#22d3ee" : "#fbbf24"}
              tip={{ heading: "Redeemable on demand", text: `${fmtUsdShort(portfolio.stable)} of stablecoin reserves vs ${fmtUsdShort(portfolio.total)} TVL. This share of deposits could redeem immediately before touching illiquid GPU loans — the first line of defense in a redemption spike.` }} />
            <RiskStat label="Top operator" value={portfolio.topOperatorShare != null ? `${(portfolio.topOperatorShare*100).toFixed(0)}%` : "—"}
              accent={portfolio.topOperatorShare > 0.4 ? "#fbbf24" : "#e2e8f0"}
              tip={{ heading: "Largest borrower concentration", text: `${portfolio.topOperator || "—"} is the biggest single borrower at this share of the loan book. High single-counterparty concentration amplifies the impact of any one default.` }} />
          </div>
        </ModuleCard>

        <ModuleCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <SectionHeader title="Reserves & TVL"
              subtitle={tvlView === "reserves"
                ? "Stablecoin reserves vs deployed loans over time"
                : "Unstaked USDai vs staked sUSDai share of TVL over time"} />
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {[["reserves", "Reserves"], ["staking", "USDai / sUSDai"]].map(([k, label]) => (
                <button key={k} onClick={() => setTvlView(k)}
                  style={{
                    background: tvlView === k ? `${USDAI_ACCENT}22` : "rgba(255,255,255,0.025)",
                    border: `1px solid ${tvlView === k ? `${USDAI_ACCENT}55` : "rgba(255,255,255,0.05)"}`,
                    borderRadius: 5, padding: "6px 10px", fontSize: 11, fontFamily: mono,
                    color: tvlView === k ? USDAI_ACCENT : "#94a3b8", cursor: "pointer", whiteSpace: "nowrap",
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {(data?.tvlHistory?.length || 0) === 0 ? (
            <div style={{ padding: 30, textAlign: "center", fontFamily: mono, fontSize: 11, color: "#4f5e6f" }}>
              TVL history unavailable
            </div>
          ) : (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <ComposedChart data={data.tvlHistory} margin={{ top: 12, right: 12, left: 8, bottom: 0 }}>
                  <XAxis dataKey="date"
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
                    minTickGap={40} />
                  <YAxis yAxisId="left" tickFormatter={fmtUsdShort}
                    tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }} />
                  <Tooltip {...tooltipStyle}
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                    formatter={(v, k) => [fmtUsdShort(v), k]} />
                  {tvlView === "reserves" && (
                    <Area yAxisId="left" type="monotone" dataKey="stablecoin" stackId="1"
                          stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.22} name="Stablecoin" />
                  )}
                  {tvlView === "reserves" && (
                    <Area yAxisId="left" type="monotone" dataKey="loans" stackId="1"
                          stroke={USDAI_ACCENT} fill={USDAI_ACCENT} fillOpacity={0.30} name="Loans" />
                  )}
                  {tvlView === "staking" && (
                    <Area yAxisId="left" type="monotone" dataKey="usdai" stackId="1"
                          stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.22} name="USDai" />
                  )}
                  {tvlView === "staking" && (
                    <Area yAxisId="left" type="monotone" dataKey="sUsdai" stackId="1"
                          stroke={USDAI_ACCENT} fill={USDAI_ACCENT} fillOpacity={0.30} name="sUSDai" />
                  )}
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
            <div style={{ display: "flex", flexDirection: "column" }}>
              <React.Suspense fallback={
                <div style={{ minHeight: 380, display: "flex", alignItems: "center", justifyContent: "center", color: "#4f5e6f", fontFamily: mono, fontSize: 11 }}>
                  Loading globe…
                </div>
              }>
                <UsdaiGlobe ref={globeRef} points={globePoints} onPointClick={handleDotClick} accent={USDAI_ACCENT} />
              </React.Suspense>
              {/* Legend: pin color = loan stage, pin height/width ∝ loan principal */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", marginTop: 6, fontSize: 10, fontFamily: mono, color: "#94a3b8" }}>
                {[["Deployed", USDAI_ACCENT], ["Escrowed", "#fbbf24"], ["Pipeline", "#6b7a8d"]].map(([label, c]) => (
                  <span key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block" }} />
                    {label}
                  </span>
                ))}
                <span style={{ color: "#6b7a8d", marginLeft: "auto" }}>pin size ∝ loan principal</span>
              </div>
            </div>
          </div>
        </ModuleCard>

        <ModuleCard>
          <SectionHeader
            title="Loan Income Coverage"
            subtitle="Can each loan service its interest from market-rate GPU rental income?" />

          <div style={{ marginBottom: 14, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 5, background: "rgba(255,255,255,0.015)", maxWidth: 320 }}>
            <Slider label="Utilization" value={utilization} min={0.50} max={0.95} step={0.01}
                    fmt={v => `${(v*100).toFixed(0)}%`}
                    onChange={setUtilization} accent={USDAI_ACCENT} />
          </div>

          {Object.keys(data?.gpuRentals || {}).length === 0 && Object.keys(data?.ornIndex || {}).length === 0 && (
            <div style={{ padding: 16, fontFamily: mono, fontSize: 11, color: "#fbbf24", background: "rgba(251,191,36,0.04)", borderRadius: 5, marginBottom: 12 }}>
              No rental-rate data available (ORN + Vast.ai both unreachable) — coverage can't be computed.
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>LOAN</th>
                <th style={thR}>
                  <InfoTip align="right" heading="Outstanding principal"
                    text="The balance still owed today, after monthly principal repayments — not the original loan size. Every ratio in this row is computed from this figure.">
                    <span style={{ cursor: "help" }}>PRINCIPAL ⓘ</span>
                  </InfoTip>
                </th>
                <th style={thR}>
                  <InfoTip align="right" heading="Annual interest rate"
                    text="The fixed rate the borrower pays, locked in at origination. Rates don't change over the loan's life, and borrowers may repay early without penalty.">
                    <span style={{ cursor: "help" }}>APR ⓘ</span>
                  </InfoTip>
                </th>
                <th style={thR}>
                  <InfoTip align="right" heading="Interest owed per year"
                    text="Outstanding principal × APR. This is the cash the loan must produce each year just to stay current — principal repayment is on top of it.">
                    <span style={{ cursor: "help" }}>ANNUAL INTEREST ⓘ</span>
                  </InfoTip>
                </th>
                <th style={thR}>
                  <InfoTip align="right" heading="Est. yearly rental revenue"
                    text={`If every GPU in the loan were rented out: GPU count × market rate ($/hr) × 8,760 hrs/yr × ${Math.round(dcfParams.utilization * 100)}% utilization. Rate comes from the ORN Compute Index (or Vast.ai where ORN has no coverage). Drag the Utilization slider above to test other assumptions.`}>
                    <span style={{ cursor: "help" }}>ANNUAL RENTAL @ {Math.round(dcfParams.utilization * 100)}% ⓘ</span>
                  </InfoTip>
                </th>
                <th style={th}>
                  <InfoTip align="center" heading="Rental-rate source"
                    text="Where the $/hr rate came from. ORN = ORN Compute Index, an institutional GPU-rate benchmark (preferred). VAST = median of live Vast.ai marketplace listings (fallback, and the only source for workstation cards). Mixed-hardware loans can show both.">
                    <span style={{ cursor: "help" }}>RATE SRC ⓘ</span>
                  </InfoTip>
                </th>
                <th style={thR}>
                  <InfoTip align="right" heading="Income coverage ratio"
                    text="Annual Rental ÷ Annual Interest — how comfortably GPU rental income covers the interest. 1.0× = exactly covers it at current rates; higher is safer. Green ≥ 1.2× (self-funding with headroom), amber 0.8–1.2× (thin), red < 0.8× (rentals alone fall short — the loan leans on off-take income, borrower equity, or other cash).">
                    <span style={{ cursor: "help" }}>COVERAGE ⓘ</span>
                  </InfoTip>
                </th>
                <th style={th}>
                  <InfoTip align="right" heading="Compute off-take"
                    text="Whether the GPUs' output is pre-sold. Contract = a buyer is locked in at a fixed rate (most predictable). On-Demand = sold ad-hoc via a marketplace (higher but variable). No Offtake = no buyer secured yet (most speculative). Strong off-take matters most when coverage is thin.">
                    <span style={{ cursor: "help" }}>OFF-TAKE ⓘ</span>
                  </InfoTip>
                </th>
              </tr>
            </thead>
            <tbody>
              {coverageRows.map(r => {
                const cov = r.coverage;
                const covColor =
                  cov == null     ? "#4f5e6f" :
                  cov >= 1.2      ? "#22d3ee" :    // healthy
                  cov >= 0.8      ? "#fbbf24" :    // borderline
                                    "#f87171";    // under-covered
                const covLabel = cov == null ? "—" : `${cov.toFixed(2)}×`;
                return (
                  <tr key={r.groupKey}>
                    <td style={td}>
                      {r.name}
                      {r.reconciled && (
                        <InfoTip align="left" heading="GPU count reconciled"
                          text="USDai reports two different GPU counts for this loan (its structured data vs. its name). We used the larger so rental revenue — and therefore coverage — isn't understated.">
                          <span style={{ ...dim, fontSize: 9, marginLeft: 6, color: "#fbbf24", cursor: "help" }}>(count reconciled)</span>
                        </InfoTip>
                      )}
                      {r.missingHardware.length > 0 && (
                        <InfoTip align="left" heading="Partial rental data"
                          text={`No market rate available for: ${r.missingHardware.join(", ")}. These GPUs are left out of the rental estimate, so this loan's coverage is understated (actual is higher).`}>
                          <span style={{ ...dim, fontSize: 9, marginLeft: 6, cursor: "help" }}>(partial)</span>
                        </InfoTip>
                      )}
                    </td>
                    <td style={tdR}>{fmtUsdShort(r.principal)}</td>
                    <td style={tdR}>{r.apr.toFixed(1)}%</td>
                    <td style={tdR}>{fmtUsdShort(r.annualInterest)}</td>
                    <td style={tdR}>{fmtUsdShort(r.annualRental)}</td>
                    <td style={td}>
                      {r.rateSources.length === 0 ? <span style={dim}>—</span>
                        : r.rateSources.map(s => (
                            <InfoTip key={s} align="center" width={230}
                              heading={s === "orn" ? "ORN Compute Index" : "Vast.ai marketplace"}
                              text={s === "orn" ? "Institutional GPU rental-rate benchmark (api.ornnai.com). The preferred rate source." : "Median of live per-GPU listings on the Vast.ai marketplace. Used as fallback, and as the only source for workstation cards like the RTX PRO 6000."}>
                              <span style={{ fontSize: 9, marginRight: 4, padding: "1px 5px", borderRadius: 3, cursor: "help",
                                background: s === "orn" ? "rgba(34,211,238,0.12)" : "rgba(200,184,138,0.12)",
                                color: s === "orn" ? "#22d3ee" : USDAI_ACCENT, fontFamily: mono }}>
                                {s.toUpperCase()}
                              </span>
                            </InfoTip>
                          ))}
                    </td>
                    <td style={{ ...tdR, color: covColor, fontWeight: 700 }}>{covLabel}</td>
                    <td style={td}>
                      {r.offTake === 2 ? <span style={{ color: "#22d3ee" }}>Contract</span>
                        : r.offTake === 1 ? <span style={{ color: "#fbbf24" }}>On-Demand</span>
                        : <span style={dim}>No Offtake</span>}
                    </td>
                  </tr>
                );
              })}
              {coverageRows.length === 0 && (
                <tr><td colSpan={8} style={{ ...td, color: "#4f5e6f", textAlign: "center", padding: 16 }}>No deployed loans</td></tr>
              )}
            </tbody>
          </table>

          {/* Summary row: portfolio-level coverage */}
          {coverageRows.length > 0 && (
            <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 5, background: "rgba(255,255,255,0.015)", fontSize: 11, fontFamily: mono, color: "#94a3b8", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <span>Portfolio total:</span>
              <span>
                Interest: <span style={{ color: "#e2e8f0" }}>{fmtUsdShort(coverageRows.reduce((s, r) => s + r.annualInterest, 0))}</span>
                {"  ·  "}
                Rental: <span style={{ color: "#e2e8f0" }}>{fmtUsdShort(coverageRows.reduce((s, r) => s + r.annualRental, 0))}</span>
                {"  ·  "}
                {(() => {
                  const totalInt = coverageRows.reduce((s, r) => s + r.annualInterest, 0);
                  const totalRev = coverageRows.reduce((s, r) => s + r.annualRental, 0);
                  const portCov = totalInt > 0 ? totalRev / totalInt : null;
                  const c = portCov == null ? "#4f5e6f" : portCov >= 1.2 ? "#22d3ee" : portCov >= 0.8 ? "#fbbf24" : "#f87171";
                  return <>Coverage: <span style={{ color: c, fontWeight: 700 }}>{portCov == null ? "—" : `${portCov.toFixed(2)}×`}</span></>;
                })()}
              </span>
            </div>
          )}
        </ModuleCard>

        {/* Loan cash-flow coverage curve */}
        {runoff.rows.length > 0 && (
          <ModuleCard>
            <SectionHeader title="Loan Cash Coverage"
              subtitle={`Cumulative cash returned — principal + interest — as a share of the deployed loan book (${fmtUsdShort(runoff.book)}).`} />
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <ComposedChart data={runoff.rows} margin={{ top: 14, right: 6, left: 0, bottom: 4 }}>
                  <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
                    tick={{ fill: "#6b7a8d", fontSize: 9, fontFamily: mono }} minTickGap={50} />
                  <YAxis yAxisId="cov" tickFormatter={(v) => `${v}%`} domain={[0, "auto"]}
                    tick={{ fill: "#6b7a8d", fontSize: 9, fontFamily: mono }} width={40} />
                  <YAxis yAxisId="bal" orientation="right" tickFormatter={fmtUsdShort}
                    tick={{ fill: "#5b6b7d", fontSize: 9, fontFamily: mono }} width={46} />
                  <Tooltip {...tooltipStyle}
                    labelFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                    formatter={(v, name) => name === "coverage"
                      ? [`${Number(v).toFixed(1)}%`, "Cash returned (P+I)"]
                      : [fmtUsdShort(v), "Outstanding principal"]} />
                  <ReferenceLine yAxisId="cov" x={runoff.m6.t} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                  <ReferenceLine yAxisId="cov" x={runoff.m12.t} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                  <Area yAxisId="cov" type="monotone" dataKey="coverage" stroke={USDAI_ACCENT} strokeWidth={2}
                    fill={USDAI_ACCENT} fillOpacity={0.16} isAnimationActive={false} />
                  <Line yAxisId="bal" type="monotone" dataKey="outstanding" stroke="#22d3ee" strokeWidth={1.5}
                    strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  <ReferenceDot yAxisId="cov" x={runoff.m6.t} y={runoff.m6.coverage} r={3} fill={USDAI_ACCENT} stroke="#0a0e17" strokeWidth={1}
                    label={{ value: `6mo · ${runoff.m6.coverage.toFixed(0)}%`, position: "top", fill: "#cbd5e1", fontSize: 9, fontFamily: mono }} />
                  <ReferenceDot yAxisId="cov" x={runoff.m12.t} y={runoff.m12.coverage} r={3} fill={USDAI_ACCENT} stroke="#0a0e17" strokeWidth={1}
                    label={{ value: `1yr · ${runoff.m12.coverage.toFixed(0)}%`, position: "top", fill: "#cbd5e1", fontSize: 9, fontFamily: mono }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 9, fontFamily: mono, color: "#5b6b7d" }}>
              <span><span style={{ display: "inline-block", width: 11, height: 2, background: USDAI_ACCENT, verticalAlign: "middle", marginRight: 5 }} />Cumulative cash returned (P+I), % of book</span>
              <span><span style={{ display: "inline-block", width: 11, height: 0, borderTop: "1.5px dashed #22d3ee", verticalAlign: "middle", marginRight: 5 }} />Outstanding principal ($)</span>
            </div>
          </ModuleCard>
        )}

        {ornTrend.models.length > 0 && (
          <ModuleCard>
            <SectionHeader
              title="GPU Rental Rate Trends"
              subtitle="ORN Compute Index — institutional GPU rental rates ($/hr), 90-day daily history." />
            <div style={{ display: "flex", gap: 14, marginBottom: 8, flexWrap: "wrap" }}>
              {ornTrend.models.map((m, i) => {
                const e = data?.ornIndex?.[m];
                const chg = e?.change90d;
                return (
                  <div key={m} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: mono, color: "#94a3b8" }}>
                    <span style={{ width: 12, height: 2, background: ORN_COLORS[i % ORN_COLORS.length], display: "inline-block" }} />
                    {m}
                    <span style={{ color: "#e2e8f0" }}>${e?.latest?.toFixed(2)}/hr</span>
                    {chg != null && <span style={{ color: chg >= 0 ? "#4ade80" : "#f87171" }}>{chg >= 0 ? "+" : ""}{(chg*100).toFixed(0)}%</span>}
                  </div>
                );
              })}
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <ComposedChart data={ornTrend.rows} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
                  <XAxis dataKey="date" type="number" scale="time" domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    tick={{ fill: "#6b7a8d", fontSize: 9, fontFamily: mono }} minTickGap={50} />
                  <YAxis tickFormatter={(v) => `$${v.toFixed(1)}`} tick={{ fill: "#6b7a8d", fontSize: 9, fontFamily: mono }} width={44} />
                  <Tooltip {...tooltipStyle}
                    labelFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    formatter={(v, k) => [`$${Number(v).toFixed(2)}/hr`, k]} />
                  {ornTrend.models.map((m, i) => (
                    <Line key={m} type="monotone" dataKey={m} stroke={ORN_COLORS[i % ORN_COLORS.length]}
                      strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 9, color: "#4f5e6f", fontFamily: mono, marginTop: 6 }}>
              Source: ORN Compute Index (api.ornnai.com). Cross-checked against Vast.ai marketplace medians.
            </div>
          </ModuleCard>
        )}

        {/* Operator (borrower) concentration */}
        {operatorConcentration.rows.length > 0 && (
          <ModuleCard>
            <SectionHeader title="Operator Concentration"
              subtitle="GPU data-center operators hosting the financed hardware, identified from on-chain collateral metadata." />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>OPERATOR</th>
                  <th style={thR}>EXPOSURE</th>
                  <th style={thR}>% OF BOOK</th>
                  <th style={thR}>LOANS</th>
                  <th style={thR}>WTD. LTV</th>
                  <th style={th}>LOCATIONS</th>
                </tr>
              </thead>
              <tbody>
                {operatorConcentration.rows.map(r => (
                  <tr key={r.operator}>
                    <td style={td}>
                      {r.operator === "Unknown" ? <span style={dim}>Unknown</span> : r.operator}
                    </td>
                    <td style={tdR}>{fmtUsdShort(r.principal)}</td>
                    <td style={{ ...tdR, color: r.share > 0.4 ? "#fbbf24" : "#e2e8f0" }}>{(r.share * 100).toFixed(0)}%</td>
                    <td style={tdR}>{r.loanCount}</td>
                    <td style={tdR}>{r.ltv != null ? `${(r.ltv * 100).toFixed(0)}%` : "—"}</td>
                    <td style={{ ...td, color: "#94a3b8", fontSize: 11 }}>{r.locations.join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Interactive exposure-by-operator composition bar */}
            <CompositionBar items={operatorConcentration.rows.map((r, i) => ({
              key: r.operator,
              label: r.operator,
              color: ORN_COLORS[i % ORN_COLORS.length],
              value: r.principal,
              tip: [
                `${fmtUsdShort(r.principal)} · ${(r.share * 100).toFixed(0)}% of book`,
                `${r.loanCount} loan${r.loanCount > 1 ? "s" : ""}${r.ltv != null ? ` · ${(r.ltv * 100).toFixed(0)}% LTV` : ""}`,
                r.locations.length ? r.locations.join(" · ") : null,
              ].filter(Boolean),
            }))} />
          </ModuleCard>
        )}

        {/* Deployment pipeline by stage */}
        {pipeline.length > 0 && (
          <ModuleCard>
            <SectionHeader title="Deployment Pipeline"
              subtitle="Committed capital by deal stage. Deployed shown at current outstanding; escrowed & upcoming at full principal." />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>STAGE</th>
                  <th style={thR}>CAPITAL</th>
                  <th style={thR}>DEALS</th>
                  <th style={thR}>WTD APR</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.map(p => (
                  <tr key={p.key}>
                    <td style={td}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: p.color, marginRight: 8 }} />
                      {p.label}
                    </td>
                    <td style={tdR}>{fmtUsdShort(p.amount)}</td>
                    <td style={tdR}>{p.count}</td>
                    <td style={tdR}>{p.apy != null ? `${p.apy.toFixed(2)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Interactive capital-by-stage composition bar */}
            <CompositionBar items={pipeline.map(p => ({
              key: p.key,
              label: p.label,
              color: p.color,
              value: p.amount,
              tip: [
                `${fmtUsdShort(p.amount)} · ${p.count} deal${p.count > 1 ? "s" : ""}`,
                p.apy != null ? `${p.apy.toFixed(1)}% wtd APR` : null,
              ].filter(Boolean),
            }))} />
          </ModuleCard>
        )}

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

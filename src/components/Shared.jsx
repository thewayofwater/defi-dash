import React from "react";
import { TRACKED_CATEGORIES, CATEGORY_COLORS } from "../utils/constants";

const mono = "'JetBrains Mono', monospace";
const sans = "'DM Sans', sans-serif";

export function StatCard({ label, value, sub, color, trend }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 7,
        padding: "13px 16px",
        flex: 1,
        minWidth: 130,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#5a6678",
          textTransform: "uppercase",
          letterSpacing: 1.3,
          marginBottom: 4,
          fontFamily: mono,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: color || "#e2e8f0",
          fontFamily: mono,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 12,
            color:
              trend === "up"
                ? "#34d399"
                : trend === "down"
                ? "#f87171"
                : "#506070",
            marginTop: 3,
            fontFamily: mono,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "#e2e8f0",
          margin: 0,
          fontFamily: sans,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <div
          style={{
            fontSize: 12,
            color: "#7a8a9e",
            marginTop: 2,
            fontFamily: mono,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

export function LoadingSpinner({ message }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 200,
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          border: "2px solid rgba(255,255,255,0.06)",
          borderTopColor: "#22d3ee",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <div style={{ color: "#4a5568", fontSize: 12, fontFamily: mono }}>
        {message || "Loading..."}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function CategoryLegend() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        justifyContent: "center",
        marginTop: 10,
      }}
    >
      {TRACKED_CATEGORIES.map((cat) => (
        <div
          key={cat}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10,
            color: "#94a3b8",
            fontFamily: mono,
          }}
        >
          <div
            style={{
              width: 10,
              height: 2.5,
              background: CATEGORY_COLORS[cat],
              borderRadius: 1,
            }}
          />
          {cat}
        </div>
      ))}
    </div>
  );
}

export function ModuleCard({ children }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.012)",
        border: "1px solid rgba(255,255,255,0.035)",
        borderRadius: 7,
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

export function ChartShimmer({ height = 200 }) {
  return (
    <div style={{ position: "relative", height, borderRadius: 6, overflow: "hidden", background: "rgba(255,255,255,0.02)" }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s ease-in-out infinite",
      }} />
      {/* Fake bar/line shapes */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", alignItems: "flex-end", gap: 4, padding: "0 20px 20px" }}>
        {[40, 65, 50, 80, 55, 70, 45, 75, 60, 85, 50, 68].map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, background: "rgba(255,255,255,0.03)", borderRadius: "3px 3px 0 0" }} />
        ))}
      </div>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

// Standard pagination control used across every table in the dashboard.
// Pass an `accent` hex for the active-page highlight (defaults to cyan).
// Shows first/prev/next/last nav buttons plus windowed page numbers with ellipses.
export function Pagination({ page, totalPages, onPageChange, accent = "#22d3ee" }) {
  if (totalPages <= 1) return null;
  const navBtn = {
    background: "none",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 3,
    padding: "3px 8px",
    fontSize: 10,
    fontFamily: mono,
    color: "#94a3b8",
    cursor: "pointer",
  };
  const pages = [];
  let start = Math.max(0, page - 2);
  let end = Math.min(totalPages - 1, start + 4);
  start = Math.max(0, end - 4);
  if (start > 0) { pages.push(0); if (start > 1) pages.push("..."); }
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) { if (end < totalPages - 2) pages.push("..."); pages.push(totalPages - 1); }

  // Parse accent to rgb for active-page background
  const hex = accent.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
      <button onClick={() => onPageChange(0)} disabled={page === 0} style={{ ...navBtn, opacity: page === 0 ? 0.3 : 1 }}>{"\u00AB"}</button>
      <button onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0} style={{ ...navBtn, opacity: page === 0 ? 0.3 : 1 }}>{"\u2039"}</button>
      {pages.map((p, idx) =>
        p === "..." ? (
          <span key={`dot-${idx}`} style={{ fontSize: 10, fontFamily: mono, color: "#4a5568", padding: "3px 2px" }}>{"\u2026"}</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            style={{
              background: p === page ? `rgba(${r},${g},${b},0.15)` : "none",
              border: p === page ? `1px solid rgba(${r},${g},${b},0.3)` : "1px solid rgba(255,255,255,0.06)",
              borderRadius: 3,
              padding: "3px 8px",
              fontSize: 10,
              fontFamily: mono,
              color: p === page ? accent : "#94a3b8",
              cursor: "pointer",
              fontWeight: p === page ? 600 : 400,
              minWidth: 28,
              textAlign: "center",
            }}
          >
            {p + 1}
          </button>
        )
      )}
      <button onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{ ...navBtn, opacity: page >= totalPages - 1 ? 0.3 : 1 }}>{"\u203A"}</button>
      <button onClick={() => onPageChange(totalPages - 1)} disabled={page >= totalPages - 1} style={{ ...navBtn, opacity: page >= totalPages - 1 ? 0.3 : 1 }}>{"\u00BB"}</button>
    </div>
  );
}

export const tooltipStyle = {
  background: "#131926",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 5,
  fontSize: 10,
  fontFamily: mono,
  color: "#e2e8f0",
};

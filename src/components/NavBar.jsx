import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const mono = "'JetBrains Mono', monospace";

const NAV_ITEMS = [
  { path: "/", label: "Overview", icon: "⊞" },
  { path: "/morpho", label: "Morpho", icon: "◈" },
  { path: "/pendle", label: "Pendle", icon: "◉" },
  { path: "/compare", label: "Compare", icon: "⇄" },
];

const COLLAPSED_W = 52;
const EXPANDED_W = 180;

export default function NavBar() {
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(false);

  return (
    <nav
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: expanded ? EXPANDED_W : COLLAPSED_W,
        background: "#0a0e18",
        borderRight: "1px solid rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        padding: "16px 0",
        zIndex: 100,
        transition: "width 0.2s ease",
        overflow: "hidden",
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: "4px 0 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingLeft: 14,
          minHeight: 36,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>◆</span>
        <span
          style={{
            fontFamily: mono,
            fontSize: 13,
            fontWeight: 700,
            color: "#e2e8f0",
            letterSpacing: 0.5,
            whiteSpace: "nowrap",
            opacity: expanded ? 1 : 0,
            transition: "opacity 0.15s ease",
          }}
        >
          DeFi Dash
        </span>
      </div>

      <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.04)", marginBottom: 12 }} />

      {/* Nav links */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
        {NAV_ITEMS.map(({ path, label, icon }) => {
          const active = path === "/" ? pathname === "/" : pathname.startsWith(path);
          return (
            <Link
              key={path}
              to={path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 8px",
                fontSize: 12,
                fontFamily: mono,
                fontWeight: active ? 600 : 400,
                color: active ? "#e2e8f0" : "#4a5568",
                textDecoration: "none",
                borderRadius: 6,
                background: active ? "rgba(255,255,255,0.06)" : "transparent",
                transition: "background 0.15s, color 0.15s",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
              onMouseOver={(e) => {
                if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }}
              onMouseOut={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{icon}</span>
              <span
                style={{
                  opacity: expanded ? 1 : 0,
                  transition: "opacity 0.15s ease",
                }}
              >
                {label}
              </span>
              {active && (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    width: 3,
                    height: 20,
                    borderRadius: "0 2px 2px 0",
                    background: "#22d3ee",
                  }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export { COLLAPSED_W, EXPANDED_W };

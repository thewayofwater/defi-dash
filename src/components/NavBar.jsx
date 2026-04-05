import React from "react";
import { Link, useLocation } from "react-router-dom";

const mono = "'JetBrains Mono', monospace";

const NAV_ITEMS = [
  { path: "/", label: "Overview" },
  { path: "/morpho", label: "Morpho" },
  { path: "/pendle", label: "Pendle" },
];

export default function NavBar() {
  const { pathname } = useLocation();

  return (
    <nav
      style={{
        display: "flex",
        gap: 2,
        padding: "0 26px",
        background: "#080c14",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {NAV_ITEMS.map(({ path, label }) => {
        const active = path === "/" ? pathname === "/" : pathname.startsWith(path);
        return (
          <Link
            key={path}
            to={path}
            style={{
              padding: "10px 14px",
              fontSize: 12,
              fontFamily: mono,
              fontWeight: active ? 600 : 400,
              color: active ? "#e2e8f0" : "#4a5568",
              textDecoration: "none",
              letterSpacing: 0.5,
              borderBottom: active ? "2px solid #22d3ee" : "2px solid transparent",
              transition: "color 0.15s",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

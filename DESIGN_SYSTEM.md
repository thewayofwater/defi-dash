# DeFi Dash — Design System

Living reference for visual + interaction patterns. Read this before building a new page or component so the dashboard stays consistent. When a pattern isn't covered here, look at `WbtcPage.jsx` first (most recent, most complete) before inventing something new.

---

## 1. Color palette

### Page background
- `#0a0e17` — every page

### Text
| Use | Hex |
|---|---|
| Primary | `#e2e8f0` |
| Secondary | `#cbd5e1` |
| Muted | `#94a3b8` |
| Dim | `#6b7a8d`, `#5a6678` |
| Very dim | `#4a5568`, `#3a4555` |

### Borders / separators
- Subtle borders: `rgba(255,255,255,0.04)`
- Card borders: `rgba(255,255,255,0.035)` to `rgba(255,255,255,0.05)`
- Filter / pagination borders: `rgba(255,255,255,0.06)` to `rgba(255,255,255,0.08)`
- Table row borders: `rgba(255,255,255,0.03)`

### Status colors (universal)
| State | Hex |
|---|---|
| Healthy / success | `#4ade80` |
| Warning | `#fbbf24` |
| Danger / error | `#f87171` |
| Neutral | `#94a3b8` |

### Per-protocol accent (use as `ACCENT` constant)
| Protocol | Accent |
|---|---|
| Aave | `#8b5cf6` |
| SparkLend | `#ff4d8f` |
| Pendle | `#34d399` |
| Maple | `#F57C00` |
| Hyperliquid | `#50FF7F` (alt cyan `#22d3ee`) |
| WBTC | `#f7931a` |
| Morpho | uses Aave purple pattern |

### Per-asset / per-chain color palette
**Assets**
- ETH `#627EEA` · BTC `#F7931A` · USD `#26A17B` · SOL `#9945FF` · HYPE `#50E3C2` · EUR `#1a4fc4`

**Chains**
- Ethereum `#627eea` · Arbitrum `#28a0f0` · Base `#2563eb` · Optimism `#ff0420` · Polygon `#8247e5` · Avalanche `#e84142` · BNB `#f0b90b` · Gnosis `#04795b` · Solana `#9945ff` · TRON `#ff0013` · Kava `#ff564f` · Osmosis `#750bbb`

**Categories** (Compare/Portfolio)
- DEX LP `#22d3ee` · Lending `#a78bfa` · LST `#34d399` · Stablecoin `#fbbf24` · Yield `#f472b6` · RWA `#fb923c` · Derivatives `#60a5fa` · Bridge `#c084fc`

---

## 2. Typography

### Font families
```js
const mono = "'JetBrains Mono', monospace";
const sans = "'DM Sans', sans-serif";
```

- **Mono**: numbers, labels, table data, code-feeling text — almost everything
- **Sans**: page titles + section headers only

### Type scale
| Element | Size | Weight | Font | Notes |
|---|---|---|---|---|
| Page title (h1) | 22 | 700 | sans | `letterSpacing: "-0.02em"` |
| Section header title | 16 | 600 | sans | |
| Section subtitle | 12 | 400 | mono | color `#7a8a9e` |
| Hero card label | 11 | 400 | mono | uppercase, `letterSpacing: 1` |
| Hero card big value | 28 | 700 | mono | |
| Hero card secondary | 11 | 400 | mono | color `#6b7a8d` |
| Stat card label | 10 | 400 | mono | uppercase, `letterSpacing: 1.3` |
| Stat card value | 18–24 | 700 | mono | (18 in summary strips, 24 in standalone) |
| Stat card secondary | 10–12 | 400–500 | mono | smaller suffix on same line |
| Table header (TH) | 10 | 400 | mono | uppercase, `letterSpacing: 1` |
| Table cell (TD) | 13 | 400 | mono | |
| Button text | 10–12 | 400/600 | mono | 600 when active |
| Filter `<select>` | 12 | 400 | mono | |
| Tooltip text | 10 | 400 | mono | |
| Badge / pill | 10 | 400 | mono | uppercase, `letterSpacing: 0.5–1` |
| Chart axis ticks | 10 | 400 | mono | |

---

## 3. Layout & spacing

- **Page header padding**: `20px 26px 16px`
- **Content section padding**: `20px 26px 0` or `20px 26px`
- **Module-stack `gap`**: `16` between charts
- **Inline summary stat `gap`**: `26` (with vertical divider `1px × stretch background rgba(255,255,255,0.04)`)
- **Hero card grid**: `gap: 10` for 2–3 columns, `gap: 8` for 4
- **Page bottom spacer**: `<div style={{ height: 40 }} />` after last module

---

## 4. Reusable shared components

All in `src/components/Shared.jsx`:

### `<SectionHeader title subtitle />`
- Title h2, 16/600 sans, `#e2e8f0`
- Subtitle 12 mono, `#7a8a9e`, `marginTop: 2`
- `marginBottom: 12`

### `<ModuleCard>{children}</ModuleCard>`
- bg `rgba(255,255,255,0.012)`, border `1px solid rgba(255,255,255,0.035)`
- `borderRadius: 7`, `padding: 20`

### `<StatCard label value sub color trend />`
- bg `rgba(255,255,255,0.025)`, border `1px solid rgba(255,255,255,0.05)`
- `borderRadius: 7`, `padding: 13px 16px`, `flex: 1`, `minWidth: 130`
- Label 10/uppercase mono `#5a6678`, value 24/700 mono, sub 12 mono with trend color (`up→#34d399`, `down→#f87171`)

### `<LoadingSpinner message />`
- Full-screen flex-center, 24×24 cyan spinner, `animation: spin 1s linear infinite`
- Message 12 mono `#4a5568`

### `<ChartShimmer height={200} />`
- `borderRadius: 6`, bg `rgba(255,255,255,0.02)`
- 12 fake bars, gradient sweep `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)`, `animation: shimmer 1.5s ease-in-out infinite`

### `<CategoryLegend />`
- Flex wrap, `gap: 14`, centered, `marginTop: 10`
- Each item: 10×2.5 colored bar + 10 mono `#94a3b8` label

### `<Pagination page totalPages onPageChange accent />`
- See §8 for full spec. Always reuse — never re-roll per page.

---

## 5. Tables

```js
const TH = {
  padding: "8px 8px",
  textAlign: "left",
  fontSize: 10,
  color: "#6b7a8d",
  fontFamily: mono,
  textTransform: "uppercase",
  letterSpacing: 1,
};
const TH_R = { ...TH, textAlign: "right" };

const TD = {
  padding: "8px 8px",
  fontSize: 13,
  fontFamily: mono,
  borderTop: "1px solid rgba(255,255,255,0.03)",
};
const TD_NUM = { ...TD, textAlign: "right" };
const TD_DIM = { ...TD, color: "#94a3b8" };
const TD_APY = { ...TD_NUM, color: "#22d3ee" };
```

### Row striping
```js
background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)"
```

### Row hover
- `onMouseEnter` → `rgba(255,255,255,0.04)`
- `onMouseLeave` → restore striped color

### Click-to-open row
- `cursor: url ? "pointer" : "default"`
- `onClick: () => url && window.open(url, "_blank")`

### Sortable header
- `cursor: pointer` on TH
- Append ` ↓` (desc) / ` ↑` (asc) to label, no icon when unsorted

### Empty state
- 13 mono `#6b7a8d`, `padding: 16`, "No data available" copy

---

## 6. Filters

```js
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
```

Pattern: small label (10 mono `#6b7a8d`, `letterSpacing: 0.5`) + `<select style={FILTER_STYLE}>`.

---

## 7. Buttons & toggles

### Refresh button (top-right of every page)
```js
// Inactive
{ background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, padding: "7px 14px",
  fontSize: 11, fontFamily: mono, color: "#94a3b8",
  cursor: "pointer", display: "flex", gap: 6, alignItems: "center",
  transition: "all 0.2s", letterSpacing: 0.5 }

// Refreshing
background: "rgba(ACCENT, 0.15)"; color: ACCENT; cursor: "default";
// Spinner glyph: ↻ (U+21BB), animation "spin 1s linear infinite", fontSize 13
```

### Timeframe toggle pills
Reference: WbtcPage's `TIMEFRAMES` and the row that wraps it. Use this exact pattern for any time-based filter strip.

```js
// Active
{ background: "rgba(ACCENT, 0.12)", border: "1px solid rgba(ACCENT, 0.3)",
  color: ACCENT, fontWeight: 600 }

// Inactive
{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)",
  color: "#6b7a8d", fontWeight: 400 }

// Both
{ borderRadius: 5, padding: "6px 14px", fontSize: 10, fontFamily: mono,
  cursor: "pointer", letterSpacing: 0.5 }
```

Standard timeframe set: `30D`, `90D`, `1Y`, `All-Time` (use string `"all"` for the all-time variant in state).

### Metric toggles (e.g., "Total Volume / Net / Mints / Burns" in WBTC merchants chart)
Looser visual — neutral grays so they don't compete with timeframe pills:
```js
// Active
{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
  color: "#e2e8f0" }
// Inactive
{ background: "transparent", border: "1px solid rgba(255,255,255,0.06)",
  color: "#6b7a8d" }
// Both: borderRadius 3, padding "3px 10px", fontSize 10, fontFamily mono
```

---

## 8. Pagination

**Always use the shared `<Pagination />` component from `src/components/Shared.jsx`.** Do not re-roll this styling per page — it's the #1 thing that drifts when copy-pasted. Any table with > 1 page of data should use this.

### Usage

```jsx
import { Pagination } from "../components/Shared";

// In a table component:
const [page, setPage] = useState(0);
const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
// ... render rows ...
<Pagination page={page} totalPages={totalPages} onPageChange={setPage} accent={ACCENT} />
```

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `page` | number | required | Zero-indexed current page |
| `totalPages` | number | required | Returns `null` if `<= 1` |
| `onPageChange` | function | required | Called with new page index |
| `accent` | string | `"#22d3ee"` | Hex for active-page highlight; pass the page's protocol accent |

### What it renders

- First / prev / next / last nav buttons (`«`, `‹`, `›`, `»`)
- Windowed page numbers (current ± 2), ellipses around gaps, always shows first + last page
- Active page gets `rgba(accent, 0.15)` background + `rgba(accent, 0.3)` border + accent color
- Layout: flex centered, `gap: 4`, `marginTop: 10`, `flexWrap: wrap`
- Nav button style: transparent bg, `1px solid rgba(255,255,255,0.06)` border, `borderRadius: 3`, `3px 8px` padding, 10 mono `#94a3b8`, `opacity: 0.3` when disabled
- Page button minWidth `28px` for consistent spacing
- Ellipsis: `…` in 10 mono `#4a5568`

Reference usages: `WbtcPage.jsx` (`CustodianTable`, `ActivityFeed`), `AcrossPage.jsx` (`LargeTransfersTable`).

---

## 9. Charts (Recharts)

### Shared tooltip style
```js
const chartTooltipStyle = {
  contentStyle: {
    background: "#131926",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 5,
    fontSize: 10,
    fontFamily: mono,
    color: "#e2e8f0",
  },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#e2e8f0" },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};
```

### Axis defaults
```jsx
<XAxis tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
       axisLine={false} tickLine={false} />
<YAxis tick={{ fill: "#6b7a8d", fontSize: 10, fontFamily: mono }}
       axisLine={false} tickLine={false} />
```

### Reference lines (peg, baseline, etc.)
```jsx
<ReferenceLine y={1}
  stroke="rgba(148,163,184,0.5)"
  strokeDasharray="4 4"
  label={{ value: "Peg 1.0000", fill: "#94a3b8",
    fontSize: 9, fontFamily: mono, position: "insideTopRight" }}
/>
```

### Area / bar gradients
```jsx
<defs>
  <linearGradient id="someGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
  </linearGradient>
</defs>
<Area fill="url(#someGrad)" stroke={ACCENT} strokeWidth={2} dot={false} />
```

### Standard chart heights
- Default: `280`
- Tall (peg, normalized price): `340–350`
- Variable (per-row bars): `Math.max(220, rows.length * 28 + 40)`

---

## 10. Hero / summary stats

### Big-number stat
```jsx
<div>
  <div style={{ fontSize: 10, color: "#6b7a8d", fontFamily: mono,
                letterSpacing: 1, textTransform: "uppercase" }}>{LABEL}</div>
  <div style={{ fontSize: 18, fontWeight: 700, color: PRIMARY_OR_RISK_COLOR,
                fontFamily: mono, marginTop: 2 }}>
    {value}
    <span style={{ fontSize: 10, color: SUFFIX_COLOR, fontWeight: 500,
                   marginLeft: 6, letterSpacing: 0.5 }}>
      {SUFFIX_BADGE_OR_DELTA}
    </span>
  </div>
</div>
```

For consistent vertical alignment in a summary strip, keep the big-value line at the same `fontSize` (18) across all stats. Long pool/asset names? Strip parentheticals (e.g., `WBTC / cbBTC (0.01%)` → `WBTC / cbBTC`) before showing.

### Hero card (top-of-page)
```js
{ background: `rgba(${ACCENT_RGB}, 0.06)`,
  border: `1px solid rgba(${ACCENT_RGB}, 0.15)`,
  borderRadius: 6, padding: "20px 24px",
  position: "relative", overflow: "hidden" }
```

Label `fontSize: 11`, value `fontSize: 28 / 700`, secondary `fontSize: 11 / #6b7a8d`.

### Refreshing shimmer overlay
Apply inside hero card during `refreshing`:
```js
{ position: "absolute", inset: 0,
  background: `linear-gradient(90deg, transparent 0%, rgba(${ACCENT_RGB},0.08) 40%,
               rgba(${ACCENT_RGB},0.12) 50%, rgba(${ACCENT_RGB},0.08) 60%, transparent 100%)`,
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s ease-in-out infinite" }
```

---

## 11. Hover popovers (custom, non-Recharts)

Used for `StatWithTooltip`, `TrackedTvlStat` in WbtcPage and `risk-card` hovers in HyperliquidPage.

**Affordance** (the thing you hover):
- Dotted underline: `borderBottom: "1px dotted rgba(148,163,184,0.4)"`
- `cursor: "help"` (or `"pointer"` for clickable cards)
- Optional `↗` icon next to label on hover (for click-through cards)

**Popover container**:
```js
{ position: "absolute", top: "calc(100% + 8px)", left: 0,
  background: "#131926",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, padding: "10px 12px",
  zIndex: 30, minWidth: 200,
  boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
  fontSize: 10, fontFamily: mono, color: "#94a3b8",
  whiteSpace: "nowrap",          // or "normal" for wrapping bodies
  pointerEvents: "none" }        // when popover shouldn't intercept hovers
```

**Body grid** for label/value pairs:
```jsx
<div style={{ display: "grid", gridTemplateColumns: "auto auto",
              gap: "4px 14px", fontVariantNumeric: "tabular-nums" }}>
  <span style={{ color: "#6b7a8d" }}>{label}</span>
  <span style={{ textAlign: "right", color: "#e2e8f0" }}>{value}</span>
</div>
```

**Tooltips that escape `overflow: hidden` (e.g., inside table rows)**: render via `ReactDOM.createPortal` to `document.body`, position with `getBoundingClientRect()`.

---

## 12. Composition / stacked bars

Pattern from `PoolCompositionCard` (WBTC pool health):

```jsx
// Outer bar
<div style={{ display: "flex", height: 22, borderRadius: 4, overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.05)" }}>
  {composition.map((c, i) => (
    <div key={c.symbol}
         onMouseEnter={...} onMouseLeave={...}
         style={{ width: `${c.share}%`, background: tokenColor(c.symbol),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontFamily: mono, color: "#0a0e17", fontWeight: 600,
                  overflow: "hidden", whiteSpace: "nowrap",
                  opacity: hoveredIdx == null || hoveredIdx === i ? 1 : 0.5,
                  transition: "opacity 0.12s", cursor: "pointer" }}>
      {c.share >= 12 ? `${c.symbol} ${c.share.toFixed(0)}%` : ""}
    </div>
  ))}
</div>

// Legend below — colored dot + token name + share
```

Hover popover follows §11 conventions, positioned at the segment midpoint with `transform: translateX(-50%)`.

---

## 13. Risk / health indicators

Standard 3-tier (use everywhere):
| State | Color | Label |
|---|---|---|
| green | `#4ade80` | Healthy |
| yellow | `#fbbf24` | Mild flight / Warning |
| red | `#f87171` | Active flight / Critical |

```js
const RISK_COLOR = { green: "#4ade80", yellow: "#fbbf24", red: "#f87171" };
const RISK_LABEL = { green: "Healthy", yellow: "Mild flight", red: "Active flight" };
```

Risk pill:
```js
{ background: `${color}12`, border: `1px solid ${color}50`, color,
  padding: "2px 8px", borderRadius: 3,
  fontSize: 10, fontFamily: mono,
  textTransform: "uppercase", letterSpacing: 0.8 }
```

Inline indicator (next to a stat): colored dot + uppercase color-matched text.
```jsx
<span style={{ width: 8, height: 8, borderRadius: "50%", background: color,
              display: "inline-block" }} />
<span style={{ fontSize: 10, color, textTransform: "uppercase",
              letterSpacing: 0.5 }}>{RISK_LABEL[risk]}</span>
```

---

## 14. Page header badge (next to h1)

For the small uppercase tag like "TRANSPARENCY" / "PROTOCOL" / "VAULT":
```jsx
<span style={{ color: ACCENT, marginLeft: 8, fontSize: 10, fontWeight: 500,
              fontFamily: mono, verticalAlign: "middle",
              background: `rgba(${ACCENT_RGB}, 0.07)`,
              padding: "2px 7px", borderRadius: 3, letterSpacing: 1 }}>
  TRANSPARENCY
</span>
```

---

## 15. Loading & error patterns

### Initial load (full-page)
```jsx
<div style={{ background: "#0a0e17", minHeight: "100vh",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
  <LoadingSpinner message="..." />
</div>
```

### Error state
```jsx
<div style={{ background: "#0a0e17", color: "#f87171", padding: 40,
              fontFamily: mono, textAlign: "center", minHeight: "100vh",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
  <div>
    <div style={{ fontSize: 14, fontWeight: 600 }}>Failed to load …</div>
    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>{error}</div>
  </div>
</div>
```

### Required keyframes (inject once per page in `<style>`)
```css
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Refresh shimmer placement
- **Per-section**: wrap chart/table render with `{refreshing ? <ChartShimmer height={H} /> : (<div key={refreshKey}>...</div>)}` — the `key={refreshKey}` forces a clean re-mount on each refresh
- **Hero cards**: shimmer overlay (see §10)
- **Refresh button**: spinner `↻` glyph rotates while in-flight; label flips to "Refreshing..."

---

## 16. Formatters (`src/utils/format.js`)

```js
fmt(n, decimals = 1)   // "$1.2B", "$3.4M", "$5.6K", "$789.0"
fmtPct(n, decimals = 2) // "12.34%"
fmtDate(d)              // "M/D"
```

Use these for **every** numeric display. Don't reinvent magnitude shortening — mismatched abbreviations are the quickest way the dashboard feels inconsistent.

When formatting BTC counts: `n.toLocaleString(undefined, { maximumFractionDigits: 2 })` and append the unit (`BTC` / `WBTC` / `cbBTC`) as a smaller suffix span.

---

## 17. Refresh / data hook conventions

Each page uses a custom hook (e.g., `useWbtcData`, `useWbtcPoolsData`) that returns:
```ts
{
  ...domainData,
  loading: boolean,       // initial fetch only
  refreshing: boolean,    // on subsequent fetches (manual or interval)
  refreshKey: number,     // bump on every successful fetch — used as key= for re-mount
  error: string | null,
  lastUpdated: Date | null,
  refresh: () => void,    // manual trigger
}
```

- **Initial load**: render `<LoadingSpinner>` while `loading` is true
- **Subsequent refreshes**: render `<ChartShimmer>` per section while `refreshing` is true
- **Auto-refresh interval**: 5 minutes for slow data (chain reads, custodian balances), 2 minutes for fast-moving data (pool composition)
- **Page-level refresh button** must call refresh on **every** independent hook used by the page. Disable button while any hook is in-flight.
- **Multiple hooks per page**: combine their `refreshing` states with `||` for button + per-section shimmer logic

---

## 18. Standard page skeleton

```jsx
import React, { useState } from "react";
import { useThingData } from "../hooks/useThingData";
import { SectionHeader, LoadingSpinner, ModuleCard, ChartShimmer } from "../components/Shared";

const mono = "'JetBrains Mono', monospace";
const ACCENT = "#xxxxxx"; // protocol color

export default function ProtocolPage() {
  const { data, loading, refreshing, refreshKey, error, lastUpdated, refresh } = useThingData();
  const [period, setPeriod] = useState(30);

  if (error) return /* error state */;
  if (loading) return /* loading state */;

  return (
    <div style={{ background: "#0a0e17", color: "#e2e8f0", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>

      {/* Header: title + refresh button + hero cards */}
      <div style={{ padding: "20px 26px 16px" }}>
        {/* h1 + badge + subtitle + refresh button */}
        {/* Hero card grid (2-3 cards) */}
      </div>

      {/* Optional: timeframe toggle row */}
      <div style={{ padding: "14px 26px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TIMEFRAMES.map(...)}
      </div>

      {/* Optional: period-dependent stat cards row */}

      {/* Charts + tables stack */}
      <div style={{ padding: "20px 26px 0", display: "flex", flexDirection: "column", gap: 16 }}>
        <ModuleCard>
          <SectionHeader title="..." subtitle="..." />
          {refreshing ? <ChartShimmer height={280} /> : (
            <div key={refreshKey}><Chart .../></div>
          )}
        </ModuleCard>
        {/* ... more modules */}
      </div>

      <div style={{ height: 40 }} />
    </div>
  );
}
```

---

## 19. Style guidelines (opinionated)

- **Subtitle prose**: keep under one short line. The chart usually self-explains; subtitles are for sourcing or methodology hints, not legends.
- **Don't reinvent**: if a similar UI element exists (e.g., a sortable table, a hero card, a hover tooltip), copy the pattern. Variation = noise.
- **Always use `mono` for numbers** so they line up vertically. Use `fontVariantNumeric: "tabular-nums"` for tables / grids of figures.
- **Color = signal**: don't decorate with color. Risk tiers, trends, accents — every color choice should communicate something.
- **`refreshKey`** as the React `key` on a chart/table re-mounts it cleanly each refresh — guarantees fresh animations and zero state leakage.
- **No emojis in UI text** unless the user explicitly asks. Status uses colored dots / pills, not emoji.
- **Number suffixes** (B/M/K) come from `fmt()`. BTC counts use `toLocaleString` with explicit unit suffix.
- **Long token / pool labels** in compact summary strips: strip parenthetical fee tiers before display (`WBTC / cbBTC (0.01%)` → `WBTC / cbBTC`).

---

## 20. Where to look

When in doubt, reference these files in this order:
1. **`src/pages/WbtcPage.jsx`** — most current, comprehensive patterns
2. **`src/pages/HyperliquidPage.jsx`** — period toggle pattern, custom hover popovers
3. **`src/components/Shared.jsx`** — primitives
4. **`src/utils/format.js`** — formatters
5. This file — when adding a NEW pattern, document it here

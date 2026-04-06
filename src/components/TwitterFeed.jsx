import React from "react";

const mono = "'JetBrains Mono', monospace";

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ─── Category tag colors ───
const CAT_COLORS = {
  "YIELD ALERT":     { bg: "rgba(74,222,128,0.10)", color: "#4ade80" },
  "NEW POOL":        { bg: "rgba(139,92,246,0.10)", color: "#a78bfa" },
  "RISK":            { bg: "rgba(248,113,113,0.12)", color: "#f87171" },
  "ANALYSIS":        { bg: "rgba(34,211,238,0.10)", color: "#22d3ee" },
  "PROTOCOL UPDATE": { bg: "rgba(59,130,246,0.10)", color: "#60a5fa" },
};

// ─── Highlight percentages and dollar amounts in tweet text ───
const NUMBER_RE = /(\d+\.?\d*\s*%|\$\d[\d,.]*[BMKbmk]?)/g;

function HighlightedText({ text }) {
  const parts = text.split(NUMBER_RE);
  return (
    <>
      {parts.map((part, i) =>
        NUMBER_RE.test(part) ? (
          <span key={i} style={{ color: "#e2e8f0", fontWeight: 700 }}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ─── Engagement score for filtering ───
function engagement(t) {
  return (t.metrics?.like_count || 0) + (t.metrics?.retweet_count || 0) + (t.metrics?.reply_count || 0);
}

export default function TwitterFeed({ tweets, loading, error }) {
  if (loading) {
    return (
      <div style={{ display: "flex", gap: 12, padding: "4px 0", overflow: "hidden" }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              minWidth: 280, maxWidth: 320, height: 140, borderRadius: 8, flexShrink: 0,
              background: "linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
            }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontSize: 12, color: "#f87171", fontFamily: mono, padding: 12 }}>
        {error}
      </div>
    );
  }

  if (!tweets || !tweets.length) {
    return (
      <div style={{ fontSize: 12, color: "#4a5568", fontFamily: mono, padding: 12 }}>
        No recent tweets found
      </div>
    );
  }

  // Filter to higher-signal tweets (5+ engagement) and cap at 6
  const filtered = tweets.filter((t) => engagement(t) >= 5).slice(0, 6);
  const display = filtered.length ? filtered : tweets.slice(0, 6);

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        padding: "4px 0 8px",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.08) transparent",
      }}
    >
      {display.map((t) => {
        const cat = t.category || "UPDATE";
        const catStyle = CAT_COLORS[cat] || CAT_COLORS["PROTOCOL UPDATE"];
        const eng = engagement(t);
        return (
          <a
            key={t.id}
            href={`https://x.com/${t.author.username}/status/${t.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              flexDirection: "column",
              minWidth: 280,
              maxWidth: 320,
              flexShrink: 0,
              padding: "12px 14px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 8,
              textDecoration: "none",
              cursor: "pointer",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(139,92,246,0.25)";
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
              e.currentTarget.style.background = "rgba(255,255,255,0.02)";
            }}
          >
            {/* Header: author + time */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#cbd5e1", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.author.name}
                </span>
                {t.authorType === "analyst" && (
                  <span style={{
                    fontSize: 7, color: "#f59e0b", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.5,
                    background: "rgba(245,158,11,0.10)", padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                  }}>
                    Analyst
                  </span>
                )}
              </div>
              <span style={{ fontSize: 9, color: "#4f5e6f", fontFamily: mono, flexShrink: 0, marginLeft: 6 }}>
                {timeAgo(t.createdAt)}
              </span>
            </div>

            {/* Category tag */}
            <div style={{ marginBottom: 6 }}>
              <span style={{
                fontSize: 8, fontFamily: mono, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8,
                color: catStyle.color, background: catStyle.bg, padding: "2px 6px", borderRadius: 3,
              }}>
                {cat}
              </span>
            </div>

            {/* Tweet text with highlighted numbers */}
            <div style={{
              fontSize: 11,
              color: "#94a3b8",
              lineHeight: 1.55,
              fontFamily: mono,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              flex: 1,
            }}>
              <HighlightedText text={t.text} />
            </div>

            {/* Footer: metrics */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ fontSize: 9, color: "#4f5e6f", fontFamily: mono }}>
                  ♡ {formatCount(t.metrics?.like_count || 0)}
                </span>
                <span style={{ fontSize: 9, color: "#4f5e6f", fontFamily: mono }}>
                  ↻ {formatCount(t.metrics?.retweet_count || 0)}
                </span>
                <span style={{ fontSize: 9, color: "#4f5e6f", fontFamily: mono }}>
                  ↩ {formatCount(t.metrics?.reply_count || 0)}
                </span>
              </div>
              {t.author.followers >= 1000 && (
                <span style={{ fontSize: 8, color: "#4f5e6f", fontFamily: mono }}>
                  {formatCount(t.author.followers)} followers
                </span>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}

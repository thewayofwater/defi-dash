import React, { useState } from "react";
import { useDeFiData } from "./hooks/useDeFiData";
import { fmt, fmtPct } from "./utils/format";
import { ASSET_COLORS } from "./utils/constants";
import {
  SectionHeader,
  LoadingSpinner,
  ModuleCard,
  ChartShimmer,
} from "./components/Shared";
import TVLHeatmap from "./components/TVLHeatmap";
import AssetYieldBreakdown from "./components/AssetYieldBreakdown";
import RateOverlay from "./components/RateOverlay";
import TrendingYields from "./components/TrendingYields";
import TwitterFeed from "./components/TwitterFeed";
import { useTwitterFeed } from "./hooks/useTwitterFeed";

const mono = "'JetBrains Mono', monospace";
const ASSETS = ["ETH", "BTC", "USD", "SOL", "HYPE", "EUR"];

export default function App() {
  const [selectedAsset, setSelectedAsset] = useState("ETH");

  const {
    pools,
    loading,
    error,
    lastUpdated,
    refreshing,
    refreshKey,
    refresh,
    assetYields,
    assetPools,
    yieldIndex,
    assetProtocolStats,
    assetLendingRates,
    trendingPools,
  } = useDeFiData(selectedAsset);

  const { tweets, loading: tweetsLoading, error: tweetsError } = useTwitterFeed(selectedAsset);

  const color = ASSET_COLORS[selectedAsset];

  if (error) {
    return (
      <div
        style={{
          background: "#0a0e17",
          color: "#f87171",
          padding: 40,
          fontFamily: mono,
          textAlign: "center",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Failed to load data</div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>{error}</div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 12,
            padding: "8px 20px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 5,
            color: "#e2e8f0",
            cursor: "pointer",
            fontSize: 11,
            fontFamily: mono,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          background: "#0a0e17",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LoadingSpinner message="Pulling live data from DeFiLlama..." />
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0e17", color: "#e2e8f0", minHeight: "100vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {/* Header */}
      <div
        style={{
          padding: "20px 26px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background:
            "linear-gradient(180deg, rgba(34,211,238,0.02) 0%, transparent 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: 0,
                color: "#f1f5f9",
                letterSpacing: "-0.02em",
              }}
            >
              DeFi Yield Landscape
              <span
                style={{
                  color: "#22d3ee",
                  marginLeft: 8,
                  fontSize: 10,
                  fontWeight: 500,
                  fontFamily: mono,
                  verticalAlign: "middle",
                  background: "rgba(34,211,238,0.07)",
                  padding: "2px 7px",
                  borderRadius: 3,
                  letterSpacing: 1,
                }}
              >
                LAYER 1 / MACRO
              </span>
            </h1>
            <div
              style={{
                fontSize: 12,
                color: "#4f5e6f",
                marginTop: 2,
                fontFamily: mono,
              }}
            >
              Live data from DeFiLlama
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
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s",
              letterSpacing: 0.5,
            }}
          >
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none", fontSize: 13 }}>&#x21bb;</span>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Asset tabs */}
        <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
          {ASSETS.map((asset) => {
            const data = assetYields.find((a) => a.asset === asset);
            const isSelected = asset === selectedAsset;
            const assetColor = ASSET_COLORS[asset];
            return (
              <button
                key={asset}
                onClick={() => setSelectedAsset(asset)}
                style={{
                  background: isSelected
                    ? `${assetColor}18`
                    : "rgba(255,255,255,0.025)",
                  border: isSelected
                    ? `1px solid ${assetColor}50`
                    : "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 6,
                  padding: "10px 16px",
                  cursor: "pointer",
                  flex: 1,
                  minWidth: 90,
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isSelected ? assetColor : "#94a3b8",
                    fontFamily: mono,
                  }}
                >
                  {asset}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: isSelected ? "#e2e8f0" : "#4a5568",
                    fontFamily: mono,
                    lineHeight: 1.2,
                    marginTop: 2,
                  }}
                >
                  {data?.weightedApy != null ? fmtPct(data.weightedApy) : "—"}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: isSelected ? "#3f4e5f" : "#4f5e6f",
                    fontFamily: mono,
                    marginTop: 1,
                  }}
                >
                  {data?.pools || 0} pools · {fmt(data?.tvl || 0, 1)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Modules */}
      <div
        style={{
          padding: "20px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <ModuleCard>
          <SectionHeader
            title={`${selectedAsset} Yield Chatter`}
            subtitle="Recent tweets about yield opportunities"
          />
          <TwitterFeed tweets={tweets} loading={tweetsLoading} error={tweetsError} />
        </ModuleCard>

        <ModuleCard>
          <SectionHeader
            title={`${selectedAsset} Top Yields`}
            subtitle={`Highest yielding pools by APY`}
          />
          {refreshing ? <ChartShimmer height={180} /> : (
            <div key={refreshKey}><TrendingYields trending={trendingPools} asset={selectedAsset} /></div>
          )}
        </ModuleCard>

        <ModuleCard>
          {refreshing ? <ChartShimmer height={300} /> : (
            <div key={refreshKey}><TVLHeatmap pools={assetPools} asset={selectedAsset} /></div>
          )}
        </ModuleCard>

        <ModuleCard>
          <SectionHeader
            title={`${selectedAsset} Yield Breakdown`}
            subtitle={`Top protocols and chains by ${selectedAsset} yield (single-exposure pools)`}
          />
          {refreshing ? <ChartShimmer height={250} /> : (
            <div key={refreshKey}><AssetYieldBreakdown stats={assetProtocolStats} asset={selectedAsset} yieldIndex={yieldIndex} color={color} /></div>
          )}
        </ModuleCard>

        <ModuleCard>
          <SectionHeader
            title={`${selectedAsset} Lending Rates`}
            subtitle={`Supply APY by protocol vs. ${selectedAsset} yield index`}
          />
          {refreshing ? <ChartShimmer height={250} /> : (
            <div key={refreshKey}><RateOverlay rateData={assetLendingRates} asset={selectedAsset} yieldIndex={yieldIndex} color={color} /></div>
          )}
        </ModuleCard>

        {/* Footer */}
        <div
          style={{
            textAlign: "center",
            padding: "12px 0",
            fontSize: 10,
            color: "#3a4a5a",
            fontFamily: mono,
            borderTop: "1px solid rgba(255,255,255,0.025)",
          }}
        >
          DeFi Yield Dashboard · Live data from DeFiLlama yields API
        </div>
      </div>
    </div>
  );
}

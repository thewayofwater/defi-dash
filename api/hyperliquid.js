const HL_API = "https://api.hyperliquid.xyz/info";
const HLP_VAULT = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";

async function hlPost(body) {
  const resp = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Hyperliquid API ${resp.status}`);
  return resp.json();
}

function parseTimeSeries(arr, filterZero = true) {
  const series = (arr || []).map(([ts, val]) => ({ timestamp: ts, value: Number(val) }));
  return filterZero ? series.filter((d) => d.value > 0) : series;
}

// Compute monthly returns using NAV (Net Asset Value) per unit of deposits
// NAV = TVL / (TVL - cumPnL) = TVL / totalDeposits
// Monthly return = (endNAV / startNAV - 1) * 100
// This is the true per-share return, automatically handling deposits/withdrawals
function computeMonthlyReturns(valueHistory, pnlHistory) {
  if (valueHistory.length < 2 || pnlHistory.length < 2) return {};

  // Build NAV series by pairing value and PnL at each snapshot
  const navSeries = [];
  for (let i = 0; i < Math.min(valueHistory.length, pnlHistory.length); i++) {
    const tvl = valueHistory[i].value;
    const pnl = pnlHistory[Math.min(i, pnlHistory.length - 1)].value;
    const deposits = tvl - pnl;
    const nav = deposits > 0 ? tvl / deposits : 1;
    navSeries.push({ timestamp: valueHistory[i].timestamp, nav });
  }

  // Group by year-month
  const byMonth = {};
  navSeries.forEach((d) => {
    const dt = new Date(d.timestamp);
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!byMonth[key]) byMonth[key] = { first: d, last: d };
    if (d.timestamp < byMonth[key].first.timestamp) byMonth[key].first = d;
    if (d.timestamp >= byMonth[key].last.timestamp) byMonth[key].last = d;
  });

  const months = Object.keys(byMonth).sort();
  const returns = {};
  for (let i = 0; i < months.length; i++) {
    const key = months[i];
    const [yearStr, monthStr] = key.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);

    const startNav = i > 0 ? byMonth[months[i - 1]].last.nav : byMonth[key].first.nav;
    const endNav = byMonth[key].last.nav;
    if (startNav > 0) {
      if (!returns[year]) returns[year] = {};
      returns[year][month] = ((endNav / startNav) - 1) * 100;
    }
  }
  return returns;
}

function computeDrawdown(history) {
  let peak = 0;
  return history.map((d) => {
    peak = Math.max(peak, d.value);
    const dd = peak > 0 ? ((d.value - peak) / peak) * 100 : 0;
    return { timestamp: d.timestamp, drawdown: dd };
  });
}

// Monthly returns using Hypurrscan's formula:
// PnL change / average TVL, with time normalization for partial months
// Merges allTime + month + week series for higher granularity
// Exact Hypurrscan algorithm: PnL change / avg TVL, with time-normalization for partial months
// Uses local timezone (getMonth/getFullYear) to match their implementation
function computeMonthlyReturnsHypurrscan(valueHistory, pnlHistory) {
  const len = Math.min(valueHistory.length, pnlHistory.length);
  if (len < 2) return {};

  const returns = {};
  let prev = null; // { year, month, tvl, pnl, ts }

  for (let r = 0; r < len; r++) {
    const dt = new Date(valueHistory[r].timestamp);
    const ts = valueHistory[r].timestamp;
    const year = dt.getFullYear();    // LOCAL timezone (matches Hypurrscan)
    const month = dt.getMonth();      // LOCAL timezone, 0-indexed
    const tvl = valueHistory[r].value;
    const pnl = pnlHistory[r].value;

    if (!returns[year]) returns[year] = {};

    if (prev !== null && (year !== prev.year || month !== prev.month)) {
      // Month boundary crossed — compute return for previous month
      const pnlChange = pnl - prev.pnl;
      const avgTvl = (tvl + prev.tvl) / 2;
      if (avgTvl > 0) {
        returns[prev.year][prev.month + 1] = (pnlChange / avgTvl) * 100;
      }
      prev = { year, month, tvl, pnl, ts };
    }

    if (r === 0) {
      prev = { year, month, tvl, pnl, ts };
    }

    // Last data point — skip current incomplete month entirely
    // The partial month's performance is visible in the period stat cards instead
  }
  return returns;
}

// NAV-based drawdown (true per-share drawdown, net of deposits/withdrawals)
function computeNavDrawdown(valueHistory, pnlHistory) {
  const series = [];
  let navPeak = 0;
  for (let i = 0; i < Math.min(valueHistory.length, pnlHistory.length); i++) {
    const tvl = valueHistory[i].value;
    const pnl = pnlHistory[Math.min(i, pnlHistory.length - 1)].value;
    const deposits = tvl - pnl;
    const nav = deposits > 0 ? tvl / deposits : 1;
    navPeak = Math.max(navPeak, nav);
    const dd = navPeak > 0 ? ((nav - navPeak) / navPeak) * 100 : 0;
    series.push({ timestamp: valueHistory[i].timestamp, drawdown: dd });
  }
  return series;
}

// Risk metrics derived entirely from the validated monthly returns
function computeRiskMetrics(monthlyReturns) {
  // Flatten all monthly returns into a single array
  const allMonthlyReturns = [];
  Object.values(monthlyReturns).forEach((months) => {
    Object.values(months).forEach((r) => allMonthlyReturns.push(r));
  });

  if (allMonthlyReturns.length < 2) {
    return { maxDrawdown: 0, currentDrawdown: 0, annualizedReturn: 0, annualizedVol: 0, sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0, winRate: 0, bestMonth: 0, worstMonth: 0 };
  }

  // Compounded total return from monthly returns
  const totalReturnFactor = allMonthlyReturns.reduce((acc, r) => acc * (1 + r / 100), 1);
  const totalMonths = allMonthlyReturns.length;
  const annualizedReturn = (Math.pow(totalReturnFactor, 12 / totalMonths) - 1) * 100;

  // Monthly volatility → annualized
  const meanMonthly = allMonthlyReturns.reduce((s, r) => s + r, 0) / totalMonths;
  const monthlyVariance = allMonthlyReturns.reduce((s, r) => s + (r - meanMonthly) ** 2, 0) / (totalMonths - 1);
  const monthlyVol = Math.sqrt(monthlyVariance);
  const annualizedVol = monthlyVol * Math.sqrt(12);

  // Sharpe (risk-free = 0)
  const sharpeRatio = annualizedVol > 0 ? annualizedReturn / annualizedVol : 0;

  // Sortino (downside deviation from monthly returns)
  const negReturns = allMonthlyReturns.filter((r) => r < 0);
  const downsideVar = negReturns.length > 1
    ? negReturns.reduce((s, r) => s + r ** 2, 0) / (negReturns.length - 1)
    : 0;
  const downsideDev = Math.sqrt(downsideVar) * Math.sqrt(12);
  const sortinoRatio = downsideDev > 0 ? annualizedReturn / downsideDev : 0;

  // Max drawdown from compounded monthly returns
  let peak = 1, maxDrawdown = 0;
  let cumReturn = 1;
  allMonthlyReturns.forEach((r) => {
    cumReturn *= (1 + r / 100);
    peak = Math.max(peak, cumReturn);
    const dd = ((cumReturn - peak) / peak) * 100;
    maxDrawdown = Math.min(maxDrawdown, dd);
  });
  // Current drawdown
  const currentDrawdown = ((cumReturn - peak) / peak) * 100;

  // Calmar
  const calmarRatio = maxDrawdown < 0 ? annualizedReturn / Math.abs(maxDrawdown) : 0;

  const winRate = (allMonthlyReturns.filter((r) => r > 0).length / totalMonths) * 100;
  const bestMonth = Math.max(...allMonthlyReturns);
  const worstMonth = Math.min(...allMonthlyReturns);

  return {
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    currentDrawdown: Math.round(currentDrawdown * 100) / 100,
    annualizedReturn: Math.round(annualizedReturn * 100) / 100,
    annualizedVol: Math.round(annualizedVol * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    winRate: Math.round(winRate * 10) / 10,
    bestMonth: Math.round(bestMonth * 100) / 100,
    worstMonth: Math.round(worstMonth * 100) / 100,
  };
}

function computePeriodChange(series) {
  if (!series || series.length < 2) return { change: 0, changePct: 0 };
  const first = series[0];
  const last = series[series.length - 1];
  const change = last.value - first.value;
  const changePct = first.value > 0 ? (change / first.value) * 100 : 0;
  return { change, changePct };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  try {
    const [vaultData, clearingData] = await Promise.all([
      hlPost({ type: "vaultDetails", vaultAddress: HLP_VAULT, user: "0x0000000000000000000000000000000000000000" }),
      hlPost({ type: "clearinghouseState", user: HLP_VAULT }).catch(() => null),
    ]);

    // Parse portfolio time series
    const portfolioMap = {};
    (vaultData.portfolio || []).forEach((entry) => {
      const [key, data] = entry;
      portfolioMap[key] = data;
    });

    const allTimeHistory = parseTimeSeries(portfolioMap.allTime?.accountValueHistory);
    const allTimePnl = parseTimeSeries(portfolioMap.allTime?.pnlHistory, false);
    // Unfiltered value series for monthly returns (must align by index with PnL)
    const allTimeHistoryRaw = parseTimeSeries(portfolioMap.allTime?.accountValueHistory, false);
    const dayHistory = parseTimeSeries(portfolioMap.day?.accountValueHistory);
    const weekHistory = parseTimeSeries(portfolioMap.week?.accountValueHistory);
    const monthHistory = parseTimeSeries(portfolioMap.month?.accountValueHistory);
    const dayPnlSeries = parseTimeSeries(portfolioMap.day?.pnlHistory, false);
    const weekPnlSeries = parseTimeSeries(portfolioMap.week?.pnlHistory, false);
    const monthPnlSeries = parseTimeSeries(portfolioMap.month?.pnlHistory, false);

    // Compute derived data
    // Merge allTime + month + week accountValueHistory for higher granularity (Hypurrscan approach)
    // NOTE: only merge value series — PnL series use different baselines (allTime=cumulative, month/week=relative)
    const mergedValue = [...allTimeHistory, ...monthHistory, ...weekHistory]
      .sort((a, b) => a.timestamp - b.timestamp);
    // Deduplicate by keeping last entry per hourly bucket
    const dedupValue = []; const seenValTs = new Set();
    for (let i = mergedValue.length - 1; i >= 0; i--) {
      const key = Math.floor(mergedValue[i].timestamp / 3600000);
      if (!seenValTs.has(key)) { seenValTs.add(key); dedupValue.unshift(mergedValue[i]); }
    }

    // Use allTime only for monthly returns (matches Hypurrscan: this.rawData = e.portfolio[3][1])
    // Must use unfiltered series so value[i] and pnl[i] align by index
    const monthlyReturns = computeMonthlyReturnsHypurrscan(allTimeHistoryRaw, allTimePnl);
    const drawdownSeries = computeDrawdown(allTimeHistory);
    const riskMetrics = computeRiskMetrics(monthlyReturns);

    const change24h = computePeriodChange(dayHistory);
    const change7d = computePeriodChange(weekHistory);
    const change30d = computePeriodChange(monthHistory);

    // Period PnL — these series start at 0 and are cumulative from period start
    const pnl24h = dayPnlSeries.length > 0 ? dayPnlSeries[dayPnlSeries.length - 1].value : 0;
    const pnl7d = weekPnlSeries.length > 0 ? weekPnlSeries[weekPnlSeries.length - 1].value : 0;
    const pnl30d = monthPnlSeries.length > 0 ? monthPnlSeries[monthPnlSeries.length - 1].value : 0;

    const latestValue = allTimeHistory.length > 0 ? allTimeHistory[allTimeHistory.length - 1].value : 0;
    const latestPnl = allTimePnl.length > 0 ? allTimePnl[allTimePnl.length - 1].value : 0;

    // YTD return (NAV-based, annualized)
    const currentYear = new Date().getUTCFullYear();
    const janFirst = new Date(Date.UTC(currentYear, 0, 1)).getTime();
    // Find closest NAV snapshot to Jan 1 of current year
    const navSeries = [];
    for (let i = 0; i < Math.min(allTimeHistory.length, allTimePnl.length); i++) {
      const tvl = allTimeHistory[i].value;
      const pnl = allTimePnl[Math.min(i, allTimePnl.length - 1)].value;
      const deposits = tvl - pnl;
      navSeries.push({ timestamp: allTimeHistory[i].timestamp, nav: deposits > 0 ? tvl / deposits : 1 });
    }
    // Find the snapshot closest to (but before) Jan 1
    let ytdStartNav = 1;
    let ytdStartTs = janFirst;
    for (let i = navSeries.length - 1; i >= 0; i--) {
      if (navSeries[i].timestamp <= janFirst) {
        ytdStartNav = navSeries[i].nav;
        ytdStartTs = navSeries[i].timestamp;
        break;
      }
    }
    const ytdEndNav = navSeries.length > 0 ? navSeries[navSeries.length - 1].nav : 1;
    const ytdReturn = ((ytdEndNav / ytdStartNav) - 1) * 100;
    const daysSoFar = (Date.now() - janFirst) / (1000 * 86400);
    const ytdAnnualized = daysSoFar > 0 ? ((Math.pow(ytdEndNav / ytdStartNav, 365 / daysSoFar)) - 1) * 100 : 0;

    // YTD PnL: cumulative PnL change since Jan 1
    let ytdStartPnl = 0;
    let ytdStartTvl = 0;
    for (let i = allTimePnl.length - 1; i >= 0; i--) {
      if (allTimePnl[i].timestamp <= janFirst) { ytdStartPnl = allTimePnl[i].value; break; }
    }
    for (let i = allTimeHistory.length - 1; i >= 0; i--) {
      if (allTimeHistory[i].timestamp <= janFirst) { ytdStartTvl = allTimeHistory[i].value; break; }
    }
    const ytdPnl = latestPnl - ytdStartPnl;
    const ytdTvlChangePct = ytdStartTvl > 0 ? ((latestValue - ytdStartTvl) / ytdStartTvl) * 100 : 0;

    // Compute APR for different periods
    const aprFromPnl = (pnl, value, days) => value > 0 && days > 0 ? (pnl / value) * (365 / days) * 100 : 0;
    const apr1d = aprFromPnl(pnl24h, latestValue, 1);
    const apr7d = aprFromPnl(pnl7d, latestValue, 7);
    const apr30d = aprFromPnl(pnl30d, latestValue, 30);

    // Follower summary
    const followers = vaultData.followers || [];
    const totalFollowerEquity = followers.reduce((s, f) => s + Number(f.vaultEquity || 0), 0);
    const buckets = [
      { label: "0-30d", min: 0, max: 30 },
      { label: "30-90d", min: 30, max: 90 },
      { label: "90-180d", min: 90, max: 180 },
      { label: "180d-1y", min: 180, max: 365 },
      { label: "1y+", min: 365, max: Infinity },
    ];
    const followerDistribution = buckets.map((b) => {
      const matching = followers.filter((f) => {
        const days = Number(f.daysFollowing || 0);
        return days >= b.min && days < b.max;
      });
      return {
        bucket: b.label,
        count: matching.length,
        equity: matching.reduce((s, f) => s + Number(f.vaultEquity || 0), 0),
      };
    });

    // Current state
    const margin = clearingData?.marginSummary || {};

    return res.status(200).json({
      vault: {
        name: vaultData.name,
        address: vaultData.vaultAddress,
        leader: vaultData.leader,
        description: vaultData.description,
        apr: (vaultData.apr || 0) * 100,
        leaderCommission: (vaultData.leaderCommission || 0) * 100,
        leaderFraction: (vaultData.leaderFraction || 0) * 100,
        maxDistributable: Number(vaultData.maxDistributable || 0),
        allowDeposits: vaultData.allowDeposits,
      },
      currentState: {
        accountValue: Number(margin.accountValue || 0),
        totalNtlPos: Number(margin.totalNtlPos || 0),
        totalMarginUsed: Number(margin.totalMarginUsed || 0),
      },
      heroMetrics: {
        vaultValue: latestValue,
        apr: (vaultData.apr || 0) * 100,
        apr1d, apr7d, apr30d,
        pnl24h, pnl7d, pnl30d,
        allTimePnl: latestPnl,
        ytdReturn,
        ytdAnnualized,
        ytdPnl,
        ytdTvlChangePct,
        change24h: change24h.change,
        change24hPct: change24h.changePct,
        change7d: change7d.change,
        change7dPct: change7d.changePct,
        change30d: change30d.change,
        change30dPct: change30d.changePct,
        followerCount: followers.length >= 100 ? "100+" : followers.length,
        maxDistributable: Number(vaultData.maxDistributable || 0),
      },
      timeSeries: {
        allTime: {
          value: allTimeHistory.map((d) => ({ date: d.timestamp, value: d.value })),
          pnl: allTimePnl.map((d) => ({ date: d.timestamp, value: d.value })),
          drawdown: computeNavDrawdown(allTimeHistory, allTimePnl).map((d) => ({ date: d.timestamp, drawdown: d.drawdown })),
        },
        day: {
          value: dayHistory.map((d) => ({ date: d.timestamp, value: d.value })),
          pnl: dayPnlSeries.map((d) => ({ date: d.timestamp, value: d.value })),
          drawdown: computeNavDrawdown(dayHistory, dayPnlSeries).map((d) => ({ date: d.timestamp, drawdown: d.drawdown })),
        },
        week: {
          value: weekHistory.map((d) => ({ date: d.timestamp, value: d.value })),
          pnl: weekPnlSeries.map((d) => ({ date: d.timestamp, value: d.value })),
          drawdown: computeNavDrawdown(weekHistory, weekPnlSeries).map((d) => ({ date: d.timestamp, drawdown: d.drawdown })),
        },
        month: {
          value: monthHistory.map((d) => ({ date: d.timestamp, value: d.value })),
          pnl: monthPnlSeries.map((d) => ({ date: d.timestamp, value: d.value })),
          drawdown: computeNavDrawdown(monthHistory, monthPnlSeries).map((d) => ({ date: d.timestamp, drawdown: d.drawdown })),
        },
      },
      monthlyReturns,
      riskMetrics,
    });
  } catch (err) {
    console.error("Hyperliquid API error:", err);
    return res.status(500).json({ error: err.message });
  }
}

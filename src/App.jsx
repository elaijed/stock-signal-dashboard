import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  ComposedChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { supabase } from "./supabase.js";
import SocialPage from "./social/SocialPage.jsx";
import {
  myNetwork, getSharedPortfolio, loadMyProfile, postActivity, networkSymbols, myNotifications, acceptInvite,
} from "./social/api.js";
import Avatar from "./social/Avatar.jsx";
import Feed from "./social/Feed.jsx";
import NotificationsBell from "./social/Notifications.jsx";
import { explainStock, levelsExplained, positionSentence, backtestSentence, pickReason } from "./ui/explain.js";
import { Info, VerdictBar, WhyPanel, Collapsible, FriendsStack, Toast } from "./ui/components.jsx";
import Home, { GlossaryPage } from "./ui/home.jsx";
import { PracticePage, PracticeTradeModal, applyPaperTrade, newPaper } from "./ui/practice.jsx";
import ShareModal from "./ui/share.jsx";
import { challengeBoard } from "./social/api.js";
import { PerformanceChart, TodayStrip, useDigest, DigestCard, EarningsList, DividendsCard, Welcome } from "./ui/portfolio.jsx";

/*
 * Stock Signal Dashboard — single-file React artifact.
 *
 * Assumptions (per spec, noted here rather than asked):
 * - Finnhub free tier: quotes always work; the /stock/candle endpoint may be
 *   403 on some free keys. If candles fail, the card still shows the live
 *   quote and degrades gracefully (no chart / no signal), without retry-looping.
 * - "6 months of daily candles" for the chart; we fetch ~10 months so the
 *   50-day SMA has warm-up data, then display the last ~126 trading days.
 * - Two pages (tab nav, persisted): "My Watchlist" (add/buy + detailed per-stock
 *   analysis cards) and "Recommendations" (the daily Top-5 screen).
 * - analyze() is the single source of truth per ticker: trend (20/50 SMA),
 *   momentum (14-day RSI + direction), 6-month range, 20-day volatility, and
 *   volume. It derives PRECISE levels in code — support (SMA50/recent floor),
 *   resistance (6-mo high), a volatility-scaled stop (2.5× daily σ, capped
 *   5-15%), and a target (recent high, or a 2:1 reward-to-risk projection) —
 *   plus a graded recommendation (action + High/Moderate/Low conviction).
 *   The AI only narrates these computed numbers; it never invents levels.
 * - Signal shorthand: Bullish = uptrend & not overbought; Bearish = downtrend &
 *   not oversold; else Neutral. Owned actions: Consider Selling / Reduce /
 *   Consider Trimming / Buy More / Hold. Watching: Buy / Buy the Dip / Buy on
 *   Pullback / Wait for Pullback / Avoid / Watch — chosen from trend strength,
 *   RSI level & direction, and how extended price is above the 20-day.
 * - MACD (12/26/9) is a THIRD confirming signal. MA crossover, RSI and MACD each
 *   cast a directional vote: all-agree upgrades the label to "Strong Bullish/
 *   Bearish" (and bumps conviction to High); conflict adds a "(mixed signals)"
 *   note. Same logic feeds Watchlist, Owned, and the Daily Picks technical score
 *   (now MA 14 / RSI 12 / MACD 12 / volume 12 within the 50-pt technical half).
 * - Accounts (Supabase): the dashboard sits behind an email/password log-in.
 *   Watchlist, owned positions, price alerts and trade history live in the
 *   user's own row of public.portfolios (Row Level Security: only that user
 *   can read or write it) and auto-save ~0.4s after each change. Device
 *   preferences (Finnhub key, last tab, picks cache) stay in browser storage.
 *   On an account's first log-in, data this browser saved earlier is moved in.
 * - Richer info per card (Finnhub free tier, real data only, fetched once per
 *   ticker per session): company profile/logo/sector, real 52-wk range +
 *   dividend yield, latest-period analyst ratings (stamped with the period),
 *   next earnings date, and the last 7 days of news. Missing pieces are omitted.
 * - Charts: 1M/3M/6M/Max timeframe toggle, SMA20/50 overlaid on the price axis,
 *   and a separate volume strip (two single-axis charts, never a dual axis).
 * - In-app price alerts (above/below a price), stored locally; checked on every
 *   quote refresh, shown as card chips + a top banner when they fire.
 * - Portfolio analytics: sector allocation with a >40% concentration warning,
 *   best/worst performer + biggest move today, and realized P/L — every Sell
 *   records the closed trade at the live price into a trade history.
 * - Owned page: a slim portfolio summary bar (value, unrealized $/%, count of
 *   positions at their stop or target) plus a prominent per-card breach badge —
 *   "Stop-Loss Breached" / "Target Reached". Both read from one shared per-
 *   position calc so the count and the badges can't disagree.
 * - Quotes auto-refresh every 60s (sequential, gentle on the 60 req/min free
 *   limit). Candles are fetched once per ticker per session and cached.
 * - Claude explanations are cached per (symbol + signal + recommendation +
 *   RSI zone) and only regenerated when that key changes.
 * - Backtest (collapsible per card): reuses the already-cached candles, no new
 *   API calls. Both strategies start with a hypothetical $1,000 over the same
 *   ~6-month window the chart shows. If the window opens with SMA20 already
 *   above SMA50, the signal strategy buys on day one (the uptrend signal is
 *   considered active), otherwise it waits in cash for the first bullish cross.
 * - Candle fallback (local dev only): if Finnhub refuses candles (403 on free
 *   keys), we try the dev server's /yahoo proxy (see vite.config.js). Inside a
 *   claude.ai artifact that path simply doesn't exist and the card degrades
 *   gracefully as before.
 * - AI explanations: inside a claude.ai artifact they use the keyless artifact
 *   pattern. Outside it (local dev), set an Anthropic API key in Settings —
 *   the call then goes through the dev server's /anthropic proxy with that key.
 * - Top 5 Daily Picks: scans a hardcoded ~100-ticker large-cap pool once per
 *   24h (cached with a timestamp). Score = 50% technical (MA spread, RSI zone,
 *   volume vs 20-day avg) + 50% fundamental (P/E, EPS growth, revenue growth
 *   from Finnhub /stock/metric — free tier). Sector-relative P/E isn't in that
 *   endpoint, so absolute P/E bands stand in for "below sector average".
 *   Missing data scores neutral rather than disqualifying a ticker. The scan
 *   runs sequentially (~1 req/s) to respect Finnhub's 60/min free limit.
 */

// Optional default Finnhub key for local runs, from .env.local (not committed).
// The public site has none: open it once via a #key=... share link or paste a key in Settings.
const DEFAULT_API_KEY = import.meta.env.VITE_FINNHUB_KEY || "";

// ---------- accounts (Supabase) ----------
// Client lives in supabase.js. Row Level Security on public.portfolios: each
// signed-in user can only select/insert/update/delete their own row; connections
// read a filtered copy through get_shared_portfolio() (see supabase/001_social.sql).

// One row per user. Its jsonb "watchlist" column holds the whole account
// document, so adding features never needs a database migration:
//   { v: 1, watchlist: [...], alerts: [...], transactions: [...] }
// A bare array (the column's '[]' default) is read as an empty account.
function parseAccountDoc(raw) {
  if (Array.isArray(raw)) return { watchlist: raw, alerts: [], transactions: [], events: [] };
  return {
    watchlist: Array.isArray(raw?.watchlist) ? raw.watchlist : [],
    alerts: Array.isArray(raw?.alerts) ? raw.alerts : [],
    transactions: Array.isArray(raw?.transactions) ? raw.transactions : [],
    events: Array.isArray(raw?.events) ? raw.events : [],
    paper: raw?.paper && typeof raw.paper === "object" ? raw.paper : null,
    onboarding: raw?.onboarding && typeof raw.onboarding === "object" ? raw.onboarding : {},
  };
}

// Returns the account doc, or null when this user has no row yet (first login).
async function loadAccount(userId) {
  const { data, error } = await supabase.from("portfolios").select("watchlist").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? parseAccountDoc(data.watchlist) : null;
}

async function saveAccount(userId, doc) {
  const { error } = await supabase.from("portfolios").upsert({
    user_id: userId,
    watchlist: { v: 1, watchlist: doc.watchlist, alerts: doc.alerts, transactions: doc.transactions, events: doc.events || [], paper: doc.paper || null, onboarding: doc.onboarding || {} },
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ---------- persistent storage (window.storage on claude.ai) ----------

const memFallback = new Map(); // last resort if neither window.storage nor localStorage exists

async function storageGet(key) {
  try {
    if (typeof window !== "undefined" && window.storage?.getItem) {
      const res = await window.storage.getItem(key);
      if (res == null) return null;
      // API may return the raw string or an object with a .value field
      return typeof res === "object" && "value" in res ? res.value : res;
    }
  } catch (e) {
    /* fall through */
  }
  try {
    const v = window.localStorage?.getItem(key); // local dev / plain browser
    if (v != null) return v;
  } catch (e) {
    /* fall through */
  }
  return memFallback.has(key) ? memFallback.get(key) : null;
}

async function storageSet(key, value) {
  try {
    if (typeof window !== "undefined" && window.storage?.setItem) {
      await window.storage.setItem(key, value);
      return;
    }
  } catch (e) {
    /* fall through */
  }
  try {
    window.localStorage?.setItem(key, value);
    return;
  } catch (e) {
    /* fall through */
  }
  memFallback.set(key, value);
}

const KEY_APIKEY = "ssd_finnhub_key";
const KEY_WATCHLIST = "ssd_watchlist_v1";
const KEY_PICKS = "ssd_top_picks_v1";
const KEY_PAGE = "ssd_page";
const KEY_ALERTS = "ssd_alerts_v1"; // [{ id, symbol, dir: "above"|"below", price, created, triggeredAt }]
const KEY_TX = "ssd_transactions_v1"; // closed trades: [{ id, symbol, qty, buyPrice, sellPrice, buyDate, sellDate, realizedUsd, realizedPct }]
const PICKS_TTL_MS = 24 * 60 * 60 * 1000; // rescan at most once per 24h

// ~100 well-known, liquid large caps across sectors (S&P 500 / Nasdaq names).
// Hardcoded by design — no API call needed to build the pool.
const PICK_POOL = [
  // mega/large tech, software, semis
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "ORCL", "CRM",
  "ADBE", "AMD", "INTC", "QCOM", "TXN", "IBM", "NOW", "INTU", "CSCO", "MU",
  "AMAT", "LRCX", "KLAC", "ADI", "NXPI", "PANW", "SNOW", "SHOP", "UBER", "ABNB",
  "PLTR", "NFLX", "PYPL", "CRWD",
  // financials
  "JPM", "BAC", "WFC", "GS", "MS", "C", "SCHW", "BLK", "AXP", "V", "MA", "COF", "USB",
  // healthcare
  "UNH", "JNJ", "LLY", "PFE", "MRK", "ABBV", "TMO", "ABT", "DHR", "BMY",
  "AMGN", "GILD", "CVS", "ISRG", "VRTX",
  // consumer
  "WMT", "COST", "PG", "KO", "PEP", "MCD", "NKE", "SBUX", "TGT", "HD",
  "LOW", "DIS", "CMG", "LULU", "MDLZ", "MO", "PM",
  // energy
  "XOM", "CVX", "COP", "SLB", "OXY", "EOG", "PSX", "MPC",
  // industrials
  "BA", "CAT", "DE", "HON", "GE", "LMT", "RTX", "UPS", "FDX", "UNP",
  // telecom, utilities, autos
  "T", "VZ", "TMUS", "CMCSA", "NEE", "DUK", "SO", "F", "GM",
];

// ---------- indicators ----------

function sma(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

// 14-day RSI with Wilder's smoothing
function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// exponential moving average — full series, null until seeded (SMA seed at `period`)
function emaSeries(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// MACD (12/26/9 standard). Returns the latest read { macd, signal, hist, bull }
// or null when there isn't enough history. bull = MACD line above its signal line.
function computeMACD(closes, fast = 12, slow = 26, sig = 9) {
  if (closes.length < slow + sig) return null;
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) macdLine.push(emaFast[i] - emaSlow[i]);
  }
  if (macdLine.length < sig) return null;
  const sigSeries = emaSeries(macdLine, sig);
  const signal = sigSeries[sigSeries.length - 1];
  const macd = macdLine[macdLine.length - 1];
  const hist = macd - signal;
  // sessions since the MACD line last crossed its signal line (null if no cross in view)
  let crossAgo = null;
  for (let i = macdLine.length - 2, k = 1; i >= 0 && sigSeries[i] != null; i--, k++) {
    if ((macdLine[i] - sigSeries[i] > 0) !== hist > 0) {
      crossAgo = k - 1;
      break;
    }
  }
  return { macd, signal, hist, bull: hist > 0, crossAgo };
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / (arr.length - 1));
}

/**
 * Full technical read + precise, volatility-aware trade parameters for one
 * ticker. Every number here is computed deterministically — the AI narrative
 * only describes these values, it never invents them. Returns null when there
 * isn't enough history (need 50 sessions for the SMA50).
 *
 * Levels:
 * - support/resistance: SMA50 (trend floor) and the 6-month swing high.
 * - stop: a volatility-scaled stop (2.5× the 20-day daily σ, capped 5–15%) so
 *   choppy names get more room and calm names a tighter leash.
 * - target: the recent high if it's a real distance away, otherwise a 2:1
 *   reward-to-risk projection off the stop.
 */
function analyze(candles, quote, item) {
  if (!candles || candles.length < 50) return null;
  const closes = candles.map((c) => c.close);
  const price = quote?.c ?? closes[closes.length - 1];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const rsiPrev = closes.length > 18 ? rsi(closes.slice(0, -3), 14) : null; // ~3 sessions ago, for direction
  const spreadPct = ((sma20 - sma50) / sma50) * 100;

  // recent 6-month range for support/resistance context
  const win = closes.slice(-126);
  const hi = Math.max(...win);
  const lo = Math.min(...win);
  const pctFromHigh = ((price - hi) / hi) * 100; // ≤ 0: how far below the recent high

  // 20-day close-to-close volatility (% per day) → volatility-scaled stop width
  const rets = [];
  for (let i = Math.max(1, closes.length - 20); i < closes.length; i++) {
    rets.push(((closes[i] - closes[i - 1]) / closes[i - 1]) * 100);
  }
  const dayVol = stdev(rets);
  const stopPct = clamp(2.5 * dayVol, 5, 15);

  // volume: last completed session vs its 20-day average (skip today's partial bar)
  let volRatio = null;
  {
    let vIdx = candles.length - 1;
    const lastBar = new Date(candles[vIdx].t * 1000);
    const now = new Date();
    if (
      lastBar.getUTCFullYear() === now.getUTCFullYear() &&
      lastBar.getUTCMonth() === now.getUTCMonth() &&
      lastBar.getUTCDate() === now.getUTCDate()
    )
      vIdx -= 1;
    const vols = candles.slice(0, vIdx + 1).map((c) => c.v).filter((v) => v > 0);
    if (vols.length >= 21) {
      const avg20 = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      volRatio = vols[vols.length - 1] / avg20;
    }
  }

  // trend / momentum flags
  const uptrend = spreadPct > 0.5;
  const downtrend = spreadPct < -0.5;
  const strongUp = spreadPct > 3;
  const strongDown = spreadPct < -3;
  const overbought = rsi14 >= 70;
  const oversold = rsi14 <= 30;
  const rsiRising = rsiPrev != null && rsi14 > rsiPrev + 1;
  const rsiFalling = rsiPrev != null && rsi14 < rsiPrev - 1;
  const extended = price > sma20 * 1.08; // stretched > 8% above the 20-day

  let signal = "Neutral";
  if (uptrend && !overbought) signal = "Bullish";
  else if (downtrend && !oversold) signal = "Bearish";

  // MACD (12/26/9) as a second confirming signal. Each of the three indicators
  // casts a directional vote; when all three agree we upgrade to "Strong", and
  // when they conflict we flag "mixed signals" so lower confidence is visible.
  const macd = computeMACD(closes);
  const maVote = spreadPct > 0.5 ? 1 : spreadPct < -0.5 ? -1 : 0;
  const rsiVote = rsi14 > 50 ? 1 : rsi14 < 50 ? -1 : 0;
  const macdVote = macd ? (macd.hist > 0 ? 1 : macd.hist < 0 ? -1 : 0) : 0;
  const allBull = maVote > 0 && rsiVote > 0 && macdVote > 0;
  const allBear = maVote < 0 && rsiVote < 0 && macdVote < 0;
  const signalStrong = (signal === "Bullish" && allBull) || (signal === "Bearish" && allBear);
  const anyBull = maVote > 0 || rsiVote > 0 || macdVote > 0;
  const anyBear = maVote < 0 || rsiVote < 0 || macdVote < 0;
  const signalMixed = !signalStrong && anyBull && anyBear;
  const signalLabel = signalStrong ? `Strong ${signal}` : signal;

  // precise levels
  const support = price > sma50 ? sma50 : lo; // trend support, else recent floor
  const resistance = price < hi ? hi : price * (1 + (stopPct / 100) * 2); // recent high, else projected
  const stop = price * (1 - stopPct / 100);
  const risk = price - stop;
  const target = resistance > price * 1.03 ? resistance : price + 2 * risk;
  const reward = target - price;
  const rr = risk > 0 ? reward / risk : null;

  // owned P/L
  let gainPct = null;
  let gainUsd = null;
  if (item?.status === "owned" && item.buyPrice > 0) {
    gainPct = ((price - item.buyPrice) / item.buyPrice) * 100;
    gainUsd = (price - item.buyPrice) * item.qty;
  }

  // recommendation: action + conviction + a one-line rationale
  const strength = (isStrong) => (isStrong ? "High" : Math.abs(spreadPct) > 1.5 ? "Moderate" : "Low");
  let action, conviction, rationale;
  if (item?.status === "owned") {
    if (strongDown || (downtrend && gainPct != null && gainPct < 0)) {
      action = "Consider Selling";
      conviction = strength(strongDown);
      rationale = "The trend has turned down — protect capital rather than hope for a bounce.";
    } else if (downtrend) {
      action = "Reduce / Tighten Stop";
      conviction = "Moderate";
      rationale = "Momentum is fading; trim the position or set a tight stop to lock in what you have.";
    } else if (uptrend && overbought && gainPct != null && gainPct > 15) {
      action = "Consider Trimming";
      conviction = "Moderate";
      rationale = "Strong run but overbought — taking partial profit de-risks the position.";
    } else if (uptrend && (gainPct == null || gainPct < 5) && !extended) {
      action = "Buy More";
      conviction = strength(strongUp);
      rationale = "Healthy uptrend and the price isn't stretched — a clean spot to add.";
    } else if (uptrend) {
      action = "Hold";
      conviction = strength(strongUp);
      rationale = "Trend is intact; ride it with a protective stop and let the winner run.";
    } else {
      action = "Hold";
      conviction = "Low";
      rationale = "No clear trend — hold and wait for the moving averages to resolve direction.";
    }
  } else {
    if (downtrend) {
      action = "Avoid";
      conviction = strength(strongDown);
      rationale = "Price is below its trend line — there's no edge buying a downtrend.";
    } else if (uptrend && overbought) {
      action = "Wait for Pullback";
      conviction = "Moderate";
      rationale = "The uptrend is real but overbought; a dip toward the 20-day is a better entry.";
    } else if (uptrend && oversold) {
      action = "Buy the Dip";
      conviction = rsiRising ? "High" : "Moderate";
      rationale = "A pullback inside an uptrend — buy weakness near support with a tight stop.";
    } else if (uptrend && extended) {
      action = "Buy on Pullback";
      conviction = "Low";
      rationale = "Trend is strong but price is stretched — wait for it to come back to the 20-day.";
    } else if (uptrend) {
      action = "Buy";
      conviction = strength(strongUp);
      rationale = "Clean uptrend with room to run and a defined stop below support.";
    } else {
      action = "Watch";
      conviction = "Low";
      rationale = "Flat and undecided — wait for a decisive move above the 50-day.";
    }
  }
  if (signalStrong) conviction = "High"; // all three indicators aligned → higher confidence

  // concrete factor chips
  const factors = [];
  factors.push(
    spreadPct >= 0
      ? `Uptrend · 20-day ${spreadPct.toFixed(1)}% above 50-day`
      : `Downtrend · 20-day ${Math.abs(spreadPct).toFixed(1)}% below 50-day`
  );
  factors.push(
    overbought
      ? `RSI ${rsi14.toFixed(0)} · overbought`
      : oversold
      ? `RSI ${rsi14.toFixed(0)} · oversold`
      : `RSI ${rsi14.toFixed(0)} · ${rsi14 >= 45 && rsi14 <= 65 ? "healthy" : "neutral"}${
          rsiRising ? ", rising" : rsiFalling ? ", falling" : ""
        }`
  );
  if (macd) factors.push(macd.bull ? "MACD bullish (above signal)" : "MACD bearish (below signal)");
  if (volRatio != null && volRatio >= 1.3) factors.push(`Volume ${volRatio.toFixed(1)}× avg`);
  factors.push(`${Math.abs(pctFromHigh).toFixed(1)}% below 6-mo high`);

  const bearish = /(sell|reduce|trim|avoid)/i.test(action);

  return {
    signal, signalLabel, signalStrong, signalMixed, macd,
    sma20, sma50, rsi14, spreadPct, price, hi, lo, pctFromHigh, dayVol, stopPct,
    volRatio, support, resistance, stop, target, risk, reward, rr,
    action, conviction, rationale, factors, gainPct, gainUsd, bearish,
    uptrend, downtrend, strongUp, strongDown, overbought, oversold, rsiRising, rsiFalling, extended,
    votes: { ma: maVote, rsi: rsiVote, macd: macdVote },
  };
}

function actionStyle(action) {
  const a = action.toLowerCase();
  if (/\b(buy|add|accumulate)\b/.test(a)) return "bg-emerald-800/60 text-emerald-200";
  if (/(sell|reduce|trim|cut|avoid)/.test(a)) return "bg-red-800/60 text-red-200";
  return "bg-zinc-700/70 text-zinc-200"; // hold / wait / watch
}

const CONVICTION_STYLE = {
  High: "text-emerald-400",
  Moderate: "text-amber-400",
  Low: "text-zinc-500",
};

// Parse a stored purchase date. New records are "YYYY-MM-DD" — parse those as
// LOCAL midnight (bare new Date("YYYY-MM-DD") is UTC, which shifts the day back
// one in western timezones). Legacy full-ISO strings pass through unchanged.
function parseDate(purchaseDate) {
  if (!purchaseDate) return null;
  const d = new Date(purchaseDate.length === 10 ? purchaseDate + "T00:00:00" : purchaseDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysHeld(purchaseDate) {
  const d = parseDate(purchaseDate);
  if (!d) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

/**
 * Risk parameters for a stock you ALREADY OWN. One clearly-shown method:
 *  • Stop-loss = the TIGHTER (higher) of two rules:
 *      – 8% below your entry (a fixed max-loss rule), and
 *      – 2% below the 50-day moving average (structural trend support).
 *    Taking the tighter of the two caps risk near 8% while respecting support;
 *    once the 50-day climbs above your entry it effectively trails the stop up.
 *  • Take-profit target = entry + 2 × (entry − stop)  → a 2:1 reward-to-risk exit.
 *  • Trailing stop (only once up ≥ 10%): lock gains ~8% below the current price
 *    but never below your entry, so a winner can't round-trip into a loss.
 *  • Recommendation factors the technical signal, whether price has breached the
 *    stop or hit the target, RSI, and unrealized P/L.
 */
function ownedRisk(item, a, price) {
  const entry = item.buyPrice;
  const stopByPct = entry * 0.92; // 8% below entry
  const stopBySupport = a?.sma50 != null ? a.sma50 * 0.98 : null; // 2% below 50-day
  const stop = stopBySupport != null ? Math.max(stopByPct, stopBySupport) : stopByPct;
  // Target = 2:1 off the fixed 8%-of-entry risk (→ 16% above entry). Anchored to
  // the initial-risk stop, not the displayed stop, so it stays a stable level
  // above entry even when a risen 50-day pushes the protective stop above entry.
  const target = entry + 2 * (entry - stopByPct);
  const upPct = ((price - entry) / entry) * 100;
  const movedUp = upPct >= 10;
  const trailing = movedUp ? Math.max(entry, price * 0.92) : null;
  const breachedStop = price <= stop;
  const hitTarget = price >= target;
  const distToStopPct = ((price - stop) / price) * 100; // + = above stop
  const distToTargetPct = ((target - price) / price) * 100; // + = below target

  const signal = a?.signal ?? "Neutral";
  const rsi14 = a?.rsi14 ?? 50;
  let rec, recReason;
  if (breachedStop) {
    rec = "Consider Selling";
    recReason = "Price has breached your stop-loss — the reason to hold is gone; protect capital.";
  } else if (hitTarget) {
    rec = "Consider Trimming";
    recReason = "Price reached your take-profit target — trimming locks in gains while letting the rest run.";
  } else if (signal === "Bearish") {
    rec = "Consider Selling";
    recReason = "The trend has turned down while you're holding — tighten the stop or step aside.";
  } else if (rsi14 >= 70 && upPct > 15) {
    rec = "Consider Trimming";
    recReason = "A big gain but overbought — taking partial profit de-risks the position.";
  } else if (signal === "Bullish") {
    rec = "Hold";
    recReason = "Trend is intact and you're above your stop — hold and let the winner run.";
  } else {
    rec = "Hold";
    recReason = "No clear reason to act — hold and let your stop-loss do its job.";
  }
  return {
    entry, stopByPct, stopBySupport, stop, target, upPct, movedUp, trailing,
    breachedStop, hitTarget, distToStopPct, distToTargetPct, rec, recReason,
  };
}

// ---------- Finnhub ----------

function finnhubError(status) {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate";
  return "other";
}

async function fetchQuote(symbol, apiKey) {
  const res = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`
  );
  if (!res.ok) throw { kind: finnhubError(res.status), status: res.status };
  const q = await res.json();
  if (!q || (q.c === 0 && q.pc === 0)) throw { kind: "invalid" };
  return q; // { c, d, dp, h, l, o, pc }
}

// Once Finnhub refuses candles for this key (403), remember it for the session
// so bulk operations (the daily-picks scan) don't burn a rate-limited call per
// ticker before falling back. Reset when the user saves a new Finnhub key.
let finnhubCandlesBlocked = false;

async function fetchCandles(symbol, apiKey) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 60 * 60 * 24 * 300; // ~10 months for SMA50 warm-up
  try {
    if (finnhubCandlesBlocked) throw { kind: "auth" };
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) {
      const kind = finnhubError(res.status);
      if (kind === "auth") finnhubCandlesBlocked = true;
      throw { kind, status: res.status };
    }
    const data = await res.json();
    if (data.s !== "ok" || !Array.isArray(data.c) || data.c.length < 30) throw { kind: "nodata" };
    return data.t.map((t, i) => ({ t, close: data.c[i], v: data.v?.[i] ?? 0 }));
  } catch (err) {
    // Finnhub free keys often lack candle access (403). When running on the
    // local dev server, fall back to the /yahoo proxy (vite.config.js). In a
    // claude.ai artifact this fetch 404s and we rethrow the original error.
    if (err.kind === "rate") throw err; // rate limits are retried later, don't mask them
    try {
      return await fetchCandlesYahoo(symbol);
    } catch (_) {
      throw err;
    }
  }
}

async function fetchCandlesYahoo(symbol) {
  // Hosted build (GitHub Pages): there's no proxy, so read the daily candle
  // snapshot that the GitHub Action writes to candles/<SYMBOL>.json.
  if (!import.meta.env.DEV) return fetchCandlesSnapshot(symbol);
  const res = await fetch(
    `/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?range=10mo&interval=1d`
  );
  if (!res.ok) throw { kind: "nodata" };
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const ts = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  const closes = quote?.close;
  const volumes = quote?.volume;
  if (!Array.isArray(ts) || !Array.isArray(closes)) throw { kind: "nodata" };
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] != null) out.push({ t: ts[i], close: closes[i], v: volumes?.[i] ?? 0 }); // skip null gap days
  }
  if (out.length < 30) throw { kind: "nodata" };
  return out;
}

async function fetchCandlesSnapshot(symbol) {
  const res = await fetch(`${import.meta.env.BASE_URL}candles/${encodeURIComponent(symbol.toUpperCase())}.json`);
  if (!res.ok) throw { kind: "nodata" };
  const data = await res.json();
  if (!Array.isArray(data?.t) || !Array.isArray(data?.c) || data.c.length < 30) throw { kind: "nodata" };
  return data.t.map((t, i) => ({ t, close: data.c[i], v: data.v?.[i] ?? 0 }));
}

// Basic financials for the picks screen (free on Finnhub). One bounded retry
// after a pause if we hit the rate limit mid-scan — never a retry loop.
async function fetchMetrics(symbol, apiKey, retried = false) {
  const res = await fetch(
    `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${encodeURIComponent(apiKey)}`
  );
  if (res.status === 429 && !retried) {
    await sleep(3000);
    return fetchMetrics(symbol, apiKey, true);
  }
  if (!res.ok) throw { kind: finnhubError(res.status), status: res.status };
  const data = await res.json();
  if (!data?.metric || typeof data.metric !== "object") throw { kind: "nodata" };
  return data.metric;
}

// ---------- richer per-stock info (all free-tier Finnhub endpoints) ----------
// Each returns ONLY real data from Finnhub; callers omit anything that errors
// or comes back empty — nothing is ever faked or back-filled.

async function fetchProfile(symbol, apiKey) {
  const res = await fetch(
    `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`
  );
  if (!res.ok) throw { kind: finnhubError(res.status) };
  const d = await res.json();
  if (!d || !d.name) throw { kind: "nodata" };
  return d; // { name, logo, finnhubIndustry, weburl, ... }
}

// Latest analyst-recommendation period (array is newest-first; we sort to be sure).
async function fetchRecommendation(symbol, apiKey) {
  const res = await fetch(
    `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`
  );
  if (!res.ok) throw { kind: finnhubError(res.status) };
  const arr = await res.json();
  if (!Array.isArray(arr) || !arr.length) throw { kind: "nodata" };
  arr.sort((a, b) => (a.period < b.period ? 1 : -1));
  return arr[0]; // { period, strongBuy, buy, hold, sell, strongSell }
}

// Next scheduled earnings date (nearest date today-or-later), or null if none.
async function fetchEarningsDate(symbol, apiKey) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
  const res = await fetch(
    `https://finnhub.io/api/v1/calendar/earnings?from=${todayStr}&to=${to}&symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`
  );
  if (!res.ok) throw { kind: finnhubError(res.status) };
  const d = await res.json();
  const list = Array.isArray(d?.earningsCalendar) ? d.earningsCalendar : [];
  const future = list.filter((e) => e.date >= todayStr).sort((a, b) => (a.date < b.date ? -1 : 1));
  return future[0] || null; // { date, hour, ... } or null
}

// Up to 5 most-recent company-news items from the last 7 days (real headlines only).
async function fetchNews(symbol, apiKey) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const res = await fetch(
    `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${todayStr}&token=${encodeURIComponent(apiKey)}`
  );
  if (!res.ok) throw { kind: finnhubError(res.status) };
  const arr = await res.json();
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((n) => n.headline && n.url)
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, 5)
    .map((n) => ({ headline: n.headline, url: n.url, source: n.source, datetime: n.datetime }));
}

const ERROR_TEXT = {
  auth: "Finnhub rejected the request (check your API key / plan access).",
  rate: "Finnhub rate limit hit — data will load on the next refresh.",
  invalid: "Unknown ticker symbol.",
  nodata: "No candle data available (free Finnhub keys may not include candles).",
  other: "Couldn't reach Finnhub.",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timeAgo = (ts) => {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
};
const fmt = (n, d = 2) =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const monthYear = (iso) => {
  const d = new Date((iso || "").slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};
const relTime = (unixSec) => {
  const mins = Math.max(0, Math.round((Date.now() - unixSec * 1000) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
};
// whole days from today (local) until a YYYY-MM-DD date
const daysUntil = (iso) => {
  const d = new Date((iso || "").slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
};

// ---------- picks screening ----------

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Score one ticker 0-100: 50 pts technical + 50 pts fundamental.
 * Missing data lands mid-band ("neutral") instead of disqualifying the stock,
 * so a ticker is only ranked up/down by what we actually know about it.
 * Returns { symbol, score, price, reasons } — reasons are the human-readable
 * criteria that drove the score, shown on the pick card.
 */
function scoreStock(symbol, candles, metric) {
  const reasons = [];
  let score = 0;

  // ---- technical: 50 pts — MA crossover (14), RSI (12), MACD (12), volume (12).
  //      MA / RSI / MACD are the three roughly-equal directional signals; volume
  //      is a confirming spike bonus.
  let price = null;
  if (candles && candles.length >= 50) {
    const closes = candles.map((c) => c.close);
    price = closes[closes.length - 1];

    // MA spread: map SMA20 vs SMA50 gap of -5%..+5% onto 0..14 pts
    const sma20v = sma(closes, 20);
    const sma50v = sma(closes, 50);
    const spreadPct = ((sma20v - sma50v) / sma50v) * 100;
    score += Math.round(clamp((spreadPct + 5) / 10, 0, 1) * 14);
    reasons.push(
      spreadPct >= 0
        ? `Bullish MA trend (SMA20 ${spreadPct.toFixed(1)}% above SMA50)`
        : `Bearish MA trend (SMA20 ${Math.abs(spreadPct).toFixed(1)}% below SMA50)`
    );

    // RSI: favor the 40-60 neutral-to-recovering band, penalize overbought (0..12)
    const r = rsi(closes, 14);
    if (r >= 40 && r <= 60) {
      score += 12;
      reasons.push(`RSI ${r.toFixed(0)} (healthy range)`);
    } else if (r > 60 && r <= 70) {
      score += 7;
      reasons.push(`RSI ${r.toFixed(0)} (running warm)`);
    } else if (r >= 30 && r < 40) {
      score += 7;
      reasons.push(`RSI ${r.toFixed(0)} (recovering)`);
    } else if (r < 30) {
      score += 3;
      reasons.push(`RSI ${r.toFixed(0)} (oversold)`);
    } else {
      reasons.push(`RSI ${r.toFixed(0)} (overbought)`); // +0 pts
    }

    // MACD (12/26/9): confirming momentum signal (0..12)
    const m = computeMACD(closes);
    if (m) {
      if (m.hist > 0) {
        score += 12;
        reasons.push("MACD bullish (above signal line)");
      } else if (m.hist < 0) {
        score += 3;
        reasons.push("MACD bearish (below signal line)");
      } else {
        score += 6;
      }
    } else {
      score += 6; // MACD unavailable → neutral
    }

    // Volume: last completed session vs its 20-day average — a spike signals
    // interest. If the final bar is today's still-forming session, its partial
    // intraday volume would read artificially "quiet", so step back one bar. (0..12)
    let vIdx = candles.length - 1;
    const lastBar = new Date(candles[vIdx].t * 1000);
    const today = new Date();
    if (
      lastBar.getUTCFullYear() === today.getUTCFullYear() &&
      lastBar.getUTCMonth() === today.getUTCMonth() &&
      lastBar.getUTCDate() === today.getUTCDate()
    ) {
      vIdx -= 1;
    }
    const vols = candles.slice(0, vIdx + 1).map((c) => c.v).filter((v) => v > 0);
    if (vols.length >= 21) {
      const avg20 = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      const ratio = vols[vols.length - 1] / avg20;
      if (ratio >= 1.5) {
        score += 12;
        reasons.push(`Volume ${ratio.toFixed(1)}× its 20-day average (strong interest)`);
      } else if (ratio >= 1.1) {
        score += 8;
        reasons.push(`Volume ${ratio.toFixed(1)}× its 20-day average`);
      } else if (ratio >= 0.7) {
        score += 6; // ordinary volume, no reason line needed
      } else {
        score += 3;
        reasons.push(`Quiet volume (${ratio.toFixed(1)}× average)`);
      }
    } else {
      score += 6; // volume data unavailable → neutral
    }
  } else {
    score += 25; // no chart data → neutral technical score (half of 50)
    reasons.push("No chart data (neutral technical score)");
  }

  // ---- fundamental: 50 pts (P/E 20, EPS growth 15, revenue growth 15) ----
  if (metric) {
    // P/E — absolute bands as a proxy for "reasonable vs sector"
    const pe = metric.peTTM ?? metric.peBasicExclExtraTTM ?? metric.peNormalizedAnnual;
    if (pe != null && pe > 0) {
      if (pe <= 15) {
        score += 20;
        reasons.push(`P/E ${pe.toFixed(1)} (attractive)`);
      } else if (pe <= 25) {
        score += 15;
        reasons.push(`P/E ${pe.toFixed(1)} (reasonable)`);
      } else if (pe <= 40) {
        score += 8;
        reasons.push(`P/E ${pe.toFixed(1)} (rich)`);
      } else {
        score += 3;
        reasons.push(`P/E ${pe.toFixed(1)} (expensive)`);
      }
    } else {
      score += 8; // negative/missing earnings → can't judge, slight penalty
      reasons.push("No meaningful P/E");
    }

    // growth trends: prefer trailing-twelve-month YoY, fall back to 5y CAGR
    const growthPts = (g) => (g > 15 ? 15 : g > 5 ? 10 : g > 0 ? 6 : 2);
    const epsG = metric.epsGrowthTTMYoy ?? metric.epsGrowth5Y;
    if (epsG != null) {
      score += growthPts(epsG);
      if (epsG > 5) reasons.push(`EPS growth ${epsG.toFixed(0)}%`);
      else if (epsG <= 0) reasons.push(`EPS shrinking (${epsG.toFixed(0)}%)`);
    } else {
      score += 7; // unavailable → neutral
    }
    const revG = metric.revenueGrowthTTMYoy ?? metric.revenueGrowth5Y;
    if (revG != null) {
      score += growthPts(revG);
      if (revG > 5) reasons.push(`Revenue growth ${revG.toFixed(0)}%`);
      else if (revG <= 0) reasons.push(`Revenue shrinking (${revG.toFixed(0)}%)`);
    } else {
      score += 7; // unavailable → neutral
    }
  } else {
    score += 22; // fundamentals unavailable → neutral
    reasons.push("Fundamentals unavailable (neutral score)");
  }

  if (price == null) return null; // nothing usable at all — drop from ranking
  return { symbol, score: clamp(Math.round(score), 0, 100), price, reasons };
}

// ---------- backtest ----------

const BACKTEST_BUDGET = 1000; // hypothetical starting amount for both strategies

/**
 * Simulate buy-and-hold vs signal-following over the same ~6-month window the
 * mini chart displays, using the candles already cached in state.
 *
 * Rules (kept deliberately simple):
 * - Buy-and-hold: put the full $1,000 into shares on day one, hold to the end.
 * - Signal-following: start with $1,000 cash. Go all-in when SMA20 crosses
 *   above SMA50; sell everything back to cash when it crosses below. If the
 *   window opens already bullish, buy on day one (signal considered active).
 * - Fractional shares allowed, no commissions/slippage (hypothetical exercise).
 *
 * Returns null when there isn't enough history for the 50-day SMA.
 */
function runBacktest(candles) {
  const closes = candles.map((c) => c.close);

  // rolling SMA for every index (null until `period` days of history exist)
  const rollingSma = (period) => {
    const out = new Array(closes.length).fill(null);
    let sum = 0;
    for (let i = 0; i < closes.length; i++) {
      sum += closes[i];
      if (i >= period) sum -= closes[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  };
  const s20 = rollingSma(20);
  const s50 = rollingSma(50);

  // Backtest window: last ~126 trading days, but never before SMA50 exists.
  const start = Math.max(49, candles.length - 126);
  if (candles.length - start < 10) return null; // not enough data to be meaningful

  // Buy-and-hold: all-in on the first day of the window.
  const bhShares = BACKTEST_BUDGET / closes[start];

  // Signal-following state, updated one day at a time.
  let state = { cash: BACKTEST_BUDGET, shares: 0, day: 0 };
  let trades = 0;
  let prevBullish = null; // relation on the previous day (null = window start)
  const series = [];

  for (let i = start; i < candles.length; i++) {
    const price = closes[i];
    const bullish = s20[i] > s50[i];

    // A "cross" is a change in the SMA20/SMA50 relation since yesterday.
    // On day one, an already-bullish market counts as an active buy signal.
    const buySignal = bullish && (prevBullish === null || prevBullish === false);
    const sellSignal = !bullish && prevBullish === true;

    if (buySignal && state.cash > 0) {
      state = { cash: 0, shares: state.cash / price, day: state.day };
      trades++;
    } else if (sellSignal && state.shares > 0) {
      state = { cash: state.shares * price, shares: 0, day: state.day };
      trades++;
    }
    prevBullish = bullish;
    state = { ...state, day: state.day + 1 };

    series.push({
      t: candles[i].t,
      buyHold: bhShares * price,
      signal: state.cash + state.shares * price,
    });
  }

  const last = series[series.length - 1];
  const bhReturn = (last.buyHold / BACKTEST_BUDGET - 1) * 100;
  const sigReturn = (last.signal / BACKTEST_BUDGET - 1) * 100;
  return { series, bhReturn, sigReturn, trades, days: series.length };
}

// ---------- palette (dashboard commits to a dark finance theme) ----------

const C = {
  line: "#3987e5", // series-1 blue, dark-surface step
  grid: "#2c2c2a",
  up: "#0ca30c",
  down: "#d03b3b",
  muted: "#898781",
};

const SIGNAL_STYLE = {
  Bullish: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/60",
  Bearish: "bg-red-900/40 text-red-300 border border-red-700/60",
  Neutral: "bg-zinc-800 text-zinc-300 border border-zinc-600/60",
};

// chip style for the signal — brighter/bordered when all three indicators align
function signalChipStyle(baseSignal, strong) {
  if (baseSignal === "Bullish")
    return strong ? "bg-emerald-700/70 text-emerald-100 border border-emerald-500" : SIGNAL_STYLE.Bullish;
  if (baseSignal === "Bearish")
    return strong ? "bg-red-700/70 text-red-100 border border-red-500" : SIGNAL_STYLE.Bearish;
  return SIGNAL_STYLE.Neutral;
}

// ---------- components ----------

const CHART_COLORS = { price: C.line, sma20: "#d9a43a", sma50: "#9085e9", volUp: "#1f5f3a", volDown: "#6b2626" };

// timeframe → number of trading sessions shown. "Max" = everything fetched (~10 months).
const TIMEFRAMES = { "1M": 21, "3M": 63, "6M": 126, Max: Infinity };

// rolling SMA aligned to the input series (null until `period` values exist)
function rollingSMA(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 shadow-lg">
      <div className="text-zinc-400">
        {new Date(p.t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </div>
      <div className="font-medium">${fmt(p.close)}</div>
      {p.sma20 != null && (
        <div>
          <span style={{ color: CHART_COLORS.sma20 }}>●</span> SMA20 ${fmt(p.sma20)}
        </div>
      )}
      {p.sma50 != null && (
        <div>
          <span style={{ color: CHART_COLORS.sma50 }}>●</span> SMA50 ${fmt(p.sma50)}
        </div>
      )}
      {p.v > 0 && <div className="text-zinc-400">Vol {(p.v / 1e6).toFixed(1)}M</div>}
    </div>
  );
}

// Price chart: close-price area with SMA20/SMA50 overlaid on the SAME price axis,
// plus a separate volume strip underneath (its own chart, so no dual axis).
// SMAs are computed on the full fetched history, then windowed, so a 1M view
// still shows a correct 50-day average.
function MiniChart({ candles, symbol, tall = false }) {
  const [tf, setTf] = useState("6M");
  const series = useMemo(() => {
    const closes = candles.map((c) => c.close);
    const s20 = rollingSMA(closes, 20);
    const s50 = rollingSMA(closes, 50);
    return candles.map((c, i) => ({
      t: c.t,
      close: c.close,
      v: c.v || 0,
      up: i === 0 ? true : c.close >= candles[i - 1].close,
      sma20: s20[i],
      sma50: s50[i],
    }));
  }, [candles]);
  const n = TIMEFRAMES[tf];
  const view = Number.isFinite(n) ? series.slice(-n) : series;
  const hasVolume = view.some((d) => d.v > 0);

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex gap-3 text-[10px] text-zinc-500">
          <span>
            <span style={{ color: CHART_COLORS.price }}>━</span> Price
          </span>
          <span>
            <span style={{ color: CHART_COLORS.sma20 }}>━</span> SMA20
          </span>
          <span>
            <span style={{ color: CHART_COLORS.sma50 }}>━</span> SMA50
          </span>
        </div>
        <div className="flex gap-0.5 rounded-md bg-zinc-800/60 p-0.5">
          {Object.keys(TIMEFRAMES).map((k) => (
            <button
              key={k}
              onClick={() => setTf(k)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                tf === k ? "bg-zinc-600 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className={`${tall ? "h-64" : "h-32"} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={view} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`fill-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.price} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART_COLORS.price} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis domain={["auto", "auto"]} hide />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: C.muted, strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="close"
              stroke={CHART_COLORS.price}
              strokeWidth={2}
              fill={`url(#fill-${symbol})`}
              dot={false}
              activeDot={{ r: 4, fill: CHART_COLORS.price, stroke: "#1a1a19", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="sma20"
              stroke={CHART_COLORS.sma20}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="sma50"
              stroke={CHART_COLORS.sma50}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {hasVolume && (
        <div className="h-8 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={view} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barCategoryGap={1}>
              <XAxis dataKey="t" hide />
              <YAxis hide domain={[0, "auto"]} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="v" isAnimationActive={false} shape={<VolumeBar />} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// volume bar colored by up/down session (custom shape avoids per-bar Cell imports)
function VolumeBar({ x, y, width, height, payload }) {
  if (!height || height <= 0) return null;
  return (
    <rect
      x={x}
      y={y}
      width={Math.max(1, width)}
      height={height}
      fill={payload?.up ? CHART_COLORS.volUp : CHART_COLORS.volDown}
    />
  );
}

const BT_COLORS = { signal: C.line, buyHold: C.muted };

function BacktestTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 shadow-lg">
      <div className="text-zinc-400">
        {new Date(p.t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </div>
      <div>
        <span style={{ color: BT_COLORS.signal }}>●</span> Signal ${fmt(p.signal)}
      </div>
      <div>
        <span style={{ color: BT_COLORS.buyHold }}>●</span> Buy &amp; hold ${fmt(p.buyHold)}
      </div>
    </div>
  );
}

function BacktestSection({ candles }) {
  const [open, setOpen] = useState(false);
  // computed lazily on first expand, then memoized against the cached candles
  const result = useMemo(() => (open ? runBacktest(candles) : null), [open, candles]);

  return (
    <div className="mt-3 border-t border-zinc-800 pt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 transition hover:text-zinc-300"
      >
        <span>Backtest · 6 mo · ${BACKTEST_BUDGET.toLocaleString()} hypothetical</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open &&
        (result ? (
          <div className="mt-2">
            {/* final returns */}
            <div className="mb-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: BT_COLORS.signal }} />
                  Signal-following
                </div>
                <div
                  className={`font-semibold tabular-nums ${result.sigReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {result.sigReturn >= 0 ? "+" : ""}
                  {fmt(result.sigReturn)}%
                </div>
              </div>
              <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: BT_COLORS.buyHold }} />
                  Buy &amp; hold
                </div>
                <div
                  className={`font-semibold tabular-nums ${result.bhReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {result.bhReturn >= 0 ? "+" : ""}
                  {fmt(result.bhReturn)}%
                </div>
              </div>
            </div>

            {/* verdict */}
            <div className="mb-2 text-xs text-zinc-400">
              {Math.abs(result.sigReturn - result.bhReturn) < 0.05 ? (
                <>The two strategies ended in a dead heat</>
              ) : result.sigReturn > result.bhReturn ? (
                <>
                  <span className="font-medium text-zinc-200">Signal-following won</span> by{" "}
                  {fmt(result.sigReturn - result.bhReturn)} pts
                </>
              ) : (
                <>
                  <span className="font-medium text-zinc-200">Buy &amp; hold won</span> by{" "}
                  {fmt(result.bhReturn - result.sigReturn)} pts
                </>
              )}{" "}
              · {result.trades} trade{result.trades === 1 ? "" : "s"} over {result.days} sessions
            </div>

            {/* portfolio value chart */}
            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="t" hide />
                  <YAxis domain={["auto", "auto"]} hide />
                  <Tooltip content={<BacktestTooltip />} cursor={{ stroke: C.muted, strokeWidth: 1 }} />
                  <Line
                    type="monotone"
                    dataKey="buyHold"
                    stroke={BT_COLORS.buyHold}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="signal"
                    stroke={BT_COLORS.signal}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 text-[10px] text-zinc-600">
              Hypothetical, ignores commissions/slippage/taxes. Past performance ≠ future results.
            </div>
          </div>
        ) : (
          <div className="mt-2 rounded-md bg-zinc-800/50 px-3 py-2 text-xs text-zinc-500">
            Not enough candle history to run a meaningful backtest for this ticker.
          </div>
        ))}
    </div>
  );
}

// one labeled price level in the parameters grid
function Level({ label, value, tone }) {
  return (
    <div className="rounded-md bg-zinc-800/50 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tone || "text-zinc-200"}`}>{value}</div>
    </div>
  );
}

// ---------- richer-info card pieces (render only when real data is present) ----------

// company logo + full name + sector, shown under the ticker in a card header
function CompanyMeta({ info }) {
  const p = info?.profile;
  if (!p) return null;
  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      {p.logo ? (
        <img
          src={p.logo}
          alt=""
          className="h-4 w-4 rounded-sm bg-white/90 object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span className="truncate text-xs text-zinc-400">{p.name}</span>
      {p.finnhubIndustry ? (
        <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500">
          {p.finnhubIndustry}
        </span>
      ) : null}
    </div>
  );
}

// amber flag when a scheduled earnings date is known; stamped with the real date
function EarningsFlag({ info }) {
  const e = info?.earnings;
  if (!e?.date) return null;
  const d = daysUntil(e.date);
  if (d == null || d < 0) return null;
  const when = d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
  const soon = d <= 7;
  const dateStr = new Date(e.date.slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        soon
          ? "border border-amber-700/50 bg-amber-900/40 text-amber-300"
          : "border border-zinc-700 bg-zinc-800 text-zinc-400"
      }`}
    >
      {soon ? "⚠ " : ""}Earnings {when} ({dateStr})
    </span>
  );
}

// real 52-week range + dividend yield from Finnhub's metric endpoint
function FiftyTwoWeek({ info, price }) {
  const m = info?.metric;
  if (!m) return null;
  const hi = m["52WeekHigh"];
  const lo = m["52WeekLow"];
  const divY = m.dividendYieldIndicatedAnnual ?? m.currentDividendYieldTTM;
  if (hi == null && lo == null && divY == null) return null;
  const pctFromHigh = hi && price != null ? ((price - hi) / hi) * 100 : null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
      {hi != null && lo != null && (
        <span>
          52-wk <span className="tabular-nums text-zinc-300">${fmt(lo)}–${fmt(hi)}</span>
        </span>
      )}
      {pctFromHigh != null && (
        <span>
          <span className="tabular-nums text-zinc-300">{Math.abs(pctFromHigh).toFixed(1)}%</span> below 52-wk high
        </span>
      )}
      {divY != null && divY > 0 && (
        <span>
          Div yield <span className="tabular-nums text-zinc-300">{divY.toFixed(2)}%</span>
        </span>
      )}
    </div>
  );
}

// analyst recommendation bar from the latest period, stamped with that period's month
function AnalystRatings({ info }) {
  const r = info?.rec;
  if (!r) return null;
  const buy = (r.strongBuy || 0) + (r.buy || 0);
  const hold = r.hold || 0;
  const sell = (r.sell || 0) + (r.strongSell || 0);
  const total = buy + hold + sell;
  if (!total) return null;
  const pct = (n) => `${(n / total) * 100}%`;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="uppercase tracking-wider text-zinc-500">Analyst ratings</span>
        <span className="text-zinc-600">
          {total} analysts · {monthYear(r.period)}
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
        {buy > 0 && <div style={{ width: pct(buy) }} className="bg-emerald-600" />}
        {hold > 0 && <div style={{ width: pct(hold) }} className="bg-zinc-500" />}
        {sell > 0 && <div style={{ width: pct(sell) }} className="bg-red-600" />}
      </div>
      <div className="mt-1 flex gap-3 text-[11px] text-zinc-400">
        <span>
          <span className="text-emerald-400">●</span> {buy} Buy
        </span>
        <span>
          <span className="text-zinc-400">●</span> {hold} Hold
        </span>
        <span>
          <span className="text-red-400">●</span> {sell} Sell
        </span>
      </div>
    </div>
  );
}

// collapsible recent-news list (real headlines, last 7 days); collapsed by default
function NewsSection({ info }) {
  const [open, setOpen] = useState(false);
  const news = info?.news;
  if (!news || !news.length) return null;
  return (
    <div className="mt-3 border-t border-zinc-800 pt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 transition hover:text-zinc-300"
      >
        <span>Recent news ({news.length})</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="mt-1 space-y-2">
          {news.map((n, i) => (
            <li key={i} className="text-xs leading-snug">
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-300 transition hover:text-blue-400"
              >
                {n.headline}
              </a>
              <div className="mt-0.5 text-[10px] text-zinc-600">
                {n.source} · {relTime(n.datetime)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Price + today's move; briefly flashes green/red when a new quote arrives
function PriceLine({ quote, big = false }) {
  const prev = useRef(quote?.c);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (quote?.c == null) return;
    if (prev.current != null && quote.c !== prev.current) {
      setFlash(quote.c > prev.current ? "flash-up" : "flash-down");
      const t = setTimeout(() => setFlash(""), 1200);
      prev.current = quote.c;
      return () => clearTimeout(t);
    }
    prev.current = quote.c;
  }, [quote?.c]);
  if (!quote) return <div className="mb-2 h-8 w-40 animate-pulse rounded bg-zinc-800" />;
  const up = quote.dp >= 0;
  return (
    <div className="flex items-baseline gap-3">
      <span className={`${big ? "text-3xl" : "text-2xl"} rounded px-1 -mx-1 font-semibold tabular-nums text-zinc-50 ${flash}`}>${fmt(quote.c)}</span>
      <span className={`text-sm font-medium tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
        {up ? "▲" : "▼"} {fmt(Math.abs(quote.d))} ({fmt(Math.abs(quote.dp))}%) today
      </span>
    </div>
  );
}

// Support / resistance / stop / target, each explained in a sentence
function LevelsExplained({ a }) {
  const rows = levelsExplained(a);
  if (!rows.length) return null;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="rounded-md bg-zinc-800/40 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-zinc-400">
              {r.label}
              <Info term={r.info} />
            </span>
            <span className={`text-sm font-semibold tabular-nums ${r.tone === "bad" ? "text-red-300" : r.tone === "good" ? "text-emerald-300" : "text-zinc-100"}`}>
              {r.value}
            </span>
          </div>
          <div className="text-[11px] text-zinc-500">{r.text}</div>
        </div>
      ))}
    </div>
  );
}

function AnalystSentence({ info }) {
  const r = info?.rec;
  if (!r) return null;
  const buy = (r.strongBuy || 0) + (r.buy || 0);
  const hold = r.hold || 0;
  const sell = (r.sell || 0) + (r.strongSell || 0);
  const total = buy + hold + sell;
  if (!total) return null;
  const lean = buy / total >= 0.6 ? "Most analysts say buy." : sell / total >= 0.4 ? "Many analysts are negative." : "Analysts are mixed.";
  return (
    <p className="mt-1 text-xs text-zinc-400">
      {total} analysts: {buy} Buy, {hold} Hold, {sell} Sell ({monthYear(r.period)}). {lean}
    </p>
  );
}

function BacktestBlurb({ candles }) {
  const bt = useMemo(() => (candles ? runBacktest(candles) : null), [candles]);
  const s = backtestSentence(bt);
  if (!s) return null;
  return (
    <p className="mt-2 text-xs text-zinc-400">
      {s}
      <Info term="backtest" />
    </p>
  );
}

function StockCard({ item, data, info, alerts, onSetAlert, onDeleteAlert, onBuy, onRemove, friends, onOpen }) {
  const quote = data?.quote;
  const candles = data?.candles;
  const a = candles ? analyze(candles, quote, item) : null;
  const ex = explainStock(a);

  return (
    <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-md transition hover:border-zinc-700">
      {/* header */}
      <div className="mb-1 flex items-start justify-between gap-2">
        <button onClick={() => onOpen(item.symbol)} className="min-w-0 text-left">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-wide text-zinc-100 hover:text-blue-300">{item.symbol}</h2>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Watching</span>
          </div>
          <CompanyMeta info={info} />
        </button>
        <EarningsFlag info={info} />
      </div>
      {ex?.summary && <p className="mb-2 text-sm text-zinc-300">{ex.summary}</p>}

      {data?.quoteError ? (
        <div className="mb-3 rounded-md border border-amber-800/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
          {ERROR_TEXT[data.quoteError] || ERROR_TEXT.other}
        </div>
      ) : (
        <div className="mb-2">
          <PriceLine quote={quote} />
        </div>
      )}

      {data?.candleError ? (
        <div className="mb-3 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400">
          {ERROR_TEXT[data.candleError] || ERROR_TEXT.other}
        </div>
      ) : candles ? (
        <MiniChart candles={candles} symbol={item.symbol} />
      ) : (
        <div className="mb-1 h-28 w-full animate-pulse rounded bg-zinc-800" />
      )}

      <FriendsStack owners={friends?.owners || []} watchers={friends?.watchers || []} onOpen={() => onOpen(item.symbol)} />
      <VerdictBar ex={ex} />
      <WhyPanel ex={ex} compact />

      <AlertChips symbol={item.symbol} alerts={alerts} price={quote?.c} onAdd={onSetAlert} onDelete={onDeleteAlert} />

      {a && (
        <Collapsible id={`more-${item.symbol}`} title="More details">
          <LevelsExplained a={a} />
          <FiftyTwoWeek info={info} price={quote?.c} />
          <AnalystRatings info={info} />
          <AnalystSentence info={info} />
          <BacktestBlurb candles={candles} />
          {candles && <BacktestSection candles={candles} />}
          <NewsSection info={info} />
        </Collapsible>
      )}

      <div className="mt-4 flex gap-2 border-t border-zinc-800 pt-3">
        <button
          onClick={() => onBuy(item.symbol, quote?.c)}
          disabled={!quote}
          className="flex-1 rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40"
        >
          Buy
        </button>
        <button
          onClick={() => onOpen(item.symbol)}
          className="rounded-lg border border-zinc-700 px-3 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-blue-600 hover:text-blue-300"
        >
          Details
        </button>
        <button
          onClick={() => onRemove(item.symbol)}
          className="rounded-lg border border-zinc-700 px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:border-red-700 hover:text-red-300"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function OwnedCard({ stat, info, alerts, onSetAlert, onDeleteAlert, onSell, friends, onOpen }) {
  const { item, data, a, price, risk, gain: gainUsd, gainPct } = stat;
  const quote = data?.quote;
  const candles = data?.candles;
  const ex = explainStock(a, { owned: true, risk });
  const pos = positionSentence(item, price);
  const profit = gainUsd != null && gainUsd >= 0;

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-zinc-900 p-4 shadow-md ${
        risk?.breachedStop ? "border-red-700/70" : risk?.hitTarget ? "border-emerald-700/70" : "border-zinc-800"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <button onClick={() => onOpen(item.symbol)} className="min-w-0 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold tracking-wide text-zinc-100 hover:text-blue-300">{item.symbol}</h2>
            <span className="rounded-full bg-blue-900/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-blue-300">Owned</span>
            {risk?.breachedStop && (
              <span className="rounded-full border border-red-500 bg-red-800/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-100">
                ⚠ Below your safety line
              </span>
            )}
            {risk && !risk.breachedStop && risk.hitTarget && (
              <span className="rounded-full border border-emerald-500 bg-emerald-800/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                ✓ Target reached
              </span>
            )}
          </div>
          <CompanyMeta info={info} />
        </button>
        <EarningsFlag info={info} />
      </div>
      {ex?.summary && <p className="mb-2 text-sm text-zinc-300">{ex.summary}</p>}
      <PriceLine quote={quote} />

      {/* the position in plain words */}
      <div className="mt-3 rounded-xl bg-zinc-800/50 px-3 py-2.5 text-sm text-zinc-300">
        <div>{pos.bought}</div>
        {pos.now && (
          <div className="mt-0.5">
            {pos.now},{" "}
            <span className={`font-semibold ${profit ? "text-emerald-400" : "text-red-400"}`}>
              {profit ? "+" : "−"}${fmt(Math.abs(gainUsd))} ({gainPct >= 0 ? "+" : ""}
              {fmt(gainPct)}%)
            </span>
            .
          </div>
        )}
        {risk && (
          <div className="mt-1 text-xs text-zinc-400">
            Safety line (stop-loss)<Info term="stop" />: <span className="font-semibold text-red-300">${fmt(risk.stop)}</span>
            {risk.distToStopPct > 0 && <> — {risk.distToStopPct.toFixed(1)}% below today</>}
            {" · "}Target<Info term="target" />: <span className="font-semibold text-emerald-300">${fmt(risk.target)}</span>
            {risk.trailing && (
              <>
                {" · "}Consider raising your safety line to <span className="font-semibold text-amber-300">${fmt(risk.trailing)}</span> to lock in gains.
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-3">
        {data?.candleError ? (
          <div className="rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400">
            {ERROR_TEXT[data.candleError] || ERROR_TEXT.other}
          </div>
        ) : candles ? (
          <MiniChart candles={candles} symbol={item.symbol} />
        ) : (
          <div className="h-28 w-full animate-pulse rounded bg-zinc-800" />
        )}
      </div>

      <FriendsStack owners={friends?.owners || []} watchers={friends?.watchers || []} onOpen={() => onOpen(item.symbol)} />
      <VerdictBar ex={ex} />
      <WhyPanel ex={ex} compact />

      <AlertChips symbol={item.symbol} alerts={alerts} price={price} onAdd={onSetAlert} onDelete={onDeleteAlert} />

      <Collapsible id={`more-owned-${item.symbol}`} title="More details">
        <div className="grid grid-cols-3 gap-1.5">
          <Level label="Buy price" value={`$${fmt(item.buyPrice)}`} />
          <Level label="Shares" value={`${item.qty}`} />
          <Level label="Cost" value={`$${fmt(item.buyPrice * item.qty)}`} />
        </div>
        {risk && (
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Safety line = the higher of 8% below your buy price (${fmt(risk.stopByPct)})
            {risk.stopBySupport != null ? ` or 2% below the 50-day average ($${fmt(risk.stopBySupport)})` : ""}. Target = 16% above your buy price,
            twice the 8% you risked.
          </p>
        )}
        {a && (
          <div className="mt-3">
            <LevelsExplained a={a} />
          </div>
        )}
        <FiftyTwoWeek info={info} price={price} />
        <AnalystRatings info={info} />
        <AnalystSentence info={info} />
        <NewsSection info={info} />
        <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
          Safety lines and targets are mechanical calculations for education only — not financial advice.
        </p>
      </Collapsible>

      <div className="mt-4 flex gap-2 border-t border-zinc-800 pt-3">
        <button
          onClick={() => onSell(item.symbol)}
          className="flex-1 rounded-lg bg-red-800/80 px-3 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-700"
        >
          Sell position
        </button>
        <button
          onClick={() => onOpen(item.symbol)}
          className="rounded-lg border border-zinc-700 px-3 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-blue-600 hover:text-blue-300"
        >
          Details
        </button>
      </div>
    </div>
  );
}

// Full-screen stock page: big chart, the reasoning, what-if, friends, polls, news
function StockDetail({ symbol, item, data, info, alerts, friends, uid, inList, onClose, onAdd, onBuy, onSetAlert, onDeleteAlert, onOpenProfile, onPractice, onShare }) {
  const quote = data?.quote;
  const candles = data?.candles;
  const a = candles ? analyze(candles, quote, item || { symbol, status: "watching" }) : null;
  const owned = item?.status === "owned";
  const risk = owned && a && quote ? ownedRisk(item, a, quote.c) : null;
  const ex = explainStock(a, { owned, risk });
  const [amount, setAmount] = useState("1000");
  const amt = parseFloat(amount) || 0;
  const price = quote?.c ?? (candles?.length ? candles[candles.length - 1].close : null);
  // what-if is about a NEW purchase today, so it uses today's levels (not your old position's)
  const target = a?.target;
  const stop = a?.stop;
  const shares = price ? amt / price : 0;
  const m = info?.metric;
  const pe = m?.peTTM ?? m?.peBasicExclExtraTTM;
  const cap = info?.profile?.marketCapitalization;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/95 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-4">
        <div className="sticky top-0 z-10 -mx-4 mb-3 flex items-center justify-between gap-2 bg-zinc-950/95 px-4 py-2">
          <button onClick={onClose} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900">
            ← Back
          </button>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => onShare(symbol)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900">
              ↗ Share
            </button>
            <button
              onClick={() => onPractice(symbol, quote?.c)}
              disabled={!quote}
              className="rounded-lg border border-violet-700 bg-violet-900/30 px-3 py-1.5 text-sm font-medium text-violet-200 hover:bg-violet-900/50 disabled:opacity-40"
            >
              🎮 Practice buy
            </button>
            {!inList ? (
              <button onClick={() => onAdd(symbol)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500">
                + Watchlist
              </button>
            ) : (
              <span className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-400">✓ {owned ? "You own this" : "On your watchlist"}</span>
            )}
            {!owned && (
              <button
                onClick={() => onBuy(symbol, quote?.c)}
                disabled={!quote}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                Buy
              </button>
            )}
          </div>
        </div>

        <div className="mb-1 flex items-center gap-3">
          {info?.profile?.logo && <img src={info.profile.logo} alt="" className="h-10 w-10 rounded-lg bg-white object-contain p-1" />}
          <div>
            <h1 className="text-2xl font-bold text-zinc-50">{symbol}</h1>
            <div className="text-sm text-zinc-400">
              {info?.profile?.name || ""}
              {info?.profile?.finnhubIndustry ? ` · ${info.profile.finnhubIndustry}` : ""}
            </div>
          </div>
          <div className="ml-auto">
            <EarningsFlag info={info} />
          </div>
        </div>
        {ex?.summary && <p className="mb-2 text-base text-zinc-300">{ex.summary}</p>}
        {data?.quoteError ? (
          <div className="mb-3 rounded-md border border-amber-800/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
            {ERROR_TEXT[data.quoteError] || ERROR_TEXT.other}
          </div>
        ) : (
          <PriceLine quote={quote} big />
        )}

        <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
          {data?.candleError ? (
            <div className="px-3 py-6 text-center text-sm text-zinc-500">{ERROR_TEXT[data.candleError] || ERROR_TEXT.other}</div>
          ) : candles ? (
            <MiniChart candles={candles} symbol={`d-${symbol}`} tall />
          ) : (
            <div className="h-64 w-full animate-pulse rounded bg-zinc-800" />
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-5">
          <div className="md:col-span-3">
            <VerdictBar ex={ex} />
            <WhyPanel ex={ex} />
            {a && (
              <div className="mt-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Key price levels</div>
                <LevelsExplained a={a} />
              </div>
            )}
            <BacktestBlurb candles={candles} />
            {candles && <BacktestSection candles={candles} />}
            <NewsSection info={info} />
          </div>

          <div className="space-y-4 md:col-span-2">
            {/* what-if */}
            {price != null && target != null && stop != null && (
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">What if I invest…</div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">$</span>
                  <input
                    type="number"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                  />
                </div>
                {amt > 0 && (
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="text-zinc-400">
                      That buys about <span className="font-semibold text-zinc-200">{shares.toFixed(shares < 10 ? 2 : 0)} shares</span> at ${fmt(price)}.
                    </div>
                    <div className="text-zinc-300">
                      🎯 If it reaches the target (${fmt(target)}):{" "}
                      <span className="font-semibold text-emerald-400">+${fmt(shares * (target - price))}</span>
                    </div>
                    <div className="text-zinc-300">
                      🛑 If it falls to the safety line (${fmt(stop)}):{" "}
                      <span className="font-semibold text-red-400">−${fmt(Math.abs(shares * (price - stop)))}</span>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* key stats */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Key stats</div>
              <div className="grid grid-cols-2 gap-1.5">
                {cap != null && <Level label="Market cap" value={cap >= 1e6 ? `$${(cap / 1e6).toFixed(2)}T` : cap >= 1e3 ? `$${(cap / 1e3).toFixed(1)}B` : `$${cap.toFixed(0)}M`} />}
                {pe != null && <Level label="P/E" value={pe.toFixed(1)} />}
                {m?.["52WeekHigh"] != null && <Level label="52-wk high" value={`$${fmt(m["52WeekHigh"])}`} />}
                {m?.["52WeekLow"] != null && <Level label="52-wk low" value={`$${fmt(m["52WeekLow"])}`} />}
                {a && <Level label="RSI" value={a.rsi14.toFixed(0)} />}
                {a && <Level label="Daily move" value={`±${a.dayVol.toFixed(1)}%`} />}
              </div>
              <AnalystRatings info={info} />
              <AnalystSentence info={info} />
            </section>

            {/* friends */}
            {(friends?.owners?.length > 0 || friends?.watchers?.length > 0) && (
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Friends with {symbol}</div>
                <ul className="space-y-1.5">
                  {[...(friends.owners || []).map((u) => [u, "owns"]), ...(friends.watchers || []).map((u) => [u, "watching"])].map(([u, k]) => (
                    <li key={`${u.id}-${k}`}>
                      <button onClick={() => onOpenProfile(u.id)} className="flex w-full items-center gap-2 text-left text-sm text-zinc-300 hover:text-zinc-100">
                        <Avatar url={u.avatar_url} name={u.full_name} size="xs" />
                        {u.full_name}
                        <span className={`ml-auto text-xs ${k === "owns" ? "text-blue-300" : "text-zinc-500"}`}>{k}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {owned && (
              <AlertChips symbol={symbol} alerts={alerts} price={price} onAdd={onSetAlert} onDelete={onDeleteAlert} />
            )}
          </div>
        </div>

        {/* friends' polls and notes about this stock */}
        <section className="mt-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">What your friends think about {symbol}</div>
          <Feed uid={uid} symbol={symbol} limit={10} onOpenStock={() => {}} onOpenProfile={onOpenProfile}
            emptyText={`No posts about ${symbol} yet. Ask your friends what they think with a poll above.`} />
        </section>
        <p className="mt-6 text-center text-[11px] text-zinc-600">Educational tool only, not financial advice.</p>
      </div>
    </div>
  );
}

// Header search: type a company name or ticker
function StockSearch({ apiKey, onOpen }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1 || !apiKey) {
      setResults([]);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(term)}&exchange=US&token=${encodeURIComponent(apiKey)}`);
        const j = await res.json();
        const list = (j.result || [])
          .filter((r) => /Common Stock|ETP|ADR/i.test(r.type || "") && /^[A-Z.\-]{1,6}$/.test(r.symbol))
          .slice(0, 8);
        setResults(list);
      } catch (_) {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, apiKey]);
  function pick(sym) {
    setQ("");
    setOpen(false);
    onOpen(sym);
  }
  return (
    <div ref={ref} className="relative w-full sm:w-72">
      <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-zinc-500">🔍</span>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (results[0]) pick(results[0].symbol);
            else if (/^[A-Za-z.\-]{1,6}$/.test(q.trim())) pick(q.trim().toUpperCase());
          }
        }}
        placeholder={apiKey ? "Search stocks (e.g. apple, NVDA)" : "Add a data key to search"}
        disabled={!apiKey}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none focus:border-blue-500 disabled:opacity-50"
      />
      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          {busy && !results.length ? (
            <div className="px-4 py-3 text-sm text-zinc-500">Searching…</div>
          ) : results.length ? (
            results.map((r) => (
              <button key={r.symbol} onClick={() => pick(r.symbol)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-800">
                <span className="w-16 font-semibold text-zinc-100">{r.symbol}</span>
                <span className="truncate text-sm text-zinc-400">{r.description}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-zinc-500">No US stocks found for “{q.trim()}”.</div>
          )}
        </div>
      )}
    </div>
  );
}

function SellModal({ open, symbol, price, onConfirm, onClose }) {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open, symbol]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Sell {symbol}?</h2>
        <p className="mb-3 text-sm text-zinc-400">
          This closes the full position{price != null ? ` at about $${fmt(price)}` : ""}, records the profit or loss in your trade history, and removes it
          from Owned.
        </p>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">Why are you selling? (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="e.g. Hit my target, taking profit"
          className="mb-1 w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <div className="mb-4 text-[11px] text-zinc-500">Shared with your connections in their feed (if your activity sharing is on).</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancel
          </button>
          <button onClick={() => onConfirm(note)} className="rounded-md bg-red-800 px-4 py-1.5 text-sm font-semibold text-red-100 hover:bg-red-700">
            Sell position
          </button>
        </div>
      </div>
    </div>
  );
}

// avatar menu in the header
function HeaderMenu({ email, profile, theme, onTheme, onSettings, onProfile, onWelcome, onLearn, onLogout, saveStatus }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const item = "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative block rounded-full" title="Menu">
        <Avatar url={profile?.avatar_url} name={profile?.full_name || email} size="sm" />
        <span
          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-zinc-950 ${
            saveStatus === "error" ? "bg-red-500" : saveStatus === "saving" ? "bg-zinc-500" : "bg-emerald-500"
          }`}
          title={saveStatus === "error" ? "Not saved — check connection" : saveStatus === "saving" ? "Saving…" : "Saved to your account"}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          <div className="border-b border-zinc-800 px-4 py-3">
            <div className="truncate text-sm font-semibold text-zinc-100">{profile?.full_name || "Your account"}</div>
            <div className="truncate text-xs text-zinc-500">{email}</div>
            <div className={`mt-1 text-[11px] ${saveStatus === "error" ? "text-red-400" : "text-emerald-500/80"}`}>
              {saveStatus === "error" ? "⚠ Not saved — check connection" : saveStatus === "saving" ? "Saving…" : "✓ Saved to your account"}
            </div>
          </div>
          <button className={item} onClick={() => (setOpen(false), onProfile())}>
            👤 My profile
          </button>
          <button className={item} onClick={() => onTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? "🌙 Dark mode" : "☀️ Light mode"}
          </button>
          <button className={item} onClick={() => (setOpen(false), onSettings())}>
            ⚙️ Settings (data key)
          </button>
          <button className={item} onClick={() => (setOpen(false), onLearn())}>
            📖 Learn & glossary
          </button>
          <button className={item} onClick={() => (setOpen(false), onWelcome())}>
            💡 Show welcome tips
          </button>
          <button className={`${item} border-t border-zinc-800 text-red-300`} onClick={() => (setOpen(false), onLogout())}>
            ↩ Log out
          </button>
        </div>
      )}
    </div>
  );
}

const NAV = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "watchlist", label: "My Stocks", icon: "📈", also: ["owned"] },
  { id: "recommendations", label: "Discover", icon: "⭐" },
  { id: "social", label: "Social", icon: "👥" },
];

function BottomNav({ page, onGo, badges }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <div className="grid grid-cols-4">
        {NAV.map((t) => (
          <button
            key={t.id}
            onClick={() => onGo(t.id)}
            className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${page === t.id || t.also?.includes(page) ? "text-blue-400" : "text-zinc-500"}`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
            {badges[t.id] > 0 && (
              <span className="absolute right-[calc(50%-1.4rem)] top-1.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{badges[t.id]}</span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}

function SettingsModal({ open, apiKey, onSave, onClose }) {
  const [draft, setDraft] = useState(apiKey || "");
  useEffect(() => {
    setDraft(apiKey || "");
  }, [apiKey, open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Settings</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Your Finnhub API key is stored privately in this app's persistent storage — never shared.
        </p>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">
          Finnhub API key <span className="text-zinc-600">(quotes &amp; candles — finnhub.io)</span>
        </label>
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. c0abc123..."
          className="mb-4 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancel
          </button>
          <button
            onClick={() => onSave(draft.trim())}
            disabled={!draft.trim()}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- modals ----------

function BuyModal({ open, symbol, price, onConfirm, onClose }) {
  const [p, setP] = useState("");
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setP(price != null ? String(price) : "");
      setQ("");
      setNote("");
    }
  }, [open, price, symbol]);
  if (!open) return null;
  const pv = parseFloat(p);
  const qv = parseFloat(q);
  const valid = pv > 0 && qv > 0;
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Buy {symbol}</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Record this position. The buy price is pre-filled with the current price — edit it if you actually bought at a
          different price.
        </p>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">Buy price</label>
        <input
          type="number"
          step="any"
          min="0"
          value={p}
          onChange={(e) => setP(e.target.value)}
          className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
        />
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">Quantity (shares)</label>
        <input
          type="number"
          step="any"
          min="0"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="10"
          autoFocus
          className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
        />
        {valid && (
          <div className="mb-3 text-xs text-zinc-500">
            Cost basis: <span className="font-semibold text-zinc-300">${fmt(pv * qv)}</span>
          </div>
        )}
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">Why are you buying? (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="e.g. Earnings beat, holding long-term"
          className="mb-1 w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
        />
        <div className="mb-4 text-[11px] text-zinc-500">Shared with your connections in their feed (if your activity sharing is on).</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(pv, qv, note)}
            disabled={!valid}
            className="rounded-md bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            Confirm Buy
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- price alerts (in-app) ----------

function AlertModal({ open, symbol, price, onSave, onClose }) {
  const [dir, setDir] = useState("above");
  const [p, setP] = useState("");
  useEffect(() => {
    if (open) {
      setDir("above");
      setP(""); // left blank on purpose — prefilling the current price would fire instantly
    }
  }, [open, price, symbol]);
  if (!open) return null;
  const pv = parseFloat(p);
  const valid = pv > 0;
  // warn (not block) when the alert is already true at the current price
  const alreadyTrue = valid && price != null && (dir === "above" ? price >= pv : price <= pv);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Price alert · {symbol}</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Get flagged in the app when {symbol} crosses your price.
          {price != null && (
            <>
              {" "}
              Current: <span className="tabular-nums text-zinc-200">${fmt(price)}</span>
            </>
          )}
        </p>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">Alert me when price goes</label>
        <div className="mb-3 flex gap-2">
          {["above", "below"].map((d) => (
            <button
              key={d}
              onClick={() => setDir(d)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                dir === d
                  ? "border-blue-500 bg-blue-600/20 text-blue-200"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {d === "above" ? "▲ Above" : "▼ Below"}
            </button>
          ))}
        </div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">Price</label>
        <input
          type="number"
          step="any"
          min="0"
          value={p}
          onChange={(e) => setP(e.target.value)}
          placeholder={price != null ? (dir === "above" ? fmt(price * 1.05) : fmt(price * 0.95)) : "e.g. 150"}
          autoFocus
          className="mb-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <p className="mb-4 min-h-[1rem] text-[11px] text-amber-400/80">
          {alreadyTrue ? `Price is already ${dir} that level — this alert will fire right away.` : ""}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancel
          </button>
          <button
            onClick={() => onSave(dir, pv)}
            disabled={!valid}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            Set alert
          </button>
        </div>
      </div>
    </div>
  );
}

// per-card alert row: active alerts (removable) + any that have fired, plus "set alert"
function AlertChips({ symbol, alerts, onAdd, onDelete, price }) {
  const mine = alerts.filter((al) => al.symbol === symbol);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {mine.map((al) =>
        al.triggeredAt ? (
          <span
            key={al.id}
            className="inline-flex items-center gap-1 rounded-full border border-amber-600/60 bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-200"
          >
            🔔 Hit: crossed {al.dir} ${fmt(al.price)}
            <button onClick={() => onDelete(al.id)} className="ml-0.5 text-amber-300/70 hover:text-amber-100" title="Dismiss">
              ×
            </button>
          </span>
        ) : (
          <span
            key={al.id}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300"
          >
            🔔 {al.dir === "above" ? "▲" : "▼"} ${fmt(al.price)}
            <button onClick={() => onDelete(al.id)} className="ml-0.5 text-zinc-500 hover:text-red-300" title="Remove alert">
              ×
            </button>
          </span>
        )
      )}
      <button
        onClick={() => onAdd(symbol, price)}
        disabled={price == null}
        className="rounded-full border border-dashed border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-500 transition hover:border-blue-600 hover:text-blue-300 disabled:opacity-40"
      >
        + Price alert
      </button>
    </div>
  );
}

// top-of-page banner listing alerts that have fired, until dismissed
function TriggeredAlertsBanner({ alerts, onDismiss }) {
  const hit = alerts.filter((al) => al.triggeredAt);
  if (!hit.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-700/60 bg-amber-950/40 p-3">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-amber-300">
        🔔 Price alert{hit.length > 1 ? "s" : ""} triggered
      </div>
      <ul className="space-y-1">
        {hit.map((al) => (
          <li key={al.id} className="flex items-center justify-between gap-2 text-sm text-amber-100">
            <span>
              <span className="font-semibold">{al.symbol}</span> crossed {al.dir}{" "}
              <span className="tabular-nums">${fmt(al.price)}</span>
              <span className="ml-2 text-xs text-amber-300/70">
                {new Date(al.triggeredAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </span>
            <button
              onClick={() => onDismiss(al.id)}
              className="rounded px-2 py-0.5 text-xs text-amber-300/80 hover:bg-amber-900/50 hover:text-amber-100"
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">{title}</h2>
        <p className="mb-4 text-sm text-zinc-400">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-red-800 px-4 py-1.5 text-sm font-semibold text-red-100 hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Slim portfolio stat bar for the top of the Owned page. `stats` is the shared
// per-position array computed once in App (value/gain + breach flags), so the
// "needs attention" count matches the badges on the cards below exactly.
function PortfolioSummaryBar({ stats }) {
  const priced = stats.filter((s) => s.value != null);
  const totalValue = priced.reduce((sum, s) => sum + s.value, 0);
  const totalCost = priced.reduce((sum, s) => sum + s.cost, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const needAttention = stats.filter((s) => s.risk && (s.risk.breachedStop || s.risk.hitTarget)).length;
  const up = totalGain >= 0;

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:grid-cols-4">
      <div className="rounded-md bg-zinc-800/50 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Portfolio value</div>
        <div className="text-base font-semibold tabular-nums text-zinc-100">${fmt(totalValue)}</div>
      </div>
      <div className="rounded-md bg-zinc-800/50 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Unrealized P/L</div>
        <div className={`text-base font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
          {up ? "+" : "−"}${fmt(Math.abs(totalGain))}
        </div>
      </div>
      <div className="rounded-md bg-zinc-800/50 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Return</div>
        <div className={`text-base font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
          {totalGainPct >= 0 ? "+" : ""}
          {fmt(totalGainPct)}%
        </div>
      </div>
      <div className="rounded-md bg-zinc-800/50 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Needs attention</div>
        <div className={`text-base font-semibold tabular-nums ${needAttention > 0 ? "text-amber-400" : "text-zinc-300"}`}>
          {needAttention}
          {needAttention > 0 && <span className="ml-1 text-[10px] font-normal text-zinc-500">at stop / target</span>}
        </div>
      </div>
    </div>
  );
}

// ---------- portfolio analytics (Owned page) ----------

// categorical hues in fixed order (dark-surface steps of the reference palette)
const SECTOR_COLORS = ["#3987e5", "#199e70", "#c98500", "#9085e9", "#e66767", "#d55181", "#d95926", "#008300"];
const CONCENTRATION_LIMIT = 40; // % of portfolio in one stock or sector before we flag it

// Sector breakdown by current market value. Sectors come from Finnhub's company
// profile; a holding whose profile hasn't loaded yet is shown as "Loading…"
// rather than guessed.
function SectorAllocation({ stats, info, who = "your" }) {
  const priced = stats.filter((s) => s.value != null && s.value > 0);
  const total = priced.reduce((sum, s) => sum + s.value, 0);
  if (!total) return null;

  const bySector = {};
  for (const s of priced) {
    const sector = info[s.item.symbol]?.profile?.finnhubIndustry || "Loading…";
    if (!bySector[sector]) bySector[sector] = { sector, value: 0, symbols: [] };
    bySector[sector].value += s.value;
    bySector[sector].symbols.push(s.item.symbol);
  }
  const rows = Object.values(bySector)
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({
      ...r,
      pct: (r.value / total) * 100,
      color: r.sector === "Loading…" ? "#52525b" : SECTOR_COLORS[i % SECTOR_COLORS.length],
    }));

  const topPos = [...priced].sort((a, b) => b.value - a.value)[0];
  const topPosPct = (topPos.value / total) * 100;
  const topSector = rows.find((r) => r.sector !== "Loading…");
  const warnings = [];
  if (topPosPct > CONCENTRATION_LIMIT)
    warnings.push(`${topPosPct.toFixed(0)}% of ${who} portfolio is in one stock (${topPos.item.symbol}).`);
  if (topSector && topSector.pct > CONCENTRATION_LIMIT && rows.filter((r) => r.sector !== "Loading…").length >= 1)
    warnings.push(`${topSector.pct.toFixed(0)}% is in one sector (${topSector.sector}).`);

  return (
    <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Sector allocation</div>
      <div className="flex h-3 gap-px overflow-hidden rounded-full bg-zinc-800">
        {rows.map((r) => (
          <div key={r.sector} style={{ width: `${r.pct}%`, background: r.color }} title={`${r.sector} ${r.pct.toFixed(1)}%`} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.sector} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
              <span className="truncate text-zinc-300">{r.sector}</span>
              <span className="truncate text-zinc-600">{r.symbols.join(", ")}</span>
            </span>
            <span className="tabular-nums text-zinc-200">{r.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      {warnings.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
          ⚠ Concentration: {warnings.join(" ")} Spreading across more stocks/sectors lowers single-name risk.
        </div>
      )}
    </div>
  );
}

// best / worst performer (since purchase) and biggest move today
function PortfolioHighlights({ stats }) {
  const withGain = stats.filter((s) => s.gainPct != null);
  const withDay = stats.filter((s) => s.data?.quote?.dp != null);
  if (!withGain.length && !withDay.length) return null;
  const best = withGain.length ? [...withGain].sort((a, b) => b.gainPct - a.gainPct)[0] : null;
  const worst = withGain.length > 1 ? [...withGain].sort((a, b) => a.gainPct - b.gainPct)[0] : null;
  const mover = withDay.length
    ? [...withDay].sort((a, b) => Math.abs(b.data.quote.dp) - Math.abs(a.data.quote.dp))[0]
    : null;
  const pctStr = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  const tone = (n) => (n >= 0 ? "text-emerald-400" : "text-red-400");
  return (
    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {best && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">{worst ? "Best performer" : "Performance"}</div>
          <div className="text-sm font-semibold text-zinc-100">
            {best.item.symbol} <span className={`tabular-nums ${tone(best.gainPct)}`}>{pctStr(best.gainPct)}</span>
          </div>
        </div>
      )}
      {worst && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Worst performer</div>
          <div className="text-sm font-semibold text-zinc-100">
            {worst.item.symbol} <span className={`tabular-nums ${tone(worst.gainPct)}`}>{pctStr(worst.gainPct)}</span>
          </div>
        </div>
      )}
      {mover && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Biggest move today</div>
          <div className="text-sm font-semibold text-zinc-100">
            {mover.item.symbol}{" "}
            <span className={`tabular-nums ${tone(mover.data.quote.dp)}`}>{pctStr(mover.data.quote.dp)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// realized P&L from closed trades + collapsible history (recorded when you Sell)
function RealizedPnL({ transactions, onClear }) {
  const [open, setOpen] = useState(false);
  if (!transactions.length) return null;
  const total = transactions.reduce((sum, t) => sum + t.realizedUsd, 0);
  const cost = transactions.reduce((sum, t) => sum + t.buyPrice * t.qty, 0);
  const pct = cost > 0 ? (total / cost) * 100 : 0;
  const up = total >= 0;
  const fmtDate = (iso) =>
    iso ? new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const sorted = [...transactions].sort((a, b) => (a.sellDate < b.sellDate ? 1 : -1));
  return (
    <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Realized P/L (closed trades)</div>
          <div className={`text-lg font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
            {up ? "+" : "−"}${fmt(Math.abs(total))}{" "}
            <span className="text-sm">
              ({pct >= 0 ? "+" : ""}
              {fmt(pct)}%)
            </span>
          </div>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
        >
          {open ? "Hide" : "Show"} history ({transactions.length})
        </button>
      </div>
      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="py-1 pr-2 font-medium">Stock</th>
                <th className="py-1 pr-2 font-medium">Qty</th>
                <th className="py-1 pr-2 font-medium">Bought</th>
                <th className="py-1 pr-2 font-medium">Sold</th>
                <th className="py-1 text-right font-medium">Realized</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {sorted.map((t) => (
                <tr key={t.id} className="border-t border-zinc-800 text-zinc-300">
                  <td className="py-1.5 pr-2 font-semibold text-zinc-100">{t.symbol}</td>
                  <td className="py-1.5 pr-2">{t.qty}</td>
                  <td className="py-1.5 pr-2">
                    ${fmt(t.buyPrice)} <span className="text-zinc-600">· {fmtDate(t.buyDate)}</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    ${fmt(t.sellPrice)} <span className="text-zinc-600">· {fmtDate(t.sellDate)}</span>
                  </td>
                  <td className={`py-1.5 text-right ${t.realizedUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {t.realizedUsd >= 0 ? "+" : "−"}${fmt(Math.abs(t.realizedUsd))} ({t.realizedPct >= 0 ? "+" : ""}
                    {fmt(t.realizedPct)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {onClear && (
            <button onClick={onClear} className="mt-2 text-[10px] text-zinc-600 hover:text-red-300">
              Clear history
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function scoreBadgeStyle(score) {
  if (score >= 70) return "bg-emerald-900/50 text-emerald-300 border border-emerald-700/60";
  if (score >= 50) return "bg-blue-900/40 text-blue-300 border border-blue-700/60";
  return "bg-zinc-800 text-zinc-300 border border-zinc-600/60";
}

// Most-owned / most-watched among your connections
function FriendsPicks({ friendsBySymbol, watchlist, onAdd, onOpen }) {
  const inList = new Set(watchlist.map((w) => w.symbol));
  const rows = Object.entries(friendsBySymbol)
    .map(([symbol, f]) => ({ symbol, owners: f.owners.length, watchers: f.watchers.length, people: [...f.owners, ...f.watchers] }))
    .sort((a, b) => b.owners * 2 + b.watchers - (a.owners * 2 + a.watchers))
    .slice(0, 8);
  return (
    <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="mb-1 text-base font-semibold text-zinc-100">👥 Popular with your friends</h2>
      <p className="mb-3 text-[11px] text-zinc-500">What your connections own and watch the most (based on what they share).</p>
      {rows.length === 0 ? (
        <div className="rounded-md bg-zinc-800/40 px-3 py-3 text-sm text-zinc-500">Connect with friends on the Social tab to see what they're into.</div>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {rows.map((r) => (
            <li key={r.symbol} className="flex items-center gap-3 py-2">
              <button onClick={() => onOpen(r.symbol)} className="w-16 text-left font-semibold text-zinc-100 hover:text-blue-300">
                {r.symbol}
              </button>
              <span className="flex -space-x-2">
                {r.people.slice(0, 4).map((u, i) => (
                  <Avatar key={u.id + i} url={u.avatar_url} name={u.full_name} size="xs" />
                ))}
              </span>
              <span className="flex-1 text-xs text-zinc-400">
                {r.owners > 0 && `${r.owners} own`}
                {r.owners > 0 && r.watchers > 0 && " · "}
                {r.watchers > 0 && `${r.watchers} watching`}
              </span>
              <button
                onClick={() => onAdd(r.symbol)}
                disabled={inList.has(r.symbol)}
                className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-blue-600 hover:text-blue-300 disabled:opacity-40"
              >
                {inList.has(r.symbol) ? "✓ Yours" : "+ Watch"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TopPicksSection({ cache, progress, watchlist, onAdd, onOpen }) {
  // exclude Owned tickers from the recommendations; Watching may still appear
  const owned = new Set(watchlist.filter((w) => w.status === "owned").map((w) => w.symbol));
  const inList = new Set(watchlist.map((w) => w.symbol));
  const picks = cache ? cache.ranked.filter((p) => !owned.has(p.symbol)).slice(0, 5) : [];

  return (
    <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-100">Today's Top 5 Picks</h2>
        {cache && (
          <span className="text-xs text-zinc-500">
            Scanned {PICK_POOL.length} stocks · {timeAgo(cache.ts)} · refreshes every 24h
          </span>
        )}
      </div>
      <p className="mb-3 text-[11px] text-zinc-600">
        Algorithmic screen based on public data (50% technicals, 50% fundamentals)<Info term="score" /> — not financial advice.
      </p>

      {progress ? (
        <div className="rounded-lg bg-zinc-800/50 px-4 py-5 text-center">
          <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
          <div className="text-sm text-zinc-300">
            Scanning {PICK_POOL.length} stocks… {progress.done}/{progress.total}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Sequential requests to respect rate limits — takes a couple of minutes. Results are cached for 24h.
          </div>
          <div className="mx-auto mt-3 h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-zinc-700">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : picks.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {picks.map((p, idx) => {
            return (
              <div key={p.symbol} className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-zinc-600">#{idx + 1}</span>
                    <span className="text-lg font-semibold tracking-wide text-zinc-100">{p.symbol}</span>
                    <span className="text-sm font-medium tabular-nums text-zinc-400">${fmt(p.price)}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${scoreBadgeStyle(p.score)}`}>
                      {p.score}
                    </span>
                    <span className="mt-0.5 text-[9px] uppercase tracking-wider text-zinc-600">score / 100</span>
                  </div>
                </div>
                {pickReason(p) && <p className="mb-2 text-sm text-zinc-200">{pickReason(p)}</p>}
                <div className="mb-3 flex flex-1 flex-wrap content-start gap-1.5">
                  {p.reasons.map((r, i) => (
                    <span key={i} className="rounded-full bg-zinc-800/70 px-2 py-0.5 text-[10px] text-zinc-400">
                      {r}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onAdd(p.symbol)}
                    disabled={inList.has(p.symbol)}
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-2 text-xs font-medium text-zinc-200 transition hover:border-blue-600 hover:text-blue-300 disabled:cursor-default disabled:opacity-40"
                  >
                    {inList.has(p.symbol) ? "On watchlist ✓" : "+ Add to Watchlist"}
                  </button>
                  <button onClick={() => onOpen(p.symbol)} className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-blue-600 hover:text-blue-300">
                    Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : cache ? (
        <div className="rounded-md bg-zinc-800/50 px-3 py-2 text-xs text-zinc-500">
          The last scan didn't produce usable picks (data source may have been unavailable). It will retry
          automatically after the 24h cache expires.
        </div>
      ) : null}
    </section>
  );
}

// ---------- app ----------

// ---------- login / sign-up ----------

function AuthScreen() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const switchMode = (m) => {
    setMode(m);
    setError(null);
    setNotice(null);
    setConfirmPw("");
  };

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const em = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (mode === "signup" && password !== confirmPw) return setError("Passwords don't match.");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: em, password });
        if (err) {
          if (/confirm/i.test(err.message)) {
            setNeedsConfirm(true);
            setError("Your email isn't confirmed yet — click the link we emailed you, then log in.");
          } else if (/invalid login credentials/i.test(err.message)) {
            setError("Wrong email or password.");
          } else {
            setError(err.message);
          }
        }
        // on success, App's auth listener swaps this screen for the dashboard
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: em,
          password,
          options: { emailRedirectTo: window.location.origin + window.location.pathname },
        });
        if (err) {
          setError(err.message);
        } else if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          // Supabase answers this way (no error) when the email is already registered
          setError("An account with this email already exists — log in instead.");
          setMode("login");
        } else if (!data.session) {
          setNeedsConfirm(true);
          setNotice(
            `Account created! We emailed a confirmation link to ${em}. Click it (if the page it opens doesn't load, that's fine — your account is still confirmed), then come back here and log in.`
          );
          setMode("login");
          setPassword("");
          setConfirmPw("");
        }
      }
    } catch (err) {
      setError(err?.message || "Something went wrong — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    const em = email.trim();
    if (!em) return setError("Enter your email above first.");
    const { error: err } = await supabase.auth.resend({
      type: "signup",
      email: em,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (err) setError(err.message);
    else setNotice(`Confirmation email re-sent to ${em}.`);
  }

  const inputCls =
    "w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 font-sans text-zinc-200">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-zinc-50">Stock Signal Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">Your watchlist, positions and alerts — saved to your account.</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
          <div className="mb-5 flex gap-1 rounded-lg bg-zinc-800/60 p-1">
            {[
              ["login", "Log in"],
              ["signup", "Sign up"],
            ].map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                  mode === m ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputCls}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">Password</label>
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showPw ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : ""}
                className={inputCls}
              />
            </div>
            {mode === "signup" && (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Confirm password
                </label>
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
            {error && (
              <div className="rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</div>
            )}
            {notice && (
              <div className="rounded-md border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
                {notice}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-blue-600 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
            </button>
            {needsConfirm && mode === "login" && (
              <button
                type="button"
                onClick={resend}
                className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
              >
                Didn't get the email? Resend confirmation
              </button>
            )}
          </form>
        </div>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-600">
          Your data is stored in your account and protected so only you can read it.
          <br />
          Educational tool only, not financial advice.
        </p>
      </div>
    </div>
  );
}

// ---------- Social: a connection's portfolio (read-only) ----------

// Compact read-only card for one of a connection's stocks.
function FriendHoldingCard({ item, data, info, showDollars, showGain, inMyList, onAdd, onOpen }) {
  const quote = data?.quote;
  const candles = data?.candles;
  const a = candles ? analyze(candles, quote, item) : null;
  const owned = item.status === "owned";
  const price = quote?.c ?? (candles?.length ? candles[candles.length - 1].close : null);
  const dayUp = quote && quote.dp >= 0;
  const gainPct = owned && price != null && item.buyPrice > 0 ? ((price - item.buyPrice) / item.buyPrice) * 100 : null;
  const gainUsd = gainPct != null && item.qty > 0 ? (price - item.buyPrice) * item.qty : null;
  return (
    <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button onClick={() => onOpen?.(item.symbol)} className="text-base font-semibold tracking-wide text-zinc-100 hover:text-blue-300">
              {item.symbol}
            </button>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                owned ? "bg-blue-900/50 text-blue-300" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {owned ? "Owns" : "Watching"}
            </span>
          </div>
          <CompanyMeta info={info} />
        </div>
        {price != null ? (
          <div className="text-right">
            <div className="text-base font-semibold tabular-nums text-zinc-50">${fmt(price)}</div>
            {quote && (
              <div className={`text-xs tabular-nums ${dayUp ? "text-emerald-400" : "text-red-400"}`}>
                {dayUp ? "▲" : "▼"} {fmt(Math.abs(quote.dp))}% today
              </div>
            )}
          </div>
        ) : (
          <div className="h-8 w-20 animate-pulse rounded bg-zinc-800" />
        )}
      </div>
      {owned && (
        <div className="mb-2 grid grid-cols-3 gap-1.5">
          <Level label="Bought at" value={item.buyPrice ? `${fmt(item.buyPrice)}` : "—"} />
          {showDollars && item.qty != null ? (
            <>
              <Level label="Shares" value={`${item.qty}`} />
              <Level label="Value" value={price != null ? `${fmt(price * item.qty)}` : "—"} />
            </>
          ) : (
            <Level label="Since" value={item.purchaseDate || "—"} />
          )}
          {showGain && gainPct != null && (
            <div className="col-span-3">
              <Level
                label="Return"
                value={`${gainUsd != null ? `${gainUsd >= 0 ? "+" : "−"}${fmt(Math.abs(gainUsd))} ` : ""}(${gainPct >= 0 ? "+" : ""}${fmt(gainPct)}%)`}
                tone={gainPct >= 0 ? "text-emerald-300" : "text-red-300"}
              />
            </div>
          )}
        </div>
      )}
      {data?.candleError ? (
        <div className="rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400">
          {ERROR_TEXT[data.candleError] || ERROR_TEXT.other}
        </div>
      ) : candles ? (
        <MiniChart candles={candles} symbol={item.symbol} />
      ) : (
        <div className="h-28 w-full animate-pulse rounded bg-zinc-800" />
      )}
      {a && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${signalChipStyle(a.signal, a.signalStrong)}`}>
            {a.signalLabel}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${actionStyle(a.action)}`}>{a.action}</span>
        </div>
      )}
      <div className="mt-3 border-t border-zinc-800 pt-3">
        {inMyList ? (
          <span className="text-xs text-zinc-500">✓ On your list</span>
        ) : (
          <button onClick={() => onAdd(item.symbol)} className="text-xs font-medium text-blue-400 hover:underline">
            + Add to my watchlist
          </button>
        )}
      </div>
    </div>
  );
}

function FriendPortfolio({ uid, name, stockData, stockInfo, ensureSymbols, mySymbols, onAddToWatchlist, onAddMany, onOpenStock }) {
  const [pf, setPf] = useState(undefined); // undefined = loading, null = unavailable
  const [err, setErr] = useState(null);
  const first = (name || "").split(" ")[0] || "They";

  useEffect(() => {
    let alive = true;
    getSharedPortfolio(uid)
      .then((d) => alive && setPf(d))
      .catch((e) => alive && (setErr(e.message), setPf(null)));
    return () => {
      alive = false;
    };
  }, [uid]);

  const owned = pf?.owned || [];
  const watching = pf?.watchlist || [];
  const symbolsKey = [...owned, ...watching].map((i) => i.symbol).join(",");
  useEffect(() => {
    if (!symbolsKey) return;
    let alive = true;
    ensureSymbols(symbolsKey.split(","), () => alive);
    return () => {
      alive = false;
    };
  }, [symbolsKey, ensureSymbols]);

  if (pf === undefined) return <div className="py-6 text-center text-sm text-zinc-500">Loading portfolio…</div>;
  if (!pf)
    return <div className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">{err || "Portfolio unavailable."}</div>;

  const share = { holdings: true, dollars: true, unrealized: true, realized: true, watchlist: true, sectors: true, ...(pf.share || {}) };
  const showDollars = share.dollars !== false;
  const showGain = share.unrealized !== false;
  const mine = new Set(mySymbols);

  // same per-position stats the Owned page uses, so the summary widgets can be reused
  const stats = owned.map((item) => {
    const d = stockData[item.symbol];
    const price = d?.quote?.c ?? (d?.candles?.length ? d.candles[d.candles.length - 1].close : null);
    const qty = showDollars ? item.qty : null;
    const value = price != null && qty != null ? price * qty : null;
    const cost = qty != null ? item.buyPrice * qty : null;
    const gain = value != null ? value - cost : null;
    const gainPct = price != null && item.buyPrice > 0 ? ((price - item.buyPrice) / item.buyPrice) * 100 : null;
    return { item, data: d, a: null, price, risk: null, value, cost, gain, gainPct };
  });
  const both = [...owned, ...watching].map((i) => i.symbol).filter((s) => mine.has(s));

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-zinc-100">{first}'s portfolio</h3>
        <span className="text-[11px] text-zinc-600">Read-only · live prices</span>
      </div>

      {share.holdings === false && share.watchlist === false && share.realized === false ? (
        <div className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">{first} keeps their portfolio private.</div>
      ) : (
        <>
          {owned.length > 0 && showDollars && showGain && <PortfolioSummaryBar stats={stats} />}
          {owned.length > 0 && showGain && <PortfolioHighlights stats={stats} />}
          {owned.length > 0 && showDollars && share.sectors !== false && <SectorAllocation stats={stats} info={stockInfo} who="their" />}
          {pf.transactions && <RealizedPnL transactions={pf.transactions} />}

          {both.length > 0 && (
            <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">In common with you · </span>
              {both.join(", ")}
            </div>
          )}

          {pf.owned && (
            <>
              <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Owns ({owned.length})</h4>
              {owned.length ? (
                <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {owned.map((item) => (
                    <FriendHoldingCard
                      key={item.symbol}
                      item={item}
                      data={stockData[item.symbol]}
                      info={stockInfo[item.symbol]}
                      showDollars={showDollars}
                      showGain={showGain}
                      inMyList={mine.has(item.symbol)}
                      onAdd={onAddToWatchlist}
                      onOpen={onOpenStock}
                    />
                  ))}
                </div>
              ) : (
                <div className="mb-5 text-sm text-zinc-500">No stocks owned right now.</div>
              )}
            </>
          )}

          {pf.watchlist && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Watching ({watching.length})</h4>
                {onAddMany && [...owned, ...watching].some((i) => !mine.has(i.symbol)) && (
                  <button
                    onClick={() => onAddMany([...owned, ...watching].map((i) => i.symbol))}
                    className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-blue-600 hover:text-blue-300"
                  >
                    Copy all to my watchlist
                  </button>
                )}
              </div>
              {watching.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {watching.map((item) => (
                    <FriendHoldingCard
                      key={item.symbol}
                      item={item}
                      data={stockData[item.symbol]}
                      info={stockInfo[item.symbol]}
                      inMyList={mine.has(item.symbol)}
                      onAdd={onAddToWatchlist}
                      onOpen={onOpenStock}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-sm text-zinc-500">Nothing on their watchlist.</div>
              )}
            </>
          )}

          {pf.alerts?.length > 0 && (
            <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Price alerts</div>
              {pf.alerts.map((al) => (
                <span key={al.id} className="mr-3 inline-block text-xs">
                  {al.symbol} {al.dir === "above" ? "≥" : "≤"} ${fmt(al.price)}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <p className="mt-4 text-[10px] text-zinc-600">Shared by {first} for information only — not financial advice.</p>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking, null = logged out
  const [saveStatus, setSaveStatus] = useState("saved"); // "saved" | "saving" | "error"
  const [accountError, setAccountError] = useState(null);
  const [accountReload, setAccountReload] = useState(0); // bump to retry loading the account
  const userId = session?.user?.id || null;
  const userIdRef = useRef(null);
  userIdRef.current = userId;
  const accountRef = useRef({ watchlist: [], alerts: [], transactions: [] }); // latest account doc (sync)
  const accountLoaded = useRef(false); // never save until the account has been loaded
  const saveTimer = useRef(null);
  const [apiKey, setApiKey] = useState(null);
  const [ready, setReady] = useState(false); // account data loaded
  const [page, setPage] = useState("home"); // "watchlist" | "recommendations"
  const [watchlist, setWatchlist] = useState([]);
  const [stockData, setStockData] = useState({}); // symbol -> {quote, candles, quoteError, candleError}
  const [stockInfo, setStockInfo] = useState({}); // symbol -> {profile, metric, rec, earnings, news} (richer info)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [buyModal, setBuyModal] = useState(null); // { symbol, price } | null
  const [confirm, setConfirm] = useState(null); // { kind: "remove"|"sell", symbol } | null
  const [alerts, setAlerts] = useState([]); // in-app price alerts
  const [alertModal, setAlertModal] = useState(null); // { symbol, price } | null
  const [transactions, setTransactions] = useState([]); // closed trades (realized P/L)
  const [incomingCount, setIncomingCount] = useState(0); // pending connection requests (Social tab badge)
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("ssd_theme") || "dark";
    } catch (_) {
      return "dark";
    }
  });
  const [myProfile, setMyProfile] = useState(null); // your social profile (avatar in the header)
  const [friendsBySymbol, setFriendsBySymbol] = useState({}); // symbol -> { owners: [user], watchers: [user] }
  const [notifs, setNotifs] = useState([]);
  const [detail, setDetail] = useState(null); // symbol shown on the full stock page
  const [socialRoute, setSocialRoute] = useState(null); // { tab, profileId, groupId, n }
  const [toast, setToast] = useState(null);
  const [sellModal, setSellModal] = useState(null); // { symbol, price }
  const [showWelcome, setShowWelcome] = useState(false);
  const [paper, setPaper] = useState(null); // practice portfolio (pretend $10,000)
  const [practiceModal, setPracticeModal] = useState(null); // { side, symbol, price }
  const [shareSymbol, setShareSymbol] = useState(null);
  const [onboarding, setOnboarding] = useState({});
  const [connCount, setConnCount] = useState(0);
  const [joinedChallenge, setJoinedChallenge] = useState(false);
  const [didWhy, setDidWhy] = useState(() => {
    try {
      return localStorage.getItem("ssd_did_why") === "1";
    } catch (_) {
      return false;
    }
  });
  const [benchCandles, setBenchCandles] = useState(null); // SPY, for the performance chart

  // add-ticker form
  const [symInput, setSymInput] = useState("");
  const [statusInput, setStatusInput] = useState("watching");
  const [buyPriceInput, setBuyPriceInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState(null);

  // top-5 daily picks
  const [pickCache, setPickCache] = useState(null); // { ts, ranked }
  const [scanProgress, setScanProgress] = useState(null); // { done, total } while scanning
  const scanStartedRef = useRef(false);

  const fetchedCandles = useRef(new Set()); // once per ticker per session
  const fetchedInfo = useRef(new Set()); // richer-info bundle, once per ticker per session

  // device preferences (not account data): Finnhub key + last-viewed tab
  useEffect(() => {
    (async () => {
      // Invite links (?invite=<code>) are remembered until you're logged in with a profile.
      const invite = new URLSearchParams(window.location.search).get("invite");
      if (invite) {
        try {
          localStorage.setItem("ssd_pending_invite", invite);
        } catch (_) {}
        history.replaceState(null, "", window.location.pathname + window.location.hash);
      }
      // A share link like .../#key=<finnhub key> saves that key on this device,
      // then the key is wiped from the address bar.
      const hashKey = new URLSearchParams(window.location.hash.slice(1)).get("key");
      if (hashKey) {
        await storageSet(KEY_APIKEY, hashKey.trim());
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      const key = await storageGet(KEY_APIKEY);
      if (key) {
        setApiKey(key);
      } else if (DEFAULT_API_KEY) {
        setApiKey(DEFAULT_API_KEY);
        storageSet(KEY_APIKEY, DEFAULT_API_KEY);
      }
      const savedPage = await storageGet(KEY_PAGE);
      if (["home", "watchlist", "owned", "practice", "recommendations", "social", "learn"].includes(savedPage)) setPage(savedPage);
    })();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    try {
      localStorage.setItem("ssd_theme", theme);
    } catch (_) {}
  }, [theme]);

  // auth session: restore on load (Supabase keeps you logged in) and follow log-in/out
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // load the signed-in user's account; on logout, clear everything account-specific
  const sessionChecked = session !== undefined;
  useEffect(() => {
    if (!sessionChecked) return;
    if (!userId) {
      accountLoaded.current = false;
      clearTimeout(saveTimer.current);
      accountRef.current = { watchlist: [], alerts: [], transactions: [] };
      setReady(false);
      setWatchlist([]);
      setAlerts([]);
      setTransactions([]);
      setStockData({});
      setStockInfo({});
      fetchedCandles.current.clear();
      fetchedInfo.current.clear();
      return;
    }
    let cancelled = false;
    accountLoaded.current = false;
    setReady(false);
    setAccountError(null);
    (async () => {
      try {
        let doc = await loadAccount(userId);
        if (!doc) {
          // First login on this account: bring over anything this browser saved
          // before accounts existed, then clear the local copies so they can't
          // leak into a different account later.
          const parse = (s) => {
            try {
              const v = JSON.parse(s || "[]");
              return Array.isArray(v) ? v : [];
            } catch (_) {
              return [];
            }
          };
          const [w, al, tx] = await Promise.all([storageGet(KEY_WATCHLIST), storageGet(KEY_ALERTS), storageGet(KEY_TX)]);
          doc = { watchlist: parse(w), alerts: parse(al), transactions: parse(tx) };
          await saveAccount(userId, doc);
          storageSet(KEY_WATCHLIST, "[]");
          storageSet(KEY_ALERTS, "[]");
          storageSet(KEY_TX, "[]");
        }
        if (cancelled) return;
        accountRef.current = doc;
        accountLoaded.current = true;
        setWatchlist(doc.watchlist);
        setAlerts(doc.alerts);
        setTransactions(doc.transactions);
        setPaper(doc.paper || null);
        setOnboarding(doc.onboarding || {});
        setSaveStatus("saved");
        setReady(true);
      } catch (e) {
        if (!cancelled) setAccountError(e?.message || "Couldn't load your account.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionChecked, userId, accountReload]);

  // Debounced save of the whole account doc. The uid is captured when the change
  // happens, so a save can never land in a different account after a log-out.
  const scheduleSave = useCallback(() => {
    const uid = userIdRef.current;
    if (!uid || !accountLoaded.current) return;
    setSaveStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveAccount(uid, accountRef.current);
        if (userIdRef.current === uid) setSaveStatus("saved");
      } catch (_) {
        if (userIdRef.current === uid) setSaveStatus("error");
      }
    }, 400);
  }, []);

  async function handleLogout() {
    // flush any pending change before signing out
    clearTimeout(saveTimer.current);
    if (accountLoaded.current && userIdRef.current) {
      try {
        await saveAccount(userIdRef.current, accountRef.current);
      } catch (_) {
        /* best effort — sign out regardless */
      }
    }
    await supabase.auth.signOut();
  }

  const goToPage = useCallback((p) => {
    setPage(p);
    storageSet(KEY_PAGE, p);
  }, []);

  // account-data writers: update the screen now, save to the account shortly after
  const persistWatchlist = useCallback(
    (list) => {
      setWatchlist(list);
      accountRef.current = { ...accountRef.current, watchlist: list };
      scheduleSave();
    },
    [scheduleSave]
  );

  const persistAlerts = useCallback(
    (list) => {
      setAlerts(list);
      accountRef.current = { ...accountRef.current, alerts: list };
      scheduleSave();
    },
    [scheduleSave]
  );

  const persistPaper = useCallback(
    (p) => {
      setPaper(p);
      accountRef.current = { ...accountRef.current, paper: p };
      scheduleSave();
    },
    [scheduleSave]
  );
  const persistOnboarding = useCallback(
    (o) => {
      setOnboarding(o);
      accountRef.current = { ...accountRef.current, onboarding: o };
      scheduleSave();
    },
    [scheduleSave]
  );

  const persistTransactions = useCallback(
    (list) => {
      setTransactions(list);
      accountRef.current = { ...accountRef.current, transactions: list };
      scheduleSave();
    },
    [scheduleSave]
  );

  // Fire in-app price alerts: whenever a live quote arrives, any untriggered alert
  // whose threshold has been crossed is stamped with the time it fired.
  useEffect(() => {
    if (!alerts.length) return;
    let changed = false;
    const next = alerts.map((al) => {
      if (al.triggeredAt) return al;
      const price = stockData[al.symbol]?.quote?.c;
      if (price == null) return al;
      const hit = al.dir === "above" ? price >= al.price : price <= al.price;
      if (!hit) return al;
      changed = true;
      return { ...al, triggeredAt: Date.now(), triggeredPrice: price };
    });
    if (changed) persistAlerts(next);
  }, [stockData, alerts, persistAlerts]);

  function openAlert(symbol, price) {
    setAlertModal({ symbol, price });
  }

  function saveAlert(dir, price) {
    if (!alertModal) return;
    persistAlerts([
      ...alerts,
      { id: `${alertModal.symbol}-${Date.now()}`, symbol: alertModal.symbol, dir, price, created: Date.now(), triggeredAt: null },
    ]);
    setAlertModal(null);
  }

  function deleteAlert(id) {
    persistAlerts(alerts.filter((al) => al.id !== id));
  }

  // fetch quote + (once) candles for one symbol
  const loadSymbol = useCallback(
    async (symbol, key, { candlesToo }) => {
      try {
        const quote = await fetchQuote(symbol, key);
        setStockData((prev) => ({ ...prev, [symbol]: { ...prev[symbol], quote, quoteError: null } }));
      } catch (err) {
        setStockData((prev) => ({
          ...prev,
          [symbol]: { ...prev[symbol], quoteError: err.kind || "other" },
        }));
      }
      if (candlesToo && !fetchedCandles.current.has(symbol)) {
        fetchedCandles.current.add(symbol);
        try {
          const candles = await fetchCandles(symbol, key);
          setStockData((prev) => ({ ...prev, [symbol]: { ...prev[symbol], candles, candleError: null } }));
        } catch (err) {
          // no retry loop — mark the error; a rate-limit can be retried on next manual refresh
          if (err.kind === "rate") fetchedCandles.current.delete(symbol);
          setStockData((prev) => ({
            ...prev,
            [symbol]: { ...prev[symbol], candleError: err.kind || "other" },
          }));
        }
      }
    },
    []
  );

  // ----- Top 5 Daily Picks -----

  // Full pool scan: one candle fetch (Yahoo after the first Finnhub 403) plus
  // one Finnhub metric call per ticker, ~1/sec so the free 60/min limit holds.
  const runScan = useCallback(async (key) => {
    setScanProgress({ done: 0, total: PICK_POOL.length });
    const scored = [];
    for (let i = 0; i < PICK_POOL.length; i++) {
      const symbol = PICK_POOL[i];
      let candles = null;
      let metric = null;
      try {
        candles = await fetchCandles(symbol, key);
      } catch (_) {
        /* scoreStock treats missing data as neutral */
      }
      try {
        metric = await fetchMetrics(symbol, key);
      } catch (_) {
        /* same */
      }
      const s = scoreStock(symbol, candles, metric);
      if (s) scored.push(s);
      setScanProgress({ done: i + 1, total: PICK_POOL.length });
      await sleep(1000);
    }
    scored.sort((a, b) => b.score - a.score);
    // keep spares beyond 5 so Owned tickers can be filtered out at display time
    const ranked = scored.slice(0, 15);
    // upgrade the likely-displayed picks from last close to a live quote
    for (const p of ranked.slice(0, 8)) {
      try {
        p.price = (await fetchQuote(p.symbol, key)).c;
      } catch (_) {
        /* keep the candle close */
      }
      await sleep(350);
    }
    const cacheObj = { ts: Date.now(), ranked };
    setPickCache(cacheObj);
    storageSet(KEY_PICKS, JSON.stringify(cacheObj));
    setScanProgress(null);
  }, []);

  // On load: show cached picks if under 24h old, otherwise scan fresh.
  useEffect(() => {
    if (!ready || !apiKey || scanStartedRef.current) return;
    scanStartedRef.current = true;
    (async () => {
      const raw = await storageGet(KEY_PICKS);
      if (raw) {
        try {
          const c = JSON.parse(raw);
          if (c?.ts && Date.now() - c.ts < PICKS_TTL_MS && Array.isArray(c.ranked) && c.ranked.length) {
            setPickCache(c);
            return;
          }
        } catch (_) {
          /* corrupt cache — rescan */
        }
      }
      runScan(apiKey);
    })();
  }, [ready, apiKey, runScan]);

  function handleAddPick(symbol) {
    if (watchlist.some((w) => w.symbol === symbol)) return;
    persistWatchlist([...watchlist, { symbol, status: "watching" }]);
    post("watch", symbol);
    setToast(`${symbol} added to your watchlist`);
  }

  // add several at once (copy a friend's watchlist)
  function handleAddMany(symbols) {
    const have = new Set(watchlist.map((w) => w.symbol));
    const add = symbols.filter((s) => !have.has(s));
    if (!add.length) return;
    persistWatchlist([...watchlist, ...add.map((symbol) => ({ symbol, status: "watching" }))]);
    setToast(`Added ${add.length} stock${add.length === 1 ? "" : "s"} to your watchlist`);
  }

  // initial + on-key-change load, sequential to respect the free rate limit
  useEffect(() => {
    if (!ready || !apiKey || watchlist.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const item of watchlist) {
        if (cancelled) return;
        if (stockData[item.symbol]?.quote && fetchedCandles.current.has(item.symbol)) continue;
        await loadSymbol(item.symbol, apiKey, { candlesToo: true });
        await sleep(350);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, apiKey, watchlist]);

  // gentle 60s quote refresh (quotes only — candles stay cached for the session)
  useEffect(() => {
    if (!apiKey || watchlist.length === 0) return;
    const id = setInterval(async () => {
      for (const item of watchlist) {
        // candles refetch only if a previous attempt was rate-limited (fetchedCandles
        // was cleared for it) — otherwise they stay cached for the whole session
        await loadSymbol(item.symbol, apiKey, {
          candlesToo: !fetchedCandles.current.has(item.symbol),
        });
        await sleep(350);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [apiKey, watchlist, loadSymbol]);

  // Richer per-stock info (profile, 52wk/dividend metric, analyst ratings, next
  // earnings, recent news). Fetched once per ticker per session, each piece
  // populating as it arrives; any piece that errors/empties is simply omitted —
  // never faked. Spaced out so it stays under Finnhub's free 60/min limit.
  useEffect(() => {
    if (!ready || !apiKey || watchlist.length === 0) return;
    let cancelled = false;
    const setPart = (symbol, patch) =>
      setStockInfo((prev) => ({ ...prev, [symbol]: { ...prev[symbol], ...patch } }));
    (async () => {
      for (const item of watchlist) {
        if (cancelled) return;
        if (fetchedInfo.current.has(item.symbol)) continue;
        fetchedInfo.current.add(item.symbol);
        const sym = item.symbol;
        const steps = [
          ["profile", fetchProfile],
          ["metric", fetchMetrics],
          ["rec", fetchRecommendation],
          ["earnings", fetchEarningsDate],
          ["news", fetchNews],
        ];
        for (const [field, fn] of steps) {
          if (cancelled) return;
          try {
            const val = await fn(sym, apiKey);
            setPart(sym, { [field]: val });
          } catch (_) {
            /* unavailable on this key/ticker — omit, never fake */
          }
          await sleep(700); // keep well under the 60/min free limit
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, apiKey, watchlist]);


  // Social: badge count for incoming connection requests, refreshed every 2 minutes
  useEffect(() => {
    if (!ready || !userId) return;
    let alive = true;
    const tick = () =>
      myNetwork()
        .then((n) => {
          if (!alive) return;
          setIncomingCount(n.incoming.length);
          setConnCount(n.connections.length);
        })
        .catch(() => {});
    tick();
    const id = setInterval(tick, 120_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ready, userId]);
  const onNetwork = useCallback((n) => {
    setIncomingCount(n.incoming.length);
    setConnCount(n.connections.length);
  }, []);

  // weekly check-in (keeps your 🔥 streak alive) + first-week checklist state
  useEffect(() => {
    if (!ready || !userId) return;
    const d = new Date();
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).toISOString().slice(0, 10);
    const k = `ssd_checkin_${userId}`;
    let last = null;
    try {
      last = localStorage.getItem(k);
    } catch (_) {}
    if (last !== monday) {
      postActivity(userId, "checkin", null, {}).then(() => {
        try {
          localStorage.setItem(k, monday);
        } catch (_) {}
      }).catch(() => {});
    }
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    challengeBoard(month).then((rows) => setJoinedChallenge(rows.some((r) => r.me))).catch(() => {});
    const onWhy = () => setDidWhy(true);
    window.addEventListener("ssd-did-why", onWhy);
    return () => window.removeEventListener("ssd-did-why", onWhy);
  }, [ready, userId]);

  // deep link: ?stock=NVDA opens that stock's page
  useEffect(() => {
    if (!ready) return;
    const sym = new URLSearchParams(window.location.search).get("stock");
    if (sym && /^[A-Za-z0-9.\-]{1,12}$/.test(sym)) {
      history.replaceState(null, "", window.location.pathname + window.location.hash);
      setTimeout(() => openStockRef.current?.(sym.toUpperCase()), 0);
    }
  }, [ready]);
  const openStockRef = useRef(null);

  // your profile (header avatar, invite code)
  useEffect(() => {
    if (!ready || !userId) {
      setMyProfile(null);
      return;
    }
    loadMyProfile(userId).then(setMyProfile).catch(() => {});
  }, [ready, userId]);

  // accept a pending invite link once you have a profile
  useEffect(() => {
    if (!ready || !userId) return;
    let code = null;
    try {
      code = localStorage.getItem("ssd_pending_invite");
    } catch (_) {}
    if (!code) return;
    if (!myProfile) {
      setToast("Create your profile to connect with the friend who invited you");
      goToPage("social");
      return;
    }
    try {
      localStorage.removeItem("ssd_pending_invite");
    } catch (_) {}
    acceptInvite(code)
      .then((card) => card && card.id !== userId && setToast(`You're now connected with ${card.full_name} 🎉`))
      .catch((e) => setToast(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId, myProfile?.id]);

  // which of your friends own / watch each symbol
  const refreshFriends = useCallback(async () => {
    try {
      const rows = await networkSymbols();
      const map = {};
      for (const r of rows) {
        if (!r.user) continue;
        for (const sym of r.owned || []) (map[sym] ||= { owners: [], watchers: [] }).owners.push(r.user);
        for (const sym of r.watching || []) (map[sym] ||= { owners: [], watchers: [] }).watchers.push(r.user);
      }
      setFriendsBySymbol(map);
    } catch (_) {}
  }, []);
  const onNetworkAll = useCallback(
    (n) => {
      onNetwork(n);
      refreshFriends();
    },
    [onNetwork, refreshFriends]
  );
  const refreshNotifs = useCallback(() => myNotifications().then(setNotifs).catch(() => {}), []);
  useEffect(() => {
    if (!ready || !userId) return;
    refreshFriends();
    refreshNotifs();
    const a = setInterval(refreshFriends, 300_000);
    const b = setInterval(refreshNotifs, 60_000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [ready, userId, refreshFriends, refreshNotifs]);

  // S&P 500 history for the performance chart
  useEffect(() => {
    if (!ready || !apiKey || benchCandles || !watchlist.some((w) => w.status === "owned")) return;
    fetchCandles("SPY", apiKey).then(setBenchCandles).catch(() => {});
  }, [ready, apiKey, benchCandles, watchlist]);

  // post to your connections' feed (never blocks the UI)
  const post = useCallback((kind, symbol, data = {}, note = null) => {
    const uid = userIdRef.current;
    if (!uid) return;
    postActivity(uid, kind, symbol, data, note).catch(() => {});
  }, []);

  // full info bundle for the stock page
  const ensureFullInfo = useCallback(
    async (sym) => {
      if (!apiKey) return;
      if (!fetchedCandles.current.has(sym) || !stockData[sym]?.quote) await loadSymbol(sym, apiKey, { candlesToo: true });
      const have = stockInfo[sym] || {};
      const steps = [
        ["profile", fetchProfile],
        ["metric", fetchMetrics],
        ["rec", fetchRecommendation],
        ["earnings", fetchEarningsDate],
        ["news", fetchNews],
      ];
      fetchedInfo.current.add(sym);
      for (const [field, fn] of steps) {
        if (have[field] !== undefined) continue;
        try {
          const val = await fn(sym, apiKey);
          setStockInfo((prev) => ({ ...prev, [sym]: { ...prev[sym], [field]: val } }));
        } catch (_) {}
        await sleep(300);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiKey, loadSymbol, stockInfo]
  );
  const openStock = useCallback(
    (sym) => {
      const s = String(sym).toUpperCase();
      setDetail(s);
      ensureFullInfo(s);
    },
    [ensureFullInfo]
  );
  const openProfile = useCallback(
    (id) => {
      setDetail(null);
      goToPage("social");
      setSocialRoute({ tab: null, profileId: id, n: Date.now() });
    },
    [goToPage]
  );
  const goSocial = useCallback(
    (tab, extra = {}) => {
      setDetail(null);
      goToPage("social");
      setSocialRoute({ tab, ...extra, n: Date.now() });
    },
    [goToPage]
  );
  openStockRef.current = openStock;
  const getQuote = useCallback((sym) => fetchQuote(sym, apiKey), [apiKey]);

  function practiceTrade(qty) {
    const m = practiceModal;
    const price = m.price ?? stockData[m.symbol]?.quote?.c;
    const next = applyPaperTrade(paper, m.side, m.symbol, qty, price); // throws friendly errors to the modal
    persistPaper(next);
    setPracticeModal(null);
    setDetail(null);
    setToast(`Practice ${m.side} done: ${qty} ${m.symbol}`);
    goToPage("practice");
  }
  const quoteOf = useCallback((sym) => stockData[sym], [stockData]);

  function onNotification(n) {
    if (n.kind === "request") goSocial("requests");
    else if (n.kind === "accepted" || n.kind === "joined") openProfile(n.actor?.id);
    else if (n.kind === "group_add" || n.kind === "group_post") goSocial("groups", { groupId: n.group_id });
    else if (n.kind === "share" && n.data?.symbol) openStock(n.data.symbol);
    else goSocial("feed");
  }

  // Load quotes/candles (+ company profile for sectors) for a connection's
  // stocks, sharing the same per-session cache as your own cards.
  const ensureSymbols = useCallback(
    async (symbols, isAlive) => {
      if (!apiKey) return;
      for (const sym of symbols) {
        if (!isAlive()) return;
        if (!fetchedCandles.current.has(sym)) {
          await loadSymbol(sym, apiKey, { candlesToo: true });
          await sleep(350);
        }
        if (!fetchedInfo.current.has(sym)) {
          fetchedInfo.current.add(sym);
          try {
            const profile = await fetchProfile(sym, apiKey);
            setStockInfo((prev) => ({ ...prev, [sym]: { ...prev[sym], profile } }));
          } catch (_) {
            fetchedInfo.current.delete(sym);
          }
          await sleep(350);
        }
      }
    },
    [apiKey, loadSymbol]
  );

  async function handleAdd(e) {
    e.preventDefault();
    setAddError(null);
    const symbol = symInput.trim().toUpperCase();
    if (!symbol) return;
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }
    if (watchlist.some((w) => w.symbol === symbol)) {
      setAddError(`${symbol} is already on your watchlist.`);
      return;
    }
    const owned = statusInput === "owned";
    const buyPrice = parseFloat(buyPriceInput);
    const qty = parseFloat(qtyInput);
    if (owned && (!(buyPrice > 0) || !(qty > 0))) {
      setAddError("Owned positions need a buy price and quantity.");
      return;
    }
    setAddBusy(true);
    try {
      await fetchQuote(symbol, apiKey); // validates the ticker before adding
      const item = owned
        ? { symbol, status: "owned", buyPrice, qty, purchaseDate: new Date().toISOString().slice(0, 10) }
        : { symbol, status: "watching" };
      persistWatchlist([...watchlist, item]);
      if (owned) post("buy", symbol, { price: buyPrice, qty });
      else post("watch", symbol);
      setSymInput("");
      setBuyPriceInput("");
      setQtyInput("");
    } catch (err) {
      setAddError(ERROR_TEXT[err.kind] || ERROR_TEXT.other);
    } finally {
      setAddBusy(false);
    }
  }

  function handleRemove(symbol) {
    persistWatchlist(watchlist.filter((w) => w.symbol !== symbol));
    setStockData((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    setStockInfo((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    fetchedCandles.current.delete(symbol);
    fetchedInfo.current.delete(symbol);
    persistAlerts(alerts.filter((al) => al.symbol !== symbol)); // drop alerts for a removed stock
    setConfirm(null);
  }

  // Sell (full position): record the closed trade at the current live price so
  // realized P/L is tracked, then remove the holding.
  function handleSell(symbol, note) {
    const pos = watchlist.find((w) => w.symbol === symbol && w.status === "owned");
    const d = stockData[symbol];
    const sellPrice = d?.quote?.c ?? (d?.candles?.length ? d.candles[d.candles.length - 1].close : null);
    if (pos && sellPrice != null) {
      const realizedUsd = (sellPrice - pos.buyPrice) * pos.qty;
      const realizedPct = ((sellPrice - pos.buyPrice) / pos.buyPrice) * 100;
      persistTransactions([
        ...transactions,
        {
          id: `${symbol}-${Date.now()}`,
          symbol,
          qty: pos.qty,
          buyPrice: pos.buyPrice,
          sellPrice,
          buyDate: pos.purchaseDate || null,
          sellDate: new Date().toISOString().slice(0, 10),
          realizedUsd,
          realizedPct,
        },
      ]);
      post("sell", symbol, { buyPrice: pos.buyPrice, sellPrice, qty: pos.qty, gainPct: realizedPct, gainUsd: realizedUsd }, note);
    }
    setSellModal(null);
    handleRemove(symbol);
  }

  // Buy: move a Watching ticker into Owned with entry price / qty / date, keeping
  // its already-fetched quote + candles, then jump to the Owned page.
  function handleBuy(symbol, buyPrice, qty, note) {
    const pos = { symbol, status: "owned", buyPrice, qty, purchaseDate: new Date().toISOString().slice(0, 10) };
    persistWatchlist(
      watchlist.some((w) => w.symbol === symbol) ? watchlist.map((w) => (w.symbol === symbol ? pos : w)) : [...watchlist, pos]
    );
    post("buy", symbol, { price: buyPrice, qty }, note);
    setBuyModal(null);
    setDetail(null);
    goToPage("owned");
  }

  function handleSaveKey(key) {
    const finnhubChanged = key !== apiKey;
    setApiKey(key);
    storageSet(KEY_APIKEY, key);
    setSettingsOpen(false);
    if (finnhubChanged) {
      // new market-data key → allow candle + info refetch in case the old key lacked access
      finnhubCandlesBlocked = false;
      fetchedCandles.current.clear();
      fetchedInfo.current.clear();
      setStockData({});
      setStockInfo({});
    }
  }

  const watching = watchlist.filter((w) => w.status !== "owned");
  const owned = watchlist.filter((w) => w.status === "owned");

  // Per-position analysis computed once, shared by the summary bar and the cards
  // (guarantees the "needs attention" count matches the on-card breach badges).
  const ownedStats = owned.map((item) => {
    const d = stockData[item.symbol];
    const candles = d?.candles;
    const quote = d?.quote;
    const a = candles ? analyze(candles, quote, item) : null;
    const price = quote?.c ?? (candles && candles.length ? candles[candles.length - 1].close : null);
    const risk = a && price != null ? ownedRisk(item, a, price) : null;
    const value = price != null ? price * item.qty : null;
    const cost = item.buyPrice * item.qty;
    const gain = value != null ? value - cost : null;
    const gainPct = value != null && cost > 0 ? (gain / cost) * 100 : null;
    return { item, data: d, a, price, risk, value, cost, gain, gainPct };
  });

  // today's signal per symbol, for the "since yesterday" digest
  const signalLabels = {};
  for (const w of watchlist) {
    const d = stockData[w.symbol];
    if (d?.candles) {
      const a = analyze(d.candles, d.quote, w);
      if (a) signalLabels[w.symbol] = a.signalLabel;
    }
  }
  const digest = useDigest(userId, signalLabels, ready);

  // tell connections when a position hits its target or safety line (once per position)
  useEffect(() => {
    if (!ready || !accountLoaded.current) return;
    const events = new Set(accountRef.current.events || []);
    const add = [];
    for (const st of ownedStats) {
      if (!st.risk) continue;
      const kind = st.risk.breachedStop ? "stop" : st.risk.hitTarget ? "target" : null;
      if (!kind) continue;
      const key = `${st.item.symbol}:${kind}:${st.item.buyPrice}:${st.item.purchaseDate || ""}`;
      if (events.has(key)) continue;
      add.push(key);
      post(kind, st.item.symbol, kind === "target" ? { target: st.risk.target, gainPct: st.gainPct } : { stop: st.risk.stop, gainPct: st.gainPct });
    }
    if (add.length) {
      accountRef.current = { ...accountRef.current, events: [...events, ...add].slice(-200) };
      scheduleSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, JSON.stringify(ownedStats.map((s) => [s.item.symbol, s.risk?.hitTarget, s.risk?.breachedStop]))]);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">Loading…</div>
    );
  }

  if (!session) return <AuthScreen />;

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 px-4 text-center text-zinc-500">
        {accountError ? (
          <>
            <div className="text-sm text-red-300">Couldn't load your account: {accountError}</div>
            <div className="flex gap-2">
              <button
                onClick={() => setAccountReload((n) => n + 1)}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
              >
                Try again
              </button>
              <button onClick={handleLogout} className="rounded-md px-4 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
                Log out
              </button>
            </div>
          </>
        ) : (
          "Loading your account…"
        )}
      </div>
    );
  }

  const unread = notifs.filter((n) => !n.read).length;
  const firstSym = watchlist[0]?.symbol;
  const steps = onboarding.dismissed
    ? null
    : [
        { label: "Add a stock you're curious about", done: watchlist.length > 0, cta: "Add", go: () => goToPage("watchlist") },
        { label: "Read a “Why?” to see the reasoning", done: didWhy, cta: "Show me", go: () => (firstSym ? openStock(firstSym) : goToPage("watchlist")) },
        { label: "Connect with a friend", done: connCount > 0, cta: "Find friends", go: () => goSocial("friends") },
        { label: "Make a practice buy with pretend money", done: !!paper?.trades?.length, cta: "Practice", go: () => goToPage("practice") },
        { label: "Join this month's pick challenge", done: joinedChallenge, cta: "Join", go: () => goSocial("compete") },
      ];
  const breached = ownedStats.filter((st) => st.risk?.breachedStop).length;
  const allSymbols = watchlist.map((w) => w.symbol);
  const detailItem = detail ? watchlist.find((w) => w.symbol === detail) : null;
  const goNav = (to) => {
    if (to.startsWith("social:")) goSocial(to.split(":")[1]);
    else goToPage(to);
  };
  const tabs = [
    { id: "home", label: "Home", count: null },
    { id: "watchlist", label: "My Stocks", count: watchlist.length, also: ["owned", "practice"] },
    { id: "recommendations", label: "Discover", count: null },
    { id: "social", label: "Social", count: null, badge: incomingCount },
  ];
  // Watching / Owned switch shown at the top of My Stocks
  const stocksSwitch = (
    <div className="mb-4 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
      {[
        ["watchlist", `👁 Watching (${watching.length})`],
        ["owned", `💼 Owned (${owned.length})`],
        ["practice", "🎮 Practice"],
      ].map(([id, label]) => (
        <button
          key={id}
          onClick={() => goToPage(id)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${page === id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-200">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:pb-8 sm:pt-6">
        {/* header */}
        <header className="mb-4">
          <div className="mb-3 flex items-center gap-3">
            <button onClick={() => goToPage("home")} className="flex shrink-0 items-center gap-2">
              <img src="./icon.svg" alt="" className="h-8 w-8 rounded-lg" />
              <span className="hidden text-lg font-bold tracking-tight text-zinc-50 md:inline">Stock Signals</span>
            </button>
            <div className="min-w-0 flex-1">
              <StockSearch apiKey={apiKey} onOpen={openStock} />
            </div>
            <NotificationsBell uid={userId} items={notifs} onRefresh={refreshNotifs} onOpen={onNotification} />
            <HeaderMenu
              email={session.user.email}
              profile={myProfile}
              theme={theme}
              onTheme={setTheme}
              onSettings={() => setSettingsOpen(true)}
              onLearn={() => goToPage("learn")}
              onProfile={() => goSocial("me")}
              onWelcome={() => (setShowWelcome(true), goToPage("watchlist"))}
              onLogout={handleLogout}
              saveStatus={saveStatus}
            />
          </div>
          {/* tabs (top on desktop; bottom bar on phones) */}
          <nav className="hidden gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1 sm:flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => goToPage(tab.id)}
                className={`flex-1 min-w-0 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  page === tab.id || tab.also?.includes(page) ? "bg-blue-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${page === tab.id ? "bg-blue-500/60" : "bg-zinc-800"}`}>
                    {tab.count}
                  </span>
                )}
                {tab.badge > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{tab.badge}</span>}
              </button>
            ))}
          </nav>
        </header>

        {apiKey && page === "home" && <TodayStrip ownedStats={ownedStats} alerts={alerts} breached={breached} incoming={incomingCount} unread={unread} onNav={goNav} />}

        {/* ===================== HOME ===================== */}
        {page === "home" &&
          (!apiKey || watchlist.length === 0 ? (
            <Welcome hasKey={!!apiKey} onAdd={(s) => (handleAddPick(s), goToPage("watchlist"))} onOpenSettings={() => setSettingsOpen(true)} />
          ) : null)}
        {page === "home" && (
          <Home
            uid={userId}
            name={myProfile?.full_name}
            ownedStats={ownedStats}
            benchCandles={benchCandles}
            alerts={alerts}
            notifs={notifs}
            onRefreshNotifs={refreshNotifs}
            digest={digest}
            stockInfo={stockInfo}
            symbols={allSymbols}
            pickCache={pickCache}
            watchlist={watchlist}
            onOpenStock={openStock}
            onOpenProfile={openProfile}
            onGo={goToPage}
            onGoSocial={goSocial}
            onAdd={handleAddPick}
            onNotification={onNotification}
            steps={steps}
            onDismissSteps={() => persistOnboarding({ ...onboarding, dismissed: true })}
            stockData={stockData}
            ensureSymbols={ensureSymbols}
            onToast={setToast}
          />
        )}

        {/* ===================== PRACTICE ===================== */}
        {page === "practice" && (
          <>
            {stocksSwitch}
            <PracticePage
              paper={paper}
              stockData={stockData}
              ensureSymbols={ensureSymbols}
              onStart={() => persistPaper(newPaper())}
              onReset={() => persistPaper(newPaper())}
              onTrade={(side, symbol, price) => setPracticeModal({ side, symbol, price })}
              onOpenStock={openStock}
            />
          </>
        )}

        {/* ===================== LEARN ===================== */}
        {page === "learn" && <GlossaryPage />}

        {/* fired price alerts — shown on every page until dismissed */}
        <TriggeredAlertsBanner alerts={alerts} onDismiss={deleteAlert} />

        {/* ===================== WATCHLIST PAGE ===================== */}
        {page === "watchlist" && (
          <>
            {stocksSwitch}
            {(!apiKey || showWelcome) && (
              <div className="relative">
                {showWelcome && watchlist.length > 0 && (
                  <button onClick={() => setShowWelcome(false)} className="absolute right-3 top-3 z-10 text-zinc-500 hover:text-zinc-200" title="Close">
                    ✕
                  </button>
                )}
                <Welcome hasKey={!!apiKey} onAdd={handleAddPick} onOpenSettings={() => setSettingsOpen(true)} />
              </div>
            )}


            <form onSubmit={handleAdd} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex flex-col">
                <label className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Ticker</label>
                <input
                  value={symInput}
                  onChange={(e) => setSymInput(e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  className="w-28 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm uppercase text-zinc-100 outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex flex-col">
                <label className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Status</label>
                <select
                  value={statusInput}
                  onChange={(e) => setStatusInput(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                >
                  <option value="watching">Watching</option>
                  <option value="owned">Owned</option>
                </select>
              </div>
              {statusInput === "owned" && (
                <>
                  <div className="flex flex-col">
                    <label className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Buy price</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={buyPriceInput}
                      onChange={(e) => setBuyPriceInput(e.target.value)}
                      placeholder="182.50"
                      className="w-28 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Quantity</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={qtyInput}
                      onChange={(e) => setQtyInput(e.target.value)}
                      placeholder="10"
                      className="w-24 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              )}
              <button
                type="submit"
                disabled={addBusy || !symInput.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
              >
                {addBusy ? "Checking…" : "Add"}
              </button>
              <span className="text-xs text-zinc-500">Don't know the ticker? Use the search at the top.</span>
              {addError && <div className="basis-full text-sm text-red-400">{addError}</div>}
            </form>

            {watching.length === 0 ? (
              watchlist.length > 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">
                  Nothing on your watchlist right now. Add a stock above, or check{" "}
                  <button onClick={() => goToPage("recommendations")} className="text-blue-400 hover:underline">
                    Discover
                  </button>{" "}
                  for ideas.
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {watching.map((item) => (
                  <StockCard
                    key={item.symbol}
                    item={item}
                    data={stockData[item.symbol]}
                    info={stockInfo[item.symbol]}
                    alerts={alerts}
                    onSetAlert={openAlert}
                    onDeleteAlert={deleteAlert}
                    onBuy={(symbol, price) => setBuyModal({ symbol, price })}
                    onRemove={(symbol) => setConfirm({ kind: "remove", symbol })}
                    friends={friendsBySymbol[item.symbol]}
                    onOpen={openStock}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ===================== OWNED PAGE ===================== */}
        {page === "owned" && (
          <>
            {stocksSwitch}
            {owned.length === 0 ? (
              <div className="mb-4 rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">
                You don't own any stocks yet. Add a stock on the{" "}
                <button onClick={() => goToPage("watchlist")} className="text-blue-400 hover:underline">
                  Watchlist
                </button>{" "}
                and hit <span className="text-emerald-400">Buy</span> to start tracking a position — your profit, safety line and target show up here.
              </div>
            ) : (
              <>
                <PortfolioSummaryBar stats={ownedStats} />
                <PerformanceChart owned={owned} stockData={stockData} benchCandles={benchCandles} />
                <PortfolioHighlights stats={ownedStats} />
                <div className="mb-4">
                  <DividendsCard ownedStats={ownedStats} stockInfo={stockInfo} />

                </div>
                <SectorAllocation stats={ownedStats} info={stockInfo} />
              </>
            )}
            <RealizedPnL transactions={transactions} onClear={() => persistTransactions([])} />
            {owned.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {ownedStats.map((stat) => (
                  <OwnedCard
                    key={stat.item.symbol}
                    stat={stat}
                    info={stockInfo[stat.item.symbol]}
                    alerts={alerts}
                    onSetAlert={openAlert}
                    onDeleteAlert={deleteAlert}
                    onSell={(symbol) => setSellModal({ symbol, price: stat.price })}
                    friends={friendsBySymbol[stat.item.symbol]}
                    onOpen={openStock}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ===================== PICKS PAGE ===================== */}
        {page === "recommendations" && (
          <>
            {apiKey ? (
              <TopPicksSection cache={pickCache} progress={scanProgress} watchlist={watchlist} onAdd={handleAddPick} onOpen={openStock} />
            ) : (
              <div className="mb-6 rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">
                Add a market-data key in Settings to run the daily screen.
              </div>
            )}
            <FriendsPicks friendsBySymbol={friendsBySymbol} watchlist={watchlist} onAdd={handleAddPick} onOpen={openStock} />
          </>
        )}

        {/* ===================== SOCIAL PAGE ===================== */}
        {page === "social" && (
          <SocialPage
            uid={userId}
            email={session.user.email}
            counts={{ owned_count: owned.length, watching_count: watching.length }}
            onNetwork={onNetworkAll}
            route={socialRoute}
            onProfile={setMyProfile}
            apiKey={apiKey}
            onOpenStock={openStock}
            ensureSymbols={ensureSymbols}
            quoteOf={quoteOf}
            getQuote={getQuote}
            mySymbols={allSymbols}
            onAddToWatchlist={handleAddPick}
            renderPortfolio={(uid, name) => (
              <FriendPortfolio
                key={uid}
                uid={uid}
                name={name}
                stockData={stockData}
                stockInfo={stockInfo}
                ensureSymbols={ensureSymbols}
                mySymbols={allSymbols}
                onAddToWatchlist={handleAddPick}
                onAddMany={handleAddMany}
                onOpenStock={openStock}
              />
            )}
          />
        )}

        <footer className="mt-10 border-t border-zinc-900 pt-4 text-center text-xs text-zinc-600">Educational tool only, not financial advice.</footer>
      </div>

      <BottomNav page={page} onGo={goToPage} badges={{ social: incomingCount + (unread && !incomingCount ? 0 : 0) }} />

      {detail && (
        <StockDetail
          symbol={detail}
          item={detailItem}
          data={stockData[detail]}
          info={stockInfo[detail]}
          alerts={alerts}
          friends={friendsBySymbol[detail]}
          uid={userId}
          inList={!!detailItem}
          onClose={() => setDetail(null)}
          onAdd={handleAddPick}
          onBuy={(symbol, price) => setBuyModal({ symbol, price })}
          onSetAlert={openAlert}
          onDeleteAlert={deleteAlert}
          onOpenProfile={openProfile}
          onPractice={(symbol, price) => setPracticeModal({ side: "buy", symbol, price })}
          onShare={setShareSymbol}
        />
      )}

      <PracticeTradeModal
        open={!!practiceModal}
        side={practiceModal?.side}
        symbol={practiceModal?.symbol}
        price={practiceModal?.price ?? stockData[practiceModal?.symbol]?.quote?.c}
        paper={paper || newPaper()}
        onConfirm={practiceTrade}
        onClose={() => setPracticeModal(null)}
      />
      <ShareModal open={!!shareSymbol} uid={userId} symbol={shareSymbol} onClose={() => setShareSymbol(null)} onDone={setToast} />

      <SettingsModal open={settingsOpen} apiKey={apiKey} onSave={handleSaveKey} onClose={() => setSettingsOpen(false)} />

      <AlertModal
        open={!!alertModal}
        symbol={alertModal?.symbol}
        price={alertModal?.price}
        onSave={saveAlert}
        onClose={() => setAlertModal(null)}
      />

      <BuyModal
        open={!!buyModal}
        symbol={buyModal?.symbol}
        price={buyModal?.price}
        onConfirm={(price, qty, note) => handleBuy(buyModal.symbol, price, qty, note)}
        onClose={() => setBuyModal(null)}
      />

      <SellModal
        open={!!sellModal}
        symbol={sellModal?.symbol}
        price={sellModal?.price}
        onConfirm={(note) => handleSell(sellModal.symbol, note)}
        onClose={() => setSellModal(null)}
      />

      <ConfirmModal
        open={!!confirm}
        title={`Remove ${confirm?.symbol}?`}
        message="This removes the stock from your watchlist (and any price alerts on it). You can always add it back later."
        confirmLabel="Remove"
        onConfirm={() => handleRemove(confirm.symbol)}
        onClose={() => setConfirm(null)}
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

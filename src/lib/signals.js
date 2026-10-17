// Signal math shared by the app and the build scripts (track record).
// Pure functions only: no React, no network.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ---------- indicators ----------

export function sma(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

// 14-day RSI with Wilder's smoothing
export function rsi(values, period = 14) {
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
export function emaSeries(values, period) {
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
export function computeMACD(closes, fast = 12, slow = 26, sig = 9) {
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

export function stdev(arr) {
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
export function analyze(candles, quote, item) {
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


// ---------- backtest ----------

export const BACKTEST_BUDGET = 1000; // hypothetical starting amount for both strategies

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
export function runBacktest(candles) {
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


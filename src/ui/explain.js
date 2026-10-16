// Plain-English explanations for the numbers analyze() / ownedRisk() compute.
// Nothing here changes a signal — it only describes the same math in words.

const $ = (n) => (n == null || !Number.isFinite(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (n, d = 1) => `${Math.abs(n).toFixed(d)}%`;

export const GLOSSARY = {
  rsi: "RSI (Relative Strength Index) is a 0–100 score of how strongly a stock has been bought or sold over the last 14 days. Above 70 is often “overheated”, below 30 “oversold”.",
  macd: "MACD compares a fast and a slow moving average to spot when short-term momentum turns. A cross above its signal line hints momentum is turning up; below, turning down.",
  sma: "A moving average is the average closing price over the last N days (20 or 50 here). It smooths out daily noise so you can see the trend.",
  trend: "We compare the 20-day and 50-day averages. When the shorter one is above the longer one, prices have been rising for weeks — an uptrend.",
  support: "Support is a price where buyers have stepped in before. Here it's the 50-day average or the recent 6-month low.",
  resistance: "Resistance is a price the stock has struggled to rise above — here, its 6-month high.",
  stop: "A stop-loss (safety line) is the price where you'd sell to cap a loss. Ours is based on how much this stock normally moves each day.",
  target: "The target is a realistic upside price — the recent high, or twice the distance to the stop if the high is too close.",
  rr: "Reward-to-risk compares the possible gain (to target) with the possible loss (to stop). 2:1 means you could make twice what you risk.",
  pe: "P/E (price-to-earnings) is the share price divided by yearly profit per share. Lower can mean cheaper; very high means investors expect big growth.",
  dividend: "Dividend yield is the yearly cash dividend as a % of the share price.",
  range52: "The lowest and highest prices over the last 52 weeks (one year).",
  unrealized: "Unrealized profit/loss is how much you'd gain or lose if you sold right now. It isn't locked in until you sell.",
  realized: "Realized profit/loss is what you actually made or lost on positions you've already sold.",
  confidence: "How strongly the three checks agree. High = all three point the same way; Low = they disagree or the trend is weak.",
  volume: "Volume is how many shares traded. A day with much more volume than usual means unusual interest in the stock.",
  backtest: "A backtest replays the last ~6 months: what $1,000 would have become following this signal versus simply buying and holding.",
  score: "The pick score (0–100) is half technical (trend, momentum, volume) and half fundamental (valuation and growth).",
};

const WATCH_VERDICT = {
  Buy: "Buy",
  "Buy the Dip": "Buy the Dip",
  "Buy on Pullback": "Wait for a Dip",
  "Wait for Pullback": "Wait for a Dip",
  Watch: "Watch",
  Avoid: "Avoid",
};
const OWNED_VERDICT = {
  Hold: "Hold",
  "Consider Trimming": "Trim",
  "Consider Selling": "Sell",
};

export function verdictTone(v) {
  if (/^(Buy|Add)/.test(v)) return "good";
  if (/^(Sell|Avoid)/.test(v)) return "bad";
  if (/^(Trim|Wait)/.test(v)) return "caution";
  return "neutral";
}

// count how many of the three checks agree with the verdict's direction
function agreeCount(a, tone) {
  const v = a.votes || {};
  const up = [v.ma, v.rsi, v.macd].filter((x) => x > 0).length;
  const down = [v.ma, v.rsi, v.macd].filter((x) => x < 0).length;
  if (tone === "good") return up;
  if (tone === "bad") return down;
  return Math.max(up, down);
}

export function summaryLine(a) {
  if (!a) return null;
  if (a.uptrend && a.overbought) return "Rising fast — maybe too fast. Waiting for a dip is safer.";
  if (a.uptrend && a.extended) return "Trending up, but stretched well above its recent average.";
  const cooling = (a.votes?.macd ?? 0) < 0 || (a.votes?.rsi ?? 0) < 0;
  if (a.uptrend && cooling) return "In an uptrend, but short-term momentum is cooling.";
  if (a.downtrend && ((a.votes?.macd ?? 0) > 0 || (a.votes?.rsi ?? 0) > 0)) return "Still in a downtrend, though short-term momentum is starting to pick up.";
  if (a.strongUp) return "In a strong, steady uptrend and not overpriced right now.";
  if (a.uptrend) return "In an uptrend with room to run.";
  if (a.downtrend && a.oversold) return "Falling hard and oversold — a bounce is possible, but the trend is still down.";
  if (a.strongDown) return "In a clear downtrend with no sign of turning yet.";
  if (a.downtrend) return "Drifting lower — the trend is pointing down.";
  return "Moving sideways — no clear direction yet.";
}

// The "Why?" panel: three checks in plain words, a bottom line, and extras.
export function explainStock(a, { owned = false, risk = null } = {}) {
  if (!a) return null;
  const rawVerdict = owned && risk ? risk.rec : a.action;
  const verdict = (owned ? OWNED_VERDICT[rawVerdict] : WATCH_VERDICT[rawVerdict]) || rawVerdict;
  const tone = verdictTone(verdict);
  const dots = agreeCount(a, tone);
  const base = a.conviction === "High" ? 3 : a.conviction === "Moderate" ? 2 : 1;
  const level = Math.min(base, Math.max(dots, 1));
  const confidence = level === 3 ? "High" : level === 2 ? "Medium" : "Low";

  const rows = [];
  // 1) trend
  if (a.uptrend) {
    rows.push({
      icon: "good", key: "trend", title: "Trending up",
      text: `The 20-day average (${$(a.sma20)}) is ${pct(a.spreadPct)} above the 50-day (${$(a.sma50)}), so prices have been climbing for weeks.`,
    });
  } else if (a.downtrend) {
    rows.push({
      icon: "bad", key: "trend", title: "Trending down",
      text: `The 20-day average (${$(a.sma20)}) is ${pct(a.spreadPct)} below the 50-day (${$(a.sma50)}), so prices have been sliding.`,
    });
  } else {
    rows.push({
      icon: "caution", key: "trend", title: "No clear trend",
      text: `The 20-day (${$(a.sma20)}) and 50-day (${$(a.sma50)}) averages are within ${pct(a.spreadPct)} of each other.`,
    });
  }
  if (a.extended) {
    const ext = ((a.price - a.sma20) / a.sma20) * 100;
    rows[0].text += ` Price is ${pct(ext, 0)} above its 20-day average — it has run up fast.`;
  }

  // 2) momentum (RSI)
  const r = a.rsi14;
  const dir = a.rsiRising ? " and rising" : a.rsiFalling ? " and cooling" : "";
  if (r >= 70) rows.push({ icon: "caution", key: "rsi", title: `Overheated (RSI ${r.toFixed(0)})`, text: `Lots of recent buying${dir}; stocks often pause or dip from here.` });
  else if (r >= 50) rows.push({ icon: "good", key: "rsi", title: `Healthy buying (RSI ${r.toFixed(0)})`, text: `Buyers are in control${dir}, but it isn't overheated (that's above 70).` });
  else if (r > 30) rows.push({ icon: "caution", key: "rsi", title: `Weak momentum (RSI ${r.toFixed(0)})`, text: `Sellers have had the edge lately${dir}.` });
  else rows.push({ icon: "caution", key: "rsi", title: `Oversold (RSI ${r.toFixed(0)})`, text: `Heavy selling${dir}; a bounce is possible but not guaranteed.` });

  // 3) MACD turn
  if (a.macd) {
    const when = a.macd.crossAgo == null ? "a while ago" : a.macd.crossAgo === 0 ? "today" : a.macd.crossAgo === 1 ? "1 day ago" : `${a.macd.crossAgo} days ago`;
    rows.push(
      a.macd.bull
        ? { icon: "good", key: "macd", title: "Turning up", text: `Short-term momentum crossed above its signal line ${when}.` }
        : { icon: "bad", key: "macd", title: "Turning down", text: `Short-term momentum dropped below its signal line ${when}.` }
    );
  }

  // bottom line
  const v = a.votes || {};
  const up = [v.ma, v.rsi, v.macd].filter((x) => x > 0).length;
  const down = [v.ma, v.rsi, v.macd].filter((x) => x < 0).length;
  let bottom;
  if (up === 3) bottom = a.overbought ? "All 3 checks point up, but it's overheated — a better price may come." : "All 3 checks point up — the strongest setup the app gives.";
  else if (down === 3) bottom = "All 3 checks point down — the weakest setup. Stay careful.";
  else if ((tone === "good" || tone === "bad") && dots <= 1)
    bottom = `Only ${dots} of 3 checks back this ${verdict.toLowerCase()} call — the signals are mixed, so treat it with caution.`;
  else if (up === 2) bottom = `2 of 3 checks point up${a.overbought ? ", but momentum is overheated" : ""}.`;
  else if (down === 2) bottom = `2 of 3 checks point down${tone === "good" ? ", so this is a weak buy — waiting may be wiser" : ""}.`;
  else bottom = "The checks disagree, so confidence is low — watch and wait.";
  if (owned && risk) {
    if (risk.breachedStop) bottom += ` Price is below your safety line (${$(risk.stop)}).`;
    else if (risk.hitTarget) bottom += ` It has reached your target (${$(risk.target)}).`;
  }

  const extras = [];
  if (a.volRatio != null && a.volRatio >= 1.3) extras.push(`Trading volume in the last session was ${a.volRatio.toFixed(1)}× normal — lots of interest.`);
  if (a.pctFromHigh != null && a.pctFromHigh > -5)
    extras.push(a.pctFromHigh > -0.1 ? "Price is at its 6-month high." : `Price is ${pct(a.pctFromHigh)} below its 6-month high.`);

  return { verdict, tone, dots, confidence, rows, bottom, extras, summary: summaryLine(a), rationale: owned && risk ? risk.recReason : a.rationale };
}

export function levelsExplained(a) {
  if (!a) return [];
  const stopPct = ((a.price - a.stop) / a.price) * 100;
  return [
    { label: "Support", value: $(a.support), info: "support", text: a.price > a.sma50 ? "Where buyers have stepped in before (the 50-day average)." : "The recent 6-month low — the floor buyers defended." },
    { label: "Resistance", value: $(a.resistance), info: "resistance", text: a.price < a.hi ? "The 6-month high, where it has struggled to go higher." : "Projected — it's already at a new 6-month high." },
    { label: "Suggested stop-loss", value: `${$(a.stop)} (−${stopPct.toFixed(0)}%)`, info: "stop", tone: "bad", text: "If it falls here, the setup is broken. Sized to how much this stock normally moves." },
    { label: "Target", value: $(a.target), info: "target", tone: "good", text: a.rr ? `Possible reward is ${a.rr.toFixed(1)}× the risk.` : "Upside level based on the recent high." },
  ];
}

export function positionSentence(item, price) {
  const d = item.purchaseDate ? new Date(item.purchaseDate.length === 10 ? item.purchaseDate + "T00:00:00" : item.purchaseDate) : null;
  const days = d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000)) : null;
  const when = d ? ` on ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}${days != null ? ` (${days} day${days === 1 ? "" : "s"} ago)` : ""}` : "";
  const value = price != null ? price * item.qty : null;
  const gain = value != null ? value - item.buyPrice * item.qty : null;
  const gainPct = gain != null ? (gain / (item.buyPrice * item.qty)) * 100 : null;
  return {
    bought: `You bought ${item.qty} share${item.qty === 1 ? "" : "s"} at ${$(item.buyPrice)}${when}.`,
    now: value != null ? `Now worth ${$(value)}` : null,
    gain, gainPct,
  };
}

export function backtestSentence(bt) {
  if (!bt) return null;
  const sig = 1000 * (1 + bt.sigReturn / 100);
  const bh = 1000 * (1 + bt.bhReturn / 100);
  const better = bt.sigReturn >= bt.bhReturn ? "beating" : "trailing";
  return `Following this signal for the last ${Math.round(bt.days / 21)} months would have turned $1,000 into ${$(sig)}, ${better} just holding (${$(bh)}).`;
}

export function pickReason(p) {
  // one friendly line from the scorer's reasons
  const bits = [];
  const txt = p.reasons.join(" | ");
  if (/Bullish MA trend/.test(txt)) bits.push("uptrend");
  else if (/Bearish MA trend/.test(txt)) bits.push("downtrend");
  const rsi = txt.match(/RSI (\d+) \(([^)]+)\)/);
  if (rsi) bits.push(`momentum ${rsi[2]}`);
  const eps = txt.match(/EPS growth (-?\d+)%/);
  if (eps) bits.push(`earnings growing ${eps[1]}%`);
  const rev = txt.match(/Revenue growth (-?\d+)%/);
  if (rev && !eps) bits.push(`sales growing ${rev[1]}%`);
  const pe = txt.match(/P\/E ([\d.]+) \((\w+)\)/);
  if (pe) bits.push(`P/E ${Math.round(+pe[1])} (${pe[2]})`);
  return bits.length ? `${bits[0][0].toUpperCase()}${bits[0].slice(1)}${bits.length > 1 ? ", " + bits.slice(1).join(", ") : ""}.` : null;
}

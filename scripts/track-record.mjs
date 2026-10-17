// Builds public/track-record.json: an honest replay of the app's own Buy and
// Strong Buy calls over the candle history in public/candles/.
// Run by .github/workflows/deploy.yml right after scripts/fetch-candles.mjs.
//
// Method (kept deliberately simple, and exactly what the landing page says):
// - Signal math: the app's own analyze() (src/lib/signals.js) and the same
//   verdict mapping the stock card uses (explainStock in src/ui/explain.js,
//   for a stock you don't own). A day counts as a "Buy" family day when the
//   verdict tone is good (verdict starts with "Buy"). Then:
//     Strong Buy = all 3 checks (trend, RSI, MACD) point up,
//     Buy        = exactly 2 of 3 point up.
//   (A Buy verdict always has the trend vote up, so 1-of-3 Buys are left out:
//   the app itself flags those as "mixed".)
// - No look-ahead: on trading day d, analyze() only sees candles[0..d]. The
//   entry price is the close on day d (the signal is known at that close).
// - Need 50 prior candles (analyze's minimum) and 21 later trading days
//   (~30 calendar days) for the exit. Exit = close 21 trading days later.
// - De-duplication: a stock that stays a Strong Buy for 15 days in a row is ONE
//   event, not 15. An event is recorded only on the day a stock flips INTO a
//   state (Strong Buy, or Buy) it was not in the previous trading day. The first
//   analysable day of each stock is never an event (we can't see whether it
//   flipped that day). The two states are tracked separately, so Buy -> Strong
//   Buy counts as a new Strong Buy event.
// - Benchmark: SPY close-to-close over the same two dates as each event.
// - Every event is counted: winners and losers. Returns ignore fees, taxes,
//   slippage and dividends.
//
// Curve ("growth of $1,000"): an equal-weight basket of every Strong Buy event
// that is currently open (opened in the last 21 trading days). Each trading day
// the basket earns the average of the open positions' daily returns; on days
// with no open position the money sits in cash (0%). The S&P 500 line is $1,000
// bought in SPY on the first day of the curve and held. Both lines use SPY's
// trading calendar.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { analyze } from "../src/lib/signals.js";
import { explainStock } from "../src/ui/explain.js";

const DIR = process.env.CANDLES_DIR || "public/candles";
const OUT = process.env.TRACK_OUT || "public/track-record.json";
const HOLD = 21; // trading days ≈ 30 calendar days
const MIN_HISTORY = 50;

const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const round = (n, d = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

function load(symbol) {
  try {
    const d = JSON.parse(readFileSync(`${DIR}/${symbol}.json`, "utf8"));
    if (!Array.isArray(d?.t) || !Array.isArray(d?.c)) return null;
    const out = [];
    for (let i = 0; i < d.t.length; i++) {
      const t = Number(d.t[i]), c = Number(d.c[i]);
      if (!Number.isFinite(t) || !Number.isFinite(c) || c <= 0) continue;
      out.push({ t, close: c, v: Number(d.v?.[i]) || 0 });
    }
    out.sort((a, b) => a.t - b.t);
    // drop duplicate dates (keep the last)
    return out.filter((c, i) => i === out.length - 1 || day(c.t) !== day(out[i + 1].t));
  } catch {
    return null;
  }
}

function symbolsList() {
  try {
    const idx = JSON.parse(readFileSync(`${DIR}/index.json`, "utf8"));
    if (Array.isArray(idx?.symbols) && idx.symbols.length) return idx.symbols.filter((s) => typeof s === "string");
  } catch {}
  try {
    return readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

// 0 = not a Buy, 2 = Buy (2 of 3 up), 3 = Strong Buy (3 of 3 up)
function buyLevel(a) {
  if (!a) return 0;
  const ex = explainStock(a);
  if (!ex || ex.tone !== "good") return 0;
  const v = a.votes || {};
  const up = [v.ma, v.rsi, v.macd].filter((x) => x > 0).length;
  return up === 3 ? 3 : up === 2 ? 2 : 0;
}

function stats(events) {
  const n = events.length;
  if (!n) return { count: 0, avgReturnPct: null, medianReturnPct: null, hitRatePct: null, avgSpyPct: null, beatSpyPct: null };
  const r = events.map((e) => e.returnPct).sort((a, b) => a - b);
  const median = n % 2 ? r[(n - 1) / 2] : (r[n / 2 - 1] + r[n / 2]) / 2;
  const withSpy = events.filter((e) => e.spyPct != null);
  return {
    count: n,
    avgReturnPct: round(r.reduce((a, b) => a + b, 0) / n),
    medianReturnPct: round(median),
    hitRatePct: round((events.filter((e) => e.returnPct > 0).length / n) * 100, 1),
    avgSpyPct: withSpy.length ? round(withSpy.reduce((a, e) => a + e.spyPct, 0) / withSpy.length) : null,
    beatSpyPct: withSpy.length ? round((withSpy.filter((e) => e.returnPct > e.spyPct).length / withSpy.length) * 100, 1) : null,
  };
}

const started = Date.now();
const spy = load("SPY");
const spyByDay = new Map((spy || []).map((c) => [day(c.t), c.close]));

const events = { 3: [], 2: [] };
const series = new Map(); // symbol -> Map(day -> close), only for symbols with Strong Buy events
let scanned = 0;

for (const symbol of symbolsList()) {
  const candles = load(symbol);
  if (!candles || candles.length < MIN_HISTORY + HOLD + 1) continue;
  scanned++;
  let prev = null;
  for (let d = MIN_HISTORY - 1; d + HOLD < candles.length; d++) {
    let level = 0;
    try {
      level = buyLevel(analyze(candles.slice(0, d + 1)));
    } catch {
      level = 0;
    }
    if (prev !== null && level !== 0 && level !== prev) {
      const entry = candles[d], exit = candles[d + HOLD];
      const s0 = spyByDay.get(day(entry.t)), s1 = spyByDay.get(day(exit.t));
      const ev = {
        symbol,
        date: day(entry.t),
        exitDate: day(exit.t),
        entry: round(entry.close, 4),
        exit: round(exit.close, 4),
        returnPct: ((exit.close - entry.close) / entry.close) * 100,
        spyPct: s0 && s1 ? ((s1 - s0) / s0) * 100 : null,
      };
      events[level].push(ev);
      if (level === 3 && !series.has(symbol)) series.set(symbol, new Map(candles.map((c) => [day(c.t), c.close])));
    }
    prev = level;
  }
}

// ---- growth-of-$1,000 curve (see method at the top) ----
const curve = [];
const strong = events[3];
if (spy && spy.length && strong.length) {
  const days = spy.map((c) => day(c.t));
  const pos = new Map(days.map((d, i) => [d, i]));
  const first = strong.reduce((m, e) => (e.date < m ? e.date : m), strong[0].date);
  const last = strong.reduce((m, e) => (e.exitDate > m ? e.exitDate : m), strong[0].exitDate);
  const i0 = pos.get(first) ?? days.findIndex((d) => d >= first);
  let i1 = pos.get(last) ?? days.findLastIndex((d) => d <= last);
  if (i0 >= 0 && i1 > i0) {
    let value = 1000;
    const spy0 = spy[i0].close;
    curve.push({ t: days[i0], signals: 1000, spy: 1000 });
    for (let i = i0 + 1; i <= i1; i++) {
      const today = days[i], yday = days[i - 1];
      const rets = [];
      for (const e of strong) {
        // open from the close of e.date through the close of e.exitDate
        if (yday < e.date || today > e.exitDate) continue;
        const m = series.get(e.symbol);
        const a = m.get(yday), b = m.get(today);
        if (a && b) rets.push(b / a - 1);
      }
      if (rets.length) value *= 1 + rets.reduce((x, y) => x + y, 0) / rets.length;
      curve.push({ t: today, signals: round(value), spy: round((1000 * spy[i].close) / spy0) });
    }
  }
}

const all = [...events[3], ...events[2]];
const recent = [...strong]
  .sort((a, b) => (a.date === b.date ? a.symbol.localeCompare(b.symbol) : a.date < b.date ? 1 : -1))
  .slice(0, 8)
  .map((e) => ({ ...e, returnPct: round(e.returnPct), spyPct: round(e.spyPct) }));

const out = {
  updated: new Date().toISOString(),
  holdDays: HOLD,
  window: all.length
    ? { from: all.reduce((m, e) => (e.date < m ? e.date : m), all[0].date), to: all.reduce((m, e) => (e.exitDate > m ? e.exitDate : m), all[0].exitDate) }
    : { from: null, to: null },
  stocksScanned: scanned,
  strong: stats(events[3]),
  buy: stats(events[2]),
  curve,
  recent,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(
  `Track record: ${scanned} stocks, ${events[3].length} Strong Buy + ${events[2].length} Buy events ` +
    `(${out.window.from ?? "-"} to ${out.window.to ?? "-"}) in ${((Date.now() - started) / 1000).toFixed(1)}s`
);
console.log("Strong Buy:", JSON.stringify(out.strong));
console.log("Buy:       ", JSON.stringify(out.buy));

// Call of the Day: pure logic (no React). Dates are "YYYY-MM-DD" strings in
// New York market time. Candles are the app's { t (unix SECONDS), close } items;
// Yahoo stamps each daily bar at the 9:30am New York open, so its NY date is the
// trading day it belongs to.

const NY = "America/New_York";
const fmtParts = new Intl.DateTimeFormat("en-US", {
  timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

// NYSE full-day closures (early-close days still trade, so they're normal days here).
const HOLIDAYS = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
  "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

export const CALL_CUTOFF_MIN = 9 * 60 + 30; // calls close 9:30am NY
export const CLOSE_READY_MIN = 16 * 60 + 15; // the day's close is trusted from 4:15pm NY

// { date: "YYYY-MM-DD", minutes: minutes since NY midnight, h, m, s, offsetMs }
export function nyNow(now = new Date()) {
  const p = Object.fromEntries(fmtParts.formatToParts(now).map((x) => [x.type, x.value]));
  const h = Number(p.hour) % 24, m = Number(p.minute), s = Number(p.second);
  const date = `${p.year}-${p.month}-${p.day}`;
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, h, m, s);
  return { date, minutes: h * 60 + m, h, m, s, offsetMs: wall - Math.floor(now.getTime() / 1000) * 1000 };
}

// NY calendar date of a unix timestamp (seconds; milliseconds are detected too)
export function nyDateOf(t) {
  const ms = t > 1e12 ? t : t * 1000;
  return nyNow(new Date(ms)).date;
}

const toUTC = (d) => new Date(`${d}T12:00:00Z`);
const fromUTC = (x) => x.toISOString().slice(0, 10);
export function addDays(d, n) {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

export function isTradingDay(d) {
  const wd = toUTC(d).getUTCDay();
  return wd !== 0 && wd !== 6 && !HOLIDAYS.has(d);
}
export function nextTradingDay(d) {
  let x = addDays(d, 1);
  while (!isTradingDay(x)) x = addDays(x, 1);
  return x;
}
export function prevTradingDay(d) {
  let x = addDays(d, -1);
  while (!isTradingDay(x)) x = addDays(x, -1);
  return x;
}
// trading days after `from` up to and including `to` (0 when to <= from)
export function tradingDaysBetween(from, to) {
  let n = 0;
  for (let x = from; x < to && n < 5000; ) {
    x = nextTradingDay(x);
    if (x <= to) n++;
  }
  return n;
}

// The trading day whose call is open right now.
export function currentCallDay(now = new Date()) {
  const ny = nyNow(now);
  if (isTradingDay(ny.date) && ny.minutes < CALL_CUTOFF_MIN) return ny.date;
  return nextTradingDay(ny.date);
}

// Exact moment calls close for a day (9:30am NY on that date), as a Date.
export function callCutoff(day) {
  const guess = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 9, 30);
  // correct for the NY offset on that date (handles daylight saving)
  const off = nyNow(new Date(guess)).offsetMs;
  return new Date(guess - off);
}

// "Thu, Oct 22"
export function prettyDay(d, long = false) {
  return toUTC(d).toLocaleDateString("en-US", {
    timeZone: "UTC", weekday: long ? "long" : "short", month: "short", day: "numeric",
  });
}

// ---------- stock of the day ----------
export const CALL_STOCKS = [
  ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "Nvidia"], ["TSLA", "Tesla"], ["AMZN", "Amazon"],
  ["META", "Meta"], ["GOOGL", "Alphabet (Google)"], ["AMD", "AMD"], ["NFLX", "Netflix"], ["SPY", "S&P 500 fund"],
  ["QQQ", "Nasdaq 100 fund"], ["JPM", "JPMorgan Chase"], ["DIS", "Disney"], ["NKE", "Nike"], ["KO", "Coca-Cola"],
  ["COST", "Costco"], ["WMT", "Walmart"], ["V", "Visa"], ["MA", "Mastercard"], ["BAC", "Bank of America"],
  ["AVGO", "Broadcom"], ["ORCL", "Oracle"], ["CRM", "Salesforce"], ["ADBE", "Adobe"], ["INTC", "Intel"],
  ["PYPL", "PayPal"], ["UBER", "Uber"], ["SBUX", "Starbucks"], ["MCD", "McDonald's"], ["PEP", "PepsiCo"],
  ["XOM", "ExxonMobil"], ["BA", "Boeing"], ["PLTR", "Palantir"], ["COIN", "Coinbase"], ["SHOP", "Shopify"],
  ["LLY", "Eli Lilly"], ["UNH", "UnitedHealth"], ["HD", "Home Depot"], ["GS", "Goldman Sachs"], ["IWM", "Small-cap fund"],
];
const NAMES = Object.fromEntries(CALL_STOCKS);
export const stockName = (sym) => NAMES[sym] || sym;

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Each block of 40 trading days is a shuffled pass through the list, so a symbol
// never comes back within the block, and blocks are stitched so the last pick of
// one block never equals the first pick of the next.
const permCache = new Map();
function basePerm(c) {
  const rnd = seeded(0x51c4a1 ^ Math.imul(c + 7919, 2654435761));
  const p = CALL_STOCKS.map((_, i) => i);
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}
function perm(c) {
  if (permCache.has(c)) return permCache.get(c);
  const p = basePerm(c);
  const prevLast = basePerm(c - 1).at(-1); // a block's last item never moves
  if (p[0] === prevLast) [p[0], p[1]] = [p[1], p[0]];
  permCache.set(c, p);
  return p;
}
const ANCHOR = "2026-01-02"; // a trading day
const ordCache = new Map();
function tradingOrdinal(d) {
  if (ordCache.has(d)) return ordCache.get(d);
  const day = isTradingDay(d) ? d : nextTradingDay(d);
  const k = day >= ANCHOR ? tradingDaysBetween(ANCHOR, day) : -tradingDaysBetween(day, ANCHOR);
  ordCache.set(d, k);
  return k;
}
export function stockOfTheDay(d) {
  const k = tradingOrdinal(d);
  const N = CALL_STOCKS.length;
  const c = Math.floor(k / N);
  const pos = ((k % N) + N) % N;
  return CALL_STOCKS[perm(c)[pos]][0];
}

// ---------- results ----------
// { result: 'win'|'loss', ref_close, close } | { result: 'void', ref_close: null, close: null } | null
export function resolveCall(call, candles, now = new Date()) {
  if (!call || call.result) return null;
  const ny = nyNow(now);
  if (ny.date < call.day || (ny.date === call.day && ny.minutes < CLOSE_READY_MIN)) return null;
  if (!Array.isArray(candles) || !candles.length) return null;
  let dayBar = null, before = null;
  for (const c of candles) {
    if (c?.close == null || c.t == null) continue;
    const d = nyDateOf(c.t);
    if (d === call.day) dayBar = c;
    else if (d < call.day && (!before || c.t > before.c.t)) before = { c, d };
  }
  // reference = the last close before the call day (normally the previous trading day)
  const refOk = before && before.d >= addDays(prevTradingDay(call.day), -4);
  if (dayBar && refOk) {
    const ref = before.c.close, close = dayBar.close;
    const up = close > ref;
    return { result: (call.direction === "up") === up ? "win" : "loss", ref_close: round(ref), close: round(close) };
  }
  if (tradingDaysBetween(call.day, ny.date) > 3) return { result: "void", ref_close: null, close: null };
  return null;
}
const round = (x) => Math.round(Number(x) * 10000) / 10000;

// ---------- streaks + stats ----------
// Consecutive trading days with a call, ending at the most recent call, as long as
// that call is for the open call day or the trading day before it (else 0).
export function callStreak(calls, today = currentCallDay()) {
  const days = new Set((calls || []).map((c) => c.day));
  if (!days.size) return 0;
  let start = days.has(today) ? today : prevTradingDay(today);
  if (!days.has(start)) return 0;
  let n = 0;
  for (let d = start; days.has(d); d = prevTradingDay(d)) n++;
  return n;
}
export function bestStreak(calls) {
  const days = [...new Set((calls || []).map((c) => c.day))].sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev && nextTradingDay(prev) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
// { wins, losses, rate (0..1 or null) } — void calls don't count
export function winRate(calls) {
  const wins = (calls || []).filter((c) => c.result === "win").length;
  const losses = (calls || []).filter((c) => c.result === "loss").length;
  return { wins, losses, rate: wins + losses ? wins / (wins + losses) : null };
}

export const STREAK_MILESTONES = [3, 7, 14, 30];
export const XP_CALL = 10;
export const XP_WIN = 15;

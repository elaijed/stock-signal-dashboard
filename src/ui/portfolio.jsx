import { IconToken } from "./icons.jsx";
import React, { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { Info } from "./components.jsx";

const dayKey = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const money = (n, d = 2) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const signed = (n, suffix = "%") => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}${suffix}`;

// ---------------------------------------------------------------------------
// Portfolio performance vs the S&P 500 (SPY). Built from each holding's daily
// closes and its purchase date; daily returns are chained so adding a new
// position doesn't look like a gain. Closed trades aren't included.
const RANGES = { "1W": 5, "1M": 21, "3M": 63, All: Infinity };

export function PerformanceChart({ owned, stockData, benchCandles }) {
  const [range, setRange] = useState("1M");
  const result = useMemo(() => {
    if (!benchCandles?.length || !owned.length) return null;
    const closesBy = {};
    for (const it of owned) {
      const c = stockData[it.symbol]?.candles;
      if (!c?.length) return { loading: true };
      closesBy[it.symbol] = Object.fromEntries(c.map((x) => [dayKey(x.t), x.close]));
    }
    const days = benchCandles.map((c) => ({ day: dayKey(c.t), spy: c.close }));
    const firstBuy = owned.map((o) => o.purchaseDate || "1970-01-01").sort()[0];
    const startIdx = Math.max(1, days.findIndex((d) => d.day >= firstBuy));
    const last = {};
    const pts = [];
    let idx = 100, spyIdx = 100;
    for (let i = 0; i < days.length; i++) {
      const d = days[i].day;
      let prevVal = 0, curVal = 0;
      for (const it of owned) {
        const held = (it.purchaseDate || "1970-01-01") <= d;
        const close = closesBy[it.symbol][d] ?? last[it.symbol];
        if (close == null) continue;
        if (held && last[it.symbol] != null && (it.purchaseDate || "1970-01-01") < d) {
          prevVal += it.qty * last[it.symbol];
          curVal += it.qty * close;
        }
        last[it.symbol] = close;
      }
      if (i >= startIdx) {
        if (prevVal > 0) idx *= curVal / prevVal;
        spyIdx *= days[i].spy / days[i - 1].spy;
        pts.push({ day: d, you: idx, spy: spyIdx });
      }
    }
    return { pts };
  }, [owned, stockData, benchCandles]);

  if (!owned.length) return null;
  if (!result || result.loading)
    return <div className="mb-4 h-48 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />;
  const n = RANGES[range];
  const view = (Number.isFinite(n) ? result.pts.slice(-n - 1) : result.pts).filter(Boolean);
  if (view.length < 2)
    return (
      <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
        Your performance chart appears once you've held a stock for at least two trading days.
      </div>
    );
  const base = view[0];
  const data = view.map((p) => ({ day: p.day, you: (p.you / base.you - 1) * 100, spy: (p.spy / base.spy - 1) * 100 }));
  const you = data[data.length - 1].you;
  const spy = data[data.length - 1].spy;
  const diff = you - spy;
  const label = { "1W": "this week", "1M": "this month", "3M": "over 3 months", All: "since your first buy" }[range];

  return (
    <section className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Your performance vs the S&amp;P 500</div>
          <div className="mt-0.5 text-lg font-semibold text-zinc-100">
            {Math.abs(diff) < 0.05 ? (
              <>Matching the market {label}</>
            ) : diff > 0 ? (
              <>
                You're <span className="text-emerald-400">beating</span> the market by {Math.abs(diff).toFixed(1)}% {label}
              </>
            ) : (
              <>
                You're <span className="text-red-400">behind</span> the market by {Math.abs(diff).toFixed(1)}% {label}
              </>
            )}
          </div>
          <div className="text-xs text-zinc-500">
            You <span className={you >= 0 ? "text-emerald-400" : "text-red-400"}>{signed(you)}</span> · S&amp;P 500{" "}
            <span className={spy >= 0 ? "text-emerald-400" : "text-red-400"}>{signed(spy)}</span>
          </div>
        </div>
        <div className="flex gap-0.5 rounded-md bg-zinc-800/60 p-0.5">
          {Object.keys(RANGES).map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={`rounded px-2 py-0.5 text-xs font-medium ${range === k ? "bg-zinc-600 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(127,127,127,0.12)" vertical={false} />
            <XAxis dataKey="day" hide />
            <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} width={38} tick={{ fontSize: 10, fill: "#8a8278" }} axisLine={false} tickLine={false} />
            <ReferenceLine y={0} stroke="rgba(127,127,127,0.35)" />
            <Tooltip
              formatter={(v, k) => [signed(v), k === "you" ? "You" : "S&P 500"]}
              labelFormatter={(d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              contentStyle={{ background: "var(--color-zinc-900)", border: "1px solid var(--color-zinc-700)", color: "var(--color-zinc-100)", borderRadius: 8, fontSize: 12 }}
            />
            <Line type="monotone" dataKey="spy" stroke="#8a8278" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="you" stroke="#ff5b2e" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex gap-4 text-[11px] text-zinc-500">
        <span>
          <span className="text-[#ff5b2e]">━</span> Your stocks
        </span>
        <span>
          <span className="text-zinc-400">┅</span> S&amp;P 500 (SPY)
        </span>
        <span className="ml-auto">Open positions only, weighted by what you hold</span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "Today" strip: one line of what matters right now.
function marketStatus() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();
  const open = day >= 1 && day <= 5 && mins >= 570 && mins < 960;
  return open ? "Market open" : "Market closed";
}

export function TodayStrip({ ownedStats, alerts, breached, incoming, unread, onNav }) {
  const priced = ownedStats.filter((s) => s.data?.quote && s.item.qty);
  const dayUsd = priced.reduce((sum, s) => sum + s.item.qty * (s.data.quote.d || 0), 0);
  const prevVal = priced.reduce((sum, s) => sum + s.item.qty * (s.data.quote.c - (s.data.quote.d || 0)), 0);
  const dayPct = prevVal > 0 ? (dayUsd / prevVal) * 100 : null;
  const firedToday = alerts.filter((a) => a.triggeredAt && Date.now() - a.triggeredAt < 86_400_000);
  const chips = [];
  if (dayPct != null)
    chips.push({
      key: "pf",
      text: `Portfolio ${signed(dayPct)} today (${dayUsd >= 0 ? "+" : "−"}${money(dayUsd, 0)})`,
      tone: dayUsd >= 0 ? "text-emerald-300" : "text-red-300",
      go: "owned",
    });
  if (firedToday.length)
    chips.push({ key: "al", text: `${firedToday.length} alert${firedToday.length === 1 ? "" : "s"} hit (${firedToday.map((a) => a.symbol).join(", ")})`, tone: "text-amber-300", go: "watchlist" });
  if (breached) chips.push({ key: "br", text: `${breached} position${breached === 1 ? "" : "s"} below the safety line`, tone: "text-red-300", go: "owned" });
  if (incoming) chips.push({ key: "rq", text: `${incoming} new request${incoming === 1 ? "" : "s"}`, tone: "text-blue-300", go: "social:requests" });
  else if (unread) chips.push({ key: "nt", text: `${unread} new notification${unread === 1 ? "" : "s"}`, tone: "text-blue-300", go: "social:feed" });

  return (
    <div className="mb-4 flex items-center gap-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs">
      <span className="shrink-0 font-semibold uppercase tracking-wider text-zinc-500">Today</span>
      {chips.length ? (
        chips.map((c) => (
          <button key={c.key} onClick={() => onNav(c.go)} className={`shrink-0 whitespace-nowrap rounded-full bg-zinc-800/80 px-2.5 py-1 font-medium ${c.tone} hover:bg-zinc-800`}>
            {c.text}
          </button>
        ))
      ) : (
        <span className="text-zinc-400">All quiet today.</span>
      )}
      <span className="ml-auto shrink-0 whitespace-nowrap pl-2 text-zinc-500">
        <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${marketStatus() === "Market open" ? "bg-emerald-500" : "bg-zinc-600"}`} />
        {marketStatus()}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Since yesterday" digest. Today's signal labels are snapshotted per device
// per day; the first visit on a new day compares against the previous snapshot.
export function useDigest(uid, labels, ready) {
  return useMemo(() => {
    if (!ready || !uid) return { changes: [] };
    const key = `ssd_digest_${uid}`;
    const today = new Date().toISOString().slice(0, 10);
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(key) || "null");
    } catch (_) {}
    const prev = stored ? (stored.day === today ? stored.prev || {} : stored.labels || {}) : {};
    const merged = { ...(stored?.day === today ? stored.labels : {}), ...labels };
    try {
      localStorage.setItem(key, JSON.stringify({ day: today, labels: merged, prev }));
    } catch (_) {}
    const changes = Object.keys(labels)
      .filter((s) => prev[s] && prev[s] !== labels[s])
      .map((s) => ({ symbol: s, from: prev[s], to: labels[s] }));
    return { changes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, ready, JSON.stringify(labels)]);
}

const upish = (l) => /Bullish/.test(l);
const downish = (l) => /Bearish/.test(l);

export function DigestCard({ changes, ownedStats, stockInfo, symbols, onOpenStock }) {
  const items = [];
  for (const c of changes) {
    const better = (upish(c.to) && !upish(c.from)) || (downish(c.from) && !downish(c.to));
    items.push({ key: `sig-${c.symbol}`, icon: better ? "up" : "down", symbol: c.symbol, text: `signal changed from ${c.from} to ${c.to}` });
  }
  for (const s of ownedStats) {
    if (s.risk?.breachedStop) items.push({ key: `s-${s.item.symbol}`, icon: "warn", symbol: s.item.symbol, text: `is below your safety line (${money(s.risk.stop)})` });
    else if (s.risk?.hitTarget) items.push({ key: `t-${s.item.symbol}`, icon: "target", symbol: s.item.symbol, text: `is at your target (${money(s.risk.target)})` });
  }
  for (const sym of symbols) {
    const e = stockInfo[sym]?.earnings?.date;
    if (!e) continue;
    const days = Math.round((new Date(e.slice(0, 10) + "T00:00:00") - new Date(new Date().toDateString())) / 86_400_000);
    if (days >= 0 && days <= 2) items.push({ key: `e-${sym}`, icon: "calendar", symbol: sym, text: `reports earnings ${days === 0 ? "today" : days === 1 ? "tomorrow" : "in 2 days"}` });
  }
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Since yesterday</div>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.slice(0, 8).map((i) => (
            <li key={i.key} className="text-sm text-zinc-300">
              <span className="mr-1.5 text-zinc-500"><IconToken name={i.icon} size={14} /></span>
              <button onClick={() => onOpenStock(i.symbol)} className="font-semibold text-zinc-100 hover:text-blue-300">
                {i.symbol}
              </button>{" "}
              {i.text}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-zinc-500">Nothing new since yesterday — no signal changes, targets or earnings coming up.</div>
      )}
    </section>
  );
}

export function EarningsList({ symbols, stockInfo, onOpenStock }) {
  const rows = symbols
    .map((s) => ({ s, d: stockInfo[s]?.earnings?.date }))
    .filter((r) => r.d)
    .map((r) => ({ ...r, days: Math.round((new Date(r.d.slice(0, 10) + "T00:00:00") - new Date(new Date().toDateString())) / 86_400_000) }))
    .filter((r) => r.days >= 0 && r.days <= 45)
    .sort((a, b) => a.days - b.days);
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Upcoming earnings</div>
      {rows.length ? (
        <ul className="space-y-1">
          {rows.slice(0, 8).map((r) => (
            <li key={r.s} className="flex items-center justify-between text-sm">
              <button onClick={() => onOpenStock(r.s)} className="font-semibold text-zinc-100 hover:text-blue-300">
                {r.s}
              </button>
              <span className={r.days <= 7 ? "text-amber-300" : "text-zinc-400"}>
                {new Date(r.d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                <span className="ml-1.5 text-xs text-zinc-500">({r.days === 0 ? "today" : r.days === 1 ? "tomorrow" : `in ${r.days} days`})</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-zinc-500">No earnings dates in the next 45 days for your stocks (dates load as you browse).</div>
      )}
    </section>
  );
}

export function DividendsCard({ ownedStats, stockInfo }) {
  const rows = ownedStats
    .map((s) => {
      const m = stockInfo[s.item.symbol]?.metric;
      const y = m?.dividendYieldIndicatedAnnual ?? m?.currentDividendYieldTTM;
      return { symbol: s.item.symbol, yield: y, income: y && s.value ? (s.value * y) / 100 : 0 };
    })
    .filter((r) => r.yield > 0)
    .sort((a, b) => b.income - a.income);
  const total = rows.reduce((a, r) => a + r.income, 0);
  const pfValue = ownedStats.reduce((a, s) => a + (s.value || 0), 0);
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        Dividends
        <Info term="dividend" />
      </div>
      {rows.length ? (
        <>
          <div className="text-lg font-semibold text-zinc-100">
            ≈ {money(total)} <span className="text-sm font-normal text-zinc-400">per year</span>
          </div>
          <div className="mb-2 text-xs text-zinc-500">
            About {money(total / 12)} a month · {pfValue ? ((total / pfValue) * 100).toFixed(2) : "0"}% yield on your portfolio
          </div>
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.symbol} className="flex justify-between text-sm text-zinc-300">
                <span className="font-semibold text-zinc-100">{r.symbol}</span>
                <span>
                  {money(r.income)}/yr <span className="text-xs text-zinc-500">({r.yield.toFixed(2)}%)</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[11px] text-zinc-600">Estimated from each stock's current yearly dividend. Exact payout dates aren't in the free data.</div>
        </>
      ) : (
        <div className="text-sm text-zinc-500">None of your stocks pay a dividend (or the data is still loading).</div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// First-time welcome
export function Welcome({ hasKey, onAdd, onOpenSettings, busy }) {
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-blue-900/60 bg-gradient-to-br from-blue-950/50 via-zinc-900 to-zinc-900 p-5">
      <h2 className="text-xl font-bold text-zinc-50">Welcome to Signals</h2>
      <p className="mt-1 max-w-2xl text-sm text-zinc-300">
        This app reads a stock's trend and momentum and tells you, in plain words, whether it looks like a good time to buy, wait or avoid — and
        why.
      </p>
      {!hasKey ? (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="font-semibold text-zinc-100">First, connect free market data (1 minute)</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-300">
            <li>
              Create a free key at{" "}
              <a href="https://finnhub.io/register" target="_blank" rel="noreferrer" className="text-blue-400 underline">
                finnhub.io
              </a>
              .
            </li>
            <li>Copy the key from your Finnhub dashboard and paste it here.</li>
          </ol>
          <button onClick={onOpenSettings} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
            Paste my key
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              ["plus", "Add stocks", "Add stocks you're curious about — or tap one below."],
              ["help", "Tap “Why?”", "Every signal explains itself with real numbers."],
              ["users", "Go social", "Follow friends' portfolios, notes and polls."],
            ].map(([i, t, d]) => (
              <div key={t} className="rounded-xl bg-zinc-950/40 p-3">
                <div className="mb-1 text-blue-500"><IconToken name={i} size={20} /></div>
                <div className="text-sm font-semibold text-zinc-100">{t}</div>
                <div className="text-xs text-zinc-400">{d}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Start with:</span>
            {[
              ["AAPL", "Apple"],
              ["SPY", "S&P 500"],
              ["NVDA", "Nvidia"],
              ["MSFT", "Microsoft"],
            ].map(([s, n]) => (
              <button
                key={s}
                disabled={busy}
                onClick={() => onAdd(s)}
                className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:border-blue-500 hover:text-blue-300 disabled:opacity-40"
              >
                + {s} <span className="text-xs text-zinc-500">{n}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

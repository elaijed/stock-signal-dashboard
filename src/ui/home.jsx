import React, { useEffect, useMemo, useState } from "react";
import Avatar from "../social/Avatar.jsx";
import Feed, { timeAgoShort } from "../social/Feed.jsx";
import { acceptRequestFrom, removeConnectionWith, leaderboard, getBadges, postActivity } from "../social/api.js";
import { DigestCard, EarningsList } from "./portfolio.jsx";
import { GLOSSARY, pickReason } from "./explain.js";

const money = (n) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;

// Short lessons for the Learn card (plain English, no jargon)
export const LESSONS = [
  { title: "What is a stock?", text: "A share is a tiny piece of a company. If the company grows and earns more, the share usually becomes worth more — and some companies also pay you part of their profit (a dividend)." },
  { title: "Trend: your best friend", text: "We compare the 20-day and 50-day average prices. When the short one is above the long one, the stock has been rising for weeks. Buying with the trend is usually safer than fighting it." },
  { title: "What is RSI?", text: GLOSSARY.rsi },
  { title: "Why use a safety line (stop-loss)?", text: "Decide in advance the price where you'd sell if things go wrong. It keeps one bad pick from turning into a big loss. Our safety lines are based on how much each stock normally moves." },
  { title: "Don't put all eggs in one basket", text: "If more than ~40% of your money is in one stock or one sector, a single bad day can hurt a lot. Spreading across 5–10 stocks and sectors smooths the ride." },
  { title: "Reward vs risk", text: GLOSSARY.rr },
  { title: "What is P/E?", text: GLOSSARY.pe },
  { title: "Earnings day", text: "Four times a year companies report profits. Prices can jump or drop 5–10% in a day, so be aware before buying right before earnings." },
  { title: "Index funds", text: "An index fund like SPY holds all 500 big US companies at once. It's the simplest way to own 'the market' — and many professionals don't beat it." },
  { title: "Time beats timing", text: "Trying to buy at the exact bottom is nearly impossible. Regular investing over years has historically mattered more than perfect timing." },
];

function Card({ title, action, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Learn({ onGlossary }) {
  const day = Math.floor(Date.now() / 86_400_000);
  const [i, setI] = useState(day % LESSONS.length);
  const l = LESSONS[i];
  return (
    <Card
      title="Learn · tip of the day"
      action={
        <button onClick={() => setI((i + 1) % LESSONS.length)} className="text-xs text-blue-400 hover:underline">
          Next tip →
        </button>
      }
    >
      <div className="text-base font-semibold text-zinc-100">{l.title}</div>
      <p className="mt-1 text-sm leading-relaxed text-zinc-300">{l.text}</p>
      <button onClick={onGlossary} className="mt-2 text-xs font-medium text-blue-400 hover:underline">
        Open the full glossary →
      </button>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {LESSONS.map((x, j) => (
          <button
            key={x.title}
            onClick={() => setI(j)}
            className={`rounded-full px-2.5 py-1 text-[11px] ${j === i ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
          >
            {x.title}
          </button>
        ))}
      </div>
    </Card>
  );
}

function notifText(n) {
  const d = n.data || {};
  const sym = d.symbol ? ` on ${d.symbol}` : "";
  return (
    {
      request: "wants to connect",
      accepted: "accepted your request",
      joined: "joined with your invite link ",
      reaction: `reacted ${d.emoji || ""} to your post${sym}`,
      comment: `commented${sym}: “${d.body || ""}”`,
      reply: `also commented${sym}`,
      vote: `voted on your poll${sym}`,
      group_add: `added you to the group “${d.name || "a group"}”`,
      share: `shared ${d.symbol || "a stock"} with you${d.note ? `: “${d.note}”` : ""}`,
      group_post: `posted in “${d.name || "your group"}”: “${d.body || ""}”`,
    }[n.kind] || n.kind
  );
}

export default function Home({
  uid, name, ownedStats, benchCandles, alerts, notifs, onRefreshNotifs, digest, stockInfo, symbols,
  pickCache, watchlist, onOpenStock, onOpenProfile, onGo, onGoSocial, onAdd, onNotification,
  steps, onDismissSteps, stockData, ensureSymbols, quoteOf, getQuote, onToast,
}) {
  // snapshot
  const priced = ownedStats.filter((s) => s.value != null);
  const value = priced.reduce((a, s) => a + s.value, 0);
  const cost = priced.reduce((a, s) => a + s.cost, 0);
  const total = value - cost;
  const totalPct = cost > 0 ? (total / cost) * 100 : 0;
  const withQ = ownedStats.filter((s) => s.data?.quote && s.item.qty);
  const dayUsd = withQ.reduce((a, s) => a + s.item.qty * (s.data.quote.d || 0), 0);
  const prev = withQ.reduce((a, s) => a + s.item.qty * (s.data.quote.c - (s.data.quote.d || 0)), 0);
  const dayPct = prev > 0 ? (dayUsd / prev) * 100 : null;
  const spyDay = benchCandles?.length > 1 ? (benchCandles.at(-1).close / benchCandles.at(-2).close - 1) * 100 : null;

  const firedAlerts = alerts.filter((a) => a.triggeredAt && Date.now() - a.triggeredAt < 3 * 86_400_000);
  const requests = notifs.filter((n) => n.kind === "request" && !n.handled);
  const others = notifs.filter((n) => n.kind !== "request").slice(0, 6);
  const inList = new Set(watchlist.map((w) => w.symbol));
  const picks = (pickCache?.ranked || []).filter((p) => !inList.has(p.symbol)).slice(0, 3);
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  async function respond(n, accept) {
    try {
      if (accept) await acceptRequestFrom(n.actor.id, uid);
      else await removeConnectionWith(uid, n.actor.id);
    } catch (_) {}
    onRefreshNotifs();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">
          {hello}
          {name ? `, ${name.split(" ")[0]}` : ""} 
        </h1>
        <p className="text-sm text-zinc-500">Here's what matters today.</p>
      </div>

      {steps && <GettingStarted steps={steps} onDismiss={onDismissSteps} />}

      {/* snapshot */}
      <button onClick={() => onGo("owned")} className="block w-full text-left">
        <section className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-gradient-to-br from-blue-950/40 to-zinc-900 p-4 sm:grid-cols-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Portfolio</div>
            <div className="text-xl font-bold tabular-nums text-zinc-50">{priced.length ? money(value) : "—"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Today</div>
            <div className={`text-xl font-bold tabular-nums ${dayUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>{dayPct != null ? signed(dayPct) : "—"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Total gain</div>
            <div className={`text-xl font-bold tabular-nums ${total >= 0 ? "text-emerald-400" : "text-red-400"}`}>{priced.length ? signed(totalPct) : "—"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">S&amp;P 500 today</div>
            <div className={`text-xl font-bold tabular-nums ${spyDay >= 0 ? "text-emerald-400" : "text-red-400"}`}>{spyDay != null ? signed(spyDay) : "—"}</div>
          </div>
          {!priced.length && <div className="col-span-full text-xs text-zinc-500">Buy a stock in My Stocks to see your portfolio here.</div>}
        </section>
      </button>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {/* needs attention */}
          <DigestCard changes={digest.changes} ownedStats={ownedStats} stockInfo={stockInfo} symbols={symbols} onOpenStock={onOpenStock} />
          {firedAlerts.length > 0 && (
            <Card title="Price alerts hit">
              <ul className="space-y-1 text-sm text-zinc-300">
                {firedAlerts.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => onOpenStock(a.symbol)} className="font-semibold text-zinc-100 hover:text-blue-300">{a.symbol}</button> went {a.dir} ${a.price}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <EarningsList symbols={symbols} stockInfo={stockInfo} onOpenStock={onOpenStock} />
          <Learn onGlossary={() => onGo("learn")} />
        </div>

        <div className="space-y-4">
          <WeeklyRecap uid={uid} ownedStats={ownedStats} watchlist={watchlist} stockData={stockData} benchCandles={benchCandles} ensureSymbols={ensureSymbols} onShared={onToast} />
          {/* notifications */}
          <Card
            title="Notifications"
            action={
              <button onClick={() => onGoSocial("feed")} className="text-xs text-blue-400 hover:underline">
                Open Social →
              </button>
            }
          >
            {!requests.length && !others.length ? (
              <div className="text-sm text-zinc-500">Nothing new.</div>
            ) : (
              <ul className="space-y-2">
                {requests.map((n) => (
                  <li key={n.id} className="flex items-center gap-2">
                    <Avatar url={n.actor?.avatar_url} name={n.actor?.full_name} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                      <span className="font-semibold text-zinc-100">{n.actor?.full_name}</span> wants to connect
                    </span>
                    <button onClick={() => respond(n, true)} className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500">
                      Accept
                    </button>
                    <button onClick={() => respond(n, false)} className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
                      Decline
                    </button>
                  </li>
                ))}
                {others.map((n) => (
                  <li key={n.id}>
                    <button onClick={() => onNotification(n)} className="flex w-full items-start gap-2 text-left">
                      <Avatar url={n.actor?.avatar_url} name={n.actor?.full_name} size="xs" />
                      <span className="min-w-0 flex-1 text-sm text-zinc-300">
                        <span className="font-semibold text-zinc-100">{n.actor?.full_name || "Someone"}</span> {notifText(n)}
                        <span className="ml-1.5 text-[11px] text-zinc-600">{timeAgoShort(n.created_at)}</span>
                      </span>
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* top picks */}
          <Card
            title="Today's top picks"
            action={
              <button onClick={() => onGo("recommendations")} className="text-xs text-blue-400 hover:underline">
                See all →
              </button>
            }
          >
            {picks.length ? (
              <ul className="divide-y divide-zinc-800">
                {picks.map((p) => (
                  <li key={p.symbol} className="flex items-center gap-3 py-2">
                    <button onClick={() => onOpenStock(p.symbol)} className="w-14 text-left font-semibold text-zinc-100 hover:text-blue-300">{p.symbol}</button>
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{pickReason(p) || `Score ${p.score}`}</span>
                    <button onClick={() => onAdd(p.symbol)} className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-blue-600 hover:text-blue-300">
                      + Watch
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-zinc-500">Today's picks are being prepared — check Top Picks in a minute.</div>
            )}
          </Card>

          {/* friends */}
          <Card
            title="From your friends"
            action={
              <button onClick={() => onGoSocial("feed")} className="text-xs text-blue-400 hover:underline">
                See all →
              </button>
            }
          >
            <Feed uid={uid} limit={3} showComposer={false} onOpenStock={onOpenStock} onOpenProfile={onOpenProfile} quoteOf={quoteOf} getQuote={getQuote} ensureSymbols={ensureSymbols}
              emptyText="When your friends buy, sell or post, it shows up here." />
          </Card>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Glossary page: every term + every lesson, searchable
const TERM_TITLES = {
  rsi: "RSI (momentum score)", macd: "MACD (momentum turn)", sma: "Moving average", trend: "Trend (20-day vs 50-day)",
  support: "Support", resistance: "Resistance", stop: "Stop-loss / safety line", target: "Target price", rr: "Reward-to-risk",
  pe: "P/E ratio", dividend: "Dividend yield", range52: "52-week range", unrealized: "Unrealized profit/loss",
  realized: "Realized (locked-in) profit/loss", confidence: "Confidence & the 3 dots", volume: "Volume", backtest: "Backtest", score: "Pick score",
};
export function GlossaryPage() {
  const [q, setQ] = useState("");
  const items = [
    ...Object.entries(GLOSSARY).map(([k, text]) => ({ title: TERM_TITLES[k] || k, text, kind: "Term" })),
    ...LESSONS.map((l) => ({ title: l.title, text: l.text, kind: "Lesson" })),
  ].filter((i) => !q.trim() || (i.title + " " + i.text).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h1 className="text-2xl font-bold text-zinc-50">Learn & glossary</h1>
      <p className="text-sm text-zinc-400">Every term the app uses, in plain English — plus short lessons for beginners.</p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a term (e.g. RSI, stop-loss, dividend)"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-blue-500"
      />
      {items.map((i) => (
        <div key={i.kind + i.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-zinc-100">{i.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${i.kind === "Lesson" ? "bg-blue-900/50 text-blue-300" : "bg-zinc-800 text-zinc-400"}`}>{i.kind}</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">{i.text}</p>
        </div>
      ))}
      {!items.length && <div className="text-sm text-zinc-500">Nothing matches “{q}”.</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guided first week: 5 steps with checkmarks
export function GettingStarted({ steps, onDismiss }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section className="rounded-2xl border border-emerald-900/60 bg-gradient-to-br from-emerald-950/40 to-zinc-900 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-100">Your first week — {done} of {steps.length} done</h2>
        <button onClick={onDismiss} className="text-xs text-zinc-500 hover:text-zinc-300">Hide</button>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-emerald-600 text-white" : "border border-zinc-600 text-zinc-400"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            <span className={`flex-1 text-sm ${s.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{s.label}</span>
            {!s.done && (
              <button onClick={s.go} className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700">
                {s.cta} →
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Weekly recap: your week, best/worst pick, vs S&P, friends beaten, streak
function weekAgoClose(candles) {
  if (!candles?.length) return null;
  const cutoff = Date.now() / 1000 - 7 * 86400;
  let c = null;
  for (const x of candles) if (x.t <= cutoff) c = x.close;
  return c;
}
export function WeeklyRecap({ uid, ownedStats, watchlist, stockData, benchCandles, ensureSymbols, onShared }) {
  const [board, setBoard] = useState(null);
  const [streak, setStreak] = useState(null);
  const [posted, setPosted] = useState(false);
  useEffect(() => {
    leaderboard().then(setBoard).catch(() => setBoard([]));
    getBadges(uid).then((b) => setStreak(b?.streak ?? 0)).catch(() => {});
  }, [uid]);
  const friendSyms = (board || []).filter((r) => !r.me).flatMap((r) => r.positions.map((p) => p.symbol)).slice(0, 20);
  const key = [...new Set(friendSyms)].join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    ensureSymbols(key.split(","), () => alive);
    return () => {
      alive = false;
    };
  }, [key, ensureSymbols]);

  const price = (s) => stockData[s]?.quote?.c ?? stockData[s]?.candles?.at(-1)?.close ?? null;
  const wk = (s) => {
    const p = price(s), c = weekAgoClose(stockData[s]?.candles);
    return p != null && c ? (p / c - 1) * 100 : null;
  };
  const r = useMemo(() => {
    let now = 0, then = 0;
    for (const st of ownedStats) {
      const p = price(st.item.symbol), c = weekAgoClose(st.data?.candles);
      if (p != null && c) {
        now += st.item.qty * p;
        then += st.item.qty * c;
      }
    }
    const mine = then > 0 ? (now / then - 1) * 100 : null;
    const moves = watchlist.map((w) => ({ s: w.symbol, m: wk(w.symbol) })).filter((x) => x.m != null).sort((a, b) => b.m - a.m);
    const spyC = weekAgoClose(benchCandles), spyP = benchCandles?.at(-1)?.close;
    const spy = spyC && spyP ? (spyP / spyC - 1) * 100 : null;
    const friends = (board || []).filter((b) => !b.me).map((b) => {
      let x = 0, w = 0;
      for (const p of b.positions) {
        const m = wk(p.symbol);
        if (m != null) {
          x += p.weight * m;
          w += p.weight;
        }
      }
      return w > 0 ? x / w : null;
    }).filter((x) => x != null);
    const beat = mine != null ? friends.filter((f) => mine > f).length : 0;
    return { mine, best: moves[0], worst: moves.length > 1 ? moves.at(-1) : null, spy, beat, friends: friends.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedStats, watchlist, stockData, benchCandles, board]);

  const line = [
    r.mine != null ? `My week: ${signed(r.mine)}` : null,
    r.best ? `best pick ${r.best.s} (${signed(r.best.m)})` : null,
    r.spy != null ? `S&P 500 ${signed(r.spy)}` : null,
    r.friends ? `beat ${r.beat} of ${r.friends} friends` : null,
    streak ? `${streak}-week streak` : null,
  ].filter(Boolean).join(" · ");

  async function share() {
    const text = `${line} — on Stock Signals`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        onShared?.("Recap copied — paste it anywhere");
      }
    } catch (_) {}
  }
  async function postIt() {
    try {
      await postActivity(uid, "note", null, {}, `${line}`);
      setPosted(true);
      onShared?.("Posted to your friends' feed");
    } catch (_) {}
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-violet-950/30 to-zinc-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Your week</h2>
        {streak ? <span className="rounded-full bg-amber-900/40 px-2.5 py-0.5 text-xs font-semibold text-amber-300">{streak}-week streak</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-[11px] text-zinc-500">Your portfolio</div>
          <div className={`text-lg font-bold tabular-nums ${r.mine == null ? "text-zinc-500" : r.mine >= 0 ? "text-emerald-400" : "text-red-400"}`}>{r.mine == null ? "—" : signed(r.mine)}</div>
        </div>
        <div>
          <div className="text-[11px] text-zinc-500">S&amp;P 500</div>
          <div className={`text-lg font-bold tabular-nums ${r.spy == null ? "text-zinc-500" : r.spy >= 0 ? "text-emerald-400" : "text-red-400"}`}>{r.spy == null ? "—" : signed(r.spy)}</div>
        </div>
        <div>
          <div className="text-[11px] text-zinc-500">Best pick</div>
          <div className="text-lg font-bold text-zinc-100">{r.best ? <>{r.best.s} <span className="text-sm text-emerald-400">{signed(r.best.m)}</span></> : "—"}</div>
        </div>
        <div>
          <div className="text-[11px] text-zinc-500">Friends you beat</div>
          <div className="text-lg font-bold text-zinc-100">{r.friends ? `${r.beat} of ${r.friends}` : "—"}</div>
        </div>
      </div>
      {r.worst && r.worst.m < 0 && <div className="mt-2 text-xs text-zinc-500">Toughest: {r.worst.s} {signed(r.worst.m)}</div>}
      {line && (
        <div className="mt-3 flex gap-2">
          <button onClick={share} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800">↗ Share</button>
          <button onClick={postIt} disabled={posted} className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
            {posted ? "✓ Posted" : "Post to my feed"}
          </button>
        </div>
      )}
      <div className="mt-2 text-[11px] text-zinc-600">Streak = weeks in a row you opened the app or made a move.</div>
    </section>
  );
}

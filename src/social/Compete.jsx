// Compete: the monthly pick challenge as a hero, then leaderboards for the challenge,
// practice money, Call of the Day, XP levels and friends' real portfolios.
// Data: challenge_board / practice_leaderboard / leaderboard (002, 004) and game_board (007).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Avatar from "./Avatar.jsx";
import { Ic } from "../ui/icons.jsx";
import { Burst, GameStyles, store } from "../game/fx.jsx";
import { levelFor } from "../game/levels.js";
import { Sheet, Skeleton, EmptyState, TickerMono, btn, inputCls, firstName, signedPct, money, friendly, isMissingFn, useSocial } from "./ui.jsx";
import { leaderboard, challengeBoard, enterChallenge, postActivity, updateMyProfile, practiceLeaderboard, gameBoard } from "./api.js";

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthName = (d = new Date()) => d.toLocaleDateString("en-US", { month: "long" });
const tone = (n) => (n == null ? "text-zinc-500" : n >= 0 ? "text-emerald-500" : "text-red-500");
const pct = (n, d = 2) => (n == null ? "…" : signedPct(n, d));
const today = () => new Date().toISOString().slice(0, 10);

function prevMonths(n) {
  const out = [];
  const d = new Date();
  for (let i = 1; i <= n; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: monthKey(m), name: monthName(m), end: new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime() / 1000 });
  }
  return out;
}

function useCountdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const d = new Date(now);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  const left = Math.max(0, end - now);
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  return { days, hours, label: days > 0 ? `${days}d ${hours}h left` : `${hours}h left` };
}

function useLivePrices(symbols, ensureSymbols, quoteOf) {
  const key = [...new Set(symbols)].sort().join(",");
  useEffect(() => {
    if (!key || !ensureSymbols) return;
    let alive = true;
    ensureSymbols(key.split(","), () => alive);
    return () => {
      alive = false;
    };
  }, [key, ensureSymbols]);
  return useCallback((s) => quoteOf?.(s)?.quote?.c ?? null, [quoteOf]);
}

// remembers yesterday's ranks per board so rows can show ▲ / ▼
function useRankMoves(board, uid, ranked) {
  const ids = ranked.map((r) => r.user?.id).join(",");
  return useMemo(() => {
    if (!uid || !ranked.length || ranked.some((r) => r.value == null)) return {};
    const key = `sg.ranks.${board}.${uid}`;
    const saved = store.get(key, null);
    const cur = Object.fromEntries(ranked.map((r, i) => [r.user?.id, i + 1]));
    let prev = {};
    if (!saved || saved.day !== today()) {
      prev = saved?.ranks || {};
      store.set(key, { day: today(), ranks: cur, prev });
    } else prev = saved.prev || {};
    const moves = {};
    for (const [id, r] of Object.entries(cur)) if (prev[id]) moves[id] = prev[id] - r;
    return moves;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, uid, ids, ranked.every((r) => r.value != null)]);
}

// ---------- shared board pieces ----------
function Move({ n }) {
  if (!n) return <span className="w-6" />;
  return (
    <span className={`inline-flex w-6 items-center justify-center text-[11px] font-bold ${n > 0 ? "text-emerald-500" : "text-red-500"}`} title={n > 0 ? `Up ${n} since yesterday` : `Down ${-n} since yesterday`}>
      <Ic name={n > 0 ? "arrowUp" : "arrowDown"} size={11} />
      {Math.abs(n)}
    </span>
  );
}

function Flair({ r }) {
  return (
    <>
      {r.founding && <Ic name="crown" size={12} className="shrink-0 text-amber-500" />}
      {r.streak > 1 && (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-blue-500" title={`${r.streak}-week streak`}>
          <Ic name="flame" size={12} fill="currentColor" />
          {r.streak}
        </span>
      )}
    </>
  );
}

const PODIUM_H = { 1: "h-24", 2: "h-16", 3: "h-12" };
function Podium({ rows, fmt, onOpenProfile }) {
  const order = [rows[1], rows[0], rows[2]];
  const place = [2, 1, 3];
  return (
    <div className="flex items-end justify-center gap-2 px-2 pt-4 sm:gap-4">
      {order.map((r, i) =>
        r ? (
          <button key={r.user?.id || i} onClick={() => !r.me && onOpenProfile?.(r.user?.id)} className="flex w-1/3 max-w-[9rem] flex-col items-center">
            <div className="relative">
              {place[i] === 1 && <Ic name="crown" size={22} className="absolute -top-6 left-1/2 -translate-x-1/2 text-amber-400" fill="currentColor" />}
              <Avatar url={r.user?.avatar_url} name={r.user?.full_name} size={place[i] === 1 ? "md" : "sm"}
                className={place[i] === 1 ? "!ring-amber-400" : r.me ? "!ring-blue-500" : ""} />
            </div>
            <div className={`mt-1.5 w-full truncate text-center text-sm font-semibold ${r.me ? "text-blue-500" : "text-zinc-100"}`}>{r.me ? "You" : firstName(r.user?.full_name)}</div>
            <div className={`text-sm font-bold tabular-nums ${r.tone || "text-zinc-300"}`}>{fmt(r)}</div>
            <div className={`mt-1.5 flex w-full items-start justify-center rounded-t-xl pt-1.5 font-display text-xl font-bold ${PODIUM_H[place[i]]} ${
              place[i] === 1 ? "bg-amber-400/25 text-amber-400" : place[i] === 2 ? "bg-zinc-700/60 text-zinc-300" : "bg-amber-700/20 text-amber-600"
            }`}>{place[i]}</div>
          </button>
        ) : (
          <div key={i} className="w-1/3 max-w-[9rem]" />
        )
      )}
    </div>
  );
}

function Rows({ rows, start = 3, fmt, sub, moves, onOpenProfile, extra }) {
  const list = rows.slice(start);
  if (!list.length) return null;
  return (
    <ol className="mt-3 space-y-1.5">
      {list.map((r, j) => {
        const i = j + start;
        return (
          <li key={r.user?.id || i} className={`rounded-xl px-3 py-2.5 ${r.me ? "bg-blue-500/10 ring-1 ring-blue-500/40" : "bg-zinc-800/40"}`}>
            <div className="flex items-center gap-2.5">
              <span className="w-6 text-center font-display text-sm font-bold text-zinc-500">{i + 1}</span>
              <Move n={moves?.[r.user?.id]} />
              <button onClick={() => !r.me && onOpenProfile?.(r.user?.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <Avatar url={r.user?.avatar_url} name={r.user?.full_name} size="xs" />
                <span className={`truncate text-sm font-semibold ${r.me ? "text-blue-500" : "text-zinc-200"}`}>{r.me ? "You" : r.user?.full_name}</span>
                <Flair r={r} />
              </button>
              {sub && <span className="hidden text-xs text-zinc-500 sm:inline">{sub(r)}</span>}
              <span className={`min-w-[4.5rem] text-right text-sm font-bold tabular-nums ${r.tone || "text-zinc-200"}`}>{fmt(r)}</span>
            </div>
            {extra?.(r)}
          </li>
        );
      })}
    </ol>
  );
}

// "You're #3 · 0.8% behind #2" card shown above each board
function YouCard({ rows, fmt, gap, emptyText, action }) {
  const i = rows.findIndex((r) => r.me);
  if (i < 0)
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-zinc-700 px-4 py-3">
        <span className="text-sm text-zinc-400">{emptyText}</span>
        {action}
      </div>
    );
  const me = rows[i];
  const ahead = rows[i - 1];
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-blue-500/40 bg-blue-500/10 px-4 py-3">
      {i === 0 && rows.length > 1 && <Burst key={`lead-${rows.length}`} count={16} />}
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500 font-display text-lg font-bold text-white">#{i + 1}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-zinc-100">
          {i === 0 ? (rows.length > 1 ? "You're in the lead!" : "You're on the board") : `You're #${i + 1} of ${rows.length}`}
        </div>
        <div className="text-xs text-zinc-400">
          {i === 0 ? (rows.length > 1 ? "Keep it up to win the month." : "Invite friends to make it a race.") : ahead && gap ? `${gap(ahead, me)} behind ${ahead.me ? "" : firstName(ahead.user?.full_name)} at #${i}` : "Climb to the top."}
        </div>
      </div>
      <div className={`font-display text-xl font-bold tabular-nums ${me.tone || "text-zinc-100"}`}>{fmt(me)}</div>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 rounded-2xl" />
      <div className="flex items-end justify-center gap-4 pt-4">
        <Skeleton className="h-28 w-24 rounded-xl" />
        <Skeleton className="h-36 w-24 rounded-xl" />
        <Skeleton className="h-24 w-24 rounded-xl" />
      </div>
      <Skeleton className="h-12 rounded-xl" />
    </div>
  );
}

function Board({ title, blurb, rows, fmt, sub, gap, board, uid, onOpenProfile, emptyIcon, emptyTitle, emptyText, youEmpty, youAction, extra, right }) {
  const moves = useRankMoves(board, uid, rows || []);
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-zinc-100">{title}</h3>
          <p className="text-sm text-zinc-500">{blurb}</p>
        </div>
        {right}
      </div>
      {rows === null ? (
        <BoardSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} action={youAction}>{emptyText}</EmptyState>
      ) : (
        <>
          <YouCard rows={rows} fmt={fmt} gap={gap} emptyText={youEmpty} action={youAction} />
          <Podium rows={rows} fmt={fmt} onOpenProfile={onOpenProfile} />
          <div className="border-t border-zinc-800" />
          <Rows rows={rows} fmt={fmt} sub={sub} moves={moves} onOpenProfile={onOpenProfile} extra={extra} />
        </>
      )}
    </section>
  );
}

// ---------- the challenge ----------
function JoinSheet({ open, onClose, uid, getQuote, quoteOf, onJoined, suggestions }) {
  const [picks, setPicks] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const syms = [...new Set(picks.map((p) => p.trim().toUpperCase()).filter(Boolean))];

  async function join() {
    setErr(null);
    if (!syms.length) return setErr("Pick at least one stock.");
    setBusy(true);
    try {
      const prices = [];
      for (const s of syms) {
        const q = quoteOf?.(s)?.quote?.c ? { c: quoteOf(s).quote.c } : await getQuote(s);
        if (!q?.c) throw new Error(`Couldn't find a price for ${s}. Check the ticker.`);
        prices.push(q.c);
      }
      await enterChallenge(uid, monthKey(), syms, prices);
      await postActivity(uid, "challenge", null, { symbols: syms, month: monthKey() }).catch(() => {});
      setPicks(["", "", ""]);
      onJoined(syms);
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  const free = picks.findIndex((p) => !p.trim());
  return (
    <Sheet open={open} onClose={onClose} title={`Join the ${monthName()} challenge`}>
      <div className="space-y-4 p-4">
        <p className="text-sm text-zinc-400">
          Pick up to 3 stocks. Your score is their average change from today's price until the end of {monthName()}. Picks lock once you enter, so choose well.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {picks.map((p, i) => (
            <div key={i} className="rounded-2xl border border-zinc-700 p-2 text-center">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Pick {i + 1}</div>
              <input value={p} onChange={(e) => setPicks(picks.map((x, j) => (j === i ? e.target.value.toUpperCase().slice(0, 12) : x)))}
                placeholder={["NVDA", "AAPL", "MSFT"][i]} className={`${inputCls} !px-2 text-center font-display text-lg font-bold uppercase`} />
              <div className="mt-1 h-4 text-xs tabular-nums text-zinc-500">{p && quoteOf?.(p.trim())?.quote?.c ? money(quoteOf(p.trim()).quote.c) : ""}</div>
            </div>
          ))}
        </div>
        {suggestions?.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-semibold text-zinc-500">Need ideas? Today's strongest signals</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s} disabled={free < 0 || syms.includes(s)} onClick={() => setPicks(picks.map((x, j) => (j === free ? s : x)))}
                  className="ss-tap inline-flex items-center gap-1.5 rounded-full border border-zinc-700 py-1 pl-1 pr-3 text-sm font-semibold text-zinc-200 hover:border-blue-500 disabled:opacity-40">
                  <TickerMono symbol={s} size={24} className="rounded-full" /> {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button onClick={join} disabled={busy || !syms.length} className={`${btn.primary} w-full !min-h-12 text-base`}>
          <Ic name="lock" size={16} /> {busy ? "Locking in…" : `Lock in ${syms.length || ""} pick${syms.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </Sheet>
  );
}

function Hero({ ranked, mine, joinable, onJoin, celebrate, onOpenStock }) {
  const cd = useCountdown();
  const i = ranked.findIndex((r) => r.me);
  const leader = ranked[0];
  return (
    <section className="relative overflow-hidden rounded-3xl p-5 sm:p-6" style={{ background: "linear-gradient(135deg, #ff6a3d 0%, #e2451c 55%, #a92f10 100%)" }}>
      <GameStyles />
      {celebrate > 0 && <Burst key={celebrate} count={30} />}
      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/10" />
      <div className="relative text-white">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-xs font-semibold">
            <Ic name="trophy" size={13} /> {monthName()} challenge
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-xs font-semibold tabular-nums">
            <Ic name="clock" size={13} /> {cd.label}
          </span>
        </div>
        <h2 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-4xl">
          {mine ? (i === 0 && ranked.length > 1 ? "You're winning." : i >= 0 ? `You're #${i + 1} of ${ranked.length}.` : "You're in.") : "Pick 3 stocks. Beat your friends."}
        </h2>
        <p className="mt-1 max-w-md text-sm text-white/80">
          {mine
            ? leader && !leader.me
              ? `${firstName(leader.user?.full_name)} leads with ${pct(leader.value)}. ${cd.days} days to catch up.`
              : "Best average return at the end of the month wins."
            : `${ranked.length ? `${ranked.length} ${ranked.length === 1 ? "person has" : "people have"} entered.` : "Nobody has entered yet."} Best average return at the end of the month wins.`}
        </p>
        {mine ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {mine.symbols.map((s, j) => (
              <button key={s} onClick={() => onOpenStock?.(s)} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 py-1.5 pl-1.5 pr-3 backdrop-blur hover:bg-white/25">
                <TickerMono symbol={s} size={30} />
                <span className="text-left">
                  <span className="block text-sm font-bold leading-tight">{s}</span>
                  <span className="block text-xs font-semibold tabular-nums leading-tight text-white/85">{pct(mine.rets[j])}</span>
                </span>
              </button>
            ))}
            <div className="ml-auto text-right">
              <div className="font-display text-3xl font-bold tabular-nums">{pct(mine.value)}</div>
              <div className="text-xs text-white/75">your score</div>
            </div>
          </div>
        ) : (
          joinable && (
            <button onClick={onJoin} className="ss-tap mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-base font-bold text-[#c73a14] shadow-lg transition hover:scale-[1.02] active:scale-[.98]">
              <Ic name="target" size={18} /> Join the challenge
            </button>
          )
        )}
      </div>
    </section>
  );
}

function PastWinners({ quoteOf, ensureSymbols, stockData, onOpenProfile }) {
  const months = useMemo(() => prevMonths(3), []);
  const [boards, setBoards] = useState(null);
  useEffect(() => {
    Promise.all(months.map((m) => challengeBoard(m.key).catch(() => []))).then(setBoards);
  }, [months]);
  const syms = (boards || []).flat().flatMap((r) => r.symbols);
  useLivePrices(syms, ensureSymbols, quoteOf);
  const winners = useMemo(() => {
    if (!boards) return null;
    return months
      .map((m, k) => {
        const rows = (boards[k] || []).map((r) => {
          const rets = r.symbols.map((s, i) => {
            const candles = stockData?.[s]?.candles || quoteOf?.(s)?.candles;
            const c = candles?.filter((x) => x.t < m.end).at(-1);
            return c && r.start_prices[i] > 0 ? (c.close / r.start_prices[i] - 1) * 100 : null;
          });
          const v = rets.filter((x) => x != null);
          return { ...r, value: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
        });
        rows.sort((a, b) => (b.value ?? -1e9) - (a.value ?? -1e9));
        return { ...m, winner: rows[0], count: rows.length };
      })
      .filter((m) => m.winner);
  }, [boards, months, stockData, quoteOf]);
  if (!winners?.length) return null;
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-zinc-100">
        <Ic name="award" size={18} className="text-amber-500" /> Hall of fame
      </h3>
      <div className="grid gap-2 sm:grid-cols-3">
        {winners.map((m) => (
          <button key={m.key} onClick={() => !m.winner.me && onOpenProfile?.(m.winner.user?.id)} className="flex items-center gap-3 rounded-2xl bg-zinc-800/50 p-3 text-left hover:bg-zinc-800">
            <div className="relative">
              <Avatar url={m.winner.user?.avatar_url} name={m.winner.user?.full_name} className="!ring-amber-400" />
              <Ic name="crown" size={14} className="absolute -right-1 -top-1.5 text-amber-400" fill="currentColor" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{m.name}</div>
              <div className="truncate text-sm font-semibold text-zinc-100">{m.winner.me ? "You" : m.winner.user?.full_name}</div>
              <div className={`text-xs font-bold tabular-nums ${tone(m.winner.value)}`}>
                {pct(m.winner.value)} <span className="font-normal text-zinc-500">· {m.count} played</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------- page ----------
const TABS = [
  { id: "challenge", label: "Challenge", icon: "trophy" },
  { id: "calls", label: "Call of the Day", icon: "target" },
  { id: "xp", label: "Levels", icon: "star" },
  { id: "practice", label: "Practice", icon: "coins" },
  { id: "portfolios", label: "Portfolios", icon: "briefcase" },
];

export default function Compete({ uid, me, setMe, ensureSymbols, quoteOf, getQuote, onOpenStock, onOpenProfile, dailyPicks, stockData }) {
  const { toast } = useSocial();
  const [tab, setTab] = useState("challenge");
  const [joining, setJoining] = useState(false);
  const [celebrate, setCelebrate] = useState(0);
  const [err, setErr] = useState(null);

  // challenge
  const [entries, setEntries] = useState(null);
  const loadChallenge = useCallback(() => challengeBoard(monthKey()).then(setEntries).catch((e) => (setErr(friendly(e)), setEntries([]))), []);
  useEffect(() => {
    loadChallenge();
  }, [loadChallenge]);
  const price = useLivePrices((entries || []).flatMap((r) => r.symbols), ensureSymbols, quoteOf);
  const challenge = useMemo(
    () =>
      (entries || [])
        .map((r) => {
          const rets = r.symbols.map((s, i) => {
            const px = price(s);
            return px != null && r.start_prices[i] > 0 ? (px / r.start_prices[i] - 1) * 100 : null;
          });
          const v = rets.filter((x) => x != null);
          const value = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
          return { ...r, rets, value, tone: tone(value) };
        })
        .sort((a, b) => (b.value ?? -1e9) - (a.value ?? -1e9)),
    [entries, price]
  );
  const mine = challenge.find((r) => r.me);

  // game board (XP, calls, streaks)
  const [game, setGame] = useState(null);
  const [gameErr, setGameErr] = useState(false);
  useEffect(() => {
    gameBoard().then(setGame).catch((e) => (setGameErr(isMissingFn(e)), setGame([])));
  }, []);
  const flair = useMemo(() => Object.fromEntries((game || []).map((g) => [g.user?.id, { founding: g.founding, streak: g.streak_weeks }])), [game]);
  const withFlair = (rows) => rows.map((r) => ({ ...flair[r.user?.id], ...r }));

  const calls = useMemo(
    () =>
      game === null
        ? null
        : game
            .filter((g) => g.calls > 0 || g.me)
            .map((g) => ({ ...g, ...flair[g.user?.id], value: g.month_wins, acc: g.scored ? g.wins / g.scored : null }))
            .sort((a, b) => b.value - a.value || (b.acc ?? -1) - (a.acc ?? -1) || b.calls - a.calls),
    [game, flair]
  );
  const xp = useMemo(
    () => (game === null ? null : game.map((g) => ({ ...g, ...flair[g.user?.id], value: g.xp, lvl: levelFor(g.xp) })).sort((a, b) => b.value - a.value)),
    [game, flair]
  );

  // practice
  const [practiceRows, setPracticeRows] = useState(null);
  useEffect(() => {
    practiceLeaderboard().then(setPracticeRows).catch(() => setPracticeRows([]));
  }, []);
  const pprice = useLivePrices((practiceRows || []).flatMap((r) => (r.paper?.positions || []).map((p) => p.symbol)), ensureSymbols, quoteOf);
  const practice = useMemo(
    () =>
      practiceRows === null
        ? null
        : practiceRows
            .map((r) => {
              const p = r.paper || {};
              let v = p.cash ?? 10000;
              for (const pos of p.positions || []) v += pos.qty * (pprice(pos.symbol) ?? pos.avgPrice);
              const value = (v / 10000 - 1) * 100;
              return { ...flair[r.user?.id], ...r, value, worth: v, tone: tone(value) };
            })
            .sort((a, b) => b.value - a.value),
    [practiceRows, pprice, flair]
  );

  // friends' real portfolios (opt-in, % only)
  const optedIn = me?.share?.leaderboard === true;
  const [pfRows, setPfRows] = useState(null);
  useEffect(() => {
    leaderboard().then(setPfRows).catch(() => setPfRows([]));
  }, [optedIn]);
  const fprice = useLivePrices((pfRows || []).flatMap((r) => (r.positions || []).map((p) => p.symbol)), ensureSymbols, quoteOf);
  const portfolios = useMemo(
    () =>
      pfRows === null
        ? null
        : pfRows
            .map((r) => {
              let ret = 0, covered = 0;
              for (const p of r.positions || []) {
                const px = fprice(p.symbol);
                if (px == null) continue;
                ret += p.weight * (px / p.buyPrice - 1);
                covered += p.weight;
              }
              const value = covered > 0 ? (ret / covered) * 100 : null;
              return { ...flair[r.user?.id], ...r, value, count: (r.positions || []).length, tone: tone(value) };
            })
            .filter((r) => r.count > 0 || r.me)
            .sort((a, b) => (b.value ?? -1e9) - (a.value ?? -1e9)),
    [pfRows, fprice, flair]
  );
  async function toggleOptIn() {
    try {
      setMe(await updateMyProfile(uid, { share: { ...(me?.share || {}), leaderboard: !optedIn } }));
      toast?.(optedIn ? "You left the portfolio board" : "You're on the portfolio board");
    } catch (e) {
      setErr(friendly(e));
    }
  }

  const pctGap = (a, b) => (a.value != null && b.value != null ? `${Math.abs(a.value - b.value).toFixed(2)}%` : null);
  const suggestions = (dailyPicks || []).map((p) => p.symbol).slice(0, 5);

  return (
    <div className="space-y-4">
      <Hero ranked={challenge} mine={mine} joinable={entries !== null} onJoin={() => setJoining(true)} celebrate={celebrate} onOpenStock={onOpenStock} />

      {err && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {err}
          <button onClick={() => setErr(null)} aria-label="Dismiss"><Ic name="x" size={16} /></button>
        </div>
      )}

      <nav className="ss-noscroll -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`ss-tap inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition ${
              tab === t.id ? "border-zinc-100 bg-zinc-100 text-zinc-950" : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            }`}>
            <Ic name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </nav>

      {tab === "challenge" && (
        <>
          <Board
            board="challenge" uid={uid} onOpenProfile={onOpenProfile}
            title={`${monthName()} standings`}
            blurb="Average return of everyone's 3 picks since they entered. Live."
            rows={entries === null ? null : withFlair(challenge)}
            fmt={(r) => pct(r.value)}
            gap={pctGap}
            emptyIcon="trophy" emptyTitle="Be the first to enter"
            emptyText="Pick 3 stocks for the month. Your friends will see your picks and try to beat you."
            youEmpty="You haven't entered this month yet."
            youAction={<button onClick={() => setJoining(true)} className={`${btn.primary} !min-h-10 shrink-0 !px-4`}>Join</button>}
            extra={(r) => (
              <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[4.25rem]">
                {r.symbols.map((s, j) => (
                  <button key={s} onClick={() => onOpenStock?.(s)} className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 hover:text-blue-500">
                    {s} <span className={tone(r.rets[j])}>{pct(r.rets[j], 1)}</span>
                  </button>
                ))}
              </div>
            )}
          />
          <PastWinners quoteOf={quoteOf} ensureSymbols={ensureSymbols} stockData={stockData} onOpenProfile={onOpenProfile} />
        </>
      )}

      {tab === "calls" && (
        <Board
          board="calls" uid={uid} onOpenProfile={onOpenProfile}
          title="Call of the Day"
          blurb={`Most correct up/down calls in ${monthName()}. Ties go to the better hit rate.`}
          rows={gameErr ? [] : calls}
          fmt={(r) => `${r.value} win${r.value === 1 ? "" : "s"}`}
          sub={(r) => (r.acc == null ? `${r.calls} calls` : `${Math.round(r.acc * 100)}% right · ${r.calls} calls`)}
          gap={(a, b) => `${a.value - b.value} win${a.value - b.value === 1 ? "" : "s"}`}
          emptyIcon="target" emptyTitle={gameErr ? "Almost ready" : "No calls yet"}
          emptyText="Make today's call on the Home page. Every right call counts here."
          youEmpty="Make a call on Home to get on the board."
        />
      )}

      {tab === "xp" && (
        <Board
          board="xp" uid={uid} onOpenProfile={onOpenProfile}
          title="Levels"
          blurb="XP from calls, posts, trades and invites. You, your friends and people you follow."
          rows={gameErr ? [] : xp}
          fmt={(r) => `${r.value.toLocaleString("en-US")} XP`}
          sub={(r) => `Lv ${r.lvl.level} ${r.lvl.name}`}
          gap={(a, b) => `${(a.value - b.value).toLocaleString("en-US")} XP`}
          emptyIcon="star" emptyTitle={gameErr ? "Almost ready" : "No one here yet"}
          emptyText="Follow people or connect with friends to compare levels."
          extra={(r) => (
            <div className="mt-1.5 flex items-center gap-2 pl-[4.25rem]">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(4, r.lvl.progress * 100)}%` }} />
              </div>
              <span className="text-[11px] text-zinc-500">Lv {r.lvl.level} {r.lvl.name}</span>
            </div>
          )}
        />
      )}

      {tab === "practice" && (
        <Board
          board="practice" uid={uid} onOpenProfile={onOpenProfile}
          title="Practice money"
          blurb="Everyone starts with $10,000 of pretend money, so it's a fair race."
          rows={practice}
          fmt={(r) => pct(r.value)}
          sub={(r) => money(r.worth)}
          gap={pctGap}
          emptyIcon="coins" emptyTitle="No practice portfolios yet"
          emptyText="Start one in My Stocks → Practice and make your first pretend trade."
          youEmpty="Make a practice trade to join this race."
        />
      )}

      {tab === "portfolios" && (
        <Board
          board="portfolios" uid={uid} onOpenProfile={onOpenProfile}
          title="Real portfolios"
          blurb="Return on the stocks people actually own. Percentages only, never dollar amounts. Opt-in."
          rows={portfolios}
          fmt={(r) => pct(r.value)}
          sub={(r) => `${r.count} stock${r.count === 1 ? "" : "s"}`}
          gap={pctGap}
          right={
            <button onClick={toggleOptIn} className={`${optedIn ? btn.soft : btn.primary} shrink-0 !min-h-9 !px-3.5 !text-xs`}>
              {optedIn ? <><Ic name="check" size={14} /> On the board</> : "Join"}
            </button>
          }
          emptyIcon="briefcase" emptyTitle="Nobody here yet"
          emptyText="Add the stocks you own in My Stocks, then join the board. Only your % return is shown."
          youEmpty={optedIn ? "Add stocks you own to get a score." : "Only you can see your row until you join."}
        />
      )}

      <JoinSheet
        open={joining}
        onClose={() => setJoining(false)}
        uid={uid}
        getQuote={getQuote}
        quoteOf={quoteOf}
        suggestions={suggestions}
        onJoined={(syms) => {
          setJoining(false);
          setCelebrate(Date.now());
          toast?.(`You're in with ${syms.join(", ")}. Good luck!`);
          loadChallenge();
        }}
      />
    </div>
  );
}

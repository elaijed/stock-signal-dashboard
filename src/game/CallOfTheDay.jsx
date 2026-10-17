import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import { myCalls, makeCall, scoreCall, callCrowd } from "../social/api.js";
import {
  nyNow, currentCallDay, callCutoff, prettyDay, stockOfTheDay, stockName, resolveCall,
  callStreak, bestStreak, winRate, STREAK_MILESTONES, XP_CALL, XP_WIN, CLOSE_READY_MIN,
} from "./calls.js";
import { GameStyles, Burst, Sparkline, store } from "./fx.jsx";

const DEFAULT_API = { myCalls, makeCall, scoreCall, callCrowd };

function countdown(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
const pct = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}%`;
const dirWord = (d) => (d === "up" ? "Up" : "Down");

function Shell({ children, right }) {
  return (
    <section className="relative rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <GameStyles />
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <Ic name="target" size={13} className="text-blue-500" /> Call of the Day
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function StreakChip({ n }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-500">
      <Ic name="flame" size={13} fill="currentColor" className={n >= 3 ? "sg-flame" : ""} />
      {n}-day streak
    </span>
  );
}

function CrowdBar({ crowd, mine }) {
  if (crowd === null) return <div className="h-[46px] animate-pulse rounded-lg bg-zinc-800/40" />;
  const up = crowd?.up || 0, down = crowd?.down || 0, total = up + down;
  if (!total) return <p className="text-xs text-zinc-500">You're one of the first to call this one.</p>;
  const upPct = Math.round((up / total) * 100);
  const lead = upPct >= 50 ? { n: upPct, w: "Up" } : { n: 100 - upPct, w: "Down" };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-200">
          {lead.n}% said {lead.w}
        </span>
        <span className="text-zinc-500">
          {total} {total === 1 ? "call" : "calls"}
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-800" role="img" aria-label={`${upPct}% up, ${100 - upPct}% down`}>
        <div className={`bg-emerald-500 ${mine === "up" ? "" : "opacity-60"}`} style={{ width: `${upPct}%` }} />
        <div className={`bg-red-500 ${mine === "down" ? "" : "opacity-60"}`} style={{ width: `${100 - upPct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
        <span>Up {upPct}%</span>
        <span>Down {100 - upPct}%</span>
      </div>
    </div>
  );
}

function Stats({ calls, streak }) {
  const best = bestStreak(calls);
  const wr = winRate(calls);
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-800 pt-3 text-center">
      <div>
        <div className="flex items-center justify-center gap-1 font-display text-lg font-bold text-zinc-100">
          <Ic name="flame" size={15} className={streak ? "text-blue-500" : "text-zinc-600"} fill={streak ? "currentColor" : undefined} />
          {streak}
        </div>
        <div className="text-[11px] text-zinc-500">day streak</div>
      </div>
      <div>
        <div className="font-display text-lg font-bold text-zinc-100">{best}</div>
        <div className="text-[11px] text-zinc-500">best streak</div>
      </div>
      <div>
        <div className="font-display text-lg font-bold text-zinc-100">{wr.rate == null ? "–" : `${Math.round(wr.rate * 100)}%`}</div>
        <div className="text-[11px] text-zinc-500">{wr.rate == null ? "win rate" : `right ${wr.wins} of ${wr.wins + wr.losses}`}</div>
      </div>
    </div>
  );
}

// The result of a finished call: a small party for a win, a gentle note for a loss.
function Reveal({ call, onNext }) {
  const win = call.result === "win", isVoid = call.result === "void";
  const move = call.ref_close && call.close ? ((call.close - call.ref_close) / call.ref_close) * 100 : null;
  return (
    <div className={`sg-rise relative mb-4 overflow-visible rounded-xl border p-4 text-center ${win ? "border-emerald-500/40 bg-emerald-500/10" : "border-zinc-800 bg-zinc-800/40"}`}>
      {win && <Burst />}
      <div className={`mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full ${win ? "bg-emerald-500 text-white" : "bg-zinc-800 text-zinc-400"}`}>
        <Ic name={win ? "trophy" : isVoid ? "clock" : "sprout"} size={22} />
      </div>
      <div className="font-display text-xl font-bold text-zinc-100">
        {win ? "You called it!" : isVoid ? "No result for this one" : "Not this time"}
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        {isVoid
          ? `We couldn't get the ${call.symbol} close for ${prettyDay(call.day)}, so it doesn't count either way.`
          : `${call.symbol} closed ${move == null ? "" : `${move > 0 ? "up" : move < 0 ? "down" : "flat"} ${move ? pct(move).replace("+", "") : ""} `}on ${prettyDay(call.day)}. You said ${dirWord(call.direction)}.`}
      </p>
      {win && (
        <div className="sg-rise mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-sm font-bold text-white">
          <Ic name="zap" size={14} fill="currentColor" /> +{XP_CALL + XP_WIN} XP
        </div>
      )}
      {!win && !isVoid && <p className="mt-1 text-xs text-zinc-500">Even pros are right about half the time. Your streak still counts.</p>}
      <div>
        <button onClick={onNext} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90">
          Next call <Ic name="arrowRight" size={14} />
        </button>
      </div>
    </div>
  );
}

export default function CallOfTheDay({ uid, ensureSymbols, stockData = {}, onOpenStock, onXpChange, onMilestone, api = DEFAULT_API, now: fixedNow }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (fixedNow) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [fixedNow]);
  const now = useMemo(() => fixedNow || new Date(), [fixedNow, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const ny = nyNow(now);
  const callDay = currentCallDay(now);
  const symbol = stockOfTheDay(callDay);

  const [calls, setCalls] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | soon
  const [crowd, setCrowd] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [xpPop, setXpPop] = useState(0);
  const [seen, setSeen] = useState(() => store.get(`sg.call.seen.${uid}`, ""));
  useEffect(() => setSeen(store.get(`sg.call.seen.${uid}`, "")), [uid]);

  // load my calls; any error (tables/functions not there yet) -> "Coming soon"
  useEffect(() => {
    if (!uid) {
      setCalls([]);
      setStatus("ready");
      return;
    }
    let alive = true;
    setStatus("loading");
    api
      .myCalls()
      .then((rows) => alive && (setCalls(rows || []), setStatus("ready")))
      .catch(() => alive && setStatus("soon"));
    return () => {
      alive = false;
    };
  }, [uid, api]);

  const myCall = calls?.find((c) => c.day === callDay) || null;
  const pending = useMemo(() => (calls || []).filter((c) => !c.result && c.day <= ny.date), [calls, ny.date]);

  // candles for the stock of the day + any calls waiting for a result
  const wanted = useMemo(() => [...new Set([symbol, ...pending.map((c) => c.symbol)])], [symbol, pending]);
  const wantedKey = wanted.join(",");
  useEffect(() => {
    if (!ensureSymbols || status === "soon") return;
    let alive = true;
    Promise.resolve(ensureSymbols(wantedKey.split(","), () => alive)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [wantedKey, ensureSymbols, status]);

  // score finished calls from candles
  const scoring = useRef(new Set());
  useEffect(() => {
    if (!uid || status !== "ready") return;
    for (const c of pending) {
      if (scoring.current.has(c.day)) continue;
      const r = resolveCall(c, stockData[c.symbol]?.candles, now);
      if (!r) continue;
      scoring.current.add(c.day);
      api
        .scoreCall(uid, c.day, r.result, r.ref_close, r.close)
        .then(() => {
          setCalls((list) => (list || []).map((x) => (x.day === c.day ? { ...x, ...r } : x)));
          if (r.result === "win") onXpChange?.(XP_WIN);
        })
        .catch(() => scoring.current.delete(c.day));
    }
  }, [pending, stockData, uid, status, api, now, onXpChange]);

  // crowd split once I've called
  const loadCrowd = useCallback(() => {
    api.callCrowd(callDay).then(setCrowd).catch(() => setCrowd({ up: 0, down: 0 }));
  }, [api, callDay]);
  useEffect(() => {
    if (myCall) loadCrowd();
  }, [myCall?.day, loadCrowd]); // eslint-disable-line react-hooks/exhaustive-deps

  const streak = calls ? callStreak(calls, callDay) : 0;

  async function call(direction) {
    if (!uid || busy) return;
    setBusy(true);
    setErr("");
    try {
      await api.makeCall(uid, callDay, symbol, direction);
      const next = [{ user_id: uid, day: callDay, symbol, direction, result: null, ref_close: null, close: null }, ...(calls || [])];
      setCalls(next);
      setXpPop((n) => n + 1);
      onXpChange?.(XP_CALL);
      // streak milestones, once each per person
      const s = callStreak(next, callDay);
      const key = `sg.call.milestones.${uid}`;
      const done = store.get(key, []);
      const hit = STREAK_MILESTONES.filter((m) => s >= m && !done.includes(m));
      if (hit.length) {
        store.set(key, [...new Set([...done, ...hit])]);
        const m = Math.max(...hit);
        onMilestone?.(`${m}-day call streak`, `Made the Call of the Day ${m} trading days in a row.`);
      }
    } catch (e) {
      const msg = String(e?.message || "");
      if (/duplicate|unique|already/i.test(msg)) {
        api.myCalls().then((rows) => setCalls(rows || [])).catch(() => {});
      } else if (/row-level security|policy/i.test(msg)) {
        setErr(`Calls for ${prettyDay(callDay)} just closed. Try the next one.`);
        setTick((t) => t + 1);
      } else setErr("Couldn't save your call. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // ---------- coming soon ----------
  if (status === "soon") {
    return (
      <Shell right={<span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400">Coming soon</span>}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500">
            <Ic name="target" size={20} />
          </div>
          <div>
            <div className="font-display text-lg font-bold text-zinc-100">One stock. Up or down?</div>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              Every trading day you'll guess whether one popular stock closes higher. Keep a streak going and earn XP for every call. It's almost ready.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  if (status === "loading") {
    return (
      <Shell>
        <div className="h-40 animate-pulse rounded-xl bg-zinc-800/50" />
      </Shell>
    );
  }

  // the most recent finished call I haven't looked at yet
  const toReveal = (calls || []).filter((c) => c.result && c.day < callDay && c.day > seen).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  const dismissReveal = () => {
    store.set(`sg.call.seen.${uid}`, toReveal.day);
    setSeen(toReveal.day);
  };

  const d = stockData[symbol];
  const dp = d?.quote?.dp;
  const cutoff = callCutoff(callDay);
  const left = cutoff.getTime() - now.getTime();
  const isToday = callDay === ny.date;
  const waiting = pending.filter((c) => c.day !== callDay);

  return (
    <Shell right={<StreakChip n={streak} />}>
      {toReveal && <Reveal key={toReveal.day} call={toReveal} onNext={dismissReveal} />}

      {/* the stock */}
      <button
        type="button"
        onClick={() => onOpenStock?.(symbol)}
        className="flex w-full items-center justify-between gap-3 rounded-xl text-left"
        title={`Open ${symbol}`}
      >
        <div className="min-w-0">
          <div className="font-display text-2xl font-bold leading-none text-zinc-100">{symbol}</div>
          <div className="mt-1 truncate text-xs text-zinc-500">
            {stockName(symbol)}
            {dp != null && (
              <span className={`ml-2 font-semibold ${dp >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {pct(dp)} {isToday && ny.minutes >= 570 && ny.minutes < 960 ? "today" : "last move"}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <Sparkline candles={d?.candles} />
          <span className="h-3.5 text-[10px] text-zinc-600">{d?.candles?.length > 3 ? "last month" : ""}</span>
        </div>
      </button>

      {!myCall ? (
        <>
          <p className="mt-4 font-display text-lg font-semibold leading-snug text-zinc-100">
            Will {symbol} close higher on {prettyDay(callDay)}?
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">Higher than the close the trading day before.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              disabled={!uid || busy}
              onClick={() => call("up")}
              className="flex h-14 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-display text-lg font-bold text-white transition hover:bg-emerald-500 active:scale-[.98] disabled:opacity-50"
            >
              <Ic name="arrowUp" size={20} /> Up
            </button>
            <button
              disabled={!uid || busy}
              onClick={() => call("down")}
              className="flex h-14 items-center justify-center gap-2 rounded-xl bg-red-600 font-display text-lg font-bold text-white transition hover:bg-red-500 active:scale-[.98] disabled:opacity-50"
            >
              <Ic name="arrowDown" size={20} /> Down
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <Ic name="clock" size={13} />
              {isToday || left < 86_400_000 ? `Calls close in ${countdown(left)}` : `Calls close ${prettyDay(callDay)} 9:30am ET`}
            </span>
            <span className="inline-flex items-center gap-1 text-blue-500">
              <Ic name="zap" size={13} /> +{XP_CALL} XP, +{XP_WIN} if right
            </span>
          </div>
          {!uid && <p className="mt-2 text-xs text-zinc-500">Log in to make your call.</p>}
        </>
      ) : (
        <div className="mt-4">
          <div className="relative flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-display text-base font-bold text-white ${myCall.direction === "up" ? "bg-emerald-600" : "bg-red-600"}`}
            >
              <Ic name={myCall.direction === "up" ? "arrowUp" : "arrowDown"} size={16} />
              You said {dirWord(myCall.direction)}
            </span>
            {xpPop > 0 && (
              <span key={xpPop} className="sg-pop inline-flex items-center gap-1 text-sm font-bold text-blue-500">
                <Ic name="zap" size={14} fill="currentColor" /> +{XP_CALL} XP
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            on {symbol} for {prettyDay(callDay)} · result after the close
          </p>
          <div className="mt-3">
            <CrowdBar crowd={crowd} mine={myCall.direction} />
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Next call opens after 9:30am ET on {prettyDay(callDay)}. Come back to keep your streak.
          </p>
        </div>
      )}

      {waiting.map((c) => (
        <div key={c.day} className="mt-3 flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400">
          <Ic name="clock" size={13} />
          <span>
            {prettyDay(c.day)}: you said <b className="text-zinc-200">{dirWord(c.direction)}</b> on {c.symbol} ·{" "}
            {c.day === ny.date && ny.minutes < CLOSE_READY_MIN ? "result after the close" : "checking the result"}
          </span>
        </div>
      ))}

      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
      <Stats calls={calls || []} streak={streak} />
    </Shell>
  );
}

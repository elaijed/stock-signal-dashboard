import React, { useEffect, useMemo, useState } from "react";
import Avatar from "./Avatar.jsx";
import { leaderboard, challengeBoard, enterChallenge, postActivity, updateMyProfile, practiceLeaderboard } from "./api.js";

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthName = (d = new Date()) => d.toLocaleDateString("en-US", { month: "long" });
const pctStr = (n) => (n == null ? "—" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`);
const tone = (n) => (n == null ? "text-zinc-500" : n >= 0 ? "text-emerald-400" : "text-red-400");
const MEDAL = ["1st", "2nd", "3rd"];

function useLivePrices(symbols, ensureSymbols, quoteOf) {
  const key = [...new Set(symbols)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    ensureSymbols(key.split(","), () => alive);
    return () => {
      alive = false;
    };
  }, [key, ensureSymbols]);
  return (s) => quoteOf(s)?.quote?.c ?? null;
}

function Leaderboard({ uid, me, setMe, ensureSymbols, quoteOf, onOpenProfile }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const optedIn = me?.share?.leaderboard === true;

  useEffect(() => {
    leaderboard().then(setRows).catch((e) => setErr(e.message));
  }, [optedIn]);

  const syms = (rows || []).flatMap((r) => (r.positions || []).map((p) => p.symbol));
  const price = useLivePrices(syms, ensureSymbols, quoteOf);

  const ranked = useMemo(() => {
    return (rows || [])
      .map((r) => {
        let ret = 0, covered = 0;
        for (const p of r.positions || []) {
          const px = price(p.symbol);
          if (px == null) continue;
          ret += p.weight * (px / p.buyPrice - 1);
          covered += p.weight;
        }
        return { ...r, ret: covered > 0 ? (ret / covered) * 100 : null, count: (r.positions || []).length };
      })
      .sort((a, b) => (b.ret ?? -1e9) - (a.ret ?? -1e9));
  }, [rows, price]);

  async function toggleOptIn() {
    try {
      const saved = await updateMyProfile(uid, { share: { ...(me?.share || {}), leaderboard: !optedIn } });
      setMe(saved);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-100">Friends leaderboard</h3>
        <button
          onClick={toggleOptIn}
          className={`rounded-full px-3 py-1 text-xs font-medium ${optedIn ? "bg-emerald-700/40 text-emerald-200" : "bg-blue-600 text-white hover:bg-blue-500"}`}
        >
          {optedIn ? "✓ You're on the board" : "Join the leaderboard"}
        </button>
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Ranked by total return on open positions, live. Percentages only — no dollar amounts are ever shown. Only connections who joined appear.
      </p>
      {err && <div className="mb-2 text-xs text-red-400">{err}</div>}
      {!rows ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <ol className="space-y-1.5">
          {ranked.map((r, i) => (
            <li key={r.user?.id || i} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${r.me ? "bg-blue-950/30" : "bg-zinc-800/40"}`}>
              <span className="w-6 text-center text-sm">{MEDAL[i] || <span className="text-zinc-500">{i + 1}</span>}</span>
              <button onClick={() => !r.me && onOpenProfile?.(r.user.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <Avatar url={r.user?.avatar_url} name={r.user?.full_name} size="xs" />
                <span className="truncate text-sm text-zinc-200">
                  {r.me ? "You" : r.user?.full_name}
                  {r.me && !optedIn && <span className="ml-1 text-[11px] text-zinc-500">(only you see this row)</span>}
                </span>
              </button>
              <span className="text-[11px] text-zinc-500">{r.count} stock{r.count === 1 ? "" : "s"}</span>
              <span className={`w-20 text-right text-sm font-semibold tabular-nums ${tone(r.ret)}`}>{pctStr(r.ret)}</span>
            </li>
          ))}
          {ranked.length <= 1 && (
            <li className="pt-2 text-xs text-zinc-500">No connections on the board yet — invite friends and ask them to join.</li>
          )}
        </ol>
      )}
    </section>
  );
}

function Challenge({ uid, ensureSymbols, quoteOf, getQuote, onOpenStock, onOpenProfile }) {
  const month = monthKey();
  const [rows, setRows] = useState(null);
  const [picks, setPicks] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const daysLeft = (() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return Math.ceil((end - now) / 86_400_000);
  })();

  const load = () => challengeBoard(month).then(setRows).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const syms = (rows || []).flatMap((r) => r.symbols);
  const price = useLivePrices(syms, ensureSymbols, quoteOf);
  const mine = rows?.find((r) => r.me);

  const ranked = useMemo(
    () =>
      (rows || [])
        .map((r) => {
          const rets = r.symbols.map((s, i) => {
            const px = price(s);
            return px != null && r.start_prices[i] > 0 ? (px / r.start_prices[i] - 1) * 100 : null;
          });
          const valid = rets.filter((x) => x != null);
          return { ...r, rets, ret: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null };
        })
        .sort((a, b) => (b.ret ?? -1e9) - (a.ret ?? -1e9)),
    [rows, price]
  );

  async function join() {
    setErr(null);
    const syms = [...new Set(picks.map((p) => p.trim().toUpperCase()).filter(Boolean))];
    if (!syms.length) return setErr("Pick at least one stock.");
    setBusy(true);
    try {
      const prices = [];
      for (const s of syms) {
        const q = await getQuote(s);
        if (!q?.c) throw new Error(`Couldn't find a price for ${s}.`);
        prices.push(q.c);
      }
      await enterChallenge(uid, month, syms, prices);
      await postActivity(uid, "challenge", null, { symbols: syms, month }).catch(() => {});
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-100">{monthName()} pick challenge</h3>
        <span className="text-xs text-zinc-500">{daysLeft} day{daysLeft === 1 ? "" : "s"} left</span>
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Pick up to 3 stocks. Your score is their average % change from the price when you entered until the end of the month. Highest wins.
      </p>
      {err && <div className="mb-2 text-xs text-red-400">{err}</div>}
      {rows && !mine && (
        <div className="mb-4 rounded-lg border border-blue-900/60 bg-blue-950/20 p-3">
          <div className="mb-2 text-sm text-blue-200">Enter this month's challenge</div>
          <div className="flex flex-wrap gap-2">
            {picks.map((p, i) => (
              <input
                key={i}
                value={p}
                onChange={(e) => setPicks(picks.map((x, j) => (j === i ? e.target.value.toUpperCase().slice(0, 12) : x)))}
                placeholder={["NVDA", "AAPL", "TSLA"][i]}
                className="w-24 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm uppercase text-zinc-100 outline-none focus:border-blue-500"
              />
            ))}
            <button onClick={join} disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
              {busy ? "Locking in…" : "Lock in picks"}
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-zinc-500">Picks are locked once entered. Your connections see your picks.</div>
        </div>
      )}
      {!rows ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : ranked.length === 0 ? (
        <div className="text-sm text-zinc-500">No one has entered yet — be the first.</div>
      ) : (
        <ol className="space-y-1.5">
          {ranked.map((r, i) => (
            <li key={r.user?.id || i} className={`rounded-lg px-3 py-2 ${r.me ? "bg-blue-950/30" : "bg-zinc-800/40"}`}>
              <div className="flex items-center gap-3">
                <span className="w-6 text-center text-sm">{MEDAL[i] || <span className="text-zinc-500">{i + 1}</span>}</span>
                <button onClick={() => !r.me && onOpenProfile?.(r.user.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <Avatar url={r.user?.avatar_url} name={r.user?.full_name} size="xs" />
                  <span className="truncate text-sm text-zinc-200">{r.me ? "You" : r.user?.full_name}</span>
                </button>
                <span className={`text-sm font-semibold tabular-nums ${tone(r.ret)}`}>{pctStr(r.ret)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 pl-9">
                {r.symbols.map((s, j) => (
                  <button key={s} onClick={() => onOpenStock?.(s)} className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300 hover:text-blue-300">
                    {s} <span className={tone(r.rets[j])}>{pctStr(r.rets[j])}</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// Practice ($10,000 pretend money) leaderboard — everyone starts equal
function PracticeBoard({ me, ensureSymbols, quoteOf, onOpenProfile }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    practiceLeaderboard().then(setRows).catch(() => setRows([]));
  }, []);
  const syms = (rows || []).flatMap((r) => (r.paper?.positions || []).map((p) => p.symbol));
  const price = useLivePrices(syms, ensureSymbols, quoteOf);
  const ranked = (rows || [])
    .map((r) => {
      const p = r.paper || {};
      let v = p.cash ?? 10000;
      for (const pos of p.positions || []) v += pos.qty * (price(pos.symbol) ?? pos.avgPrice);
      return { ...r, ret: (v / 10000 - 1) * 100 };
    })
    .sort((a, b) => b.ret - a.ret);
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-1 text-base font-semibold text-zinc-100">Practice leaderboard</h3>
      <p className="mb-3 text-xs text-zinc-500">Everyone starts with $10,000 of pretend money, so it's a fair race. Friends appear if they joined the leaderboard.</p>
      {!rows ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : ranked.length === 0 ? (
        <div className="text-sm text-zinc-500">No practice portfolios yet — start one in My Stocks → Practice.</div>
      ) : (
        <ol className="space-y-1.5">
          {ranked.map((r, i) => (
            <li key={r.user?.id || i} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${r.me ? "bg-blue-950/30" : "bg-zinc-800/40"}`}>
              <span className="w-6 text-center text-sm">{MEDAL[i] || <span className="text-zinc-500">{i + 1}</span>}</span>
              <button onClick={() => !r.me && onOpenProfile?.(r.user.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <Avatar url={r.user?.avatar_url} name={r.user?.full_name} size="xs" />
                <span className="truncate text-sm text-zinc-200">{r.me ? "You" : r.user?.full_name}</span>
              </button>
              <span className={`w-20 text-right text-sm font-semibold tabular-nums ${tone(r.ret)}`}>{pctStr(r.ret)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function Compete(props) {
  return (
    <div className="space-y-4">
      <Challenge {...props} />
      <PracticeBoard {...props} />
      <Leaderboard {...props} />
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import Avatar from "./Avatar.jsx";
import { getFeed, postActivity, deleteActivity, toggleReaction, addComment, deleteComment, votePoll } from "./api.js";

const EMOJIS = ["👍", "🔥", "🤔", "💡"];
const money = (n) => (n == null ? "" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`);
const signedPct = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;

export function timeAgoShort(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Sym({ s, onOpenStock }) {
  if (!s) return null;
  return (
    <button onClick={() => onOpenStock?.(s)} className="font-semibold text-blue-300 hover:underline">
      {s}
    </button>
  );
}

// One sentence describing what happened
function Headline({ it, onOpenStock }) {
  const d = it.data || {};
  const s = <Sym s={it.symbol} onOpenStock={onOpenStock} />;
  switch (it.kind) {
    case "buy":
      return (
        <>
          bought {s}
          {d.price != null && <> at {money(d.price)}</>}
          {d.qty != null && <span className="text-zinc-500"> · {d.qty} shares</span>}
        </>
      );
    case "sell":
      return (
        <>
          sold {s}
          {d.sellPrice != null && <> at {money(d.sellPrice)}</>}
          {d.gainPct != null && (
            <span className={d.gainPct >= 0 ? "text-emerald-400" : "text-red-400"}>
              {" "}
              · {signedPct(d.gainPct)}
              {d.gainUsd != null && ` (${d.gainUsd >= 0 ? "+" : "−"}${money(Math.abs(d.gainUsd))})`}
            </span>
          )}
        </>
      );
    case "watch":
      return <>started watching {s}</>;
    case "target":
      return (
        <>
          🎯 {s} hit the target{d.target != null && <> ({money(d.target)})</>}
          {d.gainPct != null && <span className="text-emerald-400"> · {signedPct(d.gainPct)}</span>}
        </>
      );
    case "stop":
      return (
        <>
          ⚠️ {s} fell below the safety line{d.stop != null && <> ({money(d.stop)})</>}
        </>
      );
    case "note":
      return it.symbol ? <>shared a thought on {s}</> : <>shared a thought</>;
    case "poll":
      return <>asked about {s}</>;
    case "challenge":
      return (
        <>
          🏁 joined this month's challenge with{" "}
          {(d.symbols || []).map((x, i) => (
            <span key={x}>
              {i > 0 && ", "}
              <Sym s={x} onOpenStock={onOpenStock} />
            </span>
          ))}
        </>
      );
    default:
      return <>{it.kind}</>;
  }
}

function PollBox({ it, uid, onChanged }) {
  const p = it.poll || { bull: 0, bear: 0, mine: null };
  const total = p.bull + p.bear;
  const pctBull = total ? Math.round((p.bull / total) * 100) : 50;
  async function vote(choice) {
    await votePoll(uid, it.id, choice).catch(() => {});
    onChanged();
  }
  return (
    <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 text-sm font-medium text-zinc-100">{it.data?.question || `Bullish or bearish on ${it.symbol}?`}</div>
      <div className="flex gap-2">
        {[
          ["bull", "🐂 Bullish", "border-emerald-600 bg-emerald-600/20 text-emerald-200"],
          ["bear", "🐻 Bearish", "border-red-600 bg-red-600/20 text-red-200"],
        ].map(([c, label, on]) => (
          <button
            key={c}
            onClick={() => vote(c)}
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition ${
              p.mine === c ? on : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {label} {total > 0 && <span className="text-xs opacity-75">· {c === "bull" ? p.bull : p.bear}</span>}
          </button>
        ))}
      </div>
      {total > 0 && (
        <>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-red-600/70">
            <div className="bg-emerald-500" style={{ width: `${pctBull}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {pctBull}% bullish · {total} vote{total === 1 ? "" : "s"}
          </div>
        </>
      )}
    </div>
  );
}

export function FeedItem({ it, uid, onChanged, onOpenStock, onOpenProfile }) {
  const [showComments, setShowComments] = useState(it.comments.length > 0 && it.comments.length <= 2);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  if (!it.author || it.kind === "checkin") return null;

  async function react(e) {
    const on = !it.my_reactions.includes(e);
    await toggleReaction(uid, it.id, e, on).catch(() => {});
    onChanged();
  }
  async function send() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await addComment(uid, it.id, draft);
      setDraft("");
      setShowComments(true);
      onChanged();
    } catch (_) {
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start gap-3">
        <button onClick={() => onOpenProfile?.(it.author.id)}>
          <Avatar url={it.author.avatar_url} name={it.author.full_name} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug text-zinc-300">
            <button onClick={() => onOpenProfile?.(it.author.id)} className="font-semibold text-zinc-100 hover:underline">
              {it.mine ? "You" : it.author.full_name}
            </button>{" "}
            <Headline it={it} onOpenStock={onOpenStock} />
            <span className="ml-1.5 text-xs text-zinc-600">{timeAgoShort(it.created_at)}</span>
          </div>
          {it.note && (
            <p className="mt-1.5 whitespace-pre-line rounded-lg bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200">
              {it.kind === "buy" || it.kind === "sell" ? <span className="mr-1 text-zinc-500">Why:</span> : null}
              {it.note}
            </p>
          )}
          {it.kind === "poll" && <PollBox it={it} uid={uid} onChanged={onChanged} />}

          {/* reactions + comment toggle */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {EMOJIS.map((e) => {
              const n = it.reactions?.[e] || 0;
              const mine = it.my_reactions.includes(e);
              return (
                <button
                  key={e}
                  onClick={() => react(e)}
                  className={`rounded-full border px-2 py-0.5 text-xs transition ${
                    mine ? "border-blue-600 bg-blue-600/20 text-blue-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {e}
                  {n > 0 && <span className="ml-1">{n}</span>}
                </button>
              );
            })}
            <button onClick={() => setShowComments((s) => !s)} className="ml-1 text-xs text-zinc-500 hover:text-zinc-300">
              💬 {it.comments.length ? `${it.comments.length} comment${it.comments.length === 1 ? "" : "s"}` : "Comment"}
            </button>
            {it.mine && (
              <span className="relative ml-auto">
                <button onClick={() => setMenu((m) => !m)} className="px-1 text-zinc-600 hover:text-zinc-300">
                  ⋯
                </button>
                {menu && (
                  <button
                    onClick={async () => {
                      setMenu(false);
                      await deleteActivity(it.id).catch(() => {});
                      onChanged();
                    }}
                    className="absolute right-0 top-6 z-10 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-red-300 shadow-xl"
                  >
                    Delete post
                  </button>
                )}
              </span>
            )}
          </div>

          {showComments && (
            <div className="mt-2 space-y-2 border-t border-zinc-800 pt-2">
              {it.comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <Avatar url={c.author?.avatar_url} name={c.author?.full_name} size="xs" />
                  <div className="min-w-0 flex-1 rounded-lg bg-zinc-800/50 px-2.5 py-1.5">
                    <div className="text-xs">
                      <span className="font-semibold text-zinc-200">{c.mine ? "You" : c.author?.full_name}</span>
                      <span className="ml-1.5 text-zinc-600">{timeAgoShort(c.created_at)}</span>
                      {(c.mine || it.mine) && (
                        <button
                          onClick={async () => {
                            await deleteComment(c.id).catch(() => {});
                            onChanged();
                          }}
                          className="ml-2 text-zinc-600 hover:text-red-300"
                        >
                          delete
                        </button>
                      )}
                    </div>
                    <div className="whitespace-pre-line text-sm text-zinc-300">{c.body}</div>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, 300))}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Write a comment…"
                  className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-500"
                />
                <button
                  onClick={send}
                  disabled={busy || !draft.trim()}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Note / poll composer
export function Composer({ uid, onPosted, defaultSymbol = "", defaultMode = "note" }) {
  const [mode, setMode] = useState(defaultMode);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const sym = symbol.trim().toUpperCase();

  async function post() {
    setErr(null);
    if (mode === "poll" && !sym) return setErr("Pick a stock for your poll.");
    if (mode === "note" && !text.trim()) return setErr("Write something first.");
    if (sym && !/^[A-Z0-9.\-]{1,12}$/.test(sym)) return setErr("That doesn't look like a ticker.");
    setBusy(true);
    try {
      if (mode === "poll") {
        await postActivity(uid, "poll", sym, { question: text.trim() || `Bullish or bearish on ${sym} this month?` });
      } else {
        await postActivity(uid, "note", sym || null, {}, text);
      }
      setText("");
      if (!defaultSymbol) setSymbol("");
      onPosted?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
      <div className="mb-2 flex gap-1">
        {[
          ["note", "✍️ Share a thought"],
          ["poll", "🗳 Ask a poll"],
        ].map(([m, l]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${mode === m ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {!defaultSymbol && (
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 12))}
            placeholder={mode === "poll" ? "Ticker *" : "Ticker (optional)"}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm uppercase text-zinc-100 outline-none focus:border-blue-500 sm:w-32"
          />
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 280))}
          onKeyDown={(e) => e.key === "Enter" && post()}
          placeholder={mode === "poll" ? `Question (default: “Bullish or bearish on ${sym || "…"} this month?”)` : "What's on your mind about the market?"}
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <button
          onClick={post}
          disabled={busy}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {busy ? "…" : "Post"}
        </button>
      </div>
      {err && <div className="mt-1.5 text-xs text-red-400">{err}</div>}
      <div className="mt-1.5 text-[11px] text-zinc-600">Only your connections see your posts.</div>
    </div>
  );
}

export default function Feed({ uid, onOpenStock, onOpenProfile, symbol = null, user = null, showComposer = true, limit = 25, emptyText }) {
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await getFeed({ limit, symbol, user });
      setItems(list);
      setMore(list.length >= limit);
    } catch (e) {
      setErr(e.message);
      setItems([]);
    }
  }, [limit, symbol, user]);

  useEffect(() => {
    load();
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    const t = setInterval(load, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(t);
    };
  }, [load]);

  async function loadMore() {
    const last = items[items.length - 1];
    const next = await getFeed({ before: last.id, limit, symbol, user }).catch(() => []);
    setItems([...items, ...next]);
    setMore(next.length >= limit);
  }

  return (
    <div className="space-y-3">
      {showComposer && <Composer uid={uid} onPosted={load} defaultSymbol={symbol || ""} defaultMode={symbol ? "poll" : "note"} />}
      {err && <div className="text-sm text-red-400">{err}</div>}
      {items === null ? (
        <div className="py-6 text-center text-sm text-zinc-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          {emptyText || "Nothing here yet. When you and your connections buy, sell, post notes or polls, it shows up here."}
        </div>
      ) : (
        <>
          {items.map((it) => (
            <FeedItem key={it.id} it={it} uid={uid} onChanged={load} onOpenStock={onOpenStock} onOpenProfile={onOpenProfile} />
          ))}
          {more && (
            <button onClick={loadMore} className="w-full rounded-md border border-zinc-800 py-2 text-sm text-zinc-400 hover:bg-zinc-900">
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}

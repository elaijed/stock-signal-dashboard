// One post in a feed, Instagram-style: header, caption, stock chip that keeps score,
// photo, likes (double-tap), comments sheet, share, save and a "..." menu.
// Also renders the older activity kinds (buy/sell/watch/target/stop/note/poll/challenge/milestone).
import React, { useEffect, useRef, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import Avatar from "./Avatar.jsx";
import LevelBadge from "../game/LevelBadge.jsx";
import {
  toggleLike, toggleSave, addComment, deleteComment, deleteActivity, votePoll, follow, unfollow, reportUser, getPost,
} from "./api.js";
import {
  useSocial, timeAgoShort, money, signedPct, compact, scoreOf, sharePost, postLink, friendly,
  Sheet, ActionList, TickerMono, StancePill, FoundingChip, btn, inputCls,
} from "./ui.jsx";

// Make old get_feed rows and new get_feed2 rows look the same
export function normalize(it) {
  if (!it) return it;
  const my = it.my_reactions || [];
  return {
    ...it,
    data: it.data || {},
    comments: it.comments || [],
    my_reactions: my,
    reactions: it.reactions || {},
    likes: it.likes ?? it.reactions?.["❤️"] ?? 0,
    liked: it.liked ?? my.includes("❤️"),
    saved: !!it.saved,
    author: it.author ? { ...it.author } : null,
  };
}

function Sym({ s }) {
  const { onOpenStock } = useSocial();
  if (!s) return null;
  return (
    <button onClick={() => onOpenStock?.(s)} className="font-semibold text-blue-400 hover:underline">
      {s}
    </button>
  );
}

// One sentence for the automatic activity kinds
function Headline({ it }) {
  const d = it.data || {};
  const s = <Sym s={it.symbol} />;
  switch (it.kind) {
    case "buy":
      return (
        <>
          Bought {s}
          {d.price != null && <> at {money(d.price)}</>}
          {d.qty != null && <span className="text-zinc-500"> · {d.qty} shares</span>}
        </>
      );
    case "sell":
      return (
        <>
          Sold {s}
          {d.sellPrice != null && <> at {money(d.sellPrice)}</>}
          {d.gainPct != null && (
            <span className={d.gainPct >= 0 ? "text-emerald-500" : "text-red-500"}>
              {" "}
              · {signedPct(d.gainPct)}
              {d.gainUsd != null && ` (${d.gainUsd >= 0 ? "+" : "−"}${money(Math.abs(d.gainUsd))})`}
            </span>
          )}
        </>
      );
    case "watch":
      return <>Started watching {s}</>;
    case "target":
      return (
        <>
          {s} hit the target{d.target != null && <> ({money(d.target)})</>}
          {d.gainPct != null && <span className="text-emerald-500"> · {signedPct(d.gainPct)}</span>}
        </>
      );
    case "stop":
      return (
        <>
          {s} fell below the safety line{d.stop != null && <> ({money(d.stop)})</>}
        </>
      );
    case "challenge":
      return (
        <>
          Joined the monthly challenge with{" "}
          {(d.symbols || []).map((x, i) => (
            <span key={x}>
              {i > 0 && ", "}
              <Sym s={x} />
            </span>
          ))}
        </>
      );
    default:
      return null;
  }
}
const KIND_ICON = { buy: ["up", "bg-emerald-500/15 text-emerald-500"], sell: ["coins", "bg-blue-500/15 text-blue-500"], watch: ["eye", "bg-zinc-800 text-zinc-300"], target: ["target", "bg-emerald-500/15 text-emerald-500"], stop: ["stop", "bg-red-500/15 text-red-500"], challenge: ["flag", "bg-amber-500/15 text-amber-500"] };

// Caption with $TICKER links and a "more" toggle
export function Caption({ text, name, onName, big }) {
  const [open, setOpen] = useState(false);
  const { onOpenStock } = useSocial();
  if (!text) return null;
  const long = text.length > 240 || text.split("\n").length > 5;
  const parts = text.split(/(\$[A-Za-z]{1,6}\b)/g);
  return (
    <div className={`whitespace-pre-line break-words text-zinc-200 ${big ? "text-[15px] leading-relaxed" : "text-sm leading-snug"}`}>
      <span className={!open && long ? "line-clamp-4" : ""}>
        {name && (
          <button onClick={onName} className="mr-1.5 font-semibold text-zinc-100">
            {name}
          </button>
        )}
        {parts.map((p, i) =>
          /^\$[A-Za-z]{1,6}$/.test(p) ? (
            <button key={i} onClick={() => onOpenStock?.(p.slice(1).toUpperCase())} className="font-semibold text-blue-400 hover:underline">
              {p.toUpperCase()}
            </button>
          ) : (
            <React.Fragment key={i}>{p}</React.Fragment>
          )
        )}
      </span>
      {long && !open && (
        <button onClick={() => setOpen(true)} className="text-zinc-500 hover:text-zinc-300">
          more
        </button>
      )}
    </div>
  );
}

// The stock a post is about, with live price and the score of the call
export function StockBlock({ it }) {
  const { quoteOf, onOpenStock } = useSocial();
  const q = quoteOf?.(it.symbol)?.quote;
  const sc = scoreOf(it, quoteOf);
  const stance = it.data?.stance;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/50">
      <button onClick={() => onOpenStock?.(it.symbol)} className="ss-tap flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-800/40">
        <TickerMono symbol={it.symbol} />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-bold text-zinc-100">{it.symbol}</span>
          <span className="block text-xs tabular-nums text-zinc-500">
            {q?.c ? (
              <>
                {money(q.c)}{" "}
                {q.dp != null && <span className={q.dp >= 0 ? "text-emerald-500" : "text-red-500"}>{signedPct(q.dp, 2)} today</span>}
              </>
            ) : (
              "Tap to see the chart"
            )}
          </span>
        </span>
        <StancePill stance={stance} />
        <Ic name="chevronRight" size={16} className="text-zinc-600" />
      </button>
      {sc && (
        <div
          className={`flex items-center gap-2 border-t px-3 py-2 text-[13px] tabular-nums ${
            sc.right == null ? "border-zinc-800 text-zinc-400" : sc.right ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500" : "border-red-500/20 bg-red-500/10 text-red-500"
          }`}
        >
          <Ic name={sc.right == null ? "target" : sc.right ? "check" : "x"} size={15} />
          <span className="min-w-0 flex-1">
            Called at {money(sc.called)}
            {sc.now != null && (
              <>
                {" "}· now {money(sc.now)} · <span className="font-semibold">{signedPct(sc.pct)}</span>
              </>
            )}
          </span>
          {sc.right != null && <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide">{sc.right ? "Right so far" : "Not yet"}</span>}
        </div>
      )}
    </div>
  );
}

function PollBox({ it, onVoted }) {
  const { uid } = useSocial();
  const p = it.poll || { bull: 0, bear: 0, mine: null };
  const total = p.bull + p.bear;
  const pctBull = total ? Math.round((p.bull / total) * 100) : 50;
  const [err, setErr] = useState(null);
  async function vote(choice) {
    if (p.mine === choice) return;
    const prev = it.poll;
    const next = { ...p, mine: choice, bull: p.bull + (choice === "bull") - (p.mine === "bull"), bear: p.bear + (choice === "bear") - (p.mine === "bear") };
    onVoted(next);
    try {
      await votePoll(uid, it.id, choice);
    } catch (e) {
      onVoted(prev);
      setErr(friendly(e));
    }
  }
  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-2.5 font-display text-[15px] font-semibold text-zinc-100">{it.data?.question || `Bull or bear on ${it.symbol}?`}</div>
      <div className="flex gap-2">
        {[
          ["bull", "Bullish", "up", "border-emerald-500 bg-emerald-500/15 text-emerald-500"],
          ["bear", "Bearish", "down", "border-red-500 bg-red-500/15 text-red-500"],
        ].map(([c, label, icon, on]) => (
          <button
            key={c}
            onClick={() => vote(c)}
            className={`ss-tap flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border text-sm font-semibold transition active:scale-[.97] ${
              p.mine === c ? on : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <Ic name={icon} size={15} /> {label}
            {p.mine && <span className="text-xs opacity-75">{c === "bull" ? p.bull : p.bear}</span>}
          </button>
        ))}
      </div>
      {total > 0 && p.mine && (
        <>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-red-500/70">
            <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${pctBull}%` }} />
          </div>
          <div className="mt-1.5 text-xs text-zinc-500">
            {pctBull}% bullish · {total} vote{total === 1 ? "" : "s"}
          </div>
        </>
      )}
      {total > 0 && !p.mine && <div className="mt-2 text-xs text-zinc-500">{total} vote{total === 1 ? "" : "s"} · vote to see the split</div>}
      {err && <div className="mt-1.5 text-xs text-red-500">{err}</div>}
    </div>
  );
}

// ---------- comments ----------
export function CommentsSheet({ it, open, onClose, onChange, autoFocus = true }) {
  const { uid, me, onOpenProfile } = useSocial();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => {
    if (open && autoFocus) setTimeout(() => inputRef.current?.focus(), 250);
  }, [open, autoFocus]);

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    const temp = { id: `tmp-${Date.now()}`, body, created_at: new Date().toISOString(), mine: true, author: { id: uid, full_name: me?.full_name || "You", avatar_url: me?.avatar_url, username: me?.username } };
    const before = it.comments;
    onChange({ comments: [...before, temp] });
    setDraft("");
    setTimeout(() => listRef.current && (listRef.current.scrollTop = listRef.current.scrollHeight), 30);
    try {
      await addComment(uid, it.id, body);
      const fresh = await getPost(it.id).catch(() => null);
      if (fresh) onChange({ comments: fresh.comments || [] });
    } catch (e) {
      onChange({ comments: before });
      setDraft(body);
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(c) {
    const before = it.comments;
    onChange({ comments: before.filter((x) => x.id !== c.id) });
    try {
      await deleteComment(c.id);
    } catch (e) {
      onChange({ comments: before });
      setErr(friendly(e));
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="panel"
      title={`Comments${it.comments.length ? ` · ${it.comments.length}` : ""}`}
      footer={
        <div className="p-3">
          {err && <div className="mb-2 text-xs text-red-500">{err}</div>}
          <div className="flex items-center gap-2">
            <Avatar url={me?.avatar_url} name={me?.full_name} size="xs" />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 300))}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={`Add a comment${it.author && !it.mine ? ` for ${it.author.full_name.split(" ")[0]}` : ""}…`}
              className="min-h-11 min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-950 px-4 text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-blue-500"
            />
            <button onClick={send} disabled={!draft.trim() || busy} className="ss-tap h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-blue-500 disabled:opacity-40">
              Post
            </button>
          </div>
        </div>
      }
    >
      <div ref={listRef} className="h-full space-y-4 px-4 py-4">
        {it.comments.length === 0 ? (
          <div className="py-12 text-center">
            <div className="font-display text-lg font-semibold text-zinc-100">No comments yet</div>
            <div className="text-sm text-zinc-500">Start the conversation.</div>
          </div>
        ) : (
          it.comments.map((c) => (
            <div key={c.id} className="ss-fade-up flex items-start gap-3">
              <button onClick={() => c.author?.id && (onClose(), onOpenProfile?.(c.author.id))}>
                <Avatar url={c.author?.avatar_url} name={c.author?.full_name} size="xs" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug text-zinc-200">
                  <span className="mr-1.5 font-semibold text-zinc-100">{c.mine ? "You" : c.author?.full_name}</span>
                  <span className="whitespace-pre-line break-words">{c.body}</span>
                </div>
                <div className="mt-0.5 flex gap-3 text-xs text-zinc-500">
                  <span>{timeAgoShort(c.created_at)}</span>
                  {(c.mine || it.mine) && !String(c.id).startsWith("tmp") && (
                    <button onClick={() => remove(c)} className="font-medium hover:text-red-500">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
}

// ---------- the card ----------
export default function PostCard({ it: input, onRemoved, openComments = false, compactMode = false }) {
  const ctx = useSocial();
  const { uid, onOpenProfile, toast } = ctx;
  const [it, setIt] = useState(() => normalize(input));
  useEffect(() => setIt(normalize(input)), [input]);
  const [pop, setPop] = useState(0);
  const [likeAnim, setLikeAnim] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(openComments);
  const [menu, setMenu] = useState(null); // null | "menu" | "report" | "delete"
  const [reason, setReason] = useState("");
  const [err, setErr] = useState(null);
  const lastTap = useRef(0);
  const patch = (p) => setIt((x) => ({ ...x, ...p }));

  if (!it?.author || it.kind === "checkin") return null;
  const a = it.author;
  const d = it.data || {};
  const isPost = it.kind === "post";
  const auto = KIND_ICON[it.kind];
  const openProfile = () => onOpenProfile?.(a.id);

  async function setLike(on) {
    const prev = { liked: it.liked, likes: it.likes };
    patch({ liked: on, likes: Math.max(0, it.likes + (on ? 1 : -1)) });
    if (on) setLikeAnim((n) => n + 1);
    try {
      await toggleLike(uid, it.id, on);
    } catch (e) {
      if (!/duplicate|unique/i.test(e.message || "")) {
        patch(prev);
        setErr(friendly(e));
      }
    }
  }
  function onBodyTap(e) {
    if (e.target.closest("button,a,input,textarea")) return;
    const now = Date.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      setPop((n) => n + 1);
      if (!it.liked) setLike(true);
    } else lastTap.current = now;
  }
  async function setSaved(on) {
    patch({ saved: on });
    try {
      await toggleSave(uid, it.id, on);
      toast?.(on ? "Saved to your profile" : "Removed from saved");
    } catch (e) {
      patch({ saved: !on });
      setErr(friendly(e));
    }
  }
  async function doFollow(on) {
    patch({ following: on });
    try {
      await (on ? follow(uid, a.id) : unfollow(uid, a.id));
      if (!on) toast?.(`Unfollowed ${a.full_name}`);
    } catch (e) {
      patch({ following: !on });
      setErr(friendly(e));
    }
  }
  async function share() {
    const r = await sharePost(it);
    if (r === "copied") toast?.("Link copied");
  }
  async function del() {
    setMenu(null);
    try {
      await deleteActivity(it.id);
      toast?.("Post deleted");
      onRemoved?.(it.id);
    } catch (e) {
      setErr(friendly(e));
    }
  }
  async function report() {
    try {
      await reportUser(uid, a.id, reason);
      setMenu(null);
      setReason("");
      toast?.("Thanks, your report was sent");
    } catch (e) {
      setErr(friendly(e));
    }
  }

  const preview = it.comments.slice(-2);
  const caption = it.note;
  const bigText = isPost && !d.image_url;

  return (
    <article className="ss-fade-up overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {/* header */}
      <div className="flex items-center gap-3 px-4 pt-3">
        <button onClick={openProfile} className="ss-tap shrink-0">
          <Avatar url={a.avatar_url} name={a.full_name} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <button onClick={openProfile} className="truncate text-[15px] font-semibold text-zinc-100 hover:underline">
              {it.mine ? "You" : a.full_name}
            </button>
            <LevelBadge xp={a.xp} compact />
            {a.founding && <FoundingChip />}
          </div>
          <div className="flex items-center gap-1 truncate text-xs text-zinc-500">
            {a.username && <span className="truncate">@{a.username}</span>}
            <span>·</span>
            <span className="shrink-0">{timeAgoShort(it.created_at)}</span>
          </div>
        </div>
        {!it.mine && a.account_public && !it.following && (
          <button onClick={() => doFollow(true)} className="ss-tap min-h-9 shrink-0 rounded-full bg-blue-500 px-4 text-xs font-semibold text-white hover:bg-blue-600 active:scale-95">
            Follow
          </button>
        )}
        <button onClick={() => setMenu("menu")} aria-label="More" className={`${btn.icon} -mr-2 shrink-0`}>
          <Ic name="more" size={20} />
        </button>
      </div>

      {/* body (double-tap to like) */}
      <div onClick={onBodyTap} className="ss-tap relative select-none px-4 pb-1 pt-2.5">
        {auto && (
          <div className="flex items-center gap-3 rounded-xl bg-zinc-950/50 px-3 py-2.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${auto[1]}`}>
              <Ic name={auto[0]} size={17} />
            </span>
            <span className="min-w-0 text-[15px] leading-snug text-zinc-200">
              <Headline it={it} />
            </span>
          </div>
        )}
        {it.kind === "milestone" && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
              <Ic name="trophy" size={19} />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[15px] font-semibold text-zinc-100">{d.title || "New milestone"}</span>
              {d.detail && <span className="block text-sm text-zinc-400">{d.detail}</span>}
            </span>
          </div>
        )}
        {caption && (
          <div className={auto || it.kind === "milestone" ? "mt-2.5" : ""}>
            {(it.kind === "buy" || it.kind === "sell") && <span className="mr-1 text-sm text-zinc-500">Why:</span>}
            <Caption text={caption} big={bigText || it.kind === "note"} />
          </div>
        )}
        {it.kind === "poll" && <PollBox it={it} onVoted={(poll) => patch({ poll })} />}
        {(isPost || it.kind === "note") && it.symbol && <StockBlock it={it} />}
        {d.image_url && (
          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
            <img src={d.image_url} alt="" loading="lazy" draggable={false} className={`w-full object-cover ${compactMode ? "max-h-80" : "max-h-[34rem]"}`} />
          </div>
        )}
        {pop > 0 && (
          <span key={pop} className="ss-heart-pop pointer-events-none absolute left-1/2 top-1/2 text-white drop-shadow-[0_4px_16px_rgba(0,0,0,.35)]">
            <Ic name="heart" size={96} fill="#ef4444" className="text-red-500" />
          </span>
        )}
      </div>

      {/* actions */}
      <div className="flex items-center px-2">
        <button onClick={() => setLike(!it.liked)} aria-label={it.liked ? "Unlike" : "Like"} className={btn.icon}>
          <span key={likeAnim} className={likeAnim ? "ss-like" : ""}>
            <Ic name="heart" size={24} fill={it.liked ? "currentColor" : undefined} className={it.liked ? "text-red-500" : ""} />
          </span>
        </button>
        <button onClick={() => setCommentsOpen(true)} aria-label="Comments" className={btn.icon}>
          <Ic name="chat" size={23} />
        </button>
        <button onClick={share} aria-label="Share" className={btn.icon}>
          <Ic name="send" size={22} />
        </button>
        <span className="flex-1" />
        <button onClick={() => setSaved(!it.saved)} aria-label={it.saved ? "Unsave" : "Save"} className={btn.icon}>
          <Ic name="bookmark" size={23} fill={it.saved ? "currentColor" : undefined} className={it.saved ? "text-zinc-100" : ""} />
        </button>
      </div>

      <div className="px-4 pb-3.5">
        {it.likes > 0 && (
          <div className="text-sm font-semibold text-zinc-100">
            {it.liked && it.likes === 1 ? "Liked by you" : `${compact(it.likes)} like${it.likes === 1 ? "" : "s"}`}
          </div>
        )}
        {it.comments.length > 2 && (
          <button onClick={() => setCommentsOpen(true)} className="mt-1 block text-sm text-zinc-500 hover:text-zinc-300">
            View all {it.comments.length} comments
          </button>
        )}
        {preview.map((c) => (
          <button key={c.id} onClick={() => setCommentsOpen(true)} className="mt-0.5 block w-full truncate text-left text-sm text-zinc-300">
            <span className="mr-1.5 font-semibold text-zinc-100">{c.mine ? "You" : c.author?.full_name}</span>
            {c.body}
          </button>
        ))}
        {it.comments.length === 0 && (
          <button onClick={() => setCommentsOpen(true)} className="mt-1 block text-sm text-zinc-500 hover:text-zinc-300">
            Add a comment…
          </button>
        )}
        {err && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">
            {err}
            <button onClick={() => setErr(null)} aria-label="Dismiss">
              <Ic name="x" size={14} />
            </button>
          </div>
        )}
      </div>

      <CommentsSheet it={it} open={commentsOpen} onClose={() => setCommentsOpen(false)} onChange={patch} autoFocus={!openComments} />

      <Sheet open={menu === "menu"} onClose={() => setMenu(null)}>
        <ActionList
          items={[
            { icon: "copy", label: "Copy link", onClick: async () => { setMenu(null); try { await navigator.clipboard.writeText(postLink(it.id)); toast?.("Link copied"); } catch (_) { window.prompt("Copy this link", postLink(it.id)); } } },
            !it.mine && { icon: "user", label: `View ${a.full_name.split(" ")[0]}'s profile`, onClick: () => (setMenu(null), openProfile()) },
            !it.mine && it.following && { icon: "userCheck", label: `Unfollow ${a.full_name.split(" ")[0]}`, onClick: () => (setMenu(null), doFollow(false)) },
            !it.mine && { icon: "flag", label: "Report", danger: true, onClick: () => setMenu("report") },
            it.mine && { icon: "trash", label: "Delete post", danger: true, onClick: () => setMenu("delete") },
          ]}
        />
      </Sheet>
      <Sheet open={menu === "delete"} onClose={() => setMenu(null)} title="Delete this post?">
        <div className="p-4 text-sm text-zinc-400">It disappears from every feed, with its likes and comments. This can't be undone.</div>
        <div className="flex gap-2 px-4 pb-5">
          <button onClick={() => setMenu(null)} className={`${btn.quiet} flex-1`}>Keep</button>
          <button onClick={del} className={`${btn.primary} flex-1 !bg-red-600 hover:!bg-red-700`}>Delete</button>
        </div>
      </Sheet>
      <Sheet open={menu === "report"} onClose={() => setMenu(null)} title={`Report ${a.full_name}`}>
        <div className="space-y-3 p-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="What's wrong? (spam, scam, harassment, fake account…)"
            className={`${inputCls} resize-none`}
          />
          <button onClick={report} disabled={!reason.trim()} className={`${btn.primary} w-full !bg-red-600 hover:!bg-red-700`}>
            Send report
          </button>
        </div>
      </Sheet>
    </article>
  );
}

// ---------- the official daily post (built in the browser, not stored) ----------
export function DailyPicksPost({ picks }) {
  const { onOpenStock, quoteOf } = useSocial();
  const [liked, setLiked] = useState(false);
  const list = (picks || []).slice(0, 5);
  if (!list.length) return null;
  const day = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return (
    <article className="ss-fade-up overflow-hidden rounded-2xl border border-blue-500/40 bg-zinc-900">
      <div className="flex items-center gap-3 px-4 pt-3">
        <img src="./icon.svg" alt="" className="h-10 w-10 shrink-0 rounded-full ring-2 ring-zinc-900" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-[15px] font-bold text-zinc-100">signals.</span>
            <VerifiedTickInline />
          </div>
          <div className="text-xs text-zinc-500">Pinned · {day}</div>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-500">
          <Ic name="pin" size={12} /> Daily
        </span>
      </div>
      <div className="px-4 pb-2 pt-3">
        <div className="font-display text-xl font-bold leading-tight text-zinc-100">Today's top picks</div>
        <div className="mt-0.5 text-sm text-zinc-500">The 5 strongest signals from today's scan. Tap one to dig in.</div>
        <div className="ss-noscroll -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {list.map((p, i) => {
            const q = quoteOf?.(p.symbol)?.quote;
            return (
              <button key={p.symbol} onClick={() => onOpenStock?.(p.symbol)} className="ss-tap flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950/60 py-1 pl-1 pr-3.5 hover:border-blue-500">
                <TickerMono symbol={p.symbol} size={30} className="rounded-full" />
                <span className="text-left">
                  <span className="block text-sm font-bold leading-tight text-zinc-100">
                    <span className="mr-1 text-zinc-500">{i + 1}</span>
                    {p.symbol}
                  </span>
                  {q?.dp != null && <span className={`block text-[11px] leading-tight ${q.dp >= 0 ? "text-emerald-500" : "text-red-500"}`}>{signedPct(q.dp, 2)}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <ol className="mt-3 divide-y divide-zinc-800 rounded-xl border border-zinc-800">
          {list.map((p) => (
            <li key={p.symbol}>
              <button onClick={() => onOpenStock?.(p.symbol)} className="ss-tap flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-800/40">
                <span className="w-12 shrink-0 font-display text-sm font-bold text-zinc-100">{p.symbol}</span>
                <span className="min-w-0 flex-1 text-[13px] leading-snug text-zinc-400">{p.reason || "Strong signal today"}</span>
                {p.score != null && <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-500">{Math.round(p.score)}</span>}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center px-2 pb-2">
        <button onClick={() => setLiked(!liked)} aria-label="Like" className={btn.icon}>
          <Ic name="heart" size={24} fill={liked ? "currentColor" : undefined} className={liked ? "ss-like text-red-500" : ""} />
        </button>
        <span className="text-xs text-zinc-500">Educational only, not financial advice.</span>
      </div>
    </article>
  );
}
function VerifiedTickInline() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white" title="Official">
      <Ic name="check" size={11} />
    </span>
  );
}

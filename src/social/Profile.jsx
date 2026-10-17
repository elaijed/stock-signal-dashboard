// Creator profile: banner, avatar, name + level, counts (posts / followers / following),
// Follow + Connect buttons, call record, badges, and tabs: Posts grid, Portfolio, About, Saved.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import Avatar from "./Avatar.jsx";
import LevelBadge from "../game/LevelBadge.jsx";
import { levelFor } from "../game/levels.js";
import PostCard from "./PostCard.jsx";
import { ProfileAbout, badgeList } from "./ProfileView.jsx";
import { fetchFeed } from "./Feed.jsx";
import { BANNERS } from "./constants.js";
import {
  getProfile, followInfo, followList, follow, unfollow, removeFollower, getBadges, savedFeed, setAccountPublic,
  sendRequest, acceptRequestFrom, removeConnectionWith, blockUser, reportUser,
} from "./api.js";
import {
  useSocial, useEnsure, callRecord, friendly, compact, firstName, Sheet, ActionList, Switch, Skeleton, EmptyState,
  FoundingChip, StancePill, hueOf, btn, inputCls, isMissingFn,
} from "./ui.jsx";

const BANNER_HEX = { blue: ["#ff7a4d", "#c73a14"], green: ["#1fa95a", "#0e532d"], purple: ["#8b5cf6", "#5b21b6"], orange: ["#f59e0b", "#c2410c"], red: ["#f43f5e", "#9f1239"], gray: ["#71717a", "#3f3f46"] };

function Count({ n, label, onClick }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="ss-tap flex min-h-12 flex-1 flex-col items-center justify-center rounded-xl hover:bg-zinc-800/60 disabled:hover:bg-transparent">
      <span className="font-display text-lg font-bold leading-tight tabular-nums text-zinc-100">{n == null ? "–" : compact(n)}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </button>
  );
}

// all badges: activity badges + founding, invites, level, followers
function allBadges(b, xp) {
  const out = badgeList(b).map(([icon, name, hint]) => ({ icon, name, hint }));
  if (b?.founding) out.unshift({ icon: "crown", name: "Founding member", hint: "One of the first 100 members", gold: true });
  if (xp != null) {
    const l = levelFor(xp);
    out.unshift({ icon: "zap", name: `Level ${l.level} · ${l.name}`, hint: `${xp} XP`, brand: true });
  }
  if (b?.invites >= 1) out.push({ icon: "gift", name: b.invites >= 5 ? "Ambassador" : "Recruiter", hint: `${b.invites} friend${b.invites === 1 ? "" : "s"} joined` });
  if (b?.followers >= 10) out.push({ icon: "star", name: b.followers >= 100 ? "Rising star" : "Followed", hint: `${b.followers} followers` });
  if (b?.call_wins >= 5) out.push({ icon: "medal", name: "Caller", hint: `${b.call_wins} right calls of the day` });
  return out;
}

function PeopleSheet({ open, onClose, title, uid, which }) {
  const { onOpenProfile } = useSocial();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!open) return;
    setRows(null);
    followList(uid, which).then(setRows).catch(() => setRows([]));
  }, [open, uid, which]);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="p-2">
        {rows === null ? (
          <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-zinc-500">No one yet.</div>
        ) : (
          rows.map((p) => (
            <button key={p.id} onClick={() => (onClose(), onOpenProfile?.(p.id))} className="ss-tap flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-zinc-800">
              <Avatar url={p.avatar_url} name={p.full_name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-zinc-100">{p.full_name}</span>
                <span className="block truncate text-xs text-zinc-500">@{p.username}{p.headline ? ` · ${p.headline}` : ""}</span>
              </span>
              <Ic name="chevronRight" size={16} className="text-zinc-600" />
            </button>
          ))
        )}
      </div>
    </Sheet>
  );
}

// 3-column square grid
function PostGrid({ items, onOpen }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {items.map((it) => {
        const img = it.data?.image_url;
        const st = it.data?.stance;
        const h = hueOf(it.symbol || it.author?.full_name || String(it.id));
        return (
          <button key={it.id} onClick={() => onOpen(it)} className="ss-tap group relative aspect-square overflow-hidden rounded-md bg-zinc-800">
            {img ? (
              <img src={img} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
            ) : (
              <div
                className="flex h-full w-full flex-col items-center justify-center p-2 text-white"
                style={{ background: st === "bull" ? "linear-gradient(160deg,#1fa95a,#0e532d)" : st === "bear" ? "linear-gradient(160deg,#ef4444,#7f1d1d)" : `linear-gradient(160deg,hsl(${h} 55% 48%),hsl(${(h + 30) % 360} 55% 30%))` }}
              >
                {it.symbol ? (
                  <>
                    <span className="font-display text-lg font-bold leading-none sm:text-2xl">{it.symbol}</span>
                    {st && (
                      <span className="mt-1.5 flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-90">
                        <Ic name={st === "bull" ? "up" : "down"} size={11} /> {st === "bull" ? "Bullish" : "Bearish"}
                      </span>
                    )}
                    {it.kind === "poll" && <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-90">Poll</span>}
                  </>
                ) : (
                  <span className="line-clamp-4 text-center text-[11px] font-medium leading-snug sm:text-xs">{it.note || it.data?.title || "Post"}</span>
                )}
              </div>
            )}
            {(it.likes > 0 || it.comments?.length > 0) && (
              <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                <Ic name="heart" size={10} fill="currentColor" /> {it.likes || 0}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ConnectControls({ p, uid, onChanged }) {
  const { toast } = useSocial();
  const [sheet, setSheet] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function run(fn, msg) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setSheet(null);
      if (msg) toast?.(msg);
      onChanged?.();
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  const rel = p.relation;
  return (
    <>
      {rel === "none" && (
        <button onClick={() => setSheet("note")} className={`${btn.soft} flex-1`}>
          <Ic name="userPlus" size={16} /> Connect
        </button>
      )}
      {rel === "pending_out" && (
        <button onClick={() => setSheet("cancel")} className={`${btn.soft} flex-1 text-zinc-400`}>
          <Ic name="clock" size={16} /> Requested
        </button>
      )}
      {rel === "pending_in" && (
        <>
          <button disabled={busy} onClick={() => run(() => acceptRequestFrom(p.id, uid), "You're connected")} className={`${btn.primary} flex-1`}>
            Accept
          </button>
          <button disabled={busy} onClick={() => run(() => removeConnectionWith(uid, p.id))} className={btn.quiet}>
            Decline
          </button>
        </>
      )}
      {rel === "connected" && (
        <button onClick={() => setSheet("remove")} className={`${btn.soft} flex-1`}>
          <Ic name="userCheck" size={16} className="text-emerald-500" /> Connected
        </button>
      )}
      {err && <div className="w-full text-xs text-red-500">{err}</div>}

      <Sheet open={sheet === "note"} onClose={() => setSheet(null)} title={`Connect with ${firstName(p.full_name)}`}>
        <div className="space-y-3 p-4">
          <p className="text-sm text-zinc-400">Connections see each other's portfolio (whatever each of you shares) and private posts.</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} rows={2} placeholder="Add a short note (optional)" className={`${inputCls} resize-none`} />
          {err && <div className="text-xs text-red-500">{err}</div>}
          <button disabled={busy} onClick={() => run(() => sendRequest(uid, p.id, note), "Request sent")} className={`${btn.primary} w-full`}>
            Send request
          </button>
        </div>
      </Sheet>
      <Sheet open={sheet === "cancel"} onClose={() => setSheet(null)}>
        <ActionList items={[{ icon: "x", label: "Cancel request", danger: true, onClick: () => run(() => removeConnectionWith(uid, p.id)) }]} />
      </Sheet>
      <Sheet open={sheet === "remove"} onClose={() => setSheet(null)} title={`Remove ${firstName(p.full_name)}?`}>
        <div className="p-4 text-sm text-zinc-400">You'll stop seeing each other's portfolios and private posts.</div>
        <div className="flex gap-2 px-4 pb-5">
          <button onClick={() => setSheet(null)} className={`${btn.quiet} flex-1`}>Keep</button>
          <button disabled={busy} onClick={() => run(() => removeConnectionWith(uid, p.id))} className={`${btn.primary} flex-1 !bg-red-600`}>Remove</button>
        </div>
      </Sheet>
    </>
  );
}

export default function CreatorProfile({ profileId, self = false, me, onBack, onEdit, onMeChanged, renderPortfolio, renderInvite, onNetworkChanged }) {
  const ctx = useSocial();
  const { uid, quoteOf, ensureSymbols, toast } = ctx;
  const id = self ? uid : profileId;
  const [p, setP] = useState(self ? { ...me, relation: "self", member_since: me?.created_at } : undefined);
  const [fi, setFi] = useState(null);
  const [badges, setBadges] = useState(null);
  const [posts, setPosts] = useState(null);
  const [saved, setSaved] = useState(null);
  const [tab, setTab] = useState("posts");
  const [openPost, setOpenPost] = useState(null);
  const [people, setPeople] = useState(null); // "followers" | "following"
  const [menu, setMenu] = useState(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState(null);
  const [savingPublic, setSavingPublic] = useState(false);

  const loadProfile = useCallback(async () => {
    if (self) setP({ ...me, relation: "self", member_since: me?.created_at });
    else {
      try {
        setP(await getProfile(id));
      } catch (e) {
        setErr(friendly(e));
        setP(null);
      }
    }
    followInfo(id).then(setFi).catch(() => setFi(null));
  }, [id, self, me]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);
  useEffect(() => {
    setTab("posts");
    setPosts(null);
    setSaved(null);
    getBadges(id).then(setBadges).catch(() => {});
    fetchFeed({ mode: "all", user: id, limit: 60 })
      .then((list) => setPosts(list.filter((x) => x.kind !== "checkin")))
      .catch(() => setPosts([]));
  }, [id]);
  useEffect(() => {
    if (tab === "saved" && saved === null) savedFeed().then(setSaved).catch((e) => (setSaved([]), isMissingFn(e) || setErr(friendly(e))));
  }, [tab, saved]);

  const gridItems = useMemo(() => (posts || []).filter((x) => ["post", "poll", "note", "milestone"].includes(x.kind)), [posts]);
  useEnsure([...new Set(gridItems.filter((x) => x.data?.stance).map((x) => x.symbol))].slice(0, 15), ensureSymbols);
  const record = callRecord(gridItems, quoteOf);

  if (p === undefined)
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="flex items-center gap-3"><Skeleton className="h-20 w-20 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div></div>
      </div>
    );
  if (p === null)
    return (
      <div className="space-y-3">
        {onBack && <BackBtn onBack={onBack} />}
        <EmptyState icon="lock" title="This profile isn't available">{err || "It may be private, or the account was removed."}</EmptyState>
      </div>
    );

  const isPublic = fi?.account_public ?? p.account_public ?? false;
  const connected = p.relation === "connected";
  const xp = badges?.xp ?? null;
  const [c1, c2] = BANNER_HEX[p.banner_color] || BANNER_HEX.blue;
  const badgeItems = allBadges(badges, xp);

  async function doFollow(on) {
    setFi((f) => ({ ...(f || {}), i_follow: on, followers: Math.max(0, (f?.followers || 0) + (on ? 1 : -1)) }));
    try {
      await (on ? follow(uid, id) : unfollow(uid, id));
    } catch (e) {
      setFi((f) => ({ ...(f || {}), i_follow: !on, followers: Math.max(0, (f?.followers || 0) + (on ? -1 : 1)) }));
      setErr(friendly(e));
    }
  }
  async function togglePublic(on) {
    setSavingPublic(true);
    setErr(null);
    try {
      const saved = await setAccountPublic(uid, on);
      onMeChanged?.(saved);
      setFi((f) => ({ ...(f || {}), account_public: on }));
      toast?.(on ? "Your account is public" : "Your account is private");
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setSavingPublic(false);
    }
  }
  const changed = () => {
    loadProfile();
    onNetworkChanged?.();
  };

  const tabs = [
    { id: "posts", icon: "grid", label: "Posts" },
    { id: "portfolio", icon: "briefcase", label: "Portfolio" },
    { id: "about", icon: "user", label: "About" },
    self && { id: "saved", icon: "bookmark", label: "Saved" },
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {onBack && <BackBtn onBack={onBack} />}
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="relative h-28 sm:h-40" style={{ background: `linear-gradient(120deg, ${c1}, ${c2})` }}>
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #fff 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, #fff 0 1.5px, transparent 2.5px)", backgroundSize: "48px 48px, 36px 36px" }} />
          {!self && (
            <button onClick={() => setMenu("menu")} aria-label="More" className="ss-tap absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/45">
              <Ic name="more" size={20} />
            </button>
          )}
        </div>
        <div className="px-4 pb-4 sm:px-6">
          <div className="-mt-12 flex items-end gap-3 sm:-mt-14">
            <Avatar url={p.avatar_url} name={p.full_name} size="lg" className="ring-4" />
            <div className="mb-1 flex flex-1 justify-end">
              {self && (
                <button onClick={onEdit} className={btn.quiet}>
                  <Ic name="pen" size={15} /> Edit profile
                </button>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-bold leading-tight text-zinc-50">{p.full_name}</h2>
            <LevelBadge xp={xp} />
            {(badges?.founding) && <FoundingChip />}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-500">
            @{p.username}
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
              <Ic name={isPublic ? "globe" : "lock"} size={11} /> {isPublic ? "Public" : "Private"}
            </span>
            {fi?.follows_me && !self && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">Follows you</span>}
          </div>
          {p.headline && <div className="mt-2 text-[15px] font-medium text-zinc-200">{p.headline}</div>}
          {p.bio && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-zinc-400">{p.bio}</p>}

          {record.n > 0 && (
            <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${record.pct >= 50 ? "bg-emerald-500/15 text-emerald-500" : "bg-zinc-800 text-zinc-300"}`}>
              <Ic name="target" size={15} />
              {record.pct}% of calls right · {record.n} call{record.n === 1 ? "" : "s"}
            </div>
          )}

          <div className="mt-3 flex border-y border-zinc-800 py-1">
            <Count n={fi?.posts ?? gridItems.length} label="Posts" onClick={() => setTab("posts")} />
            <Count n={fi?.followers ?? null} label="Followers" onClick={fi ? () => setPeople("followers") : null} />
            <Count n={fi?.following ?? null} label="Following" onClick={fi ? () => setPeople("following") : null} />
          </div>

          {!self && (
            <div className="mt-3 flex flex-wrap gap-2">
              {isPublic && (
                fi?.i_follow ? (
                  <button onClick={() => setMenu("unfollow")} className={`${btn.soft} flex-1`}>
                    Following <Ic name="chevronRight" size={14} className="rotate-90" />
                  </button>
                ) : (
                  <button onClick={() => doFollow(true)} className={`${btn.primary} flex-1`}>
                    {fi?.follows_me ? "Follow back" : "Follow"}
                  </button>
                )
              )}
              <ConnectControls p={p} uid={uid} onChanged={changed} />
            </div>
          )}

          {self && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-zinc-950/60 p-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${me?.account_public ? "bg-blue-500/15 text-blue-500" : "bg-zinc-800 text-zinc-400"}`}>
                <Ic name={me?.account_public ? "globe" : "lock"} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-zinc-100">{me?.account_public ? "Public account" : "Private account"}</span>
                <span className="block text-xs text-zinc-500">
                  {me?.account_public
                    ? "Everyone sees your posts in For you and can follow you. Your portfolio stays connections-only."
                    : "Only your connections see your posts. Go public to get followers."}
                </span>
              </span>
              <Switch on={!!me?.account_public} onChange={togglePublic} disabled={savingPublic} label="Public account" />
            </div>
          )}
          {err && <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{err}</div>}

          {badgeItems.length > 0 && (
            <div className="ss-noscroll -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
              {badgeItems.map((b) => (
                <span
                  key={b.name}
                  title={b.hint}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    b.brand ? "border-blue-500/40 bg-blue-500/10 text-blue-500" : b.gold ? "border-amber-500/40 bg-amber-500/10 text-amber-500" : "border-zinc-700 bg-zinc-800/50 text-zinc-300"
                  }`}
                >
                  <Ic name={b.icon} size={14} /> {b.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {self && renderInvite && <div>{renderInvite()}</div>}

      {/* tabs */}
      <div className="sticky top-0 z-10 -mx-4 flex border-b border-zinc-800 bg-zinc-950/95 px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`ss-tap flex min-h-12 flex-1 items-center justify-center gap-1.5 border-b-2 text-sm font-semibold transition ${
              tab === t.id ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Ic name={t.icon} size={16} /> <span className="hidden min-[380px]:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "posts" &&
        (posts === null ? (
          <div className="grid grid-cols-3 gap-1">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-square" />)}</div>
        ) : gridItems.length === 0 ? (
          <EmptyState icon="camera" title={self ? "Share your first post" : "No posts yet"}>
            {self ? "Make a call on a stock and it keeps score for you." : `${firstName(p.full_name)} hasn't posted anything you can see.`}
          </EmptyState>
        ) : (
          <PostGrid items={gridItems} onOpen={setOpenPost} />
        ))}

      {tab === "portfolio" &&
        (self ? (
          <EmptyState icon="briefcase" title="Your portfolio">Your stocks live in My Stocks. Connections see what you share in privacy settings.</EmptyState>
        ) : connected && renderPortfolio ? (
          <div>{renderPortfolio(p.id, p.full_name)}</div>
        ) : (
          <EmptyState icon="lock" title="Portfolio is for connections">Connect with {firstName(p.full_name)} to see their stocks.</EmptyState>
        ))}

      {tab === "about" && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 pb-5 pt-1 sm:px-6">
          <ProfileAbout p={p} />
          {posts && posts.some((x) => x.data?.stance) && (
            <div className="mt-5">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Recent calls</div>
              <div className="flex flex-wrap gap-1.5">
                {posts.filter((x) => x.data?.stance).slice(0, 8).map((x) => (
                  <button key={x.id} onClick={() => setOpenPost(x)} className="flex items-center gap-1.5 rounded-full bg-zinc-800 py-0.5 pl-2.5 pr-0.5 text-xs font-semibold text-zinc-200">
                    {x.symbol} <StancePill stance={x.data.stance} className="!py-0.5" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "saved" &&
        (saved === null ? (
          <div className="grid grid-cols-3 gap-1">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="aspect-square" />)}</div>
        ) : saved.length === 0 ? (
          <EmptyState icon="bookmark" title="Nothing saved yet">Tap the bookmark on any post to keep it here. Only you can see what you save.</EmptyState>
        ) : (
          <PostGrid items={saved} onOpen={setOpenPost} />
        ))}

      <Sheet open={!!openPost} onClose={() => setOpenPost(null)} title="Post" wide>
        <div className="p-3">{openPost && <PostCard it={openPost} onRemoved={(rid) => (setOpenPost(null), setPosts((ps) => (ps || []).filter((x) => x.id !== rid)))} />}</div>
      </Sheet>
      {fi && <PeopleSheet open={!!people} onClose={() => setPeople(null)} title={people === "following" ? "Following" : "Followers"} uid={id} which={people || "followers"} />}

      <Sheet open={menu === "unfollow"} onClose={() => setMenu(null)}>
        <ActionList items={[{ icon: "x", label: `Unfollow ${firstName(p.full_name)}`, danger: true, onClick: () => (setMenu(null), doFollow(false)) }]} />
      </Sheet>
      <Sheet open={menu === "menu"} onClose={() => setMenu(null)}>
        <ActionList
          items={[
            fi?.follows_me && { icon: "users", label: "Remove follower", onClick: async () => { setMenu(null); try { await removeFollower(uid, id); setFi((f) => ({ ...f, follows_me: false })); toast?.("Follower removed"); } catch (e) { setErr(friendly(e)); } } },
            { icon: "flag", label: "Report", danger: true, onClick: () => setMenu("report") },
            { icon: "stop", label: "Block", danger: true, onClick: () => setMenu("block") },
          ]}
        />
      </Sheet>
      <Sheet open={menu === "report"} onClose={() => setMenu(null)} title={`Report ${p.full_name}`}>
        <div className="space-y-3 p-4">
          <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} rows={3} placeholder="What's wrong? (fake account, harassment, spam…)" className={`${inputCls} resize-none`} />
          <button disabled={!reason.trim()} onClick={async () => { try { await reportUser(uid, id, reason); setMenu(null); setReason(""); toast?.("Thanks, your report was sent"); } catch (e) { setErr(friendly(e)); } }} className={`${btn.primary} w-full !bg-red-600`}>
            Send report
          </button>
        </div>
      </Sheet>
      <Sheet open={menu === "block"} onClose={() => setMenu(null)} title={`Block ${p.full_name}?`}>
        <div className="p-4 text-sm text-zinc-400">You'll be disconnected and unfollowed both ways, and neither of you will find the other. You can unblock later in People.</div>
        <div className="flex gap-2 px-4 pb-5">
          <button onClick={() => setMenu(null)} className={`${btn.quiet} flex-1`}>Cancel</button>
          <button onClick={async () => { try { await blockUser(uid, id); setMenu(null); onNetworkChanged?.(); onBack?.(); } catch (e) { setErr(friendly(e)); } }} className={`${btn.primary} flex-1 !bg-red-600`}>Block</button>
        </div>
      </Sheet>
    </div>
  );
}

export function BackBtn({ onBack, label = "Back" }) {
  return (
    <button onClick={onBack} className="ss-tap -ml-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-medium text-zinc-400 hover:text-zinc-100">
      <Ic name="chevronLeft" size={18} /> {label}
    </button>
  );
}

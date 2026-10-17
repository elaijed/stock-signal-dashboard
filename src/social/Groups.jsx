import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import { timeAgoShort } from "./Feed.jsx";
import { Ic } from "../ui/icons.jsx";
import { coverStyle, initials } from "./ui.jsx";
import {
  myGroups, groupDetail, createGroup, deleteGroup, addGroupMember, removeGroupMember,
  addGroupSymbol, removeGroupSymbol, addGroupPost, deleteGroupPost, myNetwork,
  subscribeGroup, markGroupRead, groupChallengeBoard,
} from "./api.js";

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// This month's pick challenge, ranked among the group's members only
function GroupChallenge({ gid, ensureSymbols, quoteOf, onOpenStock, onJoinChallenge }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    groupChallengeBoard(gid, monthKey()).then(setRows).catch(() => setRows([]));
  }, [gid]);
  const key = [...new Set((rows || []).flatMap((r) => r.symbols))].join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    ensureSymbols(key.split(","), () => alive);
    return () => {
      alive = false;
    };
  }, [key, ensureSymbols]);
  const ranked = useMemo(
    () =>
      (rows || [])
        .map((r) => {
          const rets = r.symbols.map((s, i) => {
            const px = quoteOf(s)?.quote?.c;
            return px != null && r.start_prices[i] > 0 ? (px / r.start_prices[i] - 1) * 100 : null;
          });
          const v = rets.filter((x) => x != null);
          return { ...r, ret: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
        })
        .sort((a, b) => (b.ret ?? -1e9) - (a.ret ?? -1e9)),
    [rows, quoteOf]
  );
  const mine = rows?.some((r) => r.me);
  const month = new Date().toLocaleDateString("en-US", { month: "long" });
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{month} group challenge</h3>
        {!mine && (
          <button onClick={onJoinChallenge} className="text-xs text-blue-400 hover:underline">
            Join →
          </button>
        )}
      </div>
      {!rows ? (
        <div className="text-xs text-zinc-500">Loading…</div>
      ) : ranked.length === 0 ? (
        <div className="text-xs text-zinc-500">No one in the group has picked yet. Pick 3 stocks in Compete and you'll show up here.</div>
      ) : (
        <>
        <Podium top={ranked.slice(0, 3)} />
        {ranked.length > 3 && <ol className="mt-3 space-y-1 border-t border-zinc-800 pt-2">
          {ranked.slice(3).map((r, j) => { const i = j + 3; return (
            <li key={r.user?.id || i} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-center">{i + 1}</span>
              <Avatar url={r.user?.avatar_url} name={r.user?.full_name} size="xs" />
              <span className="min-w-0 flex-1 truncate text-zinc-300">
                {r.me ? "You" : r.user?.full_name}
                <span className="ml-1 text-[11px] text-zinc-500">
                  {r.symbols.map((s) => (
                    <button key={s} onClick={() => onOpenStock?.(s)} className="mr-1 hover:text-blue-300">
                      {s}
                    </button>
                  ))}
                </span>
              </span>
              <span className={`text-xs font-semibold tabular-nums ${r.ret == null ? "text-zinc-500" : r.ret >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {r.ret == null ? "…" : `${r.ret >= 0 ? "+" : "−"}${Math.abs(r.ret).toFixed(2)}%`}
              </span>
            </li>
          ); })}
        </ol>}
        </>
      )}
    </section>
  );
}

const pct = (r) => (r == null ? "…" : `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}%`);

// 2nd · 1st · 3rd, with the leader raised
function Podium({ top }) {
  const order = [top[1], top[0], top[2]];
  const height = ["h-14", "h-20", "h-10"];
  const place = [2, 1, 3];
  return (
    <div className="flex items-end justify-center gap-2 pt-2">
      {order.map((r, i) =>
        r ? (
          <div key={r.user?.id || i} className="flex w-1/3 max-w-[7rem] flex-col items-center">
            {place[i] === 1 && <Ic name="crown" size={16} className="mb-0.5 text-amber-400" />}
            <Avatar url={r.user?.avatar_url} name={r.user?.full_name} size={place[i] === 1 ? "sm" : "xs"} />
            <div className="mt-1 w-full truncate text-center text-xs font-semibold text-zinc-200">{r.me ? "You" : r.user?.full_name?.split(" ")[0]}</div>
            <div className={`text-xs font-semibold tabular-nums ${r.ret == null ? "text-zinc-500" : r.ret >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pct(r.ret)}</div>
            <div className={`mt-1 flex w-full items-start justify-center rounded-t-lg pt-1 text-sm font-bold ${height[i]} ${place[i] === 1 ? "bg-amber-400/25 text-amber-400" : "bg-zinc-800 text-zinc-400"}`}>
              {place[i]}
            </div>
          </div>
        ) : (
          <div key={i} className="w-1/3 max-w-[7rem]" />
        )
      )}
    </div>
  );
}

function Cover({ name, className = "" }) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden font-display font-bold text-white ${className}`} style={coverStyle(name)}>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 25% 30%, #fff 0 2px, transparent 3px), radial-gradient(circle at 70% 65%, #fff 0 1.5px, transparent 2.5px)", backgroundSize: "40px 40px, 28px 28px" }} />
      <span className="relative">{initials(name)}</span>
    </div>
  );
}

const input = "rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500";
const btn = "rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-40";

function GroupPage({ uid, gid, onBack, ensureSymbols, quoteOf, onOpenStock, onOpenProfile, onAddToWatchlist, mySymbols, onJoinChallenge }) {
  const [g, setG] = useState(undefined);
  const [post, setPost] = useState("");
  const [sym, setSym] = useState("");
  const [adding, setAdding] = useState(false);
  const [connections, setConnections] = useState([]);
  const [err, setErr] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => groupDetail(gid).then(setG).catch((e) => (setErr(e.message), setG(null))), [gid]);
  // live chat: refresh instantly when anyone posts or deletes (plus a slow safety refresh)
  useEffect(() => {
    load();
    markGroupRead(uid, gid).catch(() => {});
    const unsub = subscribeGroup(gid, () => {
      load();
      markGroupRead(uid, gid).catch(() => {});
    });
    const t = setInterval(load, 60_000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [load, uid, gid]);
  const chatRef = useRef(null);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [g?.posts?.length]);

  const symKey = (g?.symbols || []).map((s) => s.symbol).join(",");
  useEffect(() => {
    if (!symKey) return;
    let alive = true;
    ensureSymbols(symKey.split(","), () => alive);
    return () => {
      alive = false;
    };
  }, [symKey, ensureSymbols]);

  async function run(fn) {
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(/duplicate|unique/i.test(e.message) ? "Already there." : e.message);
    }
  }

  if (g === undefined) return <div className="py-8 text-center text-sm text-zinc-500">Loading group…</div>;
  if (g === null)
    return (
      <div>
        <button onClick={onBack} className="mb-3 text-sm text-zinc-400 hover:text-zinc-100">
          ← Groups
        </button>
        <div className="text-sm text-zinc-500">This group isn't available.</div>
      </div>
    );

  const memberIds = new Set(g.members.map((m) => m.id));
  const mine = new Set(mySymbols);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="ss-tap -ml-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-medium text-zinc-400 hover:text-zinc-100">
        <Ic name="chevronLeft" size={18} /> Groups
      </button>
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <Cover name={g.name} className="h-24 text-3xl sm:h-32 sm:text-4xl" />
        <div className="p-4">
        <h2 className="font-display text-2xl font-bold text-zinc-50">{g.name}</h2>
        {g.description && <p className="mt-1 text-sm text-zinc-400">{g.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex -space-x-2">
            {g.members.slice(0, 8).map((m) => (
              <Avatar key={m.id} url={m.avatar_url} name={m.full_name} size="xs" />
            ))}
          </span>
          <span className="text-xs text-zinc-400">
            {g.members.length} member{g.members.length === 1 ? "" : "s"}
          </span>
        </div>
        </div>
      </div>
      {err && <div className="text-sm text-red-400">{err}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {/* live chat */}
        <section className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 md:col-span-3">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Group chat</h3>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> live
            </span>
          </div>
          <div ref={chatRef} className="h-[60vh] space-y-2 overflow-y-auto px-3 py-3 md:h-[26rem]">
            {g.posts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-zinc-500">
                <Ic name="chat" size={28} className="text-zinc-600" />
                No messages yet. Say hi to the group.
              </div>
            ) : (
              [...g.posts].reverse().map((p) => (
                <div key={p.id} className={`flex gap-2 ${p.mine ? "flex-row-reverse" : ""}`}>
                  {!p.mine && (
                    <button onClick={() => onOpenProfile?.(p.author?.id)} className="self-end">
                      <Avatar url={p.author?.avatar_url} name={p.author?.full_name} size="xs" />
                    </button>
                  )}
                  <div className={`group max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm ${p.mine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md bg-zinc-800 text-zinc-200"}`}>
                    {!p.mine && <div className="text-[11px] font-semibold text-zinc-400">{p.author?.full_name}</div>}
                    {p.symbol && (
                      <button onClick={() => onOpenStock?.(p.symbol)} className={`mb-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.mine ? "bg-blue-500 text-white" : "bg-zinc-700 text-blue-300"}`}>
                        {p.symbol}
                      </button>
                    )}
                    <div className="whitespace-pre-line text-sm">{p.body}</div>
                    <div className={`text-[10px] ${p.mine ? "text-blue-200" : "text-zinc-500"}`}>
                      {timeAgoShort(p.created_at)}
                      {(p.mine || g.is_owner) && (
                        <button onClick={() => run(() => deleteGroupPost(p.id))} className="ml-2 opacity-60 hover:opacity-100">
                          delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="sticky bottom-16 z-10 flex gap-2 rounded-b-xl border-t border-zinc-800 bg-zinc-900 p-2 sm:bottom-0">
            <input
              value={post}
              onChange={(e) => setPost(e.target.value.slice(0, 500))}
              onKeyDown={(e) => e.key === "Enter" && post.trim() && run(() => addGroupPost(uid, gid, post).then(() => setPost("")))}
              placeholder="Message the group…"
              className={`${input} min-h-11 min-w-0 flex-1 !rounded-full px-4`}
            />
            <button
              disabled={!post.trim()}
              aria-label="Send"
              onClick={() => run(() => addGroupPost(uid, gid, post).then(() => setPost("")))}
              className="ss-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
            >
              <Ic name="send" size={18} />
            </button>
          </div>
        </section>

        <div className="space-y-4 md:col-span-2">
          <GroupChallenge gid={gid} ensureSymbols={ensureSymbols} quoteOf={quoteOf} onOpenStock={onOpenStock} onJoinChallenge={onJoinChallenge} />
          {/* shared watchlist */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Shared watchlist</h3>
            <div className="mb-2 flex gap-2">
              <input
                value={sym}
                onChange={(e) => setSym(e.target.value.toUpperCase().slice(0, 12))}
                onKeyDown={(e) => e.key === "Enter" && sym && run(() => addGroupSymbol(uid, gid, sym).then(() => setSym("")))}
                placeholder="Add ticker"
                className={`${input} w-28 uppercase`}
              />
              <button disabled={!sym} onClick={() => run(() => addGroupSymbol(uid, gid, sym).then(() => setSym("")))} className={`${btn} bg-zinc-100 text-zinc-950 hover:bg-zinc-600`}>
                Add
              </button>
            </div>
            {g.symbols.length === 0 ? (
              <div className="text-xs text-zinc-500">Add stocks the group is watching together.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {g.symbols.map((s) => {
                  const q = quoteOf(s.symbol)?.quote;
                  const up = q?.dp >= 0;
                  return (
                    <div key={s.symbol} className={`group flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1 ${q ? (up ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10") : "border-zinc-700 bg-zinc-800"}`}>
                      <button onClick={() => onOpenStock?.(s.symbol)} className="text-left">
                        <span className="text-sm font-bold text-zinc-100">{s.symbol}</span>
                        {q && (
                          <span className={`ml-1.5 text-xs font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
                            {up ? "+" : "−"}{Math.abs(q.dp).toFixed(2)}%
                          </span>
                        )}
                      </button>
                      {mine.has(s.symbol) ? (
                        <span title="On your list" className="flex h-6 w-6 items-center justify-center text-zinc-500"><Ic name="check" size={13} /></span>
                      ) : (
                        <button onClick={() => onAddToWatchlist?.(s.symbol)} title="Add to my list" className="flex h-6 w-6 items-center justify-center rounded-full text-blue-400 hover:bg-zinc-700">
                          <Ic name="plus" size={13} />
                        </button>
                      )}
                      <button onClick={() => run(() => removeGroupSymbol(gid, s.symbol))} title="Remove" className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-700 hover:text-red-300">
                        <Ic name="x" size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* members */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Members</h3>
              <button
                onClick={async () => {
                  setAdding((a) => !a);
                  const n = await myNetwork().catch(() => ({ connections: [] }));
                  setConnections(n.connections || []);
                }}
                className="text-xs text-blue-400 hover:underline"
              >
                + Add people
              </button>
            </div>
            {adding && (
              <div className="mb-2 rounded-lg bg-zinc-950/50 p-2">
                {connections.filter((c) => !memberIds.has(c.id)).length === 0 ? (
                  <div className="text-xs text-zinc-500">All your connections are already here (you can only add connections).</div>
                ) : (
                  connections
                    .filter((c) => !memberIds.has(c.id))
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => run(() => addGroupMember(uid, gid, c.id))}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                      >
                        <Avatar url={c.avatar_url} name={c.full_name} size="xs" /> {c.full_name}
                        <span className="ml-auto text-xs text-blue-400">Add</span>
                      </button>
                    ))
                )}
              </div>
            )}
            <ul className="space-y-1">
              {g.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <button onClick={() => m.id !== uid && onOpenProfile?.(m.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-zinc-300">
                    <Avatar url={m.avatar_url} name={m.full_name} size="xs" />
                    <span className="truncate">{m.id === uid ? "You" : m.full_name}</span>
                    {m.owner && <span className="text-[10px] text-amber-400">owner</span>}
                  </button>
                  {g.is_owner && m.id !== uid && (
                    <button onClick={() => run(() => removeGroupMember(gid, m.id))} className="text-xs text-zinc-600 hover:text-red-300">
                      remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-zinc-800 pt-2">
              {g.is_owner ? (
                confirmDelete ? (
                  <span className="text-xs text-zinc-400">
                    Delete the group for everyone?{" "}
                    <button onClick={() => run(() => deleteGroup(gid)).then(onBack)} className="font-semibold text-red-300">
                      Yes, delete
                    </button>{" "}
                    <button onClick={() => setConfirmDelete(false)} className="text-zinc-500">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="text-xs text-zinc-500 hover:text-red-300">
                    Delete group
                  </button>
                )
              ) : (
                <button onClick={() => run(() => removeGroupMember(gid, uid)).then(onBack)} className="text-xs text-zinc-500 hover:text-red-300">
                  Leave group
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function Groups(props) {
  const { uid, openGroupId } = props;
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState(openGroupId || null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState(null);

  const load = useCallback(() => myGroups().then(setGroups).catch((e) => (setErr(e.message), setGroups([]))), []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (openGroupId) setOpen(openGroupId);
  }, [openGroupId]);

  if (open) return <GroupPage {...props} gid={open} onBack={() => (setOpen(null), load())} />;

  async function create() {
    setErr(null);
    try {
      const g = await createGroup(uid, name, desc);
      setName("");
      setDesc("");
      setCreating(false);
      setOpen(g.id);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">Clubs with a shared watchlist and a group wall.</p>
        <button onClick={() => setCreating((c) => !c)} className={`${btn} bg-blue-600 text-white hover:bg-blue-500`}>
          + New group
        </button>
      </div>
      {creating && (
        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} placeholder="Group name (e.g. Uni investing club)" className={`${input} w-full`} />
          <input value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 200))} placeholder="What's it about? (optional)" className={`${input} w-full`} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className={`${btn} text-zinc-400 hover:bg-zinc-800`}>
              Cancel
            </button>
            <button onClick={create} disabled={!name.trim()} className={`${btn} bg-blue-600 text-white hover:bg-blue-500`}>
              Create
            </button>
          </div>
        </div>
      )}
      {err && <div className="text-sm text-red-400">{err}</div>}
      {groups === null ? (
        <div className="py-6 text-center text-sm text-zinc-500">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          You're not in any groups yet. Create one and add your connections.
        </div>
      ) : (
        groups.map((g) => (
          <button key={g.id} onClick={() => setOpen(g.id)} className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-left hover:border-zinc-700">
            <Cover name={g.name} className="h-12 w-12 shrink-0 rounded-xl text-base" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-zinc-100">{g.name}</div>
              <div className="truncate text-xs text-zinc-500">
                {g.members} member{g.members === 1 ? "" : "s"}
                {g.last_post && ` · last post ${timeAgoShort(g.last_post)}`}
                {g.owner && " · you own this"}
              </div>
            </div>
            <span className="flex -space-x-2">
              {(g.avatars || []).slice(0, 4).map((m) => (
                <Avatar key={m.id} url={m.avatar_url} name={m.full_name} size="xs" />
              ))}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

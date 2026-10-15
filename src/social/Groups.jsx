import React, { useCallback, useEffect, useState } from "react";
import Avatar from "./Avatar.jsx";
import { timeAgoShort } from "./Feed.jsx";
import {
  myGroups, groupDetail, createGroup, deleteGroup, addGroupMember, removeGroupMember,
  addGroupSymbol, removeGroupSymbol, addGroupPost, deleteGroupPost, myNetwork,
} from "./api.js";

const input = "rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500";
const btn = "rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-40";

function GroupPage({ uid, gid, onBack, ensureSymbols, quoteOf, onOpenStock, onOpenProfile, onAddToWatchlist, mySymbols }) {
  const [g, setG] = useState(undefined);
  const [post, setPost] = useState("");
  const [sym, setSym] = useState("");
  const [adding, setAdding] = useState(false);
  const [connections, setConnections] = useState([]);
  const [err, setErr] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => groupDetail(gid).then(setG).catch((e) => (setErr(e.message), setG(null))), [gid]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

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
      <button onClick={onBack} className="text-sm text-zinc-400 hover:text-zinc-100">
        ← Groups
      </button>
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-blue-950/40 to-zinc-900 p-4">
        <h2 className="text-xl font-bold text-zinc-50">{g.name}</h2>
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
      {err && <div className="text-sm text-red-400">{err}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {/* wall */}
        <section className="space-y-3 md:col-span-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Group wall</h3>
          <div className="flex gap-2">
            <input
              value={post}
              onChange={(e) => setPost(e.target.value.slice(0, 500))}
              onKeyDown={(e) => e.key === "Enter" && post.trim() && run(() => addGroupPost(uid, gid, post).then(() => setPost("")))}
              placeholder="Share an idea with the group…"
              className={`${input} min-w-0 flex-1`}
            />
            <button
              disabled={!post.trim()}
              onClick={() => run(() => addGroupPost(uid, gid, post).then(() => setPost("")))}
              className={`${btn} bg-blue-600 text-white hover:bg-blue-500`}
            >
              Post
            </button>
          </div>
          {g.posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">No posts yet — start the conversation.</div>
          ) : (
            g.posts.map((p) => (
              <div key={p.id} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                <button onClick={() => !p.mine && onOpenProfile?.(p.author?.id)}>
                  <Avatar url={p.author?.avatar_url} name={p.author?.full_name} size="sm" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-xs">
                    <span className="font-semibold text-zinc-200">{p.mine ? "You" : p.author?.full_name}</span>
                    <span className="ml-1.5 text-zinc-600">{timeAgoShort(p.created_at)}</span>
                    {(p.mine || g.is_owner) && (
                      <button onClick={() => run(() => deleteGroupPost(p.id))} className="ml-2 text-zinc-600 hover:text-red-300">
                        delete
                      </button>
                    )}
                  </div>
                  <div className="whitespace-pre-line text-sm text-zinc-300">{p.body}</div>
                </div>
              </div>
            ))
          )}
        </section>

        <div className="space-y-4 md:col-span-2">
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
              <button disabled={!sym} onClick={() => run(() => addGroupSymbol(uid, gid, sym).then(() => setSym("")))} className={`${btn} bg-zinc-700 text-white hover:bg-zinc-600`}>
                Add
              </button>
            </div>
            {g.symbols.length === 0 ? (
              <div className="text-xs text-zinc-500">Add stocks the group is watching together.</div>
            ) : (
              <ul className="divide-y divide-zinc-800">
                {g.symbols.map((s) => {
                  const q = quoteOf(s.symbol)?.quote;
                  return (
                    <li key={s.symbol} className="flex items-center gap-2 py-1.5">
                      <button onClick={() => onOpenStock?.(s.symbol)} className="w-16 text-left text-sm font-semibold text-zinc-100 hover:text-blue-300">
                        {s.symbol}
                      </button>
                      <span className="flex-1 text-xs tabular-nums text-zinc-400">
                        {q ? `$${q.c.toFixed(2)}` : "…"}{" "}
                        {q && <span className={q.dp >= 0 ? "text-emerald-400" : "text-red-400"}>{q.dp >= 0 ? "+" : ""}{q.dp.toFixed(2)}%</span>}
                      </span>
                      {mine.has(s.symbol) ? (
                        <span className="text-[11px] text-zinc-600">✓ yours</span>
                      ) : (
                        <button onClick={() => onAddToWatchlist?.(s.symbol)} className="text-[11px] text-blue-400 hover:underline">
                          + mine
                        </button>
                      )}
                      <button onClick={() => run(() => removeGroupSymbol(gid, s.symbol))} className="text-xs text-zinc-600 hover:text-red-300" title="Remove">
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-lg font-bold text-white">
              {g.name[0]?.toUpperCase()}
            </div>
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

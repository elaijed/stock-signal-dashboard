// Groups: investing clubs and interest groups.
// List (My groups / Find groups) -> group page with Chat, Pitches, Watchlist, Meetings, Members.
// Database: supabase/002 (groups, members, symbols, chat), 004 (challenge, realtime), 006 (v2: privacy,
// roles, requests, invite codes, pitches + votes, meetings, pinned posts).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import { Ic } from "../ui/icons.jsx";
import {
  coverStyle, initials, timeAgoShort, Sheet, ActionList, TickerMono, StancePill, EmptyState, Skeleton, btn, inputCls,
  firstName, money, signedPct, friendly, isMissingFn, useSocial,
} from "./ui.jsx";
import {
  myGroups, groupDetail, createGroup, deleteGroup, addGroupMember, removeGroupMember, addGroupSymbol, removeGroupSymbol,
  addGroupPost, deleteGroupPost, myNetwork, subscribeGroup, markGroupRead, groupChallengeBoard, discoverGroups, joinGroup,
  groupByCode, respondGroupRequest, setGroupRole, updateGroup, resetGroupInvite, pinGroupPost, setIdeaStatus,
  cancelGroupRequest, addGroupIdea, deleteGroupIdea, voteGroupIdea, addGroupEvent, deleteGroupEvent, rsvpGroupEvent,
} from "./api.js";

// ---------- constants ----------
export const CATEGORIES = [
  { id: "club", label: "Investing club", icon: "briefcase" },
  { id: "school", label: "School / uni", icon: "cap" },
  { id: "strategy", label: "Strategy", icon: "target" },
  { id: "sector", label: "Sector", icon: "chart" },
  { id: "learning", label: "Learning", icon: "book" },
  { id: "friends", label: "Friends", icon: "users" },
  { id: "other", label: "Other", icon: "hash" },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const PRIVACY = {
  public: { label: "Public", icon: "globe", help: "Anyone can find it and join." },
  request: { label: "Ask to join", icon: "userPlus", help: "Anyone can find it; admins approve who joins." },
  private: { label: "Invite only", icon: "lock", help: "Hidden. People join with your invite link." },
};
const TICKER_IN_TEXT = /\$([A-Za-z]{1,5}(?:\.[A-Za-z])?)\b/;
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const inviteLink = (code) => `${location.origin}${location.pathname}?group=${code}`;
const pctColor = (v) => (v == null ? "text-zinc-500" : v >= 0 ? "text-emerald-500" : "text-red-500");

function errText(e) {
  if (isMissingFn(e)) return "Groups are being upgraded. Try again in a minute.";
  if (/duplicate|unique/i.test(e?.message || "")) return "Already there.";
  return friendly(e);
}

// ---------- small pieces ----------
function Cover({ name, className = "" }) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden font-display font-bold text-white ${className}`} style={coverStyle(name)}>
      <div
        className="absolute inset-0 opacity-20"
        style={{ backgroundImage: "radial-gradient(circle at 25% 30%, #fff 0 2px, transparent 3px), radial-gradient(circle at 70% 65%, #fff 0 1.5px, transparent 2.5px)", backgroundSize: "40px 40px, 28px 28px" }}
      />
      <span className="relative drop-shadow-sm">{initials(name)}</span>
    </div>
  );
}

function Stack({ people = [], max = 4 }) {
  return (
    <span className="flex -space-x-2">
      {people.slice(0, max).map((m) => (
        <Avatar key={m.id} url={m.avatar_url} name={m.full_name} size="xs" />
      ))}
    </span>
  );
}

function Chip({ icon, children, tone = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone || "bg-zinc-800 text-zinc-400"}`}>
      {icon && <Ic name={icon} size={11} />}
      {children}
    </span>
  );
}

function RoleChip({ role }) {
  if (role === "owner") return <Chip icon="crown" tone="bg-amber-500/15 text-amber-500">Owner</Chip>;
  if (role === "admin") return <Chip icon="shield" tone="bg-blue-500/15 text-blue-500">Admin</Chip>;
  return null;
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-zinc-200">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

function Choice({ options, value, onChange }) {
  return (
    <div className="grid gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`ss-tap flex items-start gap-3 rounded-xl border p-3 text-left transition ${
            value === o.id ? "border-blue-500 bg-blue-500/10" : "border-zinc-700 hover:border-zinc-600"
          }`}
        >
          <Ic name={o.icon} size={18} className={value === o.id ? "mt-0.5 text-blue-500" : "mt-0.5 text-zinc-500"} />
          <span>
            <span className="block text-sm font-semibold text-zinc-100">{o.label}</span>
            {o.help && <span className="block text-xs text-zinc-500">{o.help}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

async function copyText(text, toast, msg = "Link copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast?.(msg);
  } catch (_) {
    window.prompt("Copy this", text);
  }
}

// ---------- create / edit ----------
function GroupForm({ initial, onSubmit, submitLabel, busy, err }) {
  const [f, setF] = useState({
    name: "", description: "", category: "club", privacy: "request", posting: "everyone", rules: "", ...(initial || {}),
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (f.name.trim()) onSubmit(f);
      }}
      className="space-y-4 p-4"
    >
      <Field label="Name">
        <input value={f.name} onChange={(e) => set("name")(e.target.value.slice(0, 50))} placeholder="e.g. Uni Investing Club" className={inputCls} autoFocus />
      </Field>
      <Field label="What's it about?" hint="Shown to people deciding whether to join.">
        <textarea value={f.description || ""} onChange={(e) => set("description")(e.target.value.slice(0, 500))} rows={3}
          placeholder="We meet every Thursday, pitch one stock each, and vote on what goes in our practice fund." className={`${inputCls} resize-none`} />
      </Field>
      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => set("category")(c.id)}
              className={`ss-tap inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${
                f.category === c.id ? "border-blue-500 bg-blue-500/10 text-blue-500" : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
              }`}>
              <Ic name={c.icon} size={14} /> {c.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Who can join?">
        <Choice value={f.privacy} onChange={set("privacy")} options={Object.entries(PRIVACY).map(([id, p]) => ({ id, ...p }))} />
      </Field>
      <Field label="Who can post in chat?">
        <Choice
          value={f.posting}
          onChange={set("posting")}
          options={[
            { id: "everyone", label: "Everyone", icon: "chat", help: "A normal group chat." },
            { id: "admins", label: "Only admins", icon: "megaphone", help: "An announcement channel: admins share, members receive. Members can still pitch and vote." },
          ]}
        />
      </Field>
      <Field label="Group rules (optional)">
        <textarea value={f.rules || ""} onChange={(e) => set("rules")(e.target.value.slice(0, 1000))} rows={3}
          placeholder="Be kind. Explain your reasoning. No pump-and-dumps." className={`${inputCls} resize-none`} />
      </Field>
      {err && <div className="text-sm text-red-400">{err}</div>}
      <button disabled={busy || !f.name.trim()} className={`${btn.primary} w-full`}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

// ---------- group list cards ----------
function MyGroupCard({ g, onOpen }) {
  const cat = CAT[g.category] || CAT.club;
  const lm = g.last_message;
  return (
    <button onClick={() => onOpen(g.id)} className="ss-tap flex w-full items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-left transition hover:border-zinc-700">
      <div className="relative shrink-0">
        <Cover name={g.name} className="h-14 w-14 rounded-2xl text-lg" />
        {g.unread > 0 && <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-blue-500 ring-2 ring-zinc-900" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-[15px] text-zinc-100 ${g.unread ? "font-bold" : "font-semibold"}`}>{g.name}</span>
          {g.privacy && <Ic name={PRIVACY[g.privacy]?.icon} size={12} className="shrink-0 text-zinc-500" />}
        </div>
        <div className={`truncate text-sm ${g.unread ? "text-zinc-200" : "text-zinc-500"}`}>
          {lm ? `${lm.mine ? "You" : firstName(lm.name)}: ${lm.body}` : g.description || `${cat.label} · ${g.members} member${g.members === 1 ? "" : "s"}`}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {g.requests > 0 && <Chip icon="userPlus" tone="bg-red-500/15 text-red-500">{g.requests} to approve</Chip>}
          {g.open_ideas > 0 && <Chip icon="bulb" tone="bg-amber-500/15 text-amber-500">{g.open_ideas} open pitch{g.open_ideas === 1 ? "" : "es"}</Chip>}
          {g.next_event && <Chip icon="calendar" tone="bg-emerald-500/15 text-emerald-500">{new Date(g.next_event.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</Chip>}
          {g.posting === "admins" && <Chip icon="megaphone">Announcements</Chip>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {g.last_post && <span className="text-[11px] text-zinc-500">{timeAgoShort(g.last_post)}</span>}
        <Stack people={g.avatars} max={3} />
      </div>
    </button>
  );
}

function DirectoryCard({ g, onOpen, onJoin, busy }) {
  const cat = CAT[g.category] || CAT.club;
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <button onClick={() => onOpen(g.id)} className="block w-full text-left">
        <Cover name={g.name} className="h-16 text-xl" />
        <div className="p-3 pb-2">
          <div className="truncate font-display text-base font-bold text-zinc-100">{g.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            <Chip icon={cat.icon}>{cat.label}</Chip>
            <span>{g.members} member{g.members === 1 ? "" : "s"}</span>
            {g.friends > 0 && <span className="text-blue-500">· {g.friends} friend{g.friends === 1 ? "" : "s"}</span>}
          </div>
          {g.description && <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{g.description}</p>}
        </div>
      </button>
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <Stack people={g.avatars} max={4} />
        {g.is_member ? (
          <button onClick={() => onOpen(g.id)} className={`${btn.soft} !min-h-9 !px-4`}>Open</button>
        ) : g.requested ? (
          <span className="text-xs font-medium text-zinc-500">Requested</span>
        ) : (
          <button disabled={busy} onClick={() => onJoin(g)} className={`${btn.primary} !min-h-9 !px-4`}>
            {g.privacy === "public" ? "Join" : "Ask to join"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- the list page ----------
export default function Groups(props) {
  const { uid, openGroupId, inviteCode } = props;
  const { toast } = useSocial();
  const [view, setView] = useState("mine"); // mine | find
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState(openGroupId || null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [dir, setDir] = useState(null);
  const [code, setCode] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);

  const load = useCallback(() => myGroups().then(setGroups).catch((e) => (setErr(errText(e)), setGroups([]))), []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (openGroupId) setOpen(openGroupId);
  }, [openGroupId]);

  // ?group=<code> invite links
  useEffect(() => {
    if (!inviteCode) return;
    groupByCode(inviteCode)
      .then((gid) => (gid ? setOpen({ id: gid, code: inviteCode }) : setErr("That invite link isn't valid any more.")))
      .catch((e) => setErr(errText(e)));
  }, [inviteCode]);

  const loadDir = useCallback(() => {
    discoverGroups(q.trim(), cat).then(setDir).catch((e) => (setErr(errText(e)), setDir([])));
  }, [q, cat]);
  useEffect(() => {
    if (view !== "find") return;
    const t = setTimeout(loadDir, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [view, loadDir, q]);

  if (open)
    return (
      <GroupPage
        {...props}
        gid={open.id || open}
        code={open.code}
        onBack={() => {
          setOpen(null);
          load();
          if (view === "find") loadDir();
        }}
      />
    );

  async function create(f) {
    setBusy(true);
    setErr(null);
    try {
      const g = await createGroup(uid, f.name, f.description, { category: f.category, privacy: f.privacy, posting: f.posting, rules: f.rules?.trim() || null });
      setCreating(false);
      setOpen(g.id);
      toast?.("Group created");
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function join(g) {
    setBusy(true);
    try {
      const r = await joinGroup(g.id);
      toast?.(r === "member" ? `You joined ${g.name}` : "Request sent");
      if (r === "member") setOpen(g.id);
      else loadDir();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function joinWithCode() {
    const c = code.trim().replace(/.*[?&]group=/, "").slice(0, 32);
    if (!c) return;
    try {
      const gid = await groupByCode(c);
      if (!gid) return setErr("No group found for that code.");
      setCodeOpen(false);
      setCode("");
      setOpen({ id: gid, code: c });
    } catch (e) {
      setErr(errText(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full bg-zinc-800/70 p-1">
          {[
            ["mine", "My groups"],
            ["find", "Find groups"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)}
              className={`ss-tap min-h-9 rounded-full px-4 text-sm font-semibold transition ${view === id ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setCodeOpen(true)} className={`${btn.icon} border border-zinc-700`} aria-label="Join with a code" title="Join with a code">
            <Ic name="key" size={18} />
          </button>
          <button onClick={() => setCreating(true)} className={`${btn.primary} !min-h-11 !px-4`}>
            <Ic name="plus" size={16} /> New
          </button>
        </div>
      </div>

      {err && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {err}
          <button onClick={() => setErr(null)} aria-label="Dismiss"><Ic name="x" size={16} /></button>
        </div>
      )}

      {view === "mine" &&
        (groups === null ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[88px] rounded-2xl" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState icon="users" title="Start or join a club"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={() => setCreating(true)} className={btn.primary}><Ic name="plus" size={16} /> Create a group</button>
                <button onClick={() => setView("find")} className={btn.quiet}><Ic name="search" size={16} /> Find groups</button>
              </div>
            }>
            Groups have a chat, stock pitches the group votes on, a shared watchlist, meetings and a monthly challenge. Perfect for an investing club.
          </EmptyState>
        ) : (
          <div className="space-y-2.5">
            {groups.map((g) => (
              <MyGroupCard key={g.id} g={g} onOpen={setOpen} />
            ))}
            <button onClick={() => setView("find")} className="ss-tap flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-zinc-700 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-200">
              <Ic name="compass" size={16} /> Find more groups to join
            </button>
          </div>
        ))}

      {view === "find" && (
        <div className="space-y-3">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"><Ic name="search" size={17} /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups" className={`${inputCls} !rounded-full pl-10`} />
          </div>
          <div className="ss-noscroll -mx-4 flex gap-2 overflow-x-auto px-4">
            <button onClick={() => setCat("")} className={`ss-tap shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${!cat ? "border-zinc-100 bg-zinc-100 text-zinc-950" : "border-zinc-700 text-zinc-300"}`}>All</button>
            {CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id === cat ? "" : c.id)}
                className={`ss-tap inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${cat === c.id ? "border-zinc-100 bg-zinc-100 text-zinc-950" : "border-zinc-700 text-zinc-300"}`}>
                <Ic name={c.icon} size={14} /> {c.label}
              </button>
            ))}
          </div>
          {dir === null ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : dir.length === 0 ? (
            <EmptyState icon="compass" title={q || cat ? "No groups match" : "No public groups yet"}
              action={<button onClick={() => setCreating(true)} className={btn.primary}><Ic name="plus" size={16} /> Start the first one</button>}>
              Public and ask-to-join groups show up here. Invite-only groups are hidden.
            </EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {dir.map((g) => (
                <DirectoryCard key={g.id} g={g} busy={busy} onOpen={setOpen} onJoin={join} />
              ))}
            </div>
          )}
        </div>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="New group">
        <GroupForm onSubmit={create} submitLabel="Create group" busy={busy} err={err} />
      </Sheet>
      <Sheet open={codeOpen} onClose={() => setCodeOpen(false)} title="Join with an invite">
        <div className="space-y-3 p-4">
          <p className="text-sm text-zinc-400">Paste the invite link or code someone sent you.</p>
          <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && joinWithCode()} placeholder="Invite link or code" className={inputCls} autoFocus />
          <button onClick={joinWithCode} disabled={!code.trim()} className={`${btn.primary} w-full`}>Find group</button>
        </div>
      </Sheet>
    </div>
  );
}

// ---------- group page ----------
const SECTIONS = [
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "pitches", label: "Pitches", icon: "bulb" },
  { id: "watchlist", label: "Watchlist", icon: "eye" },
  { id: "meetings", label: "Meetings", icon: "calendar" },
  { id: "members", label: "Members", icon: "users" },
];

function GroupPage({ uid, gid, code, onBack, ensureSymbols, quoteOf, getQuote, onOpenStock, onOpenProfile, onAddToWatchlist, mySymbols, onJoinChallenge }) {
  const { toast } = useSocial();
  const [g, setG] = useState(undefined);
  const [section, setSection] = useState("chat");
  const [err, setErr] = useState(null);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // "leave" | "delete"

  const load = useCallback(() => groupDetail(gid).then((d) => setG(d ?? null)).catch((e) => (setErr(errText(e)), setG(null))), [gid]);
  const member = !!g?.is_member;
  useEffect(() => {
    load();
  }, [load]);
  // live updates while you're a member
  useEffect(() => {
    if (!member) return;
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
  }, [member, load, uid, gid]);

  // prices for everything the group talks about
  const symKey = useMemo(
    () => [...new Set([...(g?.symbols || []).map((s) => s.symbol), ...(g?.ideas || []).map((i) => i.symbol)])].slice(0, 30).join(","),
    [g]
  );
  useEffect(() => {
    if (!symKey || !ensureSymbols) return;
    let alive = true;
    ensureSymbols(symKey.split(","), () => alive);
    return () => {
      alive = false;
    };
  }, [symKey, ensureSymbols]);

  async function run(fn, msg) {
    setErr(null);
    try {
      await fn();
      if (msg) toast?.(msg);
      await load();
      return true;
    } catch (e) {
      setErr(errText(e));
      return false;
    }
  }

  if (g === undefined)
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-10 rounded-full" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  if (g === null)
    return (
      <div className="space-y-3">
        <BackBtn onBack={onBack} />
        <EmptyState icon="lock" title="This group isn't available">{err || "It may be invite-only, or it was deleted."}</EmptyState>
      </div>
    );

  const cat = CAT[g.category] || CAT.club;
  const priv = PRIVACY[g.privacy] || PRIVACY.private;
  const count = g.member_count ?? g.members?.length ?? 0;
  const requests = g.requests || [];

  async function join() {
    setBusy(true);
    try {
      const r = await joinGroup(gid, null, code || null);
      toast?.(r === "member" ? `Welcome to ${g.name}` : "Request sent. An admin will let you in.");
      await load();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <BackBtn onBack={onBack} />

      {/* header */}
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="relative">
          <Cover name={g.name} className="h-24 text-3xl sm:h-32 sm:text-4xl" />
          {member && (
            <button onClick={() => setMenu(true)} aria-label="Group options" className="ss-tap absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/45">
              <Ic name="more" size={20} />
            </button>
          )}
        </div>
        <div className="p-4">
          <h2 className="font-display text-2xl font-bold leading-tight text-zinc-50">{g.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip icon={cat.icon}>{cat.label}</Chip>
            <Chip icon={priv.icon}>{priv.label}</Chip>
            {g.posting === "admins" && <Chip icon="megaphone">Announcements</Chip>}
            {g.role && g.role !== "member" && <RoleChip role={g.role} />}
          </div>
          {g.description && <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">{g.description}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => member && setSection("members")} className="flex items-center gap-2 text-left">
              <Stack people={g.members} max={5} />
              <span className="text-sm text-zinc-400">
                <b className="text-zinc-200">{count}</b> member{count === 1 ? "" : "s"}
                {g.friends > 0 && <span className="text-blue-500"> · {g.friends} friend{g.friends === 1 ? "" : "s"}</span>}
              </span>
            </button>
            {member ? (
              <button onClick={() => copyText(inviteLink(g.invite_code), toast, "Invite link copied")} className={`${btn.soft} !min-h-10 !px-4`}>
                <Ic name="userPlus" size={16} /> Invite
              </button>
            ) : g.requested ? (
              <button onClick={() => run(() => cancelGroupRequest(uid, gid), "Request cancelled")} className={`${btn.quiet} !min-h-10 !px-4`}>Requested · Cancel</button>
            ) : (
              <button disabled={busy} onClick={join} className={`${btn.primary} !min-h-10 !px-5`}>
                {g.privacy === "public" || code ? "Join group" : "Ask to join"}
              </button>
            )}
          </div>
        </div>
      </section>

      {err && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {err}
          <button onClick={() => setErr(null)} aria-label="Dismiss"><Ic name="x" size={16} /></button>
        </div>
      )}

      {!member ? (
        <Preview g={g} />
      ) : (
        <>
          {g.is_admin && requests.length > 0 && (
            <button onClick={() => setSection("members")} className="flex w-full items-center gap-3 rounded-2xl border border-blue-500/40 bg-blue-500/10 p-3 text-left">
              <Stack people={requests} max={3} />
              <span className="flex-1 text-sm font-medium text-zinc-100">
                {requests.length} {requests.length === 1 ? "person wants" : "people want"} to join
              </span>
              <span className="text-sm font-semibold text-blue-500">Review</span>
            </button>
          )}

          <nav className="ss-noscroll sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto bg-zinc-950/90 px-4 py-2 backdrop-blur">
            {SECTIONS.map((s) => {
              const badge = s.id === "pitches" ? (g.ideas || []).filter((i) => i.status === "open" && !i.my_vote).length : s.id === "members" && g.is_admin ? requests.length : 0;
              return (
                <button key={s.id} onClick={() => setSection(s.id)}
                  className={`ss-tap inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition ${
                    section === s.id ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}>
                  <Ic name={s.icon} size={15} /> {s.label}
                  {badge > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{badge}</span>}
                </button>
              );
            })}
          </nav>

          {section === "chat" && <Chat g={g} uid={uid} gid={gid} run={run} onOpenStock={onOpenStock} onOpenProfile={onOpenProfile} />}
          {section === "pitches" && <Pitches g={g} uid={uid} gid={gid} run={run} quoteOf={quoteOf} getQuote={getQuote} onOpenStock={onOpenStock} onOpenProfile={onOpenProfile} />}
          {section === "watchlist" && (
            <div className="space-y-4">
              <Watchlist g={g} uid={uid} gid={gid} run={run} quoteOf={quoteOf} onOpenStock={onOpenStock} onAddToWatchlist={onAddToWatchlist} mySymbols={mySymbols} />
              <GroupChallenge gid={gid} ensureSymbols={ensureSymbols} quoteOf={quoteOf} onOpenStock={onOpenStock} onJoinChallenge={onJoinChallenge} />
            </div>
          )}
          {section === "meetings" && <Meetings g={g} uid={uid} gid={gid} run={run} />}
          {section === "members" && <Members g={g} uid={uid} gid={gid} run={run} onOpenProfile={onOpenProfile} />}
        </>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={g.name}>
        <ActionList
          items={[
            { icon: "link", label: "Copy invite link", onClick: () => (setMenu(false), copyText(inviteLink(g.invite_code), toast, "Invite link copied")) },
            g.is_admin && { icon: "settings", label: "Edit group & settings", onClick: () => (setMenu(false), setEditing(true)) },
            g.is_admin && { icon: "repost", label: "Make a new invite link", onClick: () => (setMenu(false), run(() => resetGroupInvite(gid), "Old link turned off. New link ready.")) },
            g.is_owner
              ? { icon: "trash", label: "Delete group", danger: true, onClick: () => (setMenu(false), setConfirm("delete")) }
              : { icon: "logout", label: "Leave group", danger: true, onClick: () => (setMenu(false), setConfirm("leave")) },
          ]}
        />
      </Sheet>
      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit group">
        <GroupForm
          initial={{ name: g.name, description: g.description || "", category: g.category, privacy: g.privacy, posting: g.posting, rules: g.rules || "" }}
          submitLabel="Save changes"
          busy={busy}
          err={err}
          onSubmit={async (f) => {
            setBusy(true);
            const ok = await run(() => updateGroup(gid, f), "Saved");
            setBusy(false);
            if (ok) setEditing(false);
          }}
        />
      </Sheet>
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm === "delete" ? "Delete this group?" : "Leave this group?"}>
        <div className="space-y-4 p-4">
          <p className="text-sm text-zinc-400">
            {confirm === "delete"
              ? "The chat, pitches, meetings and watchlist are deleted for everyone. This can't be undone."
              : g.privacy === "public" ? "You can join again any time." : "You'll need to be let back in to rejoin."}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirm(null)} className={`${btn.quiet} flex-1`}>Cancel</button>
            <button
              onClick={async () => {
                const ok = await run(() => (confirm === "delete" ? deleteGroup(gid) : removeGroupMember(gid, uid)).then(() => {}));
                setConfirm(null);
                if (ok || confirm === "delete") onBack();
              }}
              className={`${btn.primary} flex-1 !bg-red-600`}
            >
              {confirm === "delete" ? "Delete" : "Leave"}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function BackBtn({ onBack }) {
  return (
    <button onClick={onBack} className="ss-tap -ml-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-medium text-zinc-400 hover:text-zinc-100">
      <Ic name="chevronLeft" size={18} /> Groups
    </button>
  );
}

// what non-members see
function Preview({ g }) {
  return (
    <div className="space-y-3">
      {g.rules && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-zinc-200"><Ic name="shield" size={15} /> Group rules</h3>
          <p className="whitespace-pre-line text-sm text-zinc-400">{g.rules}</p>
        </section>
      )}
      <section className="grid grid-cols-3 gap-2 text-center">
        {[
          [g.member_count, "members"],
          [g.idea_count, "stock pitches"],
          [(g.symbols || []).length, "stocks watched"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
            <div className="font-display text-2xl font-bold text-zinc-100">{n ?? 0}</div>
            <div className="text-xs text-zinc-500">{l}</div>
          </div>
        ))}
      </section>
      {(g.symbols || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {g.symbols.map((s) => (
            <span key={s.symbol} className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs font-semibold text-zinc-300">{s.symbol}</span>
          ))}
        </div>
      )}
      <p className="text-center text-sm text-zinc-500">Join to see the chat, vote on pitches and come to meetings.</p>
    </div>
  );
}

// ---------- chat ----------
function Chat({ g, uid, gid, run, onOpenStock, onOpenProfile }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const canPost = g.posting === "everyone" || g.is_admin;
  const posts = useMemo(() => [...(g.posts || [])].reverse(), [g.posts]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [posts.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const sym = body.match(TICKER_IN_TEXT)?.[1]?.toUpperCase() || null;
    const ok = await run(() => addGroupPost(uid, gid, body, sym));
    if (ok) setText("");
    setSending(false);
  }

  // group consecutive messages from the same person within 5 minutes
  const rows = posts.map((p, i) => {
    const prev = posts[i - 1];
    const cont = prev && prev.author?.id === p.author?.id && new Date(p.created_at) - new Date(prev.created_at) < 5 * 60_000;
    const day = new Date(p.created_at).toDateString();
    const newDay = !prev || new Date(prev.created_at).toDateString() !== day;
    return { p, cont: cont && !newDay, newDay };
  });

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {(g.pinned || []).length > 0 && (
        <div className="border-b border-zinc-800 bg-amber-500/5 px-4 py-3">
          {g.pinned.slice(0, 2).map((p) => (
            <div key={p.id} className="flex items-start gap-2 text-sm">
              <Ic name="pin" size={14} className="mt-0.5 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-zinc-100">{firstName(p.author?.full_name)}: </span>
                <span className="whitespace-pre-line text-zinc-300">{p.body}</span>
              </div>
              {g.is_admin && (
                <button onClick={() => run(() => pinGroupPost(p.id, false), "Unpinned")} className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300">Unpin</button>
              )}
            </div>
          ))}
        </div>
      )}
      <div ref={listRef} className="h-[58vh] overflow-y-auto px-3 py-3 md:h-[30rem]">
        {rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-zinc-500">
            <Ic name="chat" size={28} className="text-zinc-600" />
            {canPost ? "No messages yet. Say hi, or share what you're watching with $TICKER." : "Admins haven't posted anything yet."}
          </div>
        ) : (
          rows.map(({ p, cont, newDay }) => (
            <React.Fragment key={p.id}>
              {newDay && (
                <div className="my-3 text-center text-[11px] font-medium text-zinc-500">
                  {new Date(p.created_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </div>
              )}
              <div className={`flex gap-2 ${p.mine ? "flex-row-reverse" : ""} ${cont ? "mt-0.5" : "mt-2.5"}`}>
                {!p.mine && (
                  <div className="w-7 shrink-0 self-end">
                    {!cont && (
                      <button onClick={() => onOpenProfile?.(p.author?.id)}>
                        <Avatar url={p.author?.avatar_url} name={p.author?.full_name} size="xs" />
                      </button>
                    )}
                  </div>
                )}
                <div className={`group relative max-w-[80%] rounded-2xl px-3.5 py-2 ${p.mine ? "rounded-br-md bg-blue-500 text-white" : "rounded-bl-md bg-zinc-800 text-zinc-100"} ${p.pinned ? "ring-1 ring-amber-500/60" : ""}`}>
                  {!p.mine && !cont && <div className="text-[11px] font-semibold text-zinc-400">{p.author?.full_name}</div>}
                  {p.symbol && (
                    <button onClick={() => onOpenStock?.(p.symbol)} className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${p.mine ? "bg-white/20 text-white" : "bg-zinc-700 text-blue-400"}`}>
                      <Ic name="chart" size={11} /> {p.symbol}
                    </button>
                  )}
                  <div className="whitespace-pre-line break-words text-[15px] leading-snug">{p.body}</div>
                  <div className={`mt-0.5 flex items-center gap-2 text-[10px] ${p.mine ? "text-white/70" : "text-zinc-500"}`}>
                    {new Date(p.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    {g.is_admin && (
                      <button onClick={() => run(() => pinGroupPost(p.id, !p.pinned), p.pinned ? "Unpinned" : "Pinned to the top")} className="opacity-0 transition group-hover:opacity-100 focus:opacity-100">
                        {p.pinned ? "unpin" : "pin"}
                      </button>
                    )}
                    {(p.mine || g.is_admin) && (
                      <button onClick={() => run(() => deleteGroupPost(p.id))} className="opacity-0 transition group-hover:opacity-100 focus:opacity-100">delete</button>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          ))
        )}
      </div>
      {canPost ? (
        <div className="sticky bottom-16 flex items-end gap-2 border-t border-zinc-800 bg-zinc-900 p-2 sm:bottom-0">
          <textarea
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={g.posting === "admins" ? "Post an announcement…" : "Message the group… ($AAPL tags a stock)"}
            className={`${inputCls} max-h-32 min-h-11 flex-1 resize-none !rounded-3xl px-4 py-2.5`}
          />
          <button disabled={!text.trim() || sending} onClick={send} aria-label="Send"
            className="ss-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40">
            <Ic name="send" size={18} />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 border-t border-zinc-800 p-3 text-xs text-zinc-500">
          <Ic name="megaphone" size={13} /> Only admins post here. You'll get a notification when they do.
        </div>
      )}
    </section>
  );
}

// ---------- pitches ----------
function ideaReturn(i, quoteOf) {
  const px = quoteOf?.(i.symbol)?.quote?.c;
  if (px == null || !i.entry_price) return null;
  const r = (px / i.entry_price - 1) * 100;
  return i.stance === "bear" ? -r : r;
}

const STATUS = {
  open: ["Voting", "bg-blue-500/15 text-blue-500"],
  adopted: ["Adopted", "bg-emerald-500/15 text-emerald-500"],
  passed: ["Passed", "bg-zinc-800 text-zinc-400"],
  closed: ["Closed", "bg-zinc-800 text-zinc-400"],
};

function PitchForm({ uid, gid, run, getQuote, quoteOf, onDone }) {
  const [symbol, setSymbol] = useState("");
  const [stance, setStance] = useState("bull");
  const [thesis, setThesis] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const sym = symbol.trim().toUpperCase();

  async function submit(e) {
    e.preventDefault();
    if (!/^[A-Z0-9.\-]{1,12}$/.test(sym)) return setErr("Enter a ticker, like AAPL.");
    if (thesis.trim().length < 10) return setErr("Write a sentence or two on why.");
    setBusy(true);
    setErr(null);
    let entry = quoteOf?.(sym)?.quote?.c ?? null;
    if (entry == null && getQuote) {
      try {
        entry = (await getQuote(sym))?.c || null;
      } catch (_) {}
    }
    if (!entry) {
      setBusy(false);
      return setErr(`Couldn't find a price for ${sym}. Check the ticker.`);
    }
    const t = parseFloat(target);
    const ok = await run(() => addGroupIdea(uid, gid, { symbol: sym, stance, thesis: thesis.trim(), entry_price: entry, target_price: t > 0 ? t : null }), "Pitch posted. Members can vote now.");
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Stock">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 12))} placeholder="AAPL" className={`${inputCls} uppercase`} autoFocus />
        </Field>
        <Field label="Your call">
          <div className="flex rounded-xl border border-zinc-700 p-1">
            {[
              ["bull", "Buy", "up", "bg-emerald-600"],
              ["bear", "Avoid", "down", "bg-red-600"],
            ].map(([id, label, icon, on]) => (
              <button key={id} type="button" onClick={() => setStance(id)}
                className={`ss-tap inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-sm font-semibold ${stance === id ? `${on} text-white` : "text-zinc-400"}`}>
                <Ic name={icon} size={14} /> {label}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="Why? (your pitch)" hint="What does the company do, why now, and what could go wrong?">
        <textarea value={thesis} onChange={(e) => setThesis(e.target.value.slice(0, 1500))} rows={5} className={`${inputCls} resize-none`}
          placeholder="Earnings beat 3 quarters in a row, the new product is selling well, and it's cheaper than competitors. Risk: a slowdown in consumer spending." />
      </Field>
      <Field label="Price target (optional)">
        <input value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="e.g. 250" className={inputCls} />
      </Field>
      {err && <div className="text-sm text-red-400">{err}</div>}
      <button disabled={busy} className={`${btn.primary} w-full`}>{busy ? "Posting…" : "Post pitch"}</button>
      <p className="text-center text-xs text-zinc-500">Today's price is saved so the group can see how the call does.</p>
    </form>
  );
}

function IdeaCard({ i, g, uid, run, quoteOf, onOpenStock, onOpenProfile }) {
  const [more, setMore] = useState(false);
  const ret = ideaReturn(i, quoteOf);
  const px = quoteOf?.(i.symbol)?.quote?.c;
  const total = (i.yes || 0) + (i.no || 0);
  const yesPct = total ? Math.round((i.yes / total) * 100) : 0;
  const [label, tone] = STATUS[i.status] || STATUS.open;
  const open = i.status === "open";
  const long = i.thesis.length > 220;
  const vote = (v) => run(() => voteGroupIdea(uid, i.id, i.my_vote === v ? null : v));

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start gap-3">
        <button onClick={() => onOpenStock?.(i.symbol)}><TickerMono symbol={i.symbol} size={44} /></button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => onOpenStock?.(i.symbol)} className="font-display text-lg font-bold text-zinc-100 hover:underline">{i.symbol}</button>
            <StancePill stance={i.stance} className="!py-0.5" />
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>
          </div>
          <button onClick={() => onOpenProfile?.(i.author?.id)} className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300">
            <Avatar url={i.author?.avatar_url} name={i.author?.full_name} size="xs" className="!h-5 !w-5 !text-[8px]" />
            {i.mine ? "You" : i.author?.full_name} · {timeAgoShort(i.created_at)}
          </button>
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-display text-lg font-bold tabular-nums ${pctColor(ret)}`}>{ret == null ? "…" : signedPct(ret)}</div>
          <div className="text-[11px] text-zinc-500">since pitch</div>
        </div>
      </div>

      <p className={`mt-3 whitespace-pre-line text-[15px] leading-relaxed text-zinc-300 ${!more && long ? "line-clamp-4" : ""}`}>{i.thesis}</p>
      {long && (
        <button onClick={() => setMore((m) => !m)} className="mt-1 text-sm font-medium text-zinc-500 hover:text-zinc-300">{more ? "Show less" : "Read more"}</button>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-zinc-950/50 p-2.5 text-center text-xs">
        <div>
          <div className="text-zinc-500">Pitched at</div>
          <div className="font-semibold tabular-nums text-zinc-200">{i.entry_price ? money(Number(i.entry_price)) : "–"}</div>
        </div>
        <div>
          <div className="text-zinc-500">Now</div>
          <div className="font-semibold tabular-nums text-zinc-200">{px != null ? money(px) : "…"}</div>
        </div>
        <div>
          <div className="text-zinc-500">Target</div>
          <div className="font-semibold tabular-nums text-zinc-200">{i.target_price ? money(Number(i.target_price)) : "–"}</div>
        </div>
      </div>

      {/* votes */}
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-zinc-500">
          <span>{total ? `${yesPct}% say yes` : "No votes yet"}</span>
          <span>{total} vote{total === 1 ? "" : "s"}</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
          {total > 0 && (
            <>
              <div className="bg-emerald-500" style={{ width: `${yesPct}%` }} />
              <div className="bg-red-500" style={{ width: `${100 - yesPct}%` }} />
            </>
          )}
        </div>
        {open && (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button onClick={() => vote("yes")}
              className={`ss-tap inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition ${
                i.my_vote === "yes" ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-700 text-zinc-200 hover:border-emerald-500"
              }`}>
              <Ic name="check" size={16} /> Yes, I'm in
            </button>
            <button onClick={() => vote("no")}
              className={`ss-tap inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition ${
                i.my_vote === "no" ? "border-red-500 bg-red-500 text-white" : "border-zinc-700 text-zinc-200 hover:border-red-500"
              }`}>
              <Ic name="x" size={16} /> Not convinced
            </button>
          </div>
        )}
      </div>

      {(g.is_admin || i.mine) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
          {g.is_admin && open && (
            <>
              <button onClick={() => run(() => setIdeaStatus(i.id, "adopted"), `${i.symbol} adopted by the group`)} className={`${btn.soft} !min-h-9 !px-3 !text-xs`}><Ic name="check" size={14} /> Adopt</button>
              <button onClick={() => run(() => setIdeaStatus(i.id, "passed"), "Marked as passed")} className={`${btn.soft} !min-h-9 !px-3 !text-xs`}>Pass</button>
            </>
          )}
          {g.is_admin && i.status === "adopted" && (
            <button onClick={() => run(() => setIdeaStatus(i.id, "closed"), "Position closed")} className={`${btn.soft} !min-h-9 !px-3 !text-xs`}>Close position</button>
          )}
          {g.is_admin && !open && (
            <button onClick={() => run(() => setIdeaStatus(i.id, "open"), "Voting reopened")} className={`${btn.soft} !min-h-9 !px-3 !text-xs`}>Reopen voting</button>
          )}
          <button onClick={() => run(() => deleteGroupIdea(i.id), "Pitch deleted")} className="ml-auto text-xs text-zinc-500 hover:text-red-400">Delete</button>
        </div>
      )}
    </article>
  );
}

function Pitches({ g, uid, gid, run, quoteOf, getQuote, onOpenStock, onOpenProfile }) {
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState("all");
  const ideas = g.ideas || [];
  const adopted = ideas.filter((i) => i.status === "adopted" || i.status === "closed");
  const rets = adopted.map((i) => ideaReturn(i, quoteOf)).filter((x) => x != null);
  const avg = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null;
  const wins = rets.filter((r) => r > 0).length;
  const shown = ideas.filter((i) => filter === "all" || (filter === "open" ? i.status === "open" : i.status === "adopted" || i.status === "closed"));

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-zinc-100">Stock pitches</h3>
            <p className="text-sm text-zinc-500">Pitch a stock, the group votes, and the app tracks how every call does.</p>
          </div>
          <button onClick={() => setComposing(true)} className={`${btn.primary} shrink-0 !min-h-10 !px-4`}><Ic name="plus" size={16} /> Pitch</button>
        </div>
        {adopted.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-zinc-950/50 p-2">
              <div className="font-display text-lg font-bold text-zinc-100">{adopted.length}</div>
              <div className="text-[11px] text-zinc-500">adopted</div>
            </div>
            <div className="rounded-xl bg-zinc-950/50 p-2">
              <div className={`font-display text-lg font-bold ${pctColor(avg)}`}>{avg == null ? "…" : signedPct(avg)}</div>
              <div className="text-[11px] text-zinc-500">avg return</div>
            </div>
            <div className="rounded-xl bg-zinc-950/50 p-2">
              <div className="font-display text-lg font-bold text-zinc-100">{rets.length ? `${wins}/${rets.length}` : "…"}</div>
              <div className="text-[11px] text-zinc-500">winning</div>
            </div>
          </div>
        )}
      </section>

      {ideas.length > 0 && (
        <div className="flex gap-1.5">
          {[
            ["all", "All"],
            ["open", "Voting"],
            ["adopted", "Adopted"],
          ].map(([id, l]) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`ss-tap rounded-full border px-3 py-1.5 text-sm font-medium ${filter === id ? "border-zinc-100 bg-zinc-100 text-zinc-950" : "border-zinc-700 text-zinc-300"}`}>{l}</button>
          ))}
        </div>
      )}

      {ideas.length === 0 ? (
        <EmptyState icon="bulb" title="No pitches yet" action={<button onClick={() => setComposing(true)} className={btn.primary}>Pitch the first stock</button>}>
          This is how investing clubs decide what to buy: one person makes the case, everyone votes, and the record shows who's good at it.
        </EmptyState>
      ) : shown.length === 0 ? (
        <div className="py-6 text-center text-sm text-zinc-500">Nothing here.</div>
      ) : (
        shown.map((i) => <IdeaCard key={i.id} i={i} g={g} uid={uid} run={run} quoteOf={quoteOf} onOpenStock={onOpenStock} onOpenProfile={onOpenProfile} />)
      )}

      <Sheet open={composing} onClose={() => setComposing(false)} title="Pitch a stock">
        <PitchForm uid={uid} gid={gid} run={run} getQuote={getQuote} quoteOf={quoteOf} onDone={() => setComposing(false)} />
      </Sheet>
    </div>
  );
}

// ---------- shared watchlist ----------
function Watchlist({ g, uid, gid, run, quoteOf, onOpenStock, onAddToWatchlist, mySymbols }) {
  const [sym, setSym] = useState("");
  const mine = new Set(mySymbols || []);
  const add = () => sym && run(() => addGroupSymbol(uid, gid, sym), `${sym} added`).then((ok) => ok && setSym(""));
  const rows = (g.symbols || []).map((s) => ({ ...s, q: quoteOf?.(s.symbol)?.quote })).sort((a, b) => (b.q?.dp ?? -1e9) - (a.q?.dp ?? -1e9));

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="font-display text-lg font-bold text-zinc-100">Shared watchlist</h3>
      <p className="mb-3 text-sm text-zinc-500">Stocks the group is keeping an eye on, best performer today first.</p>
      <div className="mb-3 flex gap-2">
        <input value={sym} onChange={(e) => setSym(e.target.value.toUpperCase().slice(0, 12))} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a ticker" className={`${inputCls} uppercase`} />
        <button disabled={!sym} onClick={add} className={`${btn.primary} shrink-0 !px-4`}>Add</button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">Add stocks the group is watching together.</div>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {rows.map((s) => {
            const up = s.q?.dp >= 0;
            return (
              <li key={s.symbol} className="flex items-center gap-3 py-2.5">
                <button onClick={() => onOpenStock?.(s.symbol)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <TickerMono symbol={s.symbol} size={36} />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-zinc-100">{s.symbol}</span>
                    <span className="block truncate text-xs text-zinc-500">added by {s.mine ? "you" : firstName(s.by?.full_name)}</span>
                  </span>
                </button>
                <span className="text-right tabular-nums">
                  <span className="block text-sm font-semibold text-zinc-100">{s.q ? money(s.q.c) : "…"}</span>
                  {s.q && <span className={`block text-xs font-semibold ${up ? "text-emerald-500" : "text-red-500"}`}>{signedPct(s.q.dp, 2)}</span>}
                </span>
                {mine.has(s.symbol) ? (
                  <span title="On your list" className="flex h-9 w-9 items-center justify-center text-zinc-500"><Ic name="check" size={16} /></span>
                ) : (
                  <button onClick={() => onAddToWatchlist?.(s.symbol)} title="Add to my stocks" className={`${btn.icon} !h-9 !w-9 text-blue-500`}><Ic name="plus" size={16} /></button>
                )}
                {(s.mine || g.is_admin) && (
                  <button onClick={() => run(() => removeGroupSymbol(gid, s.symbol))} title="Remove" className={`${btn.icon} !h-9 !w-9 text-zinc-500`}><Ic name="x" size={15} /></button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// this month's pick challenge, ranked among the group's members, with a podium
function GroupChallenge({ gid, ensureSymbols, quoteOf, onOpenStock, onJoinChallenge }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    groupChallengeBoard(gid, monthKey()).then(setRows).catch(() => setRows([]));
  }, [gid]);
  const key = [...new Set((rows || []).flatMap((r) => r.symbols))].join(",");
  useEffect(() => {
    if (!key || !ensureSymbols) return;
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
            const px = quoteOf?.(s)?.quote?.c;
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
  const top = [ranked[1], ranked[0], ranked[2]];
  const place = [2, 1, 3];
  const height = ["h-14", "h-20", "h-10"];
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-zinc-100">{month} challenge</h3>
        {!mine && <button onClick={onJoinChallenge} className="text-sm font-semibold text-blue-500 hover:underline">Join</button>}
      </div>
      <p className="mb-3 text-sm text-zinc-500">Everyone picks 3 stocks for the month. Best average return wins.</p>
      {!rows ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : ranked.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">No one in the group has picked yet. Pick 3 stocks in Compete and you'll show up here.</div>
      ) : (
        <>
          <div className="flex items-end justify-center gap-2 pt-2">
            {top.map((r, i) =>
              r ? (
                <div key={r.user?.id || i} className="flex w-1/3 max-w-[7rem] flex-col items-center">
                  {place[i] === 1 && <Ic name="crown" size={16} className="mb-0.5 text-amber-400" />}
                  <Avatar url={r.user?.avatar_url} name={r.user?.full_name} size={place[i] === 1 ? "sm" : "xs"} />
                  <div className="mt-1 w-full truncate text-center text-xs font-semibold text-zinc-200">{r.me ? "You" : firstName(r.user?.full_name)}</div>
                  <div className={`text-xs font-semibold tabular-nums ${pctColor(r.ret)}`}>{r.ret == null ? "…" : signedPct(r.ret, 2)}</div>
                  <div className={`mt-1 flex w-full items-start justify-center rounded-t-lg pt-1 text-sm font-bold ${height[i]} ${place[i] === 1 ? "bg-amber-400/25 text-amber-400" : "bg-zinc-800 text-zinc-400"}`}>{place[i]}</div>
                </div>
              ) : (
                <div key={i} className="w-1/3 max-w-[7rem]" />
              )
            )}
          </div>
          {ranked.length > 3 && (
            <ol className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3">
              {ranked.slice(3).map((r, j) => (
                <li key={r.user?.id || j} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-center text-zinc-500">{j + 4}</span>
                  <Avatar url={r.user?.avatar_url} name={r.user?.full_name} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-zinc-300">
                    {r.me ? "You" : r.user?.full_name}
                    <span className="ml-1.5 text-[11px] text-zinc-500">
                      {r.symbols.map((s) => (
                        <button key={s} onClick={() => onOpenStock?.(s)} className="mr-1 hover:text-blue-400">{s}</button>
                      ))}
                    </span>
                  </span>
                  <span className={`text-xs font-semibold tabular-nums ${pctColor(r.ret)}`}>{r.ret == null ? "…" : signedPct(r.ret, 2)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

// ---------- meetings ----------
function Meetings({ g, uid, gid, run }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: "", when: "", location: "", details: "" });
  const events = g.events || [];

  async function save(e) {
    e.preventDefault();
    if (!f.title.trim() || !f.when) return;
    const ok = await run(
      () => addGroupEvent(uid, gid, { title: f.title.trim(), starts_at: new Date(f.when).toISOString(), location: f.location.trim() || null, details: f.details.trim() || null }),
      "Meeting added. Members were notified."
    );
    if (ok) {
      setAdding(false);
      setF({ title: "", when: "", location: "", details: "" });
    }
  }

  return (
    <div className="space-y-3">
      <section className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div>
          <h3 className="font-display text-lg font-bold text-zinc-100">Meetings</h3>
          <p className="text-sm text-zinc-500">Club meetings, calls and pitch nights. RSVP so the host knows who's coming.</p>
        </div>
        {g.is_admin && <button onClick={() => setAdding(true)} className={`${btn.primary} shrink-0 !min-h-10 !px-4`}><Ic name="plus" size={16} /> Add</button>}
      </section>
      {events.length === 0 ? (
        <EmptyState icon="calendar" title="Nothing scheduled">
          {g.is_admin ? "Add your next meeting and everyone in the group gets a notification." : "When an admin schedules a meeting, it shows up here."}
        </EmptyState>
      ) : (
        events.map((ev) => {
          const d = new Date(ev.starts_at);
          const isLink = /^https?:\/\//i.test(ev.location || "");
          return (
            <article key={ev.id} className="flex gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-blue-500/10 py-2 text-blue-500">
                <span className="text-[11px] font-bold uppercase">{d.toLocaleDateString(undefined, { month: "short" })}</span>
                <span className="font-display text-2xl font-bold leading-none">{d.getDate()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-zinc-100">{ev.title}</div>
                <div className="text-sm text-zinc-400">
                  {d.toLocaleDateString(undefined, { weekday: "long" })} · {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </div>
                {ev.location &&
                  (isLink ? (
                    <a href={ev.location} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-blue-500 hover:underline">
                      <Ic name="link" size={13} /> Join call
                    </a>
                  ) : (
                    <div className="mt-0.5 flex items-center gap-1 text-sm text-zinc-400"><Ic name="pin" size={13} /> {ev.location}</div>
                  ))}
                {ev.details && <p className="mt-1.5 whitespace-pre-line text-sm text-zinc-400">{ev.details}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button onClick={() => run(() => rsvpGroupEvent(uid, ev.id, true))}
                    className={`ss-tap inline-flex min-h-9 items-center gap-1 rounded-full border px-3.5 text-sm font-semibold ${ev.me_going === true ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-700 text-zinc-200"}`}>
                    <Ic name="check" size={14} /> Going
                  </button>
                  <button onClick={() => run(() => rsvpGroupEvent(uid, ev.id, false))}
                    className={`ss-tap inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-semibold ${ev.me_going === false ? "border-zinc-500 bg-zinc-700 text-white" : "border-zinc-700 text-zinc-400"}`}>
                    Can't make it
                  </button>
                  <span className="text-xs text-zinc-500">{ev.going} going</span>
                  {g.is_admin && <button onClick={() => run(() => deleteGroupEvent(ev.id), "Meeting removed")} className="ml-auto text-xs text-zinc-500 hover:text-red-400">Remove</button>}
                </div>
              </div>
            </article>
          );
        })
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title="New meeting">
        <form onSubmit={save} className="space-y-4 p-4">
          <Field label="Title">
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value.slice(0, 100) })} placeholder="Weekly pitch night" className={inputCls} autoFocus />
          </Field>
          <Field label="When">
            <input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Where" hint="A room, an address, or a video call link.">
            <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value.slice(0, 300) })} placeholder="Library room 2, or https://meet.google.com/…" className={inputCls} />
          </Field>
          <Field label="Details (optional)">
            <textarea value={f.details} onChange={(e) => setF({ ...f, details: e.target.value.slice(0, 1000) })} rows={3} placeholder="Bring one stock to pitch. 5 minutes each." className={`${inputCls} resize-none`} />
          </Field>
          <button disabled={!f.title.trim() || !f.when} className={`${btn.primary} w-full`}>Add meeting</button>
        </form>
      </Sheet>
    </div>
  );
}

// ---------- members ----------
function Members({ g, uid, gid, run, onOpenProfile }) {
  const [adding, setAdding] = useState(false);
  const [connections, setConnections] = useState(null);
  const [manage, setManage] = useState(null);
  const [filter, setFilter] = useState("");
  const memberIds = new Set((g.members || []).map((m) => m.id));
  const requests = g.requests || [];
  const list = (g.members || []).filter((m) => `${m.full_name} ${m.username}`.toLowerCase().includes(filter.trim().toLowerCase()));

  useEffect(() => {
    if (adding && connections === null) myNetwork().then((n) => setConnections(n.connections || [])).catch(() => setConnections([]));
  }, [adding, connections]);

  return (
    <div className="space-y-3">
      {g.is_admin && requests.length > 0 && (
        <section className="rounded-2xl border border-blue-500/40 bg-zinc-900 p-4">
          <h3 className="mb-2 font-display text-base font-bold text-zinc-100">Want to join ({requests.length})</h3>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                <button onClick={() => onOpenProfile?.(r.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar url={r.avatar_url} name={r.full_name} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-100">{r.full_name}</span>
                    <span className="block truncate text-xs text-zinc-500">{r.note ? `"${r.note}"` : `@${r.username}`}</span>
                  </span>
                </button>
                <button onClick={() => run(() => respondGroupRequest(gid, r.id, true), `${firstName(r.full_name)} is in`)} className={`${btn.primary} !min-h-9 !px-3.5`}>Accept</button>
                <button onClick={() => run(() => respondGroupRequest(gid, r.id, false))} className={`${btn.quiet} !min-h-9 !px-3.5`}>Decline</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-zinc-100">Members ({g.members.length})</h3>
          <button onClick={() => setAdding(true)} className={`${btn.soft} !min-h-9 !px-3.5`}><Ic name="userPlus" size={15} /> Add friends</button>
        </div>
        {g.members.length > 8 && <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search members" className={`${inputCls} mb-3`} />}
        <ul className="space-y-1">
          {list.map((m) => {
            const canManage = m.id !== uid && m.role !== "owner" && (g.is_owner || (g.is_admin && m.role === "member"));
            return (
              <li key={m.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                <button onClick={() => m.id !== uid && onOpenProfile?.(m.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar url={m.avatar_url} name={m.full_name} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-zinc-100">{m.id === uid ? "You" : m.full_name}</span>
                      <RoleChip role={m.role || (m.owner ? "owner" : "member")} />
                    </span>
                    <span className="block truncate text-xs text-zinc-500">@{m.username}{m.joined ? ` · joined ${timeAgoShort(m.joined)}` : ""}</span>
                  </span>
                </button>
                {canManage && (
                  <button onClick={() => setManage(m)} aria-label="Manage" className={`${btn.icon} !h-9 !w-9`}><Ic name="more" size={18} /></button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {g.rules && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-zinc-200"><Ic name="shield" size={15} /> Group rules</h3>
          <p className="whitespace-pre-line text-sm text-zinc-400">{g.rules}</p>
        </section>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add friends">
        <div className="p-2">
          {connections === null ? (
            <div className="p-4"><Skeleton className="h-10" /></div>
          ) : connections.filter((c) => !memberIds.has(c.id)).length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">All your connections are already here. To add anyone else, share the invite link from the group menu.</p>
          ) : (
            connections
              .filter((c) => !memberIds.has(c.id))
              .map((c) => (
                <button key={c.id} onClick={() => run(() => addGroupMember(uid, gid, c.id), `${firstName(c.full_name)} added`)}
                  className="ss-tap flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-zinc-800">
                  <Avatar url={c.avatar_url} name={c.full_name} size="xs" />
                  <span className="flex-1 truncate text-sm text-zinc-100">{c.full_name}</span>
                  <span className="text-sm font-semibold text-blue-500">Add</span>
                </button>
              ))
          )}
        </div>
      </Sheet>
      <Sheet open={!!manage} onClose={() => setManage(null)} title={manage?.full_name}>
        {manage && (
          <ActionList
            items={[
              g.is_owner && manage.role === "member" && { icon: "shield", label: "Make admin", onClick: () => (setManage(null), run(() => setGroupRole(gid, manage.id, "admin"), "Now an admin")) },
              g.is_owner && manage.role === "admin" && { icon: "user", label: "Remove admin role", onClick: () => (setManage(null), run(() => setGroupRole(gid, manage.id, "member"), "Admin role removed")) },
              { icon: "logout", label: "Remove from group", danger: true, onClick: () => (setManage(null), run(() => removeGroupMember(gid, manage.id), "Removed")) },
            ]}
          />
        )}
      </Sheet>
    </div>
  );
}

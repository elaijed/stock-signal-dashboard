import React, { useEffect, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import { myInviteStats } from "../social/api.js";
import { levelFor, LEVELS } from "./levels.js";
import { GameStyles, Burst, store } from "./fx.jsx";

export const XP_WAYS = [
  { icon: "target", text: "Make the Call of the Day", xp: "+10" },
  { icon: "check", text: "Your call was right", xp: "+15" },
  { icon: "pen", text: "Post, poll or note", xp: "+10" },
  { icon: "briefcase", text: "Practice trade", xp: "+5" },
  { icon: "heart", text: "Like / comment you get", xp: "+2 / +3" },
  { icon: "userPlus", text: "Friend joins and sets up", xp: "+100" },
];

// Compact XP + level card. Pass `xp` to show a known number, otherwise it reads
// my_invite_stats().xp itself (re-read whenever `refreshKey` changes).
const DEFAULT_API = { myInviteStats };

export default function XpCard({ uid, xp: xpProp, refreshKey, onMilestone, api = DEFAULT_API, compact = false }) {
  const [xpLoaded, setXpLoaded] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(!compact);
  const [party, setParty] = useState(null);

  useEffect(() => {
    if (xpProp != null || !uid) return;
    let alive = true;
    api
      .myInviteStats()
      .then((s) => alive && (setXpLoaded(Number(s?.xp) || 0), setFailed(false)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [uid, xpProp, refreshKey, api]);

  const xp = xpProp ?? xpLoaded;
  const l = xp == null ? null : levelFor(xp);

  // celebrate a level-up once per person (first sighting just records the level)
  useEffect(() => {
    if (!uid || !l) return;
    const key = `sg.level.${uid}`;
    const prev = store.get(key, null);
    if (prev == null) store.set(key, l.level);
    else if (l.level > prev) {
      store.set(key, l.level);
      setParty(l.level);
      onMilestone?.(`Reached level ${l.level}: ${l.name}`, `Earned ${xp} XP on signals.`);
    }
  }, [uid, l?.level]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!uid || failed || !l) {
    if (failed || !uid) return null;
    return <div className="h-24 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900" />;
  }

  return (
    <section className="relative rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <GameStyles />
      {party && <Burst key={party} />}
      <div className="flex items-center gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white">
          <span className="font-display text-xl font-bold leading-none">{l.level}</span>
          <Ic name="star" size={12} fill="currentColor" className="absolute -right-1 -top-1 rounded-full bg-zinc-900 p-0.5 text-blue-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="truncate font-display text-lg font-bold text-zinc-100">
              {l.name}
              <span className="ml-1.5 text-xs font-medium text-zinc-500">Level {l.level}</span>
            </div>
            <div className="shrink-0 text-xs font-semibold text-blue-500">{xp.toLocaleString("en-US")} XP</div>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-blue-500 transition-[width] duration-700" style={{ width: `${Math.max(3, l.progress * 100)}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {l.next ? `${(l.next - xp).toLocaleString("en-US")} XP to ${LEVELS[l.level].name}` : "Top level reached"}
          </div>
        </div>
      </div>
      {party && (
        <div className="sg-rise mt-3 rounded-lg bg-blue-500/15 px-3 py-2 text-sm font-semibold text-blue-500">
          Level up! You reached level {l.level}: {l.name}.
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="mt-3 text-xs font-medium text-blue-400 hover:underline">
        {open ? "Hide how to earn XP" : "How to earn XP"}
      </button>
      {open && (
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {XP_WAYS.map((w) => (
            <li key={w.text} className="flex items-center gap-2 text-xs text-zinc-400">
              <Ic name={w.icon} size={13} className="text-zinc-500" />
              <span className="flex-1">{w.text}</span>
              <span className="font-semibold text-zinc-200">{w.xp}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

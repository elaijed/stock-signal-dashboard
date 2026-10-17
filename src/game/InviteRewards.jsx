import React, { useEffect, useRef, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import { myInviteStats, shareMyKey, unshareMyKey, inviteLink } from "../social/api.js";
import { GameStyles, store } from "./fx.jsx";

// Friends count once they joined through your link AND have 3+ stocks on their list.
export const TIERS = [
  { n: 1, icon: "handshake", title: "Connector", perks: ["Connector badge"] },
  { n: 3, icon: "sparkles", title: "Style unlocked", perks: ["+$5,000 practice money", "Custom profile look"] },
  { n: 5, icon: "crown", title: "Founding Member", perks: ["Founding Member badge", "Animated profile ring", "Early access to new features", "+$25,000 practice money"] },
  { n: 10, icon: "trophy", title: "Top recruiter", perks: ["Name on the Top recruiters board", "Custom flair on your posts"] },
  { n: 25, icon: "rocket", title: "Ambassador", perks: ["Ambassador title", "Suggest a feature and we build it"] },
];
export const INVITEE_BONUS = 2500;

// Total pretend dollars earned so far (App adds the difference to paper.cash once).
export function practiceBonus({ qualified = 0, invitedBy = false } = {}) {
  return (qualified >= 3 ? 5000 : 0) + (qualified >= 5 ? 25000 : 0) + (invitedBy ? INVITEE_BONUS : 0);
}

// What someone has unlocked (for badges, ring, flair elsewhere in the app).
export function invitePerks({ qualified = 0, founding = false } = {}) {
  return {
    connector: qualified >= 1,
    customLook: qualified >= 3,
    foundingMember: qualified >= 5 || !!founding,
    ring: qualified >= 5 || !!founding,
    earlyAccess: qualified >= 5,
    topRecruiter: qualified >= 10,
    flair: qualified >= 10,
    ambassador: qualified >= 25,
  };
}

// Animated gradient ring around an avatar (Founding Members / 5+ invites).
export function RingAvatar({ on = true, size, thickness = 3, children, className = "" }) {
  if (!on) return children;
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${className}`} style={{ padding: thickness, width: size, height: size }}>
      <GameStyles />
      <span
        aria-hidden="true"
        className="sg-ring absolute inset-0 rounded-full"
        style={{ backgroundImage: "conic-gradient(from 0deg, #ff5b2e, #f5b52e, #1fa95a, #ff9f7a, #ff5b2e)" }}
      />
      <span className="relative inline-flex rounded-full bg-zinc-900 p-[2px]">{children}</span>
    </span>
  );
}

const DEFAULT_API = { myInviteStats, shareMyKey, unshareMyKey, inviteLink };
const money = (n) => `$${n.toLocaleString("en-US")}`;

export default function InviteRewards({ uid, apiKey, onClaim, api = DEFAULT_API }) {
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | soon
  const [copied, setCopied] = useState(false);
  const [keyOn, setKeyOn] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyErr, setKeyErr] = useState("");
  const claimed = useRef(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    api
      .myInviteStats()
      .then((s) => {
        if (!alive) return;
        setStats(s || {});
        setStatus("ready");
      })
      .catch(() => alive && setStatus("soon"));
    return () => {
      alive = false;
    };
  }, [uid, api]);

  // key sharing: default ON when there's a key, unless the person turned it off
  useEffect(() => {
    if (status !== "ready" || !uid) return;
    const pref = store.get(`sg.keyshare.${uid}`, null); // 'on' | 'off' | null
    const want = pref ? pref === "on" : !!apiKey;
    setKeyOn(want && !!apiKey);
    if (!apiKey) return;
    const fp = apiKey.slice(-6);
    if (want && (!stats?.key_shared || store.get(`sg.keyshare.fp.${uid}`, "") !== fp)) {
      api.shareMyKey(uid, apiKey).then(() => store.set(`sg.keyshare.fp.${uid}`, fp)).catch(() => {});
    }
  }, [status, uid, apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const qualified = Number(stats?.qualified) || 0;
  const joined = Number(stats?.joined) || 0;
  const bonus = practiceBonus({ qualified, invitedBy: !!stats?.invited_by });
  useEffect(() => {
    if (status === "ready" && claimed.current !== bonus) {
      claimed.current = bonus;
      onClaim?.(bonus);
    }
  }, [status, bonus, onClaim]);

  async function toggleKey() {
    if (!apiKey || keyBusy) return;
    const next = !keyOn;
    setKeyBusy(true);
    setKeyErr("");
    try {
      if (next) {
        await api.shareMyKey(uid, apiKey);
        store.set(`sg.keyshare.fp.${uid}`, apiKey.slice(-6));
      } else await api.unshareMyKey(uid);
      store.set(`sg.keyshare.${uid}`, next ? "on" : "off");
      setKeyOn(next);
    } catch (_) {
      setKeyErr("Couldn't change that right now. Try again.");
    } finally {
      setKeyBusy(false);
    }
  }

  const head = (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <Ic name="gift" size={13} className="text-blue-500" /> Invite friends, earn rewards
      </h2>
      {status === "soon" && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400">Coming soon</span>}
    </div>
  );

  if (!uid) return null;
  if (status === "loading")
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        {head}
        <div className="h-32 animate-pulse rounded-xl bg-zinc-800/50" />
      </section>
    );
  if (status === "soon")
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        {head}
        <p className="text-sm leading-relaxed text-zinc-400">
          Soon you'll earn badges, practice money and a Founding Member ring for every friend who joins through your link and adds a few stocks.
        </p>
      </section>
    );

  const code = stats?.code;
  const link = code ? api.inviteLink(code) : "";
  const nextTier = TIERS.find((t) => t.n > qualified);
  const prevN = [...TIERS].reverse().find((t) => t.n <= qualified)?.n || 0;
  const barPct = nextTier ? ((qualified - prevN) / (nextTier.n - prevN)) * 100 : 100;
  const notSetUp = Math.max(0, joined - qualified);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {}
  }
  async function share() {
    const data = { title: "signals.", text: "Join me on signals. Practice investing with pretend money and make the daily stock call.", url: link };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch (_) {}
    } else copy();
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <GameStyles />
      {head}

      {/* link */}
      {code ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1 truncate rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300" title={link}>
            {link}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button onClick={copy} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700">
              <Ic name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={share} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-600">
              <Ic name="share" size={14} /> Share
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-400">Create your profile to get your personal invite link.</p>
      )}

      {/* progress */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-zinc-100">
            {nextTier ? (
              <>
                {qualified} of {nextTier.n} friends joined
                <span className="text-zinc-500"> · {nextTier.n - qualified} more for {nextTier.title}</span>
              </>
            ) : (
              `${qualified} friends joined · every reward unlocked`
            )}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-blue-500 transition-[width] duration-700" style={{ width: `${Math.max(qualified ? 4 : 0, barPct)}%` }} />
        </div>
        {notSetUp > 0 && (
          <p className="mt-1.5 text-xs text-zinc-500">
            Joined but not set up yet: {notSetUp}. They count once they add 3 stocks to their list.
          </p>
        )}
      </div>

      {/* ladder */}
      <ol className="mt-4 space-y-2">
        {TIERS.map((t) => {
          const got = qualified >= t.n;
          const isNext = nextTier?.n === t.n;
          return (
            <li
              key={t.n}
              className={`flex items-start gap-3 rounded-xl border p-3 ${got ? "border-blue-500/40 bg-blue-500/10" : isNext ? "border-zinc-700 bg-zinc-900" : "border-zinc-800 bg-zinc-900 opacity-70"}`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${got ? "bg-blue-500 text-white" : "bg-zinc-800 text-zinc-500"}`}>
                <Ic name={got ? t.icon : "lock"} size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-display text-sm font-bold ${got ? "text-zinc-100" : "text-zinc-300"}`}>{t.title}</span>
                  <span className={`shrink-0 text-[11px] font-semibold ${got ? "text-blue-500" : "text-zinc-500"}`}>
                    {got ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Ic name="check" size={12} /> Unlocked
                      </span>
                    ) : (
                      `${t.n} ${t.n === 1 ? "friend" : "friends"}`
                    )}
                  </span>
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-zinc-500">{t.perks.join(" · ")}</div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* extras */}
      <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
        <p className="flex items-start gap-1.5">
          <Ic name="coins" size={13} className="mt-0.5 text-zinc-500" />
          Friends who join through your link start with +{money(INVITEE_BONUS)} practice money.
        </p>
        {stats?.founding && (
          <p className="flex items-start gap-1.5 font-medium text-blue-500">
            <Ic name="crown" size={13} className="mt-0.5" />
            You're one of our first 100 members: the Founding badge is yours.
          </p>
        )}
        {stats?.invited_by && (
          <p className="flex items-start gap-1.5">
            <Ic name="gift" size={13} className="mt-0.5" />
            You joined through {stats.invited_by.full_name || stats.invited_by.username || "a friend"}'s link: +{money(INVITEE_BONUS)} practice money.
          </p>
        )}
        {bonus > 0 && (
          <p className="flex items-start gap-1.5 font-medium text-zinc-300">
            <Ic name="briefcase" size={13} className="mt-0.5" />
            Practice money earned so far: {money(bonus)}
          </p>
        )}
      </div>

      {/* key sharing */}
      {apiKey && (
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-sm font-medium text-zinc-200">Share my market data key with friends I invite</span>
            <button
              type="button"
              role="switch"
              aria-checked={keyOn}
              disabled={keyBusy}
              onClick={toggleKey}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${keyOn ? "bg-blue-500" : "bg-zinc-700"} disabled:opacity-60`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${keyOn ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Friends who join through your link can see live prices right away using your free key. Everyone shares its limit of 60 requests a minute.
          </p>
          {keyErr && <p className="mt-1 text-xs text-red-400">{keyErr}</p>}
        </div>
      )}
    </section>
  );
}

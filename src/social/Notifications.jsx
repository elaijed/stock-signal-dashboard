import React, { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import { markNotificationsRead } from "./api.js";
import { timeAgoShort } from "./Feed.jsx";

function text(n) {
  const d = n.data || {};
  const sym = d.symbol ? ` on ${d.symbol}` : "";
  switch (n.kind) {
    case "request":
      return `wants to connect${d.note ? `: “${d.note}”` : ""}`;
    case "accepted":
      return "accepted your connection request";
    case "joined":
      return "joined through your invite link — you're now connected ";
    case "reaction":
      return `reacted ${d.emoji || ""} to your post${sym}`;
    case "comment":
      return `commented${sym}: “${d.body || ""}”`;
    case "reply":
      return `also commented${sym}: “${d.body || ""}”`;
    case "vote":
      return `voted ${d.choice === "bull" ? "bullish" : "bearish"} on your poll${sym}`;
    case "share":
      return `shared ${d.symbol || "a stock"} with you${d.note ? `: “${d.note}”` : ""}`;
    case "group_post":
      return `posted in “${d.name || "your group"}”: “${d.body || ""}”`;
    case "group_add":
      return `added you to the group “${d.name || ""}”`;
    default:
      return n.kind;
  }
}

export default function NotificationsBell({ uid, items, onRefresh, onOpen }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unread = (items || []).filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await markNotificationsRead(uid).catch(() => {});
      onRefresh?.();
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        title="Notifications"
        className="relative rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition hover:text-zinc-100"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed left-4 right-4 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-[22rem]">
          <div className="sticky top-0 border-b border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-100">Notifications</div>
          {!items?.length ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">No notifications yet.</div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setOpen(false);
                  onOpen?.(n);
                }}
                className={`flex w-full items-start gap-3 border-b border-zinc-800/60 px-4 py-3 text-left hover:bg-zinc-800/50 ${n.read ? "" : "bg-blue-950/20"}`}
              >
                <Avatar url={n.actor?.avatar_url} name={n.actor?.full_name} size="xs" />
                <span className="min-w-0 flex-1 text-sm text-zinc-300">
                  <span className="font-semibold text-zinc-100">{n.actor?.full_name || "Someone"}</span> {text(n)}
                  <span className="block text-[11px] text-zinc-600">{timeAgoShort(n.created_at)}</span>
                </span>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

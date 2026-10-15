import React, { useEffect, useState } from "react";
import Avatar from "../social/Avatar.jsx";
import { myNetwork, myGroups, shareStock, addGroupPostWithSymbol, postActivity } from "../social/api.js";

// Send a stock to friends (notification), groups (chat message) and/or your feed
export default function ShareModal({ open, uid, symbol, onClose, onDone }) {
  const [friends, setFriends] = useState(null);
  const [groups, setGroups] = useState([]);
  const [pickedF, setPickedF] = useState(new Set());
  const [pickedG, setPickedG] = useState(new Set());
  const [toFeed, setToFeed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPickedF(new Set());
    setPickedG(new Set());
    setToFeed(false);
    setNote("");
    setErr(null);
    myNetwork().then((n) => setFriends(n.connections || [])).catch(() => setFriends([]));
    myGroups().then(setGroups).catch(() => setGroups([]));
  }, [open, symbol]);
  if (!open) return null;

  const link = `${window.location.origin}${window.location.pathname}?stock=${encodeURIComponent(symbol)}`;
  const toggle = (set, setter, id) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    setter(n);
  };
  const count = pickedF.size + pickedG.size + (toFeed ? 1 : 0);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      for (const f of pickedF) await shareStock(f, symbol, note);
      for (const g of pickedG) await addGroupPostWithSymbol(uid, g, note.trim() || `Check out ${symbol} 👀`, symbol);
      if (toFeed) await postActivity(uid, "note", symbol, {}, note.trim() || `Watching ${symbol} 👀`);
      onDone?.(`Shared ${symbol}`);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ title: symbol, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (_) {}
  }

  const row = (on) => `flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${on ? "bg-blue-600/20 text-blue-100" : "text-zinc-300 hover:bg-zinc-800"}`;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-zinc-100">Share {symbol}</h2>
        <p className="mb-3 text-sm text-zinc-400">Send it to friends or a group with a short note.</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          rows={2}
          placeholder={`Add a note (optional), e.g. "${symbol} looks interesting"`}
          className="mb-3 w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <label className={row(toFeed)}>
            <input type="checkbox" checked={toFeed} onChange={(e) => setToFeed(e.target.checked)} /> 📣 Post to my feed
          </label>
          {groups.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Groups</div>
              {groups.map((g) => (
                <button key={g.id} onClick={() => toggle(pickedG, setPickedG, g.id)} className={row(pickedG.has(g.id))}>
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-700 text-xs font-bold text-white">{g.name[0]?.toUpperCase()}</span>
                  <span className="flex-1 truncate">{g.name}</span>
                  {pickedG.has(g.id) && "✓"}
                </button>
              ))}
            </div>
          )}
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Friends</div>
            {friends === null ? (
              <div className="text-xs text-zinc-500">Loading…</div>
            ) : friends.length === 0 ? (
              <div className="text-xs text-zinc-500">No connections yet — invite friends from Social.</div>
            ) : (
              friends.map((f) => (
                <button key={f.id} onClick={() => toggle(pickedF, setPickedF, f.id)} className={row(pickedF.has(f.id))}>
                  <Avatar url={f.avatar_url} name={f.full_name} size="xs" />
                  <span className="flex-1 truncate">{f.full_name}</span>
                  {pickedF.has(f.id) && "✓"}
                </button>
              ))
            )}
          </div>
        </div>
        {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={copy} className="text-xs text-zinc-400 hover:text-zinc-200">
            {copied ? "Link copied ✓" : "🔗 Copy link"}
          </button>
          <span className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
              Cancel
            </button>
            <button onClick={send} disabled={!count || busy} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
              {busy ? "Sending…" : `Send${count ? ` (${count})` : ""}`}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

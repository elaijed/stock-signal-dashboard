// "Create post" sheet: caption, optional stock + stance (records today's price so the
// post keeps score), optional photo, or a Bull-or-bear poll. No per-post audience:
// public accounts post to everyone, private accounts to their connections.
import React, { useEffect, useRef, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import Avatar from "./Avatar.jsx";
import { createPost, postActivity, uploadPostImage } from "./api.js";
import { useSocial, Sheet, TickerMono, priceOf, money, friendly, btn, TICKER_RE } from "./ui.jsx";

const MAX = 2200;

export function CreatePostSheet({ open, onClose, onPosted, defaultSymbol = "", defaultMode = "post" }) {
  const { uid, me, quoteOf, getQuote, onEditPrivacy } = useSocial();
  const [mode, setMode] = useState(defaultMode);
  const [caption, setCaption] = useState("");
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [stance, setStance] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const sym = symbol.trim().toUpperCase();
  const symOk = !sym || TICKER_RE.test(sym);
  const livePx = sym && symOk ? priceOf(quoteOf, sym) : null;

  useEffect(() => {
    if (open) {
      setMode(defaultMode);
      setSymbol(defaultSymbol);
      setErr(null);
    }
  }, [open, defaultMode, defaultSymbol]);
  useEffect(() => {
    if (!file) return setPreviewUrl(null);
    const u = URL.createObjectURL(file);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function reset() {
    setCaption("");
    if (!defaultSymbol) setSymbol("");
    setStance(null);
    setFile(null);
  }

  async function submit() {
    setErr(null);
    if (!symOk) return setErr("That doesn't look like a ticker (letters like AAPL).");
    if (mode === "poll" && !sym) return setErr("Pick a stock for your poll.");
    if (mode === "post" && !caption.trim() && !file && !sym) return setErr("Write something, add a stock or a photo.");
    setBusy(true);
    try {
      if (mode === "poll") {
        await postActivity(uid, "poll", sym, { question: caption.trim().slice(0, 200) || `Bull or bear on ${sym} this month?` });
      } else {
        let price = null;
        if (sym) {
          price = livePx;
          if (!price && getQuote) price = (await getQuote(sym).catch(() => null))?.c || null;
        }
        const imageUrl = file ? await uploadPostImage(uid, file) : null;
        await createPost(uid, { caption, symbol: sym || null, stance: sym ? stance : null, price: price || null, imageUrl });
      }
      reset();
      onPosted?.();
      onClose();
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  const isPublic = !!me?.account_public;

  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title={mode === "poll" ? "New poll" : "Create post"}
      footer={
        <div className="space-y-2 p-3">
          {err && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1 font-medium text-zinc-300">
                <Ic name={isPublic ? "globe" : "lock"} size={13} />
                {isPublic ? "Everyone can see this" : "Only your connections can see this"}
              </span>
              {onEditPrivacy && (
                <button onClick={() => (onClose(), onEditPrivacy())} className="ml-1.5 font-medium text-blue-500 hover:underline">
                  Change
                </button>
              )}
            </div>
            <button onClick={submit} disabled={busy} className={btn.primary}>
              {busy ? "Posting…" : mode === "poll" ? "Ask" : "Share"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 p-4">
        <div className="flex rounded-full bg-zinc-800 p-1">
          {[
            ["post", "Post", "pen"],
            ["poll", "Bull or bear?", "poll"],
          ].map(([m, l, icon]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`ss-tap flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition ${
                mode === m ? "bg-zinc-900 text-zinc-100 shadow" : "text-zinc-400"
              }`}
            >
              <Ic name={icon} size={15} /> {l}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <Avatar url={me?.avatar_url} name={me?.full_name} />
          <div className="min-w-0 flex-1">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, mode === "poll" ? 200 : MAX))}
              rows={mode === "poll" ? 2 : 5}
              autoFocus
              placeholder={mode === "poll" ? `Your question (default: “Bull or bear on ${sym || "…"} this month?”)` : "What's your call? Share an idea, a chart, a lesson…"}
              className="w-full resize-none bg-transparent text-[16px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <div className={`text-right text-[11px] tabular-nums ${caption.length > (mode === "poll" ? 180 : MAX - 100) ? "text-amber-500" : "text-zinc-600"}`}>
              {caption.length}/{mode === "poll" ? 200 : MAX}
            </div>
          </div>
        </div>

        {previewUrl && mode === "post" && (
          <div className="relative overflow-hidden rounded-xl border border-zinc-800">
            <img src={previewUrl} alt="" className="max-h-72 w-full object-cover" />
            <button onClick={() => setFile(null)} aria-label="Remove photo" className="ss-tap absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">
              <Ic name="x" size={18} />
            </button>
          </div>
        )}

        {/* stock + stance */}
        <div className="rounded-xl border border-zinc-800 p-3">
          <div className="flex items-center gap-3">
            {sym && symOk ? <TickerMono symbol={sym} /> : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500"><Ic name="hash" size={17} /></span>
            )}
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12))}
              disabled={!!defaultSymbol}
              placeholder={mode === "poll" ? "Stock ticker (required)" : "Add a stock (optional)"}
              className="min-h-11 min-w-0 flex-1 bg-transparent font-display text-[16px] font-semibold uppercase text-zinc-100 outline-none placeholder:font-sans placeholder:text-[15px] placeholder:font-normal placeholder:normal-case placeholder:text-zinc-600"
            />
            {sym && symOk && livePx && <span className="text-sm tabular-nums text-zinc-400">{money(livePx)}</span>}
          </div>
          {!symOk && <div className="mt-1 text-xs text-red-500">Tickers are letters and numbers, like AAPL or BRK.B.</div>}
          {mode === "post" && sym && symOk && (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["bull", "Bullish", "up", "border-emerald-500 bg-emerald-500/15 text-emerald-500"],
                  ["bear", "Bearish", "down", "border-red-500 bg-red-500/15 text-red-500"],
                  [null, "No call", "dot", "border-zinc-500 bg-zinc-800 text-zinc-100"],
                ].map(([v, l, icon, on]) => (
                  <button
                    key={l}
                    onClick={() => setStance(v)}
                    className={`ss-tap flex min-h-11 items-center justify-center gap-1 rounded-full border text-sm font-semibold transition ${stance === v ? on : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
                  >
                    <Ic name={icon} size={15} /> {l}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                {stance
                  ? `Your post keeps score: we save today's price${livePx ? ` (${money(livePx)})` : ""} and show how your call is doing.`
                  : "Pick Bullish or Bearish to make a call that keeps score."}
              </div>
            </>
          )}
        </div>

        {mode === "post" && (
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => (setFile(e.target.files?.[0] || null), (e.target.value = ""))} />
            <button onClick={() => fileRef.current?.click()} className={btn.soft}>
              <Ic name="image" size={17} /> {file ? "Change photo" : "Add photo"}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// The "What's your call?" bar at the top of a feed
export function ComposerBar({ onOpen, onPoll }) {
  const { me } = useSocial();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
      <Avatar url={me?.avatar_url} name={me?.full_name} />
      <button onClick={onOpen} className="ss-tap min-h-11 min-w-0 flex-1 rounded-full bg-zinc-800 px-4 text-left text-[15px] text-zinc-500 hover:bg-zinc-700">
        What's your call?
      </button>
      <button onClick={onOpen} aria-label="Add photo" className={btn.icon}>
        <Ic name="image" size={21} />
      </button>
      {onPoll && (
        <button onClick={onPoll} aria-label="Poll" className={`${btn.icon} hidden sm:inline-flex`}>
          <Ic name="poll" size={21} />
        </button>
      )}
    </div>
  );
}

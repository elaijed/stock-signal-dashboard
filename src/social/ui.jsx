// Shared building blocks for the Social pages: context, sheets, chips, skeletons,
// live quotes, "keeps score" math and sharing helpers.
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Ic } from "../ui/icons.jsx";

// ---------- context (so deep components don't need 10 props) ----------
export const SocialCtx = createContext({});
export const useSocial = () => useContext(SocialCtx);

// ---------- formatting ----------
export function timeAgoShort(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
export const money = (n) =>
  n == null ? "" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
export const signedPct = (n, d = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}%`;
export const compact = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : `${n || 0}`;
export const firstName = (n) => (n || "").split(" ")[0] || "them";
export const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/;

// stable number from a string (covers, monograms)
export function hashOf(s = "") {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const HUES = [18, 32, 145, 168, 200, 225, 262, 330, 352, 48];
export const hueOf = (s) => HUES[hashOf(s) % HUES.length];
export const coverStyle = (s) => {
  const h = hueOf(s);
  const h2 = (h + 38) % 360;
  return { background: `linear-gradient(135deg, hsl(${h} 72% 52%), hsl(${h2} 70% 38%))` };
};
export const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

// friendly error text (the new database functions may not exist yet)
export function isMissingFn(e) {
  return /could not find the function|does not exist|schema cache|relation .* does not exist|column .* does not exist/i.test(e?.message || "");
}
export function friendly(e) {
  if (isMissingFn(e)) return "This part of Social is still being switched on. Please check back soon.";
  if (/duplicate|unique/i.test(e?.message || "")) return "Already done.";
  if (/network|fetch/i.test(e?.message || "")) return "You seem to be offline. Try again in a moment.";
  return e?.message || "Something went wrong.";
}

// ---------- live prices ----------
// quoteOf(sym) -> { quote: { c, dp, ... } } | undefined ; ensureSymbols(list, isAlive)
export function useEnsure(symbols, ensureSymbols) {
  const key = [...new Set((symbols || []).filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (!key || !ensureSymbols) return;
    let alive = true;
    ensureSymbols(key.split(","), () => alive);
    return () => {
      alive = false;
    };
  }, [key, ensureSymbols]);
}
export const priceOf = (quoteOf, s) => (s && quoteOf ? quoteOf(s)?.quote?.c ?? null : null);

// A post "keeps score": price when posted vs now. Right if the price moved the way the stance said.
export function scoreOf(it, quoteOf) {
  const d = it?.data || {};
  if (!it?.symbol || !(d.price > 0)) return null;
  const now = priceOf(quoteOf, it.symbol);
  if (!(now > 0)) return { called: d.price, now: null, pct: null, stance: d.stance || null, right: null };
  const pct = (now / d.price - 1) * 100;
  const stance = d.stance || null;
  const right = stance === "bull" ? pct > 0 : stance === "bear" ? pct < 0 : null;
  return { called: d.price, now, pct, stance, right };
}
export function callRecord(items, quoteOf) {
  let n = 0, right = 0;
  for (const it of items || []) {
    if (it.kind !== "post" || !it.data?.stance) continue;
    const s = scoreOf(it, quoteOf);
    if (!s || s.right == null) continue;
    n++;
    if (s.right) right++;
  }
  return { n, right, pct: n ? Math.round((right / n) * 100) : null };
}

// ---------- sharing ----------
export function postLink(id) {
  const u = new URL(window.location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("post", id);
  return u.toString();
}
// returns "shared" | "copied" | null
export async function sharePost(it) {
  const url = postLink(it.id);
  const title = it.symbol ? `${it.symbol} on signals.` : "A post on signals.";
  try {
    if (navigator.share) {
      await navigator.share({ title, text: (it.note || "").slice(0, 120), url });
      return "shared";
    }
  } catch (e) {
    if (e?.name === "AbortError") return null;
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (_) {
    window.prompt("Copy this link", url);
    return null;
  }
}

// ---------- animation styles (rendered once per page) ----------
export function SocialStyles() {
  return (
    <style>{`
@keyframes ss-heart-pop { 0% { transform: translate(-50%,-50%) scale(0); opacity: 0; } 15% { transform: translate(-50%,-50%) scale(1.25); opacity: .95; } 30% { transform: translate(-50%,-50%) scale(.95); } 45%,80% { transform: translate(-50%,-50%) scale(1); opacity: .95; } 100% { transform: translate(-50%,-60%) scale(1); opacity: 0; } }
.ss-heart-pop { animation: ss-heart-pop 900ms ease-out forwards; }
@keyframes ss-like { 0% { transform: scale(1); } 40% { transform: scale(1.3); } 100% { transform: scale(1); } }
.ss-like { animation: ss-like 320ms ease-out; }
@keyframes ss-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.ss-fade-up { animation: ss-fade-up 260ms ease-out both; }
@keyframes ss-toast { 0% { opacity: 0; transform: translate(-50%, 10px); } 12%, 85% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, 6px); } }
.ss-toast { animation: ss-toast 2400ms ease-out forwards; }
.ss-noscroll::-webkit-scrollbar { display: none; } .ss-noscroll { scrollbar-width: none; }
.ss-tap { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
`}</style>
  );
}

// ---------- toast ----------
export function useToast() {
  const [t, setT] = useState(null);
  const show = (text) => setT({ text, k: Date.now() });
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => setT(null), 2400);
    return () => clearTimeout(id);
  }, [t]);
  const node = t ? (
    <div key={t.k} className="ss-toast pointer-events-none fixed bottom-24 left-1/2 z-[70] rounded-full bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-950 shadow-xl sm:bottom-8">
      {t.text}
    </div>
  ) : null;
  return [node, show];
}

// ---------- sheet: bottom sheet on phones; centered modal or side panel on desktop ----------
export function Sheet({ open, onClose, title, children, footer, variant = "modal", wide = false }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) return;
    const r = requestAnimationFrame(() => setShown(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(r);
      setShown(false);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  const panel = variant === "panel";
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <div onClick={onClose} className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`} />
      <div
        className={`absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl border border-zinc-800 bg-zinc-900 shadow-2xl transition-transform duration-300 ease-out ${
          shown ? "translate-y-0" : "translate-y-full"
        } ${
          panel
            ? `sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[26rem] sm:translate-y-0 sm:rounded-none sm:rounded-l-2xl ${shown ? "sm:translate-x-0" : "sm:translate-x-full"}`
            : `sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} sm:-translate-x-1/2 sm:rounded-2xl sm:transition-[opacity,transform] ${
                shown ? "sm:-translate-y-1/2 sm:opacity-100" : "sm:-translate-y-[45%] sm:opacity-0"
              }`
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-700 sm:hidden" />
        {title != null && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2">
            <div className="font-display text-base font-semibold text-zinc-100">{title}</div>
            <button onClick={onClose} aria-label="Close" className="ss-tap -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <Ic name="x" size={20} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="shrink-0 border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]">{footer}</div>}
      </div>
    </div>
  );
}

// list of actions for "..." menus
export function ActionList({ items }) {
  return (
    <div className="p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {items.filter(Boolean).map((a) => (
        <button
          key={a.label}
          onClick={a.onClick}
          className={`ss-tap flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-[15px] font-medium hover:bg-zinc-800 ${
            a.danger ? "text-red-400" : "text-zinc-100"
          }`}
        >
          <Ic name={a.icon} size={19} />
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ---------- chips ----------
export function TickerMono({ symbol, size = 36, className = "" }) {
  const h = hueOf(symbol);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-display font-bold text-white ${className}`}
      style={{ width: size, height: size, fontSize: size * (symbol.length > 3 ? 0.27 : 0.34), background: `hsl(${h} 62% 44%)` }}
    >
      {symbol.slice(0, 4)}
    </span>
  );
}

export function StancePill({ stance, className = "" }) {
  if (!stance) return null;
  const bull = stance === "bull";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        bull ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
      } ${className}`}
    >
      <Ic name={bull ? "up" : "down"} size={13} />
      {bull ? "Bullish" : "Bearish"}
    </span>
  );
}

export function FoundingChip({ className = "" }) {
  return (
    <span title="One of the first 100 members" className={`inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-500 ${className}`}>
      <Ic name="crown" size={11} /> Founding
    </span>
  );
}

export function VerifiedTick({ size = 15 }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-blue-500 text-white" style={{ width: size, height: size }} title="Official">
      <Ic name="check" size={size * 0.7} />
    </span>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-zinc-800 ${className}`} />;
}
export function PostSkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <Skeleton className="mt-4 h-14 w-full rounded-xl" />
      <div className="mt-4 flex gap-4">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
    </div>
  );
}

export function EmptyState({ icon = "sparkles", title, children, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-700 px-5 py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
        <Ic name={icon} size={22} />
      </div>
      {title && <div className="font-display text-lg font-semibold text-zinc-100">{title}</div>}
      {children && <div className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="font-display text-base font-semibold text-zinc-100">{children}</h3>
      {right}
    </div>
  );
}

export const btn = {
  primary: "ss-tap inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-blue-500 px-5 text-sm font-semibold text-white transition hover:bg-blue-600 active:scale-[.97] disabled:opacity-40",
  quiet: "ss-tap inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-zinc-700 px-5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800 active:scale-[.97] disabled:opacity-40",
  soft: "ss-tap inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-zinc-800 px-5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-700 active:scale-[.97] disabled:opacity-40",
  icon: "ss-tap inline-flex h-11 w-11 items-center justify-center rounded-full text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100 active:scale-90",
};
export const inputCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-[15px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-blue-500";

// small switch
export function Switch({ on, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`ss-tap relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${on ? "bg-blue-500" : "bg-zinc-700"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// run once when the element scrolls into view (infinite scroll)
export function useInView(onEnter, enabled) {
  const ref = useRef(null);
  const cb = useRef(onEnter);
  cb.current = onEnter;
  useEffect(() => {
    if (!enabled || !ref.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && cb.current(), { rootMargin: "600px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}

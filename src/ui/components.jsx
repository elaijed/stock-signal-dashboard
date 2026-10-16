import { IconToken } from "./icons.jsx";
import React, { useEffect, useRef, useState } from "react";
import { GLOSSARY } from "./explain.js";

// ⓘ tap/hover explainer for a glossary term
export function Info({ term, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const text = GLOSSARY[term];
  if (!text) return null;
  return (
    <span ref={ref} className={`relative inline-block align-middle ${className}`}>
      <button
        type="button"
        aria-label="What does this mean?"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onMouseEnter={() => window.matchMedia("(hover: hover)").matches && setOpen(true)}
        onMouseLeave={() => window.matchMedia("(hover: hover)").matches && setOpen(false)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-600 text-[9px] font-semibold leading-none text-zinc-400 hover:border-blue-500 hover:text-blue-400"
      >
        i
      </button>
      {open && (
        <span className="absolute left-1/2 top-5 z-40 w-60 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-zinc-300 shadow-2xl">
          {text}
        </span>
      )}
    </span>
  );
}

const TONE = {
  good: "bg-emerald-600 text-white",
  bad: "bg-red-600 text-white",
  caution: "bg-amber-500 text-zinc-950",
  neutral: "bg-zinc-100 text-zinc-950",
};
const DOT = { good: "bg-emerald-400", bad: "bg-red-400", caution: "bg-amber-400", neutral: "bg-zinc-400" };

// Big verdict + 3-dot agreement score + confidence
export function VerdictBar({ ex }) {
  if (!ex) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <span className={`rounded-lg px-3 py-1.5 text-base font-bold tracking-wide ${TONE[ex.tone]}`}>{ex.verdict}</span>
      <span className="flex items-center gap-1" title={`${ex.dots} of 3 checks agree`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < ex.dots ? DOT[ex.tone] : "bg-zinc-700"}`} />
        ))}
        <span className="ml-1 text-[11px] text-zinc-500">{ex.dots}/3 agree</span>
      </span>
      <span className="text-xs text-zinc-400">
        Confidence: <span className="font-semibold text-zinc-200">{ex.confidence}</span>
        <Info term="confidence" />
      </span>
    </div>
  );
}

const INFO_FOR = { trend: "trend", rsi: "rsi", macd: "macd" };

// The "Why?" panel — three plain-English checks with real numbers
export function WhyPanel({ ex, compact = false }) {
  const [open, setOpen] = useState(!compact);
  if (!ex) return null;
  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40">
      <button
        onClick={() => {
          setOpen((o) => !o);
          try {
            localStorage.setItem("ssd_did_why", "1");
            window.dispatchEvent(new Event("ssd-did-why"));
          } catch (_) {}
        }}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
      >
        <span>Why? {!open && <span className="ml-1 font-normal normal-case tracking-normal text-zinc-500">— {ex.bottom}</span>}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="space-y-2.5 px-3 pb-3">
          {ex.rows.map((r) => (
            <div key={r.key} className="flex gap-2 text-sm">
              <span className="mt-0.5 shrink-0"><IconToken name={r.icon} /></span>
              <div className="min-w-0">
                <div className="font-semibold text-zinc-100">
                  {r.title}
                  <Info term={INFO_FOR[r.key]} />
                </div>
                <div className="text-xs leading-relaxed text-zinc-400">{r.text}</div>
              </div>
            </div>
          ))}
          <div className="rounded-md bg-zinc-800/60 px-2.5 py-2 text-xs font-medium text-zinc-200">{ex.bottom}</div>
          {ex.extras.map((t, i) => (
            <div key={i} className="text-xs text-zinc-400">
              {t}
            </div>
          ))}
          {ex.rationale && <div className="text-xs italic text-zinc-500">{ex.rationale}</div>}
        </div>
      )}
    </div>
  );
}

export function Chevron({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Collapsible section whose open state is remembered per device
export function Collapsible({ id, title, children, defaultOpen = false }) {
  const key = `ssd_open_${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? defaultOpen : v === "1";
    } catch (_) {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? "0" : "1");
      } catch (_) {}
      return !o;
    });
  };
  return (
    <div className="mt-3 border-t border-zinc-800 pt-2">
      <button onClick={toggle} className="flex w-full items-center justify-between px-1 py-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
        <span>{title}</span>
        <Chevron open={open} />
      </button>
      {open && <div className="pt-1">{children}</div>}
    </div>
  );
}

// Overlapping avatars: "3 friends own this"
export function FriendsStack({ owners = [], watchers = [], onOpen }) {
  if (!owners.length && !watchers.length) return null;
  const people = [...owners, ...watchers.filter((w) => !owners.some((o) => o.id === w.id))].slice(0, 4);
  const label = owners.length
    ? `${owners.length} friend${owners.length === 1 ? "" : "s"} own${owners.length === 1 ? "s" : ""} this`
    : `${watchers.length} friend${watchers.length === 1 ? " is" : "s are"} watching`;
  return (
    <button onClick={onOpen} className="mt-2 flex items-center gap-2 text-left" title={people.map((p) => p.full_name).join(", ")}>
      <span className="flex -space-x-2">
        {people.map((p) =>
          p.avatar_url ? (
            <img key={p.id} src={p.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover ring-2 ring-zinc-900" />
          ) : (
            <span key={p.id} className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-[9px] font-semibold text-white ring-2 ring-zinc-900">
              {(p.full_name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </span>
          )
        )}
      </span>
      <span className="text-xs text-blue-300">{label}</span>
    </button>
  );
}

// small toast stack
export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 shadow-2xl sm:bottom-6">
      {message}
    </div>
  );
}

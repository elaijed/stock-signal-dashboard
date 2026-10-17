import React, { useMemo } from "react";

// Small shared visuals for the game cards: keyframes, a confetti-like burst,
// a "+25 XP" pop, a sparkline and localStorage helpers. No gradients except the
// founding ring (deliberate, it's a reward).

export const GAME_CSS = `
@keyframes sg-burst { 0% { transform: translate(-50%,-50%) scale(.4) rotate(0); opacity: 1 }
  100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1) rotate(var(--rot)); opacity: 0 } }
@keyframes sg-pop { 0% { transform: translateY(6px) scale(.8); opacity: 0 } 25% { transform: translateY(0) scale(1.08); opacity: 1 }
  70% { transform: translateY(-2px) scale(1); opacity: 1 } 100% { transform: translateY(-14px); opacity: 0 } }
@keyframes sg-rise { 0% { transform: translateY(8px); opacity: 0 } 100% { transform: none; opacity: 1 } }
@keyframes sg-spin { to { transform: rotate(360deg) } }
@keyframes sg-flicker { 0%,100% { transform: scale(1) rotate(-3deg) } 50% { transform: scale(1.12) rotate(3deg) } }
.sg-burst i { position: absolute; left: 50%; top: 50%; width: 7px; height: 11px; border-radius: 2px;
  animation: sg-burst 1.1s cubic-bezier(.15,.7,.3,1) forwards; }
.sg-pop { animation: sg-pop 1.6s ease-out forwards; }
.sg-rise { animation: sg-rise .35s ease-out both; }
.sg-flame { animation: sg-flicker 1.4s ease-in-out infinite; transform-origin: 50% 90%; }
.sg-ring { animation: sg-spin 4s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .sg-burst, .sg-pop { display: none } .sg-rise, .sg-flame, .sg-ring { animation: none }
}`;

export function GameStyles() {
  return <style>{GAME_CSS}</style>;
}

const COLORS = ["#ff5b2e", "#1fa95a", "#f5b52e", "#ff9f7a", "#3fc373", "#c73a14"];

// Confetti-like burst centered on its (relative) parent. Re-mount with a new key to replay.
export function Burst({ count = 22 }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const r = 60 + Math.random() * 70;
        return {
          dx: `${Math.cos(a) * r}px`,
          dy: `${Math.sin(a) * r - 20}px`,
          rot: `${Math.round(Math.random() * 540 - 270)}deg`,
          bg: COLORS[i % COLORS.length],
          delay: `${Math.random() * 0.12}s`,
        };
      }),
    [count]
  );
  return (
    <span aria-hidden="true" className="sg-burst pointer-events-none absolute inset-0 overflow-visible">
      {bits.map((b, i) => (
        <i key={i} style={{ "--dx": b.dx, "--dy": b.dy, "--rot": b.rot, background: b.bg, animationDelay: b.delay }} />
      ))}
    </span>
  );
}

export function Sparkline({ candles, width = 120, height = 36, className = "" }) {
  const pts = (candles || []).filter((c) => c?.close != null).slice(-22);
  if (pts.length < 3) return <div style={{ width, height }} className={`animate-pulse rounded-md bg-zinc-800/40 ${className}`} aria-hidden="true" />;
  const vals = pts.map((c) => c.close);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const d = vals
    .map((v, i) => `${i ? "L" : "M"}${((i / (vals.length - 1)) * width).toFixed(1)},${(height - 3 - ((v - lo) / span) * (height - 6)).toFixed(1)}`)
    .join(" ");
  const up = vals.at(-1) >= vals[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={`${up ? "text-emerald-500" : "text-red-500"} ${className}`} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// localStorage that never throws
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (_) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  },
};

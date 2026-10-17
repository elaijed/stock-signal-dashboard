import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { analyze } from "../lib/signals.js";
import { explainStock } from "../ui/explain.js";
import { VerdictBar, WhyPanel } from "../ui/components.jsx";
import { Ic } from "../ui/icons.jsx";

export const PREVIEW_SYMBOLS = ["NVDA", "AAPL", "MSFT", "TSLA"];
export const PREVIEW_NAMES = { NVDA: "NVIDIA", AAPL: "Apple", MSFT: "Microsoft", TSLA: "Tesla" };

// Same-origin daily snapshots written at build time (scripts/fetch-candles.mjs):
// { t: [unix seconds], c: [closes], v: [volumes] }
const cache = new Map();
function loadSnapshot(symbol) {
  if (!cache.has(symbol)) {
    const p = fetch(`${import.meta.env.BASE_URL}candles/${encodeURIComponent(symbol)}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!Array.isArray(d?.t) || !Array.isArray(d?.c) || d.c.length < 50) return null;
        return d.t.map((t, i) => ({ t, close: d.c[i], v: d.v?.[i] ?? 0 }));
      })
      .catch(() => null);
    cache.set(symbol, p);
  }
  return cache.get(symbol);
}

// status: "loading" | "ready" | "missing"
export function useSnapshot(symbol) {
  const [state, setState] = useState({ symbol, status: "loading", candles: null });
  useEffect(() => {
    let alive = true;
    setState((s) => (s.symbol === symbol && s.status === "ready" ? s : { symbol, status: "loading", candles: null }));
    loadSnapshot(symbol).then((candles) => {
      if (alive) setState({ symbol, status: candles ? "ready" : "missing", candles });
    });
    return () => {
      alive = false;
    };
  }, [symbol]);
  return state;
}

// Do any of the preview snapshots exist? (null while checking)
export function usePreviewAvailable() {
  const [ok, setOk] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all(PREVIEW_SYMBOLS.map(loadSnapshot)).then((all) => alive && setOk(all.some(Boolean)));
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

function useStock(symbol, candles) {
  return useMemo(() => {
    if (!candles) return null;
    const a = analyze(candles, null, { symbol, status: "watching" });
    const ex = explainStock(a);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const change = prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
    const chart = candles.slice(-63).map((c) => ({ t: c.t, p: c.close }));
    const periodUp = chart.length > 1 && chart[chart.length - 1].p >= chart[0].p;
    const periodPct = chart.length > 1 ? ((chart[chart.length - 1].p - chart[0].p) / chart[0].p) * 100 : 0;
    return { a, ex, price: last.close, change, chart, periodUp, periodPct, asOf: new Date(last.t * 1000) };
  }, [symbol, candles]);
}

const money = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;
const shortDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function PriceChart({ data, up, height }) {
  const color = up ? "var(--color-emerald-500)" : "var(--color-red-500)";
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="t" hide />
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <Tooltip
            cursor={{ stroke: "var(--color-zinc-600)", strokeDasharray: "3 3" }}
            contentStyle={{
              background: "var(--color-zinc-900)",
              border: "1px solid var(--color-zinc-700)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--color-zinc-100)",
            }}
            labelFormatter={(t) => shortDate(new Date(t * 1000))}
            formatter={(v) => [money(v), "Close"]}
          />
          <Area type="monotone" dataKey="p" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.08} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CardSkeleton({ chartHeight = 140 }) {
  return (
    <div className="animate-pulse" aria-label="Loading">
      <div className="h-5 w-24 rounded bg-zinc-800" />
      <div className="mt-2 h-3 w-40 rounded bg-zinc-800" />
      <div className="mt-4 h-8 w-32 rounded bg-zinc-800" />
      <div className="mt-4 w-full rounded-lg bg-zinc-800" style={{ height: chartHeight }} />
      <div className="mt-4 h-8 w-48 rounded-lg bg-zinc-800" />
      <div className="mt-3 h-10 w-full rounded-lg bg-zinc-800" />
    </div>
  );
}

// A real stock card: price, 3-month chart, verdict and the Why panel.
export function PreviewCard({ symbol, candles, compact = false, chartHeight = 140 }) {
  const s = useStock(symbol, candles);
  if (!s) return <CardSkeleton chartHeight={chartHeight} />;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-bold tracking-tight text-zinc-50">{symbol}</span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              {PREVIEW_NAMES[symbol] || "Stock"}
            </span>
          </div>
          {s.ex?.summary && !compact && <p className="mt-1 text-sm text-zinc-400">{s.ex.summary}</p>}
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[1.7rem] font-semibold leading-none text-zinc-50">{money(s.price)}</span>
        <span className={`text-sm font-semibold ${s.change >= 0 ? "text-emerald-500" : "text-red-500"}`}>{signed(s.change)}</span>
      </div>
      <div className="mt-1 text-[11px] text-zinc-500">
        Close on {shortDate(s.asOf)} · 3 months {signed(s.periodPct)}
      </div>
      <div className="mt-3">
        <PriceChart data={s.chart} up={s.periodUp} height={chartHeight} />
      </div>
      {s.ex ? (
        <>
          <VerdictBar ex={s.ex} />
          <WhyPanel key={symbol} ex={s.ex} compact={compact} />
        </>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">Not enough history for a signal yet.</p>
      )}
    </div>
  );
}

// Tabs + card. Hidden entirely when no snapshot files are available.
export function LivePreviewSection({ symbol, onSymbol }) {
  const available = usePreviewAvailable();
  const snap = useSnapshot(symbol);
  if (available === false) return null;
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Pick a stock" className="flex gap-1 rounded-full bg-zinc-800/70 p-1">
          {PREVIEW_SYMBOLS.map((sym) => (
            <button
              key={sym}
              role="tab"
              aria-selected={sym === symbol}
              onClick={() => onSymbol(sym)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors sm:px-4 ${
                sym === symbol ? "bg-zinc-900 text-zinc-50 ring-1 ring-zinc-700" : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Real prices, updated every weekday
        </span>
      </div>
      <div className="mt-5">
        {snap.status === "missing" ? (
          <div className="flex h-60 items-center justify-center text-sm text-zinc-500">
            <Ic name="clock" className="mr-2" /> This one is still loading on our side. Try another.
          </div>
        ) : (
          <PreviewCard symbol={symbol} candles={snap.status === "ready" ? snap.candles : null} chartHeight={180} />
        )}
      </div>
    </div>
  );
}

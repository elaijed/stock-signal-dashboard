import React, { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { SectionHead } from "./shared.jsx";
import { Ic } from "../ui/icons.jsx";

// "Does it actually work?" — the honest track record of the app's Buy calls.
// Data: ./track-record.json, written at build time by scripts/track-record.mjs
// (see that file for the exact method). Shows every result, good or bad.
// Renders nothing when the file is missing (local dev) or holds no signals.

const COLOR = { signals: "#ff5b2e", spy: "#898781", grid: "rgba(138,130,120,0.22)" };

const signed = (n, d = 1) => (n == null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}%`);
const tone = (n) => (n == null ? "text-zinc-400" : n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-zinc-300");
const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const price = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const parseDay = (s) => new Date(`${s}T12:00:00Z`);
const fmtDay = (s, year = false) =>
  s ? parseDay(s).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }) : "—";
const pctNum = (n) => (n == null ? "—" : `${Math.round(n)}%`);

function valid(d) {
  return d && typeof d === "object" && d.strong && d.buy && (d.strong.count > 0 || d.buy.count > 0);
}

function useTrackRecord() {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    let alive = true;
    fetch("./track-record.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) // dev server answers index.html -> JSON parse fails -> treat as missing
      .then((d) => alive && setState(valid(d) ? { status: "ready", data: d } : { status: "missing", data: null }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function Shell({ children }) {
  return (
    <section id="track-record" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      {children}
    </section>
  );
}

function Skeleton() {
  const bar = "animate-pulse rounded-lg bg-zinc-800/70";
  return (
    <Shell>
      <div aria-busy="true" aria-label="Loading track record">
        <div className={`${bar} h-6 w-32 rounded-full`} />
        <div className={`${bar} mt-5 h-10 w-full max-w-md`} />
        <div className={`${bar} mt-4 h-5 w-full max-w-xl`} />
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${bar} h-36 rounded-2xl`} />
          ))}
        </div>
        <div className={`${bar} mt-3 h-80 rounded-2xl`} />
      </div>
    </Shell>
  );
}

function Tile({ label, children, foot, accent = false }) {
  return (
    <div className={`flex flex-col rounded-2xl border p-5 ${accent ? "border-blue-500/40 bg-zinc-900" : "border-zinc-800 bg-zinc-900"}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-3 flex-1">{children}</div>
      {foot && <div className="mt-3 border-t border-zinc-800 pt-3 text-sm leading-snug text-zinc-400">{foot}</div>}
    </div>
  );
}

function CurveTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 shadow-lg">
      <div className="mb-1 text-zinc-500">{fmtDay(p.t, true)}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: COLOR.signals }} /> Strong Buy signals
        </span>
        <span className="font-semibold tabular-nums">{money(p.signals)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: COLOR.spy }} /> S&amp;P 500
        </span>
        <span className="font-semibold tabular-nums">{money(p.spy)}</span>
      </div>
    </div>
  );
}

function Curve({ curve }) {
  if (!curve || curve.length < 2) return null;
  const last = curve[curve.length - 1];
  // round y ticks ($50, $100, $250 ... steps)
  const vals = curve.flatMap((p) => [p.signals, p.spy]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const raw = Math.max(1, (hi - lo) / 4), mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  const yTicks = [];
  for (let v = Math.floor(lo / step) * step; v < hi + step; v += step) yTicks.push(v);
  // one x tick per month (first trading day of each month)
  const monthTicks = curve.filter((p, i) => i > 0 && p.t.slice(0, 7) !== curve[i - 1].t.slice(0, 7)).map((p) => p.t);
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h3 className="font-display text-lg font-bold text-zinc-50">Growth of $1,000</h3>
          <p className="mt-1 max-w-md text-sm text-zinc-400">
            Money spread equally across every open Strong Buy signal, each held 30 days, versus simply holding the S&amp;P 500.
          </p>
        </div>
        <div className="flex gap-5 text-sm">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="h-0.5 w-4 rounded-full" style={{ background: COLOR.signals }} /> Strong Buy signals
            </div>
            <div className="font-display text-xl font-bold tabular-nums text-zinc-50">{money(last.signals)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="h-0.5 w-4 rounded-full" style={{ background: COLOR.spy }} /> S&amp;P 500
            </div>
            <div className="font-display text-xl font-bold tabular-nums text-zinc-50">{money(last.spy)}</div>
          </div>
        </div>
      </div>
      <div className="mt-5 h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLOR.grid} vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(t) => parseDay(t).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
              tick={{ fill: "var(--color-zinc-500)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              ticks={monthTicks}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              domain={[yTicks[0], yTicks[yTicks.length - 1]]}
              ticks={yTicks}
              tickFormatter={(v) => `$${Math.round(v).toLocaleString("en-US")}`}
              tick={{ fill: "var(--color-zinc-500)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<CurveTooltip />} cursor={{ stroke: COLOR.spy, strokeWidth: 1 }} />
            <Line type="monotone" dataKey="spy" stroke={COLOR.spy} strokeWidth={2} dot={false} isAnimationActive={false}
              activeDot={{ r: 4, fill: COLOR.spy, stroke: "var(--color-zinc-900)", strokeWidth: 2 }} />
            <Line type="monotone" dataKey="signals" stroke={COLOR.signals} strokeWidth={2} dot={false} isAnimationActive={false}
              activeDot={{ r: 4, fill: COLOR.signals, stroke: "var(--color-zinc-900)", strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Compare({ strong, buy }) {
  const rows = [
    ["Signals", (s) => (s.count ?? 0).toLocaleString("en-US"), null],
    ["Average after 30 days", (s) => signed(s.avgReturnPct), (s) => tone(s.avgReturnPct)],
    ["Median after 30 days", (s) => signed(s.medianReturnPct), (s) => tone(s.medianReturnPct)],
    ["S&P 500, same days", (s) => signed(s.avgSpyPct), (s) => tone(s.avgSpyPct)],
    ["Up after 30 days", (s) => pctNum(s.hitRatePct), null],
    ["Beat the S&P 500", (s) => pctNum(s.beatSpyPct), null],
  ];
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
      <h3 className="font-display text-lg font-bold text-zinc-50">Strong Buy vs Buy</h3>
      <p className="mt-1 text-sm text-zinc-400">Strong Buy = all 3 checks point up. Buy = 2 of 3.</p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-xs text-zinc-500">
            <th className="pb-2 text-left font-medium" />
            <th className="pb-2 text-right font-semibold text-zinc-300">Strong Buy</th>
            <th className="pb-2 text-right font-semibold text-zinc-300">Buy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, val, cls]) => (
            <tr key={label} className="border-t border-zinc-800">
              <td className="py-2.5 pr-2 text-zinc-400">{label}</td>
              <td className={`py-2.5 text-right font-semibold tabular-nums ${cls ? cls(strong) : "text-zinc-100"}`}>{strong.count ? val(strong) : "—"}</td>
              <td className={`py-2.5 text-right font-semibold tabular-nums ${cls ? cls(buy) : "text-zinc-100"}`}>{buy.count ? val(buy) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Recent({ recent }) {
  if (!recent?.length) return null;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
      <h3 className="font-display text-lg font-bold text-zinc-50">Recent Strong Buy signals</h3>
      <p className="mt-1 text-sm text-zinc-400">The latest {recent.length} that have had their full 30 days. Misses included.</p>
      <ul className="mt-4 divide-y divide-zinc-800">
        {recent.map((e) => (
          <li key={`${e.symbol}-${e.date}`} className="flex items-center gap-3 py-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                e.returnPct >= 0 ? "bg-emerald-900/60 text-emerald-400" : "bg-red-900/50 text-red-400"
              }`}
            >
              <Ic name={e.returnPct >= 0 ? "up" : "down"} size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-zinc-100">{e.symbol}</div>
              <div className="truncate text-xs text-zinc-500">
                {fmtDay(e.date)} → {fmtDay(e.exitDate)} · {price(e.entry)} → {price(e.exit)}
              </div>
            </div>
            <div className="text-right">
              <div className={`font-semibold tabular-nums ${tone(e.returnPct)}`}>{signed(e.returnPct)}</div>
              <div className="text-xs tabular-nums text-zinc-500">S&amp;P {signed(e.spyPct)}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TrackRecord() {
  const { status, data } = useTrackRecord();
  if (status === "loading") return <Skeleton />;
  if (status !== "ready") return null;

  const { strong, buy, window: win = {}, stocksScanned = 0, curve, recent, holdDays = 21 } = data;
  const total = (strong.count || 0) + (buy.count || 0);
  const lead = strong.count ? strong : buy; // headline uses Strong Buy whenever there are any
  const leadName = strong.count ? "Strong Buy" : "Buy";
  const diff = lead.avgReturnPct != null && lead.avgSpyPct != null ? lead.avgReturnPct - lead.avgSpyPct : null;

  return (
    <Shell>
      <SectionHead
        eyebrow="Track record"
        icon="chart"
        title="Does it actually work?"
        sub={`We replayed the app's own Buy calls on ${stocksScanned.toLocaleString("en-US")} US stocks and funds, day by day, using only the data available at the time, then checked the price 30 days later. Every call is counted, the misses too.`}
      />

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        <Tile
          accent
          label={`${leadName} signals · after 30 days`}
          foot={
            diff == null
              ? null
              : `${diff >= 0 ? "Ahead of" : "Behind"} the S&P 500 by ${Math.abs(diff).toFixed(1)} points on average.`
          }
        >
          <div className={`font-display text-5xl font-bold tabular-nums ${tone(lead.avgReturnPct)}`}>{signed(lead.avgReturnPct)}</div>
          <div className="mt-2 text-sm text-zinc-400">
            average, vs <span className={`font-semibold ${tone(lead.avgSpyPct)}`}>{signed(lead.avgSpyPct)}</span> for the S&amp;P 500 over the same days
          </div>
        </Tile>
        <Tile label="Hit rate" foot={lead.beatSpyPct != null ? `${pctNum(lead.beatSpyPct)} beat the S&P 500 over the same 30 days.` : null}>
          <div className="font-display text-5xl font-bold tabular-nums text-zinc-50">{pctNum(lead.hitRatePct)}</div>
          <div className="mt-2 text-sm text-zinc-400">of {leadName} signals were up after 30 days</div>
        </Tile>
        <Tile label="Signals checked" foot={`${fmtDay(win.from, true)} – ${fmtDay(win.to, true)}`}>
          <div className="font-display text-5xl font-bold tabular-nums text-zinc-50">{total.toLocaleString("en-US")}</div>
          <div className="mt-2 text-sm text-zinc-400">
            {(strong.count || 0).toLocaleString("en-US")} Strong Buy and {(buy.count || 0).toLocaleString("en-US")} Buy calls
          </div>
        </Tile>
      </div>

      <div className="mt-3">
        <Curve curve={curve} />
      </div>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-2">
        <Compare strong={strong} buy={buy} />
        <Recent recent={recent} />
      </div>

      <div className="mt-6 flex gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-relaxed text-zinc-400">
        <Ic name="warn" size={16} className="mt-0.5 shrink-0 text-zinc-500" />
        <div>
          <p>
            <span className="font-semibold text-zinc-200">How we counted:</span> a signal is the day a stock turns into a Buy or
            Strong Buy (staying one for weeks still counts once); we bought at that day's close and sold {holdDays} trading
            days (about 30 calendar days) later.
          </p>
          <p className="mt-2 font-medium text-zinc-300">
            Past results don't predict the future. Returns ignore fees and taxes. Not financial advice.
          </p>
        </div>
      </div>
    </Shell>
  );
}

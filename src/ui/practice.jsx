import { Ic } from "./icons.jsx";
import React, { useEffect, useState } from "react";
import { Info } from "./components.jsx";

// Practice ("paper") trading: $10,000 of pretend money, stored in your account.
export const PAPER_START = 10000;
export const newPaper = () => ({ cash: PAPER_START, positions: [], trades: [], startedAt: new Date().toISOString() });

const money = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;

export function paperValue(paper, priceOf) {
  if (!paper) return { value: PAPER_START, invested: 0, ret: 0 };
  let invested = 0;
  for (const p of paper.positions) invested += p.qty * (priceOf(p.symbol) ?? p.avgPrice);
  const value = paper.cash + invested;
  return { value, invested, ret: (value / PAPER_START - 1) * 100 };
}

// apply a practice trade; returns the new paper object or throws a friendly error
export function applyPaperTrade(paper, side, symbol, qty, price) {
  const p = paper || newPaper();
  qty = Number(qty);
  if (!(qty > 0) || !(price > 0)) throw new Error("Enter a number of shares.");
  const pos = p.positions.find((x) => x.symbol === symbol);
  const today = new Date().toISOString().slice(0, 10);
  const trade = { id: `${symbol}-${Date.now()}`, symbol, side, qty, price, date: today };
  if (side === "buy") {
    const cost = qty * price;
    if (cost > p.cash + 1e-6) throw new Error(`Not enough practice cash (you have ${money(p.cash)}).`);
    const positions = pos
      ? p.positions.map((x) => (x.symbol === symbol ? { ...x, qty: x.qty + qty, avgPrice: (x.avgPrice * x.qty + cost) / (x.qty + qty) } : x))
      : [...p.positions, { symbol, qty, avgPrice: price, firstBuy: today }];
    return { ...p, cash: p.cash - cost, positions, trades: [trade, ...p.trades].slice(0, 200) };
  }
  if (!pos || qty > pos.qty + 1e-9) throw new Error("You don't have that many practice shares.");
  const realized = (price - pos.avgPrice) * qty;
  const positions = pos.qty - qty < 1e-9 ? p.positions.filter((x) => x.symbol !== symbol) : p.positions.map((x) => (x.symbol === symbol ? { ...x, qty: x.qty - qty } : x));
  return { ...p, cash: p.cash + qty * price, positions, trades: [{ ...trade, realizedUsd: realized }, ...p.trades].slice(0, 200) };
}

export function PracticeTradeModal({ open, side, symbol, price, paper, onConfirm, onClose }) {
  const [mode, setMode] = useState("dollars");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (open) {
      setAmount(side === "sell" ? String(paper?.positions.find((p) => p.symbol === symbol)?.qty || "") : "1000");
      setMode(side === "sell" ? "shares" : "dollars");
      setErr(null);
    }
  }, [open, side, symbol, paper]);
  if (!open) return null;
  const pos = paper?.positions.find((p) => p.symbol === symbol);
  const a = parseFloat(amount) || 0;
  const qty = mode === "dollars" ? (price ? a / price : 0) : a;
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-zinc-100">
          Practice {side === "buy" ? "buy" : "sell"} {symbol}
        </h2>
        <p className="mb-3 text-sm text-zinc-400">
          Pretend money — no real trade happens. Price now: <span className="font-semibold text-zinc-200">{price ? money(price) : "…"}</span>
        </p>
        <div className="mb-2 flex gap-1 rounded-lg bg-zinc-800 p-1 text-xs">
          {[
            ["dollars", "In dollars"],
            ["shares", "In shares"],
          ].map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-md py-1.5 ${mode === m ? "bg-zinc-100 text-zinc-950" : "text-zinc-400"}`}>
              {l}
            </button>
          ))}
        </div>
        <input
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <div className="mt-2 text-xs text-zinc-500">
          {qty > 0 && price ? `≈ ${qty.toFixed(qty < 10 ? 3 : 1)} shares · ${money(qty * price)}` : ""}
          <br />
          {side === "buy" ? `Practice cash: ${money(paper?.cash ?? PAPER_START)}` : `You hold ${pos?.qty?.toFixed(3) ?? 0} practice shares`}
        </div>
        {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancel
          </button>
          <button
            disabled={!price || !(qty > 0)}
            onClick={() => {
              try {
                onConfirm(Math.round(qty * 1e6) / 1e6);
              } catch (e) {
                setErr(e.message);
              }
            }}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40 ${side === "buy" ? "bg-emerald-700 hover:bg-emerald-600" : "bg-red-800 hover:bg-red-700"}`}
          >
            Practice {side}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PracticePage({ paper, stockData, ensureSymbols, onTrade, onReset, onOpenStock, onStart }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const key = (paper?.positions || []).map((p) => p.symbol).join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    ensureSymbols(key.split(","), () => alive);
    return () => {
      alive = false;
    };
  }, [key, ensureSymbols]);
  const priceOf = (s) => stockData[s]?.quote?.c ?? null;

  if (!paper) {
    return (
      <section className="rounded-2xl border border-blue-900/60 bg-gradient-to-br from-blue-950/40 to-zinc-900 p-6 text-center">
        <div className="text-blue-500"><Ic name="game" size={36} /></div>
        <h2 className="mt-2 text-xl font-bold text-zinc-50">Practice with $10,000 of pretend money</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-300">
          Try buying and selling real stocks at real prices — without risking anything. Great for learning, and you can compare with friends on the practice
          leaderboard.
        </p>
        <button onClick={onStart} className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">
          Start practicing
        </button>
      </section>
    );
  }

  const { value, ret } = paperValue(paper, priceOf);
  const realized = paper.trades.reduce((a, t) => a + (t.realizedUsd || 0), 0);
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-gradient-to-br from-blue-950/40 to-zinc-900 p-4 sm:grid-cols-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Practice value</div>
          <div className="text-xl font-bold tabular-nums text-zinc-50">{money(value)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Return since start</div>
          <div className={`text-xl font-bold tabular-nums ${ret >= 0 ? "text-emerald-400" : "text-red-400"}`}>{signed(ret)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Cash left</div>
          <div className="text-xl font-bold tabular-nums text-zinc-100">{money(paper.cash)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            Locked-in gains<Info term="realized" />
          </div>
          <div className={`text-xl font-bold tabular-nums ${realized >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {realized >= 0 ? "+" : "−"}
            {money(Math.abs(realized))}
          </div>
        </div>
      </section>
      <p className="text-xs text-zinc-500">
        Pretend money only. To practice-buy, open any stock (search at the top, or tap a stock anywhere) and press <b>Practice buy</b>.
      </p>

      {paper.positions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          No practice positions yet. Search a stock at the top and tap “Practice buy”.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <ul className="divide-y divide-zinc-800">
            {paper.positions.map((p) => {
              const px = priceOf(p.symbol);
              const g = px != null ? ((px - p.avgPrice) / p.avgPrice) * 100 : null;
              return (
                <li key={p.symbol} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button onClick={() => onOpenStock(p.symbol)} className="w-16 text-left font-semibold text-zinc-100 hover:text-blue-300">
                    {p.symbol}
                  </button>
                  <span className="min-w-0 flex-1 text-xs text-zinc-400">
                    {p.qty.toFixed(p.qty < 10 ? 3 : 1)} sh @ {money(p.avgPrice)}
                    {px != null && <> · now {money(px)} · worth {money(px * p.qty)}</>}
                  </span>
                  <span className={`w-20 text-right text-sm font-semibold tabular-nums ${g == null ? "text-zinc-500" : g >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {g == null ? "…" : signed(g)}
                  </span>
                  <span className="flex gap-1.5">
                    <button onClick={() => onTrade("buy", p.symbol, px)} className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-600">
                      Buy more
                    </button>
                    <button onClick={() => onTrade("sell", p.symbol, px)} className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-red-600">
                      Sell
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {paper.trades.length > 0 && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Practice trade history</div>
          <ul className="space-y-1 text-xs text-zinc-400">
            {paper.trades.slice(0, 15).map((t) => (
              <li key={t.id}>
                {t.date} · <span className={t.side === "buy" ? "text-emerald-400" : "text-red-400"}>{t.side}</span> {t.qty.toFixed(t.qty < 10 ? 3 : 1)} {t.symbol} @{" "}
                {money(t.price)}
                {t.realizedUsd != null && (
                  <span className={t.realizedUsd >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {" "}
                    ({t.realizedUsd >= 0 ? "+" : "−"}
                    {money(Math.abs(t.realizedUsd))})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="text-right">
        {confirmReset ? (
          <span className="text-xs text-zinc-400">
            Start over with $10,000?{" "}
            <button onClick={() => (onReset(), setConfirmReset(false))} className="font-semibold text-red-300">
              Yes, reset
            </button>{" "}
            <button onClick={() => setConfirmReset(false)} className="text-zinc-500">
              Cancel
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmReset(true)} className="text-xs text-zinc-500 hover:text-red-300">
            Reset practice portfolio
          </button>
        )}
      </div>
    </div>
  );
}

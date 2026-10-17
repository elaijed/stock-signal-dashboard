import React, { useMemo, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import { Chevron } from "../ui/components.jsx";
import TrackRecord from "./TrackRecord.jsx";
import { Button, Eyebrow, SectionHead, ExampleTag, Initials } from "./shared.jsx";
import { LivePreviewSection, PreviewCard, useSnapshot, usePreviewAvailable, PREVIEW_SYMBOLS } from "./LivePreview.jsx";

export const TICKER_KEY = "ssd_landing_ticker";

function readTicker() {
  try {
    return localStorage.getItem(TICKER_KEY) || "";
  } catch (_) {
    return "";
  }
}
function saveTicker(t) {
  try {
    if (t) localStorage.setItem(TICKER_KEY, t);
    else localStorage.removeItem(TICKER_KEY);
  } catch (_) {}
}

const Container = ({ className = "", children }) => <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;

// ---------- hero ----------

// Deterministic made-up series, only used when no real snapshot is available.
function exampleCandles() {
  const out = [];
  let p = 100;
  const t0 = Math.floor(Date.now() / 1000) - 220 * 86400;
  for (let i = 0; i < 220; i++) {
    p *= 1 + Math.sin(i / 6) * 0.007 + 0.0022;
    out.push({ t: t0 + i * 86400, close: Math.round(p * 100) / 100, v: 1e6 });
  }
  return out;
}

function PhoneMockup({ symbol }) {
  const snap = useSnapshot(symbol);
  const fallback = useMemo(() => (snap.status === "missing" ? exampleCandles() : null), [snap.status]);
  return (
    <div className="relative mx-auto w-[300px] shrink-0">
      <div className="rounded-[2.75rem] bg-[#1a1714] p-[10px] ring-1 ring-zinc-700">
        <div className="relative h-[570px] overflow-hidden rounded-[2.2rem] bg-zinc-950">
          <div className="absolute left-1/2 top-2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-[#1a1714]" />
          <div className="flex items-center justify-between px-5 pb-2 pt-10">
            <span className="flex items-center gap-1.5">
              <img src="./icon.svg" alt="" className="h-6 w-6 rounded-md" />
              <span className="font-display text-base font-extrabold tracking-tight text-zinc-50">
                signals<span className="text-blue-500">.</span>
              </span>
            </span>
            <Ic name="bell" size={16} className="text-zinc-400" />
          </div>
          <div className="px-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5">
              {fallback && (
                <div className="mb-2">
                  <ExampleTag>Example stock</ExampleTag>
                </div>
              )}
              <PreviewCard
                symbol={fallback ? "DEMO" : symbol}
                candles={fallback || (snap.status === "ready" ? snap.candles : null)}
                compact
                chartHeight={110}
              />
            </div>
            <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
              <Initials name="Maya Ross" size={30} />
              <div className="min-w-0 text-xs leading-snug">
                <div className="font-semibold text-zinc-100">Maya added {fallback ? "a stock" : symbol}</div>
                <div className="text-zinc-500">2 friends are watching it</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero({ onSignup, symbol }) {
  const [ticker, setTicker] = useState(readTicker);
  const clean = ticker.trim().toUpperCase();
  const valid = /^[A-Z][A-Z.\-]{0,5}$/.test(clean);
  const onChange = (v) => {
    const t = v.toUpperCase().replace(/[^A-Z.\-]/g, "").slice(0, 6);
    setTicker(t);
    saveTicker(/^[A-Z][A-Z.\-]{0,5}$/.test(t) ? t : "");
  };
  const go = (e) => {
    e?.preventDefault();
    saveTicker(valid ? clean : "");
    onSignup();
  };
  return (
    <section className="pb-16 pt-10 sm:pb-24 sm:pt-16">
      <Container className="flex flex-col items-center gap-14 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full max-w-xl text-center lg:text-left">
          <Eyebrow icon="sparkles">Free for beginners</Eyebrow>
          <h1 className="mt-5 text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-zinc-50 sm:text-6xl lg:text-[4.25rem]">
            Plain-English stock signals, <span className="text-blue-500">with your friends.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-zinc-400 lg:mx-0">
            Free signals that explain themselves. Practice with pretend money. See what your friends are buying, and why.
          </p>
          <form onSubmit={go} className="mx-auto mt-8 flex max-w-md flex-col gap-2.5 sm:flex-row lg:mx-0">
            <label className="relative flex-1">
              <span className="sr-only">Stock ticker</span>
              <Ic name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={ticker}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Try: AAPL"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="h-13 w-full rounded-full border border-zinc-700 bg-zinc-900 pl-11 pr-4 text-base font-semibold uppercase tracking-wide text-zinc-100 outline-none transition placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
              />
            </label>
            <Button type="submit" size="lg" className="whitespace-nowrap">
              {valid ? `See ${clean}'s signal` : "Try it free"}
              <Ic name="arrowRight" size={18} />
            </Button>
          </form>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-zinc-500 lg:justify-start">
            <span className="inline-flex items-center gap-1.5"><Ic name="check" className="text-emerald-500" /> Free, no card needed</span>
            <span className="inline-flex items-center gap-1.5"><Ic name="check" className="text-emerald-500" /> No broker needed</span>
            <span className="inline-flex items-center gap-1.5"><Ic name="check" className="text-emerald-500" /> Private by default</span>
          </div>
        </div>
        <div className="hidden lg:block">
          <PhoneMockup symbol={symbol} />
        </div>
      </Container>
    </section>
  );
}

// ---------- how it works ----------

const STEPS = [
  { icon: "plus", title: "Add stocks you're curious about", text: "Search any company you've heard of, like Apple or Tesla. No money, no broker, no jargon." },
  { icon: "bulb", title: "Read the verdict and the Why", text: "Each stock gets a simple call, like Buy, Wait for a dip or Avoid, plus three checks in plain English that show the reasoning." },
  { icon: "users", title: "Follow friends and compare", text: "Post your calls, see what friends are watching, and find out over time whose instincts are best." },
];

function HowItWorks() {
  return (
    <section id="features" className="scroll-mt-20 py-16 sm:py-24">
      <Container>
        <SectionHead eyebrow="How it works" icon="compass" title="Three steps. No finance degree." sub="signals. reads the charts for you and tells you what it sees, in words you'd use with a friend." />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="group rounded-3xl border border-zinc-800 bg-zinc-900 p-6 transition-colors hover:border-zinc-600">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-950 text-blue-500">
                  <Ic name={s.icon} size={20} />
                </span>
                <span className="font-display text-4xl font-extrabold text-zinc-800 transition-colors group-hover:text-zinc-700">{i + 1}</span>
              </div>
              <h3 className="mt-6 font-display text-xl font-bold tracking-tight text-zinc-50">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">{s.text}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

// ---------- social preview ----------

const POSTS = [
  { name: "Maya Ross", handle: "mayainvests", time: "2h", sym: "NVDA", at: "$120", since: 14, text: "Trend is up and the Why panel says all three checks agree. Adding a little more to my practice portfolio.", likes: 48, comments: 12 },
  { name: "Jordan Tate", handle: "jtate", time: "5h", sym: "TSLA", at: "$262", since: -6, text: "Got in too early on this one. Signal said Wait for a dip and I didn't listen. Lesson learned.", likes: 31, comments: 9 },
  { name: "Sam Kim", handle: "samk", time: "1d", sym: "AAPL", at: "$218", since: 7, text: "Boring pick, but steady. Calling it up for the month.", likes: 22, comments: 4 },
];

function Post({ p }) {
  const up = p.since >= 0;
  return (
    <article className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-600">
      <header className="flex items-center gap-3">
        <Initials name={p.name} size={40} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[15px] font-semibold text-zinc-100">{p.name}</div>
          <div className="truncate text-xs text-zinc-500">@{p.handle} · {p.time}</div>
        </div>
        <Ic name="more" size={18} className="text-zinc-500" />
      </header>
      <div className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${up ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"}`}>
        <Ic name={up ? "up" : "down"} size={14} />
        Called {p.sym} at {p.at} · {up ? "+" : "−"}{Math.abs(p.since)}% since
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-300">{p.text}</p>
      <footer className="mt-4 flex items-center gap-5 border-t border-zinc-800 pt-3 text-sm text-zinc-500">
        <span className="inline-flex items-center gap-1.5"><Ic name="heart" size={17} /> {p.likes}</span>
        <span className="inline-flex items-center gap-1.5"><Ic name="chat" size={17} /> {p.comments}</span>
        <span className="ml-auto inline-flex items-center gap-1.5"><Ic name="bookmark" size={17} /></span>
      </footer>
    </article>
  );
}

const BOARD = [
  { name: "Maya Ross", pct: 18.4, level: "Analyst" },
  { name: "Leo Park", pct: 12.1, level: "Trader" },
  { name: "Sam Kim", pct: 9.7, level: "Trader" },
  { name: "Jordan Tate", pct: 4.2, level: "Rookie" },
];

function Leaderboard() {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight text-zinc-50">
          <Ic name="trophy" size={18} className="text-blue-500" /> This month
        </h3>
        <ExampleTag />
      </div>
      <ol className="mt-4 space-y-1">
        {BOARD.map((b, i) => (
          <li key={b.name} className={`flex items-center gap-3 rounded-2xl px-2.5 py-2 ${i === 0 ? "bg-blue-950" : ""}`}>
            <span className={`w-5 text-center text-sm font-bold ${i === 0 ? "text-blue-500" : "text-zinc-500"}`}>{i + 1}</span>
            <Initials name={b.name} size={30} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold text-zinc-100">{b.name}</div>
              <div className="text-[11px] text-zinc-500">{b.level}</div>
            </div>
            <span className="text-sm font-semibold text-emerald-500">+{b.pct}%</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">Ranked by percent return only. Nobody sees your dollar amounts.</p>
    </div>
  );
}

function SocialPreview() {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead eyebrow="Social" icon="users" title="Investing is better with friends." sub="Share your calls, see how they play out, and learn from people you actually know." />
          <ExampleTag>Example posts</ExampleTag>
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            <Post p={POSTS[0]} />
            <Post p={POSTS[1]} />
            <div className="sm:col-span-2">
              <Post p={POSTS[2]} />
            </div>
          </div>
          <Leaderboard />
        </div>
      </Container>
    </section>
  );
}

// ---------- practice + game ----------

function Practice({ onSignup }) {
  const rows = [
    { sym: "AAPL", shares: 10, value: 2284.5, pct: 4.8 },
    { sym: "NVDA", shares: 12, value: 1650.24, pct: 11.2 },
    { sym: "TSLA", shares: 3, value: 731.4, pct: -3.1 },
  ];
  return (
    <div className="flex flex-col rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
      <Eyebrow icon="coins" className="self-start">Practice mode</Eyebrow>
      <h3 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-zinc-50">Start with $10,000 of pretend money.</h3>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
        Buy and sell at real prices without risking a cent. Make mistakes here, not with your savings, and see how your choices would have played out.
      </p>
      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Practice portfolio</span>
          <ExampleTag />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-zinc-50">$10,412.86</span>
          <span className="text-sm font-semibold text-emerald-500">+4.13%</span>
        </div>
        <div className="mt-3 divide-y divide-zinc-800">
          {rows.map((r) => (
            <div key={r.sym} className="flex items-center justify-between py-2 text-sm">
              <span className="font-semibold text-zinc-100">{r.sym} <span className="font-normal text-zinc-500">· {r.shares} shares</span></span>
              <span className="text-zinc-300">
                ${r.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
                <span className={r.pct >= 0 ? "text-emerald-500" : "text-red-500"}>{r.pct >= 0 ? "+" : "−"}{Math.abs(r.pct)}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto pt-6">
        <Button variant="outline" onClick={onSignup}>Start practicing <Ic name="arrowRight" /></Button>
      </div>
    </div>
  );
}

function DailyGame({ onSignup }) {
  return (
    <div className="flex flex-col rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
      <Eyebrow icon="game" className="self-start">Daily game</Eyebrow>
      <h3 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-zinc-50">Call of the Day.</h3>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">Guess up or down, keep your streak, level up. One quick question a day that teaches you how stocks really move.</p>
      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-blue-500"><Ic name="flame" size={15} /> 7-day streak</span>
          <ExampleTag />
        </div>
        <div className="mt-3 font-display text-xl font-bold tracking-tight text-zinc-50">Will AAPL close higher today?</div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button onClick={onSignup} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-800 bg-emerald-950 font-semibold text-emerald-400 transition-colors hover:border-emerald-500">
            <Ic name="arrowUp" size={18} /> Up
          </button>
          <button onClick={onSignup} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-red-800 bg-red-950 font-semibold text-red-400 transition-colors hover:border-red-500">
            <Ic name="arrowDown" size={18} /> Down
          </button>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>Level 4 · Trader</span>
            <span>320 / 500 XP</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full w-[64%] rounded-full bg-blue-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- FAQ ----------

const FAQ = [
  { q: "Is it free?", a: "Yes. signals. is free to use. You can add stocks, read signals, practice with pretend money and play the daily game without paying anything." },
  { q: "Is this financial advice?", a: "No. signals. is an educational tool. The signals come from simple, well-known chart checks (trend, momentum and MACD) and they are often wrong. Use them to learn and to ask better questions, not as instructions to buy or sell." },
  { q: "Do I need a broker?", a: "No. You don't connect a bank or a brokerage account. You can track stocks you're curious about, and practice with $10,000 of pretend money. If you already invest, you can type in what you own to keep an eye on it." },
  { q: "Who can see my portfolio?", a: "Your account is private by default. You choose whether your profile is public or private, and what connections can see. Dollar amounts stay hidden unless you decide to share them; leaderboards only ever show percentages." },
  { q: "What's the market data key?", a: "Live prices come from Finnhub. A key is free from finnhub.io and takes about a minute to get. If a friend invited you, they can share theirs. Charts and practice mode still work without one." },
];

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="scroll-mt-20 py-16 sm:py-24">
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <SectionHead eyebrow="FAQ" icon="help" title="Questions, answered." sub="Still curious? Reach us any time from the Contact page." />
        <div className="divide-y divide-zinc-800 border-y border-zinc-800">
          {FAQ.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q}>
                <button
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left font-display text-lg font-semibold tracking-tight text-zinc-100 transition-colors hover:text-blue-500"
                >
                  {f.q}
                  <Chevron open={isOpen} />
                </button>
                <div className={`grid transition-all duration-200 ${isOpen ? "grid-rows-[1fr] pb-5 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <p className="overflow-hidden text-[15px] leading-relaxed text-zinc-400">{f.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

// ---------- final CTA ----------

function FinalCta({ onSignup }) {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div className="rounded-[2rem] bg-zinc-100 px-6 py-14 text-center sm:px-12 sm:py-20">
          <h2 className="mx-auto max-w-2xl text-4xl font-extrabold leading-[1.05] text-zinc-950 sm:text-5xl">Understand the stocks you're curious about.</h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-zinc-600">Free signals, pretend money, and your friends. Set up in under a minute.</p>
          <Button size="lg" onClick={onSignup} className="mt-8">Try it free <Ic name="arrowRight" size={18} /></Button>
          <p className="mt-5 text-xs text-zinc-500">Educational tool only, not financial advice.</p>
        </div>
      </Container>
    </section>
  );
}

// ---------- page ----------

export default function Landing({ onSignup }) {
  const [symbol, setSymbol] = useState(PREVIEW_SYMBOLS[0]);
  const available = usePreviewAvailable(); // hide the live preview if the snapshots are missing
  return (
    <>
      <Hero onSignup={onSignup} symbol={symbol} />
      {available !== false && (
      <section id="preview" className="scroll-mt-20 pb-8">
        <Container className="grid items-start gap-10 lg:grid-cols-[1fr_1.25fr]">
          <div className="lg:pt-6">
            <SectionHead
              eyebrow="Live preview"
              icon="chart"
              title="A real signal, explained."
              sub="This is the actual card you'd see in the app. Tap a stock, then read the Why: three simple checks, with the real numbers behind them."
            />
            <p className="mt-6 text-xs text-zinc-500">Based on daily closing prices. Educational only, not financial advice.</p>
          </div>
          <LivePreviewSection symbol={symbol} onSymbol={setSymbol} />
        </Container>
      </section>
      )}
      <HowItWorks />
      <div id="track-record" className="scroll-mt-20">
        <TrackRecord />
      </div>
      <SocialPreview />
      <section className="py-8 sm:py-12">
        <Container className="grid gap-4 lg:grid-cols-2">
          <Practice onSignup={onSignup} />
          <DailyGame onSignup={onSignup} />
        </Container>
      </section>
      <Faq />
      <FinalCta onSignup={onSignup} />
    </>
  );
}

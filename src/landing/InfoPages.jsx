import React, { useState } from "react";
import { Ic } from "../ui/icons.jsx";
import { sendContactMessage } from "../social/api.js";
import { Button, Eyebrow, inputCls } from "./shared.jsx";

// About / Contact / Privacy / Terms. Each works on its own (inside the
// logged-in app) or inside PublicSite. `onNavigate(page)` is optional and
// only adds links between pages when given.

const UPDATED = "October 17, 2026";
const EMAIL = "elaijed@gmail.com";
const PHONE = "(561) 816-9176";
const PHONE_HREF = "tel:+15618169176";

function Page({ eyebrow, icon, title, intro, children }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
      <Eyebrow icon={icon}>{eyebrow}</Eyebrow>
      <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] text-zinc-50 sm:text-5xl">{title}</h1>
      {intro && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-400">{intro}</p>}
      <div className="mt-10">{children}</div>
    </div>
  );
}

function Block({ title, children }) {
  return (
    <section className="border-t border-zinc-800 py-7">
      <h2 className="text-xl font-bold text-zinc-50">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-zinc-400 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-zinc-200 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

const A = ({ href, children }) => (
  <a href={href} className="font-semibold text-blue-500 hover:text-blue-600 hover:underline">
    {children}
  </a>
);

function ContactLine({ onNavigate }) {
  return (
    <p>
      Email <A href={`mailto:${EMAIL}`}>{EMAIL}</A>, call <A href={PHONE_HREF}>{PHONE}</A>
      {onNavigate ? (
        <>
          , or use the{" "}
          <button type="button" onClick={() => onNavigate("contact")} className="font-semibold text-blue-500 hover:underline">
            contact form
          </button>
        </>
      ) : null}
      .
    </p>
  );
}

// ---------- About ----------

const VALUES = [
  { icon: "bulb", title: "Understandable", text: "Every signal comes with a plain-English Why and the real numbers behind it. No black boxes." },
  { icon: "users", title: "Social", text: "Learning is easier with people you know. Share calls, compare notes and see who's on a roll." },
  { icon: "shield", title: "Safe to learn", text: "Practice with pretend money first. Your account is private unless you choose otherwise." },
];

export function AboutPage({ onNavigate }) {
  return (
    <Page
      eyebrow="About us"
      icon="sparkles"
      title="Making investing understandable, and a little more social."
      intro="signals. is a free app that reads stock charts for you and explains what it sees in everyday words. You can practice with pretend money, follow friends, and learn how the market really moves without risking your savings."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {VALUES.map((v) => (
          <div key={v.title} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-950 text-blue-500">
              <Ic name={v.icon} size={19} />
            </span>
            <h3 className="mt-4 font-display text-lg font-bold tracking-tight text-zinc-50">{v.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{v.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-10">
        <Block title="Why we built it">
          <p>
            Most investing apps assume you already know the lingo. Most beginners learn from strangers online. We wanted something in
            between: honest, simple signals you can check for yourself, and a place to learn alongside friends.
          </p>
        </Block>
        <Block title="Who we are">
          <p>
            signals. is built by a small, independent team. We're not a bank or a broker, and we don't take money to promote any stock.
            The app is an educational tool, not financial advice.
          </p>
        </Block>
        <Block title="Say hello">
          <ContactLine onNavigate={onNavigate} />
        </Block>
      </div>
    </Page>
  );
}

// ---------- Contact ----------

export function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please add your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email so we can reply.");
    if (body.trim().length < 5) return setError("Please write a short message.");
    setState("sending");
    try {
      await sendContactMessage({ name, email, body });
      setState("sent");
    } catch (err) {
      setState("error");
      setError(`We couldn't send that (${err?.message || "network error"}). Try again, or email us directly.`);
    }
  }

  return (
    <Page eyebrow="Contact us" icon="mail" title="We'd love to hear from you." intro="Questions, ideas, a bug, or just feedback. Send us a note and we'll get back to you.">
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-7">
          {state === "sent" ? (
            <div className="py-6 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-950 text-emerald-500">
                <Ic name="check" size={26} />
              </span>
              <h2 className="mt-5 text-2xl font-bold text-zinc-50">Message sent</h2>
              <p className="mt-2 text-[15px] text-zinc-400">Thanks, {name.trim().split(/\s+/)[0]}. We'll reply to {email.trim()}.</p>
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => {
                  setBody("");
                  setState("idle");
                }}
              >
                Send another
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Message</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  className={`${inputCls} h-auto resize-y py-3 leading-relaxed`}
                />
              </label>
              {error && (
                <div role="alert" className="flex gap-2 rounded-xl border border-red-800/60 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-300">
                  <Ic name="warn" className="mt-0.5" />
                  {error}
                </div>
              )}
              <Button type="submit" size="lg" disabled={state === "sending"} className="w-full sm:w-auto">
                {state === "sending" ? "Sending…" : "Send message"} <Ic name="send" />
              </Button>
            </form>
          )}
        </div>
        <div className="space-y-3">
          <a href={`mailto:${EMAIL}`} className="flex items-center gap-3 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-600">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-950 text-blue-500"><Ic name="mail" size={18} /></span>
            <span className="min-w-0">
              <span className="block text-xs font-medium uppercase tracking-wider text-zinc-500">Email</span>
              <span className="block truncate font-semibold text-zinc-100">{EMAIL}</span>
            </span>
          </a>
          <a href={PHONE_HREF} className="flex items-center gap-3 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-600">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-950 text-blue-500"><Ic name="phone" size={18} /></span>
            <span>
              <span className="block text-xs font-medium uppercase tracking-wider text-zinc-500">Phone</span>
              <span className="block font-semibold text-zinc-100">{PHONE}</span>
            </span>
          </a>
          <p className="px-1 text-xs leading-relaxed text-zinc-500">We can't give personal investment advice, but we're happy to explain how the app works.</p>
        </div>
      </div>
    </Page>
  );
}

// ---------- Privacy ----------

export function PrivacyPage({ onNavigate }) {
  return (
    <Page eyebrow="Privacy" icon="lock" title="Privacy policy" intro={`The short version: your account is private by default, you decide what to share, and we never sell your data. Last updated ${UPDATED}.`}>
      <Block title="What we store">
        <p>When you create an account, we store:</p>
        <ul>
          <li><strong>Your email address</strong> and a securely hashed password, so you can log in.</li>
          <li><strong>Your profile</strong>: the name, username, photo and bio you choose to add.</li>
          <li><strong>Your lists</strong>: stocks you watch, positions you type in, practice-money trades and price alerts.</li>
          <li><strong>What you post</strong>: posts, comments, reactions, calls and game guesses.</li>
        </ul>
        <p>This is stored with Supabase, our database provider, and protected so that only you can read your own records directly.</p>
      </Block>
      <Block title="Market data">
        <p>
          Prices and company information come from <strong>Finnhub</strong> and <strong>Yahoo Finance</strong>. Your market data key is kept in
          your browser on your device. If you choose to share your key with friends you invite, we store it in your account so their app can use
          it; deleting your account removes it. When the app asks for a price, those services see a normal request for that stock; we don't
          send them your personal details.
        </p>
      </Block>
      <Block title="Who can see what">
        <ul>
          <li><strong>Private by default.</strong> A new account shares nothing until you change it.</li>
          <li><strong>You choose public or private.</strong> If your account is public, your posts can be seen by other signed-in users.</li>
          <li><strong>Connections see only what you share.</strong> You pick, for example, whether friends see your watchlist or your holdings.</li>
          <li><strong>Dollar amounts stay hidden</strong> unless you choose to share them. Leaderboards show percentages only.</li>
          <li>You can block or report anyone at any time.</li>
        </ul>
      </Block>
      <Block title="What we don't do">
        <ul>
          <li>We don't sell your data, and we don't share it with advertisers.</li>
          <li>We don't connect to your bank or brokerage account.</li>
        </ul>
      </Block>
      <Block title="Your choices">
        <p>
          You can edit your profile and sharing settings any time. You can delete your account any time in <strong>Settings</strong>; this removes
          your profile, lists, posts and other data from our database.
        </p>
        <p>Some preferences (like light or dark mode and your market data key) are kept only in your browser. Clearing your browser data removes them.</p>
      </Block>
      <Block title="Questions">
        <ContactLine onNavigate={onNavigate} />
        <p className="text-sm text-zinc-500">We may update this policy as the app changes. We'll change the date at the top when we do.</p>
      </Block>
    </Page>
  );
}

// ---------- Terms ----------

export function TermsPage({ onNavigate }) {
  return (
    <Page eyebrow="Terms" icon="book" title="Terms of use" intro={`The rules for using signals., in plain English. By using the app you agree to them. Last updated ${UPDATED}.`}>
      <Block title="1. Educational only, not financial advice">
        <p>
          signals. is a learning tool. The signals, verdicts and explanations are produced automatically from simple chart checks. They are
          <strong> not</strong> recommendations to buy or sell anything, and we are not your financial adviser. Talk to a licensed professional
          before making real investment decisions.
        </p>
      </Block>
      <Block title="2. No guarantees">
        <p>
          Signals are often wrong, past results don't predict future ones, and market data can be delayed, incomplete or incorrect. We provide the
          app "as is", without warranties of any kind.
        </p>
      </Block>
      <Block title="3. Practice money is pretend">
        <p>Practice mode, the daily game and leaderboards use pretend money and points. They have no cash value and can't be exchanged for anything.</p>
      </Block>
      <Block title="4. Be respectful">
        <p>Keep it friendly and honest. You agree not to:</p>
        <ul>
          <li>spam, advertise, or post misleading content;</li>
          <li>try to "pump" a stock or coordinate others to buy or sell it;</li>
          <li>harass, threaten, or impersonate anyone;</li>
          <li>post anything illegal or anyone else's private information.</li>
        </ul>
        <p>You can report posts and block people at any time. We review reports.</p>
      </Block>
      <Block title="5. Your content and your account">
        <p>
          You own what you post. By posting, you let us show it to the people you've chosen to share it with. We may remove content or suspend or
          delete accounts that break these rules. You can delete your account at any time in Settings.
        </p>
      </Block>
      <Block title="6. Use at your own risk">
        <p>
          You are responsible for your own decisions. To the fullest extent the law allows, we are not liable for any losses or damages that come from
          using the app or relying on its information.
        </p>
      </Block>
      <Block title="7. Changes and contact">
        <p>We may update these terms as the app changes, and we'll update the date above when we do.</p>
        <ContactLine onNavigate={onNavigate} />
      </Block>
    </Page>
  );
}

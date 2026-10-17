import React, { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { Ic } from "../ui/icons.jsx";
import { Button, inputCls } from "./shared.jsx";

// Log in / sign up / forgot password. Same Supabase calls and error handling
// as the old AuthScreen in App.jsx, in the new look.
//   mode: "login" | "signup"   onMode(m): switch between them (router)
//   onNavigate(page): open terms / privacy     inviteFrom: string | true
//   onAuthed(session): called after a successful log-in or instant sign-up
const redirectUrl = () => window.location.origin + window.location.pathname;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Alert({ tone, children }) {
  const cls =
    tone === "error"
      ? "border-red-800/60 bg-red-950/40 text-red-300"
      : "border-emerald-800/60 bg-emerald-950/40 text-emerald-300";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-2 rounded-xl border px-3.5 py-2.5 text-sm leading-snug ${cls}`}>
      <Ic name={tone === "error" ? "warn" : "check"} className="mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function Field({ label, right, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-zinc-300">
        {label}
        {right}
      </span>
      {children}
    </label>
  );
}

export default function AuthPage({ mode: modeProp = "login", onMode, onNavigate, inviteFrom, onAuthed }) {
  const [mode, setModeState] = useState(modeProp); // "login" | "signup" | "forgot" | "check"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    setModeState((m) => (m === "check" && modeProp === "signup" ? m : modeProp));
  }, [modeProp]);

  const switchMode = (m) => {
    setError(null);
    setNotice(null);
    setConfirmPw("");
    setModeState(m);
    if ((m === "login" || m === "signup") && onMode) onMode(m);
  };

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const em = email.trim();
    if (!EMAIL_RE.test(em)) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (mode === "signup" && password !== confirmPw) return setError("Passwords don't match.");
    setBusy(true);
    try {
      if (mode === "login") {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: em, password });
        if (err) {
          if (/confirm/i.test(err.message)) {
            setNeedsConfirm(true);
            setError("Your email isn't confirmed yet. Click the link we emailed you, then log in.");
          } else if (/invalid login credentials/i.test(err.message)) {
            setError("Wrong email or password.");
          } else {
            setError(err.message);
          }
        } else if (data?.session) {
          onAuthed?.(data.session); // App's auth listener also picks this up
        }
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: em,
          password,
          options: { emailRedirectTo: redirectUrl() },
        });
        if (err) {
          setError(err.message);
        } else if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          // Supabase answers this way (no error) when the email is already registered
          switchMode("login");
          setError("An account with this email already exists. Log in instead.");
        } else if (!data.session) {
          setNeedsConfirm(true);
          setPassword("");
          setConfirmPw("");
          setModeState("check");
        } else {
          onAuthed?.(data.session);
        }
      }
    } catch (err) {
      setError(err?.message || "Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    const em = email.trim();
    if (!em) return setError("Enter your email above first.");
    setBusy(true);
    const { error: err } = await supabase.auth.resend({ type: "signup", email: em, options: { emailRedirectTo: redirectUrl() } });
    setBusy(false);
    if (err) setError(err.message);
    else setNotice(`Confirmation email re-sent to ${em}.`);
  }

  async function sendReset(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const em = email.trim();
    if (!EMAIL_RE.test(em)) return setError("Enter a valid email address.");
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: redirectUrl() });
      if (err) setError(err.message);
      else setNotice(`If there's an account for ${em}, a reset link is on its way. Open it on this device to choose a new password.`);
    } catch (err) {
      setError(err?.message || "Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const inviter = inviteFrom ? (typeof inviteFrom === "string" && inviteFrom.trim() ? inviteFrom.trim() : "A friend") : null;
  const link = "font-semibold text-blue-500 hover:text-blue-600 hover:underline";

  let body;
  if (mode === "check") {
    body = (
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-950 text-blue-500">
          <Ic name="mail" size={26} />
        </span>
        <h1 className="mt-5 text-3xl font-bold text-zinc-50">Check your email</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
          We sent a confirmation link to <span className="font-semibold text-zinc-100">{email.trim()}</span>. Click it, then come back here and log in.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          If the page the link opens doesn't load, that's fine. Your account is still confirmed. Can't find it? Check spam.
        </p>
        <div className="mt-6 space-y-3 text-left">
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="ok">{notice}</Alert>}
        </div>
        <Button size="lg" className="mt-6 w-full" onClick={() => switchMode("login")}>
          Go to log in
        </Button>
        <button type="button" onClick={resend} disabled={busy} className="mt-4 text-sm text-zinc-500 hover:text-zinc-200 disabled:opacity-50">
          Didn't get it? Resend the email
        </button>
      </div>
    );
  } else if (mode === "forgot") {
    body = (
      <>
        <h1 className="text-3xl font-bold text-zinc-50">Reset your password</h1>
        <p className="mt-2 text-[15px] text-zinc-400">Enter your email and we'll send you a link to choose a new one.</p>
        <form onSubmit={sendReset} className="mt-7 space-y-4" noValidate>
          <Field label="Email">
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="ok">{notice}</Alert>}
          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? "Please wait…" : "Send reset link"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500">
          Remembered it?{" "}
          <button type="button" onClick={() => switchMode("login")} className={link}>Log in</button>
        </p>
      </>
    );
  } else {
    const signup = mode === "signup";
    body = (
      <>
        <h1 className="text-3xl font-bold text-zinc-50">{signup ? "Create your free account" : "Welcome back"}</h1>
        <p className="mt-2 text-[15px] text-zinc-400">
          {signup ? "Plain-English signals, pretend money and your friends. Takes a minute." : "Log in to see your stocks and your friends."}
        </p>
        <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
          <Field label="Email">
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
          </Field>
          <Field
            label="Password"
            right={
              <button type="button" onClick={() => setShowPw((s) => !s)} className="text-xs font-medium text-zinc-500 hover:text-zinc-200">
                {showPw ? "Hide" : "Show"}
              </button>
            }
          >
            <input
              type={showPw ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={signup ? "At least 8 characters" : ""}
              className={inputCls}
            />
          </Field>
          {signup && (
            <Field label="Confirm password">
              <input type={showPw ? "text" : "password"} autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={inputCls} />
            </Field>
          )}
          {!signup && (
            <div className="-mt-1 text-right">
              <button type="button" onClick={() => switchMode("forgot")} className="text-sm font-medium text-zinc-500 hover:text-zinc-200">
                Forgot password?
              </button>
            </div>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="ok">{notice}</Alert>}
          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? "Please wait…" : signup ? "Create account" : "Log in"}
          </Button>
          {needsConfirm && !signup && (
            <button type="button" onClick={resend} disabled={busy} className="w-full text-center text-sm text-zinc-500 hover:text-zinc-200 disabled:opacity-50">
              Didn't get the email? Resend confirmation
            </button>
          )}
          {signup && (
            <p className="text-center text-xs leading-relaxed text-zinc-500">
              By signing up you agree to the{" "}
              {onNavigate ? (
                <button type="button" onClick={() => onNavigate("terms")} className="underline hover:text-zinc-200">Terms</button>
              ) : (
                "Terms"
              )}{" "}
              and{" "}
              {onNavigate ? (
                <button type="button" onClick={() => onNavigate("privacy")} className="underline hover:text-zinc-200">Privacy policy</button>
              ) : (
                "Privacy policy"
              )}
              .
            </p>
          )}
        </form>
        <p className="mt-6 border-t border-zinc-800 pt-6 text-center text-sm text-zinc-500">
          {signup ? "Already have an account? " : "New to signals.? "}
          <button type="button" onClick={() => switchMode(signup ? "login" : "signup")} className={link}>
            {signup ? "Log in" : "Sign up free"}
          </button>
        </p>
      </>
    );
  }

  return (
    <div className="px-4 pb-20 pt-8 sm:pt-16">
      <div className="mx-auto w-full max-w-md">
        {inviter && mode !== "check" && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-blue-800 bg-blue-950 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
              <Ic name="gift" size={17} />
            </span>
            <p className="text-sm leading-snug text-zinc-200">
              <span className="font-semibold text-zinc-50">{inviter}</span> invited you to signals<span className="text-blue-500">.</span>
            </p>
          </div>
        )}
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">{body}</div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-500">
          <Ic name="lock" size={13} /> Your data is private by default. Educational tool only, not financial advice.
        </p>
      </div>
    </div>
  );
}

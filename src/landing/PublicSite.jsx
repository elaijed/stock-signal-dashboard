import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import { Button, Logo } from "./shared.jsx";
import Landing from "./Landing.jsx";
import AuthPage from "./AuthPage.jsx";
import { AboutPage, ContactPage, PrivacyPage, TermsPage } from "./InfoPages.jsx";

// The "front door" for logged-out visitors: a tiny router on ?page=
// (none = landing, about, contact, privacy, terms, login, signup).
// Other query params (like ?invite=) are kept as-is.
const PAGES = ["about", "contact", "privacy", "terms", "login", "signup"];

function pageFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search).get("page");
    return PAGES.includes(p) ? p : "landing";
  } catch (_) {
    return "landing";
  }
}

function urlFor(page) {
  const q = new URLSearchParams(window.location.search);
  if (page === "landing") q.delete("page");
  else q.set("page", page);
  const s = q.toString();
  return window.location.pathname + (s ? `?${s}` : "") + window.location.hash;
}

const NAV = [
  { label: "Features", section: "features" },
  { label: "Track record", section: "track-record" },
  { label: "About", page: "about" },
];

function TopBar({ page, go, goSection }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setOpen(false), [page]);

  const navClick = (n) => {
    setOpen(false);
    if (n.page) go(n.page);
    else goSection(n.section);
  };

  return (
    <header className={`sticky top-0 z-40 border-b bg-zinc-950 transition-colors ${scrolled || open ? "border-zinc-800" : "border-transparent"}`}>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Logo onClick={() => go("landing")} />
        <nav className="ml-8 hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <button
              key={n.label}
              onClick={() => navClick(n)}
              className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors hover:bg-zinc-800/70 hover:text-zinc-50 ${
                n.page === page ? "text-zinc-50" : "text-zinc-400"
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => go("login")}>
            Log in
          </Button>
          <Button size="sm" onClick={() => go("signup")}>
            Sign up
          </Button>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-zinc-800/70 md:hidden"
          >
            <Ic name={open ? "x" : "menu"} size={20} />
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-zinc-800 bg-zinc-950 md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-4 py-3" aria-label="Menu">
            {NAV.map((n) => (
              <button key={n.label} onClick={() => navClick(n)} className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-base font-semibold text-zinc-100 hover:bg-zinc-900">
                {n.label}
                <Ic name="chevronRight" className="text-zinc-500" />
              </button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

function Footer({ go }) {
  const links = [
    ["about", "About us"],
    ["contact", "Contact us"],
    ["privacy", "Privacy"],
    ["terms", "Terms"],
  ];
  return (
    <footer className="border-t border-zinc-800">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Logo onClick={() => go("landing")} size="sm" />
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">Plain-English stock signals, with your friends.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-3" aria-label="Footer">
          {links.map(([p, label]) => (
            <button key={p} onClick={() => go(p)} className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-50">
              {label}
            </button>
          ))}
        </nav>
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 border-t border-zinc-800 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:justify-between sm:px-6">
        <span>Educational tool only, not financial advice.</span>
        <span>© 2026 signals.</span>
      </div>
    </footer>
  );
}

export default function PublicSite({ inviteFrom, onAuthed }) {
  const [page, setPage] = useState(() => {
    const p = pageFromUrl();
    return inviteFrom && p === "landing" ? "signup" : p; // invite links skip the landing page
  });
  const pendingSection = useRef(null);

  // Put the invite's starting page in the URL so Back from Terms etc. returns to sign up.
  useEffect(() => {
    if (page !== pageFromUrl()) {
      try {
        window.history.replaceState(window.history.state, "", urlFor(page));
      } catch (_) {}
    }
    const onPop = () => setPage(pageFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback(
    (p) => {
      if (p === page) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      try {
        window.history.pushState({ ssdPage: p }, "", urlFor(p));
      } catch (_) {}
      setPage(p);
    },
    [page]
  );

  const goSection = useCallback(
    (id) => {
      if (page === "landing") {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      pendingSection.current = id;
      go("landing");
    },
    [page, go]
  );

  // Scroll to top (or to a requested section) after every page change.
  useLayoutEffect(() => {
    const id = pendingSection.current;
    pendingSection.current = null;
    if (id) {
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    } else {
      window.scrollTo(0, 0);
    }
  }, [page]);

  const titles = {
    landing: "signals. Plain-English stock signals, with your friends",
    about: "About us · signals.",
    contact: "Contact us · signals.",
    privacy: "Privacy · signals.",
    terms: "Terms · signals.",
    login: "Log in · signals.",
    signup: "Sign up · signals.",
  };
  useEffect(() => {
    document.title = titles[page] || "signals.";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  let content;
  if (page === "login" || page === "signup") {
    content = <AuthPage mode={page} onMode={go} onNavigate={go} inviteFrom={inviteFrom} onAuthed={onAuthed} />;
  } else if (page === "about") content = <AboutPage onNavigate={go} />;
  else if (page === "contact") content = <ContactPage />;
  else if (page === "privacy") content = <PrivacyPage onNavigate={go} />;
  else if (page === "terms") content = <TermsPage onNavigate={go} />;
  else content = <Landing onSignup={() => go("signup")} />;

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-zinc-950 font-sans text-zinc-200">
      <TopBar page={page} go={go} goSection={goSection} />
      <main className="flex-1">{content}</main>
      <Footer go={go} />
    </div>
  );
}

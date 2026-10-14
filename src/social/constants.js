// Profile field options and privacy defaults. AUDIENCE_DEFAULTS must mirror
// field_default_audience() in supabase/001_social.sql.

export const AUDIENCES = [
  { id: "everyone", label: "Everyone" },
  { id: "connections", label: "Connections" },
  { id: "private", label: "Only me" },
];

const EVERYONE = ["avatar_url", "banner_color", "headline", "bio", "experience_level", "styles", "sectors",
  "years_investing", "risk_tolerance", "member_since", "counts"];
export function defaultAudience(field) {
  return EVERYONE.includes(field) ? "everyone" : "connections";
}
export function audienceOf(profile, field) {
  return profile?.visibility?.[field] || defaultAudience(field);
}

export const EXPERIENCE = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
  { id: "professional", label: "Professional" },
];
export const RISK = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];
export const STYLES = ["Long-term", "Swing trading", "Day trading", "Dividends", "Value", "Growth", "Index funds", "Options", "Crypto"];
export const SECTORS = ["Technology", "Healthcare", "Financials", "Energy", "Consumer", "Industrials", "Real estate",
  "Utilities", "Materials", "Communication", "Semiconductors", "ETFs"];
export const BROKERS = ["Robinhood", "Fidelity", "Schwab", "Vanguard", "E*TRADE", "Interactive Brokers", "Webull", "Public", "Other"];

export const BANNERS = {
  blue: "from-blue-700 to-indigo-800",
  green: "from-emerald-700 to-teal-800",
  purple: "from-violet-700 to-fuchsia-800",
  orange: "from-amber-600 to-orange-700",
  red: "from-rose-700 to-red-800",
  gray: "from-zinc-600 to-zinc-800",
};

export const LINKS = [
  { id: "website", label: "Website", placeholder: "https://…" },
  { id: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/…" },
  { id: "x", label: "X / Twitter", placeholder: "https://x.com/…" },
  { id: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
  { id: "youtube", label: "YouTube", placeholder: "https://youtube.com/@…" },
];

// What connections can see of your portfolio (defaults match the database)
export const SHARE_OPTIONS = [
  { id: "holdings", label: "Owned stocks", hint: "Which stocks you own and your buy price" },
  { id: "dollars", label: "Dollar amounts", hint: "Share counts, position values and total portfolio value" },
  { id: "unrealized", label: "Unrealized profit / loss", hint: "How your open positions are doing" },
  { id: "realized", label: "Closed trades", hint: "Your trade history and realized profit / loss" },
  { id: "watchlist", label: "Watchlist", hint: "Stocks you're watching" },
  { id: "sectors", label: "Sector allocation", hint: "How your portfolio splits across sectors" },
  { id: "alerts", label: "Price alerts", hint: "Your price alert levels" },
];
export const SHARE_DEFAULTS = { holdings: true, dollars: true, unrealized: true, realized: true, watchlist: true, sectors: true, alerts: false };

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function safeUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withProto);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch (_) {
    return null;
  }
}

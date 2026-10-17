// Discover / People: search, requests, trending tickers, people to follow,
// people you may know, your connections, sent requests and blocked people.
import React, { useEffect, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import Avatar from "./Avatar.jsx";
import LevelBadge from "../game/LevelBadge.jsx";
import { FeedList } from "./Feed.jsx";
import {
  searchProfiles, suggestedProfiles, discoverPeople, trendingSymbols, follow, unfollow, updateMyProfile,
  acceptRequestFrom, removeConnectionWith, unblockUser,
} from "./api.js";
import { useSocial, Sheet, TickerMono, Skeleton, EmptyState, SectionTitle, FoundingChip, coverStyle, compact, friendly, btn, inputCls } from "./ui.jsx";

const RELATION = { connected: ["Connected", "text-emerald-500"], pending_out: ["Requested", "text-zinc-500"], pending_in: ["Wants to connect", "text-blue-500"] };

export function PersonRow({ p, right, sub }) {
  const { onOpenProfile } = useSocial();
  const rel = RELATION[p.relation];
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
      <button onClick={() => onOpenProfile?.(p.id)} className="ss-tap flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar url={p.avatar_url} name={p.full_name} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-zinc-100">{p.full_name}</span>
          <span className="block truncate text-xs text-zinc-500">
            @{p.username}
            {p.headline ? ` · ${p.headline}` : ""}
          </span>
          {sub && <span className="mt-1 block text-xs italic text-zinc-400">“{sub}”</span>}
        </span>
      </button>
      {right ?? (rel && <span className={`shrink-0 text-xs font-medium ${rel[1]}`}>{rel[0]}</span>)}
    </div>
  );
}

function FollowCard({ p, onFollowed }) {
  const { uid, onOpenProfile } = useSocial();
  const [on, setOn] = useState(false);
  const [err, setErr] = useState(null);
  async function toggle() {
    const next = !on;
    setOn(next);
    try {
      await (next ? follow(uid, p.id) : unfollow(uid, p.id));
      if (next) onFollowed?.(p);
    } catch (e) {
      setOn(!next);
      setErr(friendly(e));
    }
  }
  return (
    <div className="flex w-40 shrink-0 flex-col items-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 pb-3 text-center">
      <div className="h-12 w-full" style={coverStyle(p.username || p.full_name)} />
      <button onClick={() => onOpenProfile?.(p.id)} className="ss-tap -mt-7 flex flex-col items-center px-2">
        <Avatar url={p.avatar_url} name={p.full_name} size="md" className="ring-4" />
        <span className="mt-1.5 line-clamp-1 text-sm font-semibold text-zinc-100">{p.full_name}</span>
        <span className="line-clamp-1 text-[11px] text-zinc-500">@{p.username}</span>
      </button>
      <div className="mt-1 flex h-5 items-center gap-1">
        <LevelBadge xp={p.xp} compact />
        {p.founding && <FoundingChip />}
      </div>
      <div className="mt-0.5 text-[11px] text-zinc-500">{compact(p.followers || 0)} follower{p.followers === 1 ? "" : "s"}</div>
      <button onClick={toggle} className={`mt-2 min-h-9 w-[calc(100%-1.5rem)] rounded-full text-xs font-semibold transition active:scale-95 ${on ? "bg-zinc-800 text-zinc-200" : "bg-blue-500 text-white hover:bg-blue-600"}`}>
        {on ? "Following" : "Follow"}
      </button>
      {err && <div className="mt-1 px-2 text-[10px] text-red-500">{err}</div>}
    </div>
  );
}

export function PeopleToFollow({ title = "People to follow", compactEmpty = false }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    discoverPeople().then(setRows).catch(() => setRows([]));
  }, []);
  if (rows && rows.length === 0 && compactEmpty) return null;
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {rows === null ? (
        <div className="flex gap-3 overflow-hidden">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-52 w-40 shrink-0 rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 p-5 text-center text-sm text-zinc-500">No public accounts to follow yet. Make yours public and be the first creator here.</div>
      ) : (
        <div className="ss-noscroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {rows.map((p) => <FollowCard key={p.id} p={p} />)}
        </div>
      )}
    </section>
  );
}

export function TrendingRow({ onPick }) {
  const { quoteOf } = useSocial();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    trendingSymbols().then(setRows).catch(() => setRows([]));
  }, []);
  if (rows && rows.length === 0) return null;
  return (
    <section>
      <SectionTitle>Most talked about this week</SectionTitle>
      {rows === null ? (
        <div className="flex gap-2 overflow-hidden">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-28 shrink-0 rounded-2xl" />)}</div>
      ) : (
        <div className="ss-noscroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {rows.map((t, i) => {
            const q = quoteOf?.(t.symbol)?.quote;
            return (
              <button key={t.symbol} onClick={() => onPick(t.symbol)} className="ss-tap flex shrink-0 items-center gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-900 py-2.5 pl-2.5 pr-4 text-left hover:border-blue-500">
                <TickerMono symbol={t.symbol} size={40} />
                <span>
                  <span className="block font-display text-[15px] font-bold leading-tight text-zinc-100">
                    {i < 3 && <Ic name="flame" size={13} className="mr-0.5 text-blue-500" />}
                    {t.symbol}
                  </span>
                  <span className="block text-[11px] text-zinc-500">
                    {t.posts} post{t.posts === 1 ? "" : "s"}
                    {q?.dp != null && <span className={`ml-1 ${q.dp >= 0 ? "text-emerald-500" : "text-red-500"}`}>{q.dp >= 0 ? "+" : "−"}{Math.abs(q.dp).toFixed(1)}%</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// A stock's wall: everything you can see about one ticker
export function TickerSheet({ symbol, onClose }) {
  const { onOpenStock } = useSocial();
  return (
    <Sheet open={!!symbol} onClose={onClose} variant="panel" title={symbol ? `${symbol} posts` : ""}>
      {symbol && (
        <div className="space-y-3 p-3">
          <button onClick={() => (onClose(), onOpenStock?.(symbol))} className={`${btn.soft} w-full`}>
            <Ic name="chart" size={16} /> Open {symbol} chart and signals
          </button>
          <FeedList mode="all" symbol={symbol} limit={10} empty={<EmptyState icon="chat" title={`No posts about ${symbol} yet`}>Be the first to make a call.</EmptyState>} />
        </div>
      )}
    </Sheet>
  );
}

export default function Discover({ me, setMe, network, refreshNetwork, renderInvite }) {
  const { uid, toast } = useSocial();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [suggested, setSuggested] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [connFilter, setConnFilter] = useState("");
  const [showAllConns, setShowAllConns] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    suggestedProfiles().then(setSuggested).catch(() => setSuggested([]));
  }, []);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setResults(null);
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchProfiles(q));
      } catch (e) {
        setErr(friendly(e));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function quick(fn, msg) {
    try {
      await fn();
      if (msg) toast?.(msg);
      refreshNetwork();
    } catch (e) {
      setErr(friendly(e));
    }
  }

  const incoming = network?.incoming || [];
  const outgoing = network?.outgoing || [];
  const connections = network?.connections || [];
  const blocked = network?.blocked || [];
  const filtered = connections.filter((c) => `${c.full_name} ${c.username}`.toLowerCase().includes(connFilter.trim().toLowerCase()));
  const shownConns = showAllConns || connFilter ? filtered : filtered.slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"><Ic name="search" size={18} /></span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people by name or @username" className={`${inputCls} min-h-12 rounded-full pl-11`} />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500">
            <Ic name="x" size={16} />
          </button>
        )}
      </div>
      {err && (
        <div className="flex items-center justify-between rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {err}
          <button onClick={() => setErr(null)}><Ic name="x" size={14} /></button>
        </div>
      )}

      {results ? (
        <section className="space-y-2">
          {searching && !results.length ? (
            <Skeleton className="h-16 w-full rounded-2xl" />
          ) : results.length ? (
            results.map((p) => <PersonRow key={p.id} p={p} />)
          ) : (
            <EmptyState icon="search" title={`No one found for “${query.trim()}”`}>People appear here if their account is public or they turned on search.</EmptyState>
          )}
        </section>
      ) : (
        <>
          {incoming.length > 0 && (
            <section>
              <SectionTitle right={<span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">{incoming.length}</span>}>Requests for you</SectionTitle>
              <div className="space-y-2">
                {incoming.map((p) => (
                  <PersonRow
                    key={p.id}
                    p={p}
                    sub={p.note}
                    right={
                      <span className="flex shrink-0 gap-1.5">
                        <button onClick={() => quick(() => acceptRequestFrom(p.id, uid), "You're connected")} className="min-h-9 rounded-full bg-blue-500 px-4 text-xs font-semibold text-white hover:bg-blue-600">Accept</button>
                        <button onClick={() => quick(() => removeConnectionWith(uid, p.id))} className="min-h-9 rounded-full border border-zinc-700 px-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800">Decline</button>
                      </span>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          <TrendingRow onPick={setTicker} />
          <PeopleToFollow />

          {renderInvite && <section>{renderInvite()}</section>}

          <section>
            <SectionTitle>People you may know</SectionTitle>
            {suggested === null ? (
              <Skeleton className="h-16 w-full rounded-2xl" />
            ) : suggested.length ? (
              <div className="space-y-2">{suggested.map((p) => <PersonRow key={p.id} p={p} />)}</div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-700 p-5 text-center text-sm text-zinc-500">
                Suggestions come from shared school, company and favorite sectors. Add those to your profile for better matches.
              </div>
            )}
            {!me?.searchable && !me?.account_public && (
              <div className="mt-2 text-xs text-zinc-500">
                You're hidden from search.{" "}
                <button onClick={() => quick(async () => setMe(await updateMyProfile(uid, { searchable: true })), "You can be found now")} className="font-semibold text-blue-500 hover:underline">
                  Let people find me
                </button>
              </div>
            )}
          </section>

          <section>
            <SectionTitle right={<span className="text-sm text-zinc-500">{connections.length}</span>}>Your connections</SectionTitle>
            {connections.length > 6 && (
              <input value={connFilter} onChange={(e) => setConnFilter(e.target.value)} placeholder="Filter connections" className={`${inputCls} mb-2`} />
            )}
            {connections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-700 p-5 text-center text-sm text-zinc-500">No connections yet. Invite a friend or send a request to someone you know.</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {shownConns.map((p) => <PersonRow key={p.id} p={p} right={<Ic name="chevronRight" size={16} className="text-zinc-600" />} />)}
              </div>
            )}
            {!showAllConns && !connFilter && filtered.length > 6 && (
              <button onClick={() => setShowAllConns(true)} className={`${btn.quiet} mt-2 w-full`}>Show all {filtered.length}</button>
            )}
          </section>

          {outgoing.length > 0 && (
            <section>
              <SectionTitle>Requests you sent</SectionTitle>
              <div className="space-y-2">
                {outgoing.map((p) => (
                  <PersonRow key={p.id} p={p} right={<button onClick={() => quick(() => removeConnectionWith(uid, p.id))} className="min-h-9 shrink-0 rounded-full border border-zinc-700 px-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800">Cancel</button>} />
                ))}
              </div>
            </section>
          )}

          {blocked.length > 0 && (
            <section>
              <SectionTitle>Blocked</SectionTitle>
              <div className="space-y-2">
                {blocked.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-400">
                      <Avatar url={p.avatar_url} name={p.full_name} size="xs" />
                      <span className="truncate">{p.full_name}</span>
                    </span>
                    <button onClick={() => quick(() => unblockUser(uid, p.id))} className="min-h-9 rounded-full border border-zinc-700 px-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800">Unblock</button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <TickerSheet symbol={ticker} onClose={() => setTicker(null)} />
    </div>
  );
}

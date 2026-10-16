import { Ic } from "../ui/icons.jsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import ProfileView from "./ProfileView.jsx";
import ProfileEditor from "./ProfileEditor.jsx";
import Feed from "./Feed.jsx";
import Groups from "./Groups.jsx";
import Compete from "./Compete.jsx";
import {
  loadMyProfile, updateMyProfile, searchProfiles, getProfile, suggestedProfiles, myNetwork,
  acceptRequestFrom, removeConnectionWith, unblockUser,
} from "./api.js";

const RELATION_LABEL = { connected: "✓ Connected", pending_out: "Request sent", pending_in: "Wants to connect" };

function PersonRow({ p, onOpen, right, sub }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <button onClick={() => onOpen(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar url={p.avatar_url} name={p.full_name} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-zinc-100">{p.full_name}</span>
          <span className="block truncate text-xs text-zinc-500">
            @{p.username}
            {p.headline ? ` · ${p.headline}` : ""}
          </span>
          {sub && <span className="mt-1 block text-xs italic text-zinc-400">“{sub}”</span>}
        </span>
      </button>
      {right ?? (
        <span className={`shrink-0 text-xs ${p.relation === "connected" ? "text-emerald-400" : "text-zinc-500"}`}>
          {RELATION_LABEL[p.relation] || ""}
        </span>
      )}
    </div>
  );
}

function Empty({ children }) {
  return <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">{children}</div>;
}

// Personal invite link (optionally carrying your market-data key so friends can use the app right away)
function InviteBox({ me, apiKey }) {
  const [withKey, setWithKey] = useState(true);
  const [copied, setCopied] = useState(false);
  if (!me?.invite_code) return null;
  const base = `${window.location.origin}${window.location.pathname}?invite=${me.invite_code}`;
  const link = withKey && apiKey ? `${base}#key=${apiKey}` : base;
  async function copy() {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: "Join me on Stock Signals", text: "Follow my portfolio and stock picks:", url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (_) {}
  }
  return (
    <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-3">
      <div className="text-sm font-semibold text-blue-200">Invite friends</div>
      <div className="mb-2 text-xs text-blue-300/70">Anyone who signs up with your link is connected with you automatically.</div>
      <div className="flex gap-2">
        <input readOnly value={link} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 truncate rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300" />
        <button onClick={copy} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
      {apiKey && (
        <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
          <input type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} /> Include my market-data key so prices work for them right away (only share with people you trust)
        </label>
      )}
    </div>
  );
}

export default function SocialPage({
  uid, email, counts, renderPortfolio, onNetwork, route, onProfile, apiKey,
  onOpenStock, ensureSymbols, quoteOf, getQuote, mySymbols, onAddToWatchlist,
}) {
  const [tab, setTab] = useState(route?.tab || "feed");
  const [groupRoute, setGroupRoute] = useState(null);
  const [me, setMe] = useState(undefined); // undefined = loading, null = no profile yet
  const [editing, setEditing] = useState(false);
  const [network, setNetwork] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [suggested, setSuggested] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [opened, setOpened] = useState(undefined); // undefined = loading, null = not visible
  const [connFilter, setConnFilter] = useState("");
  const [err, setErr] = useState(null);

  const onNetworkRef = useRef(onNetwork);
  onNetworkRef.current = onNetwork;
  const onProfileRef = useRef(onProfile);
  onProfileRef.current = onProfile;

  const refreshNetwork = useCallback(async () => {
    try {
      const n = await myNetwork();
      setNetwork(n);
      onNetworkRef.current?.(n);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    loadMyProfile(uid)
      .then((p) => {
        setMe(p);
        onProfileRef.current?.(p);
      })
      .catch((e) => {
        setErr(e.message);
        setMe(null);
      });
    refreshNetwork();
  }, [uid, refreshNetwork]);

  useEffect(() => {
    if (me) suggestedProfiles().then(setSuggested).catch(() => {});
  }, [me]);

  // navigation requests from outside (notifications, feed avatars, leaderboard…)
  useEffect(() => {
    if (!route) return;
    if (route.tab) setTab(["discover", "requests", "connections"].includes(route.tab) ? "friends" : route.tab);
    if (route.groupId) setGroupRoute(route.groupId);
    if (route.profileId && route.profileId !== uid) {
      setOpenId(route.profileId);
      setOpened(undefined);
      getProfile(route.profileId).then(setOpened).catch(() => setOpened(null));
    } else {
      setOpenId(null);
    }
    refreshNetwork();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.n]);

  // live search (debounced)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchProfiles(q));
      } catch (e) {
        setErr(e.message);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const loadOpened = useCallback(async (id) => {
    setOpened(undefined);
    try {
      setOpened(await getProfile(id));
    } catch (e) {
      setErr(e.message);
      setOpened(null);
    }
  }, []);

  function openProfile(id) {
    setOpenId(id);
    loadOpened(id);
    window.scrollTo({ top: 0 });
  }

  function afterChange() {
    refreshNetwork();
    if (openId) loadOpened(openId);
    if (query.trim().length >= 2) searchProfiles(query.trim()).then(setResults).catch(() => {});
  }

  async function quick(fn) {
    try {
      await fn();
      afterChange();
    } catch (e) {
      setErr(e.message);
    }
  }

  if (me === undefined) return <div className="py-10 text-center text-zinc-500">Loading…</div>;

  // first visit: create a profile before anything else
  if (me === null || editing) {
    return (
      <div className="mx-auto max-w-3xl">
        {me === null && (
          <div className="mb-4 rounded-xl border border-blue-900/60 bg-blue-950/30 p-4 text-sm text-blue-200">
            <div className="font-semibold">Welcome to Social </div>
            Create a profile to find friends, connect, and see each other's portfolios. You choose exactly what's shared — nothing is
            visible to anyone until you allow it.
          </div>
        )}
        <ProfileEditor
          uid={uid}
          email={email}
          profile={me}
          counts={counts}
          onSaved={(p) => {
            setMe(p);
            onProfile?.(p);
            if (me === null) setEditing(false);
          }}
          onCancel={me ? () => setEditing(false) : null}
        />
      </div>
    );
  }

  // someone's profile page
  if (openId) {
    return (
      <div className="mx-auto max-w-3xl">
        {opened === undefined ? (
          <div className="py-10 text-center text-zinc-500">Loading profile…</div>
        ) : opened === null ? (
          <div>
            <button onClick={() => setOpenId(null)} className="mb-3 text-sm text-zinc-400 hover:text-zinc-100">
              ← Back
            </button>
            <Empty>This profile isn't available.</Empty>
          </div>
        ) : (
          <ProfileView
            profile={opened}
            myId={uid}
            hasMyProfile={!!me}
            onChanged={afterChange}
            onBack={() => {
              setOpenId(null);
              setOpened(undefined);
            }}
          >
            {opened.relation === "connected" ? (
              <>
                <div className="mt-6">{renderPortfolio(opened.id, opened.full_name)}</div>
                <h3 className="mb-2 mt-6 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Recent activity</h3>
                <Feed uid={uid} user={opened.id} showComposer={false} limit={10} onOpenStock={onOpenStock} onOpenProfile={openProfile}
                  emptyText={`${opened.full_name.split(" ")[0]} hasn't posted anything yet.`} />
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center text-sm text-zinc-500">
                Connect with {opened.full_name.split(" ")[0]} to see their portfolio.
              </div>
            )}
          </ProfileView>
        )}
      </div>
    );
  }

  const incoming = network?.incoming || [];
  const outgoing = network?.outgoing || [];
  const connections = network?.connections || [];
  const blocked = network?.blocked || [];
  const filteredConns = connections.filter((c) =>
    `${c.full_name} ${c.username}`.toLowerCase().includes(connFilter.trim().toLowerCase())
  );

  const tabs = [
    { id: "feed", label: "Feed" },
    { id: "friends", label: "Friends", badge: incoming.length },
    { id: "groups", label: "Groups" },
    { id: "compete", label: "Compete" },
  ];
  const showFriends = tab === "friends";
  const shared = { uid, onOpenStock, onOpenProfile: openProfile, ensureSymbols, quoteOf, getQuote, mySymbols, onAddToWatchlist };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 grow whitespace-nowrap rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
              tab === t.id ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
            {t.badge > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{t.badge}</span>}
            {t.count > 0 && <span className="ml-1.5 text-[10px] text-zinc-500">{t.count}</span>}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 flex justify-between gap-2 rounded-md border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {err}
          <button onClick={() => setErr(null)} className="text-red-400">
            ✕
          </button>
        </div>
      )}

      {tab === "feed" && (
        <div className="space-y-3">
          {connections.length === 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
              Your feed fills up with what your connections buy, sell, post and ask.{" "}
              <button onClick={() => setTab("friends")} className="font-medium text-blue-400 hover:underline">
                Find people →
              </button>
            </div>
          )}
          <Feed uid={uid} onOpenStock={onOpenStock} onOpenProfile={openProfile} />
        </div>
      )}

      {tab === "groups" && <Groups key={groupRoute ? `g-${route?.n}` : "groups"} {...shared} openGroupId={groupRoute} onJoinChallenge={() => setTab("compete")} />}

      {tab === "compete" && <Compete {...shared} me={me} setMe={(p) => (setMe(p), onProfile?.(p))} />}

      {showFriends && incoming.length > 0 && <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Requests for you</h3>}
      {showFriends && incoming.length > 0 && (
        <div className="mb-5 space-y-2">
          {incoming.map((p) => (
            <PersonRow
              key={p.id}
              p={p}
              sub={p.note}
              onOpen={openProfile}
              right={
                <span className="flex shrink-0 gap-1.5">
                  <button onClick={() => quick(() => acceptRequestFrom(p.id, uid))} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500">
                    Accept
                  </button>
                  <button onClick={() => quick(() => removeConnectionWith(uid, p.id))} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                    Decline
                  </button>
                </span>
              }
            />
          ))}
        </div>
      )}
      {showFriends && (
        <div className="space-y-4">
          <InviteBox me={me} apiKey={apiKey} />
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-zinc-500"><Ic name="search" /></span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people by name or @username"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 pl-9 pr-3 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          </div>
          {!me.searchable && (
            <div className="text-xs text-zinc-500">
              You're hidden from search, so others can't find you.{" "}
              <button
                onClick={() => quick(async () => setMe(await updateMyProfile(uid, { searchable: true })))}
                className="font-medium text-blue-400 hover:underline"
              >
                Make me searchable
              </button>
            </div>
          )}
          {results ? (
            searching && !results.length ? (
              <div className="text-sm text-zinc-500">Searching…</div>
            ) : results.length ? (
              <div className="space-y-2">
                {results.map((p) => (
                  <PersonRow key={p.id} p={p} onOpen={openProfile} />
                ))}
              </div>
            ) : (
              <Empty>No one found for “{query.trim()}”. People only appear here if they've turned on search.</Empty>
            )
          ) : (
            <>
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">People you may know</h3>
              {suggested.length ? (
                <div className="space-y-2">
                  {suggested.map((p) => (
                    <PersonRow key={p.id} p={p} onOpen={openProfile} />
                  ))}
                </div>
              ) : (
                <Empty>
                  Suggestions are based on shared school, company and favorite sectors. Add those to your profile to get better
                  matches — or search above.
                </Empty>
              )}
            </>
          )}
        </div>
      )}

      {showFriends && outgoing.length > 0 && (
        <div className="mt-6 space-y-5">
          <div>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Sent</h3>
            {outgoing.length ? (
              <div className="space-y-2">
                {outgoing.map((p) => (
                  <PersonRow
                    key={p.id}
                    p={p}
                    onOpen={openProfile}
                    right={
                      <button
                        onClick={() => quick(() => removeConnectionWith(uid, p.id))}
                        className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    }
                  />
                ))}
              </div>
            ) : (
              <Empty>No pending requests sent.</Empty>
            )}
          </div>
        </div>
      )}

      {showFriends && <h3 className="mb-2 mt-6 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Your friends ({connections.length})</h3>}
      {showFriends && (
        <div className="space-y-3">
          {connections.length > 5 && (
            <input
              value={connFilter}
              onChange={(e) => setConnFilter(e.target.value)}
              placeholder="Filter connections"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          )}
          {filteredConns.length ? (
            filteredConns.map((p) => <PersonRow key={p.id} p={p} onOpen={openProfile} right={<span className="text-xs text-zinc-500">View →</span>} />)
          ) : (
            <Empty>
              {connections.length ? "No matches." : "No connections yet. Find people in Discover and send a request."}
            </Empty>
          )}
          {blocked.length > 0 && (
            <div className="pt-4">
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Blocked</h3>
              <div className="space-y-2">
                {blocked.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <span className="flex items-center gap-2 text-sm text-zinc-400">
                      <Avatar url={p.avatar_url} name={p.full_name} size="xs" />
                      {p.full_name} <span className="text-zinc-600">@{p.username}</span>
                    </span>
                    <button
                      onClick={() => quick(() => unblockUser(uid, p.id))}
                      className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "me" && <div className="mb-3"><InviteBox me={me} apiKey={apiKey} /></div>}
      {tab === "me" && (
        <ProfileView profile={{ ...me, relation: "self", member_since: me.created_at, ...(counts || {}) }} preview>
          <div className="mt-3 flex justify-end">
            <button onClick={() => setEditing(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
              Edit profile & privacy
            </button>
          </div>
        </ProfileView>
      )}
    </div>
  );
}

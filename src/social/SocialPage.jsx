import React, { useCallback, useEffect, useState } from "react";
import Avatar from "./Avatar.jsx";
import ProfileView from "./ProfileView.jsx";
import ProfileEditor from "./ProfileEditor.jsx";
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

export default function SocialPage({ uid, email, counts, renderPortfolio, onNetwork }) {
  const [tab, setTab] = useState("discover");
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

  const refreshNetwork = useCallback(async () => {
    try {
      const n = await myNetwork();
      setNetwork(n);
      onNetwork?.(n);
    } catch (e) {
      setErr(e.message);
    }
  }, [onNetwork]);

  useEffect(() => {
    loadMyProfile(uid)
      .then((p) => setMe(p))
      .catch((e) => {
        setErr(e.message);
        setMe(null);
      });
    refreshNetwork();
  }, [uid, refreshNetwork]);

  useEffect(() => {
    if (me) suggestedProfiles().then(setSuggested).catch(() => {});
  }, [me]);

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
            <div className="font-semibold">Welcome to Social 👋</div>
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
              <div className="mt-6">{renderPortfolio(opened.id, opened.full_name)}</div>
            ) : (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center text-sm text-zinc-500">
                🔒 Connect with {opened.full_name.split(" ")[0]} to see their portfolio.
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
    { id: "discover", label: "Discover" },
    { id: "requests", label: "Requests", badge: incoming.length },
    { id: "connections", label: "Connections", count: connections.length },
    { id: "me", label: "My profile" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded-md px-1.5 sm:px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
              tab === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
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

      {tab === "discover" && (
        <div className="space-y-4">
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-zinc-500">🔍</span>
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

      {tab === "requests" && (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Received</h3>
            {incoming.length ? (
              <div className="space-y-2">
                {incoming.map((p) => (
                  <PersonRow
                    key={p.id}
                    p={p}
                    sub={p.note}
                    onOpen={openProfile}
                    right={
                      <span className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => quick(() => acceptRequestFrom(p.id, uid))}
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => quick(() => removeConnectionWith(uid, p.id))}
                          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                        >
                          Decline
                        </button>
                      </span>
                    }
                  />
                ))}
              </div>
            ) : (
              <Empty>No new requests.</Empty>
            )}
          </div>
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

      {tab === "connections" && (
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

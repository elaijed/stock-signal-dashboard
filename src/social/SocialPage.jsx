// Social page: Feed (For you / Following / Friends), Discover, Groups, Compete, Me.
// Everything inside shares one SocialCtx (uid, me, quotes, navigation, toast) from ui.jsx.
import React, { useCallback, useEffect, useRef, useState } from "react";
import ProfileEditor from "./ProfileEditor.jsx";
import { FeedList, PostPage } from "./Feed.jsx";
import { CreatePostSheet, ComposerBar } from "./Composer.jsx";
import Discover, { PeopleToFollow } from "./Discover.jsx";
import CreatorProfile from "./Profile.jsx";
import Groups from "./Groups.jsx";
import Compete from "./Compete.jsx";
import { DailyPicksPost } from "./PostCard.jsx";
import { loadMyProfile, myNetwork } from "./api.js";
import { SocialCtx, SocialStyles, useToast, EmptyState } from "./ui.jsx";

const DISCOVER_TABS = ["discover", "requests", "connections", "friends"];
const FEED_MODES = [
  { id: "foryou", label: "For you" },
  { id: "following", label: "Following" },
  { id: "friends", label: "Friends" },
];

// remembered between visits so switching tabs doesn't flash "Loading…"
const cache = { uid: null, me: undefined, network: null };

function routeSection(t) {
  if (!t) return null;
  if (DISCOVER_TABS.includes(t)) return "discover";
  return t;
}

export default function SocialPage({
  uid, email, counts, renderPortfolio, renderInvite, onNetwork, route, onProfile,
  onOpenStock, ensureSymbols, quoteOf, getQuote, mySymbols, onAddToWatchlist, onAddMany, dailyPicks,
}) {
  const [tab, setTab] = useState(routeSection(route?.tab) || "feed");
  const [mode, setMode] = useState("foryou");
  const [groupRoute, setGroupRoute] = useState(null);
  const [groupCode, setGroupCode] = useState(null);
  const [postId, setPostId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [me, setMe] = useState(cache.uid === uid ? cache.me : undefined); // undefined = loading, null = no profile yet
  const [editing, setEditing] = useState(false);
  const [network, setNetwork] = useState(cache.uid === uid ? cache.network : null);
  const [composer, setComposer] = useState(null); // null | "post" | "poll"
  const [feedKey, setFeedKey] = useState(0);
  const [toastNode, toast] = useToast();

  const onNetworkRef = useRef(onNetwork);
  onNetworkRef.current = onNetwork;
  const onProfileRef = useRef(onProfile);
  onProfileRef.current = onProfile;

  const refreshNetwork = useCallback(async () => {
    try {
      const n = await myNetwork();
      cache.network = n;
      setNetwork(n);
      onNetworkRef.current?.(n);
    } catch (_) {
      /* the Discover section shows its own errors */
    }
  }, []);

  const updateMe = useCallback((p) => {
    cache.uid = uid;
    cache.me = p;
    setMe(p);
    onProfileRef.current?.(p);
  }, [uid]);

  useEffect(() => {
    loadMyProfile(uid)
      .then(updateMe)
      .catch(() => setMe((m) => (m === undefined ? null : m)));
    refreshNetwork();
  }, [uid, refreshNetwork, updateMe]);

  // navigation requests from outside (notifications, links, Home…)
  useEffect(() => {
    if (!route) return;
    const section = routeSection(route.tab);
    if (section === "post" && route.postId) {
      setPostId(route.postId);
      setOpenId(null);
    } else {
      setPostId(null);
      if (section) setTab(section);
    }
    if (route.groupId) setGroupRoute(route.groupId);
    if (route.groupCode) setGroupCode(route.groupCode);
    setOpenId(route.profileId && route.profileId !== uid ? route.profileId : null);
    if (route.profileId === uid) setTab("me");
    refreshNetwork();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.n]);

  const openProfile = useCallback(
    (id) => {
      if (!id) return;
      setPostId(null);
      if (id === uid) {
        setOpenId(null);
        setTab("me");
      } else setOpenId(id);
      window.scrollTo({ top: 0 });
    },
    [uid]
  );
  const openPost = useCallback((id) => {
    setPostId(id);
    window.scrollTo({ top: 0 });
  }, []);

  const ctx = {
    uid, me, quoteOf, getQuote, ensureSymbols, onOpenStock, onOpenProfile: openProfile, onOpenPost: openPost, toast,
    onEditPrivacy: () => setEditing(true), mySymbols, onAddToWatchlist, onAddMany,
  };
  const wrap = (node) => (
    <SocialCtx.Provider value={ctx}>
      <SocialStyles />
      {node}
      {toastNode}
    </SocialCtx.Provider>
  );

  if (me === undefined) return <div className="py-10 text-center text-zinc-500">Loading…</div>;

  // first visit: create a profile before anything else
  if (me === null || editing) {
    return wrap(
      <div className="mx-auto max-w-3xl">
        {me === null && (
          <div className="mb-4 rounded-xl border border-blue-900/60 bg-blue-950/30 p-4 text-sm text-blue-200">
            <div className="font-semibold">Welcome to Social</div>
            Create a profile to follow people, post your calls and see friends' portfolios. You choose exactly what's shared.
          </div>
        )}
        <ProfileEditor
          uid={uid}
          email={email}
          profile={me}
          counts={counts}
          onSaved={(p) => {
            updateMe(p);
            setEditing(false);
          }}
          onCancel={me ? () => setEditing(false) : null}
        />
      </div>
    );
  }

  if (postId) {
    return wrap(
      <PostPage id={postId} uid={uid} me={me} onBack={() => setPostId(null)} onOpenStock={onOpenStock} onOpenProfile={openProfile}
        quoteOf={quoteOf} getQuote={getQuote} ensureSymbols={ensureSymbols} />
    );
  }

  if (openId) {
    return wrap(
      <div className="mx-auto max-w-xl">
        <CreatorProfile key={openId} profileId={openId} me={me} onBack={() => setOpenId(null)} renderPortfolio={renderPortfolio}
          onNetworkChanged={refreshNetwork} />
      </div>
    );
  }

  const incoming = network?.incoming || [];
  const connections = network?.connections || [];
  const tabs = [
    { id: "feed", label: "Feed" },
    { id: "discover", label: "Discover", badge: incoming.length },
    { id: "groups", label: "Groups" },
    { id: "compete", label: "Compete" },
    { id: "me", label: "Me" },
  ];
  const shared = { uid, onOpenStock, onOpenProfile: openProfile, ensureSymbols, quoteOf, getQuote, mySymbols, onAddToWatchlist };
  const picks = (dailyPicks || []).slice(0, 5);

  return wrap(
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              if (t.id !== tab) window.scrollTo({ top: 0 });
              setTab(t.id);
            }}
            className={`ss-tap shrink-0 grow whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm ${
              tab === t.id ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
            {t.badge > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === "feed" && (
        <div className="space-y-4">
          <div className="flex gap-5 border-b border-zinc-800">
            {FEED_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`ss-tap -mb-px min-h-11 border-b-2 text-sm font-semibold ${
                  mode === m.id ? "border-blue-500 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <ComposerBar onOpen={() => setComposer("post")} onPoll={() => setComposer("poll")} />
          <CreatePostSheet
            open={!!composer}
            defaultMode={composer || "post"}
            onClose={() => setComposer(null)}
            onPosted={() => setFeedKey((k) => k + 1)}
          />
          <FeedList
            key={mode}
            mode={mode}
            reloadKey={feedKey}
            pinned={mode === "foryou" && picks.length ? <DailyPicksPost picks={picks} /> : null}
            empty={
              mode === "foryou" ? (
                <EmptyState icon="sparkles" title="Be the first to post">Share a call: what you're buying, watching or selling, and why.</EmptyState>
              ) : (
                <div className="space-y-4">
                  <EmptyState icon="users" title={mode === "following" ? "You're not following anyone yet" : "No posts from friends yet"}>
                    {mode === "following"
                      ? "Follow people to see their posts here."
                      : connections.length
                      ? "When your friends post, it shows up here."
                      : "Connect with friends to see what they buy, sell and post."}
                  </EmptyState>
                  <PeopleToFollow compactEmpty />
                </div>
              )
            }
          />
        </div>
      )}

      {tab === "discover" && <Discover me={me} setMe={updateMe} network={network} refreshNetwork={refreshNetwork} renderInvite={renderInvite} />}

      {tab === "groups" && (
        <Groups key={groupRoute || groupCode ? `g-${route?.n}` : "groups"} {...shared} openGroupId={groupRoute} inviteCode={groupCode} onJoinChallenge={() => setTab("compete")} />
      )}

      {tab === "compete" && <Compete {...shared} me={me} setMe={updateMe} dailyPicks={picks} />}

      {tab === "me" && (
        <CreatorProfile self me={me} onEdit={() => setEditing(true)} onMeChanged={updateMe} renderInvite={renderInvite}
          renderPortfolio={renderPortfolio} onNetworkChanged={refreshNetwork} />
      )}
    </div>
  );
}

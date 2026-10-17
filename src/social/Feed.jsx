// Feeds made of PostCards. Default export `Feed` is used by StockDetail (symbol), Home
// (small friends feed) and profile pages (user). `FeedList` is the paged list the Social
// page uses for For you / Following / Friends. `PostPage` opens one post with comments.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import PostCard, { normalize } from "./PostCard.jsx";
import { CreatePostSheet, ComposerBar } from "./Composer.jsx";
import { getFeed, getFeed2, getPost, loadMyProfile } from "./api.js";
import { SocialCtx, useSocial, useToast, useEnsure, useInView, isMissingFn, friendly, PostSkeleton, EmptyState, SocialStyles, btn } from "./ui.jsx";

export { timeAgoShort } from "./ui.jsx";

// get_feed2, falling back to the old get_feed while the new database isn't switched on
export async function fetchFeed({ mode = "friends", before = null, limit = 20, user = null, symbol = null }) {
  try {
    return (await getFeed2({ mode, before, limit, user, symbol })).map(normalize);
  } catch (e) {
    if (isMissingFn(e) && (mode === "friends" || mode === "all")) {
      return (await getFeed({ before, limit, user, symbol })).map(normalize);
    }
    throw e;
  }
}

export function FeedList({ mode = "friends", symbol = null, user = null, limit = 15, paging = true, reloadKey = 0, pinned = null, empty = null, onLoaded }) {
  const { ensureSymbols } = useSocial();
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const list = await fetchFeed({ mode, limit, symbol, user });
      setItems(list);
      setMore(list.length >= limit);
      onLoaded?.(list);
    } catch (e) {
      setErr(e);
      setItems([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, limit, symbol, user]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load, reloadKey]);

  async function loadMore() {
    if (loadingMore || !items?.length) return;
    setLoadingMore(true);
    try {
      const next = await fetchFeed({ mode, before: items[items.length - 1].id, limit, symbol, user });
      setItems((cur) => [...cur, ...next.filter((n) => !cur.some((c) => c.id === n.id))]);
      setMore(next.length >= limit);
    } catch (e) {
      setMore(false);
    } finally {
      setLoadingMore(false);
    }
  }
  const sentinel = useInView(loadMore, paging && more && !loadingMore);

  const symbols = useMemo(() => [...new Set((items || []).map((i) => i.symbol).filter(Boolean))].slice(0, 12), [items]);
  useEnsure(symbols, ensureSymbols);

  return (
    <div className="space-y-4">
      {pinned}
      {items === null ? (
        <>
          <PostSkeleton />
          <PostSkeleton />
        </>
      ) : err ? (
        <EmptyState icon={isMissingFn(err) ? "clock" : "warn"} title={isMissingFn(err) ? "Almost ready" : "Couldn't load posts"}
          action={<button onClick={load} className={btn.quiet}><Ic name="repost" size={16} /> Try again</button>}>
          {friendly(err)}
        </EmptyState>
      ) : items.length === 0 ? (
        empty || <EmptyState icon="chat" title="Nothing here yet">Posts will show up here.</EmptyState>
      ) : (
        <>
          {items.map((it) => (
            <PostCard key={it.id} it={it} onRemoved={(id) => setItems((cur) => cur.filter((x) => x.id !== id))} />
          ))}
          {paging && more && (
            <div ref={sentinel}>
              {loadingMore ? (
                <PostSkeleton />
              ) : (
                <button onClick={loadMore} className={`${btn.quiet} w-full`}>
                  Load more
                </button>
              )}
            </div>
          )}
          {paging && !more && items.length > 3 && <div className="py-4 text-center text-xs text-zinc-600">You're all caught up</div>}
        </>
      )}
    </div>
  );
}

// Provides the Social context when a feed is used outside the Social page
export function SocialProvider({ value, children }) {
  const outer = useSocial();
  const [toastNode, toast] = useToast();
  const [me, setMe] = useState(value.me);
  useEffect(() => {
    if (!value.me && !outer.me && value.uid) loadMyProfile(value.uid).then(setMe).catch(() => {});
  }, [value.uid, value.me, outer.me]);
  const merged = { ...outer, toast: outer.toast || toast, me: value.me || outer.me || me };
  for (const [k, v] of Object.entries(value)) if (v !== undefined) merged[k] = v;
  if (!merged.me) merged.me = me;
  return (
    <SocialCtx.Provider value={merged}>
      {!outer.uid && <SocialStyles />}
      {children}
      {!outer.toast && toastNode}
    </SocialCtx.Provider>
  );
}

// Backwards-compatible single item (old callers passed it, uid, onChanged, onOpenStock, onOpenProfile)
export function FeedItem({ it, uid, onChanged, onOpenStock, onOpenProfile }) {
  return (
    <SocialProvider value={{ uid, onOpenStock, onOpenProfile }}>
      <PostCard it={it} onRemoved={() => onChanged?.()} />
    </SocialProvider>
  );
}

// Composer bar + sheet
export function Composer({ onPosted, defaultSymbol = "", defaultMode = "post" }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <ComposerBar onOpen={() => setOpen("post")} onPoll={() => setOpen("poll")} />
      <CreatePostSheet open={!!open} defaultMode={open || defaultMode} defaultSymbol={defaultSymbol} onClose={() => setOpen(null)} onPosted={onPosted} />
    </>
  );
}

export default function Feed({
  uid, onOpenStock, onOpenProfile, onOpenPost, symbol = null, user = null, showComposer = true, limit = 15, emptyText,
  quoteOf, getQuote, ensureSymbols, me, mode,
}) {
  const [key, setKey] = useState(0);
  const m = mode || (symbol || user ? "all" : "friends");
  return (
    <SocialProvider value={{ uid, onOpenStock, onOpenProfile, onOpenPost, quoteOf, getQuote, ensureSymbols, me }}>
      <div className="space-y-4">
        {showComposer && <Composer onPosted={() => setKey((k) => k + 1)} defaultSymbol={symbol || ""} />}
        <FeedList
          mode={m}
          symbol={symbol}
          user={user}
          limit={limit}
          paging={limit > 5}
          reloadKey={key}
          empty={
            <EmptyState icon="chat" title={symbol ? `No posts about ${symbol} yet` : "Nothing here yet"}>
              {emptyText || "When your connections buy, sell, post or ask, it shows up here."}
            </EmptyState>
          }
        />
      </div>
    </SocialProvider>
  );
}

// One post, comments open (for ?post=<id> links)
export function PostPage({ id, uid, onBack, onOpenStock, onOpenProfile, quoteOf, getQuote, ensureSymbols, me }) {
  const [it, setIt] = useState(undefined);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setIt(undefined);
    getPost(id)
      .then((p) => setIt(p ? normalize(p) : null))
      .catch((e) => (setErr(e), setIt(null)));
  }, [id]);
  return (
    <SocialProvider value={{ uid, onOpenStock, onOpenProfile, quoteOf, getQuote, ensureSymbols, me }}>
      <PostPageInner it={it} err={err} onBack={onBack} />
    </SocialProvider>
  );
}
function PostPageInner({ it, err, onBack }) {
  const { ensureSymbols } = useSocial();
  useEnsure(it?.symbol ? [it.symbol] : [], ensureSymbols);
  return (
    <div className="mx-auto max-w-xl space-y-3">
      {onBack && (
        <button onClick={onBack} className="ss-tap -ml-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-medium text-zinc-400 hover:text-zinc-100">
          <Ic name="chevronLeft" size={18} /> Back
        </button>
      )}
      {it === undefined ? (
        <PostSkeleton />
      ) : it === null ? (
        <EmptyState icon="lock" title="This post isn't available">
          {err ? friendly(err) : "It may have been deleted, or it's only visible to the author's connections."}
        </EmptyState>
      ) : (
        <PostCard it={it} openComments onRemoved={onBack} />
      )}
    </div>
  );
}

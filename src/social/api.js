// Social data access. Everything about OTHER people goes through the database
// functions in supabase/001_social.sql, which filter each field by the owner's
// privacy settings — the browser never reads another user's rows directly.
import { supabase } from "../supabase.js";

function check({ data, error }) {
  if (error) throw new Error(error.message || "Something went wrong.");
  return data;
}

// own editable row (null until the user creates a profile)
export async function loadMyProfile(uid) {
  return check(await supabase.from("profiles").select("*").eq("id", uid).maybeSingle());
}

export async function saveMyProfile(uid, fields) {
  return check(await supabase.from("profiles").upsert({ ...fields, id: uid }).select().single());
}

export async function usernameAvailable(name) {
  return check(await supabase.rpc("username_available", { name }));
}

export const searchProfiles = async (q) => check(await supabase.rpc("search_profiles", { q })) || [];
export const getProfile = async (uid) => check(await supabase.rpc("get_profile", { uid }));
export const getSharedPortfolio = async (uid) => check(await supabase.rpc("get_shared_portfolio", { uid }));
export const suggestedProfiles = async () => check(await supabase.rpc("suggested_profiles")) || [];
export const myNetwork = async () =>
  check(await supabase.rpc("my_network")) || { connections: [], incoming: [], outgoing: [], blocked: [] };

export async function sendRequest(myId, otherId, note) {
  check(await supabase.from("connections").insert({ requester: myId, addressee: otherId, note: note?.trim() || null }));
}

export async function acceptRequestFrom(otherId, myId) {
  check(
    await supabase.from("connections").update({ status: "accepted" }).eq("requester", otherId).eq("addressee", myId)
  );
}

// decline / cancel / remove are all "delete the row between us"
export async function removeConnectionWith(myId, otherId) {
  check(
    await supabase
      .from("connections")
      .delete()
      .or(`and(requester.eq.${myId},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${myId})`)
  );
}

export async function blockUser(myId, otherId) {
  check(await supabase.from("blocks").insert({ blocker: myId, blocked: otherId }));
}

export async function unblockUser(myId, otherId) {
  check(await supabase.from("blocks").delete().eq("blocker", myId).eq("blocked", otherId));
}

export async function reportUser(myId, otherId, reason) {
  check(await supabase.from("reports").insert({ reporter: myId, reported: otherId, reason: reason.trim() }));
}

// Center-crop to a square, shrink to 400px JPEG, upload to avatars/<uid>/,
// return the public URL. Old pictures in the folder are removed afterwards.
export async function uploadAvatar(uid, file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP image.");
  if (file.size > 10 * 1024 * 1024) throw new Error("That image is over 10 MB.");
  const blob = await squareJpeg(file, 400);
  const path = `${uid}/avatar-${Date.now()}.jpg`;
  check(await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true }));
  const { data: list } = await supabase.storage.from("avatars").list(uid);
  const stale = (list || []).map((f) => `${uid}/${f.name}`).filter((p) => p !== path);
  if (stale.length) await supabase.storage.from("avatars").remove(stale);
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

export async function removeAvatar(uid) {
  const { data: list } = await supabase.storage.from("avatars").list(uid);
  const all = (list || []).map((f) => `${uid}/${f.name}`);
  if (all.length) await supabase.storage.from("avatars").remove(all);
}

function squareJpeg(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image."))), "image/jpeg", 0.88);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image."));
    };
    img.src = url;
  });
}

// partial update of your own existing profile (used for instant-save privacy switches)
export async function updateMyProfile(uid, patch) {
  return check(await supabase.from("profiles").update(patch).eq("id", uid).select().single());
}

// ---------- feed / activity ----------
export async function postActivity(uid, kind, symbol, data = {}, note = null) {
  return check(
    await supabase
      .from("activity")
      .insert({ user_id: uid, kind, symbol: symbol || null, data, note: note?.trim() ? note.trim().slice(0, 280) : null })
      .select("id")
      .single()
  );
}
export async function deleteActivity(id) {
  check(await supabase.from("activity").delete().eq("id", id));
}
export const getFeed = async ({ before = null, limit = 30, user = null, symbol = null } = {}) =>
  check(await supabase.rpc("get_feed", { before_id: before, lim: limit, only_user: user, only_symbol: symbol })) || [];

export async function toggleReaction(uid, activityId, emoji, on) {
  if (on) check(await supabase.from("activity_reactions").insert({ activity_id: activityId, user_id: uid, emoji }));
  else check(await supabase.from("activity_reactions").delete().eq("activity_id", activityId).eq("user_id", uid).eq("emoji", emoji));
}
export async function addComment(uid, activityId, body) {
  check(await supabase.from("activity_comments").insert({ activity_id: activityId, user_id: uid, body: body.trim().slice(0, 300) }));
}
export async function deleteComment(id) {
  check(await supabase.from("activity_comments").delete().eq("id", id));
}
export async function votePoll(uid, activityId, choice) {
  check(await supabase.from("poll_votes").upsert({ activity_id: activityId, user_id: uid, choice }));
}

// ---------- notifications ----------
export const myNotifications = async () => check(await supabase.rpc("my_notifications")) || [];
export async function markNotificationsRead(uid) {
  check(await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid).is("read_at", null));
}

// ---------- friends' stocks / competition ----------
export const networkSymbols = async () => check(await supabase.rpc("network_symbols")) || [];
export const leaderboard = async () => check(await supabase.rpc("leaderboard")) || [];
export const gameBoard = async () => check(await supabase.rpc("game_board")) || [];
export const challengeBoard = async (month) => check(await supabase.rpc("challenge_board", { m: month })) || [];
export async function enterChallenge(uid, month, symbols, startPrices) {
  check(await supabase.from("challenge_entries").upsert({ user_id: uid, month, symbols, start_prices: startPrices }));
}
export const getBadges = async (uid) => check(await supabase.rpc("badges", { uid }));

// ---------- invites ----------
export const acceptInvite = async (code) => check(await supabase.rpc("accept_invite", { code }));

// ---------- groups ----------
export const myGroups = async () => check(await supabase.rpc("my_groups")) || [];
export const groupDetail = async (gid) => check(await supabase.rpc("group_detail", { gid }));
export async function createGroup(uid, name, description, extra = {}) {
  return check(await supabase.from("groups").insert({ owner: uid, name: name.trim(), description: description?.trim() || null, ...extra }).select().single());
}
export async function deleteGroup(gid) {
  check(await supabase.from("groups").delete().eq("id", gid));
}
export async function addGroupMember(uid, gid, memberId) {
  check(await supabase.from("group_members").insert({ group_id: gid, user_id: memberId, added_by: uid }));
}
export async function removeGroupMember(gid, memberId) {
  check(await supabase.from("group_members").delete().eq("group_id", gid).eq("user_id", memberId));
}
export async function addGroupSymbol(uid, gid, symbol) {
  check(await supabase.from("group_symbols").insert({ group_id: gid, symbol: symbol.trim().toUpperCase(), added_by: uid }));
}
export async function removeGroupSymbol(gid, symbol) {
  check(await supabase.from("group_symbols").delete().eq("group_id", gid).eq("symbol", symbol));
}
export async function addGroupPost(uid, gid, body, symbol = null) {
  check(await supabase.from("group_posts").insert({ group_id: gid, user_id: uid, body: body.trim().slice(0, 2000), symbol: symbol || null }));
}
export async function deleteGroupPost(id) {
  check(await supabase.from("group_posts").delete().eq("id", id));
}

// ---------- groups v2 (supabase/006_groups_v2.sql) ----------
export const discoverGroups = async (q = "", cat = "") => check(await supabase.rpc("discover_groups", { q: q || null, cat: cat || null })) || [];
export const joinGroup = async (gid, note = null, code = null) => check(await supabase.rpc("join_group", { gid, note, code }));
export const groupByCode = async (code) => check(await supabase.rpc("group_by_code", { code }));
export const respondGroupRequest = async (gid, who, accept) => check(await supabase.rpc("respond_group_request", { gid, who, accept }));
export const setGroupRole = async (gid, who, role) => check(await supabase.rpc("set_group_role", { gid, who, new_role: role }));
export const updateGroup = async (gid, f) =>
  check(await supabase.rpc("update_group", { gid, p_name: f.name, p_description: f.description || "", p_privacy: f.privacy, p_category: f.category, p_rules: f.rules || "", p_posting: f.posting }));
export const resetGroupInvite = async (gid) => check(await supabase.rpc("reset_group_invite", { gid }));
export const pinGroupPost = async (pid, on) => check(await supabase.rpc("pin_group_post", { pid, on_off: on }));
export const setIdeaStatus = async (iid, status) => check(await supabase.rpc("set_idea_status", { iid, new_status: status }));
export async function cancelGroupRequest(uid, gid) {
  check(await supabase.from("group_requests").delete().eq("group_id", gid).eq("user_id", uid));
}
export async function addGroupIdea(uid, gid, idea) {
  check(await supabase.from("group_ideas").insert({ group_id: gid, user_id: uid, ...idea }));
}
export async function deleteGroupIdea(id) {
  check(await supabase.from("group_ideas").delete().eq("id", id));
}
export async function voteGroupIdea(uid, ideaId, vote) {
  if (!vote) check(await supabase.from("group_idea_votes").delete().eq("idea_id", ideaId).eq("user_id", uid));
  else check(await supabase.from("group_idea_votes").upsert({ idea_id: ideaId, user_id: uid, vote }));
}
export async function addGroupEvent(uid, gid, ev) {
  check(await supabase.from("group_events").insert({ group_id: gid, created_by: uid, ...ev }));
}
export async function deleteGroupEvent(id) {
  check(await supabase.from("group_events").delete().eq("id", id));
}
export async function rsvpGroupEvent(uid, eventId, going) {
  check(await supabase.from("group_event_rsvps").upsert({ event_id: eventId, user_id: uid, going }));
}

// ---------- practice portfolio, group challenge, sharing, streaks ----------
export const practiceLeaderboard = async () => check(await supabase.rpc("practice_leaderboard")) || [];
export const groupChallengeBoard = async (gid, m) => check(await supabase.rpc("group_challenge_board", { gid, m })) || [];
export async function shareStock(target, sym, note) {
  check(await supabase.rpc("share_stock", { target, sym, note: note || null }));
}
export async function addGroupPostWithSymbol(uid, gid, body, symbol) {
  check(await supabase.from("group_posts").insert({ group_id: gid, user_id: uid, body: body.trim().slice(0, 500), symbol: symbol || null }));
}
export async function markGroupRead(uid, gid) {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid).eq("group_id", gid).is("read_at", null);
}
// Subscribe to new / deleted messages in a group (Supabase Realtime). Returns an unsubscribe function.
export function subscribeGroup(gid, onChange) {
  const ch = supabase
    .channel(`group-${gid}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "group_posts", filter: `group_id=eq.${gid}` }, () => onChange())
    .on("postgres_changes", { event: "*", schema: "public", table: "group_ideas", filter: `group_id=eq.${gid}` }, () => onChange())
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// ---------- v3: public accounts, follows, posts, feeds (supabase/005_public_social_game.sql) ----------
// mode: "foryou" | "following" | "friends" | "all" (profile pages / a stock's wall / one post)
export const getFeed2 = async ({ mode = "friends", before = null, limit = 20, user = null, symbol = null } = {}) =>
  check(await supabase.rpc("get_feed2", { mode, before_id: before, lim: limit, only_user: user, only_symbol: symbol })) || [];
// one post by id (null if you can't see it)
export async function getPost(id) {
  const [it] = await getFeed2({ mode: "all", before: Number(id) + 1, limit: 1 });
  return it && it.id === Number(id) ? it : null;
}
// Create a post. stance: "bull" | "bear" | null; price = price when posted (so the post keeps score).
export async function createPost(uid, { caption, symbol = null, stance = null, price = null, imageUrl = null }) {
  return check(
    await supabase
      .from("activity")
      .insert({
        user_id: uid,
        kind: "post",
        symbol: symbol ? symbol.trim().toUpperCase() : null,
        note: caption?.trim() ? caption.trim().slice(0, 2200) : null,
        data: { stance, price, image_url: imageUrl },
      })
      .select("id")
      .single()
  );
}
export const postMilestone = (uid, title, detail = null, symbol = null) => postActivity(uid, "milestone", symbol, { title, detail });
export const toggleLike = (uid, activityId, on) => toggleReaction(uid, activityId, "❤️", on);
export async function toggleSave(uid, activityId, on) {
  if (on) check(await supabase.from("saved_posts").insert({ user_id: uid, activity_id: activityId }));
  else check(await supabase.from("saved_posts").delete().eq("user_id", uid).eq("activity_id", activityId));
}
export const savedFeed = async () => check(await supabase.rpc("saved_feed")) || [];
// Shrink to max 1600px JPEG, upload to post-images/<uid>/, return the public URL.
export async function uploadPostImage(uid, file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP image.");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is over 15 MB.");
  const blob = await shrinkJpeg(file, 1600);
  const path = `${uid}/post-${Date.now()}.jpg`;
  check(await supabase.storage.from("post-images").upload(path, blob, { contentType: "image/jpeg" }));
  return supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;
}
function shrinkJpeg(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image."))), "image/jpeg", 0.86);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image."));
    };
    img.src = url;
  });
}

export async function follow(myId, otherId) {
  check(await supabase.from("follows").insert({ follower: myId, followee: otherId }));
}
export async function unfollow(myId, otherId) {
  check(await supabase.from("follows").delete().eq("follower", myId).eq("followee", otherId));
}
export async function removeFollower(myId, otherId) {
  check(await supabase.from("follows").delete().eq("follower", otherId).eq("followee", myId));
}
// { account_public, followers, following, posts, i_follow, follows_me } or null
export const followInfo = async (uid) => check(await supabase.rpc("follow_info", { uid }));
export const followList = async (uid, which) => check(await supabase.rpc("follow_list", { uid, which })) || [];
export const discoverPeople = async () => check(await supabase.rpc("discover_people")) || [];
export const trendingSymbols = async () => check(await supabase.rpc("trending_symbols")) || [];
export const setAccountPublic = (uid, on) => updateMyProfile(uid, { account_public: !!on });

// ---------- v3: invites, rewards, shared key ----------
// { code, joined, qualified, founding, invited_by, xp, key_shared }
export const myInviteStats = async () => check(await supabase.rpc("my_invite_stats"));
export const inviteKeyFor = async (code) => check(await supabase.rpc("invite_key", { code }));
export async function shareMyKey(uid, apiKey) {
  check(await supabase.from("invite_keys").upsert({ user_id: uid, api_key: apiKey, updated_at: new Date().toISOString() }));
}
export async function unshareMyKey(uid) {
  check(await supabase.from("invite_keys").delete().eq("user_id", uid));
}
export const inviteLink = (code) => `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(code)}`;

// ---------- v3: Call of the Day ----------
export const myCalls = async () =>
  check(await supabase.from("daily_calls").select("*").order("day", { ascending: false }).limit(400)) || [];
export async function makeCall(uid, day, symbol, direction) {
  check(await supabase.from("daily_calls").insert({ user_id: uid, day, symbol, direction }));
}
export async function scoreCall(uid, day, result, refClose, close) {
  check(await supabase.from("daily_calls").update({ result, ref_close: refClose, close }).eq("user_id", uid).eq("day", day));
}
export const callCrowd = async (day) => check(await supabase.rpc("call_crowd", { d: day })) || { up: 0, down: 0 };

// ---------- v3: contact + account ----------
export async function sendContactMessage({ name, email, body }) {
  check(await supabase.from("contact_messages").insert({ name: name.trim(), email: email.trim(), body: body.trim() }));
}
export async function deleteMyAccount(uid) {
  await removeAvatar(uid).catch(() => {});
  const { data: list } = await supabase.storage.from("post-images").list(uid);
  const all = (list || []).map((f) => `${uid}/${f.name}`);
  if (all.length) await supabase.storage.from("post-images").remove(all);
  check(await supabase.rpc("delete_my_account"));
  await supabase.auth.signOut();
}

// ---------- learn, weekly card, copy watchlist, top callers (supabase/008_learn_watch_callers.sql) ----------
export async function myLessons(uid) {
  return check(await supabase.from("lesson_progress").select("lesson_id, score, completed_at").eq("user_id", uid)) || [];
}
export async function completeLesson(uid, lessonId, score) {
  check(await supabase.from("lesson_progress").upsert({ user_id: uid, lesson_id: lessonId, score: Math.round(score) }));
}
export const weeklyRecap = async () => check(await supabase.rpc("weekly_recap"));
export const watchlistOf = async (uid) => check(await supabase.rpc("watchlist_of", { uid }));
export async function subscribeWatchlist(myId, target, on) {
  if (on) check(await supabase.from("watch_subs").insert({ subscriber: myId, target }));
  else check(await supabase.from("watch_subs").delete().eq("subscriber", myId).eq("target", target));
}
export const topCallers = async () => check(await supabase.rpc("top_callers")) || [];

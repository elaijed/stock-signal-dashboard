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
export async function createGroup(uid, name, description) {
  return check(await supabase.from("groups").insert({ owner: uid, name: name.trim(), description: description?.trim() || null }).select().single());
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
export async function addGroupPost(uid, gid, body) {
  check(await supabase.from("group_posts").insert({ group_id: gid, user_id: uid, body: body.trim().slice(0, 500) }));
}
export async function deleteGroupPost(id) {
  check(await supabase.from("group_posts").delete().eq("id", id));
}

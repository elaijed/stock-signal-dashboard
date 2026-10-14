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

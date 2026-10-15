import React, { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import ProfileView from "./ProfileView.jsx";
import {
  AUDIENCES, EXPERIENCE, RISK, STYLES, SECTORS, BROKERS, BANNERS, LINKS, SHARE_OPTIONS, SHARE_DEFAULTS,
  USERNAME_RE, audienceOf,
} from "./constants.js";
import { saveMyProfile, updateMyProfile, usernameAvailable, uploadAvatar, removeAvatar } from "./api.js";

const TEXT_FIELDS = ["full_name", "username", "headline", "bio", "location", "pronouns", "job_title", "company", "industry",
  "school", "degree", "field_of_study", "goals"];
const ALL_FIELDS = [...TEXT_FIELDS, "avatar_url", "banner_color", "grad_year", "years_investing", "experience_level", "styles",
  "risk_tolerance", "sectors", "brokers", "links"];

// What a stranger / connection would see (mirrors get_profile() in the database).
export function previewAs(row, relation, counts) {
  const out = { id: row.id, relation, full_name: row.full_name, username: row.username };
  const sees = (f) => {
    const a = audienceOf(row, f);
    return a === "everyone" || (a === "connections" && relation === "connected");
  };
  for (const f of ALL_FIELDS) if (!["full_name", "username"].includes(f) && sees(f)) out[f] = row[f];
  if (sees("member_since")) out.member_since = row.created_at || new Date().toISOString();
  if (sees("counts") && counts) Object.assign(out, counts);
  return out;
}

const input =
  "w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500";

function AudienceSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Who can see this"
      className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 outline-none focus:border-blue-500"
    >
      {AUDIENCES.map((a) => (
        <option key={a.id} value={a.id}>
          {a.id === "everyone" ? "🌐 " : a.id === "connections" ? "👥 " : "🔒 "}
          {a.label}
        </option>
      ))}
    </select>
  );
}

function Field({ label, hint, audience, onAudience, children }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {label} {hint && <span className="normal-case tracking-normal text-zinc-600">{hint}</span>}
        </label>
        {onAudience && <AudienceSelect value={audience} onChange={onAudience} />}
      </div>
      {children}
    </div>
  );
}

function MultiPick({ options, value, onChange }) {
  const set = new Set(value || []);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = set.has(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? [...set].filter((x) => x !== o) : [...set, o])}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              on ? "border-blue-600 bg-blue-600/20 text-blue-200" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {on ? "✓ " : ""}
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-100">{title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function ProfileEditor({ uid, email, profile, counts, onSaved, onCancel }) {
  const isNew = !profile;
  const [row, setRow] = useState(() => ({
    full_name: "",
    username: (email || "").split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20),
    banner_color: "blue",
    styles: [],
    sectors: [],
    brokers: [],
    links: {},
    visibility: {},
    share: { ...SHARE_DEFAULTS },
    searchable: false,
    accept_requests: true,
    ...(profile || {}),
  }));
  const [nameState, setNameState] = useState(null); // null | "checking" | "ok" | "taken" | "invalid"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedMsg, setSavedMsg] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [preview, setPreview] = useState(null); // null | "none" | "connected"
  const fileRef = useRef(null);

  const set = (patch) => {
    setSavedMsg(false);
    setRow((r) => ({ ...r, ...patch }));
  };
  // Privacy switches on an existing profile save instantly (no Save button needed).
  const [privacyMsg, setPrivacyMsg] = useState(null);
  async function setPrivacy(patch) {
    set(patch);
    if (isNew) return;
    setPrivacyMsg("Saving…");
    try {
      const saved = await updateMyProfile(uid, patch);
      onSaved?.(saved);
      setPrivacyMsg("✓ Saved");
    } catch (err) {
      setPrivacyMsg(null);
      setError(err.message);
    }
  }
  const setAud = (field) => (a) => set({ visibility: { ...row.visibility, [field]: a } });
  const aud = (field) => audienceOf(row, field);
  const fieldProps = (field) => ({ audience: aud(field), onAudience: setAud(field) });
  const text = (field, props = {}) => (
    <input value={row[field] ?? ""} onChange={(e) => set({ [field]: e.target.value })} className={input} {...props} />
  );

  // username availability (debounced)
  useEffect(() => {
    const name = row.username || "";
    if (profile && name.toLowerCase() === (profile.username || "").toLowerCase()) return setNameState("ok");
    if (!USERNAME_RE.test(name)) return setNameState("invalid");
    setNameState("checking");
    const t = setTimeout(async () => {
      try {
        setNameState((await usernameAvailable(name)) ? "ok" : "taken");
      } catch (_) {
        setNameState(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [row.username, profile]);

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    try {
      set({ avatar_url: await uploadAvatar(uid, file) });
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onRemovePhoto() {
    setPhotoBusy(true);
    try {
      await removeAvatar(uid);
      set({ avatar_url: null });
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save(e) {
    e?.preventDefault();
    setError(null);
    if (!row.full_name?.trim()) return setError("Add your name.");
    if (nameState === "invalid") return setError("Usernames are 3–20 letters, numbers or underscores.");
    if (nameState === "taken") return setError("That username is taken.");
    const clean = {};
    for (const f of TEXT_FIELDS) clean[f] = row[f]?.trim() ? row[f].trim() : null;
    const num = (v, lo, hi) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
    };
    const links = {};
    for (const l of LINKS) if (row.links?.[l.id]?.trim()) links[l.id] = row.links[l.id].trim();
    setSaving(true);
    try {
      const saved = await saveMyProfile(uid, {
        ...clean,
        avatar_url: row.avatar_url || null,
        banner_color: row.banner_color || "blue",
        grad_year: num(row.grad_year, 1940, 2100),
        years_investing: num(row.years_investing, 0, 80),
        experience_level: row.experience_level || null,
        risk_tolerance: row.risk_tolerance || null,
        styles: row.styles || [],
        sectors: row.sectors || [],
        brokers: row.brokers || [],
        links,
        visibility: row.visibility || {},
        share: { ...SHARE_DEFAULTS, ...(row.share || {}) },
        searchable: !!row.searchable,
        accept_requests: !!row.accept_requests,
      });
      setRow((r) => ({ ...r, ...saved }));
      setSavedMsg(true);
      onSaved?.(saved);
    } catch (err) {
      setError(/duplicate|unique/i.test(err.message) ? "That username is taken." : err.message);
    } finally {
      setSaving(false);
    }
  }

  if (preview) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-900/60 bg-blue-950/30 px-3 py-2 text-sm text-blue-200">
          <span>
            Previewing your profile as {preview === "connected" ? "a connection" : "someone who isn't connected to you"}
            {!row.searchable && preview === "none" && " (they can't find you in search while it's off)"}
          </span>
          <span className="flex gap-2">
            <button
              onClick={() => setPreview(preview === "connected" ? "none" : "connected")}
              className="rounded-md border border-blue-800 px-2 py-1 text-xs hover:bg-blue-900/40"
            >
              View as {preview === "connected" ? "stranger" : "connection"}
            </button>
            <button onClick={() => setPreview(null)} className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500">
              Back to editing
            </button>
          </span>
        </div>
        <ProfileView profile={previewAs(row, preview, counts)} preview />
      </div>
    );
  }

  const shareVal = (id) => (row.share?.[id] ?? SHARE_DEFAULTS[id]) !== false;

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{isNew ? "Create your profile" : "Edit profile"}</h2>
          <p className="text-sm text-zinc-500">
            Only your name and username are required. Use the 🌐 / 👥 / 🔒 menus to choose who sees each detail.
          </p>
        </div>
        {!isNew && (
          <button
            type="button"
            onClick={() => setPreview("none")}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            👁 Preview
          </button>
        )}
      </div>

      {/* photo + banner */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar url={row.avatar_url} name={row.full_name || row.username} size="lg" />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => fileRef.current?.click()}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
              >
                {photoBusy ? "Uploading…" : row.avatar_url ? "Change photo" : "Add photo"}
              </button>
              {row.avatar_url && (
                <button type="button" disabled={photoBusy} onClick={onRemovePhoto} className="text-sm text-zinc-500 hover:text-red-300">
                  Remove
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} hidden />
            </div>
            <div className="text-[11px] text-zinc-600">JPG, PNG or WebP. Cropped to a square. Photos are visible to anyone with the link.</div>
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-xs text-zinc-500">Banner</span>
              {Object.entries(BANNERS).map(([id, cls]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set({ banner_color: id })}
                  className={`h-6 w-6 rounded-full bg-gradient-to-r ${cls} ${
                    row.banner_color === id ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900" : ""
                  }`}
                  title={id}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <Section title="About you">
        <Field label="Full name *" hint="(always visible)">
          {text("full_name", { maxLength: 60, placeholder: "Elai Smith" })}
        </Field>
        <Field label="Username *" hint="(always visible)">
          <div className="relative">
            <span className="absolute left-3 top-2 text-sm text-zinc-500">@</span>
            <input
              value={row.username ?? ""}
              onChange={(e) => set({ username: e.target.value.replace(/\s/g, "").slice(0, 20) })}
              className={`${input} pl-7`}
            />
          </div>
          <div
            className={`mt-1 text-[11px] ${
              nameState === "ok" ? "text-emerald-500" : nameState === "checking" ? "text-zinc-500" : "text-red-400"
            }`}
          >
            {nameState === "ok" && "✓ Available"}
            {nameState === "checking" && "Checking…"}
            {nameState === "taken" && "Taken — try another"}
            {nameState === "invalid" && "3–20 letters, numbers or underscores"}
          </div>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Headline" {...fieldProps("headline")}>
            {text("headline", { maxLength: 80, placeholder: "Long-term tech investor" })}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Bio" hint={`(${(row.bio || "").length}/300)`} {...fieldProps("bio")}>
            <textarea
              value={row.bio ?? ""}
              onChange={(e) => set({ bio: e.target.value.slice(0, 300) })}
              rows={3}
              className={`${input} resize-none`}
              placeholder="A few words about you and how you invest"
            />
          </Field>
        </div>
        <Field label="Location" {...fieldProps("location")}>
          {text("location", { maxLength: 60, placeholder: "Tel Aviv, Israel" })}
        </Field>
        <Field label="Pronouns" {...fieldProps("pronouns")}>
          {text("pronouns", { maxLength: 20, placeholder: "e.g. she/her" })}
        </Field>
      </Section>

      <Section title="Work">
        <Field label="Job title" {...fieldProps("job_title")}>
          {text("job_title", { maxLength: 60, placeholder: "Software engineer" })}
        </Field>
        <Field label="Company" {...fieldProps("company")}>
          {text("company", { maxLength: 60 })}
        </Field>
        <Field label="Industry" {...fieldProps("industry")}>
          {text("industry", { maxLength: 60, placeholder: "Tech, finance, healthcare…" })}
        </Field>
      </Section>

      <Section title="Education">
        <Field label="School or university" {...fieldProps("school")}>
          {text("school", { maxLength: 80 })}
        </Field>
        <Field label="Degree" {...fieldProps("degree")}>
          {text("degree", { maxLength: 60, placeholder: "B.Sc." })}
        </Field>
        <Field label="Field of study" {...fieldProps("field_of_study")}>
          {text("field_of_study", { maxLength: 60, placeholder: "Economics" })}
        </Field>
        <Field label="Graduation year" {...fieldProps("grad_year")}>
          {text("grad_year", { type: "number", min: 1940, max: 2100, placeholder: "2027" })}
        </Field>
      </Section>

      <Section title="Investing">
        <Field label="Experience level" {...fieldProps("experience_level")}>
          <select value={row.experience_level || ""} onChange={(e) => set({ experience_level: e.target.value })} className={input}>
            <option value="">—</option>
            {EXPERIENCE.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Years investing" {...fieldProps("years_investing")}>
          {text("years_investing", { type: "number", min: 0, max: 80 })}
        </Field>
        <Field label="Risk tolerance" {...fieldProps("risk_tolerance")}>
          <select value={row.risk_tolerance || ""} onChange={(e) => set({ risk_tolerance: e.target.value })} className={input}>
            <option value="">—</option>
            {RISK.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <div />
        <div className="sm:col-span-2">
          <Field label="Investing style" {...fieldProps("styles")}>
            <MultiPick options={STYLES} value={row.styles} onChange={(v) => set({ styles: v })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Favorite sectors" {...fieldProps("sectors")}>
            <MultiPick options={SECTORS} value={row.sectors} onChange={(v) => set({ sectors: v })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Goals" {...fieldProps("goals")}>
            {text("goals", { maxLength: 200, placeholder: "Retire by 50, build a dividend portfolio…" })}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Brokers / platforms" {...fieldProps("brokers")}>
            <MultiPick options={BROKERS} value={row.brokers} onChange={(v) => set({ brokers: v })} />
          </Field>
        </div>
      </Section>

      <Section title="Links">
        {LINKS.map((l) => (
          <Field key={l.id} label={l.label}>
            <input
              value={row.links?.[l.id] ?? ""}
              onChange={(e) => set({ links: { ...row.links, [l.id]: e.target.value } })}
              placeholder={l.placeholder}
              className={input}
            />
          </Field>
        ))}
        <div className="sm:col-span-2 -mt-2 flex justify-end">
          <AudienceSelect value={aud("links")} onChange={setAud("links")} />
        </div>
      </Section>

      {/* privacy */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="mb-1 flex items-center justify-between text-sm font-semibold text-zinc-100">
          Privacy
          {privacyMsg && <span className="text-xs font-normal text-emerald-400">{privacyMsg}</span>}
        </h3>
        <p className="mb-3 text-xs text-zinc-500">Your profile and portfolio are never visible to people you haven't approved, unless marked 🌐 Everyone.</p>
        <div className="space-y-3">
          <Toggle
            on={row.searchable}
            onChange={(v) => setPrivacy({ searchable: v })}
            label="Let people find me in search"
            hint="Off: only people you're already connected with can see your profile."
          />
          <Toggle
            on={row.accept_requests}
            onChange={(v) => setPrivacy({ accept_requests: v })}
            label="Allow connection requests"
            hint="Turn off to pause new requests."
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3">
            <span className="text-sm text-zinc-300">Member-since date</span>
            <AudienceSelect value={aud("member_since")} onChange={setAud("member_since")} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-zinc-300">Counts (connections, stocks owned, watching)</span>
            <AudienceSelect value={aud("counts")} onChange={setAud("counts")} />
          </div>
        </div>

        <h4 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wider text-zinc-500">What your connections can see</h4>
        <div className="space-y-2">
          {SHARE_OPTIONS.map((o) => (
            <Toggle
              key={o.id}
              on={shareVal(o.id)}
              onChange={(v) => setPrivacy({ share: { ...SHARE_DEFAULTS, ...row.share, [o.id]: v } })}
              label={o.label}
              hint={o.hint}
              disabled={["dollars", "unrealized", "sectors", "leaderboard"].includes(o.id) && !shareVal("holdings")}
            />
          ))}
        </div>
      </section>

      {error && <div className="rounded-md border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        {savedMsg && <span className="mr-auto text-sm text-emerald-400">✓ Saved</span>}
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving || photoBusy || nameState === "checking"}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {saving ? "Saving…" : isNew ? "Create profile" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Toggle({ on, onChange, label, hint, disabled }) {
  return (
    <label className={`flex items-start justify-between gap-3 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
      <span>
        <span className="block text-sm text-zinc-200">{label}</span>
        {hint && <span className="block text-[11px] text-zinc-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={!!on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-blue-600" : "bg-zinc-700"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

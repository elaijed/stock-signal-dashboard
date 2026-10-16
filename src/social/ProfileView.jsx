import { Ic } from "../ui/icons.jsx";
import React, { useEffect, useState } from "react";
import Avatar from "./Avatar.jsx";
import { BANNERS, EXPERIENCE, RISK, LINKS, safeUrl } from "./constants.js";
import { sendRequest, acceptRequestFrom, removeConnectionWith, blockUser, reportUser, getBadges } from "./api.js";

// Badges earned from real activity (computed by the database)
export function badgeList(b) {
  if (!b) return [];
  const out = [];
  if (b.streak >= 2) out.push(["flame", `${b.streak}-week streak`, "Active every week in a row"]);
  if (b.member_since && new Date(b.member_since) < new Date("2027-01-01")) out.push(["sprout", "Early member", "Joined in the first months"]);
  if (b.targets >= 5) out.push(["target", "Sharpshooter", `Hit ${b.targets} targets`]);
  else if (b.targets >= 1) out.push(["target", "On target", "Hit a price target"]);
  if (b.wins >= 3) out.push(["coins", "Profit taker", `${b.wins} winning trades`]);
  if (b.notes >= 10) out.push(["brain", "Thinker", `Wrote ${b.notes} trade notes`]);
  else if (b.notes >= 1) out.push(["pen", "Explainer", "Shared why they traded"]);
  if (b.connections >= 5) out.push(["handshake", "Connector", `${b.connections} connections`]);
  if (b.polls >= 3) out.push(["poll", "Pollster", `Ran ${b.polls} polls`]);
  if (b.challenges >= 1) out.push(["flag", "Challenger", `Entered ${b.challenges} monthly challenge${b.challenges === 1 ? "" : "s"}`]);
  if (b.trades >= 10) out.push(["up", "Active trader", `${b.trades} trades logged`]);
  return out;
}

function Badges({ uid }) {
  const [b, setB] = useState(null);
  useEffect(() => {
    if (uid) getBadges(uid).then(setB).catch(() => {});
  }, [uid]);
  const list = badgeList(b);
  if (!list.length) return null;
  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Badges</div>
      <div className="flex flex-wrap gap-1.5">
        {list.map(([icon, name, hint]) => (
          <span key={name} title={hint} className="rounded-full border border-amber-700/50 bg-amber-900/20 px-2.5 py-1 text-xs text-amber-200">
            <Ic name={icon} size={13} className="mr-1" />{name}
          </span>
        ))}
      </div>
    </div>
  );
}

const label = (list, id) => list.find((o) => o.id === id)?.label || id;

function Chip({ children }) {
  return <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">{children}</span>;
}

function Row({ icon, children }) {
  return (
    <div className="flex items-start gap-2 text-sm text-zinc-300">
      <span className="w-5 shrink-0 text-center text-zinc-500"><Ic name={icon} /></span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md bg-zinc-800/50 px-3 py-2 text-center">
      <div className="text-base font-semibold tabular-nums text-zinc-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}

// Connection buttons for someone else's profile.
function Actions({ p, myId, hasMyProfile, onChanged, onNeedProfile }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [mode, setMode] = useState(null); // "note" | "remove" | "block" | "report" | "menu"
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(null);

  async function run(fn, after) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setMode(null);
      if (after) setDone(after);
      onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-40";
  const primary = `${btn} bg-blue-600 text-white hover:bg-blue-500`;
  const quiet = `${btn} border border-zinc-700 text-zinc-300 hover:bg-zinc-800`;
  const danger = `${btn} bg-red-800/80 text-red-100 hover:bg-red-700`;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {p.relation === "none" && (
          <button
            className={primary}
            disabled={busy}
            onClick={() => (hasMyProfile ? setMode(mode === "note" ? null : "note") : onNeedProfile?.())}
          >
            Connect
          </button>
        )}
        {p.relation === "pending_out" && (
          <>
            <span className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-400">Request sent</span>
            <button className={quiet} disabled={busy} onClick={() => run(() => removeConnectionWith(myId, p.id))}>
              Cancel request
            </button>
          </>
        )}
        {p.relation === "pending_in" && (
          <>
            <button
              className={primary}
              disabled={busy}
              onClick={() => run(() => acceptRequestFrom(p.id, myId))}
            >
              Accept
            </button>
            <button className={quiet} disabled={busy} onClick={() => run(() => removeConnectionWith(myId, p.id))}>
              Decline
            </button>
          </>
        )}
        {p.relation === "connected" && (
          <>
            <span className="rounded-md bg-emerald-900/40 px-3 py-1.5 text-sm font-medium text-emerald-300">✓ Connected</span>
            <button className={quiet} disabled={busy} onClick={() => setMode(mode === "remove" ? null : "remove")}>
              Remove
            </button>
          </>
        )}
        <button className={`${quiet} px-2`} onClick={() => setMode(mode === "menu" ? null : "menu")} title="More">
          ⋯
        </button>
      </div>

      {mode === "menu" && (
        <div className="mt-2 flex gap-2">
          <button className={quiet} onClick={() => setMode("block")}>
            Block
          </button>
          <button className={quiet} onClick={() => setMode("report")}>
            Report
          </button>
        </div>
      )}
      {mode === "note" && (
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder="Add a short note (optional)"
            rows={2}
            className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button className={quiet} onClick={() => setMode(null)}>
              Cancel
            </button>
            <button className={primary} disabled={busy} onClick={() => run(() => sendRequest(myId, p.id, note))}>
              Send request
            </button>
          </div>
        </div>
      )}
      {mode === "remove" && (
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
          Remove {p.full_name} from your connections? You'll stop seeing each other's portfolios.
          <div className="mt-2 flex justify-end gap-2">
            <button className={quiet} onClick={() => setMode(null)}>
              Keep
            </button>
            <button className={danger} disabled={busy} onClick={() => run(() => removeConnectionWith(myId, p.id))}>
              Remove
            </button>
          </div>
        </div>
      )}
      {mode === "block" && (
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
          Block {p.full_name}? You'll be disconnected, and neither of you will find the other in search or be able to send
          requests. You can unblock later from Connections.
          <div className="mt-2 flex justify-end gap-2">
            <button className={quiet} onClick={() => setMode(null)}>
              Cancel
            </button>
            <button className={danger} disabled={busy} onClick={() => run(() => blockUser(myId, p.id), "blocked")}>
              Block
            </button>
          </div>
        </div>
      )}
      {mode === "report" && (
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder="What's wrong with this profile? (fake account, harassment, spam…)"
            rows={3}
            className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button className={quiet} onClick={() => setMode(null)}>
              Cancel
            </button>
            <button
              className={danger}
              disabled={busy || !reason.trim()}
              onClick={() => run(() => reportUser(myId, p.id, reason), "reported")}
            >
              Send report
            </button>
          </div>
        </div>
      )}
      {done === "reported" && <div className="mt-2 text-xs text-emerald-400">Thanks — your report was sent.</div>}
      {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
    </div>
  );
}

// Renders a profile as returned by get_profile() (already filtered by the
// database) or a locally-filtered preview of your own.
export default function ProfileView({ profile: p, myId, hasMyProfile, preview, onChanged, onNeedProfile, onBack, children }) {
  if (!p) return null;
  const banner = BANNERS[p.banner_color] || BANNERS.blue;
  const work = [p.job_title, p.company].filter(Boolean).join(" at ");
  const study = [p.degree, p.field_of_study].filter(Boolean).join(", ");
  const school = [study, p.school].filter(Boolean).join(" · ");
  const links = LINKS.map((l) => ({ ...l, href: safeUrl(p.links?.[l.id]) })).filter((l) => l.href);
  const since = p.member_since
    ? new Date(p.member_since).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;
  const hasCounts = p.connection_count != null;

  return (
    <div>
      {onBack && (
        <button onClick={onBack} className="mb-3 text-sm text-zinc-400 hover:text-zinc-100">
          ← Back
        </button>
      )}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <div className={`h-24 bg-gradient-to-r ${banner} sm:h-32`} />
        <div className="px-4 pb-5 sm:px-6">
          <div className="-mt-12 flex items-end justify-between gap-3">
            <Avatar url={p.avatar_url} name={p.full_name} size="lg" className="ring-4" />
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-bold text-zinc-50">
              {p.full_name}
              {p.pronouns && <span className="ml-2 text-sm font-normal text-zinc-500">({p.pronouns})</span>}
            </h2>
            <div className="text-sm text-zinc-500">@{p.username}</div>
            {p.headline && <div className="mt-1 text-sm text-zinc-200">{p.headline}</div>}
          </div>

          {!preview && p.relation !== "self" && (
            <Actions p={p} myId={myId} hasMyProfile={hasMyProfile} onChanged={onChanged} onNeedProfile={onNeedProfile} />
          )}

          {p.bio && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-zinc-300">{p.bio}</p>}

          <div className="mt-4 space-y-1.5">
            {work && <Row icon="briefcase">{work}{p.industry ? <span className="text-zinc-500"> · {p.industry}</span> : null}</Row>}
            {!work && p.industry && <Row icon="briefcase">{p.industry}</Row>}
            {school && (
              <Row icon="cap">
                {school}
                {p.grad_year ? <span className="text-zinc-500"> · {p.grad_year}</span> : null}
              </Row>
            )}
            {p.location && <Row icon="pin">{p.location}</Row>}
            {since && <Row icon="calendar">Member since {since}</Row>}
          </div>

          {!!(p.experience_level || (p.years_investing ?? "") !== "" || p.risk_tolerance || p.styles?.length || p.sectors?.length) && (
            <div className="mt-5">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Investing</div>
              <div className="flex flex-wrap gap-1.5">
                {p.experience_level && <Chip>{label(EXPERIENCE, p.experience_level)}</Chip>}
                {(p.years_investing ?? "") !== "" && (
                  <Chip>
                    {p.years_investing} year{p.years_investing === 1 ? "" : "s"} investing
                  </Chip>
                )}
                {p.risk_tolerance && <Chip>{label(RISK, p.risk_tolerance)} risk</Chip>}
                {(p.styles || []).map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
              </div>
              {p.sectors?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.sectors.map((s) => (
                    <span key={s} className="rounded-full border border-blue-800/60 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-300">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {p.goals && (
            <div className="mt-4">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Goals</div>
              <p className="text-sm text-zinc-300">{p.goals}</p>
            </div>
          )}

          {p.brokers?.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Uses</span>
              {p.brokers.map((b) => (
                <Chip key={b}>{b}</Chip>
              ))}
            </div>
          )}

          {links.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {links.map((l) => (
                <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-400 hover:underline">
                  {l.label} ↗
                </a>
              ))}
            </div>
          )}

          {!preview || p.relation === "self" ? <Badges uid={p.id} /> : null}

          {hasCounts && (
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Stat label="Connections" value={p.connection_count} />
              <Stat label="Stocks owned" value={p.owned_count} />
              <Stat label="Watching" value={p.watching_count} />
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// Weekly highlight: your week as a shareable card (best call, XP gained, streak, rank among friends).
// Shown on Home every Sunday and any day from Compete. "Share" turns it into a 1080x1350 image.
import React, { useEffect, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import { weeklyRecap } from "../social/api.js";
import { levelFor } from "./levels.js";

const fmtDay = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function weekRange(since) {
  const start = since ? new Date(since) : new Date();
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

function facts(r) {
  const best = r.best_call;
  return [
    { label: "XP this week", value: `+${r.xp_week ?? 0}`, icon: "zap" },
    { label: "Week streak", value: `${r.streak_weeks ?? 0}`, icon: "flame" },
    { label: "Rank among friends", value: r.of > 1 ? `#${r.rank} of ${r.of}` : "#1", icon: "trophy" },
    {
      label: "Best call",
      value: best ? `${best.symbol} ${best.direction === "up" ? "▲" : "▼"}` : r.calls ? `${r.wins}/${r.calls} right` : "—",
      sub: best?.move != null ? `${best.move >= 0 ? "+" : ""}${Number(best.move).toFixed(2)}%` : null,
      icon: "target",
    },
  ];
}

// ---------- image for sharing ----------
async function drawCard(r, name) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  try {
    await document.fonts?.ready;
  } catch (_) {}
  const display = '"Bricolage Grotesque", system-ui, sans-serif';
  const body = '"Instrument Sans", system-ui, sans-serif';

  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#ff6a3d");
  bg.addColorStop(0.55, "#e2451c");
  bg.addColorStop(1, "#8f2509");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,.08)";
  g.beginPath();
  g.arc(W - 80, 120, 260, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(140, H - 120, 220, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = "#fff";
  g.font = `700 44px ${display}`;
  g.fillText("signals.", 80, 120);
  g.font = `600 30px ${body}`;
  g.fillStyle = "rgba(255,255,255,.8)";
  g.fillText(weekRange(r.since), 80, 168);

  g.fillStyle = "#fff";
  g.font = `800 96px ${display}`;
  g.fillText(name ? `${name.split(" ")[0]}'s week` : "My week", 80, 320);

  const lvl = levelFor(r.xp_total || 0);
  g.font = `600 34px ${body}`;
  g.fillStyle = "rgba(255,255,255,.85)";
  g.fillText(`Level ${lvl.level} · ${lvl.name} · ${(r.xp_total || 0).toLocaleString("en-US")} XP`, 80, 380);

  const f = facts(r);
  const boxW = (W - 80 * 2 - 30) / 2, boxH = 300;
  f.forEach((x, i) => {
    const bx = 80 + (i % 2) * (boxW + 30);
    const by = 450 + Math.floor(i / 2) * (boxH + 30);
    g.fillStyle = "rgba(0,0,0,.22)";
    roundRect(g, bx, by, boxW, boxH, 36);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.75)";
    g.font = `600 30px ${body}`;
    g.fillText(x.label.toUpperCase(), bx + 36, by + 70);
    g.fillStyle = "#fff";
    g.font = `800 ${x.value.length > 8 ? 72 : 96}px ${display}`;
    g.fillText(x.value, bx + 36, by + 190);
    if (x.sub) {
      g.font = `700 40px ${body}`;
      g.fillStyle = "#d9ffe6";
      g.fillText(x.sub, bx + 36, by + 250);
    }
  });

  g.fillStyle = "rgba(255,255,255,.9)";
  g.font = `600 32px ${body}`;
  const extra = [r.lessons ? `${r.lessons} lesson${r.lessons === 1 ? "" : "s"} finished` : null, r.calls ? `${r.wins} of ${r.calls} calls right` : null].filter(Boolean).join("  ·  ");
  if (extra) g.fillText(extra, 80, 1150);
  g.font = `700 36px ${display}`;
  g.fillStyle = "#fff";
  g.fillText("Can you beat my week?  signals.", 80, 1250);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------- the card ----------
export default function WeeklyCard({ uid, name, compact = false, onToast }) {
  const [r, setR] = useState(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!uid) return;
    weeklyRecap().then(setR).catch(() => setR(null));
  }, [uid]);

  if (r === undefined) return <div className="h-48 animate-pulse rounded-3xl bg-zinc-800/50" />;
  if (r === null) return null;

  async function share() {
    setBusy(true);
    try {
      const blob = await drawCard(r, name);
      const file = new File([blob], "my-week-signals.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My week on signals.", text: "Can you beat my week?" });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "my-week-signals.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        onToast?.("Image saved. Post it anywhere!");
      }
    } catch (e) {
      if (e?.name !== "AbortError") onToast?.("Couldn't make the image. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const f = facts(r);
  return (
    <section className="relative overflow-hidden rounded-3xl p-5 text-white sm:p-6" style={{ background: "linear-gradient(135deg, #ff6a3d 0%, #e2451c 55%, #8f2509 100%)" }}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10" />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-xs font-semibold">
            <Ic name="calendar" size={13} /> {new Date().getDay() === 0 ? "Your week" : "Your week so far"} · {weekRange(r.since)}
          </span>
        </div>
        <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
          {r.xp_week > 0 ? (r.rank === 1 && r.of > 1 ? "Top of your friends this week." : `+${r.xp_week} XP this week.`) : "A quiet week. Let's change that."}
        </h2>
        <div className={`mt-4 grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
          {f.map((x) => (
            <div key={x.label} className="rounded-2xl bg-black/20 p-3">
              <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-white/75">
                <Ic name={x.icon} size={12} /> {x.label}
              </div>
              <div className="mt-1 font-display text-2xl font-bold leading-tight">{x.value}</div>
              {x.sub && <div className="text-sm font-semibold text-emerald-100">{x.sub}</div>}
            </div>
          ))}
        </div>
        {r.top?.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/85">
            {r.top.map((p, i) => (
              <span key={p.id}>
                {i + 1}. {p.me ? "You" : p.full_name?.split(" ")[0]} <b>+{p.xp}</b>
              </span>
            ))}
          </div>
        )}
        <button onClick={share} disabled={busy} className="ss-tap mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#c73a14] shadow-lg transition hover:scale-[1.02] active:scale-[.98] disabled:opacity-60">
          <Ic name="share" size={16} /> {busy ? "Making your card…" : "Share my week"}
        </button>
      </div>
    </section>
  );
}

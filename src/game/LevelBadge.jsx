import React from "react";
import { levelFor } from "./levels.js";

// Small pill next to a name: "Lv 3 · Analyst". compact = just "Lv 3".
export default function LevelBadge({ xp, compact = false, className = "" }) {
  if (xp == null) return null;
  const l = levelFor(xp);
  return (
    <span
      title={`${l.name} · ${xp} XP`}
      className={`inline-flex items-center rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-blue-500 ${className}`}
    >
      Lv {l.level}
      {!compact && <span className="ml-1 font-medium opacity-80">{l.name}</span>}
    </span>
  );
}

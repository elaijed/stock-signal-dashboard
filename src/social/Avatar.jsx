import React from "react";

const SIZES = { xs: "h-7 w-7 text-[10px]", sm: "h-10 w-10 text-sm", md: "h-14 w-14 text-lg", lg: "h-24 w-24 text-3xl" };
const TONES = ["bg-blue-700", "bg-emerald-700", "bg-violet-700", "bg-amber-700", "bg-rose-700", "bg-teal-700"];

export default function Avatar({ url, name, size = "sm", className = "" }) {
  const initials =
    (name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "?";
  const tone = TONES[[...(name || "")].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];
  return url ? (
    <img src={url} alt="" className={`${SIZES[size]} shrink-0 rounded-full object-cover ring-2 ring-zinc-900 ${className}`} />
  ) : (
    <div
      className={`${SIZES[size]} ${tone} flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-zinc-900 ${className}`}
    >
      {initials}
    </div>
  );
}

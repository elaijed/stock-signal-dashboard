import React from "react";
import { Ic } from "../ui/icons.jsx";

// Small building blocks shared by the logged-out pages.

export function Logo({ onClick, size = "md" }) {
  const img = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const txt = size === "sm" ? "text-lg" : "text-xl";
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-2" aria-label="signals. home">
      <img src="./icon.svg" alt="" className={`${img} rounded-lg`} />
      <span className={`font-display ${txt} font-extrabold tracking-tight text-zinc-50`}>
        signals<span className="text-blue-500">.</span>
      </span>
    </button>
  );
}

const BTN = {
  primary: "bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700",
  dark: "bg-zinc-100 text-zinc-950 hover:bg-zinc-200",
  ghost: "text-zinc-200 hover:bg-zinc-800/70",
  outline: "border border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-500",
};
const SIZE = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 px-6 text-base",
};

export function Button({ variant = "primary", size = "md", className = "", children, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-150 disabled:opacity-50 ${BTN[variant]} ${SIZE[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Eyebrow({ icon, children, className = "" }) {
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-semibold text-zinc-300 ${className}`}>
      {icon && <Ic name={icon} size={13} className="text-blue-500" />}
      {children}
    </div>
  );
}

export function SectionHead({ eyebrow, icon, title, sub, center = false }) {
  return (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <Eyebrow icon={icon}>{eyebrow}</Eyebrow>}
      <h2 className="mt-4 text-3xl font-bold leading-[1.1] text-zinc-50 sm:text-[2.6rem]">{title}</h2>
      {sub && <p className="mt-4 text-base leading-relaxed text-zinc-400 sm:text-lg">{sub}</p>}
    </div>
  );
}

export function ExampleTag({ children = "Example" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
      {children}
    </span>
  );
}

// Initials avatar with a stable warm tint per name
const TINTS = ["bg-blue-500", "bg-emerald-600", "bg-amber-500", "bg-zinc-600", "bg-red-500"];
export function Initials({ name, size = 40 }) {
  const ini = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const tint = TINTS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TINTS.length];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${tint}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {ini}
    </span>
  );
}

export const inputCls =
  "h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 text-[15px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15";

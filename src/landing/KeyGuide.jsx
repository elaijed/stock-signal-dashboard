import React, { useState } from "react";
import { Ic } from "../ui/icons.jsx";
import { Button, Logo, inputCls } from "./shared.jsx";

// Full-screen step shown right after sign up to people without a market data key.
export default function KeyGuide({ onSave, onSkip }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState(null);

  const save = (e) => {
    e.preventDefault();
    const k = key.trim();
    if (!k) return setError("Paste your key first.");
    if (/\s/.test(k) || k.length < 16 || k.length > 100) return setError("That doesn't look like a Finnhub key. It's a long code of letters and numbers, usually about 20 characters.");
    setError(null);
    onSave?.(k);
  };

  const steps = [
    {
      title: "Sign up free at Finnhub",
      text: (
        <>
          Open{" "}
          <a href="https://finnhub.io/register" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-500 hover:underline">
            finnhub.io <Ic name="arrowRight" size={13} />
          </a>{" "}
          in a new tab and create a free account. No card needed.
        </>
      ),
    },
    { title: "Copy your API key", text: "After you sign in, your key is shown right at the top of the Finnhub dashboard. Copy it." },
    { title: "Paste it here", text: "Come back to this tab and paste it below. It stays on this device." },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950 font-sans text-zinc-200">
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10 pt-6 sm:pt-10">
        <Logo />
        <div className="mt-10 sm:mt-14">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-950 text-blue-500">
            <Ic name="key" size={26} />
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] text-zinc-50">Get your free key in 1&nbsp;minute</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
            signals. uses Finnhub for live prices and company news. A personal key is free and keeps everything fast.
          </p>
        </div>

        <ol className="mt-8 space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 font-display text-sm font-bold text-white">{i + 1}</span>
              <div className="min-w-0">
                <div className="font-semibold text-zinc-100">{s.title}</div>
                <div className="mt-0.5 text-sm leading-relaxed text-zinc-400">{s.text}</div>
              </div>
            </li>
          ))}
        </ol>

        <form onSubmit={save} className="mt-6" noValidate>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="ssd-key">
            Your Finnhub API key
          </label>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <input
              id="ssd-key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError(null);
              }}
              placeholder="Paste your key"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className={`${inputCls} font-mono`}
            />
            <Button type="submit" className="h-11 shrink-0">
              Save key
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 flex gap-1.5 text-sm text-red-400">
              <Ic name="warn" className="mt-0.5" /> {error}
            </p>
          )}
        </form>

        <div className="mt-8 border-t border-zinc-800 pt-6 text-center">
          <button type="button" onClick={onSkip} className="text-sm font-semibold text-zinc-300 hover:text-zinc-50">
            Skip for now
          </button>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
            Charts and practice mode still work without a key. You can add it later in Settings.
          </p>
        </div>
      </div>
    </div>
  );
}

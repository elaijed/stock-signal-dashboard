// Learn: a Duolingo-style path of short lessons with quizzes.
// Progress is saved to the account (lesson_progress); each finished lesson is worth 20 XP.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ic } from "../ui/icons.jsx";
import { Burst, GameStyles, store } from "../game/fx.jsx";
import { UNITS, ALL_LESSONS, LESSON_XP, questionCount } from "./course.js";
import { myLessons, completeLesson } from "../social/api.js";

const hsl = (h, s = 62, l = 48) => `hsl(${h} ${s}% ${l}%)`;
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const todayKey = () => new Date().toISOString().slice(0, 10);

// ---------- progress ----------
function useProgress(uid) {
  const cacheKey = `sg.learn.${uid}`;
  const [done, setDone] = useState(() => store.get(cacheKey, {}));
  useEffect(() => {
    if (!uid) return;
    myLessons(uid)
      .then((rows) => {
        const m = Object.fromEntries(rows.map((r) => [r.lesson_id, { score: r.score, at: r.completed_at }]));
        setDone((cur) => {
          const merged = { ...cur, ...m };
          store.set(cacheKey, merged);
          return merged;
        });
      })
      .catch(() => {});
  }, [uid, cacheKey]);
  const save = async (lessonId, score) => {
    const prev = done[lessonId];
    const next = { ...done, [lessonId]: { score: Math.max(score, prev?.score || 0), at: new Date().toISOString() } };
    setDone(next);
    store.set(cacheKey, next);
    const days = store.get(`sg.learn.days.${uid}`, []);
    if (!days.includes(todayKey())) store.set(`sg.learn.days.${uid}`, [...days, todayKey()].slice(-60));
    try {
      await completeLesson(uid, lessonId, Math.max(score, prev?.score || 0));
      return !prev; // XP only the first time
    } catch (_) {
      return false;
    }
  };
  return [done, save];
}

function learnStreak(uid) {
  const days = new Set(store.get(`sg.learn.days.${uid}`, []));
  let n = 0;
  const d = new Date();
  if (!days.has(todayKey())) d.setDate(d.getDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// ---------- the path ----------
function Node({ lesson, state, index, onOpen }) {
  // zig-zag like a trail
  const offsets = [0, 48, 72, 48, 0, -48, -72, -48];
  const x = offsets[index % offsets.length];
  const done = state === "done";
  const locked = state === "locked";
  return (
    <div className="flex flex-col items-center" style={{ transform: `translateX(${x}px)` }}>
      <button
        disabled={locked}
        onClick={onOpen}
        aria-label={lesson.title}
        className={`ss-tap relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition active:translate-y-1 disabled:cursor-not-allowed ${
          locked ? "bg-zinc-800 text-zinc-600" : "text-white"
        }`}
        style={locked ? { boxShadow: "0 6px 0 rgba(0,0,0,.25)" } : { background: hsl(lesson.color), boxShadow: `0 6px 0 ${hsl(lesson.color, 62, 34)}` }}
      >
        {state === "current" && <span className="absolute -inset-2 animate-pulse rounded-full border-4" style={{ borderColor: hsl(lesson.color, 70, 60) }} />}
        <Ic name={done ? "check" : locked ? "lock" : "star"} size={30} fill={!done && !locked ? "currentColor" : undefined} />
      </button>
      <div className={`mt-2.5 max-w-[11rem] text-center text-sm font-semibold leading-tight ${locked ? "text-zinc-600" : "text-zinc-200"}`}>{lesson.title}</div>
      <div className="text-[11px] text-zinc-500">
        {done ? "Done · tap to redo" : `${lesson.minutes} min · ${questionCount(lesson)} questions`}
      </div>
    </div>
  );
}

export default function Learn({ uid, onXp, onGlossary, onToast }) {
  const [done, save] = useProgress(uid);
  const [playing, setPlaying] = useState(null); // lesson | {review: true}
  const doneCount = ALL_LESSONS.filter((l) => done[l.id]).length;
  const nextLesson = ALL_LESSONS.find((l) => !done[l.id]);
  const streak = learnStreak(uid);
  const todayCount = Object.values(done).filter((d) => d.at?.slice(0, 10) === todayKey()).length;

  const reviewPool = useMemo(
    () => ALL_LESSONS.filter((l) => done[l.id]).flatMap((l) => l.steps.filter((s) => s.t !== "learn").map((s) => ({ ...s, color: l.color }))),
    [done]
  );

  if (playing)
    return (
      <LessonPlayer
        lesson={playing}
        onExit={() => setPlaying(null)}
        onFinish={async (score) => {
          if (playing.review) return;
          const first = await save(playing.id, score);
          if (first) onXp?.();
        }}
      />
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <GameStyles />
      {/* header */}
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold text-zinc-50">Learn</h1>
            <p className="text-sm text-zinc-400">Short lessons that actually teach you investing. 5 minutes a day.</p>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1.5 text-sm font-bold text-blue-500">
              <Ic name="flame" size={16} fill="currentColor" /> {streak} day{streak === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-sm font-bold text-amber-500">
              <Ic name="zap" size={16} fill="currentColor" /> {doneCount * LESSON_XP} XP
            </span>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>
              {doneCount} of {ALL_LESSONS.length} lessons
            </span>
            <span>{todayCount ? `${todayCount} today` : "Daily goal: 1 lesson"}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${(doneCount / ALL_LESSONS.length) * 100}%` }} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {nextLesson ? (
            <button onClick={() => setPlaying(nextLesson)} className="ss-tap inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 text-base font-bold text-white shadow-[0_4px_0_#15803d] active:translate-y-1 active:shadow-none">
              <Ic name="play" size={18} fill="currentColor" /> {doneCount ? "Continue" : "Start"}: {nextLesson.title}
            </button>
          ) : (
            <div className="flex-1 rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-500">You finished every lesson. Legend.</div>
          )}
          {reviewPool.length >= 5 && (
            <button
              onClick={() => setPlaying({ id: "review", review: true, title: "Practice", color: 200, steps: shuffle(reviewPool).slice(0, 8) })}
              className="ss-tap inline-flex min-h-12 items-center gap-2 rounded-2xl border border-zinc-700 px-5 text-sm font-bold text-zinc-200 hover:bg-zinc-800"
            >
              <Ic name="repost" size={16} /> Practice
            </button>
          )}
        </div>
      </section>

      {/* units */}
      {UNITS.map((u, ui) => {
        const unitDone = u.lessons.filter((l) => done[l.id]).length;
        return (
          <section key={u.id}>
            <div className="mb-6 flex items-center gap-3 rounded-2xl p-4 text-white" style={{ background: hsl(u.color, 58, 42) }}>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Ic name={u.icon} size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wider text-white/75">Unit {ui + 1}</div>
                <div className="font-display text-lg font-bold leading-tight">{u.title}</div>
                <div className="text-sm text-white/80">{u.blurb}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-display text-lg font-bold">
                  {unitDone}/{u.lessons.length}
                </div>
                {unitDone === u.lessons.length && <Ic name="crown" size={18} fill="currentColor" className="ml-auto text-amber-300" />}
              </div>
            </div>
            <div className="flex flex-col items-center gap-8 pb-4">
              {u.lessons.map((l, li) => {
                const lesson = { ...l, color: u.color };
                const state = done[l.id] ? "done" : nextLesson?.id === l.id ? "current" : "locked";
                return <Node key={l.id} lesson={lesson} index={li + ui * 4} state={state} onOpen={() => setPlaying(lesson)} />;
              })}
            </div>
          </section>
        );
      })}

      <section className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div>
          <div className="font-semibold text-zinc-100">Glossary</div>
          <div className="text-sm text-zinc-500">Every term in the app explained in plain English.</div>
        </div>
        <button onClick={onGlossary} className="ss-tap rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800">Open</button>
      </section>
      <p className="pb-4 text-center text-xs text-zinc-600">Educational only, not financial advice.</p>
    </div>
  );
}

// ---------- the lesson player ----------
function LessonPlayer({ lesson, onExit, onFinish }) {
  const [queue, setQueue] = useState(() => lesson.steps.map((s, i) => ({ ...s, key: i, opts: s.t === "mc" ? shuffle(s.options.map((o, j) => ({ o, j }))) : null })));
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState(null);
  const [result, setResult] = useState(null); // null | "right" | "wrong"
  const [mistakes, setMistakes] = useState(0);
  const [firstTry, setFirstTry] = useState(0);
  const [finished, setFinished] = useState(false);
  const [combo, setCombo] = useState(0);
  const seen = useRef(new Set());
  const total = lesson.steps.length;
  const questions = lesson.steps.filter((s) => s.t !== "learn").length;
  const step = queue[pos];
  const progress = finished ? 1 : Math.min(1, pos / queue.length);
  const color = lesson.color ?? 200;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pos]);

  function check() {
    if (picked == null) return;
    const right = step.t === "mc" ? picked === step.answer : picked === step.answer;
    setResult(right ? "right" : "wrong");
    const firstTime = !seen.current.has(step.key);
    seen.current.add(step.key);
    if (right) {
      setCombo((c) => c + 1);
      if (firstTime) setFirstTry((n) => n + 1);
    } else {
      setCombo(0);
      setMistakes((m) => m + 1);
      // Duolingo-style: missed questions come back at the end
      setQueue((q) => [...q, { ...step, opts: step.opts ? shuffle(step.opts) : null }]);
    }
  }

  function next() {
    setPicked(null);
    setResult(null);
    if (pos + 1 >= queue.length) {
      setFinished(true);
      const score = questions ? Math.round((firstTry / questions) * 100) : 100;
      onFinish(score);
    } else setPos((p) => p + 1);
  }

  if (finished) {
    const score = questions ? Math.round((firstTry / questions) * 100) : 100;
    const perfect = mistakes === 0;
    return (
      <div className="relative mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <GameStyles />
        <Burst count={36} />
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg" style={{ background: hsl(color) }}>
          <Ic name={perfect ? "crown" : "trophy"} size={44} fill="currentColor" />
        </div>
        <h2 className="font-display text-3xl font-bold text-zinc-50">{lesson.review ? "Practice done!" : perfect ? "Perfect lesson!" : "Lesson complete!"}</h2>
        <p className="mt-1 text-zinc-400">{lesson.title}</p>
        <div className="mt-6 grid w-full max-w-sm grid-cols-3 gap-2">
          <div className="rounded-2xl border-2 border-amber-500 p-3">
            <div className="text-[11px] font-bold uppercase text-amber-500">XP</div>
            <div className="font-display text-2xl font-bold text-zinc-100">{lesson.review ? 0 : `+${LESSON_XP}`}</div>
          </div>
          <div className="rounded-2xl border-2 border-emerald-500 p-3">
            <div className="text-[11px] font-bold uppercase text-emerald-500">Accuracy</div>
            <div className="font-display text-2xl font-bold text-zinc-100">{score}%</div>
          </div>
          <div className="rounded-2xl border-2 border-blue-500 p-3">
            <div className="text-[11px] font-bold uppercase text-blue-500">Cards</div>
            <div className="font-display text-2xl font-bold text-zinc-100">{total}</div>
          </div>
        </div>
        {!lesson.review && <p className="mt-3 text-xs text-zinc-500">XP is added the first time you finish a lesson.</p>}
        <button onClick={onExit} className="ss-tap mt-8 min-h-12 w-full max-w-sm rounded-2xl bg-emerald-500 text-base font-bold text-white shadow-[0_4px_0_#15803d] active:translate-y-1 active:shadow-none">
          Continue
        </button>
      </div>
    );
  }

  const isQ = step.t !== "learn";
  const canCheck = isQ && picked != null && !result;

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-xl flex-col">
      <GameStyles />
      {/* top bar */}
      <div className="mb-6 flex items-center gap-3">
        <button onClick={onExit} aria-label="Quit lesson" className="ss-tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
          <Ic name="x" size={22} />
        </button>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(4, progress * 100)}%`, background: hsl(145, 60, 45) }} />
        </div>
        {combo >= 3 && (
          <span className="sg-rise inline-flex shrink-0 items-center gap-1 text-sm font-bold text-amber-500">
            <Ic name="flame" size={16} fill="currentColor" /> {combo}
          </span>
        )}
      </div>

      {/* card */}
      <div key={`${pos}-${step.key}`} className="sg-rise flex-1">
        {step.t === "learn" ? (
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: hsl(color, 62, 55) }}>New idea</div>
            <h2 className="font-display text-2xl font-bold leading-tight text-zinc-50 sm:text-3xl">{step.title}</h2>
            <p className="mt-4 text-lg leading-relaxed text-zinc-300">{step.body}</p>
            {step.example && (
              <div className="mt-5 rounded-2xl border-2 border-dashed p-4" style={{ borderColor: hsl(color, 50, 45) }}>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: hsl(color, 62, 55) }}>
                  <Ic name="bulb" size={14} /> Example
                </div>
                <p className="text-base leading-relaxed text-zinc-200">{step.example}</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">{step.t === "tf" ? "True or false?" : "Choose the answer"}</div>
            <h2 className="font-display text-xl font-bold leading-snug text-zinc-50 sm:text-2xl">{step.q}</h2>
            <div className="mt-5 grid gap-2.5">
              {(step.t === "tf" ? [{ o: "True", j: true }, { o: "False", j: false }] : step.opts).map(({ o, j }) => {
                const sel = picked === j;
                const showRight = result && j === step.answer;
                const showWrong = result === "wrong" && sel;
                return (
                  <button
                    key={String(j)}
                    disabled={!!result}
                    onClick={() => setPicked(j)}
                    className={`ss-tap min-h-14 rounded-2xl border-2 px-4 py-3 text-left text-[16px] font-semibold transition ${
                      showRight
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                        : showWrong
                        ? "border-red-500 bg-red-500/15 text-red-400"
                        : sel
                        ? "border-blue-500 bg-blue-500/10 text-zinc-50"
                        : "border-zinc-700 text-zinc-200 hover:bg-zinc-800/60"
                    }`}
                    style={{ boxShadow: result ? "none" : "0 3px 0 rgba(0,0,0,.25)" }}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* bottom bar */}
      <div
        className={`sticky bottom-16 -mx-4 mt-6 border-t-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:bottom-0 ${
          result === "right" ? "border-emerald-500/40 bg-emerald-950/80" : result === "wrong" ? "border-red-500/40 bg-red-950/80" : "border-zinc-800 bg-zinc-950"
        }`}
      >
        {result && (
          <div className="sg-rise mb-3 flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${result === "right" ? "bg-emerald-500" : "bg-red-500"} text-white`}>
              <Ic name={result === "right" ? "check" : "x"} size={22} />
            </div>
            <div>
              <div className={`font-display text-lg font-bold ${result === "right" ? "text-emerald-400" : "text-red-400"}`}>
                {result === "right" ? ["Nice!", "Correct!", "You got it!", "Great job!"][step.key % 4] : "Not quite"}
              </div>
              <p className={`text-sm leading-relaxed ${result === "right" ? "text-emerald-200/90" : "text-red-200/90"}`}>
                {result === "wrong" && step.t === "mc" && <b>Answer: {step.options[step.answer]}. </b>}
                {result === "wrong" && step.t === "tf" && <b>Answer: {step.answer ? "True" : "False"}. </b>}
                {step.why}
              </p>
              {result === "wrong" && <p className="mt-1 text-xs text-red-300/70">This one will come back at the end.</p>}
            </div>
          </div>
        )}
        {step.t === "learn" ? (
          <button onClick={next} className="ss-tap min-h-12 w-full rounded-2xl text-base font-bold text-white active:translate-y-1" style={{ background: hsl(color), boxShadow: `0 4px 0 ${hsl(color, 62, 34)}` }}>
            Got it
          </button>
        ) : result ? (
          <button onClick={next} className={`ss-tap min-h-12 w-full rounded-2xl text-base font-bold text-white active:translate-y-1 ${result === "right" ? "bg-emerald-500 shadow-[0_4px_0_#15803d]" : "bg-red-500 shadow-[0_4px_0_#991b1b]"}`}>
            Continue
          </button>
        ) : (
          <button onClick={check} disabled={!canCheck} className="ss-tap min-h-12 w-full rounded-2xl bg-emerald-500 text-base font-bold text-white shadow-[0_4px_0_#15803d] transition active:translate-y-1 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none">
            Check
          </button>
        )}
      </div>
    </div>
  );
}

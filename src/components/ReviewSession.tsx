"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { Card, RecordLogItem, ReviewLog } from "ts-fsrs";
import { applySlowness, expectedThinkMs, slowness } from "@/lib/effort";
import { formatInterval, GRADES, makeScheduler, Rating, rowToStudyCard, State, type Grade } from "@/lib/fsrs";
import { afterRating, cramRequeue, LEARN_AHEAD_MS, nextLearningDue, pickNext, sessionCounts, type SessionState } from "@/lib/queue";
import type { StudyCard, StudyMode } from "@/lib/types";
import { CardEditorModal, type EditorResult } from "./CardEditor";
import { CardImage, ImageZoom } from "./CardImage";
import { ArrowLeft, Pencil, Undo } from "./icons";
import { Markdown } from "./Markdown";
import { Button, Counts, ErrorNote, IconButton } from "./ui";

export interface ReviewPersistence {
  record: (cardId: string, next: Card, log: ReviewLog, durationMs: number, thinkMs: number | null) => Promise<string>;
  undo: (logId: string, cardId: string, previous: Card) => Promise<void>;
}

interface Props {
  title: string;
  mode: StudyMode;
  initial: SessionState;
  dayEnd: Date;
  retention: number;
  /** Longest gap between two reviews, in days. */
  maxInterval: number;
  /** Your usual recall time (for the slow-answer signal). */
  thinkBaselineMs: number;
  /** e.g. "Business Law I · Unit 03 · A. S.A. vs S.L." */
  describe: (card: StudyCard) => string;
  /** null = nothing is saved (cram, dev preview). */
  persist: ReviewPersistence | null;
  loadImages: (paths: string[]) => Promise<Map<string, string>>;
  /** Allow editing cards (E). */
  editable?: boolean;
  onExit: () => void;
}

interface HistoryEntry {
  before: SessionState;
  card: StudyCard;
  /** Whether this rating counted towards "reviewed". */
  counted: boolean;
  logId: string | null;
  saving: Promise<void>;
  save: () => Promise<void>;
  retry: () => void;
}

type Outcomes = Record<Grade, RecordLogItem>;

const MAX_DURATION_MS = 60_000;
/** Taps on the rating buttons right after "Show answer" are ignored (they sit where that button was). */
const DOUBLE_TAP_GUARD_MS = 350;

const gradeColor: Record<number, string> = {
  [Rating.Again]: "text-down",
  [Rating.Hard]: "text-flare",
  [Rating.Good]: "text-up",
  [Rating.Easy]: "text-ion",
};
const cramLabel: Record<number, string> = { [Rating.Again]: "soon", [Rating.Hard]: "later", [Rating.Good]: "done", [Rating.Easy]: "done" };

export function ReviewSession(props: Props) {
  const { title, mode, initial, dayEnd, retention, maxInterval, thinkBaselineMs, describe, persist, loadImages, editable, onExit } = props;
  const cram = mode === "cram";
  const scheduler = useMemo(() => makeScheduler(retention, maxInterval), [retention, maxInterval]);
  const [session, setSession] = useState(initial);
  const [current, setCurrent] = useState<StudyCard | null>(() => pickNext(initial, new Date()));
  const [revealed, setRevealed] = useState(false);
  const [outcomes, setOutcomes] = useState<{ at: Date; record: Outcomes; thinkMs: number } | null>(null);
  const [images, setImages] = useState<Map<string, string>>(() => new Map());
  const [zoom, setZoom] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const shownAt = useRef(0);
  const revealedAt = useRef(0);
  const interrupted = useRef(false);
  const history = useRef<HistoryEntry[]>([]);
  const failed = useRef<HistoryEntry[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const answerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const requested = useRef(new Set<string>());

  // Saves run one after another, in the order they happened.
  const enqueue = useCallback((op: () => Promise<void>) => (chain.current = chain.current.then(op, op)), []);

  const show = useCallback((card: StudyCard | null) => {
    setCurrent(card);
    setRevealed(false);
    setOutcomes(null);
    shownAt.current = Date.now();
    interrupted.current = document.visibilityState === "hidden";
    scrollRef.current?.scrollTo({ top: 0 });
  }, []);

  // Recall time only counts while you're actually looking at the app.
  useEffect(() => {
    shownAt.current = Date.now();
    const away = () => {
      interrupted.current = true;
    };
    const onVisibility = () => document.visibilityState === "hidden" && away();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", away);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", away);
    };
  }, []);

  // Load (and pre-load) pictures for this card and the next few. Each picture is requested once.
  useEffect(() => {
    const upcoming = [current, ...session.main.slice(0, 4), ...session.learning.slice(0, 2)].filter((c): c is StudyCard => !!c);
    const paths = upcoming.flatMap((c) => [c.frontImage, c.backImage]).filter((p): p is string => !!p && !requested.current.has(p));
    if (!paths.length) return;
    for (const p of paths) requested.current.add(p);
    loadImages(paths).then(
      (found) => {
        for (const url of found.values()) new Image().src = url;
        setImages((prev) => new Map([...prev, ...found]));
      },
      (e: Error) => {
        for (const p of paths) requested.current.delete(p);
        setImageError(e.message);
      },
    );
  }, [current, session, loadImages]);

  // Waiting for a learning card: tick until it's close enough to show.
  const waitingUntil = !current && !cram ? nextLearningDue(session) : null;
  useEffect(() => {
    if (!waitingUntil) return;
    const id = setInterval(() => {
      setClock(Date.now());
      if (waitingUntil.getTime() - Date.now() <= LEARN_AHEAD_MS) show(pickNext(session, new Date()));
    }, 15_000);
    return () => clearInterval(id);
  }, [waitingUntil, session, show]);

  const reveal = useCallback(() => {
    if (!current || revealed) return;
    const at = new Date();
    revealedAt.current = at.getTime();
    setRevealed(true);
    if (!cram) {
      const thinkMs = at.getTime() - shownAt.current;
      const s = slowness(thinkMs, expectedThinkMs(thinkBaselineMs, current.front, !!current.frontImage), interrupted.current);
      const record = applySlowness(scheduler.repeat(current.sched, at), current.sched.state, s, at);
      setOutcomes({ at, record, thinkMs: interrupted.current ? -1 : thinkMs });
    }
    requestAnimationFrame(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }, [current, revealed, cram, scheduler, thinkBaselineMs]);

  const rate = useCallback(
    (grade: Grade) => {
      if (!current || !revealed) return;
      if (Date.now() - revealedAt.current < DOUBLE_TAP_GUARD_MS) return;

      if (cram) {
        const next = cramRequeue(session, current, grade);
        history.current.push({ before: session, card: current, counted: grade >= Rating.Good, logId: null, saving: Promise.resolve(), save: async () => {}, retry: () => {} });
        setCanUndo(true);
        setSession(next);
        if (grade >= Rating.Good) setReviewed((n) => n + 1);
        show(pickNext(next, new Date()));
        return;
      }

      if (!outcomes) return;
      const item = outcomes.record[grade];
      const rated: StudyCard = { ...current, sched: item.card };
      const next = afterRating(session, rated, dayEnd);
      const duration = Math.min(Date.now() - shownAt.current, MAX_DURATION_MS);
      const thinkMs = outcomes.thinkMs >= 0 ? Math.min(outcomes.thinkMs, 600_000) : null;

      const entry: HistoryEntry = {
        before: session,
        card: current,
        counted: true,
        logId: null,
        saving: Promise.resolve(),
        save: async () => {
          if (!persist) return;
          try {
            entry.logId = await persist.record(current.id, item.card, item.log, duration, thinkMs);
          } catch (e) {
            if (!failed.current.includes(entry)) failed.current.push(entry);
            setSaveError((e as Error).message);
          }
        },
        retry: () => {
          entry.saving = enqueue(entry.save);
        },
      };
      entry.saving = enqueue(entry.save);
      history.current.push(entry);
      if (history.current.length > 50) history.current.shift();

      setCanUndo(true);
      setSession(next);
      setReviewed((n) => n + 1);
      show(pickNext(next, new Date()));
    },
    [current, revealed, cram, outcomes, session, dayEnd, persist, enqueue, show],
  );

  const undo = useCallback(() => {
    const entry = history.current.pop();
    if (!entry) return;
    failed.current = failed.current.filter((f) => f !== entry);
    setCanUndo(history.current.length > 0);
    setSession(entry.before);
    if (entry.counted) setReviewed((n) => Math.max(0, n - 1));
    show(entry.card);
    if (persist && !cram) {
      enqueue(async () => {
        await entry.saving;
        if (!entry.logId) return;
        try {
          await persist.undo(entry.logId, entry.card.id, entry.card.sched);
        } catch (e) {
          setSaveError(`Undo wasn't saved: ${(e as Error).message}`);
        }
      });
    }
  }, [cram, persist, enqueue, show]);

  const retrySaves = useCallback(() => {
    setSaveError(null);
    const pending = failed.current;
    failed.current = [];
    for (const entry of pending) entry.retry();
  }, []);

  // After editing: new text/pictures everywhere in the session, schedule untouched.
  const finishEdit = useCallback(
    (result: EditorResult | null) => {
      const id = editing;
      setEditing(null);
      if (!id || !result) return;
      const replace = (list: StudyCard[]) =>
        result.deleted ? list.filter((c) => c.id !== id) : list.map((c) => (c.id === id && result.saved ? { ...rowToStudyCard(result.saved), sched: c.sched } : c));
      const next = { learning: replace(session.learning), main: replace(session.main) };
      history.current = history.current.filter((h) => h.card.id !== id);
      setCanUndo(history.current.length > 0);
      setSession(next);
      if (result.deleted) show(pickNext(next, new Date()));
      else if (current?.id === id && result.saved) {
        setCurrent({ ...rowToStudyCard(result.saved), sched: current.sched });
        for (const p of [result.saved.front_image, result.saved.back_image]) if (p) requested.current.delete(p);
      }
    },
    [editing, session, current, show],
  );

  // Keyboard: Space/Enter = show answer (then Good, like Anki), 1–4 = rate, Z = undo, E = edit.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (e.altKey || e.metaKey || zoom || editing) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!revealed) reveal();
      else rate(Rating.Good);
    } else if (revealed && !e.ctrlKey && ["1", "2", "3", "4"].includes(e.key)) {
      rate(Number(e.key) as Grade);
    } else if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    } else if (e.key.toLowerCase() === "e" && !e.ctrlKey && editable && current) {
      e.preventDefault();
      setEditing(current.id);
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const counts = sessionCounts(session);
  const remaining = cram ? session.main.length : counts.fresh + counts.learning + counts.review;
  const progress = reviewed + remaining ? reviewed / (reviewed + remaining) : 1;
  const kind = cram ? "cram" : current?.sched.state === State.New ? "new" : current && current.sched.state !== State.Review ? "learning" : "review";
  const kindColor = kind === "new" || kind === "cram" ? "text-ion" : kind === "learning" ? "text-flare" : "text-up";

  return (
    <div className="flex h-dvh flex-col">
      <header className="pt-safe shrink-0 border-b border-seam">
        <div className="flex h-14 items-center gap-1 px-2 sm:px-4">
          <IconButton label="Back to overview" onClick={onExit}>
            <ArrowLeft />
          </IconButton>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-[14px] text-frost">{title}</p>
          </div>
          {cram ? (
            <span className="px-2 font-mono text-[12px] text-ion">{remaining} left</span>
          ) : (
            <Counts fresh={counts.fresh} learning={counts.learning} due={counts.review} className="px-2" />
          )}
          {editable && (
            <IconButton label="Edit card (E)" onClick={() => current && setEditing(current.id)} disabled={!current}>
              <Pencil />
            </IconButton>
          )}
          <IconButton label="Undo last rating (Z)" onClick={undo} disabled={!canUndo}>
            <Undo />
          </IconButton>
        </div>
        <div className="h-px bg-seam">
          <div className="h-px bg-ion transition-[width] duration-500 ease-out-soft" style={{ width: `${progress * 100}%` }} />
        </div>
      </header>

      <main
        ref={scrollRef}
        onClick={current && !revealed ? reveal : undefined}
        className={`min-h-0 flex-1 overflow-y-auto ${current && !revealed ? "cursor-pointer" : ""}`}
      >
        <div className="mx-auto max-w-2xl px-5 pb-10 pt-7 sm:px-8 lg:pt-14">
          {saveError && (
            <div className="mb-6" onClick={(e) => e.stopPropagation()}>
              <ErrorNote onRetry={persist ? retrySaves : undefined}>Some ratings weren&apos;t saved: {saveError}</ErrorNote>
            </div>
          )}
          {imageError && (
            <div className="mb-6">
              <ErrorNote>{imageError}</ErrorNote>
            </div>
          )}

          {current ? (
            <article key={current.id}>
              <p className="eyebrow mb-5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={kindColor}>{kind}</span>
                <span className="text-seam-3">/</span>
                <span className="normal-case tracking-[0.06em]">{describe(current)}</span>
              </p>
              {current.front && <Markdown className="text-[1.3rem] leading-snug sm:text-[1.55rem]">{current.front}</Markdown>}
              {current.frontImage && <CardImage url={images.get(current.frontImage)} onZoom={setZoom} />}

              {revealed && (
                <div ref={answerRef} className="animate-[fadeIn_.25s_ease-out]">
                  <div className="relative my-7 h-px bg-seam-2">
                    <span className="absolute -top-[3px] left-0 h-[7px] w-[7px] rounded-full bg-ion shadow-[0_0_12px_2px_rgba(143,179,255,.45)]" />
                  </div>
                  {current.back && <Markdown className="text-[1.06rem] leading-relaxed text-frost/95 sm:text-[1.15rem]">{current.back}</Markdown>}
                  {current.backImage && <CardImage url={images.get(current.backImage)} onZoom={setZoom} />}
                </div>
              )}
            </article>
          ) : (
            <EndScreen cram={cram} reviewed={reviewed} waitingUntil={waitingUntil} now={clock} canUndo={canUndo} onUndo={undo} onExit={onExit} />
          )}
        </div>
      </main>

      {current && (
        <footer className="pb-safe shrink-0 border-t border-seam bg-void/95 px-3 pt-3 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            {!revealed ? (
              <button
                onClick={reveal}
                className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl border border-ion/40 bg-hull-2 text-[15px] tracking-wide text-ion transition-colors hover:bg-hull-3 active:scale-[.99]"
              >
                Show answer
                <kbd className="hidden font-mono text-[10px] text-dust lg:inline">space</kbd>
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map(({ grade, label, key }) => (
                  <button
                    key={grade}
                    onClick={() => rate(grade)}
                    className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-seam-2 bg-hull-2 transition-colors hover:border-seam-3 hover:bg-hull-3 active:scale-[.97]"
                  >
                    <span className={`font-mono text-[11px] ${gradeColor[grade]}`}>
                      {cram ? cramLabel[grade] : outcomes && formatInterval(outcomes.at, outcomes.record[grade].card.due)}
                    </span>
                    <span className="text-[14.5px] text-frost">
                      {label}
                      <kbd className="ml-1.5 hidden font-mono text-[10px] text-dust lg:inline">{key}</kbd>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </footer>
      )}

      {zoom && <ImageZoom url={zoom} onClose={() => setZoom(null)} />}
      {editing && <CardEditorModal cardId={editing} onDone={finishEdit} />}
    </div>
  );
}

function EndScreen({
  cram,
  reviewed,
  waitingUntil,
  now,
  canUndo,
  onUndo,
  onExit,
}: {
  cram: boolean;
  reviewed: number;
  waitingUntil: Date | null;
  now: number;
  canUndo: boolean;
  onUndo: () => void;
  onExit: () => void;
}) {
  const minutes = waitingUntil ? Math.max(1, Math.round((waitingUntil.getTime() - LEARN_AHEAD_MS - now) / 60_000)) : 0;
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 text-center">
      <p className="eyebrow">{waitingUntil ? "Learning cards pending" : reviewed ? (cram ? "Cram complete" : "Session complete") : "All clear"}</p>
      <h1 className="font-display text-2xl tracking-[0.12em] text-frost">{waitingUntil ? "Take a break." : reviewed ? "Done." : "Nothing due."}</h1>
      <p className="max-w-xs text-mist">
        {waitingUntil
          ? `The next card is ready in about ${minutes} min. Stay here or come back later.`
          : reviewed
            ? `${reviewed} ${reviewed === 1 ? "card" : "cards"} ${cram ? "gone through. Your schedule wasn't changed." : "reviewed."}`
            : cram
              ? "There are no cards in this selection."
              : "There's nothing to review here right now. Use Cram to go through these cards anyway."}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={onExit}>Back to overview</Button>
        {canUndo && (
          <Button variant="ghost" onClick={onUndo}>
            Undo last
          </Button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { Card, IPreview, ReviewLog } from "ts-fsrs";
import { formatInterval, GRADES, makeScheduler, Rating, State, type Grade } from "@/lib/fsrs";
import { afterRating, LEARN_AHEAD_MS, nextLearningDue, pickNext, sessionCounts, type SessionState } from "@/lib/queue";
import type { StudyCard } from "@/lib/types";
import { CardImage, ImageZoom } from "./CardImage";
import { ArrowLeft, Undo } from "./icons";
import { Markdown } from "./Markdown";
import { Button, Counts, ErrorNote, IconButton } from "./ui";

export interface ReviewPersistence {
  record: (cardId: string, next: Card, log: ReviewLog, durationMs: number) => Promise<string>;
  undo: (logId: string, cardId: string, previous: Card) => Promise<void>;
}

interface Props {
  title: string;
  initial: SessionState;
  dayEnd: Date;
  retention: number;
  /** e.g. "Business Law I · Unit 03 · A. S.A. vs S.L." */
  describe: (card: StudyCard) => string;
  /** null = practice only, nothing is saved. */
  persist: ReviewPersistence | null;
  loadImages: (paths: string[]) => Promise<Map<string, string>>;
  onExit: () => void;
}

interface HistoryEntry {
  before: SessionState;
  card: StudyCard;
  logId: string | null;
  failed: boolean;
  saving: Promise<void>;
  save: () => Promise<void>;
  retry: () => void;
}

const MAX_DURATION_MS = 60_000;
/** Taps on the rating buttons right after "Show answer" are ignored (they sit where that button was). */
const DOUBLE_TAP_GUARD_MS = 350;

const gradeColor: Record<number, string> = {
  [Rating.Again]: "text-down",
  [Rating.Hard]: "text-flare",
  [Rating.Good]: "text-up",
  [Rating.Easy]: "text-ion",
};

export function ReviewSession({ title, initial, dayEnd, retention, describe, persist, loadImages, onExit }: Props) {
  const scheduler = useMemo(() => makeScheduler(retention), [retention]);
  const [session, setSession] = useState(initial);
  const [current, setCurrent] = useState<StudyCard | null>(() => pickNext(initial, new Date()));
  const [preview, setPreview] = useState<{ at: Date; record: IPreview } | null>(null);
  const [images, setImages] = useState<Map<string, string>>(() => new Map());
  const [zoom, setZoom] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const shownAt = useRef(0);
  const revealedAt = useRef(0);
  const history = useRef<HistoryEntry[]>([]);
  const failed = useRef<HistoryEntry[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const answerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const revealed = preview !== null;

  // Saves run one after another, in the order they happened.
  const enqueue = useCallback((op: () => Promise<void>) => (chain.current = chain.current.then(op, op)), []);

  const show = useCallback((card: StudyCard | null) => {
    setCurrent(card);
    setPreview(null);
    shownAt.current = Date.now();
    scrollRef.current?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  // Load (and pre-load) pictures for this card and the next few. Each picture is requested once.
  const requested = useRef(new Set<string>());
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
  const waitingUntil = !current ? nextLearningDue(session) : null;
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
    setPreview({ at, record: scheduler.repeat(current.sched, at) });
    requestAnimationFrame(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }, [current, revealed, scheduler]);

  const rate = useCallback(
    (grade: Grade) => {
      if (!current || !preview) return;
      if (Date.now() - revealedAt.current < DOUBLE_TAP_GUARD_MS) return;
      const item = preview.record[grade];
      const rated: StudyCard = { ...current, sched: item.card };
      const next = afterRating(session, rated, dayEnd);
      const duration = Math.min(Date.now() - shownAt.current, MAX_DURATION_MS);

      const entry: HistoryEntry = {
        before: session,
        card: current,
        logId: null,
        failed: false,
        saving: Promise.resolve(),
        save: async () => {
          if (!persist) return;
          try {
            entry.logId = await persist.record(current.id, item.card, item.log, duration);
            entry.failed = false;
          } catch (e) {
            entry.failed = true;
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
    [current, preview, session, dayEnd, persist, enqueue, show],
  );

  const undo = useCallback(() => {
    const entry = history.current.pop();
    if (!entry) return;
    failed.current = failed.current.filter((f) => f !== entry);
    setCanUndo(history.current.length > 0);
    setSession(entry.before);
    setReviewed((n) => Math.max(0, n - 1));
    show(entry.card);
    if (persist) {
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
  }, [persist, enqueue, show]);

  const retrySaves = useCallback(() => {
    setSaveError(null);
    const pending = failed.current;
    failed.current = [];
    for (const entry of pending) entry.retry();
  }, []);

  // Keyboard: Space/Enter = show answer (then Good, like Anki), 1–4 = rate, Z = undo.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (e.altKey || e.metaKey || zoom) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!revealed) reveal();
      else rate(Rating.Good);
    } else if (revealed && !e.ctrlKey && ["1", "2", "3", "4"].includes(e.key)) {
      rate(Number(e.key) as Grade);
    } else if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const counts = sessionCounts(session);
  const remaining = counts.fresh + counts.learning + counts.review;
  const progress = reviewed + remaining ? reviewed / (reviewed + remaining) : 1;
  const kind = current?.sched.state === State.New ? "new" : current && current.sched.state !== State.Review ? "learning" : "review";

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
          <Counts fresh={counts.fresh} learning={counts.learning} due={counts.review} className="px-2" />
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
                <span className={kind === "new" ? "text-ion" : kind === "learning" ? "text-flare" : "text-up"}>{kind}</span>
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
            <EndScreen reviewed={reviewed} waitingUntil={waitingUntil} now={clock} canUndo={canUndo} onUndo={undo} onExit={onExit} />
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
                      {preview && formatInterval(preview.at, preview.record[grade].card.due)}
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
    </div>
  );
}

function EndScreen({
  reviewed,
  waitingUntil,
  now,
  canUndo,
  onUndo,
  onExit,
}: {
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
      <p className="eyebrow">{waitingUntil ? "Learning cards pending" : reviewed ? "Session complete" : "All clear"}</p>
      <h1 className="font-display text-2xl tracking-[0.12em] text-frost">{waitingUntil ? "Take a break." : reviewed ? "Done." : "Nothing due."}</h1>
      <p className="max-w-xs text-mist">
        {waitingUntil
          ? `The next card is ready in about ${minutes} min. Stay here or come back later.`
          : reviewed
            ? `${reviewed} ${reviewed === 1 ? "card" : "cards"} reviewed.`
            : "There's nothing to review here right now."}
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

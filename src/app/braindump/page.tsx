"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { Markdown } from "@/components/Markdown";
import { PageShell } from "@/components/PageShell";
import { Button, ErrorNote, Splash } from "@/components/ui";
import { checkDump, type DumpResult } from "@/lib/braindump";
import { loadTree } from "@/lib/data";
import { loadAttempts, loadDumpCards, prioritizeCards, saveAttempt, type DumpAttempt, type DumpCard } from "@/lib/dumps";
import type { SubjectRow, UnitRow } from "@/lib/types";

export default function BrainDumpPage() {
  return (
    <RequireAuth>
      <BrainDump />
    </RequireAuth>
  );
}

interface Config {
  subjectId: string;
  unitId: string;
  section: string | null;
  minutes: number;
  hintAfterMin: number | null;
}

type Phase =
  | { name: "setup" }
  | { name: "writing"; cards: DumpCard[]; startedAt: number }
  | { name: "result"; cards: DumpCard[]; result: DumpResult; text: string; durationS: number; hintsUsed: boolean };

const MINUTES = [3, 5, 7, 10, 15];
const HINT_AFTER: (number | null)[] = [1, 2, 3, 5, null];

function BrainDump() {
  const [tree, setTree] = useState<{ subjects: SubjectRow[]; units: UnitRow[] } | null>(null);
  const [config, setConfig] = useState<Config>({ subjectId: "", unitId: "", section: null, minutes: 7, hintAfterMin: 3 });
  const [phase, setPhase] = useState<Phase>({ name: "setup" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTree().then(
      (t) => {
        setTree(t);
        const firstUnit = t.units[0];
        if (firstUnit) setConfig((c) => ({ ...c, subjectId: firstUnit.subject_id, unitId: firstUnit.id }));
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  if (!tree) return error ? <PageShell title="Brain dump"><ErrorNote>{error}</ErrorNote></PageShell> : <Splash />;
  const unit = tree.units.find((u) => u.id === config.unitId);
  const title = unit ? [unit.name, config.section].filter(Boolean).join(" · ") : "Brain dump";

  if (phase.name === "writing") {
    return (
      <Writing
        title={title}
        config={config}
        cards={phase.cards}
        startedAt={phase.startedAt}
        onFinish={(text, hintsUsed) => {
          const durationS = (Date.now() - phase.startedAt) / 1000;
          const result = checkDump(phase.cards, text);
          setPhase({ name: "result", cards: phase.cards, result, text, durationS, hintsUsed });
          saveAttempt({
            subjectId: config.subjectId,
            unitId: config.unitId,
            section: config.section,
            text,
            durationS,
            hintsUsed,
            coveredIds: result.covered.map((c) => c.id),
            missedIds: result.missed.map((c) => c.id),
            score: result.score,
          }).catch((e: Error) => setError(e.message));
        }}
      />
    );
  }

  if (phase.name === "result") {
    return <Result title={title} config={config} phase={phase} error={error} onAgain={() => setPhase({ name: "setup" })} />;
  }

  return <Setup tree={tree} config={config} onChange={setConfig} onStart={(cards) => setPhase({ name: "writing", cards, startedAt: Date.now() })} error={error} />;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

function Setup({
  tree,
  config,
  onChange,
  onStart,
  error,
}: {
  tree: { subjects: SubjectRow[]; units: UnitRow[] };
  config: Config;
  onChange: (c: Config) => void;
  onStart: (cards: DumpCard[]) => void;
  error: string | null;
}) {
  const [unitCards, setUnitCards] = useState<{ unitId: string; cards: DumpCard[] } | null>(null);
  const [attempts, setAttempts] = useState<{ unitId: string; list: DumpAttempt[] } | null>(null);

  useEffect(() => {
    if (!config.unitId) return;
    let cancelled = false;
    loadDumpCards(config.unitId, null).then((cards) => !cancelled && setUnitCards({ unitId: config.unitId, cards }), () => {});
    loadAttempts(config.unitId).then((list) => !cancelled && setAttempts({ unitId: config.unitId, list }), () => {});
    return () => {
      cancelled = true;
    };
  }, [config.unitId]);

  const cards = unitCards?.unitId === config.unitId ? unitCards.cards : null;
  const sections = useMemo(() => [...new Set((cards ?? []).map((c) => c.section).filter((s): s is string => !!s))], [cards]);
  const selected = cards?.filter((c) => !config.section || c.section === config.section) ?? [];
  const history = attempts?.unitId === config.unitId ? attempts.list : [];

  const select = "h-12 w-full rounded-xl border border-seam-2 bg-hull px-3 text-[15px] text-frost outline-none focus:border-ion/60";
  const chip = (active: boolean) =>
    `h-10 min-w-12 rounded-full border px-4 font-mono text-[13px] transition-colors ${active ? "border-ion/60 bg-hull-2 text-frost" : "border-seam-2 text-mist hover:text-frost"}`;

  return (
    <PageShell title="Brain dump">
      <p className="text-[14.5px] leading-relaxed text-mist">
        Write down everything you know about a unit, from memory. Afterwards RECALL checks your text against the unit&apos;s cards and shows what you
        missed.
      </p>

      {!tree.units.length ? (
        <p className="mt-8 text-mist">Import some cards first.</p>
      ) : (
        <div className="mt-8 space-y-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="eyebrow">Subject</span>
              <select
                value={config.subjectId}
                onChange={(e) => {
                  const first = tree.units.find((u) => u.subject_id === e.target.value);
                  onChange({ ...config, subjectId: e.target.value, unitId: first?.id ?? "", section: null });
                }}
                className={`${select} mt-1.5`}
              >
                {tree.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="eyebrow">Unit</span>
              <select value={config.unitId} onChange={(e) => onChange({ ...config, unitId: e.target.value, section: null })} className={`${select} mt-1.5`}>
                {tree.units
                  .filter((u) => u.subject_id === config.subjectId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {sections.length > 0 && (
            <label className="block">
              <span className="eyebrow">Section</span>
              <select value={config.section ?? ""} onChange={(e) => onChange({ ...config, section: e.target.value || null })} className={`${select} mt-1.5`}>
                <option value="">Whole unit</option>
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div>
            <span className="eyebrow">Time</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {MINUTES.map((m) => (
                <button key={m} onClick={() => onChange({ ...config, minutes: m })} className={chip(config.minutes === m)}>
                  {m} min
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="eyebrow">Hints available after</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {HINT_AFTER.map((m) => (
                <button key={String(m)} onClick={() => onChange({ ...config, hintAfterMin: m })} className={chip(config.hintAfterMin === m)}>
                  {m === null ? "no hints" : `${m} min`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-dust">Hints show the questions you haven&apos;t covered yet, never the answers.</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={() => onStart(selected)} disabled={!selected.length}>
              Start · {config.minutes} min
            </Button>
            <span className="font-mono text-[12px] text-dust">{cards ? `${selected.length} cards to cover` : "Loading cards…"}</span>
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}

          {history.length > 0 && <History attempts={history} />}
        </div>
      )}
    </PageShell>
  );
}

function History({ attempts }: { attempts: DumpAttempt[] }) {
  const recent = [...attempts].reverse().slice(-12);
  return (
    <section className="space-y-3 border-t border-seam pt-7">
      <p className="eyebrow">Your progress in this unit</p>
      <div className="flex h-24 items-end gap-1.5">
        {recent.map((a) => (
          <div key={a.id} className="flex flex-1 flex-col items-center gap-1" title={`${Math.round(a.score * 100)}%`}>
            <div className="w-full rounded-t bg-ion/70" style={{ height: `${Math.max(4, a.score * 80)}px` }} />
          </div>
        ))}
      </div>
      <ul className="divide-y divide-seam text-[13px]">
        {attempts.slice(0, 6).map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2">
            <span className="text-mist">
              {new Date(a.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {a.section ?? "whole unit"}
              {a.hints_used ? " · hints" : ""}
            </span>
            <span className="font-mono text-frost">{Math.round(a.score * 100)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Writing ─────────────────────────────────────────────────────────────────

function Writing({
  title,
  config,
  cards,
  startedAt,
  onFinish,
}: {
  title: string;
  config: Config;
  cards: DumpCard[];
  startedAt: number;
  onFinish: (text: string, hintsUsed: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [hintsOpen, setHintsOpen] = useState(false);
  const [live, setLive] = useState<DumpResult | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    area.current?.focus();
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Which cards are covered so far (for the hints), recomputed while you type.
  useEffect(() => {
    if (!hintsOpen) return;
    const t = setTimeout(() => setLive(checkDump(cards, text)), 600);
    return () => clearTimeout(t);
  }, [hintsOpen, cards, text]);

  const elapsed = (now - startedAt) / 1000;
  const left = Math.max(0, config.minutes * 60 - elapsed);
  const timeUp = left <= 0;
  const hintsReady = config.hintAfterMin !== null && elapsed >= config.hintAfterMin * 60;
  const mmss = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
  const openCards = live ? cards.filter((c) => live.missed.some((m) => m.id === c.id)) : cards;

  return (
    <div className="flex h-dvh flex-col">
      <header className="pt-safe shrink-0 border-b border-seam">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <p className="min-w-0 flex-1 truncate text-[14px] text-frost">{title}</p>
          <span className={`font-mono text-[15px] tabular-nums ${timeUp ? "text-flare" : "text-ion"}`}>{timeUp ? "time's up" : mmss}</span>
          <Button className="h-10 px-5 text-[14px]" onClick={() => onFinish(text, hintsOpen)}>
            Finish
          </Button>
        </div>
        <div className="h-px bg-seam">
          <div className="h-px bg-ion transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (elapsed / (config.minutes * 60)) * 100)}%` }} />
        </div>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Everything you remember: definitions, numbers, articles, examples…"
          className="min-h-[50dvh] w-full resize-none rounded-2xl border border-seam-2 bg-hull p-5 text-[16px] leading-relaxed text-frost outline-none placeholder:text-seam-3 focus:border-ion/50 lg:h-full lg:text-[17px]"
        />
        <aside className="space-y-3 lg:overflow-y-auto">
          {timeUp && <p className="rounded-2xl border border-flare/30 bg-flare/[.05] px-4 py-3 text-[13.5px] text-frost">Time&apos;s up. Add anything last, then tap Finish.</p>}
          {config.hintAfterMin === null ? null : !hintsReady ? (
            <p className="px-1 font-mono text-[11px] text-dust">hints in {Math.ceil((config.hintAfterMin * 60 - elapsed) / 60)} min</p>
          ) : !hintsOpen ? (
            <Button variant="ghost" onClick={() => setHintsOpen(true)}>
              Show hints
            </Button>
          ) : (
            <div className="rounded-2xl border border-seam p-4">
              <p className="eyebrow mb-3">Not covered yet · {openCards.length}</p>
              <ul className="space-y-3 text-[14px] text-mist">
                {openCards.map((c) => (
                  <li key={c.id} className="border-l border-seam-3 pl-3">
                    <Markdown>{c.front || "(picture card)"}</Markdown>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Result ──────────────────────────────────────────────────────────────────

function Result({
  title,
  config,
  phase,
  error,
  onAgain,
}: {
  title: string;
  config: Config;
  phase: Extract<Phase, { name: "result" }>;
  error: string | null;
  onAgain: () => void;
}) {
  const router = useRouter();
  const [added, setAdded] = useState<"idle" | "busy" | "done" | string>("idle");
  const [attempts, setAttempts] = useState<DumpAttempt[]>([]);
  const byId = new Map(phase.cards.map((c) => [c.id, c]));
  const { result } = phase;
  const pct = Math.round(result.score * 100);

  useEffect(() => {
    const t = setTimeout(() => loadAttempts(config.unitId).then(setAttempts, () => {}), 800);
    return () => clearTimeout(t);
  }, [config.unitId]);

  async function addMissed() {
    setAdded("busy");
    try {
      await prioritizeCards(result.missed.map((m) => m.id));
      setAdded("done");
    } catch (e) {
      setAdded((e as Error).message);
    }
  }

  return (
    <PageShell title={`Brain dump · ${title}`}>
      <div className="space-y-8">
        <div>
          <p className="eyebrow">Score</p>
          <p className="mt-2 flex items-baseline gap-3">
            <span className={`font-display text-6xl tabular-nums ${pct >= 80 ? "text-up" : pct >= 50 ? "text-frost" : "text-flare"}`}>{pct}%</span>
            <span className="text-mist">
              {result.covered.length} of {result.covered.length + result.missed.length} cards covered · {Math.round(phase.durationS / 60)} min
              {phase.hintsUsed ? " · with hints" : ""}
            </span>
          </p>
          {result.unchecked.length > 0 && <p className="mt-2 text-[12.5px] text-dust">{result.unchecked.length} picture-only cards can&apos;t be checked and don&apos;t count.</p>}
        </div>

        <div className="flex flex-wrap gap-3">
          {result.missed.length > 0 && (
            <Button onClick={addMissed} disabled={added === "busy" || added === "done"}>
              {added === "done" ? "Added to today's review ✓" : `Add ${result.missed.length} missed cards to today's review`}
            </Button>
          )}
          <Button variant="ghost" onClick={onAgain}>
            New brain dump
          </Button>
          <Button variant="text" onClick={() => router.push("/")}>
            Overview
          </Button>
        </div>
        {added !== "idle" && added !== "busy" && added !== "done" && <ErrorNote>{added}</ErrorNote>}
        {error && <ErrorNote>{error}</ErrorNote>}

        {result.missed.length > 0 && (
          <section className="space-y-3">
            <p className="eyebrow text-flare">Missed · {result.missed.length}</p>
            <ul className="space-y-3">
              {result.missed.map((m) => {
                const c = byId.get(m.id)!;
                return (
                  <li key={m.id} className="rounded-2xl border border-seam p-4">
                    <Markdown className="text-[15px] text-frost">{c.front || "(picture card)"}</Markdown>
                    <div className="my-3 h-px bg-seam" />
                    <Markdown className="text-[14px] text-mist">{c.back}</Markdown>
                    {m.missing.length > 0 && (
                      <p className="mt-3 flex flex-wrap gap-1.5">
                        {m.missing.map((t) => (
                          <span key={t.label} className="rounded-full border border-flare/30 px-2.5 py-0.5 font-mono text-[11px] text-flare">
                            {t.label}
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {result.covered.length > 0 && (
          <details className="rounded-2xl border border-seam p-4">
            <summary className="cursor-pointer text-[14px] text-up">Covered · {result.covered.length}</summary>
            <ul className="mt-3 space-y-2 text-[14px] text-mist">
              {result.covered.map((m) => (
                <li key={m.id} className="border-l border-up/40 pl-3">
                  <Markdown>{byId.get(m.id)?.front ?? ""}</Markdown>
                </li>
              ))}
            </ul>
          </details>
        )}

        <details className="rounded-2xl border border-seam p-4">
          <summary className="cursor-pointer text-[14px] text-mist">Your text</summary>
          <p className="mt-3 whitespace-pre-wrap text-[14px] text-mist">{phase.text || "(empty)"}</p>
        </details>

        {attempts.length > 1 && <History attempts={attempts} />}
      </div>
    </PageShell>
  );
}

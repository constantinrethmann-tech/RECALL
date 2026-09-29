"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loadOverview, type Overview } from "@/lib/data";
import { sameScope, studyHref } from "@/lib/scope";
import { getSupabase } from "@/lib/supabase";
import { sortTags, tagLabel } from "@/lib/tags";
import type { Scope, StudyMode, TagCounts, UnitRow } from "@/lib/types";
import { Chevron, Flame, Pencil, Play } from "./icons";
import { ButtonLink, Counts } from "./ui";

/** Overview data that refreshes when the app comes back into view and when cards change on another device. */
export function useOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      loadOverview().then(
        (d) => {
          setData(d);
          setError(null);
        },
        (e: Error) => setError(e.message),
      ),
    [],
  );

  useEffect(() => {
    reload();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 1200);
    };
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    const sb = getSupabase();
    const channel = sb
      .channel(`cards-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, soon)
      .subscribe();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      sb.removeChannel(channel);
    };
  }, [reload]);

  return { data, error, reload };
}

export interface Totals {
  fresh: number;
  learning: number;
  due: number;
  total: number;
  seen: number;
  trouble: number;
}

export function subjectTotals(data: Overview, subjectId: string): Totals {
  const t: Totals = { fresh: 0, learning: 0, due: 0, total: 0, seen: 0, trouble: 0 };
  for (const u of data.units) {
    if (u.subject_id !== subjectId) continue;
    const c = data.counts.get(u.id);
    if (!c) continue;
    t.fresh += c.new_count;
    t.learning += c.learning_count;
    t.due += c.due_count;
    t.total += c.total;
    t.seen += c.seen_count;
    t.trouble += c.trouble_count;
  }
  // New cards are limited per subject and in total per day.
  t.fresh = Math.min(t.fresh, data.newLeft.get(subjectId) ?? 0, data.newLeftTotal);
  return t;
}

export function grandTotals(data: Overview): Totals {
  const t: Totals = { fresh: 0, learning: 0, due: 0, total: 0, seen: 0, trouble: 0 };
  for (const s of data.subjects) {
    const st = subjectTotals(data, s.id);
    for (const k of Object.keys(t) as (keyof Totals)[]) t[k] += st[k];
  }
  t.fresh = Math.min(t.fresh, data.newLeftTotal);
  return t;
}

/** Learn = normal reviews; Cram = go through everything, random order, schedule untouched. */
export function ModeSwitch({ mode, onChange }: { mode: StudyMode; onChange: (m: StudyMode) => void }) {
  return (
    <div className="px-4">
      <div role="tablist" className="grid grid-cols-2 rounded-full border border-seam-2 p-1">
        {(["learn", "cram"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => onChange(m)}
            className={`h-9 rounded-full text-[13px] transition-colors ${mode === m ? "bg-hull-3 text-frost" : "text-dust hover:text-mist"}`}
          >
            {m === "learn" ? "Learn" : "Cram"}
          </button>
        ))}
      </div>
      {mode === "cram" && (
        <p className="mt-2.5 px-1 text-[12.5px] leading-relaxed text-dust">
          Cram goes through every card of what you pick, in random order, without changing your schedule. For the night before an exam.
        </p>
      )}
    </div>
  );
}

function Chip({ href, label, count, tone = "ion", active }: { href: string; label: string; count: number; tone?: "ion" | "flare"; active: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] transition-colors ${
        active ? "border-ion/60 bg-hull-2 text-frost" : "border-seam-2 text-mist hover:border-seam-3 hover:text-frost"
      }`}
    >
      {label}
      <span className={`font-mono text-[11px] ${count ? (tone === "flare" ? "text-flare" : "text-ion") : "text-seam-3"}`}>{count}</span>
    </Link>
  );
}

const tagCount = (t: TagCounts, mode: StudyMode, newLeft: number) =>
  mode === "cram" ? t.total : t.due_count + t.learning_count + Math.min(t.new_count, newLeft);

/** A unit named "<topic> · Code" is shown folded under "<topic>" (its code drills). */
const CODE_SUFFIX = " · Code";

/** Which subjects (or units) are unfolded. Folded by default; remembered on this device. */
function useOpenSet(storageKey: string) {
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  return [open, toggle] as const;
}

export function OverviewList({ data, active, mode }: { data: Overview; active?: Scope; mode: StudyMode }) {
  const [openSubjects, toggleSubject] = useOpenSet("recall-open-subjects");
  const [openUnits, toggleUnit] = useOpenSet("recall-open-units");
  if (!data.subjects.length) return <EmptyState />;
  const cram = mode === "cram";
  return (
    <div className="space-y-2 px-2 pb-6">
      {data.subjects.map((s) => {
        const st = subjectTotals(data, s.id);
        const newLeft = Math.min(data.newLeft.get(s.id) ?? 0, data.newLeftTotal);
        const units = data.units.filter((u) => u.subject_id === s.id && data.counts.has(u.id));
        const tags = sortTags((data.tags.get(s.id) ?? []).map((t) => t.tag)).map((tag) => data.tags.get(s.id)!.find((t) => t.tag === tag)!);
        const isOpen = openSubjects.has(s.id);
        // "<topic> · Code" units hang under their topic.
        const byName = new Map(units.map((u) => [u.name, u]));
        const codeUnitOf = new Map<string, UnitRow>();
        for (const u of units) {
          const parent = u.name.endsWith(CODE_SUFFIX) ? byName.get(u.name.slice(0, -CODE_SUFFIX.length)) : undefined;
          if (parent) codeUnitOf.set(parent.id, u);
        }
        const children = new Set([...codeUnitOf.values()].map((u) => u.id));
        const unitLink = (u: UnitRow, label: string, code = false) => {
          const c = data.counts.get(u.id)!;
          const pct = c.total ? Math.round((c.seen_count / c.total) * 100) : 0;
          return (
            <Link
              href={studyHref({ unitId: u.id }, mode)}
              className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-hull-2 ${sameScope(active, { unitId: u.id }) ? "bg-hull-2" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className={`flex items-center gap-2 truncate text-[14px] ${code ? "text-mist" : "text-frost"}`}>
                  {code && <Pencil width={14} height={14} className="shrink-0 text-ion" />}
                  {label}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-seam">
                    <div className="h-full rounded-full bg-ion/70" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-9 text-right font-mono text-[10px] text-dust">{pct}%</span>
                </div>
              </div>
              {cram ? (
                <span className="font-mono text-[12px] text-ion">{c.total}</span>
              ) : (
                <Counts fresh={Math.min(c.new_count, newLeft)} learning={c.learning_count} due={c.due_count} />
              )}
            </Link>
          );
        };
        return (
          <section key={s.id} className={isOpen ? "pb-5" : ""}>
            <div className={`flex items-center gap-2 rounded-xl py-1 pl-1 pr-1 ${sameScope(active, { subjectId: s.id }) ? "bg-hull-2" : ""}`}>
              <button
                type="button"
                onClick={() => toggleSubject(s.id)}
                aria-expanded={isOpen}
                title={isOpen ? "Fold units" : "Show units"}
                className="group flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg pl-1.5 text-left"
              >
                <Chevron width={16} height={16} className={`shrink-0 text-dust transition-transform duration-200 group-hover:text-ion ${isOpen ? "rotate-90" : ""}`} />
                <h2 className="min-w-0 flex-1 truncate font-display text-[10.5px] uppercase tracking-[0.2em] text-mist group-hover:text-frost">{s.name}</h2>
              </button>
              {cram ? (
                <span className="font-mono text-[12px] text-ion">{st.total}</span>
              ) : (
                <Counts fresh={st.fresh} learning={st.learning} due={st.due} />
              )}
              <Link
                href={studyHref({ subjectId: s.id }, mode)}
                aria-label={`${cram ? "Cram" : "Study"} all of ${s.name}`}
                title={`${cram ? "Cram" : "Study"} all of ${s.name}`}
                className="ml-1 grid h-10 w-10 place-items-center rounded-full border border-seam-2 text-ion transition-colors hover:border-ion/50 hover:bg-hull-2"
              >
                <Play width={16} height={16} />
              </Link>
            </div>

            {isOpen && (
              <div className="mt-1.5 animate-[fadeIn_.2s_ease-out] space-y-0.5">
                {units
                  .filter((u) => !children.has(u.id))
                  .map((u) => {
                    const codeUnit = codeUnitOf.get(u.id);
                    if (!codeUnit) return <div key={u.id} className="flex">{unitLink(u, u.name)}</div>;
                    const unitOpen = openUnits.has(u.id) || sameScope(active, { unitId: codeUnit.id });
                    return (
                      <div key={u.id}>
                        <div className="flex items-center">
                          <button
                            type="button"
                            onClick={() => toggleUnit(u.id)}
                            aria-expanded={unitOpen}
                            aria-label={unitOpen ? `Hide code exercises for ${u.name}` : `Show code exercises for ${u.name}`}
                            title={unitOpen ? "Hide code exercises" : "Show code exercises"}
                            className="grid h-11 w-7 shrink-0 place-items-center rounded-lg text-dust transition-colors hover:text-ion"
                          >
                            <Chevron width={15} height={15} className={`transition-transform duration-200 ${unitOpen ? "rotate-90" : ""}`} />
                          </button>
                          {unitLink(u, u.name)}
                        </div>
                        {unitOpen && <div className="flex animate-[fadeIn_.2s_ease-out] pl-7">{unitLink(codeUnit, "Write code", true)}</div>}
                      </div>
                    );
                  })}
              </div>
            )}

            {isOpen && (tags.length > 0 || st.trouble > 0) && (
              <div className="mt-3 flex flex-wrap gap-2 px-3">
                {tags.map((t) => (
                  <Chip
                    key={t.tag}
                    href={studyHref({ subjectId: s.id, tag: t.tag }, mode)}
                    label={tagLabel(t.tag)}
                    count={tagCount(t, mode, newLeft)}
                    active={sameScope(active, { subjectId: s.id, tag: t.tag })}
                  />
                ))}
                {st.trouble > 0 && (
                  <Chip
                    href={studyHref({ subjectId: s.id, trouble: true }, "cram")}
                    label="Trouble cards"
                    count={st.trouble}
                    tone="flare"
                    active={sameScope(active, { subjectId: s.id, trouble: true })}
                  />
                )}
              </div>
            )}
          </section>
        );
      })}
      <Link href="/decks/" className="mx-2 mt-2 inline-flex h-10 items-center gap-2 rounded-full px-2 text-[12.5px] text-dust transition-colors hover:text-frost">
        <Pencil width={14} height={14} />
        Edit subjects &amp; units
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-3 rounded-2xl border border-dashed border-seam-2 px-5 py-8 text-center">
      <p className="eyebrow">No cards yet</p>
      <p className="mx-auto mt-3 max-w-xs text-[14px] text-mist">Import a deck (.zip with cards.json and pictures) or add cards yourself.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <ButtonLink href="/import/" variant="ghost">
          Import a deck
        </ButtonLink>
        <ButtonLink href="/edit/" variant="text">
          Add a card
        </ButtonLink>
      </div>
    </div>
  );
}

export function TodayPanel({ data, mode, large = false }: { data: Overview; mode: StudyMode; large?: boolean }) {
  const t = grandTotals(data);
  const due = t.due + t.learning;
  const cram = mode === "cram";
  const any = cram ? t.total > 0 : due + t.fresh > 0;
  return (
    <div className={`rounded-3xl border border-seam bg-hull ${large ? "p-10" : "p-5"}`}>
      <div className="flex items-center justify-between">
        <p className="eyebrow">{cram ? "Cram" : "Today"}</p>
        <p className={`flex items-center gap-1.5 font-mono text-[11px] ${data.streak ? "text-flare" : "text-dust"}`} title="Days in a row with at least one review">
          <Flame width={14} height={14} />
          {data.streak} {data.streak === 1 ? "day" : "days"}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`font-display tabular-nums text-frost ${large ? "text-6xl" : "text-4xl"}`}>{cram ? t.total : due}</span>
        <span className="text-mist">{cram ? "cards" : "due"}</span>
        {!cram && <span className="font-mono text-[13px] text-ion">+ {t.fresh} new</span>}
      </div>
      {any ? (
        <ButtonLink href={studyHref({}, mode)} className={`mt-6 w-full ${large ? "h-14 text-base" : ""}`}>
          {cram ? "Cram everything" : "Study all"}
        </ButtonLink>
      ) : (
        <p className="mt-5 text-[14px] text-mist">{t.total ? "All caught up for today." : "Nothing to study yet."}</p>
      )}
      <p className="mt-4 font-mono text-[11px] text-dust">{data.reviewedToday} reviewed today</p>
    </div>
  );
}

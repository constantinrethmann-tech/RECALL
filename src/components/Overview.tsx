"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loadOverview, type Overview } from "@/lib/data";
import { getSupabase } from "@/lib/supabase";
import type { Scope } from "@/lib/types";
import { Play } from "./icons";
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
}

export function subjectTotals(data: Overview, subjectId: string): Totals {
  const t: Totals = { fresh: 0, learning: 0, due: 0, total: 0, seen: 0 };
  for (const u of data.units) {
    if (u.subject_id !== subjectId) continue;
    const c = data.counts.get(u.id);
    if (!c) continue;
    t.fresh += c.new_count;
    t.learning += c.learning_count;
    t.due += c.due_count;
    t.total += c.total;
    t.seen += c.seen_count;
  }
  // New cards are limited per subject per day.
  t.fresh = Math.min(t.fresh, data.newLeft.get(subjectId) ?? 0);
  return t;
}

export function grandTotals(data: Overview): Totals {
  const t: Totals = { fresh: 0, learning: 0, due: 0, total: 0, seen: 0 };
  for (const s of data.subjects) {
    const st = subjectTotals(data, s.id);
    t.fresh += st.fresh;
    t.learning += st.learning;
    t.due += st.due;
    t.total += st.total;
    t.seen += st.seen;
  }
  return t;
}

const isActive = (active: Scope | undefined, kind: Scope["kind"], id?: string) =>
  active?.kind === kind && (kind === "all" || (active as { id: string }).id === id);

export function OverviewList({ data, active }: { data: Overview; active?: Scope }) {
  if (!data.subjects.length) return <EmptyState />;
  return (
    <div className="space-y-7 px-2 pb-6">
      {data.subjects.map((s) => {
        const st = subjectTotals(data, s.id);
        const newLeft = data.newLeft.get(s.id) ?? 0;
        const units = data.units.filter((u) => u.subject_id === s.id && data.counts.has(u.id));
        return (
          <section key={s.id}>
            <div className={`flex items-center gap-2 rounded-xl py-1 pl-3 pr-1 ${isActive(active, "subject", s.id) ? "bg-hull-2" : ""}`}>
              <h2 className="min-w-0 flex-1 truncate font-display text-[10.5px] uppercase tracking-[0.2em] text-mist">{s.name}</h2>
              <Counts fresh={st.fresh} learning={st.learning} due={st.due} />
              <Link
                href={`/study/?subject=${s.id}`}
                aria-label={`Study all of ${s.name}`}
                title={`Study all of ${s.name}`}
                className="ml-1 grid h-10 w-10 place-items-center rounded-full border border-seam-2 text-ion transition-colors hover:border-ion/50 hover:bg-hull-2"
              >
                <Play width={16} height={16} />
              </Link>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {units.map((u) => {
                const c = data.counts.get(u.id)!;
                const pct = c.total ? Math.round((c.seen_count / c.total) * 100) : 0;
                return (
                  <Link
                    key={u.id}
                    href={`/study/?unit=${u.id}`}
                    className={`flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-hull-2 ${isActive(active, "unit", u.id) ? "bg-hull-2" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-frost">{u.name}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-seam">
                          <div className="h-full rounded-full bg-ion/70" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-9 text-right font-mono text-[10px] text-dust">{pct}%</span>
                      </div>
                    </div>
                    <Counts fresh={Math.min(c.new_count, newLeft)} learning={c.learning_count} due={c.due_count} />
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-3 rounded-2xl border border-dashed border-seam-2 px-5 py-8 text-center">
      <p className="eyebrow">No cards yet</p>
      <p className="mx-auto mt-3 max-w-xs text-[14px] text-mist">Import a deck (.zip with cards.json and pictures) to get started.</p>
      <ButtonLink href="/import/" variant="ghost" className="mt-5">
        Import a deck
      </ButtonLink>
    </div>
  );
}

export function TodayPanel({ data, large = false }: { data: Overview; large?: boolean }) {
  const t = grandTotals(data);
  const due = t.due + t.learning;
  const any = due + t.fresh > 0;
  return (
    <div className={`rounded-3xl border border-seam bg-hull ${large ? "p-10" : "p-5"}`}>
      <p className="eyebrow">Today</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`font-display tabular-nums text-frost ${large ? "text-6xl" : "text-4xl"}`}>{due}</span>
        <span className="text-mist">due</span>
        <span className="font-mono text-[13px] text-ion">+ {t.fresh} new</span>
      </div>
      {any ? (
        <ButtonLink href="/study/" className={`mt-6 w-full ${large ? "h-14 text-base" : ""}`}>
          Study all
        </ButtonLink>
      ) : (
        <p className="mt-5 text-[14px] text-mist">{t.total ? "All caught up for today." : "Nothing to study yet."}</p>
      )}
      <p className="mt-4 font-mono text-[11px] text-dust">{data.reviewedToday} reviewed today</p>
    </div>
  );
}

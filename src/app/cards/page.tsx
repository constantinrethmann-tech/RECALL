"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { Plus } from "@/components/icons";
import { PageShell } from "@/components/PageShell";
import { ErrorNote, IconLink, Splash } from "@/components/ui";
import { BROWSE_LIMIT, browseCards } from "@/lib/cards";
import { loadTree } from "@/lib/data";
import { formatInterval, State } from "@/lib/fsrs";
import { sortTags, tagLabel } from "@/lib/tags";
import type { CardRow, SubjectRow, UnitRow } from "@/lib/types";

export default function CardsPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<Splash />}>
        <Browser />
      </Suspense>
    </RequireAuth>
  );
}

const plain = (md: string) => md.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();

function status(c: CardRow, now: Date): { label: string; color: string } {
  if (c.state === State.New) return { label: "new", color: "text-ion" };
  if (c.state === State.Learning || c.state === State.Relearning) return { label: "learning", color: "text-flare" };
  const due = new Date(c.due);
  return due <= now ? { label: "due", color: "text-up" } : { label: `in ${formatInterval(now, due)}`, color: "text-dust" };
}

function Browser() {
  const router = useRouter();
  const params = useSearchParams();
  const [tree, setTree] = useState<{ subjects: SubjectRow[]; units: UnitRow[] } | null>(null);
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const subjectId = params.get("subject") ?? "";
  const unitId = params.get("unit") ?? "";
  const tag = params.get("tag") ?? "";

  const setFilter = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(`/cards/?${p.toString()}`);
  };

  useEffect(() => {
    loadTree().then(setTree, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      browseCards({ subjectId: subjectId || undefined, unitId: unitId || undefined, tag: tag || undefined, search }).then(
        (rows) => !cancelled && setCards(rows),
        (e: Error) => !cancelled && setError(e.message),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [subjectId, unitId, tag, search]);

  const unitsById = useMemo(() => new Map((tree?.units ?? []).map((u) => [u.id, u])), [tree]);
  const sorted = useMemo(
    () => [...(cards ?? [])].sort((a, b) => (unitsById.get(a.unit_id)?.position ?? 0) - (unitsById.get(b.unit_id)?.position ?? 0) || a.position - b.position),
    [cards, unitsById],
  );
  const tags = useMemo(() => sortTags([...new Set((cards ?? []).flatMap((c) => c.tags))].concat(tag && !cards?.some((c) => c.tags.includes(tag)) ? [tag] : [])), [cards, tag]);
  const now = new Date();
  const newHref = `/edit/?${new URLSearchParams({ ...(subjectId && { subject: subjectId }), ...(unitId && { unit: unitId }) }).toString()}`;

  const select = "h-11 min-w-0 rounded-xl border border-seam-2 bg-hull px-3 text-[14px] text-frost outline-none focus:border-ion/60";

  return (
    <PageShell
      title="Cards"
      wide
      action={
        <IconLink href={newHref} label="New card">
          <Plus />
        </IconLink>
      }
    >
      <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search text…" className={select} />
        <select value={subjectId} onChange={(e) => setFilter({ subject: e.target.value, unit: "" })} className={select}>
          <option value="">All subjects</option>
          {tree?.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={unitId} onChange={(e) => setFilter({ unit: e.target.value })} className={select}>
          <option value="">All units</option>
          {tree?.units
            .filter((u) => !subjectId || u.subject_id === subjectId)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
        <select value={tag} onChange={(e) => setFilter({ tag: e.target.value })} className={select}>
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {tagLabel(t)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mt-5">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {!cards ? (
        <p className="eyebrow mt-8">Loading…</p>
      ) : (
        <>
          <p className="eyebrow mt-6">
            {cards.length >= BROWSE_LIMIT ? `First ${BROWSE_LIMIT} cards — narrow the search` : `${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
          </p>
          <ul className="mt-3 divide-y divide-seam overflow-hidden rounded-2xl border border-seam">
            {sorted.map((c) => {
              const s = status(c, now);
              return (
                <li key={c.id}>
                  <Link href={`/edit/?id=${c.id}`} className="block px-4 py-3.5 transition-colors hover:bg-hull">
                    <p className="line-clamp-2 text-[14.5px] text-frost">{plain(c.front) || "(picture)"}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-dust">
                      <span className={s.color}>{s.label}</span>
                      <span>·</span>
                      <span className="truncate">{[unitsById.get(c.unit_id)?.name, c.section].filter(Boolean).join(" · ")}</span>
                      {(c.front_image || c.back_image) && <span className="text-mist">· picture</span>}
                      {c.tags.map((t) => (
                        <span key={t} className="rounded-full border border-seam-2 px-2 py-px text-mist">
                          {tagLabel(t)}
                        </span>
                      ))}
                    </p>
                  </Link>
                </li>
              );
            })}
            {!sorted.length && <li className="px-4 py-8 text-center text-[14px] text-mist">No cards match.</li>}
          </ul>
        </>
      )}
    </PageShell>
  );
}

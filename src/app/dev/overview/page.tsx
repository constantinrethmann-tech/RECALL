"use client";

import { OverviewList } from "@/components/Overview";
import type { Overview } from "@/lib/data";
import { DEFAULT_SETTINGS } from "@/lib/types";

/** Development only: the subject/unit list with sample data (no database). */
export default function DevOverviewPage() {
  if (process.env.NODE_ENV === "production") return <p className="p-8 text-mist">Only available in development.</p>;
  const topics = ["01 – Variables & types", "02 – Slicing", "03 – Loops"];
  const units = topics.flatMap((t, i) => [
    { id: `u${i}`, subject_id: "py", name: t, position: 2 * i + 1 },
    { id: `c${i}`, subject_id: "py", name: `${t} · Code`, position: 2 * i + 2 },
  ]);
  const data: Overview = {
    subjects: [{ id: "py", name: "Python Programming", position: 0 }],
    units,
    counts: new Map(units.map((u, i) => [u.id, { unit_id: u.id, total: 10 + i, new_count: 5, learning_count: 1, due_count: 2, seen_count: i, trouble_count: 0 }])),
    tags: new Map([["py", [{ subject_id: "py", tag: "flashcards", total: 30, new_count: 10, learning_count: 0, due_count: 3 }, { subject_id: "py", tag: "write-code", total: 9, new_count: 9, learning_count: 0, due_count: 0 }]]]),
    newLeft: new Map([["py", 20]]),
    newLeftTotal: 30,
    reviewedToday: 0,
    streak: 0,
    settings: DEFAULT_SETTINGS,
  };
  return (
    <div className="mx-auto max-w-md py-8">
      <OverviewList data={data} mode="learn" />
    </div>
  );
}

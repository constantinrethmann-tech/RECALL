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
  const microTopics = ["01 – Foundations and PPC", "02 – Elasticity", "04 – Behavioural Economics", "06 – Government Intervention"];
  const microUnits = microTopics.map((t, i) => ({ id: `m${i}`, subject_id: "mi", name: t, position: i + 1, rounds: i === 1 ? 1 : 0, round_started_at: i === 1 ? "2026-10-19T08:00:00Z" : null }));
  const midterm = new Map(
    microUnits.filter((u) => u.id !== "m2").map((u, i) => [u.id, { unit_id: u.id, total: 12 + i, new_count: 4, learning_count: 1, due_count: 3, seen_count: 6, trouble_count: 0 }]),
  );
  const data: Overview = {
    subjects: [
      { id: "py", name: "Python Programming", position: 0 },
      { id: "mi", name: "Microeconomics", position: 1 },
    ],
    units: [...units, ...microUnits],
    counts: new Map([...units, ...microUnits].map((u, i) => [u.id, { unit_id: u.id, total: 10 + i, new_count: 5, learning_count: 1, due_count: 2, seen_count: i, trouble_count: 0 }])),
    tags: new Map([["py", [{ subject_id: "py", tag: "flashcards", total: 30, new_count: 10, learning_count: 0, due_count: 3 }, { subject_id: "py", tag: "write-code", total: 9, new_count: 9, learning_count: 0, due_count: 0 }]],
      ["mi", [{ subject_id: "mi", tag: "midterm", total: 51, new_count: 12, learning_count: 3, due_count: 9 }, { subject_id: "mi", tag: "diagram", total: 20, new_count: 5, learning_count: 0, due_count: 2 }]],
    ]),
    sections: new Map([["midterm", midterm]]),
    roundDone: new Map([["m1", 3]]),
    newLeft: new Map([["py", 20], ["mi", 20]]),
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

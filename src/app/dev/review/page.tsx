"use client";

import { useState } from "react";
import { createEmptyCard } from "ts-fsrs";
import { ReviewSession, type ReviewPersistence } from "@/components/ReviewSession";
import { dayBounds } from "@/lib/day";
import { State } from "@/lib/fsrs";
import { planSession } from "@/lib/queue";
import type { StudyCard } from "@/lib/types";

/**
 * Development only: the review screen with sample cards and no database,
 * to check the layout, keyboard shortcuts and pictures. Open /recall/dev/review/ with `npm run dev`.
 */
export default function DevReviewPage() {
  if (process.env.NODE_ENV === "production") return <p className="p-8 text-mist">Only available in development.</p>;
  return <Preview />;
}

const TABLE = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420" font-family="Helvetica,Arial,sans-serif">
<rect width="900" height="420" fill="#fff"/><rect width="900" height="70" fill="#1f3a68"/>
<text x="30" y="45" font-size="28" fill="#fff" font-weight="bold">S.A. vs S.L.</text>
<g font-size="22" fill="#222"><text x="30" y="130">Minimum capital</text><text x="380" y="130">€60,000 (25% paid)</text><text x="680" y="130">€3,000*</text>
<text x="30" y="200">Shares</text><text x="380" y="200">acciones (free transfer)</text><text x="680" y="200">participaciones</text>
<text x="30" y="270">Governing law</text><text x="380" y="270">LSC</text><text x="680" y="270">LSC</text></g>
<text x="30" y="370" font-size="18" fill="#666">* Law 18/2022 allows €1 with safeguards.</text></svg>`;
const TABLE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(TABLE)}`;

function sample(id: string, state: State, dueInMinutes: number, fields: Partial<StudyCard>): StudyCard {
  const now = Date.now();
  return {
    id,
    subjectId: "s",
    unitId: "u",
    section: "A. S.A. vs S.L.",
    front: "",
    back: "",
    frontImage: null,
    backImage: null,
    tags: [],
    position: 0,
    ...fields,
    sched: {
      ...createEmptyCard(new Date(now)),
      state,
      due: new Date(now + dueInMinutes * 60_000),
      ...(state === State.Review
        ? { stability: 8, difficulty: 5, reps: 3, scheduled_days: 6, last_review: new Date(now - 6 * 86_400_000) }
        : {}),
    },
  };
}

const fakePersist: ReviewPersistence = {
  record: async (id) => {
    await new Promise((r) => setTimeout(r, 200));
    console.info("[dev] saved rating for", id);
    return `log-${id}-${Date.now()}`;
  },
  undo: async (logId) => console.info("[dev] undid", logId),
};

function Preview() {
  const [plan] = useState(() =>
    planSession(
      [
        sample("r1", State.Review, -60, {
          front: "Which body approves the annual accounts of an **S.L.**?",
          back: "The **General Meeting** (Junta General), within **6 months** of the financial year end (Art. 164 LSC).",
        }),
      ],
      [
        sample("n1", State.New, 0, {
          front: "Minimum share capital of an **S.L.**?",
          back: "**€3,000** (course).\nLaw 18/2022 allows €1 with safeguards.",
          backImage: "table",
        }),
        sample("n2", State.New, 0, {
          front: "Name the three features that distinguish an S.A. from an S.L.",
          back: "- **Capital**: €60,000 vs €3,000\n- **Shares**: *acciones* vs *participaciones*\n- **Transfer**: free vs restricted",
          section: "B. Share transfer",
        }),
        sample("n3", State.New, 0, { front: "What does this table compare?", frontImage: "table", back: "The two capital companies: **S.A.** and **S.L.**" }),
      ],
      100,
    ),
  );
  return (
    <ReviewSession
      title="Dev preview · Business Law I"
      initial={plan}
      dayEnd={dayBounds(new Date()).end}
      retention={0.9}
      describe={(c) => `Business Law I · Unit 03 · ${c.section}`}
      persist={fakePersist}
      loadImages={async (paths) => new Map(paths.map((p) => [p, TABLE_URL]))}
      onExit={() => location.reload()}
    />
  );
}

import { fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade } from "ts-fsrs";
import type { CardRow, ScheduleRow, StudyCard } from "./types";

export { Rating, State };
export type { Card, Grade };

/**
 * ts-fsrs with its default parameters and short-term learning steps (1m, 10m; relearning 10m).
 * Fuzz is on, as in Anki, so cards learned together don't stay clumped together.
 * `maximumInterval` caps the gap between two reviews (in days).
 */
export function makeScheduler(desiredRetention = 0.9, maximumInterval = 36500): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: desiredRetention,
      maximum_interval: maximumInterval,
      enable_fuzz: true,
      enable_short_term: true,
    }),
  );
}

export function rowToSchedule(r: ScheduleRow): Card {
  return {
    due: new Date(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    learning_steps: r.learning_steps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state as State,
    last_review: r.last_review ? new Date(r.last_review) : undefined,
  };
}

export function rowToStudyCard(r: CardRow): StudyCard {
  return {
    id: r.id,
    subjectId: r.subject_id,
    unitId: r.unit_id,
    section: r.section,
    front: r.front,
    back: r.back,
    frontImage: r.front_image,
    backImage: r.back_image,
    tags: r.tags ?? [],
    position: r.position,
    sched: rowToSchedule(r),
  };
}

export const isLearning = (c: Card) => c.state === State.Learning || c.state === State.Relearning;

/** Anki-style interval label: "1m", "10m", "3h", "4d", "1.5mo", "2y". */
export function formatInterval(from: Date, to: Date): string {
  const minutes = Math.max(0, (to.getTime() - from.getTime()) / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (days < 365) return `${trim(days / 30)}mo`;
  return `${trim(days / 365)}y`;
}

export const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: Rating.Again, label: "Again", key: "1" },
  { grade: Rating.Hard, label: "Hard", key: "2" },
  { grade: Rating.Good, label: "Good", key: "3" },
  { grade: Rating.Easy, label: "Easy", key: "4" },
];

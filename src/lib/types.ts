import type { Card } from "ts-fsrs";

export interface SubjectRow {
  id: string;
  name: string;
  position: number;
}

export interface UnitRow {
  id: string;
  subject_id: string;
  name: string;
  position: number;
}

/** The FSRS columns of a card row, as they come from the database. */
export interface ScheduleRow {
  state: number;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  last_review: string | null;
}

export interface CardRow extends ScheduleRow {
  id: string;
  subject_id: string;
  unit_id: string;
  section: string | null;
  front: string;
  back: string;
  front_image: string | null;
  back_image: string | null;
  tags: string[];
  position: number;
}

/** A card ready to be studied: content + its FSRS state. */
export interface StudyCard {
  id: string;
  subjectId: string;
  unitId: string;
  section: string | null;
  front: string;
  back: string;
  frontImage: string | null;
  backImage: string | null;
  tags: string[];
  position: number;
  sched: Card;
}

export interface Settings {
  desired_retention: number;
  new_per_day: number;
  max_reviews_per_day: number;
  day_starts_at: number;
}

export const DEFAULT_SETTINGS: Settings = {
  desired_retention: 0.9,
  new_per_day: 20,
  max_reviews_per_day: 200,
  day_starts_at: 4,
};

export interface UnitCounts {
  unit_id: string;
  total: number;
  new_count: number;
  learning_count: number;
  due_count: number;
  seen_count: number;
  trouble_count: number;
}

export interface TagCounts {
  subject_id: string;
  tag: string;
  total: number;
  new_count: number;
  learning_count: number;
  due_count: number;
}

export interface TodayCounts {
  subject_id: string | null;
  new_done: number;
  review_done: number;
  total_done: number;
}

/** What to study: everything, a subject, a unit, and/or only cards with a tag or only trouble cards. */
export interface Scope {
  subjectId?: string;
  unitId?: string;
  tag?: string;
  trouble?: boolean;
}

/** learn = normal FSRS reviews; cram = everything in the selection, random order, schedule untouched. */
export type StudyMode = "learn" | "cram";

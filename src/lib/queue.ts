import { isLearning, State } from "./fsrs";
import type { StudyCard } from "./types";

/** Like Anki: when nothing else is left, learning cards due within 20 minutes are shown early. */
export const LEARN_AHEAD_MS = 20 * 60_000;

/**
 * A study session: `learning` holds cards in (re)learning steps, shown when due;
 * `main` holds today's reviews mixed with new cards, shown in order.
 */
export interface SessionState {
  learning: StudyCard[];
  main: StudyCard[];
}

export interface NewCandidate {
  id: string;
  subjectId: string;
  unitId: string;
  position: number;
}

/** Picks today's new cards: in unit order, then card order, up to each subject's remaining limit. */
export function chooseNewCards(
  candidates: NewCandidate[],
  unitOrder: Map<string, number>,
  remainingBySubject: Map<string, number>,
): string[] {
  const sorted = [...candidates].sort(
    (a, b) =>
      (unitOrder.get(a.unitId) ?? 0) - (unitOrder.get(b.unitId) ?? 0) ||
      a.position - b.position ||
      a.id.localeCompare(b.id),
  );
  const left = new Map(remainingBySubject);
  const chosen: string[] = [];
  for (const c of sorted) {
    const n = left.get(c.subjectId) ?? 0;
    if (n <= 0) continue;
    left.set(c.subjectId, n - 1);
    chosen.push(c.id);
  }
  return chosen;
}

/** Spreads new cards evenly between reviews. */
export function interleave<T>(reviews: T[], fresh: T[]): T[] {
  const out: T[] = [];
  let r = 0;
  let n = 0;
  while (r < reviews.length || n < fresh.length) {
    const newProgress = (n + 1) / (fresh.length + 1);
    const reviewProgress = (r + 1) / (reviews.length + 1);
    if (n < fresh.length && (r >= reviews.length || newProgress < reviewProgress)) out.push(fresh[n++]);
    else out.push(reviews[r++]);
  }
  return out;
}

const byDue = (a: StudyCard, b: StudyCard) => a.sched.due.getTime() - b.sched.due.getTime();

/**
 * Builds the session from cards due today (learning + review) and today's chosen new cards.
 * Reviews are capped at `reviewLimit`. They are ordered by `priority` (lowest first): with FSRS that is
 * the chance you still remember the card, so the cards you're most likely to forget come first.
 * Without a priority, the most overdue come first.
 */
export function planSession(
  due: StudyCard[],
  fresh: StudyCard[],
  reviewLimit: number,
  priority?: (c: StudyCard) => number,
): SessionState {
  const learning = due.filter((c) => isLearning(c.sched)).sort(byDue);
  const reviews = due.filter((c) => c.sched.state === State.Review);
  if (priority) {
    const p = new Map(reviews.map((c) => [c.id, priority(c)]));
    reviews.sort((a, b) => p.get(a.id)! - p.get(b.id)! || byDue(a, b));
  } else reviews.sort(byDue);
  return { learning, main: interleave(reviews.slice(0, Math.max(0, reviewLimit)), fresh) };
}

/** Fisher–Yates shuffle (cram mode). */
export function shuffle<T>(items: T[], random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Cram: Again comes back 3 cards later, Hard 8 cards later, Good/Easy are done for this session. */
export function cramRequeue(s: SessionState, card: StudyCard, grade: number): SessionState {
  const main = s.main.filter((c) => c.id !== card.id);
  const gap = grade === 1 ? 3 : grade === 2 ? 8 : -1;
  if (gap > 0) main.splice(Math.min(gap, main.length), 0, card);
  return { learning: s.learning, main };
}

function earliest(cards: StudyCard[]): StudyCard | null {
  let best: StudyCard | null = null;
  for (const c of cards) if (!best || c.sched.due < best.sched.due) best = c;
  return best;
}

/** The next card to show, or null when nothing is available right now. */
export function pickNext(s: SessionState, now: Date): StudyCard | null {
  const learn = earliest(s.learning);
  if (learn && learn.sched.due <= now) return learn;
  if (s.main.length) return s.main[0];
  if (learn && learn.sched.due.getTime() - now.getTime() <= LEARN_AHEAD_MS) return learn;
  return null;
}

/** When the next learning card becomes available (for the "come back in 12 min" screen). */
export function nextLearningDue(s: SessionState): Date | null {
  return earliest(s.learning)?.sched.due ?? null;
}

/** Applies a rating: the card leaves the queue, and comes back later today if it is (re)learning. */
export function afterRating(s: SessionState, rated: StudyCard, dayEnd: Date): SessionState {
  const learning = s.learning.filter((c) => c.id !== rated.id);
  const main = s.main.filter((c) => c.id !== rated.id);
  if (isLearning(rated.sched) && rated.sched.due < dayEnd) learning.push(rated);
  return { learning, main };
}

export function sessionCounts(s: SessionState): { fresh: number; learning: number; review: number } {
  let fresh = 0;
  let review = 0;
  for (const c of s.main) {
    if (c.sched.state === State.New) fresh++;
    else review++;
  }
  return { fresh, learning: s.learning.length, review };
}

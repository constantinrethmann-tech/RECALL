/**
 * Recall speed as a memory signal (automatic, nothing is shown while you study).
 *
 * The time between seeing a question and tapping "Show answer" is your recall time. When you rate a
 * review card Good or Easy but needed much longer than usual, the memory is shakier than the button
 * says (Anki itself defines Hard as "recalled, but with hesitation"). So a slow Good is scored part of
 * the way towards Hard: the card comes back sooner and FSRS marks it as a bit harder. A slow Easy is
 * scored towards Good. The button intervals you see already include this, so they stay truthful.
 *
 * "Usually" means your own median recall time, corrected for the length of the question and for a
 * picture on the front. Pauses over 2 minutes, or when you switched away from the app, are ignored.
 */
import { Rating, State, type Card, type Grade, type RecordLogItem } from "ts-fsrs";

export const DEFAULT_THINK_MS = 7000;
/** Typical question length the baseline refers to. */
const REFERENCE_CHARS = 80;
const IGNORE_ABOVE_MS = 120_000;
const MIN_EXTRA_MS = 5000;
/** A slow Good moves at most this far from Good towards Hard. */
const MAX_TOWARDS_HARD = 0.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Your usual recall time, from past fluent recalls (Good/Easy on review cards), trusted more as data grows. */
export function baselineThinkMs(samples: number[]): number {
  const valid = samples.filter((ms) => ms > 300 && ms < IGNORE_ABOVE_MS).sort((a, b) => a - b);
  if (!valid.length) return DEFAULT_THINK_MS;
  const mid = Math.floor(valid.length / 2);
  const median = valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  const weight = valid.length / (valid.length + 10);
  return lerp(DEFAULT_THINK_MS, median, weight);
}

/** How long a fluent recall of this particular question should take. */
export function expectedThinkMs(baselineMs: number, frontText: string, hasFrontImage: boolean): number {
  const length = frontText.replace(/[*_`#>\-\s]+/g, " ").trim().length;
  const lengthFactor = clamp((length + REFERENCE_CHARS) / (2 * REFERENCE_CHARS), 0.8, 2.5);
  return baselineMs * lengthFactor + (hasFrontImage ? 4000 : 0);
}

/** 0 = normal speed … 1 = far slower than usual (1.5× expected → 0, 4× → 1). */
export function slowness(thinkMs: number, expectedMs: number, interrupted: boolean): number {
  if (interrupted || thinkMs > IGNORE_ABOVE_MS) return 0;
  if (thinkMs - expectedMs < MIN_EXTRA_MS) return 0;
  return clamp((thinkMs / expectedMs - 1.5) / 2.5, 0, 1);
}

type Outcomes = Record<Grade, RecordLogItem>;

/** An outcome part of the way (t = 0…1) from `from` to `to`; the log (what you pressed) stays `from`'s. */
function blend(from: RecordLogItem, to: RecordLogItem, t: number, now: Date): RecordLogItem {
  if (t <= 0) return from;
  const days = Math.max(to.card.scheduled_days, Math.round(lerp(from.card.scheduled_days, to.card.scheduled_days, t)));
  const card: Card = {
    ...from.card,
    stability: lerp(from.card.stability, to.card.stability, t),
    difficulty: lerp(from.card.difficulty, to.card.difficulty, t),
    scheduled_days: days,
    due: new Date(now.getTime() + days * 86_400_000),
  };
  return { card, log: from.log };
}

/**
 * Adjusts the four outcomes of a review for slowness. Only cards in the Review state are affected:
 * for new and learning cards the question is still being learned, so time says little.
 */
export function applySlowness(outcomes: Outcomes, previousState: State, s: number, now: Date): Outcomes {
  if (s <= 0 || previousState !== State.Review) return outcomes;
  const good = blend(outcomes[Rating.Good], outcomes[Rating.Hard], MAX_TOWARDS_HARD * s, now);
  const easy = blend(outcomes[Rating.Easy], good, Math.min(1, 1.5 * s), now);
  return { ...outcomes, [Rating.Good]: good, [Rating.Easy]: easy };
}

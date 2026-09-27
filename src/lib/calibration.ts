/**
 * Automatic memory check.
 *
 * FSRS predicts, for every card that comes back, how likely you are to still know it. Its default
 * parameters come from millions of Anki users, so your own memory may fade faster. This compares the
 * predictions with what really happened on your recent reviews and, if you forget more than predicted,
 * shortens every gap by the factor that makes the predictions fit you. It never makes gaps longer.
 *
 * The factor k scales how long memories last (k = 0.7 → gaps 30% shorter). It is applied by
 * scheduling with a slightly higher target retention, so FSRS itself still does all the scheduling.
 */
import { generatorParameters } from "ts-fsrs";

const W = generatorParameters().w;
/** FSRS-6 forgetting curve: R(t) = (1 + FACTOR · t / S) ^ DECAY */
export const DECAY = -W[20];
export const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

export const recall = (days: number, stability: number, k = 1) => Math.pow(1 + (FACTOR * days) / (k * stability), DECAY);

export interface ReviewOutcome {
  /** Days since the previous review. */
  days: number;
  /** FSRS stability before this review. */
  stability: number;
  recalled: boolean;
}

export interface MemoryCheck {
  /** Reviews the check is based on. */
  n: number;
  /** Share of those cards you actually remembered. */
  observed: number;
  /** Share FSRS expected you to remember. */
  predicted: number;
  /** Gap factor applied (1 = unchanged, 0.7 = 30% shorter). */
  k: number;
}

export const MIN_REVIEWS = 30;
/** How strongly a small number of reviews may move the factor (more reviews → more trust). */
const PRIOR_WEIGHT = 80;

/** Finds the factor that best explains your real results (maximum likelihood), trusted more as data grows. */
export function checkMemory(outcomes: ReviewOutcome[]): MemoryCheck {
  const data = outcomes.filter((o) => o.days >= 1 && o.stability > 0.01);
  const n = data.length;
  const observed = n ? data.filter((o) => o.recalled).length / n : 0;
  const predicted = n ? data.reduce((a, o) => a + recall(o.days, o.stability), 0) / n : 0;
  if (n < MIN_REVIEWS) return { n, observed, predicted, k: 1 };

  let best = 1;
  let bestLL = -Infinity;
  for (let k = 0.2; k <= 2.001; k += 0.01) {
    let ll = 0;
    for (const o of data) {
      const p = Math.min(0.9999, Math.max(0.0001, recall(o.days, o.stability, k)));
      ll += o.recalled ? Math.log(p) : Math.log(1 - p);
    }
    if (ll > bestLL) {
      bestLL = ll;
      best = k;
    }
  }
  const trust = n / (n + PRIOR_WEIGHT);
  const k = Math.min(1, Math.max(0.4, 1 + (best - 1) * trust));
  return { n, observed, predicted, k: Math.round(k * 100) / 100 };
}

/** The target retention that makes FSRS schedule k times the normal gap. */
export function effectiveRetention(target: number, k: number): number {
  if (k >= 1) return target;
  const r = Math.pow(1 + k * (Math.pow(target, 1 / DECAY) - 1), DECAY);
  return Math.min(0.97, Math.round(r * 1000) / 1000);
}

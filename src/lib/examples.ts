/**
 * Worked examples on flashcards: several per card, from simple to harder.
 * The more often you've reviewed a card, the harder the example you see, so you don't get used to one.
 */

/** Reviews per level: 0–3 → first example, 4–7 → second, 8+ → third, … */
export const REVIEWS_PER_LEVEL = 4;

export function exampleLevel(reps: number, count: number): number {
  if (count <= 0) return -1;
  return Math.min(count - 1, Math.floor(Math.max(0, reps) / REVIEWS_PER_LEVEL));
}

export const parseExamples = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length && v.every((x) => typeof x === "string") ? (v as string[]) : null;

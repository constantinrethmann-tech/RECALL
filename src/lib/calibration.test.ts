import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { checkMemory, effectiveRetention, recall, type ReviewOutcome } from "./calibration";
import { makeScheduler, Rating } from "./fsrs";
import { chooseNewCards } from "./queue";

/** Reviews of a student whose memories last `k` times as long as FSRS assumes. */
function student(k: number, n: number, seed = 3): ReviewOutcome[] {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, (_, i) => {
    const stability = [2, 5, 11, 25, 46][i % 5];
    const days = Math.max(1, Math.round(stability * (0.6 + rand())));
    return { days, stability, recalled: rand() < recall(days, stability, k) };
  });
}

describe("memory check", () => {
  it("matches the model's own forgetting curve", () => {
    const f = makeScheduler(0.9);
    const now = new Date("2026-10-01T10:00:00Z");
    let card = createEmptyCard(now);
    card = f.next(card, now, Rating.Good).card;
    card = f.next(card, card.due, Rating.Good).card;
    const later = new Date(card.due.getTime() + 5 * 86_400_000);
    const days = (later.getTime() - card.last_review!.getTime()) / 86_400_000;
    expect(recall(days, card.stability)).toBeCloseTo(f.get_retrievability(card, later, false), 2);
  });

  it("waits for enough reviews", () => {
    expect(checkMemory(student(0.5, 10)).k).toBe(1);
  });

  it("leaves gaps alone when you remember as predicted", () => {
    expect(checkMemory(student(1, 400)).k).toBeGreaterThanOrEqual(0.9);
  });

  it("shortens gaps when you forget faster, never lengthens them", () => {
    const fast = checkMemory(student(0.5, 400));
    expect(fast.observed).toBeLessThan(fast.predicted);
    expect(fast.k).toBeLessThan(0.75);
    expect(fast.k).toBeGreaterThanOrEqual(0.4);
    expect(checkMemory(student(1.8, 400)).k).toBe(1);
  });

  it("turns the factor into a target retention that shortens gaps by that much", () => {
    expect(effectiveRetention(0.9, 1)).toBe(0.9);
    const r = effectiveRetention(0.9, 0.7);
    expect(r).toBeGreaterThan(0.91);
    const card = { ...createEmptyCard(new Date("2026-10-01T00:00:00Z")), stability: 20, difficulty: 5, state: 2, reps: 3, last_review: new Date("2026-10-01T00:00:00Z") };
    const now = new Date("2026-10-21T00:00:00Z");
    const normal = makeScheduler(0.9, 36500).repeat(card, now)[Rating.Good].card.scheduled_days;
    const shorter = makeScheduler(r, 36500).repeat(card, now)[Rating.Good].card.scheduled_days;
    expect(shorter / normal).toBeGreaterThan(0.6);
    expect(shorter / normal).toBeLessThan(0.8);
  });

  it("caps gaps at the maximum", () => {
    const f = makeScheduler(0.9, 30);
    const card = { ...createEmptyCard(new Date("2026-10-01T00:00:00Z")), stability: 200, difficulty: 3, state: 2, reps: 6, last_review: new Date("2026-08-01T00:00:00Z") };
    const now = new Date("2026-10-01T00:00:00Z");
    for (const grade of [Rating.Hard, Rating.Good, Rating.Easy] as const) {
      const days = f.repeat(card, now)[grade].card.scheduled_days;
      expect(days).toBeLessThanOrEqual(30); // never more than the cap (fuzz may make it a day or two less)
      expect(days).toBeGreaterThanOrEqual(25);
    }
  });
});

describe("new cards across subjects", () => {
  it("shares the daily total fairly between subjects", () => {
    const c = (id: string, subjectId: string, position: number) => ({ id, subjectId, unitId: `u-${subjectId}`, position });
    const ids = chooseNewCards(
      [c("a1", "A", 1), c("a2", "A", 2), c("a3", "A", 3), c("b1", "B", 1), c("b2", "B", 2)],
      new Map([["u-A", 1], ["u-B", 1]]),
      new Map([["A", 20], ["B", 20]]),
      4,
    );
    expect(ids.sort()).toEqual(["a1", "a2", "b1", "b2"]);
  });
});

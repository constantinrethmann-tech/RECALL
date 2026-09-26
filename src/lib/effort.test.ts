import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { applySlowness, baselineThinkMs, DEFAULT_THINK_MS, expectedThinkMs, slowness } from "./effort";
import { makeScheduler, Rating, State, type Card } from "./fsrs";

const NOW = new Date("2026-10-20T10:00:00Z");

/** A card that has been in review for a while (last seen 11 days ago, due now). */
function reviewCard(): Card {
  const f = makeScheduler(0.9);
  let card = createEmptyCard(new Date("2026-10-01T10:00:00Z"));
  for (const t of ["2026-10-01T10:00:00Z", "2026-10-01T10:10:00Z", "2026-10-03T10:00:00Z"]) card = f.next(card, new Date(t), Rating.Good).card;
  return { ...card, due: NOW };
}

describe("baseline", () => {
  it("starts from a default and moves to your own median as reviews add up", () => {
    expect(baselineThinkMs([])).toBe(DEFAULT_THINK_MS);
    expect(baselineThinkMs([3000, 3000, 3000])).toBeGreaterThan(3000);
    expect(baselineThinkMs(Array(200).fill(4000))).toBeLessThan(4200);
    expect(baselineThinkMs([4000, 500_000])).toBeLessThan(DEFAULT_THINK_MS); // pauses ignored
  });

  it("expects longer questions and pictures to take longer", () => {
    const short = expectedThinkMs(6000, "Capital of an S.L.?", false);
    const long = expectedThinkMs(6000, "x".repeat(300), false);
    expect(long).toBeGreaterThan(short);
    expect(expectedThinkMs(6000, "Q?", true)).toBeGreaterThan(expectedThinkMs(6000, "Q?", false));
  });
});

describe("slowness", () => {
  it("is zero at normal speed and for distractions", () => {
    expect(slowness(8000, 7000, false)).toBe(0);
    expect(slowness(11_000, 7000, false)).toBe(0); // under 5 s extra
    expect(slowness(60_000, 7000, true)).toBe(0); // switched apps
    expect(slowness(200_000, 7000, false)).toBe(0); // walked away
  });
  it("grows with hesitation", () => {
    expect(slowness(17_500, 7000, false)).toBeCloseTo(0.4, 1);
    expect(slowness(40_000, 7000, false)).toBe(1);
  });
});

describe("applySlowness", () => {
  const f = makeScheduler(0.9);
  const card = reviewCard();
  const outcomes = f.repeat(card, NOW);

  it("brings a slow Good back sooner and marks it harder, but not below Hard", () => {
    const slow = applySlowness(outcomes, State.Review, 1, NOW);
    const good = outcomes[Rating.Good].card;
    const hard = outcomes[Rating.Hard].card;
    const slowGood = slow[Rating.Good].card;
    expect(slowGood.scheduled_days).toBeLessThan(good.scheduled_days);
    expect(slowGood.scheduled_days).toBeGreaterThanOrEqual(hard.scheduled_days);
    expect(slowGood.difficulty).toBeGreaterThan(good.difficulty);
    expect(slow[Rating.Good].log.rating).toBe(Rating.Good);
    expect(slow[Rating.Easy].card.scheduled_days).toBeLessThanOrEqual(good.scheduled_days);
    expect(slow[Rating.Again]).toBe(outcomes[Rating.Again]);
  });

  it("leaves normal-speed answers and new cards alone", () => {
    expect(applySlowness(outcomes, State.Review, 0, NOW)[Rating.Good]).toBe(outcomes[Rating.Good]);
    expect(applySlowness(outcomes, State.New, 1, NOW)[Rating.Good]).toBe(outcomes[Rating.Good]);
  });
});

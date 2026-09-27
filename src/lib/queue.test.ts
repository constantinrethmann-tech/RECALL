import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { dayBounds } from "./day";
import { formatInterval, makeScheduler, Rating, State } from "./fsrs";
import { afterRating, chooseNewCards, interleave, pickNext, planSession, sessionCounts } from "./queue";
import type { StudyCard } from "./types";

const NOW = new Date("2026-09-26T10:00:00");
const min = (m: number) => new Date(NOW.getTime() + m * 60_000);

function card(id: string, state: State, due: Date, extra: Partial<StudyCard> = {}): StudyCard {
  return {
    id,
    subjectId: "s1",
    unitId: "u1",
    section: null,
    front: id,
    back: id,
    frontImage: null,
    backImage: null,
    explain: null,
    tags: [],
    position: 0,
    sched: { ...createEmptyCard(NOW), state, due },
    ...extra,
  };
}

describe("dayBounds", () => {
  it("starts the day at 4:00", () => {
    const { start, end } = dayBounds(new Date("2026-09-26T10:00:00"));
    expect(start).toEqual(new Date("2026-09-26T04:00:00"));
    expect(end).toEqual(new Date("2026-09-27T04:00:00"));
  });
  it("counts 2 am as the previous day", () => {
    expect(dayBounds(new Date("2026-09-27T02:00:00")).start).toEqual(new Date("2026-09-26T04:00:00"));
  });
});

describe("formatInterval", () => {
  it("formats like Anki", () => {
    expect(formatInterval(NOW, min(1))).toBe("1m");
    expect(formatInterval(NOW, min(10))).toBe("10m");
    expect(formatInterval(NOW, min(180))).toBe("3h");
    expect(formatInterval(NOW, min(4 * 1440))).toBe("4d");
    expect(formatInterval(NOW, min(45 * 1440))).toBe("1.5mo");
    expect(formatInterval(NOW, min(730 * 1440))).toBe("2y");
  });
});

describe("FSRS scheduler", () => {
  it("gives a new card short learning steps and a multi-day Easy", () => {
    const preview = makeScheduler(0.9).repeat(createEmptyCard(NOW), NOW);
    expect(formatInterval(NOW, preview[Rating.Again].card.due)).toBe("1m");
    expect(formatInterval(NOW, preview[Rating.Good].card.due)).toBe("10m");
    expect(preview[Rating.Easy].card.state).toBe(State.Review);
    expect(preview[Rating.Easy].card.scheduled_days).toBeGreaterThanOrEqual(1);
    expect(preview[Rating.Good].log.state).toBe(State.New); // log keeps the state before the review
  });
});

describe("chooseNewCards", () => {
  it("respects unit order and each subject's daily limit", () => {
    const ids = chooseNewCards(
      [
        { id: "b1", subjectId: "s1", unitId: "u2", position: 0 },
        { id: "a2", subjectId: "s1", unitId: "u1", position: 1 },
        { id: "a1", subjectId: "s1", unitId: "u1", position: 0 },
        { id: "x1", subjectId: "s2", unitId: "u9", position: 0 },
      ],
      new Map([["u1", 1], ["u2", 2], ["u9", 1]]),
      new Map([["s1", 2], ["s2", 0]]),
    );
    expect(ids).toEqual(["a1", "a2"]);
  });
});

describe("interleave", () => {
  it("spreads new cards evenly among reviews", () => {
    expect(interleave(["r1", "r2", "r3", "r4"], ["n1"])).toEqual(["r1", "r2", "n1", "r3", "r4"]);
    expect(interleave([], ["n1", "n2"])).toEqual(["n1", "n2"]);
    expect(interleave(["r1"], [])).toEqual(["r1"]);
  });
});

describe("session", () => {
  const end = dayBounds(NOW).end;

  it("caps reviews, most overdue first", () => {
    const due = [card("r-late", State.Review, min(-10)), card("r-early", State.Review, min(-1000)), card("r3", State.Review, min(-5))];
    const s = planSession(due, [], 2);
    expect(s.main.map((c) => c.id)).toEqual(["r-early", "r-late"]);
  });

  it("shows due learning cards first, then the main queue, then learns ahead", () => {
    const s = planSession(
      [card("l-due", State.Learning, min(-1)), card("l-soon", State.Learning, min(5)), card("r1", State.Review, min(-60))],
      [card("n1", State.New, NOW)],
      100,
    );
    expect(pickNext(s, NOW)?.id).toBe("l-due");
    const noDueLearning = { ...s, learning: s.learning.filter((c) => c.id !== "l-due") };
    expect(pickNext(noDueLearning, NOW)?.id).toBe("r1");
    expect(pickNext({ ...noDueLearning, main: [] }, NOW)?.id).toBe("l-soon"); // within 20 min
    expect(pickNext({ learning: [card("l-far", State.Learning, min(45))], main: [] }, NOW)).toBeNull();
  });

  it("brings a failed card back later today and drops a graduated one", () => {
    const s = planSession([card("r1", State.Review, min(-60))], [card("n1", State.New, NOW)], 100);
    const failed = { ...s.main[0], sched: { ...s.main[0].sched, state: State.Relearning, due: min(10) } };
    const s2 = afterRating(s, failed, end);
    expect(sessionCounts(s2)).toEqual({ fresh: 1, learning: 1, review: 0 });
    const graduated = { ...failed, sched: { ...failed.sched, state: State.Review, due: min(3 * 1440) } };
    expect(sessionCounts(afterRating(s2, graduated, end))).toEqual({ fresh: 1, learning: 0, review: 0 });
  });
});

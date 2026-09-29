import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { State } from "./fsrs";
import { cramRequeue, planSession, shuffle } from "./queue";
import { scopeFromParams, studyHref } from "./scope";
import { computeStreak } from "./streak";
import { sortTags, tagLabel } from "./tags";
import type { StudyCard } from "./types";

const card = (id: string, state = State.Review, due = new Date("2026-10-01T00:00:00Z")): StudyCard => ({
  id,
  subjectId: "s",
  unitId: "u",
  section: null,
  front: id,
  back: id,
  frontImage: null,
  backImage: null,
  explain: null,
  drill: null,
  examples: null,
  tags: [],
  position: 0,
  sched: { ...createEmptyCard(due), state, due },
});

describe("tags", () => {
  it("reads nicely and sorts exam, then case studies", () => {
    expect(tagLabel("case-study-1")).toBe("Case study 1");
    expect(sortTags(["zeta", "case-study-10", "case-study-2", "exam"])).toEqual(["exam", "case-study-2", "case-study-10", "zeta"]);
  });
});

describe("scope links", () => {
  it("round-trips through the URL", () => {
    const href = studyHref({ subjectId: "s1", tag: "exam", trouble: true }, "cram");
    const { scope, mode } = scopeFromParams(new URLSearchParams(href.split("?")[1]));
    expect(scope).toEqual({ subjectId: "s1", tag: "exam", trouble: true });
    expect(mode).toBe("cram");
    expect(studyHref({})).toBe("/study/");
  });
});

describe("review order", () => {
  it("puts the cards you're most likely to forget first", () => {
    const r = { a: 0.95, b: 0.6, c: 0.8 } as Record<string, number>;
    const s = planSession([card("a"), card("b"), card("c")], [], 10, (c) => r[c.id]);
    expect(s.main.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });
});

describe("cram", () => {
  it("brings Again back soon and drops Good", () => {
    const s = { learning: [], main: ["a", "b", "c", "d", "e"].map((id) => card(id)) };
    expect(cramRequeue(s, s.main[0], 1).main.map((c) => c.id)).toEqual(["b", "c", "d", "a", "e"]);
    expect(cramRequeue(s, s.main[0], 3).main.map((c) => c.id)).toEqual(["b", "c", "d", "e"]);
  });
  it("shuffles without losing cards", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(items).sort((a, b) => a - b)).toEqual(items);
  });
});

describe("streak", () => {
  it("counts consecutive days and survives until the day is over", () => {
    expect(computeStreak(["2026-10-05", "2026-10-04", "2026-10-03", "2026-10-01"], "2026-10-05")).toBe(3);
    expect(computeStreak(["2026-10-04", "2026-10-03"], "2026-10-05")).toBe(2);
    expect(computeStreak(["2026-10-02"], "2026-10-05")).toBe(0);
  });
});

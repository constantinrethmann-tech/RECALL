import { describe, expect, it } from "vitest";
import { cleanTyping, compareRuns, newlineIndent, normalizeOutput, parseDrill, pickVariant, suggestedGrade, type RunResult } from "./drill";
import { parseDeck } from "./import/deck";

const run = (stdout: string, values: Record<string, string | null> = {}): RunResult => ({ stdout, error: null, values });

describe("parseDrill", () => {
  it("accepts variants and rejects broken ones", () => {
    const ok = parseDrill({ hints: ["h"], variants: [{ prompt: "p", setup: ["x = 1"], solution: ["print(x)"] }] });
    expect(typeof ok).toBe("object");
    expect(parseDrill({ variants: [{ prompt: "p", solution: [] }] })).toMatch(/solution/);
    expect(parseDrill({ variants: [{ solution: ["x"] }] })).toMatch(/prompt/);
  });

  it("imports a code card with front/back filled in from the exercise", () => {
    const { deck, errors } = parseDeck({
      format: "recall-v1",
      subject: "Python",
      cards: [{ id: "d1", unit: "Loops", kind: "code", code: { variants: [{ prompt: "Print 1", setup: [], solution: ["print(1)"] }] } }],
    });
    expect(errors).toEqual([]);
    expect(deck!.cards[0].front).toBe("Print 1");
    expect(deck!.cards[0].back).toContain("print(1)");
    expect(deck!.cards[0].drill?.variants).toHaveLength(1);
  });
});

describe("compareRuns", () => {
  it("ignores spacing but not content", () => {
    expect(compareRuns(run("Total: 3\n"), run("Total:  3")).ok).toBe(true);
    expect(compareRuns(run("Total: 3"), run("Total:3")).ok).toBe(true);
    expect(compareRuns(run("3"), run("4")).ok).toBe(false);
    expect(compareRuns(run("Hello"), run("hello")).ok).toBe(false);
  });

  it("compares variables when asked", () => {
    expect(compareRuns(run("", { grade: "'B'" }), run("anything", { grade: "'B'" }), ["grade"]).ok).toBe(true);
    expect(compareRuns(run("", { grade: "'B'" }), run("", { grade: null }), ["grade"]).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("normalizes output", () => expect(normalizeOutput("  a   b \n\n")).toBe("a b"));
  it("indents after a colon", () => {
    expect(newlineIndent("for c in s:", 11)).toBe("    ");
    expect(newlineIndent("    x = 1", 9)).toBe("    ");
  });
  it("fixes curly quotes", () => expect(cleanTyping("print(“hi”)")).toBe('print("hi")'));
  it("never repeats the last variant", () => {
    for (let r = 0; r < 1; r += 0.1) expect(pickVariant(3, 1, () => r)).not.toBe(1);
    expect(pickVariant(1, 0)).toBe(0);
  });
  it("suggests a rating", () => {
    expect(suggestedGrade({ solved: true, hintsUsed: 0 })).toBe(3);
    expect(suggestedGrade({ solved: true, hintsUsed: 2 })).toBe(2);
    expect(suggestedGrade({ solved: false, hintsUsed: 0 })).toBe(1);
  });
});

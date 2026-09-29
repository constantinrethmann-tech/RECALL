import { describe, expect, it } from "vitest";
import { exampleLevel } from "./examples";
import { parseDeck } from "./import/deck";

describe("worked examples", () => {
  it("get harder with more reviews, never past the last one", () => {
    expect([0, 3, 4, 7, 8, 50].map((r) => exampleLevel(r, 3))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(exampleLevel(10, 1)).toBe(0);
    expect(exampleLevel(0, 0)).toBe(-1);
  });

  it("are read from a deck file", () => {
    const { deck } = parseDeck({ format: "recall-v1", subject: "P", cards: [{ id: "a", unit: "U", front: "q", back: "a", examples: ["one", "two"] }, { id: "b", unit: "U", front: "q", back: "a" }] });
    expect(deck!.cards.map((c) => c.examples)).toEqual([["one", "two"], null]);
  });
});

import { describe, expect, it } from "vitest";
import { checkDump, hasWord, indexText, keyTerms, normalizeNumber } from "./braindump";

describe("key terms", () => {
  it("takes bold phrases, numbers, law and article references", () => {
    const terms = keyTerms("**€3,000** (course). Law 18/2022 allows €1 with safeguards. See **Art. 58** and the **General Meeting**.");
    const labels = terms.map((t) => `${t.kind}:${t.parts.join(" ")}`);
    expect(labels).toContain("number:18/2022");
    expect(labels).toContain("number:3000");
    expect(labels).toContain("article:58");
    expect(labels).toContain("phrase:general meeting");
  });

  it("falls back to important words when nothing is bold", () => {
    const terms = keyTerms("The shareholders approve the accounts within six months.");
    expect(terms.map((t) => t.parts[0])).toEqual(["shareholders", "approve", "accounts", "within", "months"]);
  });

  it("normalizes numbers", () => {
    expect(normalizeNumber("3,000")).toBe("3000");
    expect(normalizeNumber("3.000")).toBe("3000");
    expect(normalizeNumber("0,5")).toBe("0.5");
    expect(normalizeNumber("25%")).toBe("25");
  });
});

describe("matching", () => {
  it("ignores case, accents, typos and word endings", () => {
    const idx = indexText("La Junta general aprueba las cuentas; incorporated in Spain, sharehlders meet");
    expect(hasWord(idx, "junta")).toBe(true);
    expect(hasWord(idx, "incorporation")).toBe(true);
    expect(hasWord(idx, "shareholders")).toBe(true);
    expect(hasWord(idx, "capital")).toBe(false);
  });

  it("scores covered and missed cards", () => {
    const cards = [
      { id: "sl", back: "**€3,000** (course). Law 18/2022 allows €1." },
      { id: "sa", back: "**€60,000**, at least **25%** paid in." },
      { id: "art", back: "Regulated in **Art. 164** LSC by the **General Meeting**." },
      { id: "pic", back: "" },
    ];
    const res = checkDump(cards, "An SL needs 3.000 euros (law 18/2022). Art 164: the general meeting approves.");
    expect(res.covered.map((c) => c.id)).toEqual(["sl", "art"]);
    expect(res.missed.map((c) => c.id)).toEqual(["sa"]);
    expect(res.unchecked.map((c) => c.id)).toEqual(["pic"]);
    expect(res.score).toBeCloseTo(2 / 3);
  });
});

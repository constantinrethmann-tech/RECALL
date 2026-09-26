import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { normalizeTags, parseDeck } from "./deck";
import { readDeckFile } from "./zip";

const spec = {
  format: "recall-v1",
  subject: "Business Law I",
  units: [{ name: "Unit 03 – Capital Companies: Incorporation", order: 3 }],
  cards: [
    {
      id: "bl1-u03-min-capital-sl",
      unit: "Unit 03 – Capital Companies: Incorporation",
      section: "A. S.A. vs S.L.",
      front: "Minimum share capital of an **S.L.**?",
      back: "**€3,000** (course). Law 18/2022 allows €1 with safeguards.",
      front_image: null,
      back_image: "images/sa-vs-sl-table.png",
      tags: ["exam", "case-study-1"],
      source: "Unit 3 slides",
    },
  ],
};

describe("parseDeck", () => {
  it("accepts the example from the spec", () => {
    const { deck, errors, warnings } = parseDeck(spec, (p) => (p === "images/sa-vs-sl-table.png" ? p : null));
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(deck?.subject).toBe("Business Law I");
    expect(deck?.cards[0]).toMatchObject({ section: "A. S.A. vs S.L.", backImage: "images/sa-vs-sl-table.png", tags: ["exam", "case-study-1"] });
  });

  it("blocks duplicate ids and empty cards", () => {
    const bad = { ...spec, cards: [spec.cards[0], spec.cards[0], { id: "x", unit: "U", front: "", back: "b" }] };
    const { deck, errors } = parseDeck(bad, (p) => p);
    expect(deck).toBeNull();
    expect(errors.join(" ")).toMatch(/used twice/);
    expect(errors.join(" ")).toMatch(/empty front/);
  });

  it("imports without a missing picture, with a warning", () => {
    const { deck, warnings } = parseDeck(spec, () => null);
    expect(deck?.cards[0].backImage).toBeNull();
    expect(warnings[0]).toMatch(/not in the zip/);
  });

  it("adds units that are missing from the list", () => {
    const { deck, warnings } = parseDeck({ ...spec, units: [], cards: [{ ...spec.cards[0], back_image: null }] });
    expect(deck?.units).toEqual([{ name: spec.cards[0].unit, order: 1 }]);
    expect(warnings[0]).toMatch(/isn't in the "units" list/);
  });

  it("rejects other formats", () => {
    expect(parseDeck({ ...spec, format: "anki" }).errors[0]).toMatch(/Unknown format/);
  });

  it("cleans tags", () => {
    expect(normalizeTags(["Exam", " case study 1 ", "exam"])).toEqual(["exam", "case-study-1"]);
    expect(normalizeTags("exam, midterm")).toEqual(["exam", "midterm"]);
  });
});

describe("readDeckFile", () => {
  it("finds cards.json and pictures inside a zipped folder", async () => {
    const zip = new JSZip();
    zip.file("Unit3/cards.json", JSON.stringify(spec));
    zip.file("Unit3/images/SA-vs-SL-table.png", new Uint8Array([137, 80, 78, 71]));
    zip.file("__MACOSX/Unit3/._cards.json", "junk");
    const blob = new Blob([await zip.generateAsync({ type: "arraybuffer" })]);
    const { result, readImage } = await readDeckFile(blob, "unit3.zip");
    expect(result.errors).toEqual([]);
    const path = result.deck!.cards[0].backImage!;
    expect(path).toBe("images/SA-vs-SL-table.png");
    expect((await readImage(path)).type).toBe("image/png");
  });
});

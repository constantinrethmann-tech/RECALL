/**
 * Reading and checking a "recall-v1" deck (cards.json). Pure functions, no network.
 */

export const DECK_FORMAT = "recall-v1";

export interface DeckUnit {
  name: string;
  order: number;
}

export interface DeckCard {
  id: string;
  unit: string;
  section: string | null;
  front: string;
  back: string;
  /** Resolved path of the picture inside the zip, or null. */
  frontImage: string | null;
  backImage: string | null;
  tags: string[];
  source: string | null;
  /** Position in the file: new cards are studied in this order. */
  index: number;
}

export interface Deck {
  subject: string;
  units: DeckUnit[];
  cards: DeckCard[];
}

export interface ParseResult {
  deck: Deck | null;
  /** Problems that block the import. */
  errors: string[];
  /** Things that were fixed automatically; the import can go ahead. */
  warnings: string[];
}

/** "./images\\a.png" → "images/a.png" */
export function normalizePath(p: string): string {
  return p
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "");
}

export function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  const tags = raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean);
  return [...new Set(tags)];
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const optText = (v: unknown): string | null => text(v) || null;
const MAX_ERRORS = 25;

/**
 * @param resolveImage maps an image path from cards.json to the file inside the zip
 *                     (or null if it isn't there). Omit when importing a bare cards.json.
 */
export function parseDeck(raw: unknown, resolveImage?: (path: string) => string | null): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (msg: string): ParseResult => ({ deck: null, errors: [msg], warnings });

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("cards.json is not a JSON object.");
  const obj = raw as Record<string, unknown>;

  if (obj.format === undefined) warnings.push(`No "format" field; assuming "${DECK_FORMAT}".`);
  else if (obj.format !== DECK_FORMAT) return fail(`Unknown format "${String(obj.format)}" (expected "${DECK_FORMAT}").`);

  const subject = text(obj.subject);
  if (!subject) return fail('Missing "subject" (e.g. "Business Law I").');
  if (!Array.isArray(obj.cards) || obj.cards.length === 0) return fail('No cards found ("cards" is empty or missing).');

  // Units listed at the top of the file.
  const units = new Map<string, DeckUnit>();
  if (Array.isArray(obj.units)) {
    obj.units.forEach((u, i) => {
      const name = text((u as Record<string, unknown>)?.name);
      if (!name) {
        warnings.push(`Unit #${i + 1} has no name and was skipped.`);
        return;
      }
      const order = Number((u as Record<string, unknown>).order);
      units.set(name, { name, order: Number.isFinite(order) ? order : i + 1 });
    });
  }
  const nextOrder = () => Math.max(0, ...[...units.values()].map((u) => u.order)) + 1;

  const seen = new Set<string>();
  const cards: DeckCard[] = [];
  const addError = (msg: string) => {
    if (errors.length < MAX_ERRORS) errors.push(msg);
    else if (errors.length === MAX_ERRORS) errors.push("…and more problems.");
  };

  obj.cards.forEach((c, i) => {
    const label = `Card #${i + 1}`;
    if (!c || typeof c !== "object") return addError(`${label} is not an object.`);
    const card = c as Record<string, unknown>;

    const id = text(card.id);
    if (!id) return addError(`${label} has no "id".`);
    if (seen.has(id)) return addError(`${label}: the id "${id}" is used twice in this file.`);
    seen.add(id);

    let unit = text(card.unit);
    if (!unit) {
      unit = "Unsorted";
      warnings.push(`"${id}" has no unit; it goes into "Unsorted".`);
    }
    if (!units.has(unit)) {
      units.set(unit, { name: unit, order: nextOrder() });
      if (unit !== "Unsorted") warnings.push(`Unit "${unit}" isn't in the "units" list; it was added.`);
    }

    const image = (field: "front_image" | "back_image"): string | null => {
      const value = card[field];
      if (value === null || value === undefined || value === "") return null;
      if (typeof value !== "string") {
        warnings.push(`"${id}": ${field} is not a path and was ignored.`);
        return null;
      }
      const resolved = resolveImage ? resolveImage(normalizePath(value)) : null;
      if (!resolved) warnings.push(`"${id}": picture "${value}" is not in the zip; the card is imported without it.`);
      return resolved;
    };

    const front = typeof card.front === "string" ? card.front.trim() : "";
    const back = typeof card.back === "string" ? card.back.trim() : "";
    const frontImage = image("front_image");
    const backImage = image("back_image");
    if (!front && !frontImage) return addError(`"${id}" has an empty front.`);
    if (!back && !backImage) return addError(`"${id}" has an empty back.`);

    cards.push({
      id,
      unit,
      section: optText(card.section),
      front,
      back,
      frontImage,
      backImage,
      tags: normalizeTags(card.tags),
      source: optText(card.source),
      index: i,
    });
  });

  if (errors.length) return { deck: null, errors, warnings };
  const usedUnits = new Set(cards.map((c) => c.unit));
  return {
    deck: {
      subject,
      units: [...units.values()].filter((u) => usedUnits.has(u.name)).sort((a, b) => a.order - b.order),
      cards,
    },
    errors,
    warnings,
  };
}

/**
 * Brain dump check (free, no AI): does your text contain the key terms of each card's answer?
 * Key terms = bold phrases, numbers (€3,000 · 25% · 18/2022) and article references (Art. 58).
 * Matching ignores case and accents and allows small typos and word endings.
 */

const STOPWORDS = new Set(
  (
    "a an and are as at be by for from has have in is it its of on or that the to was were will with which who what when where why how not no " +
    "this these those than then there their they them can may must should would could also only more most less very into over under about " +
    "el la los las un una unos unas y o de del al en con por para que es son se su sus lo como mas pero sin sobre entre ya le les"
  ).split(" "),
);

/** Lowercase, no accents, markdown symbols removed. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[*_`#>~|[\]()]/g, " ");
}

const words = (text: string) => normalize(text).match(/[a-z0-9]+/g) ?? [];
const significant = (text: string) => words(text).filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

/** "3,000" / "3.000" → "3000"; "0,5" → "0.5"; "25 %" → "25". */
export function normalizeNumber(raw: string): string {
  const n = raw.replace(/[€$%\s]/g, "");
  return n.replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", ".");
}

const LAW_REF = /\b\d{1,4}\/\d{2,4}\b/g;
const ARTICLE = /\b(?:art(?:iculo|icle|s)?\.?|§)\s*(\d+(?:\.\d+)?[a-z]?)/g;
const NUMBER = /\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;

function extractRefs(text: string): { laws: string[]; articles: string[]; numbers: string[] } {
  let t = normalize(text);
  const laws = t.match(LAW_REF) ?? [];
  t = t.replace(LAW_REF, " ");
  const articles = [...t.matchAll(ARTICLE)].map((m) => m[1]);
  t = t.replace(ARTICLE, " ");
  const numbers = (t.match(NUMBER) ?? []).map(normalizeNumber);
  return { laws, articles, numbers };
}

export type TermKind = "phrase" | "number" | "article" | "word";

export interface KeyTerm {
  label: string;
  kind: TermKind;
  /** phrase/word: the words to find; number/article: the normalized value. */
  parts: string[];
}

export function keyTerms(answer: string): KeyTerm[] {
  const terms: KeyTerm[] = [];
  const seen = new Set<string>();
  const add = (t: KeyTerm) => {
    const key = `${t.kind}:${t.parts.join(" ")}`;
    if (t.parts.length && !seen.has(key)) {
      seen.add(key);
      terms.push(t);
    }
  };

  const refs = extractRefs(answer);
  for (const law of refs.laws) add({ label: law, kind: "number", parts: [law] });
  for (const a of refs.articles) add({ label: `Art. ${a}`, kind: "article", parts: [a] });
  for (const n of refs.numbers) add({ label: n, kind: "number", parts: [n] });

  for (const m of answer.matchAll(/\*\*(.+?)\*\*|__(.+?)__/g)) {
    const phrase = (m[1] ?? m[2]).trim();
    const w = significant(phrase);
    if (w.length) add({ label: phrase, kind: "phrase", parts: w });
  }

  if (!terms.length) {
    for (const w of significant(answer).filter((x) => x.length >= 5).slice(0, 6)) add({ label: w, kind: "word", parts: [w] });
  }
  return terms;
}

export interface TextIndex {
  words: Set<string>;
  byFirst: Map<string, string[]>;
  numbers: Set<string>;
  articles: Set<string>;
}

export function indexText(text: string): TextIndex {
  const all = words(text);
  const byFirst = new Map<string, string[]>();
  for (const w of new Set(all)) byFirst.set(w[0], [...(byFirst.get(w[0]) ?? []), w]);
  const refs = extractRefs(text);
  return { words: new Set(all), byFirst, numbers: new Set([...refs.numbers, ...refs.laws]), articles: new Set(refs.articles) };
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Exact, or (for longer words) a small typo or a different ending: "incorporation" ≈ "incorporated". */
export function hasWord(index: TextIndex, word: string): boolean {
  if (index.words.has(word)) return true;
  if (word.length <= 4) return index.words.has(`${word}s`) || (word.endsWith("s") && index.words.has(word.slice(0, -1)));
  for (const w of index.byFirst.get(word[0]) ?? []) {
    if (Math.abs(w.length - word.length) > 4) continue;
    const common = Math.min(w.length, word.length, 7);
    if (common >= 6 && w.slice(0, common) === word.slice(0, common)) return true;
    if (Math.abs(w.length - word.length) <= 2 && 1 - levenshtein(w, word) / Math.max(w.length, word.length) >= 0.8) return true;
  }
  return false;
}

export function termFound(term: KeyTerm, index: TextIndex): boolean {
  if (term.kind === "number") return index.numbers.has(term.parts[0]);
  if (term.kind === "article") return index.articles.has(term.parts[0]);
  const hits = term.parts.filter((w) => hasWord(index, w)).length;
  return hits >= Math.max(1, Math.ceil(term.parts.length / 2));
}

export interface CardCheck {
  id: string;
  terms: KeyTerm[];
  found: KeyTerm[];
  missing: KeyTerm[];
  covered: boolean;
}

export interface DumpResult {
  checks: CardCheck[];
  covered: CardCheck[];
  missed: CardCheck[];
  /** Cards without text to check (e.g. picture-only answers). */
  unchecked: CardCheck[];
  /** 0…1 over the checkable cards. */
  score: number;
}

/** A card counts as covered when at least half of its key terms appear in your text. */
export function checkDump(cards: { id: string; back: string }[], text: string): DumpResult {
  const index = indexText(text);
  const checks = cards.map<CardCheck>((c) => {
    const terms = keyTerms(c.back);
    const found = terms.filter((t) => termFound(t, index));
    return {
      id: c.id,
      terms,
      found,
      missing: terms.filter((t) => !found.includes(t)),
      covered: terms.length > 0 && found.length >= Math.max(1, Math.ceil(terms.length / 2)),
    };
  });
  const checkable = checks.filter((c) => c.terms.length);
  const covered = checkable.filter((c) => c.covered);
  return {
    checks,
    covered,
    missed: checkable.filter((c) => !c.covered),
    unchecked: checks.filter((c) => !c.terms.length),
    score: checkable.length ? covered.length / checkable.length : 0,
  };
}

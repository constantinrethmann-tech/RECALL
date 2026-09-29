/**
 * Code drills: a card where you type a short program instead of recalling an answer.
 * Your code is run (Python in the browser) and its result is compared with the model solution's.
 * Pure functions here; running happens in python.ts.
 */

/** Other values the code is also run with, so an answer only counts if it works in general. */
export interface DrillCase {
  setup: string[];
  /** What input() returns, in order. */
  inputs?: string[];
}

/** One version of the exercise. A drill has several, and a different one is shown each time. */
export interface DrillVariant {
  prompt: string;
  /** Given lines, shown above the editor and run before your code. */
  setup: string[];
  inputs?: string[];
  solution: string[];
  hints?: string[];
  tests?: DrillCase[];
  /** Compare these variables instead of the printed output. */
  check?: string[];
}

export interface CodeDrill {
  variants: DrillVariant[];
  /** Used when a variant has no hints of its own. */
  hints: string[];
}

const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null);

/** Checks a drill from a deck file (or the database). Returns the drill or a problem description. */
export function parseDrill(raw: unknown): CodeDrill | string {
  if (!raw || typeof raw !== "object") return 'missing "code" (the exercise)';
  const obj = raw as Record<string, unknown>;
  const rawVariants = Array.isArray(obj.variants) ? obj.variants : [obj];
  const variants: DrillVariant[] = [];
  for (const [i, v] of rawVariants.entries()) {
    const r = (v ?? {}) as Record<string, unknown>;
    const prompt = typeof r.prompt === "string" ? r.prompt.trim() : "";
    const solution = strings(r.solution);
    if (!prompt) return `variant ${i + 1} has no "prompt"`;
    if (!solution?.length) return `variant ${i + 1} has no "solution" lines`;
    const tests = Array.isArray(r.tests)
      ? r.tests.map((t) => ({ setup: strings((t as Record<string, unknown>)?.setup) ?? [], inputs: strings((t as Record<string, unknown>)?.inputs) ?? undefined }))
      : undefined;
    variants.push({
      prompt,
      setup: strings(r.setup) ?? [],
      inputs: strings(r.inputs) ?? undefined,
      solution,
      hints: strings(r.hints) ?? undefined,
      tests,
      check: strings(r.check) ?? undefined,
    });
  }
  if (!variants.length) return 'no "variants"';
  return { variants, hints: strings(obj.hints) ?? [] };
}

/** A random variant, if possible not the one shown last time. */
export function pickVariant(count: number, last: number | null, random = Math.random): number {
  if (count <= 1) return 0;
  const i = Math.floor(random() * (count - 1));
  return last !== null && last >= 0 && last < count && i >= last ? i + 1 : i;
}

export const joinLines = (lines: string[]) => lines.join("\n");
export const solutionMarkdown = (v: DrillVariant) => "```python\n" + joinLines(v.solution) + "\n```";
export const hintsFor = (drill: CodeDrill, v: DrillVariant) => (v.hints?.length ? v.hints : drill.hints);

// ─── Comparing results ─────────────────────────────────────────────────────────

export interface RunError {
  type: string;
  message: string;
  /** Line in your code (1-based), if the error happened there. */
  line: number | null;
}

export interface RunResult {
  stdout: string;
  error: RunError | null;
  /** repr() of the checked variables (null = not defined). */
  values: Record<string, string | null>;
}

/** Printed output with irrelevant spacing removed. */
export function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

export type Verdict = { ok: true; note?: string } | { ok: false; expected: string; actual: string };

/** Your run vs the model solution's run on the same values. */
export function compareRuns(model: RunResult, yours: RunResult, check?: string[]): Verdict {
  if (check?.length) {
    const show = (r: RunResult) => check.map((n) => `${n} = ${r.values[n] ?? "(not defined)"}`).join("\n");
    const same = check.every((n) => yours.values[n] != null && yours.values[n] === model.values[n]);
    return same ? { ok: true } : { ok: false, expected: show(model), actual: show(yours) };
  }
  const a = normalizeOutput(model.stdout);
  const b = normalizeOutput(yours.stdout);
  if (a === b) return { ok: true };
  // Only spacing differs ("Total:3" vs "Total: 3") → still right.
  if (a.replace(/\s+/g, "") === b.replace(/\s+/g, "")) return { ok: true, note: "Right. Only the spacing of your output differs from the model." };
  return { ok: false, expected: a, actual: b };
}

/** Rating suggested after a drill: no hints → Good (3), hints → Hard (2), gave up → Again (1). */
export function suggestedGrade(result: { solved: boolean; hintsUsed: number }): 1 | 2 | 3 {
  if (!result.solved) return 1;
  return result.hintsUsed > 0 ? 2 : 3;
}

// ─── Editing helpers (plain text + cursor) ─────────────────────────────────────

export const INDENT = "    ";

/** Leading spaces of the line the cursor is on, plus one level after a line ending in ":". */
export function newlineIndent(text: string, cursor: number): string {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  const line = text.slice(lineStart, cursor);
  const lead = line.match(/^ */)![0];
  return line.trimEnd().endsWith(":") ? lead + INDENT : lead;
}

/** Curly quotes (phones, pasted text) → straight quotes Python understands; tabs → 4 spaces. */
export function cleanTyping(text: string): string {
  return text.replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'").replace(/\t/g, INDENT);
}

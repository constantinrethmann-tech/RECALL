"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  cleanTyping,
  compareRuns,
  hintsFor,
  INDENT,
  joinLines,
  newlineIndent,
  pickDrillVariant,
  solutionMarkdown,
  suggestedGrade,
  type CodeDrill,
  type DrillVariant,
  type RunError,
} from "@/lib/drill";
import { preloadPython, PythonTimeout, runPython, type PythonJob } from "@/lib/python";
import { Markdown } from "./Markdown";
import { Button } from "./ui";

const LAST_KEY = "recall-drill-last";

function lastVariant(cardId: string): number | null {
  try {
    const v = (JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as Record<string, number>)[cardId];
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

function rememberVariant(cardId: string, index: number) {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as Record<string, number>;
    all[cardId] = index;
    localStorage.setItem(LAST_KEY, JSON.stringify(all));
  } catch {}
}

type Status =
  | { kind: "idle" }
  | { kind: "running"; loading: boolean }
  | { kind: "right"; note?: string }
  | { kind: "wrong"; message: string; expected?: string; actual?: string; error?: RunError; canOverride?: boolean }
  | { kind: "failed"; message: string };

export interface DrillResult {
  solved: boolean;
  hintsUsed: number;
  grade: 1 | 2 | 3;
}

/**
 * A code exercise: type the program, Check runs it and compares the result with the model solution's
 * (also with other hidden values). Hints come one at a time; the solution only when you give up.
 */
export function CodeDrillView({ cardId, drill, reps, done, onDone }: { cardId: string; drill: CodeDrill; reps: number; done: boolean; onDone: (r: DrillResult) => void }) {
  const [index] = useState(() => pickDrillVariant(drill, reps, lastVariant(cardId)));
  const variant: DrillVariant = drill.variants[index];
  const hints = hintsFor(drill, variant);
  const [codeText, setCodeText] = useState("");
  const [hintsShown, setHintsShown] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [gaveUp, setGaveUp] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rememberVariant(cardId, index);
    preloadPython().catch(() => {});
    editor.current?.focus({ preventScroll: true });
  }, [cardId, index]);

  // When the exercise is over, leave the editor so the rating keys (1–4, Space) work.
  useEffect(() => {
    if (done) editor.current?.blur();
  }, [done]);

  const finish = (solved: boolean) => onDone({ solved, hintsUsed: hintsShown, grade: suggestedGrade({ solved, hintsUsed: hintsShown }) });

  async function check() {
    if (done || status.kind === "running" || !codeText.trim()) return;
    const loading = !(await Promise.race([preloadPython().then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false), 50))]));
    setStatus({ kind: "running", loading });
    const cases = [{ setup: variant.setup, inputs: variant.inputs }, ...(variant.tests ?? [])];
    const names = variant.check ?? [];
    const jobs: PythonJob[] = cases.flatMap((c) => [
      { setup: joinLines(c.setup), code: joinLines(variant.solution), inputs: c.inputs ?? [], names },
      { setup: joinLines(c.setup), code: codeText, inputs: c.inputs ?? [], names },
    ]);
    let note: string | undefined;
    try {
      const results = await runPython(jobs);
      for (let i = 0; i < cases.length; i++) {
        const model = results[2 * i];
        const yours = results[2 * i + 1];
        if (yours.error) {
          setStatus({ kind: "wrong", message: "Your code stopped with an error.", error: yours.error, actual: yours.stdout });
          return;
        }
        const verdict = compareRuns(model, yours, variant.check);
        if (!verdict.ok) {
          const hidden = i > 0;
          setStatus({
            kind: "wrong",
            message: hidden
              ? `It works for the given values, but not when they change (e.g. ${cases[i].setup.join("; ") || `input ${cases[i].inputs?.join(", ")}`}). Use the variables instead of typing the values in.`
              : variant.check?.length
                ? "Not quite: the variables don't hold the right values."
                : "Not quite: your output is different.",
            expected: verdict.expected,
            actual: verdict.actual,
            canOverride: !hidden,
          });
          return;
        }
        if (i === 0) note = verdict.note;
      }
      setStatus({ kind: "right", note });
      finish(true);
    } catch (e) {
      setStatus(e instanceof PythonTimeout ? { kind: "wrong", message: e.message } : { kind: "failed", message: (e as Error).message });
    }
  }

  // ─── Editor keys: Tab indents, Enter keeps the indentation, Ctrl+Enter checks ───
  const insert = (text: string) => {
    const el = editor.current!;
    // execCommand keeps Ctrl+Z working ("insertText" can't insert nothing, so deleting uses "delete").
    const ok = text ? document.execCommand("insertText", false, text) : el.selectionStart === el.selectionEnd || document.execCommand("delete");
    if (!ok) {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
      setCodeText(el.value);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      check();
    } else if (e.key === "Enter") {
      e.preventDefault();
      insert("\n" + newlineIndent(el.value, el.selectionStart));
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      insert(INDENT);
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      const start = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
      const lead = el.value.slice(start).match(/^ {1,4}/)?.[0].length ?? 0;
      if (lead) {
        el.setSelectionRange(start, start + lead);
        insert("");
      }
    } else if (e.key === "Backspace" && el.selectionStart === el.selectionEnd) {
      const start = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
      const before = el.value.slice(start, el.selectionStart);
      if (before.length >= 4 && /^ +$/.test(before) && before.length % 4 === 0) {
        e.preventDefault();
        el.setSelectionRange(el.selectionStart - 4, el.selectionStart);
        insert("");
      }
    }
  };

  const lines = Math.max(6, codeText.split("\n").length);
  const errorLine = status.kind === "wrong" ? status.error?.line ?? null : null;
  const pre = "overflow-x-auto rounded-xl border border-seam-2 bg-hull-2 px-4 py-3 font-mono text-[13px] leading-[1.6] text-frost/90 whitespace-pre";

  return (
    <div className="space-y-5">
      <Markdown className="text-[1.15rem] leading-snug sm:text-[1.3rem]">{variant.prompt}</Markdown>

      {(variant.setup.length > 0 || variant.inputs?.length) && (
        <div>
          <p className="eyebrow mb-1.5">Given</p>
          {variant.setup.length > 0 && <pre className={pre}>{joinLines(variant.setup)}</pre>}
          {variant.inputs?.length ? (
            <p className="mt-2 font-mono text-[12.5px] text-mist">
              input() returns: {variant.inputs.map((v) => JSON.stringify(v)).join(", then ")}
            </p>
          ) : null}
        </div>
      )}

      <div>
        <p className="eyebrow mb-1.5">Your code</p>
        <div className={`flex overflow-hidden rounded-xl border bg-void ${status.kind === "right" ? "border-up/50" : status.kind === "wrong" ? "border-down/50" : "border-seam-2 focus-within:border-ion/60"}`}>
          <div ref={gutter} aria-hidden className="select-none overflow-hidden border-r border-seam bg-hull py-3 pl-3 pr-2 text-right font-mono text-[13px] leading-[1.6] text-dust">
            {Array.from({ length: lines }, (_, i) => (
              <div key={i} className={errorLine === i + 1 ? "text-down" : ""}>
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            ref={editor}
            value={codeText}
            readOnly={done}
            onChange={(e) => setCodeText(cleanTyping(e.target.value))}
            onKeyDown={onKeyDown}
            onScroll={(e) => {
              if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
            }}
            rows={lines}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            placeholder="# type your code here"
            aria-label="Your code"
            className="min-w-0 flex-1 resize-none bg-transparent px-3 py-3 font-mono text-[13px] leading-[1.6] text-frost outline-none placeholder:text-seam-3"
          />
        </div>
      </div>

      {!done && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={check} disabled={!codeText.trim() || status.kind === "running"}>
            {status.kind === "running" ? (status.loading ? "Loading Python…" : "Checking…") : "Check"}
            <kbd className="ml-2 hidden font-mono text-[10px] opacity-70 lg:inline">ctrl ↵</kbd>
          </Button>
          {hintsShown < hints.length && (
            <Button variant="ghost" onClick={() => setHintsShown((n) => n + 1)}>
              Hint {hintsShown + 1}/{hints.length}
            </Button>
          )}
          {status.kind === "wrong" && status.canOverride && (
            <Button variant="text" onClick={() => finish(true)} title="Use this if your answer is right but printed differently">
              My answer is right
            </Button>
          )}
          <Button
            variant="text"
            className="ml-auto text-dust"
            onClick={() => {
              setGaveUp(true);
              finish(false);
            }}
          >
            Show solution
          </Button>
        </div>
      )}

      {hintsShown > 0 && (
        <ol className="space-y-2">
          {hints.slice(0, hintsShown).map((h, i) => (
            <li key={i} className="rounded-xl border border-flare/25 bg-flare/5 px-4 py-2.5 text-[14px] text-frost/90">
              <span className="mr-2 font-mono text-[11px] text-flare">HINT {i + 1}</span>
              <Markdown className="inline">{h}</Markdown>
            </li>
          ))}
        </ol>
      )}

      {status.kind === "right" && (
        <p className="rounded-xl border border-up/30 bg-up/5 px-4 py-3 text-[14px] text-up">✓ Correct{status.note ? `. ${status.note}` : "!"}</p>
      )}
      {status.kind === "failed" && <p className="rounded-xl border border-down/30 bg-down/5 px-4 py-3 text-[14px] text-frost">{status.message}</p>}
      {status.kind === "wrong" && (
        <div className="space-y-3 rounded-xl border border-down/30 bg-down/5 px-4 py-3">
          <p className="text-[14px] text-frost">✗ {status.message}</p>
          {status.error && (
            <p className="font-mono text-[13px] text-down">
              {status.error.line ? `Line ${status.error.line}: ` : ""}
              {status.error.type}: {status.error.message}
            </p>
          )}
          {status.expected !== undefined && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="eyebrow mb-1">Expected</p>
                <pre className={pre}>{status.expected || "(nothing printed)"}</pre>
              </div>
              <div>
                <p className="eyebrow mb-1">Yours</p>
                <pre className={pre}>{status.actual || "(nothing printed)"}</pre>
              </div>
            </div>
          )}
        </div>
      )}

      {done && (
        <div>
          <p className="eyebrow mb-1.5">{gaveUp || status.kind !== "right" ? "Solution" : "Model solution (yours can differ)"}</p>
          <Markdown>{solutionMarkdown(variant)}</Markdown>
        </div>
      )}
    </div>
  );
}

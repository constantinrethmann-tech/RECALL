"use client";

import { useState } from "react";
import { exampleLevel } from "@/lib/examples";
import { Markdown } from "./Markdown";

const OUTPUT = "\n**Output:**\n";

/**
 * A worked example under a flashcard's answer: task + code, with the output hidden until you've
 * guessed it. Which example depends on how often you've reviewed the card (simple first, harder later).
 */
export function WorkedExample({ examples, reps }: { examples: string[]; reps: number }) {
  const level = exampleLevel(reps, examples.length);
  const [shown, setShown] = useState(false);
  if (level < 0) return null;
  const text = examples[level];
  const cut = text.indexOf(OUTPUT);
  const body = cut < 0 ? text : text.slice(0, cut);
  const output = cut < 0 ? null : text.slice(cut + OUTPUT.length);

  return (
    <section className="mt-7 rounded-2xl border border-seam-2 bg-hull px-5 py-4" onClick={(e) => e.stopPropagation()}>
      <p className="eyebrow mb-3 flex items-center justify-between">
        <span className="text-ion">Example</span>
        {examples.length > 1 && (
          <span title="Examples get harder the more often you review this card">
            level {level + 1}/{examples.length}
          </span>
        )}
      </p>
      <Markdown className="text-[0.98rem] leading-relaxed text-frost/95">{body}</Markdown>
      {output !== null &&
        (shown ? (
          <div className="mt-3 animate-[fadeIn_.2s_ease-out]">
            <p className="eyebrow mb-1.5">Output</p>
            <Markdown className="text-[0.98rem]">{output}</Markdown>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShown(true)}
            className="mt-3 h-10 rounded-full border border-dashed border-seam-3 px-4 text-[13px] text-mist transition-colors hover:border-ion/60 hover:text-frost"
          >
            What does it print? Guess, then tap
          </button>
        ))}
    </section>
  );
}

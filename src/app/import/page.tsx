"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { RequireAuth } from "@/components/auth";
import { ArrowLeft, Upload } from "@/components/icons";
import { Button, ButtonLink, ErrorNote, IconButton, Splash } from "@/components/ui";
import { applyImport, previewImport, type ImportPreview, type ImportProgress, type ImportResult } from "@/lib/import/apply";
import type { Deck } from "@/lib/import/deck";
import { readDeckFile } from "@/lib/import/zip";

type Step =
  | { name: "pick" }
  | { name: "reading"; file: string }
  | { name: "invalid"; file: string; errors: string[]; warnings: string[] }
  | { name: "preview"; file: string; deck: Deck; preview: ImportPreview; warnings: string[]; readImage: (p: string) => Promise<Blob> }
  | { name: "importing"; deck: Deck; progress: ImportProgress | null }
  | { name: "done"; deck: Deck; result: ImportResult }
  | { name: "failed"; message: string };

export default function ImportPage() {
  return (
    <RequireAuth>
      <Importer />
    </RequireAuth>
  );
}

function Importer() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "pick" });
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function open(file: File) {
    setStep({ name: "reading", file: file.name });
    try {
      const { result, readImage } = await readDeckFile(file, file.name);
      if (!result.deck) return setStep({ name: "invalid", file: file.name, errors: result.errors, warnings: result.warnings });
      const preview = await previewImport(result.deck);
      setStep({ name: "preview", file: file.name, deck: result.deck, preview, warnings: result.warnings, readImage });
    } catch (e) {
      setStep({ name: "failed", message: (e as Error).message });
    }
  }

  async function run(deck: Deck, readImage: (p: string) => Promise<Blob>) {
    setStep({ name: "importing", deck, progress: null });
    try {
      const result = await applyImport(deck, readImage, (progress) => setStep({ name: "importing", deck, progress }));
      setStep({ name: "done", deck, result });
    } catch (e) {
      setStep({ name: "failed", message: (e as Error).message });
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) open(file);
  }

  const reset = () => {
    if (input.current) input.current.value = "";
    setStep({ name: "pick" });
  };

  return (
    <div className="min-h-dvh" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="pt-safe border-b border-seam">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-2">
          <IconButton label="Back to overview" onClick={() => router.push("/")}>
            <ArrowLeft />
          </IconButton>
          <h1 className="text-[15px] text-frost">Import</h1>
        </div>
      </header>

      <main className="pb-safe mx-auto max-w-2xl px-5 py-8">
        <input
          ref={input}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && open(e.target.files[0])}
        />

        {step.name === "pick" && (
          <button
            onClick={() => input.current?.click()}
            onDragEnter={() => setDragging(true)}
            onDragLeave={() => setDragging(false)}
            className={`flex w-full flex-col items-center gap-4 rounded-3xl border border-dashed px-6 py-16 text-center transition-colors ${
              dragging ? "border-ion bg-ion/[.05]" : "border-seam-3 hover:border-ion/60 hover:bg-hull"
            }`}
          >
            <span className="grid h-14 w-14 place-items-center rounded-full border border-seam-2 text-ion">
              <Upload />
            </span>
            <span className="text-[16px] text-frost">Choose a deck file</span>
            <span className="max-w-xs text-[13.5px] text-mist">
              A <span className="font-mono text-frost">.zip</span> with <span className="font-mono text-frost">cards.json</span> and an{" "}
              <span className="font-mono text-frost">images/</span> folder, or a bare cards.json. On a laptop you can also drop it here.
            </span>
          </button>
        )}

        {step.name === "reading" && <Splash label={`Reading ${step.file}`} />}

        {step.name === "invalid" && (
          <div className="space-y-6">
            <p className="eyebrow">{step.file}</p>
            <ErrorNote>
              <p className="mb-2">This file can&apos;t be imported yet:</p>
              <ul className="list-disc space-y-1 pl-5 text-mist">
                {step.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </ErrorNote>
            <Warnings warnings={step.warnings} />
            <Button variant="ghost" onClick={reset}>
              Choose another file
            </Button>
          </div>
        )}

        {step.name === "preview" && (
          <div className="space-y-7">
            <div>
              <p className="eyebrow">{step.preview.subjectExists ? "Existing subject" : "New subject"}</p>
              <h2 className="mt-2 text-2xl text-frost">{step.deck.subject}</h2>
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px]">
                <span className="text-ion">{step.preview.newCount} new</span>
                <span className="text-flare">{step.preview.updateCount} updated</span>
                <span className="text-mist">{step.preview.imageCount} pictures</span>
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-seam">
              <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem_3.5rem] gap-2 border-b border-seam bg-hull px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-dust">
                <span>Unit</span>
                <span className="text-right">New</span>
                <span className="text-right">Updated</span>
                <span className="text-right">Pics</span>
              </div>
              {step.preview.units.map((u) => (
                <div key={u.name} className="grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem_3.5rem] items-center gap-2 border-b border-seam px-4 py-3 last:border-0">
                  <span className="truncate text-[14px] text-frost">{u.name}</span>
                  <span className="text-right font-mono text-[12px] text-ion">{u.newCount || "–"}</span>
                  <span className="text-right font-mono text-[12px] text-flare">{u.updateCount || "–"}</span>
                  <span className="text-right font-mono text-[12px] text-mist">{u.imageCount || "–"}</span>
                </div>
              ))}
            </div>

            {step.preview.updateCount > 0 && (
              <p className="text-[13.5px] text-mist">Updated cards get the new text and pictures but keep their review progress.</p>
            )}
            <Warnings warnings={step.warnings} />

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => run(step.deck, step.readImage)}>
                Import {step.deck.cards.length} {step.deck.cards.length === 1 ? "card" : "cards"}
              </Button>
              <Button variant="ghost" onClick={reset}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step.name === "importing" && (
          <div className="space-y-5 pt-10">
            <p className="eyebrow">Importing {step.deck.subject}</p>
            <div className="h-1 overflow-hidden rounded-full bg-seam">
              <div
                className="h-full rounded-full bg-ion transition-[width] duration-300"
                style={{ width: `${step.progress && step.progress.total ? (step.progress.done / step.progress.total) * 100 : 3}%` }}
              />
            </div>
            <p className="font-mono text-[12px] text-mist">
              {!step.progress
                ? "Preparing…"
                : step.progress.phase === "images"
                  ? `Uploading pictures ${step.progress.done}/${step.progress.total}`
                  : `Saving cards ${step.progress.done}/${step.progress.total}`}
            </p>
          </div>
        )}

        {step.name === "done" && (
          <div className="space-y-6 pt-6">
            <p className="eyebrow text-up">Imported</p>
            <h2 className="text-2xl text-frost">{step.deck.subject}</h2>
            <p className="font-mono text-[13px] text-mist">
              {step.result.created} new · {step.result.updated} updated · {step.result.images} pictures
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href={`/study/?subject=${step.result.subjectId}`}>Study {step.deck.subject}</ButtonLink>
              <ButtonLink href="/" variant="ghost">
                Overview
              </ButtonLink>
              <Button variant="text" onClick={reset}>
                Import another
              </Button>
            </div>
          </div>
        )}

        {step.name === "failed" && (
          <div className="space-y-6">
            <ErrorNote>{step.message}</ErrorNote>
            <p className="text-[13.5px] text-mist">Nothing is lost: importing the same file again is safe, because cards are matched by their id.</p>
            <Button variant="ghost" onClick={reset}>
              Try again
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <details className="rounded-2xl border border-flare/25 bg-flare/[.04] px-4 py-3 text-[13.5px]">
      <summary className="cursor-pointer text-flare">
        {warnings.length} {warnings.length === 1 ? "note" : "notes"} (fixed automatically)
      </summary>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-mist">
        {warnings.slice(0, 50).map((w, i) => (
          <li key={i}>{w}</li>
        ))}
        {warnings.length > 50 && <li>…and {warnings.length - 50} more</li>}
      </ul>
    </details>
  );
}

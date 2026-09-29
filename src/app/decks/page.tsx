"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { RequireAuth } from "@/components/auth";
import { PageShell } from "@/components/PageShell";
import { Button, ErrorNote, Splash } from "@/components/ui";
import { deleteSubject, deleteUnit, loadDeckTree, renameSubject, renameUnit, type DeckTree } from "@/lib/decks";

export default function DecksPage() {
  return (
    <RequireAuth>
      <Decks />
    </RequireAuth>
  );
}

const cardsLabel = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;

function Decks() {
  const [tree, setTree] = useState<DeckTree | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => loadDeckTree().then(setTree, (e: Error) => setError(e.message)), []);
  useEffect(() => {
    reload();
  }, [reload]);

  if (!tree) return error ? <PageShell title="Subjects & units"><ErrorNote>{error}</ErrorNote></PageShell> : <Splash />;

  return (
    <PageShell title="Subjects & units">
      <p className="text-[13.5px] text-mist">
        Rename or delete subjects and units. Deleting also removes their cards and review progress, for good.
      </p>
      {error && (
        <div className="mt-5">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {!tree.subjects.length && <p className="mt-8 text-mist">No subjects yet.</p>}

      <div className="mt-6 space-y-4">
        {tree.subjects.map((s) => {
          const units = tree.units.filter((u) => u.subject_id === s.id);
          const total = units.reduce((n, u) => n + (tree.cards.get(u.id) ?? 0), 0);
          return (
            <section key={s.id} className="rounded-2xl border border-seam bg-hull">
              <EditableRow
                kind="subject"
                name={s.name}
                detail={`${units.length} ${units.length === 1 ? "unit" : "units"} · ${cardsLabel(total)}`}
                deleteWarning={total ? `Delete “${s.name}” with all ${cardsLabel(total)}?` : `Delete “${s.name}”?`}
                onRename={(name) => renameSubject(s.id, name).then(reload)}
                onDelete={() => deleteSubject(s.id).then(reload)}
                onError={setError}
              />
              {units.length > 0 && (
                <ul className="divide-y divide-seam border-t border-seam">
                  {units.map((u) => {
                    const n = tree.cards.get(u.id) ?? 0;
                    return (
                      <li key={u.id}>
                        <EditableRow
                          kind="unit"
                          name={u.name}
                          detail={cardsLabel(n)}
                          deleteWarning={n ? `Delete “${u.name}” with its ${cardsLabel(n)}?` : `Delete “${u.name}”?`}
                          onRename={(name) => renameUnit(u.id, name).then(reload)}
                          onDelete={() => deleteUnit(u.id).then(reload)}
                          onError={setError}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}

function EditableRow({
  kind,
  name,
  detail,
  deleteWarning,
  onRename,
  onDelete,
  onError,
}: {
  kind: "subject" | "unit";
  name: string;
  detail: string;
  deleteWarning: string;
  onRename: (name: string) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onError: (message: string | null) => void;
}) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    onError(null);
    try {
      await action();
      setMode("view");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () => (draft.trim() === name ? setMode("view") : run(() => onRename(draft)));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") save();
    else if (e.key === "Escape") setMode("view");
  };

  const pad = kind === "subject" ? "px-4 py-3" : "py-2.5 pl-8 pr-4";

  if (mode === "rename")
    return (
      <div className={`flex flex-wrap items-center gap-2 ${pad}`}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={`New ${kind} name`}
          className="h-11 min-w-0 flex-1 basis-56 rounded-xl border border-ion/60 bg-void px-3 text-[15px] text-frost outline-none"
        />
        <Button onClick={save} disabled={busy || !draft.trim()} className="h-11">
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button variant="text" onClick={() => setMode("view")} disabled={busy}>
          Cancel
        </Button>
      </div>
    );

  if (mode === "delete")
    return (
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${pad}`}>
        <span className="min-w-0 flex-1 basis-56 text-[14px] text-frost">{deleteWarning}</span>
        <Button variant="text" className="text-down hover:text-down" onClick={() => run(onDelete)} disabled={busy}>
          {busy ? "Deleting…" : "Yes, delete"}
        </Button>
        <Button variant="text" onClick={() => setMode("view")} disabled={busy}>
          No
        </Button>
      </div>
    );

  return (
    <div className={`flex items-center gap-2 ${pad}`}>
      <div className="min-w-0 flex-1">
        <p className={kind === "subject" ? "truncate font-display text-[11px] uppercase tracking-[0.2em] text-frost" : "truncate text-[14px] text-frost"}>{name}</p>
        <p className="mt-1 font-mono text-[11px] text-dust">{detail}</p>
      </div>
      <Button
        variant="text"
        onClick={() => {
          setDraft(name);
          setMode("rename");
        }}
      >
        Rename
      </Button>
      <Button variant="text" className="text-down/80 hover:text-down" onClick={() => setMode("delete")}>
        Delete
      </Button>
    </div>
  );
}

"use client";

import { useEffect, useId, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { deleteCard, loadCard, saveCard, unitSections, type CardDraft } from "@/lib/cards";
import { loadTree } from "@/lib/data";
import { signedImageUrls, uploadImage } from "@/lib/images";
import { normalizeTags } from "@/lib/import/deck";
import { currentUserId } from "@/lib/supabase";
import type { CardRow, SubjectRow, UnitRow } from "@/lib/types";
import { Close } from "./icons";
import { Button, ErrorNote, Splash } from "./ui";

export interface EditorResult {
  saved?: CardRow;
  deleted?: boolean;
}

interface Props {
  cardId?: string;
  /** Pre-filled subject/unit for a new card. */
  defaults?: { subjectId?: string; unitId?: string };
  onDone: (result: EditorResult | null) => void;
}

type Side = "front" | "back";

const EMPTY: CardDraft = { subjectName: "", unitName: "", section: "", tags: [], front: "", back: "", frontImage: null, backImage: null };

export function CardEditor({ cardId, defaults, onDone }: Props) {
  const [tree, setTree] = useState<{ subjects: SubjectRow[]; units: UnitRow[] } | null>(null);
  const [draft, setDraft] = useState<CardDraft | null>(null);
  const [tagText, setTagText] = useState("");
  const [sections, setSections] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Side | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  // Load subjects/units and the card (or the defaults for a new card).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await loadTree();
      let d: CardDraft = { ...EMPTY };
      let tags: string[] = [];
      if (cardId) {
        const c = await loadCard(cardId);
        d = {
          subjectName: c.subject_name,
          unitName: c.unit_name,
          section: c.section ?? "",
          tags: c.tags,
          front: c.front,
          back: c.back,
          frontImage: c.front_image,
          backImage: c.back_image,
        };
        tags = c.tags;
      } else {
        const unit = t.units.find((u) => u.id === defaults?.unitId);
        const subject = t.subjects.find((s) => s.id === (unit?.subject_id ?? defaults?.subjectId));
        d = { ...EMPTY, subjectName: subject?.name ?? "", unitName: unit?.name ?? "" };
      }
      const paths = [d.frontImage, d.backImage].filter((p): p is string => !!p);
      const urls = paths.length ? await signedImageUrls(paths) : new Map<string, string>();
      if (cancelled) return;
      setTree(t);
      setDraft(d);
      setTagText(tags.join(", "));
      setPreviews(Object.fromEntries(urls));
    })().catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [cardId, defaults?.subjectId, defaults?.unitId]);

  // Section suggestions for the chosen unit.
  const subjectName = draft?.subjectName ?? "";
  const unitName = draft?.unitName ?? "";
  useEffect(() => {
    if (!subjectName || !unitName) return;
    let cancelled = false;
    const t = setTimeout(() => {
      unitSections(unitName, subjectName).then((s) => !cancelled && setSections(s), () => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [subjectName, unitName]);

  if (error && !draft) return <div className="p-6"><ErrorNote>{error}</ErrorNote></div>;
  if (!draft || !tree) return <Splash />;

  const set = (patch: Partial<CardDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const subject = tree.subjects.find((s) => s.name === draft.subjectName);
  const unitOptions = subject ? tree.units.filter((u) => u.subject_id === subject.id) : [];

  async function addImage(side: Side, file: File | Blob) {
    setUploading(side);
    setError(null);
    try {
      const path = await uploadImage(await currentUserId(), file);
      const urls = await signedImageUrls([path]);
      setPreviews((p) => ({ ...p, [path]: urls.get(path) ?? "" }));
      set(side === "front" ? { frontImage: path } : { backImage: path });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  function onPaste(side: Side, e: ClipboardEvent) {
    const file = [...e.clipboardData.items].find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
    if (file) {
      e.preventDefault();
      addImage(side, file);
    }
  }

  function onDrop(side: Side, e: DragEvent) {
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      addImage(side, file);
    }
  }

  const missing = !draft.subjectName.trim()
    ? "Choose a subject"
    : !draft.unitName.trim()
      ? "Choose a unit"
      : !draft.front.trim() && !draft.frontImage
        ? "The front is empty"
        : !draft.back.trim() && !draft.backImage
          ? "The back is empty"
          : null;

  async function save() {
    if (!draft || missing || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveCard({ ...draft, tags: normalizeTags(tagText) }, cardId);
      onDone({ saved });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!cardId) return;
    setBusy(true);
    try {
      await deleteCard(cardId);
      onDone({ deleted: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onDone(null);
    }
  };

  const field = "h-12 w-full rounded-xl border border-seam-2 bg-hull px-3.5 text-[15px] text-frost outline-none transition-colors placeholder:text-seam-3 focus:border-ion/60";
  const area = "min-h-32 w-full resize-y rounded-xl border border-seam-2 bg-hull px-3.5 py-3 text-[15px] leading-relaxed text-frost outline-none transition-colors placeholder:text-seam-3 focus:border-ion/60";

  const imageSlot = (side: Side) => {
    const path = side === "front" ? draft.frontImage : draft.backImage;
    const inputId = `${ids}-${side}-file`;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(side, e)}>
        {path && (
          <div className="relative">
            {previews[path] ? (
              <img src={previews[path]} alt="" className="h-24 max-w-48 rounded-lg bg-white object-contain" />
            ) : (
              <div className="h-24 w-32 rounded-lg bg-hull-2" />
            )}
            <button
              type="button"
              aria-label="Remove picture"
              onClick={() => set(side === "front" ? { frontImage: null } : { backImage: null })}
              className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-seam-2 bg-hull-3 text-mist hover:text-frost"
            >
              <Close width={14} height={14} />
            </button>
          </div>
        )}
        <label htmlFor={inputId} className="inline-flex h-10 cursor-pointer items-center rounded-full border border-dashed border-seam-3 px-4 text-[13px] text-mist hover:border-ion/60 hover:text-frost">
          {uploading === side ? "Uploading…" : path ? "Replace picture" : "Add picture"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) addImage(side, f);
            e.target.value = "";
          }}
        />
        <span className="hidden text-[12px] text-dust lg:inline">or paste / drop an image</span>
      </div>
    );
  };

  return (
    <div className="space-y-6" onKeyDown={onKeyDown}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow">Subject</span>
          <input list={`${ids}-subjects`} value={draft.subjectName} onChange={(e) => set({ subjectName: e.target.value })} placeholder="Business Law I" className={`${field} mt-1.5`} />
          <datalist id={`${ids}-subjects`}>
            {tree.subjects.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="eyebrow">Unit</span>
          <input list={`${ids}-units`} value={draft.unitName} onChange={(e) => set({ unitName: e.target.value })} placeholder="Unit 03 – …" className={`${field} mt-1.5`} />
          <datalist id={`${ids}-units`}>
            {unitOptions.map((u) => (
              <option key={u.id} value={u.name} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="eyebrow">Section (optional)</span>
          <input list={`${ids}-sections`} value={draft.section} onChange={(e) => set({ section: e.target.value })} placeholder="A. S.A. vs S.L." className={`${field} mt-1.5`} />
          <datalist id={`${ids}-sections`}>
            {sections.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="eyebrow">Tags (comma separated)</span>
          <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="exam, case-study-1" className={`${field} mt-1.5`} />
        </label>
      </div>

      <div>
        <span className="eyebrow">Front · question</span>
        <textarea value={draft.front} onChange={(e) => set({ front: e.target.value })} onPaste={(e) => onPaste("front", e)} placeholder="Minimum share capital of an **S.L.**?" className={`${area} mt-1.5`} />
        {imageSlot("front")}
      </div>

      <div>
        <span className="eyebrow">Back · answer</span>
        <textarea value={draft.back} onChange={(e) => set({ back: e.target.value })} onPaste={(e) => onPaste("back", e)} placeholder={"**€3,000**\n- point one\n- point two"} className={`${area} mt-1.5 min-h-40`} />
        {imageSlot("back")}
        <p className="mt-2 text-[12px] text-dust">**bold** · *italic* · lines starting with “- ” become a list</p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Button onClick={save} disabled={!!missing || busy || !!uploading}>
          {busy ? "Saving…" : "Save card"}
        </Button>
        <Button variant="ghost" onClick={() => onDone(null)} disabled={busy}>
          Cancel
        </Button>
        {missing && <span className="text-[13px] text-dust">{missing}</span>}
        <span className="ml-auto hidden font-mono text-[11px] text-dust lg:inline">ctrl + enter saves</span>
        {cardId &&
          (confirmDelete ? (
            <span className="flex items-center gap-2">
              <span className="text-[13px] text-mist">Delete for good?</span>
              <Button variant="text" className="text-down hover:text-down" onClick={remove} disabled={busy}>
                Yes, delete
              </Button>
              <Button variant="text" onClick={() => setConfirmDelete(false)}>
                No
              </Button>
            </span>
          ) : (
            <Button variant="text" className="text-down/80 hover:text-down" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Delete card
            </Button>
          ))}
      </div>
    </div>
  );
}

/** The editor as a pop-up (used from the review screen). */
export function CardEditorModal({ cardId, onDone }: { cardId: string; onDone: (r: EditorResult | null) => void }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-void/90 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="pt-safe mx-auto min-h-full max-w-2xl border-seam bg-void px-5 pb-8 sm:my-8 sm:min-h-0 sm:rounded-3xl sm:border sm:px-8">
        <div className="flex h-16 items-center justify-between">
          <h2 className="text-[15px] text-frost">Edit card</h2>
          <button onClick={() => onDone(null)} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full text-mist hover:bg-hull-2 hover:text-frost">
            <Close />
          </button>
        </div>
        <CardEditor cardId={cardId} onDone={onDone} />
      </div>
    </div>
  );
}

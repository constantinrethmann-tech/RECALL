import { uploadImage } from "../images";
import { currentUserId, getSupabase } from "../supabase";
import type { Deck, DeckCard } from "./deck";

export interface UnitPreview {
  name: string;
  order: number;
  newCount: number;
  updateCount: number;
  imageCount: number;
}

export interface ImportPreview {
  subjectExists: boolean;
  units: UnitPreview[];
  newCount: number;
  updateCount: number;
  imageCount: number;
}

export interface ImportProgress {
  phase: "images" | "cards";
  done: number;
  total: number;
}

export interface ImportResult {
  subjectId: string;
  created: number;
  updated: number;
  images: number;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const distinctImages = (deck: Deck) =>
  [...new Set(deck.cards.flatMap((c) => [c.frontImage, c.backImage]).filter((p): p is string => !!p))];

/** Which cards are new and which already exist (matched by their "id"). */
export async function previewImport(deck: Deck): Promise<ImportPreview> {
  const sb = getSupabase();
  const existing = new Set<string>();
  for (const ids of chunks(deck.cards.map((c) => c.id), 150)) {
    const res = await sb.from("cards").select("external_id").in("external_id", ids);
    if (res.error) throw new Error(res.error.message);
    for (const r of res.data ?? []) existing.add(r.external_id as string);
  }
  const subj = await sb.from("subjects").select("id").eq("name", deck.subject).maybeSingle();
  if (subj.error) throw new Error(subj.error.message);

  const units = deck.units.map<UnitPreview>((u) => {
    const cards = deck.cards.filter((c) => c.unit === u.name);
    const updateCount = cards.filter((c) => existing.has(c.id)).length;
    return {
      name: u.name,
      order: u.order,
      newCount: cards.length - updateCount,
      updateCount,
      imageCount: cards.reduce((n, c) => n + (c.frontImage ? 1 : 0) + (c.backImage ? 1 : 0), 0),
    };
  });
  return {
    subjectExists: !!subj.data,
    units,
    newCount: units.reduce((n, u) => n + u.newCount, 0),
    updateCount: units.reduce((n, u) => n + u.updateCount, 0),
    imageCount: distinctImages(deck).length,
  };
}

/**
 * Saves the deck. Existing cards (same "id") get the new text, pictures, unit, section and tags,
 * but their review progress is left untouched: the FSRS columns are never part of the update.
 */
export async function applyImport(
  deck: Deck,
  readImage: (path: string) => Promise<Blob>,
  onProgress: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const sb = getSupabase();
  const userId = await currentUserId();
  const preview = await previewImport(deck);

  // 1. Subject and units.
  const subj = await sb
    .from("subjects")
    .upsert({ user_id: userId, name: deck.subject }, { onConflict: "user_id,name" })
    .select("id")
    .single();
  if (subj.error) throw new Error(`Couldn't save the subject: ${subj.error.message}`);
  const subjectId = subj.data.id as string;

  const unitRes = await sb
    .from("units")
    .upsert(
      deck.units.map((u) => ({ user_id: userId, subject_id: subjectId, name: u.name, position: u.order })),
      { onConflict: "subject_id,name" },
    )
    .select("id,name");
  if (unitRes.error) throw new Error(`Couldn't save the units: ${unitRes.error.message}`);
  const unitIds = new Map((unitRes.data ?? []).map((u) => [u.name as string, u.id as string]));

  // 2. Pictures (4 at a time).
  const paths = distinctImages(deck);
  const stored = new Map<string, string>();
  let done = 0;
  onProgress({ phase: "images", done, total: paths.length });
  const queue = [...paths];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      stored.set(p, await uploadImage(userId, await readImage(p)));
      onProgress({ phase: "images", done: ++done, total: paths.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, worker));

  // 3. Cards, 200 per request. Every row in a request has exactly the same keys, so cards
  //    without an explanation in the file go separately and keep the one they already have.
  const now = new Date().toISOString();
  const base = (c: DeckCard) => ({
    user_id: userId,
    external_id: c.id,
    subject_id: subjectId,
    unit_id: unitIds.get(c.unit)!,
    section: c.section,
    front: c.front,
    back: c.back,
    front_image: c.frontImage ? stored.get(c.frontImage)! : null,
    back_image: c.backImage ? stored.get(c.backImage)! : null,
    tags: c.tags,
    source: c.source,
    position: c.index,
    kind: c.drill ? "code" : "basic",
    extra: c.drill ? { drill: c.drill } : null,
    updated_at: now,
  });
  const explained = deck.cards.filter((c) => c.explain).map((c) => ({ ...base(c), explain: c.explain }));
  const plain = deck.cards.filter((c) => !c.explain).map(base);
  const total = deck.cards.length;
  let saved = 0;
  onProgress({ phase: "cards", done: 0, total });
  for (const batch of [...chunks(explained, 200), ...chunks(plain, 200)]) {
    const res = await sb.from("cards").upsert(batch, { onConflict: "user_id,external_id" });
    if (res.error) throw new Error(`Couldn't save cards: ${res.error.message}`);
    saved += batch.length;
    onProgress({ phase: "cards", done: saved, total });
  }

  return { subjectId, created: preview.newCount, updated: preview.updateCount, images: paths.length };
}

import { CARD_COLUMNS, check } from "./data";
import { currentUserId, getSupabase } from "./supabase";
import type { CardRow } from "./types";

export interface CardDraft {
  subjectName: string;
  unitName: string;
  section: string;
  tags: string[];
  front: string;
  back: string;
  frontImage: string | null;
  backImage: string | null;
  explain: string;
}

/** Finds the subject and unit by name, creating them if they don't exist yet. */
export async function ensureSubjectUnit(subjectName: string, unitName: string): Promise<{ subjectId: string; unitId: string }> {
  const sb = getSupabase();
  const userId = await currentUserId();
  type Row = { id: string } | null;
  const subject = check(await sb.from("subjects").select("id").eq("name", subjectName).maybeSingle(), "subject") as unknown as Row;
  let subjectId = subject?.id;
  if (!subjectId) {
    const count = (check(await sb.from("subjects").select("id"), "subjects") as unknown[]).length;
    const created = check(await sb.from("subjects").insert({ user_id: userId, name: subjectName, position: count }).select("id").single(), "new subject");
    subjectId = (created as unknown as { id: string }).id;
  }
  const unit = check(await sb.from("units").select("id").eq("subject_id", subjectId).eq("name", unitName).maybeSingle(), "unit") as unknown as Row;
  let unitId = unit?.id;
  if (!unitId) {
    const last = check(await sb.from("units").select("position").eq("subject_id", subjectId).order("position", { ascending: false }).limit(1), "units");
    const position = ((last as { position: number }[])[0]?.position ?? 0) + 1;
    const created = check(await sb.from("units").insert({ user_id: userId, subject_id: subjectId, name: unitName, position }).select("id").single(), "new unit");
    unitId = (created as unknown as { id: string }).id;
  }
  return { subjectId, unitId };
}

export interface EditableCard extends CardRow {
  subject_name: string;
  unit_name: string;
}

export async function loadCard(id: string): Promise<EditableCard> {
  const sb = getSupabase();
  const row = check(await sb.from("cards").select(`${CARD_COLUMNS},subjects(name),units(name)`).eq("id", id).single(), "card") as unknown as CardRow & {
    subjects: { name: string } | null;
    units: { name: string } | null;
  };
  const { subjects, units, ...card } = row;
  return { ...card, subject_name: subjects?.name ?? "", unit_name: units?.name ?? "" };
}

/** Saves a new or edited card. Editing never touches the review progress. */
export async function saveCard(draft: CardDraft, id?: string): Promise<CardRow> {
  const sb = getSupabase();
  const { subjectId, unitId } = await ensureSubjectUnit(draft.subjectName.trim(), draft.unitName.trim());
  const content = {
    subject_id: subjectId,
    unit_id: unitId,
    section: draft.section.trim() || null,
    tags: draft.tags,
    front: draft.front.trim(),
    back: draft.back.trim(),
    front_image: draft.frontImage,
    back_image: draft.backImage,
    explain: draft.explain.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const res = id
    ? await sb.from("cards").update(content).eq("id", id).select(CARD_COLUMNS).single()
    : await sb
        .from("cards")
        .insert({
          ...content,
          user_id: await currentUserId(),
          external_id: `app-${crypto.randomUUID()}`,
          source: "RECALL editor",
          // After every imported card of the unit, so it's learned last.
          position: Math.floor(Date.now() / 1000),
        })
        .select(CARD_COLUMNS)
        .single();
  if (res.error) throw new Error(`Couldn't save the card: ${res.error.message}`);
  return res.data as unknown as CardRow;
}

export async function deleteCard(id: string): Promise<void> {
  const res = await getSupabase().from("cards").delete().eq("id", id);
  if (res.error) throw new Error(`Couldn't delete the card: ${res.error.message}`);
}

/** Sections already used in a unit (suggestions in the editor). */
export async function unitSections(unitName: string, subjectName: string): Promise<string[]> {
  const sb = getSupabase();
  const unit = check(
    await sb.from("units").select("id,subjects!inner(name)").eq("name", unitName).eq("subjects.name", subjectName).maybeSingle(),
    "unit",
  ) as { id: string } | null;
  if (!unit) return [];
  const rows = check(await sb.from("cards").select("section").eq("unit_id", unit.id).not("section", "is", null), "sections") as { section: string }[];
  return [...new Set(rows.map((r) => r.section))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export interface BrowseFilter {
  subjectId?: string;
  unitId?: string;
  tag?: string;
  search?: string;
}

export const BROWSE_LIMIT = 300;

export async function browseCards(filter: BrowseFilter): Promise<CardRow[]> {
  let q = getSupabase().from("cards").select(CARD_COLUMNS);
  if (filter.subjectId) q = q.eq("subject_id", filter.subjectId);
  if (filter.unitId) q = q.eq("unit_id", filter.unitId);
  if (filter.tag) q = q.contains("tags", [filter.tag]);
  const term = (filter.search ?? "").replace(/[%,()"\\*]/g, " ").trim();
  if (term) q = q.or(`front.ilike.%${term}%,back.ilike.%${term}%,section.ilike.%${term}%`);
  const res = await q.order("position").limit(BROWSE_LIMIT);
  return (check(res, "cards") ?? []) as unknown as CardRow[];
}

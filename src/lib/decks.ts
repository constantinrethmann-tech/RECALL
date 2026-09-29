import { fetchAll, loadTree } from "./data";
import { getSupabase } from "./supabase";
import type { SubjectRow, UnitRow } from "./types";

export interface DeckTree {
  subjects: SubjectRow[];
  units: UnitRow[];
  /** Number of cards per unit id. */
  cards: Map<string, number>;
}

/** Subjects and units (also empty ones), with how many cards each unit has. */
export async function loadDeckTree(): Promise<DeckTree> {
  const sb = getSupabase();
  const [tree, rows] = await Promise.all([
    loadTree(),
    fetchAll<{ unit_id: string }>("cards", (from, to) => sb.from("cards").select("unit_id").order("id").range(from, to)),
  ]);
  const cards = new Map<string, number>();
  for (const r of rows) cards.set(r.unit_id, (cards.get(r.unit_id) ?? 0) + 1);
  return { ...tree, cards };
}

async function rename(table: "subjects" | "units", id: string, name: string, what: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error(`The ${what} needs a name.`);
  const res = await getSupabase().from(table).update({ name: clean }).eq("id", id);
  if (res.error?.code === "23505") throw new Error(`There is already a ${what} called “${clean}”.`);
  if (res.error) throw new Error(`Couldn't rename the ${what}: ${res.error.message}`);
}

async function remove(table: "subjects" | "units", id: string, what: string): Promise<void> {
  const res = await getSupabase().from(table).delete().eq("id", id);
  if (res.error) throw new Error(`Couldn't delete the ${what}: ${res.error.message}`);
}

export const renameSubject = (id: string, name: string) => rename("subjects", id, name, "subject");
export const renameUnit = (id: string, name: string) => rename("units", id, name, "unit");
/** Deletes the subject with all its units, cards and their review history. */
export const deleteSubject = (id: string) => remove("subjects", id, "subject");
/** Deletes the unit with all its cards and their review history. */
export const deleteUnit = (id: string) => remove("units", id, "unit");

import { check, fetchAll } from "./data";
import { currentUserId, getSupabase } from "./supabase";

export interface DumpCard {
  id: string;
  front: string;
  back: string;
  section: string | null;
}

export interface DumpAttempt {
  id: string;
  unit_id: string | null;
  section: string | null;
  score: number;
  duration_s: number;
  hints_used: boolean;
  covered_ids: string[];
  missed_ids: string[];
  created_at: string;
}

export async function loadDumpCards(unitId: string, section: string | null): Promise<DumpCard[]> {
  const sb = getSupabase();
  return fetchAll<DumpCard>("cards", (from, to) => {
    let q = sb.from("cards").select("id,front,back,section").eq("unit_id", unitId).eq("suspended", false);
    if (section) q = q.eq("section", section);
    return q.order("position").range(from, to);
  });
}

export async function loadAttempts(unitId: string): Promise<DumpAttempt[]> {
  const res = await getSupabase()
    .from("brain_dumps")
    .select("id,unit_id,section,score,duration_s,hints_used,covered_ids,missed_ids,created_at")
    .eq("unit_id", unitId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (check(res, "brain dumps") ?? []) as DumpAttempt[];
}

export async function saveAttempt(a: {
  subjectId: string;
  unitId: string;
  section: string | null;
  text: string;
  durationS: number;
  hintsUsed: boolean;
  coveredIds: string[];
  missedIds: string[];
  score: number;
}): Promise<void> {
  const res = await getSupabase()
    .from("brain_dumps")
    .insert({
      user_id: await currentUserId(),
      subject_id: a.subjectId,
      unit_id: a.unitId,
      section: a.section,
      text: a.text,
      duration_s: Math.round(a.durationS),
      hints_used: a.hintsUsed,
      covered_ids: a.coveredIds,
      missed_ids: a.missedIds,
      score: a.score,
    });
  if (res.error) throw new Error(`Couldn't save the attempt: ${res.error.message}`);
}

/** Puts cards into today's review (new ones go to the front of the new-card queue). */
export async function prioritizeCards(ids: string[]): Promise<void> {
  const res = await getSupabase().rpc("prioritize_cards", { p_ids: ids });
  if (res.error) throw new Error(res.error.message);
}

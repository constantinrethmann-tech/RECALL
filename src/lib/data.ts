import type { Card, ReviewLog } from "ts-fsrs";
import { dayBounds } from "./day";
import { rowToStudyCard, State } from "./fsrs";
import { chooseNewCards, planSession, type NewCandidate, type SessionState } from "./queue";
import { getSupabase } from "./supabase";
import {
  DEFAULT_SETTINGS,
  type CardRow,
  type Scope,
  type Settings,
  type SubjectRow,
  type TodayCounts,
  type UnitCounts,
  type UnitRow,
} from "./types";

type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>;

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Couldn't load ${what}: ${res.error.message}`);
  return res.data as T;
}

/** Supabase returns at most 1000 rows per request; this fetches every page. */
async function fetchAll<T>(what: string, page: (from: number, to: number) => Page): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const data = (check(await page(from, from + size - 1), what) ?? []) as T[];
    rows.push(...data);
    if (data.length < size) return rows;
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function loadSettings(): Promise<Settings> {
  const res = await getSupabase().from("settings").select("desired_retention,new_per_day,max_reviews_per_day,day_starts_at").maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(check(res, "settings") ?? {}) };
}

async function loadTree(): Promise<{ subjects: SubjectRow[]; units: UnitRow[] }> {
  const sb = getSupabase();
  const [subjects, units] = await Promise.all([
    sb.from("subjects").select("id,name,position").order("position").order("name"),
    sb.from("units").select("id,subject_id,name,position").order("position").order("name"),
  ]);
  return { subjects: check(subjects, "subjects") ?? [], units: check(units, "units") ?? [] };
}

async function loadToday(dayStart: Date): Promise<Map<string | null, TodayCounts>> {
  const res = await getSupabase().rpc("today_counts", { p_day_start: dayStart.toISOString() });
  const rows = (check(res, "today's reviews") ?? []) as TodayCounts[];
  return new Map(rows.map((r) => [r.subject_id, r]));
}

/** How many new cards each subject may still introduce today. */
function remainingNew(subjects: SubjectRow[], today: Map<string | null, TodayCounts>, settings: Settings) {
  return new Map(subjects.map((s) => [s.id, Math.max(0, settings.new_per_day - (today.get(s.id)?.new_done ?? 0))]));
}

function reviewsLeft(today: Map<string | null, TodayCounts>, settings: Settings) {
  let done = 0;
  for (const t of today.values()) done += t.review_done;
  return Math.max(0, settings.max_reviews_per_day - done);
}

// ─── Overview ────────────────────────────────────────────────────────────────

export interface Overview {
  subjects: SubjectRow[];
  units: UnitRow[];
  counts: Map<string, UnitCounts>;
  newLeft: Map<string, number>;
  reviewedToday: number;
  settings: Settings;
}

export async function loadOverview(now = new Date()): Promise<Overview> {
  const settings = await loadSettings();
  const { start, end } = dayBounds(now, settings.day_starts_at);
  const [tree, countsRes, today] = await Promise.all([
    loadTree(),
    getSupabase().rpc("unit_counts", { p_day_end: end.toISOString() }),
    loadToday(start),
  ]);
  const counts = (check(countsRes, "card counts") ?? []) as UnitCounts[];
  let reviewedToday = 0;
  for (const t of today.values()) reviewedToday += t.total_done;
  return {
    ...tree,
    counts: new Map(counts.map((c) => [c.unit_id, c])),
    newLeft: remainingNew(tree.subjects, today, settings),
    reviewedToday,
    settings,
  };
}

// ─── Study session ───────────────────────────────────────────────────────────

const CARD_COLUMNS =
  "id,subject_id,unit_id,section,front,back,front_image,back_image,tags,position,state,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,last_review";

export interface StudyLoad {
  title: string;
  subjects: Map<string, SubjectRow>;
  units: Map<string, UnitRow>;
  plan: SessionState;
  dayEnd: Date;
  settings: Settings;
}

export async function loadStudy(scope: Scope, now = new Date()): Promise<StudyLoad> {
  const sb = getSupabase();
  const settings = await loadSettings();
  const { start, end } = dayBounds(now, settings.day_starts_at);
  const [tree, today] = await Promise.all([loadTree(), loadToday(start)]);

  const subjects = new Map(tree.subjects.map((s) => [s.id, s]));
  const units = new Map(tree.units.map((u) => [u.id, u]));
  let title = "All subjects";
  if (scope.kind === "subject") title = subjects.get(scope.id)?.name ?? "Subject";
  if (scope.kind === "unit") title = units.get(scope.id)?.name ?? "Unit";

  // Supabase query builders only run when awaited, so a fresh one is built for every page.
  const inScope: Record<string, string> =
    scope.kind === "unit" ? { unit_id: scope.id } : scope.kind === "subject" ? { subject_id: scope.id } : {};

  const dueRows = await fetchAll<CardRow>("due cards", (from, to) =>
    sb
      .from("cards")
      .select(CARD_COLUMNS)
      .match(inScope)
      .neq("state", State.New)
      .lt("due", end.toISOString())
      .eq("suspended", false)
      .order("due")
      .range(from, to),
  );

  const candidates = await fetchAll<{ id: string; subject_id: string; unit_id: string; position: number }>(
    "new cards",
    (from, to) =>
      sb
        .from("cards")
        .select("id,subject_id,unit_id,position")
        .match(inScope)
        .eq("state", State.New)
        .eq("suspended", false)
        .order("id")
        .range(from, to),
  );
  const newIds = chooseNewCards(
    candidates.map<NewCandidate>((c) => ({ id: c.id, subjectId: c.subject_id, unitId: c.unit_id, position: c.position })),
    new Map(tree.units.map((u) => [u.id, u.position])),
    remainingNew(tree.subjects, today, settings),
  );
  const freshRows: CardRow[] = [];
  for (const ids of chunks(newIds, 100)) {
    freshRows.push(...((check(await sb.from("cards").select(CARD_COLUMNS).in("id", ids), "new cards") ?? []) as CardRow[]));
  }
  const order = new Map(newIds.map((id, i) => [id, i]));
  freshRows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  return {
    title,
    subjects,
    units,
    plan: planSession(dueRows.map(rowToStudyCard), freshRows.map(rowToStudyCard), reviewsLeft(today, settings)),
    dayEnd: end,
    settings,
  };
}

// ─── Saving ratings ──────────────────────────────────────────────────────────

/** Saves a rating (new schedule + review log) in one step. Returns the log id, needed for undo. */
export async function recordReview(cardId: string, next: Card, log: ReviewLog, durationMs: number): Promise<string> {
  const res = await getSupabase().rpc("record_review", {
    p_card_id: cardId,
    p_card: next,
    p_log: log,
    p_duration_ms: Math.round(durationMs),
  });
  if (res.error) throw new Error(res.error.message);
  return res.data as string;
}

export async function undoReview(logId: string, cardId: string, previous: Card): Promise<void> {
  const res = await getSupabase().rpc("undo_review", { p_log_id: logId, p_card_id: cardId, p_card: previous });
  if (res.error) throw new Error(res.error.message);
}

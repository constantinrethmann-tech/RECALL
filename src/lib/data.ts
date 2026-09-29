import type { Card, ReviewLog } from "ts-fsrs";
import { checkMemory, effectiveRetention, type MemoryCheck } from "./calibration";
import { dayBounds } from "./day";
import { baselineThinkMs } from "./effort";
import { makeScheduler, rowToStudyCard, State } from "./fsrs";
import { chooseNewCards, planSession, shuffle, type NewCandidate, type SessionState } from "./queue";
import { computeStreak, isoDay } from "./streak";
import { getSupabase } from "./supabase";
import { tagLabel } from "./tags";
import {
  DEFAULT_SETTINGS,
  type CardRow,
  type Scope,
  type Settings,
  type StudyMode,
  type SubjectRow,
  type TagCounts,
  type TodayCounts,
  type UnitCounts,
  type UnitRow,
} from "./types";

type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Couldn't load ${what}: ${res.error.message}`);
  return res.data as T;
}

/** Supabase returns at most 1000 rows per request; this fetches every page. */
export async function fetchAll<T>(what: string, page: (from: number, to: number) => Page): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const data = (check(await page(from, from + size - 1), what) ?? []) as T[];
    rows.push(...data);
    if (data.length < size) return rows;
  }
}

export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function loadSettings(): Promise<Settings> {
  const res = await getSupabase().from("settings").select("desired_retention,new_per_day,new_per_day_total,max_reviews_per_day,maximum_interval,day_starts_at").maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(check(res, "settings") ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const res = await sb
    .from("settings")
    .upsert({ user_id: data.session?.user.id, ...settings, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (res.error) throw new Error(`Couldn't save settings: ${res.error.message}`);
}

export async function loadTree(): Promise<{ subjects: SubjectRow[]; units: UnitRow[] }> {
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

/** How many new cards may still be introduced today, all subjects together. */
function totalNewLeft(today: Map<string | null, TodayCounts>, settings: Settings) {
  let done = 0;
  for (const t of today.values()) done += t.new_done;
  return Math.max(0, settings.new_per_day_total - done);
}

function reviewsLeft(today: Map<string | null, TodayCounts>, settings: Settings) {
  let done = 0;
  for (const t of today.values()) done += t.review_done;
  return Math.max(0, settings.max_reviews_per_day - done);
}

async function loadStreak(settings: Settings, now: Date): Promise<number> {
  const res = await getSupabase().rpc("review_days", {
    p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    p_day_start_hour: settings.day_starts_at,
  });
  const rows = (check(res, "study days") ?? []) as { day: string }[];
  return computeStreak(
    rows.map((r) => r.day),
    isoDay(dayBounds(now, settings.day_starts_at).start),
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

export interface Overview {
  subjects: SubjectRow[];
  units: UnitRow[];
  counts: Map<string, UnitCounts>;
  /** Per subject: its tags with counts. */
  tags: Map<string, TagCounts[]>;
  newLeft: Map<string, number>;
  /** New cards still allowed today, all subjects together. */
  newLeftTotal: number;
  reviewedToday: number;
  streak: number;
  settings: Settings;
}

export async function loadOverview(now = new Date()): Promise<Overview> {
  const settings = await loadSettings();
  const { start, end } = dayBounds(now, settings.day_starts_at);
  const sb = getSupabase();
  const [tree, countsRes, tagsRes, today, streak] = await Promise.all([
    loadTree(),
    sb.rpc("unit_counts", { p_day_end: end.toISOString() }),
    sb.rpc("tag_counts", { p_day_end: end.toISOString() }),
    loadToday(start),
    loadStreak(settings, now),
  ]);
  const counts = (check(countsRes, "card counts") ?? []) as UnitCounts[];
  const tagRows = (check(tagsRes, "tags") ?? []) as TagCounts[];
  const tags = new Map<string, TagCounts[]>();
  for (const t of tagRows) tags.set(t.subject_id, [...(tags.get(t.subject_id) ?? []), t]);
  let reviewedToday = 0;
  for (const t of today.values()) reviewedToday += t.total_done;
  return {
    ...tree,
    counts: new Map(counts.map((c) => [c.unit_id, c])),
    tags,
    newLeft: remainingNew(tree.subjects, today, settings),
    newLeftTotal: totalNewLeft(today, settings),
    reviewedToday,
    streak,
    settings,
  };
}

// ─── Study session ───────────────────────────────────────────────────────────

export const CARD_COLUMNS =
  "id,subject_id,unit_id,section,front,back,front_image,back_image,explain,kind,extra,tags,position,state,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,last_review";

export interface StudyLoad {
  title: string;
  subjects: Map<string, SubjectRow>;
  units: Map<string, UnitRow>;
  plan: SessionState;
  dayEnd: Date;
  settings: Settings;
  /** Target retention actually used: your setting, raised if the memory check shows you forget faster. */
  retention: number;
  memory: MemoryCheck;
  /** Your usual recall time, for the slow-answer signal. */
  thinkBaselineMs: number;
}

// Supabase's query types are too deep for a generic helper, so this one is loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CardQuery = any;

/** Adds the selection's filters (subject, unit, tag, trouble) to a cards query. */
function filtered(q: CardQuery, scope: Scope): CardQuery {
  const match: Record<string, string> = {};
  if (scope.subjectId) match.subject_id = scope.subjectId;
  if (scope.unitId) match.unit_id = scope.unitId;
  let out = Object.keys(match).length ? q.match(match) : q;
  if (scope.tag) out = out.contains("tags", [scope.tag]);
  if (scope.trouble) out = out.neq("state", State.New).or("lapses.gte.2,difficulty.gte.7.5");
  return out;
}

export function scopeTitle(scope: Scope, subjects: Map<string, SubjectRow>, units: Map<string, UnitRow>): string {
  const base = scope.unitId
    ? (units.get(scope.unitId)?.name ?? "Unit")
    : scope.subjectId
      ? (subjects.get(scope.subjectId)?.name ?? "Subject")
      : "All subjects";
  const extras = [scope.tag && tagLabel(scope.tag), scope.trouble && "Trouble cards"].filter(Boolean);
  return [base, ...extras].join(" · ");
}

async function loadThinkSamples(): Promise<number[]> {
  const res = await getSupabase()
    .from("review_logs")
    .select("think_ms")
    .eq("state", State.Review)
    .gte("rating", 3)
    .not("think_ms", "is", null)
    .order("review", { ascending: false })
    .limit(300);
  return ((check(res, "recall times") ?? []) as { think_ms: number }[]).map((r) => r.think_ms);
}

/** Compares FSRS's predictions with your real results on recent reviews (see calibration.ts). */
export async function loadMemoryCheck(): Promise<MemoryCheck> {
  const res = await getSupabase()
    .from("review_logs")
    .select("rating,elapsed_days,stability")
    .eq("state", State.Review)
    .gte("elapsed_days", 1)
    .order("review", { ascending: false })
    .limit(600);
  const rows = (check(res, "past reviews") ?? []) as { rating: number; elapsed_days: number; stability: number }[];
  return checkMemory(rows.map((r) => ({ days: r.elapsed_days, stability: r.stability, recalled: r.rating > 1 })));
}

export async function loadStudy(scope: Scope, mode: StudyMode, now = new Date()): Promise<StudyLoad> {
  const sb = getSupabase();
  const settings = await loadSettings();
  const { start, end } = dayBounds(now, settings.day_starts_at);
  const learn = mode === "learn";
  const [tree, today, thinkSamples, memory] = await Promise.all([
    loadTree(),
    loadToday(start),
    learn ? loadThinkSamples() : [],
    learn ? loadMemoryCheck() : checkMemory([]),
  ]);
  const subjects = new Map(tree.subjects.map((s) => [s.id, s]));
  const units = new Map(tree.units.map((u) => [u.id, u]));
  const retention = effectiveRetention(settings.desired_retention, memory.k);
  const base = { subjects, units, dayEnd: end, settings, retention, memory, thinkBaselineMs: baselineThinkMs(thinkSamples) };

  if (mode === "cram") {
    const rows = await fetchAll<CardRow>("cards", (from, to) =>
      filtered(sb.from("cards").select(CARD_COLUMNS), scope).eq("suspended", false).order("id").range(from, to),
    );
    return { ...base, title: `Cram · ${scopeTitle(scope, subjects, units)}`, plan: { learning: [], main: shuffle(rows.map(rowToStudyCard)) } };
  }

  const dueRows = await fetchAll<CardRow>("due cards", (from, to) =>
    filtered(sb.from("cards").select(CARD_COLUMNS), scope)
      .neq("state", State.New)
      .lt("due", end.toISOString())
      .eq("suspended", false)
      .order("due")
      .range(from, to),
  );

  let freshRows: CardRow[] = [];
  if (!scope.trouble) {
    const candidates = await fetchAll<{ id: string; subject_id: string; unit_id: string; position: number }>("new cards", (from, to) =>
      filtered(sb.from("cards").select("id,subject_id,unit_id,position"), scope)
        .eq("state", State.New)
        .eq("suspended", false)
        .order("id")
        .range(from, to),
    );
    const newIds = chooseNewCards(
      candidates.map<NewCandidate>((c) => ({ id: c.id, subjectId: c.subject_id, unitId: c.unit_id, position: c.position })),
      new Map(tree.units.map((u) => [u.id, u.position])),
      remainingNew(tree.subjects, today, settings),
      totalNewLeft(today, settings),
    );
    for (const ids of chunks(newIds, 100)) {
      freshRows.push(...((check(await sb.from("cards").select(CARD_COLUMNS).in("id", ids), "new cards") ?? []) as CardRow[]));
    }
    const order = new Map(newIds.map((id, i) => [id, i]));
    freshRows = freshRows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }

  const scheduler = makeScheduler(retention, settings.maximum_interval);
  return {
    ...base,
    title: scopeTitle(scope, subjects, units),
    plan: planSession(dueRows.map(rowToStudyCard), freshRows.map(rowToStudyCard), reviewsLeft(today, settings), (c) =>
      scheduler.get_retrievability(c.sched, now, false),
    ),
  };
}

// ─── Saving ratings ──────────────────────────────────────────────────────────

/** Saves a rating (new schedule + review log) in one step. Returns the log id, needed for undo. */
export async function recordReview(cardId: string, next: Card, log: ReviewLog, durationMs: number, thinkMs: number | null): Promise<string> {
  const res = await getSupabase().rpc("record_review", {
    p_card_id: cardId,
    p_card: next,
    p_log: log,
    p_duration_ms: Math.round(durationMs),
    p_think_ms: thinkMs === null ? null : Math.round(thinkMs),
  });
  if (res.error) throw new Error(res.error.message);
  return res.data as string;
}

export async function undoReview(logId: string, cardId: string, previous: Card): Promise<void> {
  const res = await getSupabase().rpc("undo_review", { p_log_id: logId, p_card_id: cardId, p_card: previous });
  if (res.error) throw new Error(res.error.message);
}

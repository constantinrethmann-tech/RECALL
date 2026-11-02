import type { Scope, StudyMode } from "./types";

export function scopeFromParams(params: URLSearchParams): { scope: Scope; mode: StudyMode } {
  const scope: Scope = {};
  const subject = params.get("subject");
  const unit = params.get("unit");
  const group = params.get("group");
  const tag = params.get("tag");
  if (subject) scope.subjectId = subject;
  if (unit) scope.unitId = unit;
  if (group) scope.group = group;
  if (tag) scope.tag = tag;
  if (params.get("trouble") === "1") scope.trouble = true;
  return { scope, mode: params.get("mode") === "cram" ? "cram" : "learn" };
}

/** Link to the study screen for a selection, e.g. /study/?subject=…&tag=exam&mode=cram */
export function studyHref(scope: Scope, mode: StudyMode = "learn"): string {
  const p = new URLSearchParams();
  if (scope.subjectId) p.set("subject", scope.subjectId);
  if (scope.unitId) p.set("unit", scope.unitId);
  if (scope.group) p.set("group", scope.group);
  if (scope.tag) p.set("tag", scope.tag);
  if (scope.trouble) p.set("trouble", "1");
  if (mode === "cram") p.set("mode", "cram");
  const q = p.toString();
  return q ? `/study/?${q}` : "/study/";
}

export const scopeKey = (scope: Scope, mode: StudyMode) => studyHref(scope, mode);

export const sameScope = (a: Scope | undefined, b: Scope) =>
  !!a && a.subjectId === b.subjectId && a.unitId === b.unitId && a.group === b.group && a.tag === b.tag && !!a.trouble === !!b.trouble;

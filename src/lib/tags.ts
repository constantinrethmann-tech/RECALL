/** Tags shown as their own foldable section of units (e.g. "midterm"), not as a chip. */
export function isSectionTag(tag: string): boolean {
  return /^(midterm|final|exam)(-.+)?$/i.test(tag) && !/^exam-extra$/i.test(tag);
}

/** "exam" → "Exam", "case-study-1" → "Case study 1". */
export function tagLabel(tag: string): string {
  const words = tag.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const rank = (tag: string) => (tag === "exam" ? 0 : tag.startsWith("case-study") || tag.startsWith("case") ? 1 : 2);

/** Exam first, then case studies (1, 2, … 10 in natural order), then everything else. */
export function sortTags(tags: string[]): string[] {
  return [...tags].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }));
}

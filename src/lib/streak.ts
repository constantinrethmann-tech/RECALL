/** "YYYY-MM-DD" of a local date. */
export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function previousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d - 1));
}

/**
 * Consecutive study days ending today. If you haven't studied yet today, the streak
 * still counts up to yesterday (it only breaks once a whole day is missed).
 */
export function computeStreak(studyDays: string[], today: string): number {
  const days = new Set(studyDays);
  let day = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}

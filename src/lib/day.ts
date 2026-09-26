/**
 * Like Anki, a study "day" starts at a fixed hour (default 4:00) in local time,
 * so a late-night session still counts for the same day.
 */
export function dayBounds(now: Date, startHour = 4): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(startHour, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

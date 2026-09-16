import { dateKeyForTimezone, formatDateTimeForTimezone, type ResolvedTimezone } from "../schedule/timezone.js";

export function monthlyHistory<T>(items: T[], timestamp: (item: T) => number, timezone: ResolvedTimezone) {
  const months = new Map<string, { key: string; label: string; items: T[] }>();
  for (const item of [...items].sort((a, b) => timestamp(b) - timestamp(a))) {
    const date = new Date(timestamp(item));
    const key = dateKeyForTimezone(date, timezone).slice(0, 7);
    if (!months.has(key)) months.set(key, { key, label: formatDateTimeForTimezone(date, timezone, { month: "long", year: "numeric" }), items: [] });
    months.get(key)!.items.push(item);
  }
  return [...months.values()];
}

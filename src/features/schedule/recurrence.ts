import { Timestamp } from "firebase/firestore";
import type { LessonOccurrence } from "../../lib/firebase/services/materializeLessonSeries.js";
import type { LessonSeries } from "../../lib/firebase/types.js";
import { localDateInTimezone, zonedLocalDateTimeToDate } from "./timezone.js";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const ROLLING_HORIZON_WEEKS = 12;

function dateOnlyToUtc(date: string): Date {
  if (!datePattern.test(date)) throw new Error(`Invalid date-only value: ${date}`);
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  const result = dateOnlyToUtc(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function isoWeekday(date: string): number {
  const weekday = dateOnlyToUtc(date).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function daysBetween(left: string, right: string): number {
  return Math.floor((dateOnlyToUtc(right).getTime() - dateOnlyToUtc(left).getTime()) / 86_400_000);
}

export function generateRollingOccurrences(
  series: Pick<
    LessonSeries,
    | "weekdays"
    | "interval"
    | "startLocalTime"
    | "durationMinutes"
    | "baseTimezone"
  > & Pick<LessonSeries, "startsOn" | "endsOn">,
  now = new Date(),
  horizonWeeks = ROLLING_HORIZON_WEEKS,
): LessonOccurrence[] {
  if (series.interval < 1 || !Number.isInteger(series.interval)) {
    throw new Error("Lesson series interval must be a positive integer");
  }
  if (series.weekdays.some((weekday) => weekday < 1 || weekday > 7)) {
    throw new Error("Lesson series weekdays must use ISO values 1..7");
  }
  if (!series.startsOn && series.interval > 1) {
    throw new Error("Legacy recurring series with interval > 1 requires startsOn migration");
  }

  const today = localDateInTimezone(now, series.baseTimezone);
  const anchor = series.startsOn ?? today;
  const firstDate = anchor > today ? anchor : today;
  const horizonEnd = addDays(today, horizonWeeks * 7);
  const lastDate = series.endsOn && series.endsOn < horizonEnd ? series.endsOn : horizonEnd;
  const allowedWeekdays = new Set(series.weekdays);
  const occurrences: LessonOccurrence[] = [];

  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    const weekIndex = Math.floor(Math.max(0, daysBetween(anchor, date)) / 7);
    if (!allowedWeekdays.has(isoWeekday(date)) || weekIndex % series.interval !== 0) {
      continue;
    }
    const start = zonedLocalDateTimeToDate(date, series.startLocalTime, series.baseTimezone);
    const end = new Date(start.getTime() + series.durationMinutes * 60_000);
    occurrences.push({ startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end) });
  }
  return occurrences;
}

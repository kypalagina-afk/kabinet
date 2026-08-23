import {
  dateRangeForTimezone,
  type ResolvedTimezone,
} from "./timezone.js";

export type CalendarView = "month" | "week" | "day";

function dateFromKey(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

export function addCalendarDays(value: string, amount: number): string {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function addCalendarMonths(value: string, amount: number): string {
  const source = dateFromKey(value);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + amount, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function calendarWeekDates(focusDate: string): string[] {
  const start = dateFromKey(focusDate);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(start);
    value.setUTCDate(start.getUTCDate() + index);
    return value.toISOString().slice(0, 10);
  });
}

export function calendarMonthDates(focusDate: string): string[] {
  const focus = dateFromKey(focusDate);
  const first = new Date(Date.UTC(focus.getUTCFullYear(), focus.getUTCMonth(), 1, 12));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(first);
    value.setUTCDate(first.getUTCDate() + index);
    return value.toISOString().slice(0, 10);
  });
}

export function calendarVisibleDates(view: CalendarView, focusDate: string): string[] {
  if (view === "day") return [focusDate];
  if (view === "week") return calendarWeekDates(focusDate);
  return calendarMonthDates(focusDate);
}

export function calendarQueryRange(
  view: CalendarView,
  focusDate: string,
  timezone: ResolvedTimezone,
) {
  const dates = calendarVisibleDates(view, focusDate);
  return dateRangeForTimezone(
    dates[0]!,
    addCalendarDays(dates.at(-1)!, 1),
    timezone,
  );
}

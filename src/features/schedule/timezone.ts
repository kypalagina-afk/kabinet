import type { UserProfile } from "../../lib/firebase/types.js";

export type TimeDisplayMode = "mine" | "moscow" | "student";
export type TimezonePreference = UserProfile["timezone"];

export interface ResolvedTimezone {
  kind: "iana" | "offset";
  label: string;
  iana: string | null;
  offsetMinutes: number | null;
}

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})$/;

function assertIanaTimezone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date(0));
    return timeZone;
  } catch (error) {
    throw new Error(`Invalid IANA timezone: ${timeZone}`, { cause: error });
  }
}

export function resolveTimezone(
  preference: TimezonePreference | null | undefined,
  fallbackIana = "Europe/Moscow",
): ResolvedTimezone {
  if (preference?.iana) {
    const iana = assertIanaTimezone(preference.iana);
    return { kind: "iana", label: iana, iana, offsetMinutes: null };
  }
  if (typeof preference?.moscowOffsetMinutes === "number") {
    // Legacy Phase 3 values store the difference from Moscow, not the UTC
    // offset: 240 means МСК+4 (UTC+7). IANA remains the primary source.
    const offsetMinutes = 180 + preference.moscowOffsetMinutes;
    const sign = offsetMinutes >= 0 ? "+" : "−";
    const absolute = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
    const minutes = String(absolute % 60).padStart(2, "0");
    return {
      kind: "offset",
      label: `UTC${sign}${hours}:${minutes}`,
      iana: null,
      offsetMinutes,
    };
  }
  const iana = assertIanaTimezone(fallbackIana);
  return { kind: "iana", label: iana, iana, offsetMinutes: null };
}

function partsForDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function offsetAt(date: Date, timeZone: string): number {
  const parts = partsForDate(date, timeZone);
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - date.getTime()
  );
}

export function timezoneUtcOffsetMinutes(
  date: Date,
  timezone: ResolvedTimezone,
): number {
  if (timezone.kind === "iana" && timezone.iana) {
    return Math.round(offsetAt(date, timezone.iana) / 60_000);
  }
  return timezone.offsetMinutes ?? 0;
}

export function moscowDifferenceHours(
  date: Date,
  timezone: ResolvedTimezone,
): number {
  const moscow = resolveTimezone({
    iana: "Europe/Moscow",
    moscowOffsetMinutes: 180,
  });
  return Math.round(
    (timezoneUtcOffsetMinutes(date, timezone) -
      timezoneUtcOffsetMinutes(date, moscow)) /
      60,
  );
}

export function moscowTimezoneLabel(
  date: Date,
  timezone: ResolvedTimezone,
): string {
  const difference = moscowDifferenceHours(date, timezone);
  return difference === 0
    ? "МСК"
    : `МСК${difference > 0 ? "+" : "−"}${Math.abs(difference)}`;
}

export function zonedLocalDateTimeToDate(
  localDate: string,
  localTime: string,
  timeZone: string,
): Date {
  const dateMatch = datePattern.exec(localDate);
  const timeMatch = timePattern.exec(localTime);
  if (!dateMatch || !timeMatch) {
    throw new Error(`Invalid local date/time: ${localDate} ${localTime}`);
  }
  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const localAsUtc = Date.UTC(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
  );
  const iana = assertIanaTimezone(timeZone);
  let result = new Date(localAsUtc - offsetAt(new Date(localAsUtc), iana));
  const correctedOffset = offsetAt(result, iana);
  result = new Date(localAsUtc - correctedOffset);
  return result;
}

export function localDateInTimezone(date: Date, timeZone: string): string {
  const parts = partsForDate(date, assertIanaTimezone(timeZone));
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatDateTimeForTimezone(
  date: Date,
  timezone: ResolvedTimezone,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const baseOptions: Intl.DateTimeFormatOptions =
    Object.keys(options).length > 0
      ? options
      : {
          dateStyle: "medium",
          timeStyle: "short",
        };
  if (timezone.kind === "iana" && timezone.iana) {
    return new Intl.DateTimeFormat("ru-RU", {
      ...baseOptions,
      timeZone: timezone.iana,
    }).format(date);
  }
  const shifted = new Date(date.getTime() + (timezone.offsetMinutes ?? 0) * 60_000);
  return new Intl.DateTimeFormat("ru-RU", {
    ...baseOptions,
    timeZone: "UTC",
  }).format(shifted);
}

export function dateKeyForTimezone(date: Date, timezone: ResolvedTimezone): string {
  if (timezone.kind === "iana" && timezone.iana) {
    return localDateInTimezone(date, timezone.iana);
  }
  const shifted = new Date(date.getTime() + (timezone.offsetMinutes ?? 0) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function dateRangeForTimezone(
  startDate: string,
  endDateExclusive: string,
  timezone: ResolvedTimezone,
): { start: Date; end: Date } {
  if (timezone.kind === "iana" && timezone.iana) {
    return {
      start: zonedLocalDateTimeToDate(startDate, "00:00", timezone.iana),
      end: zonedLocalDateTimeToDate(endDateExclusive, "00:00", timezone.iana),
    };
  }
  const offset = (timezone.offsetMinutes ?? 0) * 60_000;
  return {
    start: new Date(Date.parse(`${startDate}T00:00:00.000Z`) - offset),
    end: new Date(Date.parse(`${endDateExclusive}T00:00:00.000Z`) - offset),
  };
}

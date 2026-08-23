import { describe, expect, test } from "vitest";
import { generateRollingOccurrences } from "../../src/features/schedule/recurrence.js";
import {
  dateKeyForTimezone,
  formatDateTimeForTimezone,
  moscowTimezoneLabel,
  resolveTimezone,
  zonedLocalDateTimeToDate,
} from "../../src/features/schedule/timezone.js";

describe("timezone conversion", () => {
  test("converts the Lera schedule from Europe/Moscow to an absolute instant", () => {
    expect(
      zonedLocalDateTimeToDate("2026-08-20", "10:00", "Europe/Moscow").toISOString(),
    ).toBe("2026-08-20T07:00:00.000Z");
  });

  test("uses IANA daylight-saving rules instead of a fixed offset", () => {
    expect(
      zonedLocalDateTimeToDate("2026-01-15", "10:00", "Europe/Berlin").toISOString(),
    ).toBe("2026-01-15T09:00:00.000Z");
    expect(
      zonedLocalDateTimeToDate("2026-07-15", "10:00", "Europe/Berlin").toISOString(),
    ).toBe("2026-07-15T08:00:00.000Z");
  });

  test("falls back to moscowOffsetMinutes for display only", () => {
    const timezone = resolveTimezone({ iana: null, moscowOffsetMinutes: 240 });
    expect(timezone.label).toBe("UTC+07:00");
    expect(dateKeyForTimezone(new Date("2026-08-14T21:30:00.000Z"), timezone)).toBe(
      "2026-08-15",
    );
    expect(formatDateTimeForTimezone(new Date("2026-08-14T06:00:00.000Z"), timezone)).toContain(
      "13:00",
    );
    expect(moscowTimezoneLabel(new Date("2026-08-14T06:00:00.000Z"), timezone)).toBe("МСК+4");
  });

  test("derives МСК+4 dynamically for a UTC+7 teacher IANA timezone", () => {
    const teacherTimezone = resolveTimezone({
      iana: "Asia/Novosibirsk",
      moscowOffsetMinutes: 240,
    });
    const instant = new Date("2026-08-23T06:00:00.000Z");
    expect(moscowTimezoneLabel(instant, teacherTimezone)).toBe("МСК+4");
    expect(formatDateTimeForTimezone(instant, teacherTimezone, {
      hour: "2-digit",
      minute: "2-digit",
    })).toContain("13:00");
  });
});

describe("rolling recurrence", () => {
  const series = {
    weekdays: [4],
    interval: 1,
    startLocalTime: "10:00",
    durationMinutes: 60,
    baseTimezone: "Europe/Moscow",
    startsOn: "2026-08-13",
    endsOn: null,
  };

  test("generates Thursday lessons for a rolling twelve-week horizon without duplicates", () => {
    const occurrences = generateRollingOccurrences(
      series,
      new Date("2026-08-14T00:00:00.000Z"),
    );
    expect(occurrences).toHaveLength(12);
    expect(occurrences[0]?.startAt.toDate().toISOString()).toBe("2026-08-20T07:00:00.000Z");
    expect(new Set(occurrences.map(({ startAt }) => startAt.toMillis())).size).toBe(
      occurrences.length,
    );
  });

  test("honours endsOn and keeps one-hour duration", () => {
    const occurrences = generateRollingOccurrences(
      { ...series, endsOn: "2026-08-27" },
      new Date("2026-08-14T00:00:00.000Z"),
    );
    expect(occurrences).toHaveLength(2);
    expect(occurrences.every(({ startAt, endAt }) => endAt.toMillis() - startAt.toMillis() === 3_600_000)).toBe(true);
  });

  test("requires startsOn for legacy multi-week intervals", () => {
    expect(() =>
      generateRollingOccurrences(
        { ...series, interval: 2, startsOn: null },
        new Date("2026-08-14T00:00:00.000Z"),
      ),
    ).toThrow("requires startsOn migration");
  });
});

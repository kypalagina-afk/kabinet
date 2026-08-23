import { describe, expect, test } from "vitest";
import {
  calendarMonthDates,
  calendarQueryRange,
  calendarVisibleDates,
  calendarWeekDates,
} from "../../src/features/schedule/calendarRange.js";
import { resolveTimezone } from "../../src/features/schedule/timezone.js";

describe("calendar focusDate ranges", () => {
  const moscow = resolveTimezone({ iana: "Europe/Moscow", moscowOffsetMinutes: 180 });

  test("day view queries the exact focus day in the selected timezone", () => {
    const range = calendarQueryRange("day", "2026-08-23", moscow);
    expect(calendarVisibleDates("day", "2026-08-23")).toEqual(["2026-08-23"]);
    expect(range.start.toISOString()).toBe("2026-08-22T21:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-23T21:00:00.000Z");
  });

  test("week view is the real Monday-Sunday week containing focusDate", () => {
    expect(calendarWeekDates("2026-08-23")).toEqual([
      "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20",
      "2026-08-21", "2026-08-22", "2026-08-23",
    ]);
  });

  test("month view covers all 42 visible cells including outside-month days", () => {
    const dates = calendarMonthDates("2026-08-23");
    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe("2026-07-27");
    expect(dates.at(-1)).toBe("2026-09-06");
    const range = calendarQueryRange("month", "2026-08-23", moscow);
    expect(range.start.toISOString()).toBe("2026-07-26T21:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-06T21:00:00.000Z");
  });
});

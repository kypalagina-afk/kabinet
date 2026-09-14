import { expect, test } from "vitest";
import { generateRollingOccurrences } from "../../src/features/schedule/recurrence.js";

const series = { weekdays: [5], interval: 1, startLocalTime: "18:00", durationMinutes: 60, baseTimezone: "Europe/Moscow", startsOn: "2026-09-10", endsOn: null };
const now = new Date("2026-09-14T09:00:00Z");
test("explicit series creation includes last Friday from the selected start date", () => {
  const occurrences = generateRollingOccurrences(series, now, 12, true);
  expect(occurrences[0]?.startAt.toDate().toISOString()).toBe("2026-09-11T15:00:00.000Z");
  expect(occurrences).toHaveLength(13);
});
test("ordinary rolling refresh only generates current and future dates", () => {
  expect(generateRollingOccurrences(series, now)[0]?.startAt.toDate().toISOString()).toBe("2026-09-18T15:00:00.000Z");
});
test("backfill respects end dates and every-other-week intervals", () => {
  const occurrences = generateRollingOccurrences({ ...series, interval: 2, endsOn: "2026-09-30" }, now, 12, true);
  expect(occurrences.map((item) => item.startAt.toDate().toISOString().slice(0, 10))).toEqual(["2026-09-11", "2026-09-25"]);
  expect(generateRollingOccurrences({ ...series, endsOn: "2026-09-12" }, now, 12, true)).toHaveLength(1);
});

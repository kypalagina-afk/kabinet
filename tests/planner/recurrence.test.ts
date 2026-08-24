import { describe, expect, test } from "vitest";
import {
  plannerOccurrenceId,
  plannerRecurrenceDates,
  plannerRecurrenceHorizon,
  plannerRecurrenceWeekdays,
} from "../../src/features/planner/recurrence.js";

describe("planner recurrence", () => {
  test("supports every day and weekdays", () => {
    expect(plannerRecurrenceDates({
      pattern: "daily", weekdays: [], startsOn: "2026-08-21", endsOn: null,
    }, "2026-08-21", "2026-08-24")).toEqual([
      "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24",
    ]);
    expect(plannerRecurrenceDates({
      pattern: "weekdays", weekdays: [], startsOn: "2026-08-21", endsOn: null,
    }, "2026-08-21", "2026-08-24")).toEqual(["2026-08-21", "2026-08-24"]);
  });

  test("supports any custom weekday combination", () => {
    expect(plannerRecurrenceDates({
      pattern: "custom", weekdays: [2, 3], startsOn: "2026-08-24", endsOn: "2026-09-02",
    }, "2026-08-24", "2026-09-30")).toEqual([
      "2026-08-25", "2026-08-26", "2026-09-01", "2026-09-02",
    ]);
    expect(plannerRecurrenceWeekdays("custom", [3, 2, 3])).toEqual([2, 3]);
  });

  test("uses a 12-week horizon and deterministic occurrence ids", () => {
    expect(plannerRecurrenceHorizon("2026-08-24")).toBe("2026-11-16");
    expect(plannerOccurrenceId("series-1", "2026-08-25")).toBe("series-1__2026-08-25");
    expect(plannerOccurrenceId("series-1", "2026-08-25")).toBe(
      plannerOccurrenceId("series-1", "2026-08-25"),
    );
  });

  test("rejects an empty custom selection and an invalid range", () => {
    expect(() => plannerRecurrenceWeekdays("custom", [])).toThrow("Выберите хотя бы один день недели");
    expect(() => plannerRecurrenceDates({
      pattern: "daily", weekdays: [], startsOn: "2026-08-25", endsOn: "2026-08-24",
    }, "2026-08-24", "2026-09-01")).toThrow("Дата окончания");
  });
});

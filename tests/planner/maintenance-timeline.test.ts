import { describe, expect, test } from "vitest";
import {
  plannerItemsToCarryForward,
  plannerItemsToDeleteForMonthlyCleanup,
} from "../../src/features/planner/maintenance.js";
import {
  plannerIntervalEnd,
  plannerTimelineBounds,
} from "../../src/features/planner/timeline.js";
import type { DocumentWithId, PlannerItem } from "../../src/lib/firebase/types.js";

function item(id: string, patch: Partial<PlannerItem>): DocumentWithId<PlannerItem> {
  return {
    id,
    data: {
      teacherId: "teacher-1",
      itemType: "task",
      title: id,
      category: "work",
      status: "todo",
      date: "2026-08-24",
      startTime: null,
      endTime: null,
      durationMinutes: null,
      deadline: null,
      notes: null,
      priority: "medium",
      goalId: null,
      subgoalId: null,
      sortOrder: 1,
      completedAt: null,
      active: true,
      schemaVersion: 1,
      createdAt: {} as PlannerItem["createdAt"],
      updatedAt: {} as PlannerItem["updatedAt"],
      ...patch,
    },
  };
}

describe("personal planner maintenance", () => {
  test("carries only unfinished one-off dated tasks", () => {
    const result = plannerItemsToCarryForward([
      item("one-off", {}),
      item("done", { status: "done" }),
      item("recurring", { recurrenceSeriesId: "series-1" }),
      item("someday", { category: "someday", date: null, status: "backlog" }),
      item("today", { date: "2026-08-26" }),
    ], "2026-08-26");
    expect(result.map(({ id }) => id)).toEqual(["one-off"]);
  });

  test("monthly cleanup deletes only old completed or archived one-offs", () => {
    const result = plannerItemsToDeleteForMonthlyCleanup([
      item("old-done", { date: "2026-07-31", status: "done" }),
      item("old-archived", { date: "2026-07-15", active: false }),
      item("old-open", { date: "2026-07-01" }),
      item("old-recurring", { date: "2026-07-01", status: "done", recurrenceSeriesId: "series-1" }),
      item("current-done", { date: "2026-08-01", status: "done" }),
    ], "2026-08-26");
    expect(result.map(({ id }) => id)).toEqual(["old-done", "old-archived"]);
  });
});

describe("planner timeline", () => {
  test("uses 06:00–24:00 by default and expands to an early event", () => {
    expect(plannerTimelineBounds([])).toEqual({ start: 360, end: 1440 });
    expect(plannerTimelineBounds([{ startTime: "05:10", endTime: "06:20" }]))
      .toEqual({ start: 300, end: 1440 });
  });

  test("prefers explicit end time and otherwise uses duration", () => {
    expect(plannerIntervalEnd({ startTime: "11:00", endTime: "12:15", durationMinutes: 30 })).toBe(735);
    expect(plannerIntervalEnd({ startTime: "11:00", durationMinutes: 90 })).toBe(750);
  });
});

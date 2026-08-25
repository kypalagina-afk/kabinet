import { describe, expect, test } from "vitest";
import { plannerCategoryCounts, sortPlannerItems } from "../../src/features/planner/sorting.js";
import type { DocumentWithId, PlannerItem } from "../../src/lib/firebase/types.js";

function item(id: string, patch: Partial<PlannerItem>): DocumentWithId<PlannerItem> {
  return { id, data: { teacherId: "teacher", itemType: "task", title: id, category: "work", status: "todo", date: "2026-08-24", startTime: null, endTime: null, durationMinutes: null, deadline: null, notes: null, priority: "medium", goalId: null, subgoalId: null, sortOrder: 1, completedAt: null, active: true, schemaVersion: 1, createdAt: null!, updatedAt: null!, ...patch } };
}

describe("planner sorting", () => {
  test("sorts unfinished timed, untimed by priority, then completed", () => {
    const result = sortPlannerItems([
      item("done", { status: "done", startTime: "08:00" }),
      item("low", { priority: "low" }),
      item("high", { priority: "high" }),
      item("later", { startTime: "15:00" }),
      item("earlier", { startTime: "09:00" }),
      item("legacy-low", { priority: "calm", sortOrder: 2 }),
    ]);
    expect(result.map(({ id }) => id)).toEqual(["earlier", "later", "high", "low", "legacy-low", "done"]);
  });

  test("month counters include untimed items and completed count", () => {
    expect(plannerCategoryCounts([
      item("work", {}),
      item("home", { category: "home" }),
      item("done", { category: "home", status: "done" }),
    ])).toEqual({ work: 1, home: 1, done: 1 });
  });
});

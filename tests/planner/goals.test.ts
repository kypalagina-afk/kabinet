import { describe, expect, test } from "vitest";
import { plannerGoalProgress } from "../../src/lib/firebase/services/plannerWorkflow.js";
import type { PlannerItem, PlannerSubgoal } from "../../src/lib/firebase/types.js";

describe("planner goal progress", () => {
  test("computes progress from subgoals and linked active tasks", () => {
    const subgoals = [
      { data: { goalId: "goal", status: "completed" } as PlannerSubgoal },
      { data: { goalId: "goal", status: "active" } as PlannerSubgoal },
    ];
    const items = [
      { data: { goalId: "goal", active: true, status: "done", recordType: "item" } as PlannerItem },
      { data: { goalId: "goal", active: true, status: "todo", recordType: "item" } as PlannerItem },
      { data: { goalId: "goal", active: true, status: "todo", recordType: "recurrence" } as PlannerItem },
    ];
    expect(plannerGoalProgress("goal", subgoals, items)).toEqual({ completed: 2, total: 4, percent: 50 });
  });
});

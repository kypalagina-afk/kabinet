import { describe, expect, test } from "vitest";
import { isCurrentDashboardLesson } from "../../src/features/schedule/dashboardLessons.js";

describe("teacher dashboard lesson history", () => {
  test("does not count the old rescheduled instance as current", () => {
    expect((["rescheduled", "planned"] as const).filter(isCurrentDashboardLesson)).toEqual(["planned"]);
    expect((["rescheduled", "completed"] as const).filter(isCurrentDashboardLesson)).toEqual(["completed"]);
  });
});

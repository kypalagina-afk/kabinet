import { describe, expect, test } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { DocumentWithId, Lesson } from "../../src/lib/firebase/types.js";
import { latestTaskUnderstanding, selectedTaskUnderstanding } from "../../src/features/schedule/taskUnderstanding.js";

describe("per-task lesson understanding", () => {
  test("keeps distinct marks and removes deselected tasks without inventing marks", () => {
    expect(selectedTaskUnderstanding([5, 27, 15], { "5": { score: 3, status: "needs_practice" }, "27": { score: 9, status: "confident" }, "1": { score: 7, status: "in_progress" } })).toEqual({ "5": { score: 3, status: "needs_practice" }, "27": { score: 9, status: "confident" } });
  });
  test("rejects invalid scores", () => {
    for (const score of [0, 11, NaN, 2.5]) expect(() => selectedTaskUnderstanding([5], { "5": { score, status: "confident" } })).toThrow();
  });
  test("uses the newest completed lesson per task; old overall marks are not task evidence", () => {
    const lessons = [
      { id: "old", data: { status: "completed", startAt: Timestamp.fromMillis(1), examTaskNumbers: [5, 27], taskUnderstanding: { "5": { score: 3, status: "needs_practice" }, "27": { score: 9, status: "confident" } } } },
      { id: "new", data: { status: "completed", startAt: Timestamp.fromMillis(2), examTaskNumbers: [5], taskUnderstanding: { "5": { score: 8, status: "confident" } } } },
      { id: "cancelled", data: { status: "cancelled_teacher", startAt: Timestamp.fromMillis(3), examTaskNumbers: [5], taskUnderstanding: { "5": { score: 1, status: "needs_practice" } } } },
      { id: "legacy", data: { status: "completed", startAt: Timestamp.fromMillis(4), examTaskNumbers: [15], understanding: { score: 7, status: "in_progress" } } },
    ] as Array<DocumentWithId<Lesson>>;
    const results = latestTaskUnderstanding(lessons);
    expect(results["5"]?.score).toBe(8);
    expect(results["27"]?.score).toBe(9);
    expect(results["15"]).toBeUndefined();
  });
});

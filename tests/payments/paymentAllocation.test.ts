import { describe, expect, test } from "vitest";
import { allocateLessonCredits, type BillableLesson } from "../../src/features/payments/allocation.js";

function lesson(overrides: Partial<BillableLesson> & Pick<BillableLesson, "id" | "startMs">): BillableLesson {
  return {
    status: "planned",
    paymentStatus: "unpaid",
    billingType: "regular",
    billingIdentityId: overrides.id,
    ...overrides,
  };
}

describe("lesson credit allocation", () => {
  test("pays completed lessons before future lessons and keeps chronological order", () => {
    const result = allocateLessonCredits([
      lesson({ id: "future-2", startMs: 400 }),
      lesson({ id: "completed-2", startMs: 200, status: "completed" }),
      lesson({ id: "future-1", startMs: 300 }),
      lesson({ id: "completed-1", startMs: 100, status: "completed" }),
    ], 3);

    expect(result.paidIds).toEqual(["completed-1", "completed-2", "future-1"]);
    expect(result.unpaidIds).toEqual(["future-2"]);
  });

  test("excludes free, cancelled and rescheduled history from billing", () => {
    const result = allocateLessonCredits([
      lesson({ id: "free", startMs: 1, billingType: "free", paymentStatus: "free" }),
      lesson({ id: "cancelled", startMs: 2, status: "cancelled_student" }),
      lesson({ id: "rescheduled-old", startMs: 3, status: "rescheduled" }),
      lesson({ id: "billable", startMs: 4 }),
    ], 5);

    expect(result.paidIds).toEqual(["billable"]);
    expect(result.candidates).toHaveLength(1);
  });

  test("does not charge twice for a rescheduled billing identity", () => {
    const result = allocateLessonCredits([
      lesson({ id: "old", startMs: 1, status: "rescheduled", billingIdentityId: "billing-a" }),
      lesson({ id: "new", startMs: 2, billingIdentityId: "billing-a" }),
      lesson({ id: "another", startMs: 3, billingIdentityId: "billing-b" }),
    ], 1);

    expect(result.paidIds).toEqual(["new"]);
    expect(result.unpaidIds).toEqual(["another"]);
  });

  test("normalizes negative and fractional credit input", () => {
    const lessons = [lesson({ id: "one", startMs: 1 }), lesson({ id: "two", startMs: 2 })];
    expect(allocateLessonCredits(lessons, -2).paidIds).toEqual([]);
    expect(allocateLessonCredits(lessons, 1.9).paidIds).toEqual(["one"]);
  });
});

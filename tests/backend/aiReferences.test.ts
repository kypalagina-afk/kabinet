import { describe, expect, test } from "vitest";
import {
  referenceClarification,
  validateDraftReferences,
} from "../../backend/yandex/src/ai/references.js";

const context = {
  studentIds: new Set(["student-1"]),
  lessons: [{ id: "lesson-1", studentId: "student-1" }],
  plannerItemIds: new Set(["item-1"]),
};

describe("backend AI draft reference validation", () => {
  test("accepts owned lesson and student references", () => {
    expect(validateDraftReferences({
      actionType: "LESSON_RESCHEDULE_DRAFT",
      draftId: "draft-1",
      summary: "Перенос",
      lessonId: "lesson-1",
      studentId: "student-1",
      newDate: "2026-08-28",
      newTime: "11:00",
      durationMinutes: 60,
      baselineUpdatedAtMillis: null,
    }, context)).toBeNull();
  });

  test("rejects invented entity references", () => {
    expect(validateDraftReferences({
      actionType: "HOMEWORK_DRAFT",
      draftId: "draft-2",
      summary: "Домашнее задание",
      studentId: "invented-student",
      title: "Повторить правило",
      description: "",
      dueDate: null,
      dueTime: null,
      examTaskNumbers: [],
    }, context)).toBe("AI_RESPONSE_STUDENT_REFERENCE_INVALID");
  });

  test("turns an invalid reference into a non-mutating clarification", () => {
    expect(referenceClarification("draft-3", "AI_RESPONSE_LESSON_REFERENCE_INVALID"))
      .toMatchObject({
        actionType: "CLARIFICATION_REQUIRED",
        draftId: "draft-3",
      });
  });
});

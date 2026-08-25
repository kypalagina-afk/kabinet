import { describe, expect, test } from "vitest";
import { aiPlannerConfirmationDocumentId } from "../../src/features/ai/confirmation.js";
import { createMockTeacherAIDraft } from "../../src/features/ai/mockProvider.js";
import { teacherAIDraftSchema, type TeacherAIContext } from "../../src/features/ai/schema.js";

const context: TeacherAIContext = {
  teacherId: "teacher",
  today: "2026-08-24",
  timezone: "Asia/Novosibirsk",
  selectedStudentId: "lera",
  students: [{ id: "lera", displayName: "Лера" }],
  lessons: [{ id: "lesson", studentId: "lera", startAtMillis: Date.UTC(2026, 7, 27, 7), endAtMillis: Date.UTC(2026, 7, 27, 8), updatedAtMillis: 10, status: "planned", topic: "Задание №6" }],
  plannerItems: [{ id: "nails", title: "Ногти", date: "2026-08-25", startTime: "13:00", category: "home", updatedAtMillis: 20 }],
};

describe("teacher AI drafts", () => {
  test.each([
    ["Запланируй на завтра проверить сочинение Леры", "PLANNER_ITEMS_DRAFT"],
    ["Перенеси занятие с Лерой на завтра в 15:30", "LESSON_RESCHEDULE_DRAFT"],
    ["Сделай ДЗ для Леры: №6 и №9", "HOMEWORK_DRAFT"],
    ["Подведи итоги урока с Лерой", "LESSON_SUMMARY_DRAFT"],
    ["Перенеси ногти на 14:30", "PLANNER_ITEM_UPDATE_DRAFT"],
  ])("creates validated deterministic mock draft for %s", (command, actionType) => {
    const draft = createMockTeacherAIDraft(command, context);
    expect(teacherAIDraftSchema.parse(draft).actionType).toBe(actionType);
  });

  test("rejects unknown action types", () => {
    expect(() => teacherAIDraftSchema.parse({ actionType: "DELETE_STUDENT" })).toThrow();
  });

  test("uses the same id for repeated confirmation", () => {
    expect(aiPlannerConfirmationDocumentId("teacher", "draft-1", "item-1")).toBe(aiPlannerConfirmationDocumentId("teacher", "draft-1", "item-1"));
  });

  test("maps deterministic planner examples to the current model", () => {
    const event = createMockTeacherAIDraft("Запланируй на завтра в 13:00 ногти", context);
    expect(event).toMatchObject({ actionType: "PLANNER_ITEMS_DRAFT", items: [{ itemType: "event", category: "home", date: "2026-08-25", startTime: "13:00", priority: "medium" }] });
    const backlog = createMockTeacherAIDraft("Добавь задачу: ачивки в когда-нибудь", context);
    expect(backlog).toMatchObject({ actionType: "PLANNER_ITEMS_DRAFT", items: [{ itemType: "task", category: "someday", date: null }] });
  });

  test("asks for clarification instead of guessing duplicate students", () => {
    const ambiguous = { ...context, selectedStudentId: null, students: [{ id: "one", displayName: "Лера" }, { id: "two", displayName: "Лера" }] };
    expect(createMockTeacherAIDraft("Сделай ДЗ для Леры", ambiguous).actionType).toBe("CLARIFICATION_REQUIRED");
  });
});

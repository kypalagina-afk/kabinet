import { expect, test } from "vitest";
import type { DocumentWithId, Homework, HomeworkSubmission, Lesson } from "../../src/lib/firebase/types.js";
import { calendarHomeworkReview, homeworksForLesson } from "../../src/features/schedule/calendarHomework.js";

const lesson = { id: "lesson", data: { teacherId: "teacher", studentId: "student", linkedHomeworkId: "linked" } } as DocumentWithId<Lesson>;
const homework = { teacherId: "teacher", studentId: "student", sourceLessonId: "lesson", title: "Практика", status: "assigned", items: [{ itemId: "essay", title: "Сочинение" }, { itemId: "test", title: "Тест" }] } as Homework;

test("lesson homework selection uses explicit links, not a student's unrelated work", () => {
  const docs = [
    { id: "own", data: homework },
    { id: "linked", data: { ...homework, sourceLessonId: null } },
    { id: "other", data: { ...homework, sourceLessonId: "different" } },
    { id: "partner", data: { ...homework, studentId: "partner" } },
    { id: "foreign", data: { ...homework, teacherId: "other" } },
    { id: "draft", data: { ...homework, draft: true } },
  ];
  expect(homeworksForLesson(lesson, docs).map(({ id }) => id)).toEqual(["own", "linked"]);
});

test("shows receipt and checking separately", () => {
  expect(calendarHomeworkReview(homework, []).label).toBe("ДЗ выдано · Не сдано");
  const submission = { submissionNumber: 1, status: "submitted", submittedAt: {}, studentInput: { itemProgress: [{ itemId: "essay", completed: true }] }, teacherEvaluation: null } as HomeworkSubmission;
  expect(calendarHomeworkReview(homework, [submission])).toMatchObject({ tone: "pending", label: "ДЗ выдано · Ждёт проверки 1/2" });
  const checkedEssay = { ...submission, teacherEvaluation: { itemEvaluations: [{ itemId: "essay", reviewStatus: "checked" }] } } as HomeworkSubmission;
  expect(calendarHomeworkReview(homework, [checkedEssay]).label).toBe("Проверено 1/2 · Остальное не сдано");
  expect(calendarHomeworkReview(homework, [{ ...submission, status: "checked" }]).tone).toBe("checked");
});

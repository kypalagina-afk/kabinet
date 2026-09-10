import { describe, expect, test } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Homework, HomeworkSubmission } from "../../src/lib/firebase/types.js";
import { homeworkReviewProgress } from "../../src/features/homework/reviewProgress.js";

const homework = { title: "Четыре пункта", status: "submitted", dueAt: Timestamp.fromMillis(100), items: ["essay", "test", "theory", "practice"].map((itemId) => ({ itemId, title: itemId })) } as Homework;
const submission = {
  submissionNumber: 1, status: "submitted", submittedAt: Timestamp.fromMillis(50),
  studentInput: { completed: false, itemProgress: [{ itemId: "essay", completed: true }, { itemId: "test", completed: true }] },
  teacherEvaluation: { itemEvaluations: [{ itemId: "essay", reviewStatus: "checked", scoreEarned: 15, scoreMax: 22 }] },
} as HomeworkSubmission;

describe("homework review queue", () => {
  test("a graded essay is checked while only the received test awaits review", () => {
    const progress = homeworkReviewProgress(homework, [submission], 200);
    expect(progress).toMatchObject({ total: 4, received: 2, checked: 1, pending: 1, missing: 2, overdue: true });
    expect(progress.items.map((item) => item.state)).toEqual(["checked", "pending", "missing", "missing"]);
  });
  test("all received items reviewed clears the queue even when the package is still submitted", () => {
    const attempt = { ...submission, teacherEvaluation: { ...submission.teacherEvaluation!, itemEvaluations: [...submission.teacherEvaluation!.itemEvaluations!, { itemId: "test", reviewStatus: "checked" as const, scoreEarned: 6, scoreMax: 10, criteria: [], comment: null, checkedAt: null }] } };
    expect(homeworkReviewProgress(homework, [attempt], 0)).toMatchObject({ checked: 2, pending: 0, missing: 2, status: "assigned" });
    expect(homeworkReviewProgress(homework, [attempt], 200)).toMatchObject({ checked: 2, pending: 0, status: "overdue" });
  });
  test("uses only the newest attempt and respects withdrawn receipts", () => {
    const newer = { ...submission, submissionNumber: 2, teacherEvaluation: null, teacherReceipt: { onTime: true, items: { essay: { received: false, onTime: null, receivedAt: null } } } };
    expect(homeworkReviewProgress(homework, [newer, submission], 0)).toMatchObject({ checked: 0, pending: 1, missing: 3 });
  });
  test("keeps legacy whole-homework reviews completed", () => {
    const old = { ...submission, status: "checked" as const, teacherEvaluation: { scoreEarned: 10, scoreMax: 15, criteria: [], issues: [], comment: null, checkedAt: null } };
    expect(homeworkReviewProgress(homework, [old])).toMatchObject({ checked: 4, pending: 0, status: "checked" });
  });
  test("an assignment without a submission is not queued for review", () => {
    expect(homeworkReviewProgress(homework, [], 0)).toMatchObject({ checked: 0, pending: 0, missing: 4 });
  });
});

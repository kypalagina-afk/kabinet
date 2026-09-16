import { Timestamp } from "firebase/firestore";
import type { DocumentWithId, Homework, HomeworkSubmission, MockExam } from "../../src/lib/firebase/types.js";

export const at = (date: string) => Timestamp.fromDate(new Date(date));
export function historyFixture() {
  const time = at("2026-09-10T12:00:00Z");
  const homework: DocumentWithId<Homework> = { id: "hw", data: {
    teacherId: "t", studentId: "s", studentProgramId: "p", sourceLessonId: null, type: "essay", title: "Сочинение и тест", description: null,
    examTaskNumbers: [], assignedAt: time, dueAt: at("2026-09-12T20:00:00Z"), status: "submitted", requiredAmount: null,
    items: [
      { itemId: "essay", type: "essay", title: "Написать сочинение", examTaskNumbers: [27], description: null, requiredAmount: null, attachments: [], materialIds: [], sortOrder: 0 },
      { itemId: "test", type: "practice", title: "Выполнить тест", examTaskNumbers: [15], description: null, requiredAmount: null, attachments: [], materialIds: [], sortOrder: 1 },
    ], createdAt: time, updatedAt: time, schemaVersion: 1,
  } };
  const submission: DocumentWithId<HomeworkSubmission> = { id: "sub", data: {
    teacherId: "t", studentId: "s", homeworkId: "hw", submissionNumber: 1, status: "submitted", submittedAt: time,
    studentInput: { completed: false, selfReportedEarned: null, selfReportedMax: null, note: null, externalAttachmentUrls: [] },
    teacherReceipt: { onTime: null, items: { essay: { received: true, onTime: true, receivedAt: time }, test: { received: false, onTime: null, receivedAt: null } } },
    teacherEvaluation: { scoreEarned: 16, scoreMax: 22, qualityScore: 8, criteria: [], issues: [], comment: null, checkedAt: time,
      itemEvaluations: [{ itemId: "essay", scoreEarned: 16, scoreMax: 22, criteria: [], comment: null, reviewStatus: "checked", checkedAt: time }],
    }, createdAt: time, updatedAt: time, schemaVersion: 1,
  } };
  const mock: DocumentWithId<MockExam> = { id: "mock", data: {
    teacherId: "t", studentId: "s", studentProgramId: "p", examBlueprintId: "ege", title: "Сентябрьский пробник", takenAt: at("2026-09-15T12:00:00Z"), taskResults: [],
    sections: { test: { earned: 0, max: 0 }, essay: { earned: 18, max: 22, criteria: [], comment: null }, exposition: { earned: 0, max: 0, criteria: [] }, literacy: { earned: 0, max: 0, criteria: [] }, factualAccuracy: { earned: 0, max: 0, errorsCount: null } },
    total: { earned: 18, max: 22 }, grade: null, teacherComment: null, createdAt: time, updatedAt: time, schemaVersion: 1,
  } };
  return { homework, submission, mock };
}

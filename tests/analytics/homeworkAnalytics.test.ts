import { Timestamp } from "firebase/firestore";
import { describe, expect, test } from "vitest";
import { calculateHomeworkAnalytics } from "../../src/features/analytics/homeworkAnalytics.js";
import type {
  DocumentWithId,
  Homework,
  HomeworkSubmission,
} from "../../src/lib/firebase/types.js";

const time = (value: string) => Timestamp.fromDate(new Date(value));
const homework = (
  id: string,
  assigned: string,
  due: string,
): DocumentWithId<Homework> => ({
  id,
  data: {
    teacherId: "t",
    studentId: "s",
    studentProgramId: "p",
    sourceLessonId: null,
    type: "written",
    title: id,
    description: null,
    examTaskNumbers: [],
    assignedAt: time(assigned),
    dueAt: time(due),
    status: "checked",
    requiredAmount: null,
    createdAt: time(assigned),
    updatedAt: time(assigned),
    schemaVersion: 1,
  },
});
const submission = (
  id: string,
  homeworkId: string,
  submitted: string,
  score?: [number, number],
): DocumentWithId<HomeworkSubmission> => ({
  id,
  data: {
    teacherId: "t",
    studentId: "s",
    homeworkId,
    submissionNumber: 1,
    studentInput: {
      completed: true,
      selfReportedEarned: null,
      selfReportedMax: null,
      note: null,
      externalAttachmentUrls: [],
    },
    teacherEvaluation: score
      ? {
          scoreEarned: score[0],
          scoreMax: score[1],
          criteria: [],
          issues: [],
          comment: null,
          checkedAt: time(submitted),
        }
      : null,
    status: "checked",
    submittedAt: time(submitted),
    createdAt: time(submitted),
    updatedAt: time(submitted),
    schemaVersion: 1,
  },
});

describe("homework analytics", () => {
  test("calculates completion, timing and numeric quality inside the range", () => {
    const result = calculateHomeworkAnalytics(
      [
        homework("a", "2026-08-01T00:00:00Z", "2026-08-10T00:00:00Z"),
        homework("b", "2026-07-01T00:00:00Z", "2026-07-10T00:00:00Z"),
      ],
      [
        submission("sa", "a", "2026-08-09T00:00:00Z", [4, 5]),
        submission("sb", "b", "2026-07-11T00:00:00Z"),
      ],
      {
        start: new Date("2026-08-01T00:00:00Z"),
        end: new Date("2026-08-31T23:59:59Z"),
      },
    );
    expect(result).toMatchObject({
      assignedCount: 1,
      completedCount: 1,
      completionPercent: 100,
      onTimePercent: 100,
      qualityPercent: 80,
      qualityCount: 1,
    });
  });

  test("prefers the optional ten-point homework quality score", () => {
    const checked = submission("quality", "a", "2026-08-09T00:00:00Z", [4, 5]);
    checked.data.teacherEvaluation = {
      ...checked.data.teacherEvaluation!,
      qualityScore: 9,
    };
    const result = calculateHomeworkAnalytics(
      [homework("a", "2026-08-01T00:00:00Z", "2026-08-10T00:00:00Z")],
      [checked],
    );
    expect(result.qualityPercent).toBe(90);
    expect(result.qualityCount).toBe(1);
  });
});

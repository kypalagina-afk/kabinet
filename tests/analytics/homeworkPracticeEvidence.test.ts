import { Timestamp } from "firebase/firestore";
import { describe, expect, test } from "vitest";
import { homeworkPracticeEvidence } from "../../src/features/analytics/homeworkPracticeEvidence.js";
import type {
  DocumentWithId,
  Homework,
  HomeworkSubmission,
} from "../../src/lib/firebase/types.js";

const now = Timestamp.fromDate(new Date("2026-09-03T10:00:00.000Z"));

function fixture() {
  const homework: DocumentWithId<Homework> = {
    id: "homework-1",
    data: {
      teacherId: "teacher-1",
      studentId: "student-1",
      studentProgramId: "program-1",
      sourceLessonId: null,
      type: "practice",
      title: "Практика №15",
      description: null,
      examTaskNumbers: [],
      assignedAt: now,
      dueAt: null,
      status: "checked",
      requiredAmount: null,
      items: [
        {
          itemId: "practice-15",
          type: "practice",
          title: "№15",
          description: null,
          requiredAmount: null,
          examTaskNumbers: [15],
          attachments: [],
          materialIds: [],
          sortOrder: 0,
          examBlueprintId: "ege-2027",
        },
      ],
      attachments: [],
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    },
  };
  const submission: DocumentWithId<HomeworkSubmission> = {
    id: "submission-1",
    data: {
      teacherId: "teacher-1",
      studentId: "student-1",
      homeworkId: "homework-1",
      submissionNumber: 1,
      studentInput: {
        completed: true,
        selfReportedEarned: null,
        selfReportedMax: null,
        note: null,
        externalAttachmentUrls: [],
        attachments: [],
        itemProgress: [],
      },
      teacherEvaluation: {
        scoreEarned: 6,
        scoreMax: 10,
        criteria: [],
        issues: [],
        comment: null,
        checkedAt: now,
        itemEvaluations: [
          {
            itemId: "practice-15",
            scoreEarned: 6,
            scoreMax: 10,
            criteria: [],
            comment: "Из Русского100",
            reviewStatus: "checked",
            checkedAt: now,
          },
        ],
      },
      status: "checked",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    },
  };
  return { homework, submission };
}

describe("homework practice analytics evidence", () => {
  test("turns a scored single-task homework item into analytics evidence", () => {
    const { homework, submission } = fixture();
    expect(
      homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege")[0],
    ).toMatchObject({
      data: { taskNumber: 15, score: 6, maxScore: 10, accuracy: 60 },
    });
  });

  test("does not guess how to split a score across several task numbers", () => {
    const { homework, submission } = fixture();
    homework.data.items![0]!.examTaskNumbers = [14, 15];
    expect(
      homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege"),
    ).toEqual([]);
  });
});

import { Timestamp } from "firebase/firestore";
import { describe, expect, test } from "vitest";
import { homeworkPracticeEvidence } from "../../src/features/analytics/homeworkPracticeEvidence.js";
import { calculateMockAnalytics, defaultAnalyticsConfig } from "../../src/features/analytics/mockAnalytics.js";
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

  test("counts a checked practice item while the rest of the package is not submitted", () => {
    const { homework, submission } = fixture();
    homework.data.status = "assigned";
    homework.data.items!.push({ ...homework.data.items![0]!, itemId: "essay", type: "essay", examTaskNumbers: [27] });
    submission.data.status = "submitted";
    submission.data.studentInput.completed = false;
    submission.data.teacherReceipt = { onTime: true, items: {
      "practice-15": { received: true, onTime: true, receivedAt: now },
      essay: { received: false, onTime: null, receivedAt: null },
    } };
    const evidence = homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege", "program-1");
    const analytics = calculateMockAnalytics([], { ...defaultAnalyticsConfig, totalExamTasks: 2 }, evidence);
    expect(evidence).toHaveLength(1);
    expect(analytics.masteryByTask[0]).toMatchObject({ taskNumber: 15, mastery: 60, attempts: 1 });
    expect(analytics.examReadiness).toBe(30);
  });

  test("reads legacy whole-assignment practice scores", () => {
    const { homework, submission } = fixture();
    homework.data.items = [];
    homework.data.examTaskNumbers = [15];
    submission.data.teacherEvaluation!.itemEvaluations = [];
    expect(homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege", "program-1")[0])
      .toMatchObject({ id: "homework:submission-1:whole", data: { taskNumber: 15, score: 6, maxScore: 10, accuracy: 60 } });
  });

  test("resolves missing blueprint snapshots only with a verified program", () => {
    const { homework, submission } = fixture();
    homework.data.items![0]!.examBlueprintId = null;
    expect(homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege", "program-1")).toHaveLength(1);
    expect(homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege")).toEqual([]);
    expect(homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege", "program-2")).toEqual([]);
    homework.data.items![0]!.examBlueprintId = "oge-2027";
    expect(homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege", "program-1")).toEqual([]);
  });

  test("never uses package totals when per-item scores are absent", () => {
    const { homework, submission } = fixture();
    submission.data.teacherEvaluation!.itemEvaluations = [];
    expect(homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege", "program-1")).toEqual([]);
  });

  test("withdrawn receipts exclude previously graded practice", () => {
    const { homework, submission } = fixture();
    submission.data.teacherReceipt = { onTime: true, items: {
      "practice-15": { received: false, onTime: null, receivedAt: null },
    } };
    expect(homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege", "program-1")).toEqual([]);
  });

  test("editing a result recalculates evidence without creating a second attempt", () => {
    const { homework, submission } = fixture();
    const previous = homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege");
    submission.data.teacherEvaluation!.itemEvaluations![0]!.scoreEarned = 8;
    const updated = homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege");
    expect(updated).toHaveLength(1);
    expect(updated[0]!.id).toBe(previous[0]!.id);
    expect(updated[0]!.data.accuracy).toBe(80);
  });

  test.each([[null, 10], [6, null], [6, 0], [11, 10], [-1, 10], [NaN, 10]])("ignores invalid or missing scores %s/%s", (earned, max) => {
    const { homework, submission } = fixture();
    Object.assign(submission.data.teacherEvaluation!.itemEvaluations![0]!, { scoreEarned: earned, scoreMax: max });
    expect(homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege")).toEqual([]);
  });

  test("counts zero as a valid assessed score", () => {
    const { homework, submission } = fixture();
    submission.data.teacherEvaluation!.itemEvaluations![0]!.scoreEarned = 0;
    expect(homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege")[0]!.data.accuracy).toBe(0);
  });

  test("does not mix pupils or include draft assignments", () => {
    const { homework, submission } = fixture();
    submission.data.studentId = "other-student";
    expect(homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege")).toEqual([]);
    submission.data.studentId = homework.data.studentId;
    homework.data.draft = true;
    expect(homeworkPracticeEvidence([homework], [submission], "ege-2027", "ege")).toEqual([]);
  });
});

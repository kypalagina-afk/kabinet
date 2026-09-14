import { Timestamp } from "firebase/firestore";
import { describe, expect, test } from "vitest";
import { homeworkAssessmentEvidence, homeworkPracticeEvidence } from "../../src/features/analytics/homeworkPracticeEvidence.js";
import { calculateMockAnalytics, defaultAnalyticsConfig } from "../../src/features/analytics/mockAnalytics.js";
import type {
  DocumentWithId,
  Homework,
  HomeworkSubmission,
  HomeworkItem,
  ExamKind,
  MockExam,
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

describe("written homework assessment evidence", () => {
  function written(type: HomeworkItem["type"], task: number, kind: ExamKind) {
    const result = fixture();
    Object.assign(result.homework.data.items![0]!, { type, examTaskNumbers: [task], examBlueprintId: `${kind}-2027` });
    return result;
  }

  test.each([
    ["oge", "essay", 13], ["oge", "exposition", 1], ["ege", "essay", 27],
    ["oge", "exam_written_work", 13], ["oge", "exam_written_work", 1], ["ege", "exam_written_work", 27],
  ] as const)("includes %s %s task %s without adding it to Russian100 history", (kind, type, task) => {
    const { homework, submission } = written(type, task, kind);
    submission.data.submissionSource = "teacher_external";
    submission.data.studentInput.itemProgress = [];
    submission.data.studentInput.note = null;
    const evidence = homeworkAssessmentEvidence([homework], [submission], `${kind}-2027`, kind, "program-1");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.data).toMatchObject({ taskNumber: task, score: 6, maxScore: 10, accuracy: 60 });
    expect(homeworkPracticeEvidence([homework], [submission], `${kind}-2027`, kind, "program-1")).toEqual([]);
  });

  test("a checked essay counts independently of unsubmitted items and ignores a quality rating", () => {
    const { homework, submission } = written("essay", 27, "ege");
    homework.data.items!.push({ ...homework.data.items![0]!, itemId: "test", type: "practice", examTaskNumbers: [15] });
    submission.data.status = "submitted";
    submission.data.teacherEvaluation!.qualityScore = 10;
    const evidence = homeworkAssessmentEvidence([homework], [submission], "ege-2027", "ege", "program-1");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.data.accuracy).toBe(60);
    submission.data.teacherReceipt = { onTime: true, items: { "practice-15": { received: false, onTime: null, receivedAt: null } } };
    expect(homeworkAssessmentEvidence([homework], [submission], "ege-2027", "ege", "program-1")).toEqual([]);
  });

  test("supports historical whole-homework essays and unambiguous legacy types without a task number", () => {
    const { homework, submission } = written("essay", 13, "oge");
    homework.data.items = [];
    homework.data.type = "essay";
    homework.data.examTaskNumbers = [];
    submission.data.teacherEvaluation!.itemEvaluations = [];
    expect(homeworkAssessmentEvidence([homework], [submission], "oge-2027", "oge", "program-1")[0]!.data.taskNumber).toBe(13);
    homework.data.type = "exposition";
    expect(homeworkAssessmentEvidence([homework], [submission], "oge-2027", "oge", "program-1")[0]!.data.taskNumber).toBe(1);
    homework.data.type = "written";
    expect(homeworkAssessmentEvidence([homework], [submission], "oge-2027", "oge", "program-1")).toEqual([]);
    homework.data.examTaskNumbers = [13];
    expect(homeworkAssessmentEvidence([homework], [submission], "oge-2027", "oge", "program-1")).toHaveLength(1);
  });

  test.each([
    ["oge", "essay", [27]], ["ege", "essay", [13]], ["ege", "exposition", [1]],
    ["oge", "exam_written_work", [1, 13]], ["oge", "theory", [13]], ["ege", "exam_written_work", []],
  ] as const)("does not misattribute %s %s %j", (kind, type, numbers) => {
    const { homework, submission } = written(type, numbers[0] ?? 0, kind);
    homework.data.items![0]!.examTaskNumbers = [...numbers];
    expect(homeworkAssessmentEvidence([homework], [submission], `${kind}-2027`, kind, "program-1")).toEqual([]);
  });

  test("preserves blueprint and program separation for written work", () => {
    const { homework, submission } = written("essay", 27, "ege");
    expect(homeworkAssessmentEvidence([homework], [submission], "ege-other-year", "ege", "program-1")).toEqual([]);
    expect(homeworkAssessmentEvidence([homework], [submission], "ege-2027", "ege", "other-program")).toEqual([]);
  });

  test("combines written homework and mock scores once and recalculates after an edit or deletion", () => {
    const { homework, submission } = written("essay", 27, "ege");
    const mock: DocumentWithId<MockExam> = { id: "mock", data: {
      teacherId: "teacher-1", studentId: "student-1", studentProgramId: "program-1", examBlueprintId: "ege-2027", title: "Пробник", taskResults: [],
      sections: {
        test: { earned: 0, max: 0 }, exposition: { earned: 0, max: 0, criteria: [] },
        essay: { earned: 8, max: 10, criteria: [], comment: null }, literacy: { earned: 0, max: 0, criteria: [] },
        factualAccuracy: { earned: 0, max: 0, errorsCount: null },
      },
      sectionResults: {}, total: { earned: 8, max: 10 }, grade: null, teacherComment: null,
      takenAt: now, createdAt: now, updatedAt: now, schemaVersion: 1,
    } };
    const config = { ...defaultAnalyticsConfig, examKind: "ege" as const, totalExamTasks: 1 };
    const calculate = () => calculateMockAnalytics([mock], config, homeworkAssessmentEvidence([homework], [submission], "ege-2027", "ege", "program-1"));
    expect(calculate().masteryByTask[0]).toMatchObject({ taskNumber: 27, earned: 14, max: 20, mastery: 70, attempts: 2 });
    submission.data.teacherEvaluation!.itemEvaluations![0]!.scoreEarned = 10;
    expect(calculate().masteryByTask[0]).toMatchObject({ earned: 18, max: 20, mastery: 90, attempts: 2 });
    expect(calculateMockAnalytics([mock], config, homeworkAssessmentEvidence([], [submission], "ege-2027", "ege", "program-1")).masteryByTask[0]).toMatchObject({ mastery: 80, attempts: 1 });
  });
});

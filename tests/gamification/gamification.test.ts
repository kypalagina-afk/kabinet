import { Timestamp } from "firebase/firestore";
import { describe, expect, test } from "vitest";
import {
  calculateGamificationSummary,
  XP_PER_LEVEL,
} from "../../src/features/gamification/gamification.js";
import type {
  DocumentWithId,
  GamificationEvent,
  Homework,
  HomeworkSubmission,
  StudentAchievement,
} from "../../src/lib/firebase/types.js";

const now = Timestamp.fromDate(new Date("2026-08-15T10:00:00.000Z"));

function event(id: string, xpDelta: number): DocumentWithId<GamificationEvent> {
  return {
    id,
    data: {
      teacherId: "teacher-1",
      studentId: "student-1",
      studentProgramId: "program-1",
      eventType: "homework_completed",
      sourceType: "homework",
      sourceId: id,
      xpDelta,
      createdAt: now,
      schemaVersion: 1,
    },
  };
}

function homework(number: number): DocumentWithId<Homework> {
  const assignedAt = Timestamp.fromMillis(now.toMillis() + number);
  return {
    id: `homework-${number}`,
    data: {
      teacherId: "teacher-1", studentId: "student-1", studentProgramId: "program-1",
      sourceLessonId: null, type: "practice", title: `Homework ${number}`,
      description: null, examTaskNumbers: [], assignedAt,
      dueAt: Timestamp.fromDate(new Date("2026-08-16T10:00:00.000Z")),
      status: "checked", requiredAmount: null,
      createdAt: assignedAt, updatedAt: assignedAt, schemaVersion: 1,
    },
  };
}

function checkedSubmission(number: number): DocumentWithId<HomeworkSubmission> {
  return {
    id: `submission-${number}`,
    data: {
      teacherId: "teacher-1",
      studentId: "student-1",
      homeworkId: `homework-${number}`,
      submissionNumber: number,
      studentInput: {
        completed: true,
        selfReportedEarned: null,
        selfReportedMax: null,
        note: null,
        externalAttachmentUrls: [],
      },
      teacherEvaluation: null,
      status: "checked",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    },
  };
}

describe("gamification summary", () => {
  test("calculates XP levels without mutating source events", () => {
    const events = [event("one", 450), event("two", 100), event("invalid", -25)];
    const summary = calculateGamificationSummary({
      events,
      achievements: [],
      definitions: [],
      submissions: [],
      homeworks: [],
      mockExams: [],
    });
    expect(XP_PER_LEVEL).toBe(500);
    expect(summary.totalXp).toBe(550);
    expect(summary.level).toBe(2);
    expect(summary.levelXp).toBe(50);
    expect(summary.xpToNextLevel).toBe(450);
    expect(events[2]?.data.xpDelta).toBe(-25);
  });

  test("derives streak milestones and keeps earned achievements separate", () => {
    const achievements: Array<DocumentWithId<StudentAchievement>> = [{
      id: "earned-first-step",
      data: {
        teacherId: "teacher-1",
        studentId: "student-1",
        studentProgramId: "program-1",
        achievementDefinitionId: "first-step",
        earnedAt: now,
        metadata: {},
        schemaVersion: 1,
      },
    }];
    const summary = calculateGamificationSummary({
      events: [],
      achievements,
      definitions: [],
      submissions: [1, 2, 3].map(checkedSubmission),
      homeworks: [1, 2, 3].map(homework),
      mockExams: [],
    });
    expect(summary.streak).toBe(3);
    expect(summary.suggestedCodes).toEqual(expect.arrayContaining(["first-step", "momentum", "comeback"]));
    expect(summary.earned).toHaveLength(1);
  });

  test("counts consecutive homework once and retries do not inflate streak", () => {
    const duplicateAttempt = checkedSubmission(2);
    duplicateAttempt.id = "homework-1-retry";
    duplicateAttempt.data.homeworkId = "homework-1";
    const summary = calculateGamificationSummary({
      events: [], achievements: [], definitions: [], mockExams: [],
      submissions: [checkedSubmission(1), duplicateAttempt],
      homeworks: [homework(1)],
    });
    expect(summary.streak).toBe(1);
  });
});

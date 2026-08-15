import { Timestamp } from "firebase/firestore";
import { describe, expect, test } from "vitest";
import {
  calculateMockAnalytics,
  gradeForBlueprint,
  gradeForScore,
} from "../../src/features/analytics/mockAnalytics.js";
import type { DocumentWithId, MockExam } from "../../src/lib/firebase/types.js";
import { calculateDetailedMockExam } from "../../src/lib/firebase/services/mockExamWorkflow.js";

function exam(id: string, date: string, taskEarned: number, total: number): DocumentWithId<MockExam> {
  const timestamp = Timestamp.fromDate(new Date(`${date}T00:00:00.000Z`));
  return {
    id,
    data: {
      teacherId: "teacher-1",
      studentId: "student-1",
      studentProgramId: "program-1",
      examBlueprintId: "blueprint-1",
      title: id,
      takenAt: timestamp,
      takenDate: date,
      taskResults: [{ taskNumber: 2, earned: taskEarned, max: 1 }],
      sections: {
        test: { earned: taskEarned, max: 1 },
        exposition: { earned: 6, max: 6, criteria: [] },
        essay: { earned: 5, max: 7, criteria: [], comment: null },
        literacy: { earned: 2, max: 12, criteria: [] },
        factualAccuracy: { earned: 0, max: 1, errorsCount: 1 },
      },
      total: { earned: total, max: 37 },
      grade: gradeForScore(total, {}),
      teacherComment: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: 1,
    },
  };
}

describe("mock analytics", () => {
  test("calculates the pilot structure as 20/37 with a 7/11 test section", () => {
    const calculated = calculateDetailedMockExam(
      {
        teacherId: "teacher-1",
        studentId: "student-1",
        studentProgramId: "program-1",
        examBlueprintId: "blueprint-1",
        title: "Pilot",
        takenDate: "2026-06-16",
        taskResults: [0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1].map((earned, index) => ({ taskNumber: index + 2, earned, max: 1 })),
        expositionCriteria: [{ code: "ИК", earned: 6, max: 6, errorsCount: null }],
        essayCriteria: [{ code: "СК", earned: 5, max: 7, errorsCount: null }],
        essayComment: "Второй пример не засчитан",
        literacyCriteria: [
          { code: "ГК1", earned: 0, max: 3, errorsCount: 6, category: "orthography" },
          { code: "ГК2", earned: 0, max: 3, errorsCount: 8, category: "punctuation" },
          { code: "ГК3", earned: 2, max: 3, errorsCount: 2, category: "grammar" },
          { code: "ГК4", earned: 0, max: 3, errorsCount: 6, category: "speech" },
        ],
        factualAccuracy: { earned: 0, max: 1, errorsCount: 1 },
        teacherComment: null,
      },
      {
        programType: "oge",
        subject: "russian",
        year: 2026,
        version: "pilot",
        status: "active",
        maxScore: 37,
        gradeThresholds: { 2: 0, 3: 15, 4: 24, 5: 31 },
        sections: [],
        tasks: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        schemaVersion: 1,
      },
    );
    expect(calculated.sections.test).toEqual({ earned: 7, max: 11 });
    expect(calculated.total).toEqual({ earned: 20, max: 37 });
    expect(calculated.grade).toBe(3);
  });

  test("does not turn one perfect task attempt into 100% mastery", () => {
    const analytics = calculateMockAnalytics([exam("one", "2026-06-16", 1, 20)]);
    expect(analytics.masteryByTask[0]?.rawPercent).toBe(100);
    expect(analytics.masteryByTask[0]?.mastery).toBe(33);
  });

  test("keeps source scores and calculates trend separately", () => {
    const source = [exam("one", "2026-06-16", 0, 20), exam("two", "2026-07-16", 1, 25)];
    const analytics = calculateMockAnalytics(source);
    expect(source[0]?.data.total.earned).toBe(20);
    expect(analytics.mockTrend.at(-1)?.delta).toBe(14);
    expect(analytics.growthSections).toContain("Грамотность");
  });

  test("uses configured thresholds and fallback OGE thresholds", () => {
    expect(gradeForScore(24, {})).toBe(4);
    expect(gradeForScore(18, { 2: 0, 3: 10, 4: 18, 5: 30 })).toBe(4);
  });

  test.each([[24, 0, 3], [31, 5, 3], [31, 6, 4], [35, 8, 4], [35, 9, 5]])("applies configured OGE literacy gate for %i points and GK %i", (score, gk, expected) => {
    expect(gradeForBlueprint(score, gk, { gradeThresholds: {}, gradeRules: [
      { grade: 2, minScore: 0, maxScore: 14 }, { grade: 3, minScore: 15, maxScore: 25 },
      { grade: 4, minScore: 26, maxScore: 32, minGkScore: 6, fallbackGrade: 3 },
      { grade: 5, minScore: 33, maxScore: 37, minGkScore: 9, fallbackGrade: 4 },
    ] }).grade).toBe(expected);
  });
});

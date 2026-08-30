import { describe, expect, it } from "vitest";
import type { ExamBlueprint } from "../../src/lib/firebase/types.js";
import {
  EGE_RUSSIAN_2027_PROJECT_ID,
  OGE_RUSSIAN_2026_PILOT_ID,
  OGE_RUSSIAN_2027_PROJECT_ID,
  blueprintPrimaryMax,
  examBlueprintSeeds,
  reviewCriteriaForTask,
  validateBlueprintTotals,
  writingConfigForTask,
} from "../../src/features/exams/blueprints.js";
import {
  calculateDetailedMockExam,
  type DetailedMockExamInput,
} from "../../src/lib/firebase/services/mockExamWorkflow.js";

function blueprint(id: string) {
  return examBlueprintSeeds[id] as unknown as ExamBlueprint;
}

function emptyInput(value: ExamBlueprint): DetailedMockExamInput {
  const criteria = [
    ...(value.writingCriteria?.byTask?.flatMap((item) => item.criteria) ?? []),
    ...(value.crossTaskCriteria ?? []),
  ];
  return {
    teacherId: "teacher",
    studentId: "student",
    studentProgramId: "program",
    examBlueprintId: value.version,
    title: "Пробник",
    takenDate: "2026-08-30",
    taskResults: value.tasks
      .filter((task) => !writingConfigForTask(value, task.number))
      .map((task) => ({ taskNumber: task.number, earned: 0, max: task.maxScore })),
    criteriaResults: criteria.map((criterion) => ({
      code: criterion.code,
      earned: 0,
      max: criterion.max,
      errorsCount: criterion.supportsErrorCount ? 0 : null,
    })),
    expositionCriteria: [], essayCriteria: [], essayComment: null,
    literacyCriteria: [], factualAccuracy: { earned: 0, max: 0, errorsCount: null },
    teacherComment: null,
  };
}

describe("Phase 12 exam blueprints", () => {
  it.each([
    [OGE_RUSSIAN_2026_PILOT_ID, 13, 37],
    [OGE_RUSSIAN_2027_PROJECT_ID, 13, 38],
    [EGE_RUSSIAN_2027_PROJECT_ID, 27, 50],
  ])("validates %s totals", (id, tasks, maximum) => {
    const value = blueprint(id);
    expect(value.tasks).toHaveLength(tasks);
    expect(blueprintPrimaryMax(value)).toBe(maximum);
    expect(validateBlueprintTotals(value)).toBe(true);
    expect(calculateDetailedMockExam(emptyInput(value), value).total.max).toBe(maximum);
  });

  it("keeps historical OGE 2026 immutable in meaning", () => {
    const historical = blueprint(OGE_RUSSIAN_2026_PILOT_ID);
    expect(historical.sourceStatus).toBe("historical");
    expect(writingConfigForTask(historical, 13)?.criteria.find((item) => item.code === "СК2")?.max).toBe(3);
    expect(historical.tasks.find((task) => task.number === 13)?.maxScore).toBe(7);
  });

  it("models OGE 2027 cross criteria outside the task list", () => {
    const oge = blueprint(OGE_RUSSIAN_2027_PROJECT_ID);
    expect(oge.tasks.find((task) => task.number === 13)?.maxScore).toBe(8);
    expect(oge.tasks.some((task) => task.number === 14)).toBe(false);
    expect(oge.crossTaskCriteria?.reduce((sum, item) => sum + item.max, 0)).toBe(13);
    expect(oge.gradeRules).toBeNull();
  });

  it("provides full EGE task 27 K1-K10 review", () => {
    const ege = blueprint(EGE_RUSSIAN_2027_PROJECT_ID);
    const writing = writingConfigForTask(ege, 27);
    const review = reviewCriteriaForTask(ege, 27);
    expect(writing?.criteria.map((item) => item.code)).toEqual(["К1", "К2", "К3", "К4", "К5", "К6", "К7", "К8", "К9", "К10"]);
    expect(writing?.criteria.reduce((sum, item) => sum + item.max, 0)).toBe(22);
    expect(review?.content.find((item) => item.code === "К7")?.supportsErrorCount).toBe(true);
    expect(ege.wordCountRules?.[0]?.minimumWords).toBe(150);
    expect(ege.secondaryScoreScale).toBeNull();
    expect(ege.tasks.find((task) => task.number === 8)?.readinessWeight).toBe(2);
    expect(ege.tasks.find((task) => task.number === 27)?.readinessWeight).toBe(22);
  });

  it("rejects a mock with a missing EGE task", () => {
    const ege = blueprint(EGE_RUSSIAN_2027_PROJECT_ID);
    const input = emptyInput(ege);
    input.taskResults.pop();
    expect(() => calculateDetailedMockExam(input, ege)).toThrow(/task set/i);
  });
});

import { expect, test } from "vitest";
import type { ExamBlueprint, MockExam } from "../../src/lib/firebase/types.js";
import { mockTaskEvidence } from "../../src/features/analytics/mockTaskEvidence.js";
import { calculateDetailedMockExam } from "../../src/lib/firebase/services/mockExamWorkflow.js";
import { examBlueprintSeeds, EGE_RUSSIAN_2027_PROJECT_ID, OGE_RUSSIAN_2027_PROJECT_ID, writingConfigForTask } from "../../src/features/exams/blueprints.js";

test.each([[OGE_RUSSIAN_2027_PROJECT_ID, "oge", [1, 13]], [EGE_RUSSIAN_2027_PROJECT_ID, "ege", [27]]] as const)("projects actual saved written sections of %s into the task map", (id, kind, writtenNumbers) => {
  const blueprint = examBlueprintSeeds[id] as unknown as ExamBlueprint;
  const criteria = [...(blueprint.writingCriteria?.byTask?.flatMap((item) => item.criteria) ?? []), ...(blueprint.crossTaskCriteria ?? [])];
  const calculated = calculateDetailedMockExam({
    teacherId: "teacher", studentId: "student", studentProgramId: "program", examBlueprintId: id, title: "Test", takenDate: "2026-09-14",
    taskResults: blueprint.tasks.filter((task) => !writingConfigForTask(blueprint, task.number)).map((task) => ({ taskNumber: task.number, earned: task.maxScore, max: task.maxScore })),
    criteriaResults: criteria.map((criterion) => ({ code: criterion.code, earned: criterion.max, max: criterion.max, errorsCount: null })),
    expositionCriteria: [], essayCriteria: [], literacyCriteria: [], essayComment: null, teacherComment: null, factualAccuracy: { earned: 0, max: 0, errorsCount: null },
  }, blueprint);
  const original = JSON.stringify(calculated);
  const projected = mockTaskEvidence(calculated as MockExam, kind);
  expect(projected).toHaveLength(blueprint.tasks.length);
  for (const taskNumber of writtenNumbers) {
    const max = writingConfigForTask(blueprint, taskNumber)!.criteria.reduce((sum, item) => sum + item.max, 0);
    expect(projected.find((item) => item.taskNumber === taskNumber)).toEqual({ taskNumber, earned: max, max });
  }
  expect(JSON.stringify(calculated)).toBe(original);
  expect(mockTaskEvidence({ ...calculated, taskResults: projected } as MockExam, kind)).toEqual(projected);
});

test("zero is a real score; absent sections and unknown exam kind are not inferred as zero", () => {
  const mock = { taskResults: [], sections: { essay: { earned: 0, max: 22 }, exposition: { earned: 0, max: 0 } } } as unknown as MockExam;
  expect(mockTaskEvidence(mock, "ege")).toEqual([{ taskNumber: 27, earned: 0, max: 22 }]);
  expect(mockTaskEvidence(mock)).toEqual([]);
  expect(mockTaskEvidence({ taskResults: [] } as unknown as MockExam, "oge")).toEqual([]);
  mock.sections.essay.earned = 23;
  expect(mockTaskEvidence(mock, "ege")).toEqual([]);
});

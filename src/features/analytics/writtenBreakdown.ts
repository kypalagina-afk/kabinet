import type { EvaluationCriterion, ExamBlueprint, Homework, MockExam } from "../../lib/firebase/types.js";
import { writingConfigForTask } from "../exams/blueprints.js";

export interface WrittenCriterion extends EvaluationCriterion {
  title: string | null;
}

export function describeWrittenCriteria(criteria: EvaluationCriterion[], config?: Homework["reviewCriteria"], blueprint?: ExamBlueprint, taskNumber?: number): WrittenCriterion[] {
  const definitions = [
    ...(config?.content ?? []), ...(config?.literacy ?? []),
    ...(config?.factual ? [{ ...config.factual, title: "Фактическая точность" }] : []),
    ...(blueprint && taskNumber != null ? writingConfigForTask(blueprint, taskNumber)?.criteria ?? [] : []),
    ...(blueprint?.crossTaskCriteria ?? []),
  ];
  // Scores and maxima come only from the saved review, never today's rubric.
  return criteria.map((criterion) => ({ ...criterion, title: definitions.find((entry) => entry.code === criterion.code && entry.max === criterion.max)?.title ?? null }));
}

export function mockWrittenBreakdown(exam: MockExam, taskNumber: number, blueprint?: ExamBlueprint) {
  const section = taskNumber === 1 ? exam.sections?.exposition : exam.sections?.essay;
  const codes = new Set(blueprint ? writingConfigForTask(blueprint, taskNumber)?.criteria.map((item) => item.code) ?? [] : []);
  const saved = section?.criteria?.length ? section.criteria : (exam.criteriaResults ?? []).filter((item) => codes.has(item.code));
  const sharedCodes = new Set(blueprint?.crossTaskCriteria?.map((item) => item.code) ?? []);
  const shared = taskNumber === 27 ? [] : (exam.criteriaResults ?? []).filter((item) => sharedCodes.has(item.code));
  if (taskNumber !== 27) {
    for (const item of exam.sections?.literacy?.criteria ?? []) {
      if (!shared.some((entry) => entry.code === item.code)) shared.push(item);
    }
    const factual = exam.sections?.factualAccuracy;
    if (factual && factual.max > 0 && !shared.some((item) => item.code.startsWith("ФК"))) {
      shared.push({ code: "ФК", earned: factual.earned, max: factual.max, errorsCount: factual.errorsCount });
    }
  }
  return {
    criteria: describeWrittenCriteria(saved, null, blueprint, taskNumber),
    sharedCriteria: describeWrittenCriteria(shared, null, blueprint, taskNumber),
    comment: taskNumber === 1 ? null : exam.sections?.essay?.comment ?? null,
    overallComment: exam.teacherComment,
  };
}

import type { DocumentWithId, ExamBlueprint, ExamKind, Homework, HomeworkSubmission, MockExam } from "../../lib/firebase/types.js";
import { homeworkAssessmentEvidence } from "./homeworkPracticeEvidence.js";
import { mockTaskEvidence } from "./mockTaskEvidence.js";
import { describeWrittenCriteria, mockWrittenBreakdown, type WrittenCriterion } from "./writtenBreakdown.js";

export interface WrittenPracticeRow {
  id: string;
  taskNumber: number;
  title: string;
  source: "ДЗ" | "Пробник";
  date: number;
  earned: number;
  max: number;
  criteria: WrittenCriterion[];
  sharedCriteria: WrittenCriterion[];
  comment: string | null;
  overallComment?: string | null;
}

export function writtenPracticeHistory(homeworks: DocumentWithId<Homework>[], submissions: DocumentWithId<HomeworkSubmission>[], mocks: DocumentWithId<MockExam>[], blueprintId: string, examKind: ExamKind, programId?: string, blueprint?: ExamBlueprint): WrittenPracticeRow[] {
  const taskNumbers = examKind === "oge" ? [1, 13] : [27];
  const titles = new Map<string, string>();
  const reviews = new Map<string, { criteria: WrittenCriterion[]; comment: string | null }>();
  const homeworkById = new Map(homeworks.map((item) => [item.id, item.data]));
  for (const { id, data } of submissions) {
    const homework = homeworkById.get(data.homeworkId);
    if (!homework) continue;
    titles.set(`homework:${id}:whole`, homework.title);
    const essayTask = examKind === "ege" ? 27 : 13;
    if (data.teacherEvaluation) reviews.set(`homework:${id}:whole`, { criteria: describeWrittenCriteria(data.teacherEvaluation.criteria, homework.reviewCriteria, blueprint, homework.examTaskNumbers[0] ?? (homework.type === "exposition" ? 1 : essayTask)), comment: data.teacherEvaluation.comment });
    for (const item of homework.items ?? []) {
      const key = `homework:${id}:${item.itemId}`;
      titles.set(key, item.title);
      const review = data.teacherEvaluation?.itemEvaluations?.find((entry) => entry.itemId === item.itemId);
      if (review) reviews.set(key, { criteria: describeWrittenCriteria(review.criteria, item.reviewCriteria ?? (homework.items?.length === 1 ? homework.reviewCriteria : null), blueprint, item.examTaskNumbers[0] ?? (item.type === "exposition" ? 1 : essayTask)), comment: review.comment });
    }
  }
  const rows: WrittenPracticeRow[] = homeworkAssessmentEvidence(homeworks, submissions, blueprintId, examKind, programId)
    .filter(({ data }) => taskNumbers.includes(data.taskNumber))
    .map(({ id, data }) => ({ id, taskNumber: data.taskNumber, title: titles.get(id) ?? "Письменная работа", source: "ДЗ", date: data.practicedAt.toMillis(), earned: data.score, max: data.maxScore, criteria: reviews.get(id)?.criteria ?? [], comment: reviews.get(id)?.comment ?? null, sharedCriteria: [] }));
  for (const { id, data } of mocks) {
    if (!blueprintId || data.examBlueprintId !== blueprintId || (programId && data.studentProgramId !== programId)) continue;
    for (const result of mockTaskEvidence(data, examKind)) {
      if (!taskNumbers.includes(result.taskNumber) || !Number.isFinite(result.earned) || !Number.isFinite(result.max) || result.max <= 0 || result.earned < 0 || result.earned > result.max) continue;
      rows.push({ id: `mock:${id}:${result.taskNumber}`, taskNumber: result.taskNumber, title: data.title, source: "Пробник", date: (data.takenAt ?? data.createdAt).toMillis(), earned: result.earned, max: result.max, ...mockWrittenBreakdown(data, result.taskNumber, blueprint) });
    }
  }
  return rows.sort((a, b) => b.date - a.date);
}

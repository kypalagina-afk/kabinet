import type { DocumentWithId, ExamKind, Homework, HomeworkSubmission, MockExam } from "../../lib/firebase/types.js";
import { homeworkAssessmentEvidence } from "./homeworkPracticeEvidence.js";
import { mockTaskEvidence } from "./mockTaskEvidence.js";

export interface WrittenPracticeRow {
  id: string;
  taskNumber: number;
  title: string;
  source: "ДЗ" | "Пробник";
  date: number;
  earned: number;
  max: number;
}

export function writtenPracticeHistory(homeworks: DocumentWithId<Homework>[], submissions: DocumentWithId<HomeworkSubmission>[], mocks: DocumentWithId<MockExam>[], blueprintId: string, examKind: ExamKind, programId?: string): WrittenPracticeRow[] {
  const taskNumbers = examKind === "oge" ? [1, 13] : [27];
  const titles = new Map<string, string>();
  const homeworkById = new Map(homeworks.map((item) => [item.id, item.data]));
  for (const { id, data } of submissions) {
    const homework = homeworkById.get(data.homeworkId);
    if (!homework) continue;
    titles.set(`homework:${id}:whole`, homework.title);
    for (const item of homework.items ?? []) titles.set(`homework:${id}:${item.itemId}`, item.title);
  }
  const rows: WrittenPracticeRow[] = homeworkAssessmentEvidence(homeworks, submissions, blueprintId, examKind, programId)
    .filter(({ data }) => taskNumbers.includes(data.taskNumber))
    .map(({ id, data }) => ({ id, taskNumber: data.taskNumber, title: titles.get(id) ?? "Письменная работа", source: "ДЗ", date: data.practicedAt.toMillis(), earned: data.score, max: data.maxScore }));
  for (const { id, data } of mocks) {
    if (!blueprintId || data.examBlueprintId !== blueprintId || (programId && data.studentProgramId !== programId)) continue;
    for (const result of mockTaskEvidence(data, examKind)) {
      if (!taskNumbers.includes(result.taskNumber) || !Number.isFinite(result.earned) || !Number.isFinite(result.max) || result.max <= 0 || result.earned < 0 || result.earned > result.max) continue;
      rows.push({ id: `mock:${id}:${result.taskNumber}`, taskNumber: result.taskNumber, title: data.title, source: "Пробник", date: (data.takenAt ?? data.createdAt).toMillis(), earned: result.earned, max: result.max });
    }
  }
  return rows.sort((a, b) => b.date - a.date);
}

import type { ExamKind, MockExam } from "../../lib/firebase/types.js";

// Older and current detailed mocks store written work in sections rather than
// taskResults. Project those sections into the task map without mutating history
// or adding the same written result twice when it already has a task row.
export function mockTaskEvidence(exam: MockExam, examKind?: ExamKind): MockExam["taskResults"] {
  const results = [...exam.taskResults];
  if (!examKind) return results;
  const written = examKind === "oge"
    ? [{ taskNumber: 1, score: exam.sections?.exposition }, { taskNumber: 13, score: exam.sections?.essay }]
    : [{ taskNumber: 27, score: exam.sections?.essay }];
  for (const { taskNumber, score } of written) {
    if (results.some((item) => item.taskNumber === taskNumber) || !score
      || !Number.isFinite(score.earned) || !Number.isFinite(score.max)
      || score.max <= 0 || score.earned < 0 || score.earned > score.max) continue;
    results.push({ taskNumber, earned: score.earned, max: score.max });
  }
  // OGE literacy/factual accuracy is shared by both written works. It must not
  // be duplicated into both task percentages; it stays in the mock total.
  return results;
}

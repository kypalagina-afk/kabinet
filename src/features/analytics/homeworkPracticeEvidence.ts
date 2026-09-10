import type {
  DocumentWithId,
  ExamKind,
  ExternalPracticeAttempt,
  Homework,
  HomeworkSubmission,
  TeacherEvaluation,
} from "../../lib/firebase/types.js";

interface PracticeResult {
  itemId: string;
  item: Pick<Homework, "type" | "examTaskNumbers" | "examBlueprintId">;
  evaluation: Pick<TeacherEvaluation, "scoreEarned" | "scoreMax" | "checkedAt">;
}

export function homeworkPracticeEvidence(
  homeworks: Array<DocumentWithId<Homework>>,
  submissions: Array<DocumentWithId<HomeworkSubmission>>,
  examBlueprintId: string,
  examKind: ExamKind,
  studentProgramId?: string,
): Array<DocumentWithId<ExternalPracticeAttempt>> {
  if (!examBlueprintId) return [];
  const homeworkById = new Map(
    homeworks.map((homework) => [homework.id, homework.data]),
  );
  return submissions.flatMap(({ id: submissionId, data: submission }) => {
    const homework = homeworkById.get(submission.homeworkId);
    if (
      !homework || homework.draft ||
      submission.studentId !== homework.studentId ||
      submission.teacherId !== homework.teacherId ||
      (studentProgramId && homework.studentProgramId !== studentProgramId)
    ) return [];
    const evaluation = submission.teacherEvaluation;
    if (!evaluation) return [];
    // Older, single-part assignments store their score on the whole submission.
    // Never interpret a multi-part package total as a practice-item result.
    const results: PracticeResult[] = homework.items?.length
      ? (evaluation.itemEvaluations ?? []).flatMap((result) => {
          const item = homework.items!.find((candidate) => candidate.itemId === result.itemId);
          return item ? [{ itemId: item.itemId, item, evaluation: result }] : [];
        })
      : [{ itemId: "whole", item: homework, evaluation }];
    return results.flatMap(
      ({ itemId, item, evaluation }) => {
        const blueprintId = item.examBlueprintId || homework.examBlueprintId;
        // A missing legacy snapshot may use the verified active program, but an
        // explicit snapshot of a different exam must never be reinterpreted.
        const matchesBlueprint = blueprintId
          ? blueprintId === examBlueprintId
          : Boolean(studentProgramId && homework.studentProgramId === studentProgramId);
        if (
          submission.teacherReceipt?.items[itemId]?.received === false ||
          item.type !== "practice" ||
          item.examTaskNumbers.length !== 1 ||
          !matchesBlueprint ||
          evaluation.scoreEarned === null ||
          evaluation.scoreMax === null ||
          !Number.isFinite(evaluation.scoreEarned) ||
          !Number.isFinite(evaluation.scoreMax) ||
          evaluation.scoreMax <= 0 ||
          evaluation.scoreEarned < 0 ||
          evaluation.scoreEarned > evaluation.scoreMax
        )
          return [];
        const practicedAt = evaluation.checkedAt ?? submission.updatedAt;
        const sourceRecordId = `homework:${submissionId}:${itemId}`;
        return [
          {
            id: sourceRecordId,
            data: {
              teacherId: homework.teacherId,
              studentId: homework.studentId,
              studentProgramId: homework.studentProgramId,
              examBlueprintId,
              provider: "russian100",
              examKind,
              taskNumber: item.examTaskNumbers[0]!,
              score: evaluation.scoreEarned,
              maxScore: evaluation.scoreMax,
              accuracy:
                Math.round(
                  (evaluation.scoreEarned / evaluation.scoreMax) * 10_000,
                ) / 100,
              status: "completed",
              practicedAt,
              importedAt: practicedAt,
              importMethod: "manual",
              sourceRecordId,
              sourceUrl: null,
              createdAt: practicedAt,
              updatedAt: submission.updatedAt,
              schemaVersion: 1,
            },
          },
        ];
      },
    );
  });
}

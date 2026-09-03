import type {
  DocumentWithId,
  ExamKind,
  ExternalPracticeAttempt,
  Homework,
  HomeworkSubmission,
} from "../../lib/firebase/types.js";

export function homeworkPracticeEvidence(
  homeworks: Array<DocumentWithId<Homework>>,
  submissions: Array<DocumentWithId<HomeworkSubmission>>,
  examBlueprintId: string,
  examKind: ExamKind,
): Array<DocumentWithId<ExternalPracticeAttempt>> {
  if (!examBlueprintId) return [];
  const homeworkById = new Map(
    homeworks.map((homework) => [homework.id, homework.data]),
  );
  return submissions.flatMap(({ id: submissionId, data: submission }) => {
    const homework = homeworkById.get(submission.homeworkId);
    if (!homework) return [];
    return (submission.teacherEvaluation?.itemEvaluations ?? []).flatMap(
      (evaluation) => {
        const item = homework.items?.find(
          (candidate) => candidate.itemId === evaluation.itemId,
        );
        if (
          item?.type !== "practice" ||
          item.examTaskNumbers.length !== 1 ||
          (item.examBlueprintId ?? homework.examBlueprintId) !==
            examBlueprintId ||
          evaluation.scoreEarned === null ||
          evaluation.scoreMax === null ||
          evaluation.scoreMax <= 0
        )
          return [];
        const practicedAt = evaluation.checkedAt ?? submission.updatedAt;
        const sourceRecordId = `homework:${submissionId}:${evaluation.itemId}`;
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

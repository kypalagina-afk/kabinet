import type {
  DocumentWithId,
  ExamKind,
  ExternalPracticeAttempt,
  Homework,
  HomeworkSubmission,
  TeacherEvaluation,
} from "../../lib/firebase/types.js";

interface AssessmentResult {
  itemId: string;
  item: Pick<Homework, "type" | "examTaskNumbers" | "examBlueprintId">;
  evaluation: Pick<TeacherEvaluation, "scoreEarned" | "scoreMax" | "checkedAt">;
  reviewed: boolean;
}

function taskForResult(item: AssessmentResult["item"], examKind: ExamKind, includeWritten: boolean) {
  const numbers = item.examTaskNumbers ?? [];
  if (item.type === "practice") return numbers.length === 1 ? numbers[0]! : null;
  if (!includeWritten || numbers.length > 1) return null;
  const essayTask = examKind === "ege" ? 27 : 13;
  if (item.type === "essay") return !numbers.length || numbers[0] === essayTask ? essayTask : null;
  if (item.type === "exposition") return examKind === "oge" && (!numbers.length || numbers[0] === 1) ? 1 : null;
  if (["exam_written_work", "written", "writtenOther"].includes(item.type)) {
    return numbers.length === 1 && (numbers[0] === essayTask || (examKind === "oge" && numbers[0] === 1)) ? numbers[0]! : null;
  }
  return null;
}

function collectHomeworkEvidence(
  homeworks: Array<DocumentWithId<Homework>>,
  submissions: Array<DocumentWithId<HomeworkSubmission>>,
  examBlueprintId: string,
  examKind: ExamKind,
  studentProgramId?: string,
  includeWritten = false,
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
    // Never interpret a multi-part package total as an individual item's result.
    const results: AssessmentResult[] = homework.items?.length
      ? (evaluation.itemEvaluations ?? []).flatMap((result) => {
          const item = homework.items!.find((candidate) => candidate.itemId === result.itemId);
          return item ? [{ itemId: item.itemId, item, evaluation: result, reviewed: result.reviewStatus === "checked" || result.reviewStatus === "needs_revision" }] : [];
        })
      : [{ itemId: "whole", item: homework, evaluation, reviewed: submission.status === "checked" || submission.status === "needs_revision" }];
    return results.flatMap(
      ({ itemId, item, evaluation, reviewed }) => {
        const taskNumber = taskForResult(item, examKind, includeWritten);
        const blueprintId = item.examBlueprintId || homework.examBlueprintId;
        // A missing legacy snapshot may use the verified active program, but an
        // explicit snapshot of a different exam must never be reinterpreted.
        const matchesBlueprint = blueprintId
          ? blueprintId === examBlueprintId
          : Boolean(studentProgramId && homework.studentProgramId === studentProgramId);
        if (
          submission.teacherReceipt?.items[itemId]?.received === false ||
          taskNumber === null ||
          (item.type !== "practice" && !reviewed) ||
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
              taskNumber,
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

type HomeworkEvidenceArgs = [
  homeworks: Array<DocumentWithId<Homework>>,
  submissions: Array<DocumentWithId<HomeworkSubmission>>,
  examBlueprintId: string,
  examKind: ExamKind,
  studentProgramId?: string,
];

// Keep the external practice history limited to practice; written assessments
// are included only in the combined exam analytics. These records are derived,
// never saved as additional Russian100 imports or duplicated in Firestore.
export function homeworkPracticeEvidence(...args: HomeworkEvidenceArgs) {
  return collectHomeworkEvidence(...args);
}

export function homeworkAssessmentEvidence(...args: HomeworkEvidenceArgs) {
  const [homeworks, submissions, blueprintId, examKind, programId] = args;
  return collectHomeworkEvidence(homeworks, submissions, blueprintId, examKind, programId, true);
}

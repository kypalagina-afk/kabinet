import type {
  HomeworkItemEvaluation,
  HomeworkSubmission,
} from "../../lib/firebase/types.js";

export function deriveStructuredPackageStatus(
  requiredItemIds: string[],
  evaluations: HomeworkItemEvaluation[],
): HomeworkSubmission["status"] {
  const relevant = evaluations.filter((evaluation) =>
    requiredItemIds.includes(evaluation.itemId),
  );
  if (relevant.some((evaluation) => evaluation.reviewStatus === "needs_revision"))
    return "needs_revision";
  return requiredItemIds.every((itemId) =>
    relevant.some((evaluation) => evaluation.itemId === itemId),
  )
    ? "checked"
    : "submitted";
}

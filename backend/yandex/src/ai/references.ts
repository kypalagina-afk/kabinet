import type { AIActionDraft } from "./schema.js";

interface DraftReferenceContext {
  studentIds: ReadonlySet<string>;
  lessons: ReadonlyArray<{ id: string; studentId: unknown }>;
  plannerItemIds: ReadonlySet<string>;
}

export function validateDraftReferences(
  draft: AIActionDraft,
  context: DraftReferenceContext,
): string | null {
  if (draft.actionType === "HOMEWORK_DRAFT") {
    return context.studentIds.has(draft.studentId) ? null : "AI_RESPONSE_STUDENT_REFERENCE_INVALID";
  }
  if (
    draft.actionType === "LESSON_SUMMARY_DRAFT" ||
    draft.actionType === "LESSON_RESCHEDULE_DRAFT"
  ) {
    const lesson = context.lessons.find(({ id }) => id === draft.lessonId);
    if (!lesson) return "AI_RESPONSE_LESSON_REFERENCE_INVALID";
    if (lesson.studentId !== draft.studentId || !context.studentIds.has(draft.studentId)) {
      return "AI_RESPONSE_STUDENT_REFERENCE_INVALID";
    }
  }
  if (draft.actionType === "PLANNER_ITEM_UPDATE_DRAFT") {
    return context.plannerItemIds.has(draft.itemId)
      ? null
      : "AI_RESPONSE_PLANNER_REFERENCE_INVALID";
  }
  return null;
}

export function referenceClarification(
  draftId: string,
  errorCode: string,
): AIActionDraft {
  const question = errorCode === "AI_RESPONSE_LESSON_REFERENCE_INVALID"
    ? "Уточните, какой именно урок вы имеете в виду."
    : errorCode === "AI_RESPONSE_PLANNER_REFERENCE_INVALID"
      ? "Уточните, какую именно задачу или событие нужно изменить."
      : "Уточните, какого именно ученика вы имеете в виду.";
  return {
    actionType: "CLARIFICATION_REQUIRED",
    draftId,
    summary: "Нужно уточнение перед созданием черновика.",
    question,
  };
}

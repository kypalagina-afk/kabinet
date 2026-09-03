import type {
  DocumentWithId,
  Homework,
  HomeworkSubmission,
} from "../../lib/firebase/types.js";
import { homeworkDeadlineAt } from "../homework/selectors.js";

export interface HomeworkAnalytics {
  assignedCount: number;
  completedCount: number;
  completionPercent: number;
  submittedCount: number;
  onTimePercent: number | null;
  qualityPercent: number | null;
  qualityCount: number;
}

export function calculateHomeworkAnalytics(
  homeworks: Array<DocumentWithId<Homework>>,
  submissions: Array<DocumentWithId<HomeworkSubmission>>,
  range?: { start: Date; end: Date },
  now = new Date(),
): HomeworkAnalytics {
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const cutoff = Math.min(
    todayEnd.getTime(),
    range?.end.getTime() ?? Number.POSITIVE_INFINITY,
  );
  const selected = homeworks.filter(({ data }) => {
    const assignedAt = data.assignedAt.toMillis();
    if (
      range &&
      (assignedAt < range.start.getTime() || assignedAt > range.end.getTime())
    )
      return false;
    const dueOrAssignedAt = homeworkDeadlineAt(data) ?? assignedAt;
    return dueOrAssignedAt <= cutoff;
  });
  const ids = new Set(selected.map(({ id }) => id));
  const latest = [...submissions]
    .filter(({ data }) => ids.has(data.homeworkId))
    .sort((a, b) => a.data.submissionNumber - b.data.submissionNumber)
    .reduce(
      (map, item) => map.set(item.data.homeworkId, item),
      new Map<string, DocumentWithId<HomeworkSubmission>>(),
    );
  const submitted = [...latest.values()].filter(({ data }) =>
    Boolean(data.submittedAt),
  );
  const completed = [...latest.values()].filter(
    ({ data }) => data.status === "checked",
  );
  const onTime = submitted.filter(({ data }) => {
    const homework = selected.find(({ id }) => id === data.homeworkId)?.data;
    const deadline = homework ? homeworkDeadlineAt(homework) : null;
    return (
      deadline !== null &&
      data.submittedAt &&
      data.submittedAt.toMillis() <= deadline
    );
  });
  const qualityScores = completed.flatMap(({ data }) => {
    const evaluation = data.teacherEvaluation;
    if (!evaluation) return [];
    if (
      evaluation.qualityScore !== undefined &&
      evaluation.qualityScore !== null
    )
      return [evaluation.qualityScore * 10];
    const items =
      evaluation.itemEvaluations?.filter(
        (item) =>
          item.scoreEarned !== null &&
          item.scoreMax !== null &&
          item.scoreMax > 0,
      ) ?? [];
    if (items.length)
      return items.map(
        (item) => ((item.scoreEarned ?? 0) / (item.scoreMax ?? 1)) * 100,
      );
    return evaluation.scoreEarned !== null &&
      evaluation.scoreMax !== null &&
      evaluation.scoreMax > 0
      ? [(evaluation.scoreEarned / evaluation.scoreMax) * 100]
      : [];
  });
  const percent = (part: number, total: number) =>
    total ? Math.round((part / total) * 100) : 0;
  return {
    assignedCount: selected.length,
    completedCount: completed.length,
    completionPercent: percent(completed.length, selected.length),
    submittedCount: submitted.length,
    onTimePercent: submitted.length
      ? percent(onTime.length, submitted.length)
      : null,
    qualityPercent: qualityScores.length
      ? Math.round(
          qualityScores.reduce((sum, value) => sum + value, 0) /
            qualityScores.length,
        )
      : null,
    qualityCount: qualityScores.length,
  };
}

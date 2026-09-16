import type { DocumentWithId, Homework, HomeworkSubmission } from "../../lib/firebase/types.js";
import { homeworkReviewProgress } from "../homework/reviewProgress.js";
import { homeworkDeadlineAt } from "../homework/selectors.js";

function score(value: { scoreEarned: number | null; scoreMax: number | null } | null | undefined) {
  if (value?.scoreEarned == null || value.scoreMax == null || !Number.isFinite(value.scoreEarned) || !Number.isFinite(value.scoreMax) || value.scoreMax <= 0) return null;
  return `${value.scoreEarned}/${value.scoreMax}`;
}

export function buildHomeworkReport(homeworks: DocumentWithId<Homework>[], submissions: DocumentWithId<HomeworkSubmission>[]) {
  return homeworks.filter(({ data }) => !data.draft)
    .slice().sort((a, b) => b.data.assignedAt.toMillis() - a.data.assignedAt.toMillis())
    .map(({ id, data }) => {
      const attempts = submissions.filter(({ data: attempt }) => attempt.homeworkId === id && attempt.studentId === data.studentId && attempt.teacherId === data.teacherId)
        .map(({ data: attempt }) => attempt).sort((a, b) => b.submissionNumber - a.submissionNumber);
      const latest = attempts[0];
      const evaluation = latest?.teacherEvaluation;
      const progress = homeworkReviewProgress(data, attempts);
      const deadline = homeworkDeadlineAt(data);
      return {
        id, studentId: data.studentId, title: data.title, assignedAt: data.assignedAt.toMillis(), deadline,
        dueDate: data.dueDate,
        quality: evaluation?.qualityScore == null ? null : `${evaluation.qualityScore}/10`,
        totalScore: score(evaluation),
        items: progress.items.map((item) => {
          const receipt = latest?.teacherReceipt?.items[item.itemId];
          const receivedAt = receipt?.receivedAt ?? latest?.submittedAt;
          const onTime = item.state === "missing" ? null : latest?.teacherReceipt?.onTime ?? receipt?.onTime
            ?? (deadline != null && receivedAt ? receivedAt.toMillis() <= deadline : null);
          const itemEvaluation = evaluation?.itemEvaluations?.find((entry) => entry.itemId === item.itemId);
          return { ...item, onTime, score: item.state === "missing" ? null : score(itemEvaluation ?? (progress.total === 1 ? evaluation : null)) };
        }),
      };
    });
}

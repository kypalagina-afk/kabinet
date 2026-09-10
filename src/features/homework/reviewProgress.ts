import type { Homework, HomeworkSubmission } from "../../lib/firebase/types.js";
import { homeworkDeadlineAt } from "./selectors.js";

export const reviewItemLabels = {
  missing: "Не сдано",
  pending: "Ждёт проверки",
  checked: "Проверено",
  revision: "На доработке",
};

export function homeworkReviewProgress(homework: Homework, submissions: HomeworkSubmission[], now = Date.now()) {
  const latest = [...submissions].sort((a, b) => b.submissionNumber - a.submissionNumber)[0];
  const assigned = homework.items?.length ? homework.items : [{ itemId: "whole", title: homework.title }];
  const wholeReview = !latest?.teacherEvaluation?.itemEvaluations?.length;
  const items = assigned.map((item) => {
    const review = latest?.teacherEvaluation?.itemEvaluations?.find((entry) => entry.itemId === item.itemId);
    const explicitReceipt = latest?.teacherReceipt?.items[item.itemId]?.received;
    const studentProgress = latest?.studentInput.itemProgress?.find((entry) => entry.itemId === item.itemId);
    const legacyChecked = wholeReview && (latest?.status === "checked" || (!latest && ["checked", "completed"].includes(homework.status)));
    const received = explicitReceipt ?? Boolean(review || legacyChecked || studentProgress?.completed || (!latest?.studentInput.itemProgress?.length && latest?.submittedAt));
    const state: keyof typeof reviewItemLabels = !received ? "missing"
      : review?.reviewStatus === "checked" || legacyChecked ? "checked"
      : review?.reviewStatus === "needs_revision" || (wholeReview && latest?.status === "needs_revision") ? "revision" : "pending";
    return { itemId: item.itemId, title: item.title, state };
  });
  const count = (state: keyof typeof reviewItemLabels) => items.filter((item) => item.state === state).length;
  const checked = count("checked"), pending = count("pending"), missing = count("missing"), revision = count("revision");
  const overdue = missing > 0 && (homeworkDeadlineAt(homework) ?? Infinity) < now;
  const status: Homework["status"] = checked === items.length ? "checked" : pending ? "submitted" : revision ? "needs_revision" : overdue ? "overdue" : "assigned";
  return { items, total: items.length, received: items.length - missing, checked, pending, missing, revision, overdue, status };
}

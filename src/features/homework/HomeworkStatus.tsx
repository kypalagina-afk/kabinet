import type { Homework, HomeworkSubmission } from "../../lib/firebase/types";
import { homeworkReviewProgress } from "./reviewProgress";
import { effectiveHomeworkStatus } from "./selectors";

const labels: Record<Homework["status"], string> = {
  assigned: "Назначено",
  submitted: "На проверке",
  checked: "Проверено",
  needs_revision: "Нужна доработка",
  completed: "Завершено",
  overdue: "Просрочено",
};

export function HomeworkStatus({ homework, submissions }: { homework: Homework; submissions?: HomeworkSubmission[] }) {
  const progress = submissions ? homeworkReviewProgress(homework, submissions) : null;
  const status = progress?.status ?? effectiveHomeworkStatus(homework);
  return (
    <span className={`status-chip status-chip--${status}`}>
      {progress && progress.checked > 0 && progress.checked < progress.total ? `Проверено ${progress.checked} из ${progress.total}` : labels[status]}
    </span>
  );
}

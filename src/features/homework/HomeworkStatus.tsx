import type { Homework } from "../../lib/firebase/types";
import { effectiveHomeworkStatus } from "./selectors";

const labels: Record<Homework["status"], string> = {
  assigned: "Назначено",
  submitted: "На проверке",
  checked: "Проверено",
  needs_revision: "Нужна доработка",
  completed: "Завершено",
  overdue: "Просрочено",
};

export function HomeworkStatus({ homework }: { homework: Homework }) {
  const status = effectiveHomeworkStatus(homework);
  return (
    <span className={`status-chip status-chip--${status}`}>
      {labels[status]}
    </span>
  );
}

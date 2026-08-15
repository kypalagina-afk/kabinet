import type { Homework } from "../../lib/firebase/types";

export function effectiveHomeworkStatus(homework: Homework): Homework["status"] {
  if (
    homework.status === "assigned" &&
    homework.dueAt?.toMillis() !== undefined &&
    homework.dueAt.toMillis() < Date.now()
  ) {
    return "overdue";
  }
  if (
    homework.status === "assigned" &&
    homework.dueDate &&
    homework.dueDate < new Date().toISOString().slice(0, 10)
  ) {
    return "overdue";
  }
  return homework.status;
}

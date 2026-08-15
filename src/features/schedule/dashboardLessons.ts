import type { Lesson } from "../../lib/firebase/types.js";

export function isCurrentDashboardLesson(status: Lesson["status"]): boolean {
  return status === "planned" || status === "completed";
}

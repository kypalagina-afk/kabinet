import type { Homework } from "../../lib/firebase/types.js";
import { zonedLocalDateTimeToDate } from "../schedule/timezone.js";

export const DATE_ONLY_HOMEWORK_TIMEZONE = "Europe/Moscow";

function nextDateKey(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Homework date-only deadlines expire at the end of the selected day in
 * Europe/Moscow. An explicit dueTimezone is respected when a time is set.
 * This policy deliberately does not depend on the browser timezone.
 */
export function homeworkDeadlineAt(homework: Homework): number | null {
  const explicit = homework.dueAt?.toMillis();
  if (explicit !== undefined) return explicit;
  if (!homework.dueDate) return null;

  const timezone = homework.dueTimezone || DATE_ONLY_HOMEWORK_TIMEZONE;
  try {
    if (homework.dueTime) {
      return zonedLocalDateTimeToDate(
        homework.dueDate,
        homework.dueTime,
        timezone,
      ).getTime();
    }
    return (
      zonedLocalDateTimeToDate(
        nextDateKey(homework.dueDate),
        "00:00",
        DATE_ONLY_HOMEWORK_TIMEZONE,
      ).getTime() - 1
    );
  } catch {
    return (
      zonedLocalDateTimeToDate(
        nextDateKey(homework.dueDate),
        "00:00",
        DATE_ONLY_HOMEWORK_TIMEZONE,
      ).getTime() - 1
    );
  }
}

export function effectiveHomeworkStatus(
  homework: Homework,
  now = Date.now(),
): Homework["status"] {
  if (
    (homework.status === "assigned" || homework.status === "overdue") &&
    (homeworkDeadlineAt(homework) ?? Number.POSITIVE_INFINITY) < now
  ) return "overdue";
  return homework.status;
}

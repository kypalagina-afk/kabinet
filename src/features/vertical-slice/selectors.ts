import type {
  DocumentWithId,
  Homework,
  Lesson,
  MockExam,
} from "../../lib/firebase/types.js";
import {
  effectiveHomeworkStatus,
  homeworkDeadlineAt,
} from "../homework/selectors.js";

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
});

export function formatDateTime(timestamp: { toDate(): Date } | null): string {
  return timestamp ? dateTimeFormatter.format(timestamp.toDate()) : "Не указано";
}

export function formatDate(timestamp: { toDate(): Date } | null): string {
  return timestamp ? dateFormatter.format(timestamp.toDate()) : "Не указано";
}

export function formatLocalDate(date: string | null | undefined): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Не указано";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

export function formatHomeworkDueDate(homework: Homework): string {
  return homework.dueAt
    ? formatDate(homework.dueAt)
    : formatLocalDate(homework.dueDate);
}

export function selectNearestLesson(
  lessons: Array<DocumentWithId<Lesson>>,
): DocumentWithId<Lesson> | null {
  const now = Date.now();
  return (
    [...lessons]
      .filter(
        ({ data }) => data.status === "planned" && data.startAt.toMillis() >= now,
      )
      .sort((left, right) => left.data.startAt.toMillis() - right.data.startAt.toMillis())[0] ??
    null
  );
}

export function selectCurrentHomework(
  homeworks: Array<DocumentWithId<Homework>>,
  now = Date.now(),
): DocumentWithId<Homework> | null {
  const rank = (homework: Homework) => {
    const status = effectiveHomeworkStatus(homework, now);
    if (status === "needs_revision") return 0;
    if (status === "overdue") return 1;
    if (status === "assigned") return 2;
    if (status === "submitted") return 3;
    return 4;
  };
  const active = [...homeworks].filter(({ data }) => rank(data) < 4);
  return active.sort((left, right) => {
    const rankDelta = rank(left.data) - rank(right.data);
    if (rankDelta) return rankDelta;
    if (rank(left.data) <= 2) {
      const leftDeadline = homeworkDeadlineAt(left.data) ?? Number.POSITIVE_INFINITY;
      const rightDeadline = homeworkDeadlineAt(right.data) ?? Number.POSITIVE_INFINITY;
      if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
    }
    return right.data.assignedAt.toMillis() - left.data.assignedAt.toMillis();
  })[0] ?? null;
}

export function selectLatestMockExam(
  mockExams: Array<DocumentWithId<MockExam>>,
): DocumentWithId<MockExam> | null {
  return (
    [...mockExams].sort((left, right) => {
      const leftTime = (left.data.takenAt ?? left.data.createdAt).toMillis();
      const rightTime = (right.data.takenAt ?? right.data.createdAt).toMillis();
      return rightTime - leftTime;
    })[0] ?? null
  );
}

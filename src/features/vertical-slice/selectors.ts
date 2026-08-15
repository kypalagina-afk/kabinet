import type {
  DocumentWithId,
  Homework,
  Lesson,
  MockExam,
} from "../../lib/firebase/types";

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
  const [year, month, day] = date.split("-").map(Number);
  return dateFormatter.format(new Date(year!, month! - 1, day));
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
): DocumentWithId<Homework> | null {
  const activeStatuses = new Set<Homework["status"]>([
    "assigned",
    "submitted",
    "needs_revision",
    "overdue",
  ]);
  return (
    [...homeworks]
      .filter(({ data }) => activeStatuses.has(data.status))
      .sort(
        (left, right) =>
          right.data.assignedAt.toMillis() - left.data.assignedAt.toMillis(),
      )[0] ?? null
  );
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

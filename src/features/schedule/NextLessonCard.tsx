import type {
  DocumentWithId,
  Lesson,
  Student,
  UserProfile,
} from "../../lib/firebase/types";
import { formatDateTimeForTimezone, resolveTimezone } from "./timezone";

export function NextLessonCard({
  lesson,
  student,
  timezone,
  loading,
}: {
  lesson: DocumentWithId<Lesson> | null;
  student: Student | null;
  timezone: UserProfile["timezone"] | null | undefined;
  loading: boolean;
}) {
  const studentTimezone = resolveTimezone(timezone);
  const moscowTimezone = resolveTimezone({
    iana: "Europe/Moscow",
    moscowOffsetMinutes: 180,
  });
  const conferenceUrl =
    lesson?.data.conferenceUrl ??
    student?.conferenceLinks?.find((item) => item.isDefault)?.joinUrl ??
    student?.defaultConference.joinUrl;

  return (
    <article
      className="dashboard-card dashboard-card--lesson next-lesson-card"
      data-testid="student-lesson"
    >
      <span className="summary-card__label">Ближайшее занятие</span>
      {loading ? <strong>Ищем ближайшее занятие…</strong> : null}
      {!loading && !lesson ? (
        <>
          <strong>Пока не запланировано</strong>
          <p>
            Новое занятие появится здесь сразу после добавления преподавателем.
          </p>
        </>
      ) : null}
      {lesson ? (
        <>
          <strong data-testid="student-next-lesson-time">
            {formatDateTimeForTimezone(
              lesson.data.startAt.toDate(),
              studentTimezone,
            )}
          </strong>
          {studentTimezone.label !== moscowTimezone.label ? (
            <span className="dashboard-card__meta">
              Москва:{" "}
              {formatDateTimeForTimezone(
                lesson.data.startAt.toDate(),
                moscowTimezone,
              )}
            </span>
          ) : null}
          <p>{lesson.data.topic ?? "Тема появится позже"}</p>
          <span className="dashboard-card__meta">
            {Math.round(
              (lesson.data.endAt.toMillis() - lesson.data.startAt.toMillis()) /
                60_000,
            )}{" "}
            минут
            {lesson.data.wasRescheduled ? " · Перенесено" : ""}
          </span>
          {conferenceUrl ? (
            <a
              className="primary-button next-lesson-card__join"
              href={conferenceUrl}
              rel="noreferrer"
              target="_blank"
            >
              Подключиться
            </a>
          ) : (
            <span className="dashboard-card__meta">
              Ссылка на подключение появится позже
            </span>
          )}
        </>
      ) : null}
    </article>
  );
}

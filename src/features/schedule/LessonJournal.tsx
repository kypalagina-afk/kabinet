import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  DocumentWithId,
  Homework,
  Lesson,
  LessonTeacherNote,
  UserProfile,
} from "../../lib/firebase/types";
import { CompleteLessonForm } from "./CompleteLessonForm";
import { dateKeyForTimezone, formatDateTimeForTimezone, resolveTimezone } from "./timezone";

const understandingLabels = {
  needs_practice: "Нужна отработка",
  in_progress: "В процессе",
  confident: "Уверенно",
} as const;
function lessonWord(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  return mod100 >= 11 && mod100 <= 14
    ? "занятий"
    : mod10 === 1
      ? "занятие"
      : mod10 >= 2 && mod10 <= 4
        ? "занятия"
        : "занятий";
}

export function LessonJournal({
  lessons,
  homeworks,
  audience,
  teacherId = "",
  notes = [],
  initialLessonId,
  timezone,
  taskNumbers,
}: {
  lessons: Array<DocumentWithId<Lesson>>;
  homeworks: Array<DocumentWithId<Homework>>;
  audience: "teacher" | "student";
  teacherId?: string;
  notes?: Array<DocumentWithId<LessonTeacherNote>>;
  initialLessonId?: string | null;
  timezone?: UserProfile["timezone"];
  taskNumbers?: number[];
}) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(initialLessonId ? [initialLessonId] : []),
  );
  const [month, setMonth] = useState("");
  const [task, setTask] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const resolvedTimezone = useMemo(() => resolveTimezone(timezone), [timezone]);
  const completed = useMemo(
    () =>
      lessons
        .filter(({ data }) => data.status === "completed")
        .filter(
          ({ data }) =>
            !month ||
            dateKeyForTimezone(data.startAt.toDate(), resolvedTimezone).slice(0, 7) === month,
        )
        .filter(({ data }) => !task || data.examTaskNumbers?.includes(task))
        .sort((a, b) => b.data.startAt.toMillis() - a.data.startAt.toMillis()),
    [lessons, month, resolvedTimezone, task],
  );
  const visibleCompleted = completed.slice(0, pageSize);
  const tasks = [
    ...new Set(lessons.flatMap(({ data }) => data.examTaskNumbers ?? [])),
  ].sort((a, b) => a - b);
  const understood = completed.filter((item) => item.data.understanding);
  const average = understood.length
    ? Math.round(
        understood.reduce(
          (sum, item) => sum + (item.data.understanding?.score ?? 0),
          0,
        ) / understood.length,
      )
    : 0;
  useEffect(() => {
    if (!initialLessonId || !completed.some(({ id }) => id === initialLessonId))
      return;
    requestAnimationFrame(() =>
      document
        .getElementById(`lesson-${initialLessonId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }, [completed, initialLessonId]);
  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <section className="lesson-journal" id="lessons">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Журнал</p>
          <h2>{audience === "teacher" ? "Занятия ученика" : "Мои занятия"}</h2>
        </div>
        <div className="form-actions">
          <button
            className="secondary-button"
            onClick={() => setOpen(new Set(completed.map(({ id }) => id)))}
            type="button"
          >
            Развернуть все
          </button>
          <button
            className="secondary-button"
            onClick={() => setOpen(new Set())}
            type="button"
          >
            Свернуть все
          </button>
        </div>
      </div>
      <div className="journal-summary">
        <span>
          <strong>{completed.length}</strong> {lessonWord(completed.length)} в
          выборке
        </span>
        <span>
          <strong>{average ? `${average}/10` : "—"}</strong> среднее понимание
        </span>
        <span>
          <strong>{tasks.length}</strong> заданий тренировали
        </span>
      </div>
      <div className="filter-bar journal-filters">
        <label>
          <span>Месяц</span>
          <input
            onChange={(event) => setMonth(event.target.value)}
            type="month"
            value={month}
          />
        </label>
        <label>
          <span>Задание</span>
          <select
            onChange={(event) => setTask(Number(event.target.value))}
            value={task}
          >
            <option value={0}>Все задания</option>
            {tasks.map((value) => (
              <option key={value} value={value}>
                №{value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="lesson-history">
        {visibleCompleted.map((lesson) => {
    const expanded = open.has(lesson.id) || initialLessonId === lesson.id;
          const linkedHomework = homeworks.find(
            ({ data }) => data.sourceLessonId === lesson.id,
          );
          const separatelyAssignedHomework = linkedHomework
            ? undefined
            : homeworks
                .filter(({ data }) =>
                  !data.sourceLessonId
                  && Math.abs(data.assignedAt.toMillis() - lesson.data.endAt.toMillis()) <= 24 * 60 * 60 * 1000,
                )
                .sort(
                  (left, right) =>
                    Math.abs(left.data.assignedAt.toMillis() - lesson.data.endAt.toMillis())
                    - Math.abs(right.data.assignedAt.toMillis() - lesson.data.endAt.toMillis()),
                )[0];
          const homework = linkedHomework ?? separatelyAssignedHomework;
          const note = notes.find(({ data }) => data.lessonId === lesson.id);
          const target = initialLessonId === lesson.id;
          return (
            <article
              className={`lesson-history-card${target ? " lesson-history-card--target" : ""}`}
              id={`lesson-${lesson.id}`}
              key={lesson.id}
            >
              <button
                aria-expanded={expanded}
                className="lesson-history-card__summary"
                onClick={() => toggle(lesson.id)}
                type="button"
              >
                <span>
                  <small>{formatDateTimeForTimezone(lesson.data.startAt.toDate(), resolvedTimezone, { dateStyle: "long", timeStyle: "short" })}</small>
                  <strong>
                    {lesson.data.topic ?? "Итоги занятия не заполнены"}
                  </strong>
                  <span className="tag-row">
                    {lesson.data.examTaskNumbers?.map((number) => (
                      <i className="status-chip" key={number}>
                        №{number}
                      </i>
                    ))}
                  </span>
                </span>
                {lesson.data.understanding ? (
                  <span
                    className={`status-chip understanding--${lesson.data.understanding.status}`}
                  >
                    {lesson.data.understanding.score}/10 ·{" "}
                    {understandingLabels[lesson.data.understanding.status]}
                  </span>
                ) : null}
                <b>{expanded ? "−" : "+"}</b>
              </button>
              {expanded ? (
                <div className="lesson-history-card__details">
                  {lesson.data.lessonSummary.focusNotes.length ? (
                    <p>
                      <strong>Обратить внимание:</strong>{" "}
                      {lesson.data.lessonSummary.focusNotes.join("; ")}
                    </p>
                  ) : null}
                  {lesson.data.lessonSummary.studentComment ||
                  lesson.data.lessonSummary.teacherComment ? (
                    <p>
                      <strong>Комментарий:</strong>{" "}
                      {lesson.data.lessonSummary.studentComment ??
                        lesson.data.lessonSummary.teacherComment}
                    </p>
                  ) : null}
                  {homework ? (
                    <Link
                      to={
                        audience === "teacher"
                          ? `/teacher/homeworks?homework=${homework.id}`
                          : `/student/homework?homework=${homework.id}`
                      }
                    >
                      {linkedHomework
                        ? "Домашнее задание →"
                        : "Домашнее задание выдано отдельно →"}
                    </Link>
                  ) : audience === "teacher" ? (
                    <p>
                      {lesson.data.homeworkResolution === "not_required"
                        ? "ДЗ не требуется"
                        : "ДЗ пока не выдано"}
                    </p>
                  ) : null}
                  {audience === "teacher" && note ? (
                    <details className="private-field">
                      <summary>Приватная заметка</summary>
                      <p>{note.data.note}</p>
                    </details>
                  ) : null}
                  {audience === "teacher" ? (
                    <CompleteLessonForm
                      lesson={lesson}
                      taskNumbers={taskNumbers}
                      teacherId={teacherId}
                    />
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {completed.length > visibleCompleted.length ? (
        <button className="secondary-button history-load-more" onClick={() => setPageSize((value) => value + 20)} type="button">
          Показать ещё
        </button>
      ) : null}
      {!completed.length ? (
        <p className="content-state">Завершённые занятия появятся здесь.</p>
      ) : null}
    </section>
  );
}

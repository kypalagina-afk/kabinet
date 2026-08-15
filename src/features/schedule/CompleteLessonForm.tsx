import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  completeLesson,
  setLessonHomeworkResolution,
  updateCompletedLessonSummary,
} from "../../lib/firebase/services/completeLesson";
import type {
  DocumentWithId,
  Homework,
  Lesson,
} from "../../lib/firebase/types";

type Understanding = "needs_practice" | "in_progress" | "confident";
const labels: Record<Understanding, string> = {
  needs_practice: "Нужна отработка",
  in_progress: "В процессе",
  confident: "Уверенно",
};
const suggestedStatus = (score: number): Understanding =>
  score <= 4 ? "needs_practice" : score <= 7 ? "in_progress" : "confident";

export function CompleteLessonForm({
  lesson,
  teacherId,
  previousHomework,
  taskNumbers = Array.from({ length: 13 }, (_, index) => index + 1),
}: {
  lesson: DocumentWithId<Lesson>;
  teacherId: string;
  previousHomework?: DocumentWithId<Homework>;
  taskNumbers?: number[];
}) {
  const key = `lesson-summary-draft:${lesson.id}`;
  const [open, setOpen] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [completed, setCompleted] = useState(false);
  const initial = useMemo(
    () => ({
      topic: lesson.data.topic ?? "",
      score: lesson.data.understanding?.score ?? 7,
      understandingStatus:
        lesson.data.understanding?.status ?? ("in_progress" as Understanding),
      tasks: lesson.data.examTaskNumbers ?? [],
      errors:
        lesson.data.lessonSummary.errors ??
        lesson.data.lessonSummary.focusNotes ??
        [],
      errorDraft: "",
      studentComment:
        lesson.data.lessonSummary.studentComment ??
        lesson.data.lessonSummary.teacherComment ??
        "",
      privateNote: "",
      detailsOpen: false,
    }),
    [lesson.data],
  );
  const [values, setValues] = useState(initial);
  const [draftFound, setDraftFound] = useState(
    () =>
      lesson.data.status !== "completed" && Boolean(localStorage.getItem(key)),
  );
  useEffect(() => {
    if (!open || completed) return;
    const handle = setTimeout(
      () => localStorage.setItem(key, JSON.stringify(values)),
      350,
    );
    return () => clearTimeout(handle);
  }, [completed, key, open, values]);
  function toggleTask(task: number) {
    setValues((current) => ({
      ...current,
      tasks: current.tasks.includes(task)
        ? current.tasks.filter((value) => value !== task)
        : [...current.tasks, task].sort((a, b) => a - b),
    }));
  }
  function addError(event?: KeyboardEvent<HTMLInputElement>) {
    if (event && event.key !== "Enter") return;
    event?.preventDefault();
    const value = values.errorDraft.trim();
    if (!value) return;
    setValues((current) => ({
      ...current,
      errors: [...new Set([...current.errors, value])],
      errorDraft: "",
    }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaveState("saving");
    const lessonSummary: Lesson["lessonSummary"] = {
      homeworkResultText: previousHomework
        ? "Домашнее задание проверено"
        : null,
      teacherComment: values.studentComment.trim() || null,
      focusNotes: values.errors,
      errors: values.errors,
      studentComment: values.studentComment.trim() || null,
    };
    try {
      if (lesson.data.status === "completed")
        await updateCompletedLessonSummary(getFirebaseDb(), {
          lessonId: lesson.id,
          teacherId,
          topic: values.topic,
          understanding: {
            score: values.score,
            status: values.understandingStatus,
          },
          examTaskNumbers: values.tasks,
          lessonSummary,
          privateTeacherNote: values.privateNote || null,
        });
      else
        await completeLesson(getFirebaseDb(), {
          lessonId: lesson.id,
          teacherId,
          topic: values.topic,
          understanding: {
            score: values.score,
            status: values.understandingStatus,
          },
          examTaskNumbers: values.tasks,
          lessonSummary,
          privateTeacherNote: values.privateNote || null,
          previousHomework: previousHomework
            ? { id: previousHomework.id, status: "completed" }
            : undefined,
        });
      localStorage.removeItem(key);
      setSaveState("success");
      setCompleted(true);
    } catch {
      setSaveState("error");
    }
  }
  async function noHomework() {
    await setLessonHomeworkResolution(
      getFirebaseDb(),
      lesson.id,
      teacherId,
      "not_required",
    );
    setOpen(false);
    setCompleted(false);
  }
  return (
    <>
      <button
        className={
          lesson.data.status === "completed"
            ? "secondary-button"
            : "primary-button primary-button--fit"
        }
        onClick={() => {
          setCompleted(false);
          setSaveState("idle");
          setOpen(true);
        }}
        type="button"
      >
        {lesson.data.status === "completed"
          ? "Редактировать итоги"
          : "Завершить урок"}
      </button>
      {open ? (
        <Modal
          className="complete-lesson-modal"
          onClose={() => setOpen(false)}
          title={
            lesson.data.status === "completed"
              ? "Редактировать итоги занятия"
              : "Завершить занятие"
          }
        >
          {completed ? (
            <div
              className="completion-success"
              data-testid="lesson-completion-success"
            >
              <span className="success-mark">✓</span>
              <h3>Урок завершён · Итоги сохранены</h3>
              <p>Итоги уже появились в журнале ученика.</p>
              <div className="completion-next-actions">
                <Link
                  className="primary-button"
                  onClick={() => setOpen(false)}
                  to={`/teacher/students/${lesson.data.studentId}?tab=homework&sourceLesson=${lesson.id}`}
                >
                  Выдать ДЗ сейчас
                </Link>
                <button
                  className="secondary-button"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Позже
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void noHomework()}
                  type="button"
                >
                  ДЗ не требуется
                </button>
              </div>
            </div>
          ) : (
            <form
              className="complete-lesson-content"
              onSubmit={(event) => void submit(event)}
            >
              {draftFound ? (
                <div className="draft-banner">
                  <span>Найден черновик итогов.</span>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      const raw = localStorage.getItem(key);
                      if (raw) setValues(JSON.parse(raw) as typeof values);
                      setDraftFound(false);
                    }}
                    type="button"
                  >
                    Продолжить
                  </button>
                </div>
              ) : null}
              <label className="form-field">
                <span>Тема урока</span>
                <input
                  autoFocus
                  required
                  value={values.topic}
                  onChange={(event) =>
                    setValues({ ...values, topic: event.target.value })
                  }
                />
              </label>
              <fieldset className="task-chip-selector">
                <legend>Что тренировали</legend>
                <button
                  aria-pressed={values.tasks.length === 0}
                  className="task-chip task-chip--general"
                  onClick={() => setValues({ ...values, tasks: [] })}
                  type="button"
                >
                  Общая теория
                </button>
                {taskNumbers.map((task) => (
                  <button
                    aria-pressed={values.tasks.includes(task)}
                    className="task-chip"
                    key={task}
                    onClick={() => toggleTask(task)}
                    type="button"
                  >
                    №{task}
                  </button>
                ))}
              </fieldset>
              <div className="understanding-editor">
                <label className="form-field">
                  <span>Понимание на занятии · {values.score}/10</span>
                  <input
                    max="10"
                    min="1"
                    onChange={(event) => {
                      const score = Number(event.target.value);
                      setValues({
                        ...values,
                        score,
                        understandingStatus: suggestedStatus(score),
                      });
                    }}
                    type="range"
                    value={values.score}
                  />
                </label>
                <fieldset className="understanding-options">
                  <legend>Статус</legend>
                  {(Object.keys(labels) as Understanding[]).map((status) => (
                    <button
                      aria-pressed={values.understandingStatus === status}
                      key={status}
                      onClick={() =>
                        setValues({ ...values, understandingStatus: status })
                      }
                      type="button"
                    >
                      {labels[status]}
                    </button>
                  ))}
                </fieldset>
              </div>
              <div className="form-field">
                <label htmlFor={`lesson-errors-${lesson.id}`}>
                  Ошибки / обратить внимание
                </label>
                <div className="tag-editor">
                  <div className="tag-row">
                    {values.errors.map((value) => (
                      <button
                        aria-label={`Удалить ${value}`}
                        className="status-chip"
                        key={value}
                        onClick={() =>
                          setValues({
                            ...values,
                            errors: values.errors.filter(
                              (item) => item !== value,
                            ),
                          })
                        }
                        type="button"
                      >
                        {value} ×
                      </button>
                    ))}
                  </div>
                  <input
                    id={`lesson-errors-${lesson.id}`}
                    onBlur={() => addError()}
                    onChange={(event) =>
                      setValues({ ...values, errorDraft: event.target.value })
                    }
                    onKeyDown={addError}
                    placeholder="Введите ошибку и нажмите Enter"
                    value={values.errorDraft}
                  />
                </div>
              </div>
              <button
                aria-expanded={values.detailsOpen}
                className="details-toggle"
                onClick={() =>
                  setValues((current) => ({
                    ...current,
                    detailsOpen: !current.detailsOpen,
                  }))
                }
                type="button"
              >
                {values.detailsOpen
                  ? "Скрыть подробности"
                  : "Добавить подробности"}
              </button>
              {values.detailsOpen ? (
                <div
                  className="optional-details"
                  data-testid="lesson-optional-details"
                >
                  <label className="form-field">
                    <span>Комментарий ученику · необязательно</span>
                    <textarea
                      onChange={(event) =>
                        setValues({
                          ...values,
                          studentComment: event.target.value,
                        })
                      }
                      rows={3}
                      value={values.studentComment}
                    />
                  </label>
                  <label className="form-field private-field">
                    <span>Приватная заметка преподавателя · необязательно</span>
                    <textarea
                      onChange={(event) =>
                        setValues({
                          ...values,
                          privateNote: event.target.value,
                        })
                      }
                      rows={3}
                      value={values.privateNote}
                    />
                  </label>
                </div>
              ) : null}
              <div className="form-actions">
                <button
                  className="primary-button primary-button--fit"
                  disabled={saveState === "saving"}
                >
                  {saveState === "saving"
                    ? "Сохраняем…"
                    : saveState === "error"
                      ? "Попробовать снова"
                      : lesson.data.status === "completed"
                        ? "Сохранить изменения"
                        : "Завершить урок"}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Отмена
                </button>
              </div>
              {saveState === "error" ? (
                <span className="form-error">
                  Не удалось сохранить. Черновик остался на устройстве.
                </span>
              ) : null}
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}

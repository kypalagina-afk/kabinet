import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  completeLesson,
  setLessonHomeworkResolution,
  updateCompletedLessonSummary,
} from "../../lib/firebase/services/completeLesson";
import type { DocumentWithId, Lesson } from "../../lib/firebase/types";

type UnderstandingStatus = "needs_practice" | "in_progress" | "confident";
interface StudentOutcome {
  score: number;
  status: UnderstandingStatus;
  errors: string;
  comment: string;
  privateNote: string;
}

function statusForScore(score: number): UnderstandingStatus {
  return score <= 4 ? "needs_practice" : score <= 7 ? "in_progress" : "confident";
}

function initialOutcome(lesson: Lesson): StudentOutcome {
  return {
    score: lesson.understanding?.score ?? 7,
    status: lesson.understanding?.status ?? "in_progress",
    errors: (lesson.lessonSummary.errors ?? lesson.lessonSummary.focusNotes ?? []).join("; "),
    comment:
      lesson.lessonSummary.studentComment ??
      lesson.lessonSummary.teacherComment ??
      "",
    privateNote: "",
  };
}

function errorsFromText(value: string) {
  return [...new Set(value.split(/[;\n]/u).map((item) => item.trim()).filter(Boolean))];
}

function PairOutcomeEditor({
  name,
  value,
  onChange,
}: {
  name: string;
  value: StudentOutcome;
  onChange(value: StudentOutcome): void;
}) {
  return (
    <section className="pair-outcome-card">
      <h3>{name}</h3>
      <label className="form-field">
        <span>Понимание на занятии · {value.score}/10</span>
        <input
          max="10"
          min="1"
          onChange={(event) => {
            const score = Number(event.target.value);
            onChange({ ...value, score, status: statusForScore(score) });
          }}
          type="range"
          value={value.score}
        />
      </label>
      <label className="form-field">
        <span>Статус</span>
        <select
          onChange={(event) =>
            onChange({ ...value, status: event.target.value as UnderstandingStatus })
          }
          value={value.status}
        >
          <option value="needs_practice">Нужна отработка</option>
          <option value="in_progress">В процессе</option>
          <option value="confident">Уверенно</option>
        </select>
      </label>
      <label className="form-field">
        <span>Ошибки / обратить внимание</span>
        <textarea
          onChange={(event) => onChange({ ...value, errors: event.target.value })}
          placeholder="Разделяйте ошибки точкой с запятой или новой строкой"
          rows={3}
          value={value.errors}
        />
      </label>
      <label className="form-field">
        <span>Комментарий ученику · необязательно</span>
        <textarea
          onChange={(event) => onChange({ ...value, comment: event.target.value })}
          rows={3}
          value={value.comment}
        />
      </label>
      <label className="form-field private-field">
        <span>Приватная заметка · необязательно</span>
        <textarea
          onChange={(event) => onChange({ ...value, privateNote: event.target.value })}
          rows={2}
          value={value.privateNote}
        />
      </label>
    </section>
  );
}

export function CompletePairLessonForm({
  firstLesson,
  secondLesson,
  firstStudentName,
  secondStudentName,
  teacherId,
  taskNumbers,
}: {
  firstLesson: DocumentWithId<Lesson>;
  secondLesson: DocumentWithId<Lesson>;
  firstStudentName: string;
  secondStudentName: string;
  teacherId: string;
  taskNumbers: number[];
}) {
  const initial = useMemo(
    () => ({
      topic: firstLesson.data.topic ?? secondLesson.data.topic ?? "",
      activities:
        firstLesson.data.lessonSummary.activities ??
        secondLesson.data.lessonSummary.activities ??
        "",
      tasks: firstLesson.data.examTaskNumbers ?? secondLesson.data.examTaskNumbers ?? [],
      first: initialOutcome(firstLesson.data),
      second: initialOutcome(secondLesson.data),
    }),
    [firstLesson.data, secondLesson.data],
  );
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");

  function toggleTask(task: number) {
    setValues((current) => ({
      ...current,
      tasks: current.tasks.includes(task)
        ? current.tasks.filter((item) => item !== task)
        : [...current.tasks, task].sort((left, right) => left - right),
    }));
  }

  async function saveLesson(lesson: DocumentWithId<Lesson>, outcome: StudentOutcome) {
    const errors = errorsFromText(outcome.errors);
    const lessonSummary: Lesson["lessonSummary"] = {
      homeworkResultText: null,
      teacherComment: outcome.comment.trim() || null,
      focusNotes: errors,
      errors,
      studentComment: outcome.comment.trim() || null,
      activities: values.activities.trim() || null,
    };
    const payload = {
      lessonId: lesson.id,
      teacherId,
      topic: values.topic,
      understanding: { score: outcome.score, status: outcome.status },
      examTaskNumbers: values.tasks,
      lessonSummary,
      privateTeacherNote: outcome.privateNote.trim() || null,
    };
    return lesson.data.status === "completed"
      ? updateCompletedLessonSummary(getFirebaseDb(), payload)
      : completeLesson(getFirebaseDb(), payload);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("saving");
    try {
      await Promise.all([
        saveLesson(firstLesson, values.first),
        saveLesson(secondLesson, values.second),
      ]);
      setState("success");
    } catch (error) {
      console.error("Pair lesson completion failed", error);
      setState("error");
    }
  }

  async function noHomework() {
    await Promise.all([
      setLessonHomeworkResolution(getFirebaseDb(), firstLesson.id, teacherId, "not_required"),
      setLessonHomeworkResolution(getFirebaseDb(), secondLesson.id, teacherId, "not_required"),
    ]);
    setOpen(false);
  }

  const editing =
    firstLesson.data.status === "completed" && secondLesson.data.status === "completed";
  return (
    <>
      <button
        className={editing ? "secondary-button" : "primary-button primary-button--fit"}
        onClick={() => {
          setValues(initial);
          setState("idle");
          setOpen(true);
        }}
        type="button"
      >
        {editing ? "Редактировать итоги пары" : "Завершить урок пары"}
      </button>
      {open ? (
        <Modal
          className="complete-lesson-modal pair-lesson-modal"
          onClose={() => setOpen(false)}
          title={editing ? "Редактировать итоги парного занятия" : "Завершить парное занятие"}
        >
          {state === "success" ? (
            <div className="completion-success">
              <span className="success-mark">✓</span>
              <h3>Общие и индивидуальные итоги сохранены</h3>
              <p>У каждого ученика обновились собственный журнал и статистика.</p>
              <div className="completion-next-actions">
                <Link
                  className="primary-button"
                  onClick={() => setOpen(false)}
                  to={`/teacher/students/${firstLesson.data.studentId}?tab=homework&sourceLesson=${firstLesson.id}`}
                >
                  Выдать одинаковое ДЗ обоим
                </Link>
                <button className="secondary-button" onClick={() => setOpen(false)} type="button">Позже</button>
                <button className="secondary-button" onClick={() => void noHomework()} type="button">ДЗ не требуется</button>
              </div>
            </div>
          ) : (
            <form className="complete-lesson-content" onSubmit={(event) => void submit(event)}>
              <p className="pair-lesson-notice">Общие данные применятся к обоим ученикам. Результаты ниже сохраняются раздельно.</p>
              <label className="form-field">
                <span>Общая тема урока</span>
                <input autoFocus onChange={(event) => setValues({ ...values, topic: event.target.value })} required value={values.topic} />
              </label>
              <label className="form-field">
                <span>Общие материалы и что делали · необязательно</span>
                <textarea
                  onChange={(event) => setValues({ ...values, activities: event.target.value })}
                  placeholder="Учебник, платформа, ссылки, упражнения и этапы урока"
                  rows={3}
                  value={values.activities}
                />
              </label>
              <fieldset className="task-chip-selector pair-task-selector">
                <legend>Что тренировали вместе</legend>
                <button aria-pressed={!values.tasks.length} className="task-chip task-chip--general" onClick={() => setValues({ ...values, tasks: [] })} type="button">Общая теория</button>
                {taskNumbers.map((task) => <button aria-pressed={values.tasks.includes(task)} className="task-chip" key={task} onClick={() => toggleTask(task)} type="button">№{task}</button>)}
              </fieldset>
              <div className="pair-outcome-grid">
                <PairOutcomeEditor name={firstStudentName} onChange={(first) => setValues({ ...values, first })} value={values.first} />
                <PairOutcomeEditor name={secondStudentName} onChange={(second) => setValues({ ...values, second })} value={values.second} />
              </div>
              <div className="form-actions">
                <button className="primary-button primary-button--fit" disabled={state === "saving"}>{state === "saving" ? "Сохраняем обоим…" : editing ? "Сохранить изменения" : "Завершить урок пары"}</button>
                <button className="secondary-button" onClick={() => setOpen(false)} type="button">Отмена</button>
              </div>
              {state === "error" ? <p className="form-error" role="alert">Не удалось сохранить все итоги. Нажмите «Попробовать снова»: уже сохранённые данные не задвоятся.</p> : null}
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}

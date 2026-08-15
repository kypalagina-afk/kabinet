import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  calculateDetailedMockExam,
  createDetailedMockExam,
  updateDetailedMockExam,
  type DetailedMockExamInput,
} from "../../lib/firebase/services/mockExamWorkflow";
import type {
  DocumentWithId,
  EvaluationCriterion,
  ExamBlueprint,
  MockExam,
} from "../../lib/firebase/types";

const defaultExpositionConfig = [
  ["ИК1", 2],
  ["ИК2", 2],
  ["ИК3", 2],
] as const;
const defaultEssayConfig = [
  ["СК1", 1],
  ["СК2", 3],
  ["СК3", 2],
  ["СК4", 1],
] as const;
const defaultLiteracyConfig = [
  ["ГК1", 3, "orthography", "орфографические ошибки"],
  ["ГК2", 3, "punctuation", "пунктуационные ошибки"],
  ["ГК3", 3, "grammar", "грамматические ошибки"],
  ["ГК4", 3, "speech", "речевые ошибки"],
] as const;

function criteriaFrom(
  config: ReadonlyArray<readonly [string, number]>,
  values: Record<string, number>,
): EvaluationCriterion[] {
  return config.map(([code, max]) => ({
    code,
    earned: values[code] ?? 0,
    max,
    errorsCount: null,
  }));
}

function existingDate(exam?: DocumentWithId<MockExam> | null) {
  if (exam?.data.takenDate) return exam.data.takenDate;
  const value = exam?.data.takenAt?.toDate();
  return value ? value.toISOString().slice(0, 10) : "";
}

export function DetailedMockExamForm({
  teacherId,
  studentId,
  studentProgramId,
  blueprintId,
  blueprint,
  existing,
  onSaved,
}: {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  blueprintId: string;
  blueprint: ExamBlueprint;
  existing?: DocumentWithId<MockExam> | null;
  onSaved?(examId: string): void;
}) {
  const [title, setTitle] = useState(existing?.data.title ?? "Пробный ОГЭ");
  const [takenDate, setTakenDate] = useState(() => existingDate(existing));
  const [tasks, setTasks] = useState<Record<number, number>>(() =>
    Object.fromEntries(
      existing?.data.taskResults.map((item) => [
        item.taskNumber,
        item.earned,
      ]) ?? [],
    ),
  );
  const [exposition, setExposition] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      existing?.data.sections.exposition.criteria.map((item) => [
        item.code,
        item.earned,
      ]) ?? [],
    ),
  );
  const [essay, setEssay] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      existing?.data.sections.essay.criteria.map((item) => [
        item.code,
        item.earned,
      ]) ?? [],
    ),
  );
  const [literacy, setLiteracy] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      existing?.data.sections.literacy.criteria.map((item) => [
        item.code,
        item.earned,
      ]) ?? [],
    ),
  );
  const [errors, setErrors] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      existing?.data.sections.literacy.criteria.map((item) => [
        item.code,
        item.errorsCount ?? 0,
      ]) ?? [],
    ),
  );
  const [factual, setFactual] = useState(
    existing?.data.sections.factualAccuracy.earned ?? 0,
  );
  const [factualErrors, setFactualErrors] = useState(
    existing?.data.sections.factualAccuracy.errorsCount ?? 0,
  );
  const [teacherComment, setTeacherComment] = useState(
    existing?.data.teacherComment ?? "",
  );
  const [observations, setObservations] = useState<
    Array<{ taskNumber: number; observation: string }>
  >(existing?.data.taskObservations ?? []);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const taskNumbers = useMemo(
    () =>
      blueprint.tasks
        .map((task) => task.number)
        .filter((number) => number >= 2 && number <= 12),
    [blueprint.tasks],
  );
  const expositionConfig = useMemo<ReadonlyArray<readonly [string, number]>>(
    () =>
      blueprint.writingCriteria?.exposition.map(
        (criterion) => [criterion.code, criterion.max] as const,
      ) ?? defaultExpositionConfig,
    [blueprint.writingCriteria],
  );
  const essayConfig = useMemo<ReadonlyArray<readonly [string, number]>>(
    () =>
      blueprint.writingCriteria?.essay.map(
        (criterion) => [criterion.code, criterion.max] as const,
      ) ?? defaultEssayConfig,
    [blueprint.writingCriteria],
  );
  const literacyConfig = useMemo<
    ReadonlyArray<readonly [string, number, string, string]>
  >(
    () =>
      blueprint.writingCriteria?.literacy.map(
        (criterion) =>
          [
            criterion.code,
            criterion.max,
            (
              {
                ГК1: "orthography",
                ГК2: "punctuation",
                ГК3: "grammar",
                ГК4: "speech",
              } as Record<string, string>
            )[criterion.code] ?? "other",
            criterion.errorLabel,
          ] as const,
      ) ?? defaultLiteracyConfig,
    [blueprint.writingCriteria],
  );
  const factualConfig = blueprint.writingCriteria?.factual ?? {
    code: "ФК",
    max: 1,
    errorLabel: "фактические ошибки",
  };
  const draftKey = `mock-draft:${teacherId}:${studentId}:${existing?.id ?? blueprintId}`;
  const [draftFound, setDraftFound] = useState(() =>
    Boolean(localStorage.getItem(draftKey)),
  );

  useEffect(() => {
    const handle = window.setTimeout(
      () =>
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            title,
            takenDate,
            tasks,
            exposition,
            essay,
            literacy,
            errors,
            factual,
            factualErrors,
            observations,
            teacherComment,
          }),
        ),
      350,
    );
    return () => window.clearTimeout(handle);
  }, [
    draftKey,
    errors,
    essay,
    exposition,
    factual,
    factualErrors,
    literacy,
    observations,
    takenDate,
    tasks,
    teacherComment,
    title,
  ]);

  function restoreDraft() {
    const saved = localStorage.getItem(draftKey);
    if (!saved) return;
    const draft = JSON.parse(saved) as {
      title: string;
      takenDate: string;
      tasks: Record<number, number>;
      exposition: Record<string, number>;
      essay: Record<string, number>;
      literacy: Record<string, number>;
      errors: Record<string, number>;
      factual: number;
      factualErrors: number;
      observations?: Array<{ taskNumber: number; observation: string }>;
      teacherComment: string;
    };
    setTitle(draft.title);
    setTakenDate(draft.takenDate);
    setTasks(draft.tasks);
    setExposition(draft.exposition);
    setEssay(draft.essay);
    setLiteracy(draft.literacy);
    setErrors(draft.errors);
    setFactual(draft.factual);
    setFactualErrors(draft.factualErrors);
    setObservations(draft.observations ?? []);
    setTeacherComment(draft.teacherComment);
    setDraftFound(false);
  }

  const input = useMemo<DetailedMockExamInput>(
    () => ({
      teacherId,
      studentId,
      studentProgramId,
      examBlueprintId: blueprintId,
      title,
      takenDate,
      taskResults: taskNumbers.map((taskNumber) => ({
        taskNumber,
        earned: tasks[taskNumber] ?? 0,
        max:
          blueprint.tasks.find((task) => task.number === taskNumber)
            ?.maxScore ?? 1,
      })),
      expositionCriteria: criteriaFrom(expositionConfig, exposition),
      essayCriteria: criteriaFrom(essayConfig, essay),
      essayComment: null,
      literacyCriteria: literacyConfig.map(([code, max, category]) => ({
        code,
        max,
        category,
        earned: literacy[code] ?? 0,
        errorsCount: errors[code] ?? 0,
      })),
      factualAccuracy: {
        earned: factual,
        max: factualConfig.max,
        errorsCount: factualErrors,
      },
      teacherComment: teacherComment || null,
      taskObservations: observations,
    }),
    [
      blueprint.tasks,
      blueprintId,
      errors,
      essay,
      essayConfig,
      exposition,
      expositionConfig,
      factual,
      factualConfig.max,
      factualErrors,
      literacy,
      literacyConfig,
      observations,
      studentId,
      studentProgramId,
      taskNumbers,
      tasks,
      teacherComment,
      teacherId,
      takenDate,
      title,
    ],
  );
  const preview = useMemo(() => {
    try {
      return calculateDetailedMockExam(input, blueprint);
    } catch {
      return null;
    }
  }, [blueprint, input]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    try {
      const examId = existing
        ? await updateDetailedMockExam(getFirebaseDb(), existing.id, input)
        : await createDetailedMockExam(getFirebaseDb(), input);
      localStorage.removeItem(draftKey);
      setStatus("success");
      onSaved?.(examId);
    } catch {
      setStatus("error");
    }
  }

  return (
    <form
      className="action-form detailed-mock-form responsive-form"
      data-testid="detailed-mock-form"
      onSubmit={handleSubmit}
    >
      <div className="action-form__heading">
        <p className="eyebrow">Подробный пробник</p>
        <h2>{existing ? "Редактирование результата" : "Результаты ОГЭ"}</h2>
        <p>
          Итог и оценка рассчитываются автоматически из исходных результатов.
        </p>
      </div>
      {draftFound ? (
        <div className="draft-banner">
          <span>Есть незавершённый пробник.</span>
          <button
            className="secondary-button"
            onClick={restoreDraft}
            type="button"
          >
            Продолжить
          </button>
          <button
            className="icon-button"
            aria-label="Удалить черновик"
            onClick={() => {
              localStorage.removeItem(draftKey);
              setDraftFound(false);
            }}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="form-grid">
        <label className="form-field">
          <span>Название</span>
          <input
            name="mockTitle"
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <label className="form-field">
          <span>Дата</span>
          <input
            name="mockDate"
            onChange={(event) => setTakenDate(event.target.value)}
            required
            type="date"
            value={takenDate}
          />
        </label>
      </div>

      <fieldset className="score-fieldset">
        <legend>Задания №2–12 · тестовая часть</legend>
        <div className="task-score-grid">
          {taskNumbers.map((taskNumber) => (
            <label className="task-score-input" key={taskNumber}>
              <span>№{taskNumber}</span>
              <input
                aria-label={`Задание №${taskNumber}`}
                max={
                  blueprint.tasks.find((task) => task.number === taskNumber)
                    ?.maxScore ?? 1
                }
                min="0"
                onChange={(event) =>
                  setTasks((current) => ({
                    ...current,
                    [taskNumber]:
                      event.target.value === ""
                        ? 0
                        : Number(event.target.value),
                  }))
                }
                onFocus={(event) => event.currentTarget.select()}
                step="1"
                type="number"
                value={tasks[taskNumber] ?? 0}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mock-section-grid">
        <CriteriaSection
          config={expositionConfig}
          onChange={setExposition}
          title="Изложение"
          values={exposition}
        />
        <CriteriaSection
          config={essayConfig}
          onChange={setEssay}
          title="Сочинение"
          values={essay}
        />
      </div>
      <fieldset className="score-fieldset">
        <legend>Грамотность</legend>
        <div className="literacy-grid">
          {literacyConfig.map(([code, max, , description]) => (
            <div className="criterion-row" key={code}>
              <strong>
                {code}
                <small> · {description}</small>
              </strong>
              <label className="form-field">
                <span>Балл / {max}</span>
                <input
                  aria-label={`${code} балл`}
                  max={max}
                  min="0"
                  onChange={(event) =>
                    setLiteracy((current) => ({
                      ...current,
                      [code]: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={literacy[code] ?? 0}
                />
              </label>
              <label className="form-field">
                <span>Ошибок</span>
                <input
                  aria-label={`${code} ошибок`}
                  min="0"
                  onChange={(event) =>
                    setErrors((current) => ({
                      ...current,
                      [code]: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={errors[code] ?? 0}
                />
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label className="form-field">
          <span>
            {factualConfig.code} · балл / {factualConfig.max}
          </span>
          <input
            aria-label={`${factualConfig.code} балл`}
            max={factualConfig.max}
            min="0"
            onChange={(event) => setFactual(Number(event.target.value))}
            type="number"
            value={factual}
          />
        </label>
        <label className="form-field">
          <span>{factualConfig.errorLabel}</span>
          <input
            aria-label={factualConfig.errorLabel}
            min="0"
            onChange={(event) => setFactualErrors(Number(event.target.value))}
            type="number"
            value={factualErrors}
          />
        </label>
        <label className="form-field form-field--wide">
          <span>Комментарий к пробнику · необязательно</span>
          <textarea
            onChange={(event) => setTeacherComment(event.target.value)}
            rows={3}
            value={teacherComment}
          />
        </label>
      </div>
      <details className="mock-observations">
        <summary>+ Добавить наблюдение по заданию</summary>
        {observations.map((item, index) => (
          <div className="observation-row" key={index}>
            <label className="form-field">
              <span>Задание</span>
              <select
                onChange={(event) =>
                  setObservations((current) =>
                    current.map((value, itemIndex) =>
                      itemIndex === index
                        ? { ...value, taskNumber: Number(event.target.value) }
                        : value,
                    ),
                  )
                }
                value={item.taskNumber}
              >
                {blueprint.tasks.map((task) => (
                  <option key={task.number} value={task.number}>
                    №{task.number}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Наблюдение</span>
              <input
                onChange={(event) =>
                  setObservations((current) =>
                    current.map((value, itemIndex) =>
                      itemIndex === index
                        ? { ...value, observation: event.target.value }
                        : value,
                    ),
                  )
                }
                placeholder="Например, путает ПРЕ-/ПРИ-"
                value={item.observation}
              />
            </label>
            <button
              aria-label="Удалить наблюдение"
              className="icon-button"
              onClick={() =>
                setObservations((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
              type="button"
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="secondary-button"
          onClick={() =>
            setObservations((current) => [
              ...current,
              { taskNumber: blueprint.tasks[0]?.number ?? 1, observation: "" },
            ])
          }
          type="button"
        >
          + Наблюдение
        </button>
      </details>
      <div className="mock-total-preview" aria-live="polite">
        <span>Предварительный итог</span>
        <strong>
          {preview
            ? `${preview.total.earned}/${preview.total.max}`
            : `—/${blueprint.maxScore}`}
        </strong>
        <span>Оценка {preview?.grade ?? "—"}</span>
      </div>
      <div className="form-actions">
        <button
          className="primary-button primary-button--fit"
          disabled={status === "saving"}
        >
          {existing ? "Сохранить изменения" : "Сохранить пробник"}
        </button>
        {status === "success" ? (
          <span className="form-success">Пробник сохранён</span>
        ) : null}
        {status === "error" ? (
          <span className="form-error">Проверьте дату и баллы.</span>
        ) : null}
      </div>
    </form>
  );
}

function CriteriaSection({
  title,
  config,
  values,
  onChange,
}: {
  title: string;
  config: ReadonlyArray<readonly [string, number]>;
  values: Record<string, number>;
  onChange(value: Record<string, number>): void;
}) {
  return (
    <fieldset className="score-fieldset">
      <legend>{title}</legend>
      <div className="criteria-score-grid">
        {config.map(([code, max]) => (
          <label className="form-field" key={code}>
            <span>
              {code} · из {max}
            </span>
            <input
              aria-label={`${code} балл`}
              max={max}
              min="0"
              onChange={(event) =>
                onChange({ ...values, [code]: Number(event.target.value) })
              }
              type="number"
              value={values[code] ?? 0}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

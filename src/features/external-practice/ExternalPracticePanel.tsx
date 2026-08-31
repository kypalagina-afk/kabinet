import { useMemo, useState } from "react";
import { formatDateTimeForTimezone, resolveTimezone, zonedLocalDateTimeToDate } from "../schedule/timezone";
import { russianTimezoneOptions } from "../schedule/timezoneOptions";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  deleteExternalPracticeAttempt,
  importExternalPracticeAttempts,
} from "../../lib/firebase/services/externalPracticeImport";
import type { DocumentWithId, ExamKind, ExternalPracticeAttempt } from "../../lib/firebase/types";
import { parseRussian100ManualText, practiceDraftKey, type ManualPracticeDraft } from "./manualImport";
import { useExternalPracticeAttempts } from "./hooks";

interface ExternalPracticeTaskSummary {
  taskNumber: number;
  attempts: number;
  solvedQuestions: number;
  averageAccuracy: number;
  lastScore: number;
  lastMaxScore: number;
  lastPracticedAt: Date;
}

function summarizeExternalPractice(
  attempts: Array<DocumentWithId<ExternalPracticeAttempt>>,
): ExternalPracticeTaskSummary[] {
  const grouped = new Map<number, Array<DocumentWithId<ExternalPracticeAttempt>>>();
  for (const attempt of attempts) {
    const values = grouped.get(attempt.data.taskNumber) ?? [];
    values.push(attempt);
    grouped.set(attempt.data.taskNumber, values);
  }
  return [...grouped.entries()].map(([taskNumber, values]) => {
    const ordered = [...values].sort(
      (left, right) => right.data.practicedAt.toMillis() - left.data.practicedAt.toMillis(),
    );
    const latest = ordered[0]!;
    return {
      taskNumber,
      attempts: values.length,
      solvedQuestions: values.reduce((total, value) => total + value.data.maxScore, 0),
      averageAccuracy: Math.round(
        values.reduce((total, value) => total + value.data.accuracy, 0) / values.length,
      ),
      lastScore: latest.data.score,
      lastMaxScore: latest.data.maxScore,
      lastPracticedAt: latest.data.practicedAt.toDate(),
    };
  }).sort((left, right) => left.taskNumber - right.taskNumber);
}

export function ExternalPracticePanel({
  teacherId,
  studentId,
  studentProgramId,
  examBlueprintId,
  examKind,
  taskNumbers,
  timezoneIana,
  importEnabled = false,
}: {
  teacherId: string;
  studentId: string;
  studentProgramId?: string;
  examBlueprintId?: string;
  examKind?: ExamKind;
  taskNumbers?: number[];
  timezoneIana?: string | null;
  importEnabled?: boolean;
}) {
  const attempts = useExternalPracticeAttempts(teacherId, studentId);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const summary = useMemo(() => summarizeExternalPractice(attempts.data), [attempts.data]);
  const displayTimezone = resolveTimezone({
    iana: timezoneIana ?? "Europe/Moscow",
    moscowOffsetMinutes: null,
  });
  async function removeAttempt(id: string, attempt: ExternalPracticeAttempt) {
    if (!window.confirm(`Удалить попытку №${attempt.taskNumber} с результатом ${attempt.score}/${attempt.maxScore}?`)) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteExternalPracticeAttempt(getFirebaseDb(), { attemptId: id, teacherId, studentId });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Не удалось удалить попытку.");
    } finally {
      setDeletingId(null);
    }
  }
  return (
    <section className="external-practice-panel" data-testid="external-practice-panel">
      <header className="panel-heading">
        <div>
          <p className="eyebrow">Внешняя практика</p>
          <h2>Русский100</h2>
          <p>Отдельный источник результатов. Ручное освоение преподавателя не изменяется.</p>
        </div>
      </header>
      {importEnabled ? (
        studentProgramId && examBlueprintId && examKind ? (
          <ManualImportForm
            examBlueprintId={examBlueprintId}
            examKind={examKind}
            studentId={studentId}
            studentProgramId={studentProgramId}
            taskNumbers={taskNumbers ?? []}
            teacherId={teacherId}
            timezoneIana={timezoneIana ?? "Europe/Moscow"}
          />
        ) : (
          <p className="shell-notice">Для импорта ученику нужна активная экзаменационная программа.</p>
        )
      ) : null}
      {attempts.error ? <p className="form-error">{attempts.error}</p> : null}
      {deleteError ? <p className="form-error" role="alert">{deleteError}</p> : null}
      {attempts.loading ? <p className="content-state">Загружаем практику…</p> : null}
      {!attempts.loading && !summary.length ? (
        <p className="content-state">Попыток пока нет.</p>
      ) : null}
      {summary.length ? (
        <div className="external-practice-summary" aria-label="Сводка Русский100">
          {summary.map((item) => (
            <article key={item.taskNumber}>
              <strong>№{item.taskNumber}</strong>
              <span>Средний результат: {item.averageAccuracy}%</span>
              <span>Попыток: {item.attempts} · вопросов: {item.solvedQuestions}</span>
              <span>Последняя: {item.lastScore}/{item.lastMaxScore}</span>
            </article>
          ))}
        </div>
      ) : null}
      {attempts.data.length ? (
        <details className="external-practice-history">
          <summary>История практики · {attempts.data.length}</summary>
          <div className="external-practice-history__list">
            {attempts.data.map(({ id, data }) => (
              <div key={id}>
                <strong>№{data.taskNumber} · {data.score}/{data.maxScore}</strong>
                <span>{formatDateTimeForTimezone(data.practicedAt.toDate(), displayTimezone)}</span>
                <span>{data.status === "completed" ? "Завершено" : "Не завершено"}</span>
                {importEnabled ? (
                  <button
                    aria-label={`Удалить попытку №${data.taskNumber} ${data.score}/${data.maxScore}`}
                    className="external-practice-history__delete"
                    disabled={deletingId === id}
                    onClick={() => void removeAttempt(id, data)}
                    type="button"
                  >
                    {deletingId === id ? "Удаляем…" : "Удалить"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function ManualImportForm({
  teacherId,
  studentId,
  studentProgramId,
  examBlueprintId,
  examKind,
  taskNumbers,
  timezoneIana,
}: {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  examBlueprintId: string;
  examKind: ExamKind;
  taskNumbers: number[];
  timezoneIana: string;
}) {
  const [text, setText] = useState("");
  const [timezone, setTimezone] = useState(timezoneIana);
  const [drafts, setDrafts] = useState<ManualPracticeDraft[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const supported = new Set(taskNumbers);
  function prepare() {
    const result = parseRussian100ManualText(text);
    const unsupported = result.attempts.filter((item) => !supported.has(item.taskNumber));
    setDrafts(result.attempts);
    setSelected(new Set(
      result.attempts
        .filter((item) => supported.has(item.taskNumber))
        .map(practiceDraftKey),
    ));
    setErrors([
      ...result.errors,
      ...unsupported.map((item) => `Задание №${item.taskNumber} отсутствует в активной программе и не будет импортировано.`),
    ]);
    setNotice("");
  }
  async function save() {
    const chosen = drafts.filter((item) => selected.has(practiceDraftKey(item)) && supported.has(item.taskNumber));
    if (!chosen.length) {
      setErrors(["Выберите хотя бы одну корректную попытку."]);
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      const result = await importExternalPracticeAttempts(getFirebaseDb(), {
        teacherId,
        studentId,
        studentProgramId,
        examBlueprintId,
        examKind,
        rows: chosen.map((item) => ({
          taskNumber: item.taskNumber,
          practicedAt: zonedLocalDateTimeToDate(item.localDate, item.localTime, timezone),
          score: item.score,
          maxScore: item.maxScore,
          status: item.status,
        })),
      });
      setNotice(`Добавлено: ${result.added}. Уже было импортировано: ${result.skipped}.`);
      setDrafts([]);
      setSelected(new Set());
      setText("");
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Не удалось импортировать попытки."]);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="external-practice-import">
      <div className="external-practice-import__instructions">
        <strong>Ручной импорт без API</strong>
        <p>Одна строка — одна попытка:</p>
        <code>11; 07.06.2026 13:57; 3/5; завершено</code>
        <p>Можно вставлять прямо из истории: «Задание №11: / 3/5 от 07.06.26 13:57».</p>
      </div>
      <label className="form-field">
        <span>Часовой пояс времени из Русского100</span>
        <select onChange={(event) => setTimezone(event.target.value)} value={timezone}>
          {russianTimezoneOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>Результаты</span>
        <textarea
          onChange={(event) => setText(event.target.value)}
          placeholder="11; 07.06.2026 13:57; 3/5; завершено"
          rows={7}
          value={text}
        />
      </label>
      <button className="secondary-button" disabled={!text.trim()} onClick={prepare} type="button">
        Подготовить черновик
      </button>
      {errors.map((error) => <p className="form-error" key={error}>{error}</p>)}
      {drafts.length ? (
        <div className="external-practice-preview">
          <h3>Проверьте перед импортом</h3>
          {drafts.map((item) => {
            const key = practiceDraftKey(item);
            const isSupported = supported.has(item.taskNumber);
            return (
              <label className={!isSupported ? "is-disabled" : ""} key={key}>
                <input
                  checked={selected.has(key)}
                  disabled={!isSupported}
                  onChange={(event) => setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(key); else next.delete(key);
                    return next;
                  })}
                  type="checkbox"
                />
                <span>№{item.taskNumber}</span>
                <span>{item.localDate.split("-").reverse().join(".")} · {item.localTime}</span>
                <strong>{item.score}/{item.maxScore}</strong>
              </label>
            );
          })}
          <button className="primary-button primary-button--fit" disabled={saving || !selected.size} onClick={() => void save()} type="button">
            {saving ? "Импортируем…" : `Импортировать выбранное · ${selected.size}`}
          </button>
        </div>
      ) : null}
      {notice ? <p className="form-success" role="status">{notice}</p> : null}
    </div>
  );
}

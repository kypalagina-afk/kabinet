import { useState } from "react";
import type { DocumentWithId, ExternalPracticeAttempt } from "../../lib/firebase/types";
import { monthlyHistory } from "../analytics/monthlyHistory";
import { formatDateTimeForTimezone, type ResolvedTimezone } from "../schedule/timezone";

export function PracticeHistory({ attempts, timezone, onRemove, deletingId }: {
  attempts: DocumentWithId<ExternalPracticeAttempt>[];
  timezone: ResolvedTimezone;
  onRemove?: (id: string, attempt: ExternalPracticeAttempt) => void;
  deletingId?: string | null;
}) {
  const [selectedMonth, setSelectedMonth] = useState("all");
  const months = monthlyHistory(attempts, ({ data }) => data.practicedAt.toMillis(), timezone);
  const activeMonth = months.some((month) => month.key === selectedMonth) ? selectedMonth : "all";
  if (!attempts.length) return null;
  return <details className="external-practice-history">
    <summary>История практики · {attempts.length}</summary>
    <div className="panel-heading">
      <p className="workflow-hint">Сначала новые · по месяцам</p>
      <label className="form-field compact-filter"><span>Месяц практики</span><select value={activeMonth} onChange={(event) => setSelectedMonth(event.target.value)}><option value="all">Все месяцы</option>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label>
    </div>
    {months.filter((month) => activeMonth === "all" || month.key === activeMonth).map((month) => <details className="practice-history-month" key={month.key} open>
      <summary>{month.label} · {month.items.length}</summary>
      <div className="external-practice-history__list">{month.items.map(({ id, data }) => <div key={id}>
        <strong>№{data.taskNumber} · {data.score}/{data.maxScore}</strong>
        <span>{formatDateTimeForTimezone(data.practicedAt.toDate(), timezone)}</span>
        <span>{id.startsWith("homework:") ? "Из домашнего задания" : data.status === "completed" ? "Русский100 · завершено" : "Русский100 · не завершено"}</span>
        {onRemove && !id.startsWith("homework:") ? <button aria-label={`Удалить попытку №${data.taskNumber} ${data.score}/${data.maxScore}`} className="external-practice-history__delete" disabled={deletingId === id} onClick={() => onRemove(id, data)} type="button">{deletingId === id ? "Удаляем…" : "Удалить"}</button> : null}
      </div>)}</div>
    </details>)}
  </details>;
}

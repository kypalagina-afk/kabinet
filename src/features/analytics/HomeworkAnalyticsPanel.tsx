import { useMemo, useState } from "react";
import type {
  DocumentWithId,
  Homework,
  HomeworkSubmission,
} from "../../lib/firebase/types";
import { calculateHomeworkAnalytics } from "./homeworkAnalytics";

function defaultStart() {
  const value = new Date();
  value.setDate(value.getDate() - 90);
  return value.toISOString().slice(0, 10);
}
function defaultEnd() {
  return new Date().toISOString().slice(0, 10);
}

export function HomeworkAnalyticsPanel({
  homeworks,
  submissions,
  teacherControls = false,
}: {
  homeworks: Array<DocumentWithId<Homework>>;
  submissions: Array<DocumentWithId<HomeworkSubmission>>;
  teacherControls?: boolean;
}) {
  const [start, setStart] = useState(() =>
    teacherControls
      ? (sessionStorage.getItem("teacher-homework-analytics-start") ??
        defaultStart())
      : "",
  );
  const [end, setEnd] = useState(() =>
    teacherControls
      ? (sessionStorage.getItem("teacher-homework-analytics-end") ??
        defaultEnd())
      : "",
  );
  const analytics = useMemo(
    () =>
      calculateHomeworkAnalytics(
        homeworks,
        submissions,
        teacherControls
          ? {
              start: new Date(`${start}T00:00:00`),
              end: new Date(`${end}T23:59:59.999`),
            }
          : undefined,
      ),
    [end, homeworks, start, submissions, teacherControls],
  );
  function updateStart(value: string) {
    setStart(value);
    sessionStorage.setItem("teacher-homework-analytics-start", value);
  }
  function updateEnd(value: string) {
    setEnd(value);
    sessionStorage.setItem("teacher-homework-analytics-end", value);
  }
  return (
    <section className="analytics-panel" data-testid="homework-analytics">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Домашняя работа</p>
          <h2>
            {teacherControls
              ? "Результаты домашних заданий"
              : "Моя домашняя работа"}
          </h2>
        </div>
        {teacherControls ? (
          <div className="inline-control homework-date-range">
            <label className="form-field compact-filter">
              <span>С</span>
              <input
                onChange={(event) => updateStart(event.target.value)}
                type="date"
                value={start}
              />
            </label>
            <label className="form-field compact-filter">
              <span>По</span>
              <input
                onChange={(event) => updateEnd(event.target.value)}
                type="date"
                value={end}
              />
            </label>
          </div>
        ) : null}
      </div>
      <div className="homework-analytics">
        <article>
          <span>Выполнение ДЗ</span>
          <strong>{analytics.completionPercent}%</strong>
          <small>
            {analytics.completedCount} из {analytics.assignedCount}
          </small>
        </article>
        <article>
          <span>Сдано вовремя</span>
          <strong>
            {analytics.onTimePercent === null
              ? "—"
              : `${analytics.onTimePercent}%`}
          </strong>
          <small>по {analytics.submittedCount} отправленным</small>
        </article>
        <article>
          <span>Качество ДЗ</span>
          <strong>
            {analytics.qualityPercent === null
              ? "—"
              : `${analytics.qualityPercent}%`}
          </strong>
          <small>
            по {analytics.qualityCount} проверенным работам
            {analytics.qualityCount < 2 ? " · пока мало данных" : ""}
          </small>
        </article>
        <article>
          <span>Проверено</span>
          <strong>{analytics.qualityCount}</strong>
          <small>работ с числовым результатом</small>
        </article>
      </div>
    </section>
  );
}

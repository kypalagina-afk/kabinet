import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HomeworkAnalyticsPanel } from "../features/analytics/HomeworkAnalyticsPanel";
import {
  MockAnalyticsDashboard,
  MockExamReport,
} from "../features/analytics/MockAnalyticsDashboard";
import {
  useStudentTaskCoverage,
  useTaskMasteryPublic,
} from "../features/analytics/mastery";
import { useAuth } from "../features/auth/AuthProvider";
import { useStudentWorkspace } from "../features/vertical-slice/hooks";
import { formatCompactDate } from "../lib/formatters";
import type { DocumentWithId, MockExam } from "../lib/firebase/types";

export function StudentProgressPage() {
  const { profile } = useAuth();
  const studentId = profile?.studentId ?? "";
  const { data, loading, error } = useStudentWorkspace(studentId);
  const publicMastery = useTaskMasteryPublic(studentId);
  const coverage = useStudentTaskCoverage(studentId);
  const [params, setParams] = useSearchParams();
  const [compareMode, setCompareMode] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const ordered = useMemo(
    () =>
      [...data.mockExams].sort(
        (a, b) =>
          (b.data.takenAt ?? b.data.createdAt).toMillis() -
          (a.data.takenAt ?? a.data.createdAt).toMillis(),
      ),
    [data.mockExams],
  );
  const selected = params.get("mock");
  const compared = compare
    .map((id) => ordered.find((item) => item.id === id))
    .filter(Boolean);
  return (
    <section
      className="shell-content progress-page"
      aria-labelledby="student-progress-title"
    >
      <header className="page-heading">
        <p className="eyebrow">Аналитика</p>
        <h1 id="student-progress-title">Прогресс и готовность к экзамену</h1>
        <p>{data.programProfile?.data.title}</p>
        <small className="workflow-hint">
          Одна попытка не считается полным освоением: уверенность растёт по
          нескольким подтверждённым результатам.
        </small>
      </header>
      {loading ? <p className="content-state">Считаем прогресс…</p> : null}
      {error ? <p className="shell-notice">{error}</p> : null}
      {!loading ? (
        <>
          <HomeworkAnalyticsPanel
            homeworks={data.homeworks}
            submissions={data.homeworkSubmissions}
          />
          <MockAnalyticsDashboard
            audience="student"
            coverage={coverage}
            exams={data.mockExams}
            masteryPublic={publicMastery}
            taskNumbers={data.examBlueprint?.data.tasks.map(
              (item) => item.number,
            )}
          />
        </>
      ) : null}
      <section className="analytics-panel student-mock-history">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">История</p>
            <h2>Мои пробники</h2>
          </div>
          {ordered.length >= 2 ? (
            <button
              className="secondary-button"
              onClick={() => {
                setCompareMode((value) => !value);
                setCompare([]);
              }}
              type="button"
            >
              {compareMode ? "Отменить сравнение" : "Сравнить пробники"}
            </button>
          ) : null}
        </div>
        {compared.length === 2 ? (
          <MockComparison first={compared[1]!} second={compared[0]!} />
        ) : null}
        <div className="mock-history">
          {ordered.map((exam, index) => {
            const previous = ordered[index + 1];
            const delta = previous
              ? exam.data.total.earned - previous.data.total.earned
              : null;
            return (
              <article className="mock-history-card" key={exam.id}>
                {compareMode ? (
                  <label className="compare-check">
                    <input
                      checked={compare.includes(exam.id)}
                      disabled={
                        !compare.includes(exam.id) && compare.length >= 2
                      }
                      onChange={() =>
                        setCompare((current) =>
                          current.includes(exam.id)
                            ? current.filter((id) => id !== exam.id)
                            : [...current, exam.id],
                        )
                      }
                      type="checkbox"
                    />{" "}
                    Выбрать
                  </label>
                ) : null}
                <div>
                  <small className="mock-date">
                    {formatCompactDate(
                      exam.data.takenAt ?? exam.data.createdAt,
                    )}{" "}
                    ·{" "}
                    {delta === null
                      ? "стартовый результат"
                      : `${delta >= 0 ? "+" : ""}${delta} балла`}
                  </small>
                  <h3>
                    {exam.data.total.earned}/{exam.data.total.max} · оценка{" "}
                    {exam.data.grade}
                  </h3>
                  <p>
                    Тест {exam.data.sections.test.earned}/
                    {exam.data.sections.test.max} · Изложение{" "}
                    {exam.data.sections.exposition.earned}/
                    {exam.data.sections.exposition.max} · Сочинение{" "}
                    {exam.data.sections.essay.earned}/
                    {exam.data.sections.essay.max}
                  </p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    if (selected === exam.id) next.delete("mock");
                    else next.set("mock", exam.id);
                    setParams(next);
                  }}
                  type="button"
                >
                  {selected === exam.id ? "Свернуть" : "Подробнее"}
                </button>
                {selected === exam.id ? (
                  <div className="mock-history-detail">
                    <MockExamReport audience="student" exam={exam.data} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function MockComparison({
  first,
  second,
}: {
  first: DocumentWithId<MockExam>;
  second: DocumentWithId<MockExam>;
}) {
  const sections = [
    ["Итог", first.data.total.earned, second.data.total.earned],
    ["Тест", first.data.sections.test.earned, second.data.sections.test.earned],
    [
      "Изложение",
      first.data.sections.exposition.earned,
      second.data.sections.exposition.earned,
    ],
    [
      "Сочинение",
      first.data.sections.essay.earned,
      second.data.sections.essay.earned,
    ],
    [
      "Грамотность",
      first.data.sections.literacy.earned,
      second.data.sections.literacy.earned,
    ],
  ] as const;
  return (
    <section className="compare-card">
      <h3>Сравнение пробников</h3>
      <div className="report-section-grid">
        {sections.map(([label, before, after]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>
              {before} → {after}
            </strong>
            <small>
              {after - before >= 0 ? "+" : ""}
              {after - before} балла
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

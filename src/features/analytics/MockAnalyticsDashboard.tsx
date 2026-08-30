import { calculateMockAnalytics } from "./mockAnalytics";
import type {
  CoverageState,
  DocumentWithId,
  EvaluationCriterion,
  MockExam,
  StudentTaskCoverage,
  StudentTaskMasteryPublic,
} from "../../lib/firebase/types";

export function MockAnalyticsDashboard({
  exams,
  audience,
  masteryPublic = [],
  coverage = [],
  taskNumbers,
  taskWeights,
  programTitle,
  onEditMastery,
  onCoverageChange,
}: {
  exams: Array<DocumentWithId<MockExam>>;
  audience: "teacher" | "student";
  masteryPublic?: Array<DocumentWithId<StudentTaskMasteryPublic>>;
  coverage?: Array<DocumentWithId<StudentTaskCoverage>>;
  taskNumbers?: number[];
  taskWeights?: Record<number, number>;
  programTitle?: string;
  onEditMastery?(
    taskNumber: number,
    autoMastery: number,
    attempts: number,
  ): void;
  onCoverageChange?(taskNumber: number, state: CoverageState): void;
}) {
  const evidenceTasks = [...new Set([
    ...exams.flatMap(({ data }) => data.taskResults.map((item) => item.taskNumber)),
    ...coverage.map(({ data }) => data.taskNumber),
    ...masteryPublic.map(({ data }) => data.taskNumber),
  ])].sort((a, b) => a - b);
  const ordered = [...exams].sort(
    (a, b) =>
      (b.data.takenAt ?? b.data.createdAt).toMillis() -
      (a.data.takenAt ?? a.data.createdAt).toMillis(),
  );
  const latest = ordered[0];
  const tasks = taskNumbers?.length
    ? [...new Set(taskNumbers)].sort((a, b) => a - b)
    : evidenceTasks;
  const analytics = calculateMockAnalytics(exams, {
    confidenceAttempts: 3,
    weakThreshold: 45,
    strongThreshold: 75,
    totalExamTasks: tasks.length,
    readinessWeights: { latestMock: 0.6, studiedMastery: 0.4 },
    taskWeights,
  });
  const studied = tasks.filter(
    (number) =>
      coverage.find(({ data }) => data.taskNumber === number)?.data.state ===
      "studied",
  ).length;
  const inProgress = tasks.filter(
    (number) =>
      coverage.find(({ data }) => data.taskNumber === number)?.data.state ===
      "inProgress",
  ).length;
  const coveragePercent = tasks.length
    ? Math.round((studied / tasks.length) * 100)
    : 0;
  const weightFor = (taskNumber: number) => taskWeights?.[taskNumber] ?? 1;
  const totalTaskWeight = tasks.reduce((sum, number) => sum + weightFor(number), 0);
  const masteryAverage = totalTaskWeight
    ? Math.round(
        tasks.reduce((sum, number) => {
          const automatic =
            analytics.masteryByTask.find((item) => item.taskNumber === number)
              ?.mastery ?? 0;
          return (
            sum + weightFor(number) *
            (masteryPublic.find(({ data }) => data.taskNumber === number)?.data
              .effectiveMastery ?? automatic)
          );
        }, 0) / totalTaskWeight,
      )
    : 0;
  const effectiveReadiness = latest
    ? Math.round(
        (latest.data.total.earned / latest.data.total.max) * 60 +
          masteryAverage * 0.4,
      )
    : masteryAverage;
  if (!latest && !coverage.length)
    return <p className="content-state">Данных пока нет.</p>;
  return (
    <div className="analytics-dashboard" data-testid="mock-analytics-dashboard">
      <section className="analytics-stat-grid">
        <article className="metric-card metric-card--accent">
          <span>Готовность{programTitle ? ` · ${programTitle}` : ""}</span>
          <strong>{effectiveReadiness}%</strong>
          <small>Качество по накопленным результатам</small>
        </article>
        <article className="metric-card">
          <span>Пройдено программы</span>
          <strong>{coveragePercent}%</strong>
          <small>
            {studied} из {tasks.length} изучены · {inProgress} в процессе
          </small>
        </article>
        <article className="metric-card">
          <span>Последний результат</span>
          <strong>
            {latest
              ? `${latest.data.total.earned}/${latest.data.total.max}`
              : "—"}
          </strong>
          <small>
            {latest
              ? latest.data.grade
                ? `Оценка ${latest.data.grade}`
                : "Первичный балл"
              : "Пробников пока нет"}
          </small>
        </article>
      </section>
      <section className="analytics-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">По заданиям</p>
            <h2>
              Карта экзамена · №{tasks[0]}–{tasks.at(-1)}
            </h2>
          </div>
        </div>
        <div className="task-mastery-grid">
          {tasks.map((taskNumber) => {
            const automatic = analytics.masteryByTask.find(
              (item) => item.taskNumber === taskNumber,
            );
            const publicValue = masteryPublic.find(
              ({ data }) => data.taskNumber === taskNumber,
            )?.data;
            const mastery =
              publicValue?.effectiveMastery ?? automatic?.mastery ?? 0;
            const attempts =
              publicValue?.evidenceCount ?? automatic?.attempts ?? 0;
            const coverageState =
              coverage.find(({ data }) => data.taskNumber === taskNumber)?.data
                .state ?? "notStarted";
            const noData = coverageState === "notStarted" && attempts === 0;
            const semantic = noData
              ? "no-data"
              : mastery < 50
                ? "failed"
                : mastery < 80
                  ? "learning"
                  : "strong";
            const status = noData
              ? "Не изучали · нет данных"
              : attempts < 2
                ? "Мало данных"
                : mastery < 50
                  ? "Требует внимания"
                  : mastery < 80
                    ? "В процессе"
                    : "Уверенно";
            return (
              <article
                className={`task-mastery task-mastery--${semantic}`}
                key={taskNumber}
              >
                <button
                  className="task-mastery__main"
                  onClick={() =>
                    onEditMastery?.(
                      taskNumber,
                      automatic?.mastery ?? mastery,
                      attempts,
                    )
                  }
                  type="button"
                >
                  <span>№{taskNumber}</span>
                  <strong>
                    {mastery}%{onEditMastery ? " ✎" : ""}
                  </strong>
                  <small>
                    {status} · {attempts} подтвержд.
                  </small>
                  {audience === "teacher" &&
                  (automatic?.freshnessDays ?? 0) > 60 ? (
                    <small className="freshness-warning">
                      Последнее подтверждение {automatic?.freshnessDays} дней
                      назад
                    </small>
                  ) : null}
                  <span className="mini-progress">
                    <i style={{ width: `${mastery}%` }} />
                  </span>
                </button>
                {audience === "teacher" && onCoverageChange ? (
                  <select
                    aria-label={`Покрытие задания №${taskNumber}`}
                    onChange={(event) =>
                      onCoverageChange(
                        taskNumber,
                        event.target.value as CoverageState,
                      )
                    }
                    value={coverageState}
                  >
                    <option value="notStarted">Не изучали</option>
                    <option value="inProgress">В процессе</option>
                    <option value="studied">Изучено</option>
                  </select>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      {latest ? (
        <>
          <section className="analytics-two-column">
            <article className="analytics-panel">
              <p className="eyebrow">Сильные стороны</p>
              <h2>{analytics.strongestSections.join(", ") || "Формируются"}</h2>
              <p>
                {analytics.strongTasks.length
                  ? analytics.strongTasks
                      .map((task) => `№${task.taskNumber}`)
                      .join(", ")
                  : "Нужно больше подтверждений."}
              </p>
            </article>
            <article className="analytics-panel analytics-panel--growth">
              <p className="eyebrow">Зоны роста</p>
              <h2>
                {analytics.growthSections.join(", ") || "Нет критичных зон"}
              </h2>
              <p>
                {analytics.weakTasks.length
                  ? analytics.weakTasks
                      .map((task) => `№${task.taskNumber}`)
                      .join(", ")
                  : "Продолжайте закрепление."}
              </p>
            </article>
          </section>
          <MockExamReport exam={latest.data} audience={audience} />
        </>
      ) : null}
    </div>
  );
}

function criterionClass(criterion: EvaluationCriterion) {
  return criterion.earned === criterion.max
    ? "criteria-chip--full"
    : criterion.earned === 0
      ? "criteria-chip--zero"
      : "criteria-chip--partial";
}

export function MockExamReport({
  exam,
  audience,
}: {
  exam: MockExam;
  audience: "teacher" | "student";
}) {
  const sections: Array<readonly [string, { earned: number; max: number }]> = exam.sectionResults
    ? Object.entries(exam.sectionResults)
    : [
        ["Тестовая часть", exam.sections.test],
        ["Изложение", exam.sections.exposition],
        ["Сочинение", exam.sections.essay],
        ["Грамотность", exam.sections.literacy],
        ["ФК", exam.sections.factualAccuracy],
      ];
  const criteria = exam.criteriaResults ?? [
    ...exam.sections.exposition.criteria,
    ...exam.sections.essay.criteria,
    ...exam.sections.literacy.criteria,
  ];
  const factual: EvaluationCriterion = {
    code: "ФК",
    earned: exam.sections.factualAccuracy.earned,
    max: exam.sections.factualAccuracy.max,
    errorsCount: exam.sections.factualAccuracy.errorsCount,
  };
  return (
    <section
      className="analytics-panel mock-report"
      data-testid="mock-exam-report"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Подробный отчёт</p>
          <h2>{exam.title}</h2>
        </div>
        <div className="report-score">
          <strong>
            {exam.total.earned}/{exam.total.max}
          </strong>
          <span>{exam.grade ? `Оценка ${exam.grade}` : "Первичный балл"}</span>
        </div>
      </div>
      <div className="report-section-grid">
        {sections.map(([title, score]) => (
          <article key={title}>
            <span>{title}</span>
            <strong>
              {score.earned}/{score.max}
            </strong>
          </article>
        ))}
      </div>
      {exam.taskResults.length ? (
        <div className="task-result-grid">
          {exam.taskResults.map((result) => (
            <span
              className={
                result.earned === result.max
                  ? "task-result task-result--ok"
                  : "task-result task-result--error"
              }
              key={result.taskNumber}
            >
              №{result.taskNumber} · {result.earned}/{result.max}
            </span>
          ))}
        </div>
      ) : null}
      <div className="criteria-report">
        {[...criteria, ...(exam.criteriaResults || factual.max === 0 ? [] : [factual])].map((criterion) => (
          <span
            className={criterionClass(criterion)}
            key={`${criterion.code}-${criterion.max}`}
          >
            {criterion.code}: {criterion.earned}/{criterion.max}
            {criterion.errorsCount !== null
              ? ` · ошибок ${criterion.errorsCount}`
              : ""}
          </span>
        ))}
      </div>
      {exam.taskObservations?.length ? (
        <section>
          <h3>Наблюдения по заданиям</h3>
          {exam.taskObservations.map((item, index) => (
            <p key={`${item.taskNumber}-${index}`}>
              <strong>№{item.taskNumber}</strong> — {item.observation}
            </p>
          ))}
        </section>
      ) : null}
      <p>
        {exam.teacherComment ||
          (audience === "student"
            ? "Комментарий преподавателя не добавлен."
            : "Комментарий не добавлен.")}
      </p>
      {audience === "student" && exam.publicRecommendations?.length ? (
        <ul>
          {exam.publicRecommendations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

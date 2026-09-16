import { useMemo, useState } from "react";
import type { StudentWorkspaceSnapshot } from "../../lib/firebase/repositories/verticalSliceRepository";
import { dateKeyForTimezone, formatDateTimeForTimezone, resolveTimezone } from "../schedule/timezone";
import { monthlyHistory } from "./monthlyHistory";
import { writtenPracticeHistory } from "./writtenPractice";
import { WrittenScoreBreakdown } from "./WrittenScoreBreakdown";

const timezone = resolveTimezone(null);

export function WrittenPracticePanel({ data }: { data: StudentWorkspaceSnapshot }) {
  const [period, setPeriod] = useState("90");
  const [task, setTask] = useState("all");
  const [now] = useState(() => Date.now());
  const examKind = data.examBlueprint?.data.examKind ?? data.examBlueprint?.data.programType;
  const history = useMemo(() => examKind ? writtenPracticeHistory(data.homeworks, data.homeworkSubmissions, data.mockExams, data.examBlueprint?.id ?? "", examKind, data.studentProgram?.id, data.examBlueprint?.data) : [], [data, examKind]);
  if (!examKind) return null;
  const cutoff = period === "all" ? -Infinity : now - Number(period) * 86400000;
  const taskNumbers = examKind === "oge" ? [1, 13] : [27];
  const activeTask = taskNumbers.includes(Number(task)) ? task : "all";
  const filtered = history.filter((row) => row.date >= cutoff && (activeTask === "all" || row.taskNumber === Number(activeTask)));
  const months = monthlyHistory(filtered, (row) => row.date, timezone);
  const label = (number: number) => number === 1 ? "Изложение" : "Сочинение";
  return <section className="analytics-panel written-practice-panel" data-testid="written-practice">
    <div className="panel-heading">
      <div><p className="eyebrow">Письменные работы</p><h2>Сочинения и изложения</h2></div>
      <div className="inline-control">
        <label className="form-field compact-filter"><span>Период письменных работ</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="30">Последние 30 дней</option><option value="90">Последние 90 дней</option><option value="all">За всё время</option></select></label>
        {examKind === "oge" ? <label className="form-field compact-filter"><span>Вид работы</span><select value={activeTask} onChange={(event) => setTask(event.target.value)}><option value="all">Все работы</option>{taskNumbers.map((number) => <option key={number} value={number}>№{number} · {label(number)}</option>)}</select></label> : null}
      </div>
    </div>
    <p className="workflow-hint">Баллы из ДЗ и пробников · сначала новые. Для ДЗ указана дата проверки, для пробника — дата проведения. Повторные проверки разных попыток показаны отдельно.</p>
    <div className="external-practice-summary">
      {taskNumbers.filter((number) => activeTask === "all" || String(number) === activeTask).map((number) => {
        const results = filtered.filter((row) => row.taskNumber === number);
        const latest = results[0];
        return <article key={number}><strong>№{number} · {label(number)}</strong><span>Работ: {results.length}</span><span>Последняя: {latest ? `${latest.earned}/${latest.max}` : "нет оценки"}</span>{results.length ? <span>Средний результат: {Math.round(results.reduce((sum, row) => sum + row.earned / row.max * 100, 0) / results.length)}%</span> : null}</article>;
      })}
    </div>
    {!filtered.length ? <p className="content-state">За этот период оценённых письменных работ нет.</p> : null}
    {months.map((month) => <details className="practice-history-month" key={month.key} open><summary>{month.label} · {month.items.length}</summary><div className="written-practice-list">{month.items.map((row) => <article key={row.id}>
      <div><strong>№{row.taskNumber} · {label(row.taskNumber)} · {row.earned}/{row.max}</strong><span>{row.title}</span></div>
      <time dateTime={dateKeyForTimezone(new Date(row.date), timezone)}>{formatDateTimeForTimezone(new Date(row.date), timezone, { dateStyle: "medium" })}</time><span>{row.source}</span>
      <WrittenScoreBreakdown row={row} />
    </article>)}</div></details>)}
    {examKind === "oge" ? <p className="workflow-hint">Общие баллы пробника за грамотность и фактическую точность не дублируются в обеих работах.</p> : null}
  </section>;
}

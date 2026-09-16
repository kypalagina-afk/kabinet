import type { WrittenCriterion } from "./writtenBreakdown";
import type { WrittenPracticeRow } from "./writtenPractice";

function CriteriaTable({ criteria, label }: { criteria: WrittenCriterion[]; label: string }) {
  return <table className="written-criteria-table" aria-label={label}>
    <thead><tr><th scope="col">Критерий</th><th scope="col">Баллы</th><th scope="col">Ошибок</th></tr></thead>
    <tbody>{criteria.map((criterion, index) => <tr key={`${criterion.code}-${index}`}>
      <th scope="row"><strong>{criterion.code}</strong>{criterion.title ? <span>{criterion.title}</span> : null}</th>
      <td><strong>{criterion.earned}/{criterion.max}</strong></td><td>{criterion.errorsCount ?? "—"}</td>
    </tr>)}</tbody>
  </table>;
}

export function WrittenScoreBreakdown({ row }: { row: WrittenPracticeRow }) {
  return <details className="written-score-breakdown">
    <summary>Баллы по критериям</summary>
    {row.criteria.length ? <CriteriaTable criteria={row.criteria} label="Разбалловка письменной работы" /> : <p className="workflow-hint">В этой проверке сохранён только общий балл. Оценок по отдельным критериям нет.</p>}
    {row.sharedCriteria.length ? <section>
      <h4>Общие критерии пробника</h4>
      <p className="workflow-hint">Грамотность и фактическая точность оцениваются совместно за изложение и сочинение. Эти баллы не прибавляются повторно к результату каждой работы.</p>
      <CriteriaTable criteria={row.sharedCriteria} label="Общие критерии пробника" />
    </section> : null}
    {row.comment ? <p className="written-review-comment"><strong>Комментарий к работе:</strong>{"\n"}{row.comment}</p> : null}
    {row.overallComment ? <p className="written-review-comment"><strong>Комментарий к пробнику:</strong>{"\n"}{row.overallComment}</p> : null}
  </details>;
}

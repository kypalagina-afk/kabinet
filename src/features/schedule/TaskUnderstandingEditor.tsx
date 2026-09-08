import { understandingLabels, understandingStatus, type TaskUnderstanding } from "./taskUnderstanding";

export function TaskUnderstandingEditor({ tasks, value, onChange, studentName = "" }: {
  tasks: number[];
  value: TaskUnderstanding;
  onChange(value: TaskUnderstanding): void;
  studentName?: string;
}) {
  if (!tasks.length) return null;
  return <section className="task-understanding-editor" aria-label={`Понимание по заданиям ${studentName}`}>
    <h3>Понимание по заданиям</h3>
    <p className="workflow-hint">Оцените каждый номер отдельно. «Не оценено» можно оставить, если пока недостаточно данных.</p>
    {[...tasks].sort((a, b) => a - b).map((task) => {
      const rating = value[String(task)];
      return <div className="task-understanding-row" key={task}>
        <strong>№{task}</strong>
        <label className="form-field"><span>Понимание / 10</span><select aria-label={`${studentName ? `${studentName}: ` : ""}Понимание задания №${task}`} value={rating?.score ?? ""} onChange={(event) => {
          const next = { ...value };
          if (!event.target.value) delete next[String(task)];
          else { const score = Number(event.target.value); next[String(task)] = { score, status: understandingStatus(score) }; }
          onChange(next);
        }}><option value="">Не оценено</option>{Array.from({ length: 10 }, (_, index) => index + 1).map((score) => <option value={score} key={score}>{score}/10</option>)}</select></label>
        <label className="form-field"><span>Статус</span><select aria-label={`${studentName ? `${studentName}: ` : ""}Статус задания №${task}`} disabled={!rating} value={rating?.status ?? ""} onChange={(event) => {
          if (rating) onChange({ ...value, [String(task)]: { ...rating, status: event.target.value as typeof rating.status } });
        }}><option value="" disabled>Не оценено</option>{Object.entries(understandingLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      </div>;
    })}
  </section>;
}

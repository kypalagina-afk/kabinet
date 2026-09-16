import { Modal } from "../../components/Modal";
import { reviewItemLabels } from "../homework/reviewProgress";
import { buildHomeworkReport } from "./homeworkReportData";
import type { DocumentWithId, Homework, HomeworkSubmission } from "../../lib/firebase/types";

const date = (value: number) => new Date(value).toLocaleDateString("ru-RU");

export function HomeworkReport({ homeworks, submissions, onClose, studentNames }: {
  homeworks: DocumentWithId<Homework>[];
  submissions: DocumentWithId<HomeworkSubmission>[];
  onClose(): void;
  studentNames?: Record<string, string>;
}) {
  const report = buildHomeworkReport(homeworks, submissions);
  return <Modal title={studentNames ? "Домашние задания из сводки" : "Все домашние задания"} className="homework-report-modal" onClose={onClose}>
    {studentNames ? <p className="workflow-hint">Здесь показаны ДЗ, загруженные в общую сводку. Для полной истории выберите конкретного ученика в аналитике.</p> : null}
    <p className="workflow-hint">{studentNames ? "В сводке" : "За всё время"} · {report.length} ДЗ. Новые сверху. Показаны последние попытки сдачи. Будущие ДЗ тоже видны здесь, но не включаются в текущий процент выполнения.</p>
    {!report.length ? <p className="content-state">Домашние задания пока не выданы.</p> : null}
    <div className="homework-report">
      {report.map((homework) => <article className="homework-report__assignment" key={homework.id}>
        {studentNames?.[homework.studentId] ? <p className="eyebrow">{studentNames[homework.studentId]}</p> : null}
        <h3>{homework.title}</h3>
        <p className="workflow-hint">Выдано: {date(homework.assignedAt)} · Срок: {homework.dueDate ? homework.dueDate.split("-").reverse().join(".") : homework.deadline == null ? "не указан" : date(homework.deadline)}</p>
        <div className="homework-report__items">
          {homework.items.map((item, index) => <div className="homework-report__item" key={item.itemId}>
            <div><strong>{index + 1}. {item.title}</strong><small>{reviewItemLabels[item.state]}</small></div>
            <div><small>Срок сдачи</small><span>{item.state === "missing" ? "Не сдано" : item.onTime === null ? "Не отмечено" : item.onTime ? "Вовремя" : "С опозданием"}</span></div>
            <div><small>Качество · баллы</small><strong>{item.score ?? "Нет оценки"}</strong></div>
          </div>)}
        </div>
        {homework.quality ? <p>Качество всего ДЗ: <strong>{homework.quality}</strong></p> : null}
        {homework.totalScore && homework.items.length > 1 ? <p>Общий результат: <strong>{homework.totalScore}</strong></p> : null}
      </article>)}
    </div>
  </Modal>;
}

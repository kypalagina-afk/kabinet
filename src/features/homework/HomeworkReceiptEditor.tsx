import { useState } from "react";
import type { DocumentWithId, Homework, HomeworkSubmission } from "../../lib/firebase/types";
import { getFirebaseDb } from "../../lib/firebase/client";
import { saveHomeworkReceipt } from "../../lib/firebase/services/homeworkReceipt";
import { homeworkDeadlineAt } from "./selectors";

export function HomeworkReceiptEditor({ homework, homeworkId, submission, teacherId }: {
  homework: Homework; homeworkId: string; submission: DocumentWithId<HomeworkSubmission>; teacherId: string;
}) {
  const deadline = homeworkDeadlineAt(homework);
  const legacyOnTime = deadline === null || !submission.data.submittedAt || submission.data.submittedAt.toMillis() <= deadline;
  const [items, setItems] = useState(() => Object.fromEntries((homework.items ?? []).map((item) => [item.itemId, {
    received: submission.data.teacherReceipt?.items[item.itemId]?.received ?? Boolean(submission.data.studentInput.itemProgress?.find((entry) => entry.itemId === item.itemId)?.completed || submission.data.teacherEvaluation?.itemEvaluations?.some((entry) => entry.itemId === item.itemId)),
    onTime: submission.data.teacherReceipt?.items[item.itemId]?.onTime ?? (submission.data.teacherReceipt?.items[item.itemId]?.receivedAt && deadline !== null ? submission.data.teacherReceipt.items[item.itemId]!.receivedAt!.toMillis() <= deadline : legacyOnTime),
  }])));
  const [onTime, setOnTime] = useState(() => submission.data.teacherReceipt?.onTime ?? (Object.values(items).some((item) => item.received) ? Object.values(items).filter((item) => item.received).every((item) => item.onTime) : legacyOnTime));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  return <section className="homework-receipt-editor">
    <h3>Что сдано и в какой срок</h3>
    <p>Отметьте только полученные пункты. Можно дополнить отметки, когда ученик пришлёт остальное.</p>
    {(homework.items ?? []).map((item) => <div className="homework-receipt-row" key={item.itemId}>
      <label><input type="checkbox" checked={items[item.itemId]?.received ?? false} onChange={(event) => setItems({ ...items, [item.itemId]: { onTime: items[item.itemId]?.onTime ?? true, received: event.target.checked } })} /> {item.title}</label>
      <ReceiptTiming value={items[item.itemId]?.onTime ?? true} disabled={!items[item.itemId]?.received} label={`Срок сдачи: ${item.title}`} onChange={(value) => setItems({ ...items, [item.itemId]: { received: items[item.itemId]?.received ?? false, onTime: value } })} />
    </div>)}
    <ReceiptTiming label="Срок сдачи всего ДЗ" value={onTime} onChange={setOnTime} />
    <button className="secondary-button" disabled={saving} type="button" onClick={async () => {
      setSaving(true); setMessage("");
      try { await saveHomeworkReceipt(getFirebaseDb(), { teacherId, homeworkId, submissionId: submission.id, onTime, items }); setMessage("Отметки сдачи сохранены ✓"); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить отметки."); }
      finally { setSaving(false); }
    }}>{saving ? "Сохраняем…" : "Сохранить отметки сдачи"}</button>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

export function ReceiptTiming({ value, onChange, label, disabled = false }: { value: boolean; onChange(value: boolean): void; label: string; disabled?: boolean }) {
  return <label className="form-field"><span>{label}</span><select disabled={disabled} value={value ? "on_time" : "late"} onChange={(event) => onChange(event.target.value === "on_time")}><option value="on_time">Вовремя</option><option value="late">С опозданием</option></select></label>;
}

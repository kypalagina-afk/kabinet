import { useState } from "react";
import type { DocumentWithId, Homework, HomeworkSubmission } from "../../lib/firebase/types";
import { getFirebaseDb } from "../../lib/firebase/client";
import { saveHomeworkReceipt } from "../../lib/firebase/services/homeworkReceipt";

export function HomeworkReceiptEditor({ homework, homeworkId, submission, teacherId }: {
  homework: Homework; homeworkId: string; submission: DocumentWithId<HomeworkSubmission>; teacherId: string;
}) {
  const [items, setItems] = useState(() => Object.fromEntries((homework.items ?? []).map((item) => [item.itemId, {
    received: submission.data.teacherReceipt?.items[item.itemId]?.received ?? Boolean(submission.data.studentInput.itemProgress?.find((entry) => entry.itemId === item.itemId)?.completed || submission.data.teacherEvaluation?.itemEvaluations?.some((entry) => entry.itemId === item.itemId)),
    onTime: submission.data.teacherReceipt?.items[item.itemId]?.onTime ?? null as boolean | null,
  }])));
  const [onTime, setOnTime] = useState<boolean | null>(submission.data.teacherReceipt?.onTime ?? null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  return <section className="homework-receipt-editor">
    <h3>Что сдано и в какой срок</h3>
    <p>Отметьте только полученные пункты. Можно дополнить отметки, когда ученик пришлёт остальное.</p>
    {(homework.items ?? []).map((item) => <div className="homework-receipt-row" key={item.itemId}>
      <label><input type="checkbox" checked={items[item.itemId]?.received ?? false} onChange={(event) => setItems({ ...items, [item.itemId]: { onTime: items[item.itemId]?.onTime ?? null, received: event.target.checked } })} /> {item.title}</label>
      <ReceiptTiming value={items[item.itemId]?.onTime ?? null} disabled={!items[item.itemId]?.received} label={`Срок сдачи: ${item.title}`} onChange={(value) => setItems({ ...items, [item.itemId]: { received: items[item.itemId]?.received ?? false, onTime: value } })} />
    </div>)}
    <ReceiptTiming label="Срок сдачи всего ДЗ" value={onTime} onChange={setOnTime} />
    {onTime !== null && homework.items?.length ? <small>Общая отметка срока имеет приоритет в статистике. Выберите «По дате сдачи», чтобы учитывать сроки отдельных пунктов.</small> : null}
    <button className="secondary-button" disabled={saving} type="button" onClick={async () => {
      setSaving(true); setMessage("");
      try { await saveHomeworkReceipt(getFirebaseDb(), { teacherId, homeworkId, submissionId: submission.id, onTime, items }); setMessage("Отметки сдачи сохранены ✓"); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить отметки."); }
      finally { setSaving(false); }
    }}>{saving ? "Сохраняем…" : "Сохранить отметки сдачи"}</button>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

export function ReceiptTiming({ value, onChange, label, disabled = false }: { value: boolean | null; onChange(value: boolean | null): void; label: string; disabled?: boolean }) {
  return <label className="form-field"><span>{label}</span><select disabled={disabled} value={value === null ? "auto" : value ? "on_time" : "late"} onChange={(event) => onChange(event.target.value === "auto" ? null : event.target.value === "on_time")}><option value="auto">По дате сдачи</option><option value="on_time">Вовремя</option><option value="late">С опозданием</option></select></label>;
}

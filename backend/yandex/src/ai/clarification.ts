import type { AIActionDraft } from "./schema.js";

const RESCHEDULE_INTENT = /(?:перенес(?:и|ти|ите|ём|ем|у|ла|ли)?|перенос)/i;
const EXPLICIT_DATE = /(?:\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b|\b(?:сегодня|завтра|послезавтра)\b|\b(?:понедельник|вторник|сред[ау]|четверг|пятниц[ау]|суббот[ау]|воскресенье)\b)/i;
const EXPLICIT_TIME = /\b(?:[01]?\d|2[0-3])[:.]\d{2}\b/;

export function rescheduleClarification(command: string, draftId: string): AIActionDraft | null {
  if (!RESCHEDULE_INTENT.test(command)) return null;
  const missingDate = !EXPLICIT_DATE.test(command);
  const missingTime = !EXPLICIT_TIME.test(command);
  if (!missingDate && !missingTime) return null;

  const missing = [missingDate ? "дату" : null, missingTime ? "время" : null]
    .filter(Boolean)
    .join(" и ");
  return {
    actionType: "CLARIFICATION_REQUIRED",
    draftId,
    summary: "Для переноса урока нужны точные дата и время.",
    question: `Уточните ${missing} переноса и укажите, какой именно урок нужно перенести.`,
  };
}

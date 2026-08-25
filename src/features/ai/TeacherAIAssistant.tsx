import { Timestamp } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { useAuth } from "../auth/AuthProvider";
import { useTeacherPlanner } from "../planner/hooks";
import { dateKeyForTimezone, resolveTimezone, zonedLocalDateTimeToDate } from "../schedule/timezone";
import { useTeacherSchedule } from "../schedule/hooks";
import { useTeacherStudentPrograms, useTeacherStudents } from "../vertical-slice/hooks";
import { getFirebaseDb } from "../../lib/firebase/client";
import { createPlannerItemsFromAssistant, updatePlannerItem, updateRecurringPlannerTaskScope, type PlannerRecurrenceScope } from "../../lib/firebase/services/plannerWorkflow";
import { rescheduleLesson } from "../../lib/firebase/services/scheduleOperations";
import { buildTeacherAIContext } from "./context";
import { getTeacherAIUsage, interpretTeacherCommand, transcribeTeacherVoice, type TeacherAIUsage } from "./provider";
import { teacherAIDraftSchema, type PlannerAIItemDraft, type TeacherAIDraft } from "./schema";
import { teacherVoiceInputEnabled } from "./featureFlag";
import { startVoiceRecorder, voiceRecordingSupported, VOICE_MAX_DURATION_MS, type VoiceRecorder } from "./voiceRecorder";

const examples = [
  "Запланируй на завтра: проверить сочинения; подготовить урок с Лерой",
  "Перенеси занятие с Лерой на завтра в 10:00",
  "Сделай ДЗ для Леры: повторить №6 и №9",
  "Подведи итоги урока с Лерой",
];

export function TeacherAIAssistant({ initialCommand = "", onClose }: { initialCommand?: string; onClose(): void }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const teacherId = user?.uid ?? "";
  const timezone = resolveTimezone(profile?.timezone);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [command, setCommand] = useState(initialCommand);
  const [draft, setDraft] = useState<TeacherAIDraft | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "confirming" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [usage, setUsage] = useState<TeacherAIUsage | null>(null);
  const [recurrenceScopeRequired, setRecurrenceScopeRequired] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "starting" | "recording" | "uploading" | "recognizing">("idle");
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const voiceRecorder = useRef<VoiceRecorder | null>(null);
  const voiceAbort = useRef<AbortController | null>(null);
  const voiceClock = useRef<number | null>(null);
  const voiceLimit = useRef<number | null>(null);
  const [range] = useState(() => { const now = Date.now(); return { start: new Date(now - 180 * 86_400_000), end: new Date(now + 180 * 86_400_000) }; });
  const students = useTeacherStudents(teacherId);
  const programs = useTeacherStudentPrograms(teacherId);
  const schedule = useTeacherSchedule(teacherId, range);
  const planner = useTeacherPlanner(teacherId);
  const context = useMemo(() => buildTeacherAIContext({
    teacherId,
    today: dateKeyForTimezone(new Date(), timezone),
    timezone: timezone.iana ?? "Europe/Moscow",
    selectedStudentId: selectedStudentId || null,
    students: students.data,
    lessons: schedule.data.lessons,
    plannerItems: planner.data.items,
  }), [planner.data.items, schedule.data.lessons, selectedStudentId, students.data, teacherId, timezone]);
  useEffect(() => {
    if (!user) return;
    void getTeacherAIUsage(user).then(setUsage).catch(() => undefined);
  }, [user]);

  useEffect(() => () => {
    voiceAbort.current?.abort();
    if (voiceClock.current !== null) window.clearInterval(voiceClock.current);
    if (voiceLimit.current !== null) window.clearTimeout(voiceLimit.current);
    if (voiceRecorder.current) void voiceRecorder.current.cancel().catch(() => undefined);
  }, []);

  async function interpretValue(value: string) {
    if (!user || profile?.role !== "teacher") return;
    setStatus("loading");
    setMessage("");
    try {
      setDraft(await interpretTeacherCommand(value, context, user));
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Не удалось подготовить черновик.");
    }
  }

  async function interpret() {
    await interpretValue(command);
  }

  function clearVoiceTimers() {
    if (voiceClock.current !== null) window.clearInterval(voiceClock.current);
    if (voiceLimit.current !== null) window.clearTimeout(voiceLimit.current);
    voiceClock.current = null;
    voiceLimit.current = null;
  }

  async function beginVoiceRecording() {
    if (!user || voiceStatus !== "idle") return;
    setMessage("");
    setVoiceStatus("starting");
    try {
      voiceRecorder.current = await startVoiceRecorder();
      setVoiceSeconds(0);
      setVoiceStatus("recording");
      const startedAt = Date.now();
      voiceClock.current = window.setInterval(() => {
        setVoiceSeconds(Math.min(VOICE_MAX_DURATION_MS / 1_000, Math.floor((Date.now() - startedAt) / 1000)));
      }, 250);
      voiceLimit.current = window.setTimeout(() => void finishVoiceRecording(), VOICE_MAX_DURATION_MS);
    } catch (error) {
      setVoiceStatus("idle");
      setStatus("error");
      const permissionDenied = error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(error.name);
      setMessage(permissionDenied
        ? "Разрешите доступ к микрофону в настройках браузера и попробуйте снова."
        : error instanceof Error ? error.message : "Не удалось включить микрофон.");
    }
  }

  async function finishVoiceRecording() {
    const recorder = voiceRecorder.current;
    if (!recorder || !user) return;
    voiceRecorder.current = null;
    clearVoiceTimers();
    setVoiceStatus("uploading");
    const controller = new AbortController();
    voiceAbort.current = controller;
    try {
      const recording = await recorder.stop();
      const transcript = await transcribeTeacherVoice(recording, user, {
        signal: controller.signal,
        onProcessing: () => setVoiceStatus("recognizing"),
      });
      setCommand(transcript);
      setVoiceStatus("idle");
      setMessage("Речь распознана. Проверьте подготовленные черновики перед сохранением.");
      await interpretValue(transcript);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setVoiceStatus("idle");
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Не удалось распознать речь.");
    } finally {
      voiceAbort.current = null;
    }
  }

  async function cancelVoiceRecording() {
    const recorder = voiceRecorder.current;
    voiceRecorder.current = null;
    clearVoiceTimers();
    voiceAbort.current?.abort();
    if (recorder) await recorder.cancel().catch(() => undefined);
    setVoiceStatus("idle");
    setVoiceSeconds(0);
    setMessage("Запись отменена. Аудио не отправлялось.");
  }

  function patchPlannerItem(index: number, patch: Partial<PlannerAIItemDraft>) {
    if (draft?.actionType !== "PLANNER_ITEMS_DRAFT") return;
    setDraft({ ...draft, items: draft.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  }

  function plannerUpdateInput(updateDraft: Extract<TeacherAIDraft, { actionType: "PLANNER_ITEM_UPDATE_DRAFT" }>, current: (typeof planner.data.items)[number]) {
    return { itemType: current.data.itemType, title: updateDraft.patch.title ?? current.data.title, category: updateDraft.patch.category ?? current.data.category, date: updateDraft.patch.date === undefined ? current.data.date : updateDraft.patch.date, startTime: updateDraft.patch.startTime === undefined ? current.data.startTime : updateDraft.patch.startTime, endTime: current.data.endTime, durationMinutes: current.data.durationMinutes, deadline: current.data.deadline, notes: updateDraft.patch.notes === undefined ? current.data.notes : updateDraft.patch.notes, priority: updateDraft.patch.priority ?? current.data.priority, goalId: current.data.goalId, subgoalId: current.data.subgoalId };
  }

  async function confirmRecurringPlannerUpdate(scope: PlannerRecurrenceScope) {
    if (draft?.actionType !== "PLANNER_ITEM_UPDATE_DRAFT") return;
    const current = planner.data.items.find(({ id }) => id === draft.itemId);
    if (!current || (current.data.updatedAt?.toMillis() ?? null) !== draft.baselineUpdatedAtMillis) {
      setStatus("error");
      setMessage("Пункт плана изменился после создания черновика. Подготовьте его заново.");
      return;
    }
    setStatus("confirming");
    try {
      await updateRecurringPlannerTaskScope(getFirebaseDb(), teacherId, current.id, plannerUpdateInput(draft, current), scope);
      setRecurrenceScopeRequired(false);
      setStatus("done");
      setMessage("Регулярная задача обновлена в выбранной области.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Не удалось обновить серию.");
    }
  }

  async function confirmDraft() {
    if (!draft || !user) return;
    setStatus("confirming");
    setMessage("");
    try {
      teacherAIDraftSchema.parse(draft);
      if (draft.actionType === "PLANNER_ITEMS_DRAFT") {
        const selected = draft.items.filter((item) => item.selected);
        const result = await createPlannerItemsFromAssistant(getFirebaseDb(), teacherId, draft.draftId, selected.map((item) => ({
          draftItemId: item.draftItemId,
          input: { itemType: item.itemType, title: item.title, category: item.category, date: item.category === "someday" ? null : item.date, startTime: item.startTime, endTime: null, durationMinutes: null, deadline: null, notes: item.notes, priority: item.priority, goalId: null, subgoalId: null },
        })));
        setMessage(`Добавлено: ${result.created}. Уже было подтверждено: ${result.existing}.`);
      } else if (draft.actionType === "PLANNER_ITEM_UPDATE_DRAFT") {
        const current = planner.data.items.find(({ id }) => id === draft.itemId);
        if (!current || (current.data.updatedAt?.toMillis() ?? null) !== draft.baselineUpdatedAtMillis) throw new Error("Пункт плана изменился после создания черновика. Подготовьте его заново.");
        if (current.data.recurrenceSeriesId) {
          setRecurrenceScopeRequired(true);
          setStatus("idle");
          setMessage("Выберите область изменения регулярной задачи.");
          return;
        }
        await updatePlannerItem(getFirebaseDb(), teacherId, current.id, plannerUpdateInput(draft, current));
        setMessage("Пункт плана обновлён.");
      } else if (draft.actionType === "LESSON_RESCHEDULE_DRAFT") {
        const lesson = schedule.data.lessons.find(({ id }) => id === draft.lessonId);
        if (!lesson || lesson.data.status !== "planned" || (lesson.data.updatedAt?.toMillis() ?? null) !== draft.baselineUpdatedAtMillis) throw new Error("Занятие изменилось после создания черновика. Подготовьте перенос заново.");
        const start = zonedLocalDateTimeToDate(draft.newDate, draft.newTime, timezone.iana ?? "Europe/Moscow");
        const endMillis = start.getTime() + draft.durationMinutes * 60_000;
        const conflict = schedule.data.lessons.find(({ id, data }) => id !== lesson.id && data.status === "planned" && data.startAt.toMillis() < endMillis && data.endAt.toMillis() > start.getTime());
        if (conflict) throw new Error("Конфликт времени: в выбранном интервале уже есть занятие.");
        await rescheduleLesson(getFirebaseDb(), { lessonId: lesson.id, newStartAt: Timestamp.fromDate(start), newEndAt: Timestamp.fromMillis(endMillis) });
        setMessage("Занятие перенесено через календарный workflow.");
      } else if (draft.actionType === "HOMEWORK_DRAFT") {
        const program = programs.data.find(({ data }) => data.studentId === draft.studentId && data.status === "active");
        if (!program) throw new Error("У ученика нет активной программы.");
        localStorage.setItem(`homework-draft:${teacherId}:${draft.studentId}`, JSON.stringify({ title: draft.title, description: draft.description, dueDate: draft.dueDate ?? "", dueTime: draft.dueTime ?? "", items: [{ itemId: crypto.randomUUID(), type: "practice", title: draft.title, description: draft.description || null, requiredAmount: null, examTaskNumbers: draft.examTaskNumbers, attachments: [], materialIds: [], sortOrder: 0 }], attachments: [] }));
        navigate(`/teacher/students/${draft.studentId}?tab=homework`);
        onClose();
        return;
      } else if (draft.actionType === "LESSON_SUMMARY_DRAFT") {
        const lesson = schedule.data.lessons.find(({ id }) => id === draft.lessonId);
        if (!lesson) throw new Error("Занятие больше не доступно.");
        localStorage.setItem(`lesson-summary-draft:${draft.lessonId}`, JSON.stringify({ topic: draft.topic, score: draft.understandingScore, understandingStatus: draft.understandingScore <= 4 ? "needs_practice" : draft.understandingScore <= 7 ? "in_progress" : "confident", tasks: draft.examTaskNumbers, errors: draft.errors, errorDraft: "", studentComment: draft.studentComment, privateNote: draft.privateNote, detailsOpen: Boolean(draft.studentComment || draft.privateNote) }));
        navigate(`/teacher/calendar?lesson=${encodeURIComponent(draft.lessonId)}`);
        onClose();
        return;
      }
      setStatus("done");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Не удалось подтвердить черновик.");
    }
  }

  const voiceEnabled = teacherVoiceInputEnabled();
  const voiceSupported = voiceRecordingSupported();
  const voiceBusy = voiceStatus !== "idle";
  return <Modal className="teacher-ai-modal" onClose={onClose} title="✨ AI-помощник преподавателя"><div className="teacher-ai-content"><p className="teacher-ai-safety">Помощник создаёт только черновик. Ничего не сохранится без вашего подтверждения.</p><label className="form-field"><span>Контекст ученика · необязательно</span><select onChange={(event) => setSelectedStudentId(event.target.value)} value={selectedStudentId}><option value="">Определить из запроса</option>{students.data.map(({ id, data }) => <option key={id} value={id}>{data.displayName}</option>)}</select></label><label className="form-field"><span>Что подготовить?</span><textarea autoFocus onChange={(event) => setCommand(event.target.value)} placeholder="Например: запланируй на завтра проверить сочинения" rows={4} value={command} /></label>{voiceEnabled ? <section className="teacher-ai-voice" aria-label="Голосовой ввод"><div className="teacher-ai-voice-actions">{voiceStatus === "recording" ? <button className="voice-record-button voice-record-button--active" onClick={() => void finishVoiceRecording()} type="button"><span aria-hidden="true">■</span> Завершить · {String(Math.floor(voiceSeconds / 60)).padStart(2, "0")}:{String(voiceSeconds % 60).padStart(2, "0")}</button> : <button className="voice-record-button" disabled={!voiceSupported || voiceBusy || status === "loading"} onClick={() => void beginVoiceRecording()} type="button">🎙 Наговорить несколько задач</button>}{voiceBusy ? <button className="secondary-button" onClick={() => void cancelVoiceRecording()} type="button">Отменить</button> : null}</div><small aria-live="polite">{voiceStatus === "starting" ? "Включаем микрофон…" : voiceStatus === "recording" ? "Говорите задачи подряд. Максимум 3 минуты." : voiceStatus === "uploading" ? "Безопасно отправляем аудио по частям…" : voiceStatus === "recognizing" ? "Распознаём речь и разделяем задачи…" : voiceSupported ? "Аудио не сохраняется. После распознавания появятся отдельные черновики." : "В этом браузере микрофон недоступен."}</small></section> : null}<div className="teacher-ai-examples">{examples.map((example) => <button key={example} onClick={() => setCommand(example)} type="button">{example}</button>)}</div><button className="primary-button primary-button--fit" disabled={!command.trim() || status === "loading" || voiceBusy} onClick={() => void interpret()} type="button">{status === "loading" ? "Готовлю…" : "Подготовить черновик"}</button>{draft ? <AIDraftPreview draft={draft} onDraftChange={setDraft} onPatchPlannerItem={patchPlannerItem} /> : null}{draft && !["CLARIFICATION_REQUIRED", "UNSUPPORTED_REQUEST"].includes(draft.actionType) ? <button className="primary-button primary-button--fit" disabled={status === "confirming" || recurrenceScopeRequired || voiceBusy || (draft.actionType === "PLANNER_ITEMS_DRAFT" && !draft.items.some((item) => item.selected))} onClick={() => void confirmDraft()} type="button">{status === "confirming" ? "Применяю…" : draft.actionType === "HOMEWORK_DRAFT" || draft.actionType === "LESSON_SUMMARY_DRAFT" ? "Передать в форму для финальной проверки" : "Подтвердить выбранное"}</button> : null}{recurrenceScopeRequired ? <div className="recurrence-scope-options"><strong>Какие повторения изменить?</strong><button className="secondary-button" onClick={() => void confirmRecurringPlannerUpdate("occurrence")} type="button">Только это</button><button className="secondary-button" onClick={() => void confirmRecurringPlannerUpdate("following")} type="button">Это и следующие</button><button className="secondary-button" onClick={() => void confirmRecurringPlannerUpdate("series")} type="button">Вся серия</button></div> : null}{message ? <p className={status === "error" ? "shell-notice" : "form-success"} role="status">{message}</p> : null}<small className="teacher-ai-usage">{usage ? `AI за сегодня: ${usage.today} · за месяц: ${usage.month} · ошибок: ${usage.failures} · токенов: ${usage.inputTokens + usage.outputTokens}` : "Локальный MockAIProvider · платные запросы не выполняются"}</small></div></Modal>;
}

function AIDraftPreview({ draft, onDraftChange, onPatchPlannerItem }: { draft: TeacherAIDraft; onDraftChange(value: TeacherAIDraft): void; onPatchPlannerItem(index: number, patch: Partial<PlannerAIItemDraft>): void }) {
  if (draft.actionType === "CLARIFICATION_REQUIRED") return <section className="teacher-ai-preview"><h3>{draft.summary}</h3><p>{draft.question}</p></section>;
  if (draft.actionType === "UNSUPPORTED_REQUEST") return <section className="teacher-ai-preview"><h3>{draft.summary}</h3><p>{draft.reason}</p></section>;
  if (draft.actionType === "PLANNER_ITEMS_DRAFT") return <section className="teacher-ai-preview"><h3>{draft.summary}</h3><div className="teacher-ai-plan-items">{draft.items.map((item, index) => <article key={item.draftItemId}><input aria-label={`Выбрать ${item.title}`} checked={item.selected} onChange={(event) => onPatchPlannerItem(index, { selected: event.target.checked })} type="checkbox" /><div><input aria-label="Название задачи" onChange={(event) => onPatchPlannerItem(index, { title: event.target.value })} value={item.title} /><div><select aria-label="Тип" onChange={(event) => onPatchPlannerItem(index, { itemType: event.target.value as PlannerAIItemDraft["itemType"] })} value={item.itemType}><option value="task">Задача</option><option value="event">Событие</option></select><select aria-label="Категория" onChange={(event) => onPatchPlannerItem(index, { category: event.target.value as PlannerAIItemDraft["category"] })} value={item.category}><option value="work">Работа</option><option value="home">Дом</option><option value="someday">Когда-нибудь</option></select><input aria-label="Дата" disabled={item.category === "someday"} onChange={(event) => onPatchPlannerItem(index, { date: event.target.value || null })} type="date" value={item.date ?? ""} /><input aria-label="Время" disabled={item.category === "someday"} onChange={(event) => onPatchPlannerItem(index, { startTime: event.target.value || null })} type="time" value={item.startTime ?? ""} /><select aria-label="Приоритет" onChange={(event) => onPatchPlannerItem(index, { priority: event.target.value as PlannerAIItemDraft["priority"] })} value={item.priority}><option value="high">Высокий</option><option value="medium">Средний</option><option value="low">Низкий</option></select></div></div></article>)}</div></section>;
  if (draft.actionType === "LESSON_RESCHEDULE_DRAFT") return <section className="teacher-ai-preview"><h3>{draft.summary}</h3><div className="form-grid"><label className="form-field"><span>Новая дата</span><input onChange={(event) => onDraftChange({ ...draft, newDate: event.target.value })} type="date" value={draft.newDate} /></label><label className="form-field"><span>Новое время</span><input onChange={(event) => onDraftChange({ ...draft, newTime: event.target.value })} type="time" value={draft.newTime} /></label><label className="form-field"><span>Длительность, минут</span><input min="1" onChange={(event) => onDraftChange({ ...draft, durationMinutes: Number(event.target.value) })} type="number" value={draft.durationMinutes} /></label></div></section>;
  if (draft.actionType === "HOMEWORK_DRAFT") return <section className="teacher-ai-preview"><h3>{draft.summary}</h3><label className="form-field"><span>Название ДЗ</span><input onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} value={draft.title} /></label><label className="form-field"><span>Описание</span><textarea onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} rows={3} value={draft.description} /></label><div className="form-grid"><label className="form-field"><span>Срок</span><input onChange={(event) => onDraftChange({ ...draft, dueDate: event.target.value || null })} type="date" value={draft.dueDate ?? ""} /></label><label className="form-field"><span>Время</span><input onChange={(event) => onDraftChange({ ...draft, dueTime: event.target.value || null })} type="time" value={draft.dueTime ?? ""} /></label></div></section>;
  if (draft.actionType === "LESSON_SUMMARY_DRAFT") return <section className="teacher-ai-preview"><h3>{draft.summary}</h3><label className="form-field"><span>Тема</span><input onChange={(event) => onDraftChange({ ...draft, topic: event.target.value })} value={draft.topic} /></label><label className="form-field"><span>Понимание: {draft.understandingScore}/10</span><input max="10" min="1" onChange={(event) => onDraftChange({ ...draft, understandingScore: Number(event.target.value) })} type="range" value={draft.understandingScore} /></label><label className="form-field"><span>Ошибки / фокус</span><textarea onChange={(event) => onDraftChange({ ...draft, errors: event.target.value.split(/\n|;/).map((value) => value.trim()).filter(Boolean) })} rows={3} value={draft.errors.join("; ")} /></label><label className="form-field"><span>Комментарий ученику</span><textarea onChange={(event) => onDraftChange({ ...draft, studentComment: event.target.value })} rows={2} value={draft.studentComment} /></label></section>;
  const rows = Object.entries(draft).filter(([key]) => !["actionType", "draftId"].includes(key));
  return <section className="teacher-ai-preview"><h3>Предпросмотр</h3><dl>{rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(", ") || "—" : value === null ? "—" : String(value)}</dd></div>)}</dl></section>;
}

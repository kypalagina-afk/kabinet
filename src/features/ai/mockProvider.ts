import { addPlannerDays } from "../planner/recurrence.js";
import { teacherAIDraftSchema, type TeacherAIContext, type TeacherAIDraft } from "./schema.js";

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function mentionedStudent(command: string, context: TeacherAIContext) {
  const normalized = command.toLocaleLowerCase("ru-RU");
  const selected = context.students.find((student) => student.id === context.selectedStudentId);
  if (selected) return selected;
  const matches = context.students.filter((student) => normalized.includes(student.displayName.toLocaleLowerCase("ru-RU")));
  if (matches.length === 1) return matches[0];
  return context.students.length === 1 ? context.students[0] : undefined;
}

function mentionedLesson(command: string, context: TeacherAIContext) {
  const student = mentionedStudent(command, context);
  const candidates = context.lessons.filter((lesson) => student && lesson.studentId === student.id);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function dateInCommand(command: string, today: string) {
  if (/послезавтра/i.test(command)) return addPlannerDays(today, 2);
  if (/завтра/i.test(command)) return addPlannerDays(today, 1);
  const exact = command.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return exact?.[1] ?? today;
}

function timeInCommand(command: string) {
  return command.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/)?.slice(1).map((part) => part.padStart(2, "0")).join(":") ?? null;
}

export function createMockTeacherAIDraft(commandValue: string, context: TeacherAIContext): TeacherAIDraft {
  const command = commandValue.trim();
  const draftId = id("draft");
  const student = mentionedStudent(command, context);
  const lesson = mentionedLesson(command, context);
  let result: TeacherAIDraft;

  if (!command) {
    result = { actionType: "CLARIFICATION_REQUIRED", draftId, summary: "Нужно уточнение", question: "Что вы хотите подготовить?" };
  } else if (/итог|подведи|заверш/i.test(command) && /урок|занят/i.test(command)) {
    if (!lesson || !student) result = { actionType: "CLARIFICATION_REQUIRED", draftId, summary: "Не найдено занятие", question: "Для какого ученика и занятия подготовить итоги?" };
    else { const score = Number(command.match(/(\d+)\s*(?:из|\/)\s*10/i)?.[1] ?? 7); const errors = command.match(/(?:путает|ошибки?:?)\s+(.+)$/i)?.[1]?.split(/;|,/).map((value) => value.trim()).filter(Boolean) ?? []; result = { actionType: "LESSON_SUMMARY_DRAFT", draftId, summary: `Черновик итогов для ${student.displayName}`, lessonId: lesson.id, studentId: student.id, topic: lesson.topic ?? "Тема занятия", understandingScore: Math.max(1, Math.min(10, score)), examTaskNumbers: Array.from(command.matchAll(/№\s*(\d+)/g), (match) => Number(match[1])), errors, studentComment: "Продолжить закрепление темы.", privateNote: "" }; }
  } else if (/дз|домашн/i.test(command)) {
    if (!student) result = { actionType: "CLARIFICATION_REQUIRED", draftId, summary: "Не выбран ученик", question: "Для какого ученика подготовить ДЗ?" };
    else result = { actionType: "HOMEWORK_DRAFT", draftId, summary: `Черновик ДЗ для ${student.displayName}`, studentId: student.id, title: command.replace(/^.*?(дз|домашнее задание)\s*/i, "").trim() || "Закрепить материал урока", description: "Проверьте формулировку и срок перед назначением.", dueDate: dateInCommand(command, context.today), dueTime: timeInCommand(command), examTaskNumbers: Array.from(command.matchAll(/№\s*(\d+)/g), (match) => Number(match[1])) };
  } else if (/перенес/i.test(command) && /урок|занят/i.test(command)) {
    if (!lesson || !student) result = { actionType: "CLARIFICATION_REQUIRED", draftId, summary: "Не найдено занятие", question: "Какое занятие нужно перенести?" };
    else if (!timeInCommand(command)) result = { actionType: "CLARIFICATION_REQUIRED", draftId, summary: "Нужно время переноса", question: "На какое точное время перенести занятие?" };
    else result = { actionType: "LESSON_RESCHEDULE_DRAFT", draftId, summary: `Перенос занятия с ${student.displayName}`, lessonId: lesson.id, studentId: student.id, newDate: dateInCommand(command, context.today), newTime: timeInCommand(command)!, durationMinutes: Math.round((lesson.endAtMillis - lesson.startAtMillis) / 60_000), baselineUpdatedAtMillis: lesson.updatedAtMillis };
  } else if (/перенеси|перемести|отправь|измени/i.test(command)) {
    const normalized = command.toLocaleLowerCase("ru-RU");
    const candidates = context.plannerItems.filter((item) => {
      const title = item.title.toLocaleLowerCase("ru-RU");
      return normalized.includes(title) || title.split(/\s+/).some((word) => word.length >= 4 && normalized.includes(word));
    });
    if (candidates.length !== 1) result = { actionType: "CLARIFICATION_REQUIRED", draftId, summary: "Неоднозначная задача", question: candidates.length ? "Найдено несколько задач. Какую именно изменить?" : "Не удалось найти задачу в планере." };
    else { const item = candidates[0]!; const category = /когда-нибудь/i.test(command) ? "someday" : /\bв дом/i.test(command) ? "home" : /\bв работ/i.test(command) ? "work" : undefined; const time = timeInCommand(command); result = { actionType: "PLANNER_ITEM_UPDATE_DRAFT", draftId, summary: `Изменение задачи «${item.title}»`, itemId: item.id, baselineUpdatedAtMillis: item.updatedAtMillis, patch: { ...(category ? { category, date: category === "someday" ? null : item.date, startTime: category === "someday" ? null : (time ?? item.startTime) } : {}), ...(time && category !== "someday" ? { startTime: time } : {}) } }; }
  } else if (/план|задач|напомни|запланируй/i.test(command)) {
    const fragments = command.split(/\n|;|,/).map((value) => value.trim()).filter(Boolean);
    const baseDate = dateInCommand(command, context.today);
    result = { actionType: "PLANNER_ITEMS_DRAFT", draftId, summary: `Подготовлено задач: ${fragments.length}`, items: fragments.slice(0, 30).map((title, index) => { const startTime = timeInCommand(title); const category = /когда-нибудь/i.test(title) ? "someday" : /дом|личн|ногт|за город/i.test(title) || (startTime && !/провер|урок|учен|работ/i.test(title)) ? "home" : "work"; return { draftItemId: `${draftId}-${index + 1}`, selected: true, itemType: startTime ? "event" : "task", title: title.replace(/^(запланируй|добавь|задача:?|план:?)/i, "").replace(/^на (завтра|сегодня):?\s*/i, "").replace(/\s+в когда-нибудь\.?$/i, "").trim() || `Задача ${index + 1}`, category, date: category === "someday" ? null : baseDate, startTime: category === "someday" ? null : startTime, priority: /срочно|важно/i.test(title) ? "high" : "medium", notes: null }; }) };
  } else {
    result = { actionType: "UNSUPPORTED_REQUEST", draftId, summary: "Запрос не относится к доступным действиям", reason: "Я могу подготовить планы, ДЗ, итоги урока или перенос занятия." };
  }
  return teacherAIDraftSchema.parse(result);
}

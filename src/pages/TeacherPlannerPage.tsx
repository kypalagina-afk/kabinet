import { useMemo, useState, type FormEvent } from "react";
import { Timestamp } from "firebase/firestore";
import { Modal } from "../components/Modal";
import { useAuth } from "../features/auth/AuthProvider";
import { useTeacherPlanner } from "../features/planner/hooks";
import { useTeacherSchedule } from "../features/schedule/hooks";
import { zonedLocalDateTimeToDate } from "../features/schedule/timezone";
import { getFirebaseDb } from "../lib/firebase/client";
import {
  archivePlannerItem,
  createPlannerGoal,
  createPlannerItem,
  createPlannerSubgoal,
  plannerGoalProgress,
  schedulePlannerItem,
  setPlannerItemCompleted,
  setPlannerSubgoalCompleted,
  updatePlannerItem,
  type PlannerItemInput,
} from "../lib/firebase/services/plannerWorkflow";
import { rescheduleLesson } from "../lib/firebase/services/scheduleOperations";
import type {
  DocumentWithId,
  Lesson,
  PlannerCategory,
  PlannerItem,
} from "../lib/firebase/types";

type ViewMode = "day" | "week" | "month";
type DisplayFilter = "all" | "lessons" | "work" | "home" | "personal";

const categoryLabels: Record<PlannerCategory, string> = {
  work: "Работа",
  home: "Дом",
  personal: "Личное",
  someday: "Когда-нибудь",
};

const dayTimeSlots = Array.from({ length: 13 }, (_, index) => `${String(index + 8).padStart(2, "0")}:00`);
const weekTimeSlots = ["09:00", "12:00", "15:00", "18:00"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

function addDays(value: string, amount: number) {
  const date = dateFromKey(value);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function weekDates(value: string) {
  const date = dateFromKey(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(date.getDate() + index);
    return dateKey(day);
  });
}

function monthDates(value: string) {
  const current = dateFromKey(value);
  current.setDate(1);
  const offset = (current.getDay() + 6) % 7;
  current.setDate(current.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(current);
    day.setDate(current.getDate() + index);
    return dateKey(day);
  });
}

function lessonDate(lesson: Lesson) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(lesson.startAt.toDate());
}

function lessonTime(lesson: Lesson) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(lesson.startAt.toDate());
}

const emptyInput = (date: string): PlannerItemInput => ({
  itemType: "task",
  title: "",
  category: "work",
  date,
  startTime: null,
  endTime: null,
  durationMinutes: null,
  deadline: null,
  notes: null,
  goalId: null,
  subgoalId: null,
});

export function TeacherPlannerPage() {
  const { user } = useAuth();
  const teacherId = user?.uid ?? "";
  const [view, setView] = useState<ViewMode>("day");
  const [focusDate, setFocusDate] = useState(() => dateKey(new Date()));
  const [filter, setFilter] = useState<DisplayFilter>("all");
  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentWithId<PlannerItem> | null>(null);
  const [draft, setDraft] = useState<PlannerItemInput>(() => emptyInput(focusDate));
  const [goalOpen, setGoalOpen] = useState(false);
  const [subgoalFor, setSubgoalFor] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const planner = useTeacherPlanner(teacherId);
  const range = useMemo(() => {
    const dates = monthDates(focusDate);
    return {
      start: new Date(`${dates[0]}T00:00:00Z`),
      end: new Date(`${addDays(dates.at(-1)!, 1)}T00:00:00Z`),
    };
  }, [focusDate]);
  const schedule = useTeacherSchedule(teacherId, range);
  const visibleItems = planner.data.items.filter(({ data }) => {
    if (!data.active) return false;
    if (filter === "all" || filter === "lessons") return filter !== "lessons";
    return data.category === filter;
  });
  const lessons = filter === "all" || filter === "lessons" ? schedule.data.lessons : [];
  const selectedDates = view === "day" ? [focusDate] : view === "week" ? weekDates(focusDate) : monthDates(focusDate);

  function openCreate(date = focusDate, startTime: string | null = null, itemType: "event" | "task" = "task") {
    setEditing(null);
    setDraft({ ...emptyInput(date), itemType, startTime, category: itemType === "event" ? "personal" : "work" });
    setItemOpen(true);
  }

  function openEdit(item: DocumentWithId<PlannerItem>) {
    setEditing(item);
    setDraft({
      itemType: item.data.itemType,
      title: item.data.title,
      category: item.data.category,
      date: item.data.date,
      startTime: item.data.startTime,
      endTime: item.data.endTime,
      durationMinutes: item.data.durationMinutes,
      deadline: item.data.deadline,
      notes: item.data.notes,
      goalId: item.data.goalId,
      subgoalId: item.data.subgoalId,
    });
    setItemOpen(true);
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing) await updatePlannerItem(getFirebaseDb(), teacherId, editing.id, draft);
    else await createPlannerItem(getFirebaseDb(), teacherId, draft);
    setItemOpen(false);
    setMessage(editing ? "План обновлён." : "Пункт добавлен в план.");
  }

  async function dropOnDate(event: React.DragEvent, targetDate: string, targetTime: string | null = null) {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/planner-item-id");
    if (itemId) {
      const item = planner.data.items.find(({ id }) => id === itemId);
      await schedulePlannerItem(getFirebaseDb(), teacherId, itemId, targetDate, targetTime ?? item?.data.startTime ?? null);
      return;
    }
    const lessonId = event.dataTransfer.getData("text/planner-lesson-id");
    const lesson = schedule.data.lessons.find(({ id }) => id === lessonId);
    if (!lesson || lesson.data.status !== "planned") return;
    const time = targetTime ?? lessonTime(lesson.data);
    const start = zonedLocalDateTimeToDate(targetDate, time, "Europe/Moscow");
    const duration = lesson.data.endAt.toMillis() - lesson.data.startAt.toMillis();
    await rescheduleLesson(getFirebaseDb(), {
      lessonId,
      newStartAt: Timestamp.fromDate(start),
      newEndAt: Timestamp.fromMillis(start.getTime() + duration),
    });
    setMessage("Занятие перенесено через общий календарный workflow.");
  }

  return (
    <main className="shell-content planner-page" aria-labelledby="planner-title">
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Личное пространство преподавателя</p>
          <h1 id="planner-title">Планер</h1>
          <p>Уроки, работа и личные планы в одном календаре. Личные записи ученикам не видны.</p>
        </div>
        <div className="form-actions">
          <button className="secondary-button" onClick={() => setGoalOpen(true)} type="button">+ Большая цель</button>
          <button className="primary-button primary-button--fit" onClick={() => openCreate()} type="button">+ Добавить</button>
        </div>
      </header>
      {planner.error || schedule.error ? <p className="shell-notice">{planner.error ?? schedule.error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}

      <section className="planner-toolbar">
        <div className="segmented-control" aria-label="Вид планера">
          {(["day", "week", "month"] as const).map((mode) => <button aria-pressed={view === mode} key={mode} onClick={() => setView(mode)} type="button">{{ day: "День", week: "Неделя", month: "Месяц" }[mode]}</button>)}
        </div>
        <div className="planner-date-nav">
          <button className="icon-button" onClick={() => setFocusDate(addDays(focusDate, view === "day" ? -1 : view === "week" ? -7 : -28))} type="button">←</button>
          <input aria-label="Дата планера" onChange={(event) => setFocusDate(event.target.value)} type="date" value={focusDate} />
          <button className="icon-button" onClick={() => setFocusDate(addDays(focusDate, view === "day" ? 1 : view === "week" ? 7 : 28))} type="button">→</button>
          <button className="secondary-button" onClick={() => setFocusDate(dateKey(new Date()))} type="button">Сегодня</button>
        </div>
        <div className="planner-filter" aria-label="Фильтр планера">
          {(["all", "lessons", "work", "home", "personal"] as const).map((value) => <button aria-pressed={filter === value} key={value} onClick={() => setFilter(value)} type="button">{{ all: "Все", lessons: "Уроки", work: "Работа", home: "Дом", personal: "Личное" }[value]}</button>)}
        </div>
      </section>

      <div className="planner-workspace">
        <section className={`planner-calendar planner-calendar--${view}`} data-testid={`planner-${view}`}>
          {view === "month" ? <div className="planner-month-weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}</div> : null}
          <div className="planner-days">
            {selectedDates.map((date) => {
              const dayItems = visibleItems.filter(({ data }) => data.date === date);
              const dayLessons = lessons.filter(({ data }) => lessonDate(data) === date);
              const timed = dayItems.filter(({ data }) => data.startTime).sort((left, right) => (left.data.startTime ?? "").localeCompare(right.data.startTime ?? ""));
              const untimed = dayItems.filter(({ data }) => !data.startTime);
              return <article className={`planner-day${date === focusDate ? " planner-day--selected" : ""}`} key={date} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void dropOnDate(event, date)}>
                <header><button onClick={() => { setFocusDate(date); setView("day"); }} type="button"><strong>{new Intl.DateTimeFormat("ru-RU", { weekday: view === "month" ? undefined : "long", day: "numeric", month: view === "month" ? undefined : "long" }).format(dateFromKey(date))}</strong></button><button aria-label={`Добавить план ${date}`} onClick={() => openCreate(date)} type="button">+</button></header>
                <div className="planner-timed-items">
                  {dayLessons.slice(0, view === "month" ? 2 : undefined).map((lesson) => <PlannerLesson key={lesson.id} lesson={lesson} studentName={schedule.data.students.find(({ id }) => id === lesson.data.studentId)?.data.displayName} />)}
                  {timed.slice(0, view === "month" ? 2 : undefined).map((item) => <PlannerCard item={item} key={item.id} onEdit={() => openEdit(item)} onToggle={() => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")} />)}
                  {view === "month" && dayLessons.length + timed.length > 4 ? <small>+ ещё {dayLessons.length + timed.length - 4}</small> : null}
                </div>
                {view !== "month" ? <div className="planner-time-slots" aria-label={`Свободное время ${date}`}>{(view === "day" ? dayTimeSlots : weekTimeSlots).map((time) => <button aria-label={`Добавить на ${date} в ${time}`} key={time} onClick={() => openCreate(date, time, "event")} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); void dropOnDate(event, date, time); }} type="button"><time>{time}</time><span>+</span></button>)}</div> : null}
                {view !== "month" ? <div className="planner-untimed"><span>Без времени</span>{untimed.map((item) => <PlannerCard item={item} key={item.id} onEdit={() => openEdit(item)} onToggle={() => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")} />)}<button className="planner-inline-add" onClick={() => openCreate(date, null, "task")} type="button">+ Задача без времени</button></div> : untimed.length ? <small className="planner-task-count">Задач: {untimed.length}</small> : null}
              </article>;
            })}
          </div>
        </section>

        <aside className="planner-sidebar">
          <section data-testid="planner-someday">
            <div className="section-heading"><div><p className="eyebrow">Backlog</p><h2>Когда-нибудь</h2></div><button onClick={() => { setEditing(null); setDraft({ ...emptyInput(""), category: "someday", date: null }); setItemOpen(true); }} type="button">+</button></div>
            {planner.data.items.filter(({ data }) => data.active && data.category === "someday" && !data.date).map((item) => <div className="someday-item" draggable key={item.id} onDragStart={(event) => event.dataTransfer.setData("text/planner-item-id", item.id)}><span>{item.data.title}</span><div><button onClick={() => void schedulePlannerItem(getFirebaseDb(), teacherId, item.id, dateKey(new Date()), null)} type="button">Сегодня</button><button onClick={() => void schedulePlannerItem(getFirebaseDb(), teacherId, item.id, addDays(dateKey(new Date()), 1), null)} type="button">Завтра</button></div></div>)}
          </section>
          <section data-testid="planner-goals">
            <div className="section-heading"><div><p className="eyebrow">Направление</p><h2>Большие цели</h2></div></div>
            {planner.data.goals.filter(({ data }) => data.status !== "archived").map((goal) => {
              const progress = plannerGoalProgress(goal.id, planner.data.subgoals, planner.data.items);
              return <article className="planner-goal" key={goal.id}><h3>{goal.data.title}</h3><p>{progress.completed} из {progress.total} шагов выполнено</p><progress max={100} value={progress.percent} />
                {planner.data.subgoals.filter(({ data }) => data.goalId === goal.id).map((subgoal) => <div className="planner-subgoal" key={subgoal.id}><label><input checked={subgoal.data.status === "completed"} onChange={(event) => void setPlannerSubgoalCompleted(getFirebaseDb(), teacherId, subgoal.id, event.target.checked)} type="checkbox" />{subgoal.data.title}</label><button onClick={() => { setEditing(null); setDraft({ ...emptyInput(focusDate), goalId: goal.id, subgoalId: subgoal.id }); setItemOpen(true); }} type="button">Запланировать</button></div>)}
                <button className="planner-link-button" onClick={() => setSubgoalFor(goal.id)} type="button">+ Подцель</button>
              </article>;
            })}
          </section>
        </aside>
      </div>

      {itemOpen ? <Modal className="planner-item-modal" onClose={() => setItemOpen(false)} title={editing ? "Изменить план" : "Новый пункт плана"}><form className="modal-form" onSubmit={(event) => void saveItem(event)}>
        <div className="segmented-control"><button aria-pressed={draft.itemType === "task"} onClick={() => setDraft({ ...draft, itemType: "task" })} type="button">Задача</button><button aria-pressed={draft.itemType === "event"} onClick={() => setDraft({ ...draft, itemType: "event" })} type="button">Событие</button></div>
        <label className="form-field"><span>Название</span><input autoFocus onChange={(event) => setDraft({ ...draft, title: event.target.value })} required value={draft.title} /></label>
        <div className="form-grid"><label className="form-field"><span>Категория</span><select onChange={(event) => setDraft({ ...draft, category: event.target.value as PlannerCategory })} value={draft.category}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>Дата</span><input onChange={(event) => setDraft({ ...draft, date: event.target.value || null })} required={draft.itemType === "event"} type="date" value={draft.date ?? ""} /></label><label className="form-field"><span>Время начала</span><input onChange={(event) => setDraft({ ...draft, startTime: event.target.value || null })} type="time" value={draft.startTime ?? ""} /></label><label className="form-field"><span>Время окончания</span><input disabled={!draft.startTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value || null })} type="time" value={draft.endTime ?? ""} /></label><label className="form-field"><span>Длительность, минут</span><input disabled={!draft.startTime} min="1" onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value ? Number(event.target.value) : null })} type="number" value={draft.durationMinutes ?? ""} /></label><label className="form-field"><span>Дедлайн</span><input onChange={(event) => setDraft({ ...draft, deadline: event.target.value || null })} type="date" value={draft.deadline ?? ""} /></label></div>
        <label className="form-field"><span>Заметки</span><textarea onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })} rows={3} value={draft.notes ?? ""} /></label>
        <div className="form-actions"><button className="primary-button primary-button--fit">{editing ? "Сохранить" : "Добавить"}</button>{editing ? <button className="secondary-button" onClick={() => { if (confirm("Удалить этот пункт из планера?")) void archivePlannerItem(getFirebaseDb(), teacherId, editing.id).then(() => setItemOpen(false)); }} type="button">Удалить</button> : null}<button className="secondary-button" onClick={() => setItemOpen(false)} type="button">Отмена</button></div>
      </form></Modal> : null}

      {goalOpen ? <Modal onClose={() => setGoalOpen(false)} title="Большая цель"><form className="modal-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void createPlannerGoal(getFirebaseDb(), teacherId, { title: String(form.get("title")), description: String(form.get("description")) || null, targetDate: String(form.get("targetDate")) || null }).then(() => setGoalOpen(false)); }}><label className="form-field"><span>Название</span><input name="title" required /></label><label className="form-field"><span>Описание</span><textarea name="description" /></label><label className="form-field"><span>Целевая дата</span><input name="targetDate" type="date" /></label><button className="primary-button primary-button--fit">Создать цель</button></form></Modal> : null}
      {subgoalFor ? <Modal onClose={() => setSubgoalFor(null)} title="Новая подцель"><form className="modal-form" onSubmit={(event) => { event.preventDefault(); const title = String(new FormData(event.currentTarget).get("title")); void createPlannerSubgoal(getFirebaseDb(), teacherId, subgoalFor, title).then(() => setSubgoalFor(null)); }}><label className="form-field"><span>Название</span><input name="title" required /></label><button className="primary-button primary-button--fit">Добавить подцель</button></form></Modal> : null}
    </main>
  );
}

function PlannerLesson({ lesson, studentName }: { lesson: DocumentWithId<Lesson>; studentName?: string }) {
  return <article className="planner-entry planner-entry--lesson" draggable={lesson.data.status === "planned"} onDragStart={(event) => event.dataTransfer.setData("text/planner-lesson-id", lesson.id)}><span>🎓 Урок</span><strong>{lessonTime(lesson.data)} · {studentName ?? "Ученик"}</strong><small>{lesson.data.topic ?? "Тема не указана"}</small></article>;
}

function PlannerCard({ item, onEdit, onToggle }: { item: DocumentWithId<PlannerItem>; onEdit(): void; onToggle(): void }) {
  return <article className={`planner-entry planner-entry--${item.data.category}${item.data.status === "done" ? " planner-entry--done" : ""}`} draggable onDragStart={(event) => event.dataTransfer.setData("text/planner-item-id", item.id)}><button aria-label={item.data.status === "done" ? "Вернуть задачу" : "Выполнить задачу"} className="planner-check" onClick={onToggle} type="button">{item.data.status === "done" ? "✓" : "○"}</button><button className="planner-entry-copy" onClick={onEdit} type="button"><span>{item.data.itemType === "event" ? "◆" : "□"} {categoryLabels[item.data.category]}</span><strong>{item.data.startTime ? `${item.data.startTime} · ` : ""}{item.data.title}</strong></button></article>;
}

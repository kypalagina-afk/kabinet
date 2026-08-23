import { useMemo, useState, type FormEvent } from "react";
import { Timestamp } from "firebase/firestore";
import { Modal } from "../components/Modal";
import { useAuth } from "../features/auth/AuthProvider";
import { useTeacherPlanner } from "../features/planner/hooks";
import { useTeacherSchedule } from "../features/schedule/hooks";
import { addCalendarDays, calendarVisibleDates } from "../features/schedule/calendarRange";
import {
  dateKeyForTimezone,
  dateRangeForTimezone,
  formatDateTimeForTimezone,
  resolveTimezone,
  zonedLocalDateTimeToDate,
  type ResolvedTimezone,
} from "../features/schedule/timezone";
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
  PlannerPriority,
} from "../lib/firebase/types";

type ViewMode = "day" | "week" | "month";
type DisplayFilter = "all" | "lessons" | "work" | "home";

const categoryLabels: Record<PlannerCategory, string> = {
  work: "Работа",
  home: "Дом",
  personal: "Дом / личное",
  someday: "Когда-нибудь",
};

const priorityLabels: Record<PlannerPriority, string> = {
  high: "Высокий",
  medium: "Средний",
  calm: "Спокойный",
};

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

function lessonDate(lesson: Lesson, timezone: ResolvedTimezone) {
  return dateKeyForTimezone(lesson.startAt.toDate(), timezone);
}

function lessonTime(lesson: Lesson, timezone: ResolvedTimezone) {
  return formatDateTimeForTimezone(lesson.startAt.toDate(), timezone, {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  priority: "calm",
  goalId: null,
  subgoalId: null,
});

export function TeacherPlannerPage() {
  const { user, profile } = useAuth();
  const teacherId = user?.uid ?? "";
  const teacherTimezone = useMemo(() => resolveTimezone(profile?.timezone), [profile?.timezone]);
  const [view, setViewState] = useState<ViewMode>(() =>
    (localStorage.getItem("teacher-planner-view") as ViewMode | null) ?? "day",
  );
  const [focusDate, setFocusDate] = useState(() => dateKey(new Date()));
  const [filter, setFilter] = useState<DisplayFilter>("all");
  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentWithId<PlannerItem> | null>(null);
  const [draft, setDraft] = useState<PlannerItemInput>(() => emptyInput(focusDate));
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalsWorkspaceOpen, setGoalsWorkspaceOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [subgoalFor, setSubgoalFor] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const planner = useTeacherPlanner(teacherId);
  const range = useMemo(() => {
    const dates = calendarVisibleDates(view, focusDate);
    return dateRangeForTimezone(dates[0]!, addCalendarDays(dates.at(-1)!, 1), teacherTimezone);
  }, [focusDate, teacherTimezone, view]);
  const schedule = useTeacherSchedule(teacherId, range);
  const visibleItems = planner.data.items.filter(({ data }) => {
    if (!data.active) return false;
    if (filter === "all" || filter === "lessons") return filter !== "lessons";
    return filter === "home"
      ? data.category === "home" || data.category === "personal"
      : data.category === filter;
  });
  const lessons = filter === "all" || filter === "lessons" ? schedule.data.lessons : [];
  const selectedDates = view === "day" ? [focusDate] : view === "week" ? weekDates(focusDate) : monthDates(focusDate);
  const focusItems = visibleItems.filter(({ data }) => data.date === focusDate);
  const focusLessons = lessons.filter(({ data }) => lessonDate(data, teacherTimezone) === focusDate);
  const backlogItems = planner.data.items.filter(
    ({ data }) => data.active && data.category === "someday" && !data.date,
  );
  const activeGoals = planner.data.goals.filter(({ data }) => data.status !== "archived");
  const workspaceGoalId = selectedGoalId ?? activeGoals[0]?.id ?? null;
  const setView = (value: ViewMode) => {
    setViewState(value);
    localStorage.setItem("teacher-planner-view", value);
  };

  function openCreate(date = focusDate, startTime: string | null = null, itemType: "event" | "task" = "task") {
    setEditing(null);
    setDraft({ ...emptyInput(date), itemType, startTime, category: itemType === "event" ? "home" : "work" });
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
      priority: item.data.priority ?? "calm",
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
    const time = targetTime ?? lessonTime(lesson.data, teacherTimezone);
    const start = zonedLocalDateTimeToDate(targetDate, time, teacherTimezone.iana ?? "Europe/Moscow");
    const duration = lesson.data.endAt.toMillis() - lesson.data.startAt.toMillis();
    await rescheduleLesson(getFirebaseDb(), {
      lessonId,
      newStartAt: Timestamp.fromDate(start),
      newEndAt: Timestamp.fromMillis(start.getTime() + duration),
    });
    setMessage("Занятие перенесено через общий календарный workflow.");
  }

  function todayKey() {
    return dateKeyForTimezone(new Date(), teacherTimezone);
  }

  function moveBacklog(item: DocumentWithId<PlannerItem>, category: "work" | "home") {
    return schedulePlannerItem(getFirebaseDb(), teacherId, item.id, focusDate, item.data.startTime, category);
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
          <button className="secondary-button" onClick={() => setFocusDate(todayKey())} type="button">Сегодня</button>
        </div>
        <div className="planner-filter" aria-label="Фильтр планера">
          {(["all", "lessons", "work", "home"] as const).map((value) => <button aria-pressed={filter === value} key={value} onClick={() => setFilter(value)} type="button">{{ all: "Все", lessons: "Уроки", work: "Работа", home: "Дом" }[value]}</button>)}
        </div>
      </section>

      <div className="planner-workspace">
        <section className={`planner-calendar planner-calendar--${view}`} data-testid={`planner-${view}`}>
          {view === "day" ? (
            <div className="planner-category-board" data-testid="planner-day-category-board">
              <PlannerCategoryColumn
                emoji="💼"
                items={focusItems.filter(({ data }) => data.category === "work")}
                lessons={focusLessons}
                onCreate={() => { setEditing(null); setDraft({ ...emptyInput(focusDate), category: "work" }); setItemOpen(true); }}
                onEdit={openEdit}
                onToggle={(item) => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")}
                title="Работа"
                timezone={teacherTimezone}
              />
              <PlannerCategoryColumn
                emoji="🏠"
                items={focusItems.filter(({ data }) => data.category === "home" || data.category === "personal")}
                lessons={[]}
                onCreate={() => { setEditing(null); setDraft({ ...emptyInput(focusDate), category: "home" }); setItemOpen(true); }}
                onEdit={openEdit}
                onToggle={(item) => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")}
                title="Дом"
                timezone={teacherTimezone}
              />
              <PlannerCategoryColumn
                emoji="🌙"
                items={backlogItems}
                lessons={[]}
                onCreate={() => { setEditing(null); setDraft({ ...emptyInput(""), category: "someday", date: null }); setItemOpen(true); }}
                onEdit={openEdit}
                onToggle={(item) => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")}
                title="Когда-нибудь"
                timezone={teacherTimezone}
              />
            </div>
          ) : (
            <>
              {view === "month" ? <div className="planner-month-weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}</div> : null}
              <div className="planner-days">
                {selectedDates.map((date) => {
              const dayItems = visibleItems.filter(({ data }) => data.date === date);
              const dayLessons = lessons.filter(({ data }) => lessonDate(data, teacherTimezone) === date);
              const timed = dayItems.filter(({ data }) => data.startTime).sort((left, right) => (left.data.startTime ?? "").localeCompare(right.data.startTime ?? ""));
              const untimed = dayItems.filter(({ data }) => !data.startTime);
              return <article className={`planner-day${date === focusDate ? " planner-day--selected" : ""}`} key={date} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void dropOnDate(event, date)}>
                <header><button onClick={() => { setFocusDate(date); setView("day"); }} type="button"><strong>{new Intl.DateTimeFormat("ru-RU", { weekday: view === "month" ? undefined : "long", day: "numeric", month: view === "month" ? undefined : "long" }).format(dateFromKey(date))}</strong></button><button aria-label={`Добавить план ${date}`} onClick={() => openCreate(date)} type="button">+</button></header>
                <div className="planner-timed-items">
                  {dayLessons.slice(0, view === "month" ? 2 : undefined).map((lesson) => <PlannerLesson key={lesson.id} lesson={lesson} studentName={schedule.data.students.find(({ id }) => id === lesson.data.studentId)?.data.displayName} timezone={teacherTimezone} />)}
                  {timed.slice(0, view === "month" ? 2 : undefined).map((item) => <PlannerCard item={item} key={item.id} onEdit={() => openEdit(item)} onToggle={() => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")} />)}
                  {view === "month" && dayLessons.length + timed.length > 4 ? <small>+ ещё {dayLessons.length + timed.length - 4}</small> : null}
                </div>
                {view !== "month" ? <div className="planner-time-slots" aria-label={`Свободное время ${date}`}>{weekTimeSlots.map((time) => <button aria-label={`Добавить на ${date} в ${time}`} key={time} onClick={() => openCreate(date, time, "event")} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); void dropOnDate(event, date, time); }} type="button"><time>{time}</time><span>+</span></button>)}</div> : null}
                {view !== "month" ? <div className="planner-untimed"><span>Без времени</span>{untimed.map((item) => <PlannerCard item={item} key={item.id} onEdit={() => openEdit(item)} onToggle={() => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")} />)}<button className="planner-inline-add" onClick={() => openCreate(date, null, "task")} type="button">+ Задача без времени</button></div> : untimed.length ? <small className="planner-task-count">Задач: {untimed.length}</small> : null}
              </article>;
                })}
              </div>
            </>
          )}
        </section>

        <aside className="planner-sidebar">
          {view !== "day" ? <section data-testid="planner-someday">
            <div className="section-heading"><div><p className="eyebrow">Backlog</p><h2>Когда-нибудь</h2></div><button onClick={() => { setEditing(null); setDraft({ ...emptyInput(""), category: "someday", date: null }); setItemOpen(true); }} type="button">+</button></div>
            {backlogItems.map((item) => <div className="someday-item" draggable key={item.id} onDragStart={(event) => event.dataTransfer.setData("text/planner-item-id", item.id)}><span>{item.data.title}</span><div><button onClick={() => void schedulePlannerItem(getFirebaseDb(), teacherId, item.id, todayKey(), null, "work")} type="button">Сегодня</button><button onClick={() => void schedulePlannerItem(getFirebaseDb(), teacherId, item.id, addDays(todayKey(), 1), null, "work")} type="button">Завтра</button><button onClick={() => void moveBacklog(item, "work")} type="button">В работу</button><button onClick={() => void moveBacklog(item, "home")} type="button">Дом</button><button onClick={() => openEdit(item)} type="button">Дата и время…</button></div></div>)}
          </section> : null}
          <section data-testid="planner-goals">
            <div className="section-heading"><button className="planner-goals-open" onClick={() => { setSelectedGoalId(planner.data.goals.find(({ data }) => data.status !== "archived")?.id ?? null); setGoalsWorkspaceOpen(true); }} type="button"><span><span className="eyebrow">Направление</span><strong>Большие цели</strong></span><span aria-hidden="true">→</span></button></div>
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
        <div className="segmented-control"><button aria-pressed={draft.itemType === "task"} onClick={() => setDraft({ ...draft, itemType: "task", category: draft.category === "personal" ? "home" : draft.category })} type="button">Задача</button><button aria-pressed={draft.itemType === "event"} onClick={() => setDraft({ ...draft, itemType: "event", category: draft.category === "someday" ? "work" : draft.category })} type="button">Событие</button></div>
        <label className="form-field"><span>Название</span><input autoFocus onChange={(event) => setDraft({ ...draft, title: event.target.value })} required value={draft.title} /></label>
        <div className="form-grid"><label className="form-field"><span>Категория</span><select onChange={(event) => { const category = event.target.value as PlannerCategory; setDraft({ ...draft, category, ...(category === "someday" ? { date: null, startTime: null, endTime: null, durationMinutes: null } : {}) }); }} value={draft.category}>{(draft.itemType === "task" ? ["work", "home", "someday"] : ["work", "home"]).map((value) => <option key={value} value={value}>{categoryLabels[value as PlannerCategory]}</option>)}</select></label><label className="form-field"><span>Приоритет</span><select onChange={(event) => setDraft({ ...draft, priority: event.target.value as PlannerPriority })} value={draft.priority}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>Дата</span><input disabled={draft.category === "someday"} onChange={(event) => setDraft({ ...draft, date: event.target.value || null })} required={draft.category !== "someday"} type="date" value={draft.date ?? ""} /></label><label className="form-field"><span>Время начала</span><input disabled={draft.category === "someday"} onChange={(event) => setDraft({ ...draft, startTime: event.target.value || null })} type="time" value={draft.startTime ?? ""} /></label><label className="form-field"><span>Время окончания</span><input disabled={!draft.startTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value || null })} type="time" value={draft.endTime ?? ""} /></label><label className="form-field"><span>Длительность, минут</span><input disabled={!draft.startTime} min="1" onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value ? Number(event.target.value) : null })} type="number" value={draft.durationMinutes ?? ""} /></label><label className="form-field"><span>Дедлайн</span><input onChange={(event) => setDraft({ ...draft, deadline: event.target.value || null })} type="date" value={draft.deadline ?? ""} /></label></div>
        <label className="form-field"><span>Заметки</span><textarea onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })} rows={3} value={draft.notes ?? ""} /></label>
        <div className="form-actions"><button className="primary-button primary-button--fit">{editing ? "Сохранить" : "Добавить"}</button>{editing ? <button className="secondary-button" onClick={() => { if (confirm("Удалить этот пункт из планера?")) void archivePlannerItem(getFirebaseDb(), teacherId, editing.id).then(() => setItemOpen(false)); }} type="button">Удалить</button> : null}<button className="secondary-button" onClick={() => setItemOpen(false)} type="button">Отмена</button></div>
      </form></Modal> : null}

      {goalOpen ? <Modal onClose={() => setGoalOpen(false)} title="Большая цель"><form className="modal-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void createPlannerGoal(getFirebaseDb(), teacherId, { title: String(form.get("title")), description: String(form.get("description")) || null, targetDate: String(form.get("targetDate")) || null }).then(() => setGoalOpen(false)); }}><label className="form-field"><span>Название</span><input name="title" required /></label><label className="form-field"><span>Описание</span><textarea name="description" /></label><label className="form-field"><span>Целевая дата</span><input name="targetDate" type="date" /></label><button className="primary-button primary-button--fit">Создать цель</button></form></Modal> : null}
      {goalsWorkspaceOpen ? <Modal className="planner-goals-modal" onClose={() => setGoalsWorkspaceOpen(false)} title="Большие цели"><div className="goals-workspace" data-testid="planner-goals-workspace"><nav aria-label="Большие цели">{activeGoals.map((goal) => <button aria-pressed={workspaceGoalId === goal.id} key={goal.id} onClick={() => setSelectedGoalId(goal.id)} type="button">{goal.data.title}</button>)}<button className="planner-link-button" onClick={() => setGoalOpen(true)} type="button">+ Новая цель</button></nav>{activeGoals.filter(({ id }) => id === workspaceGoalId).map((goal) => { const progress = plannerGoalProgress(goal.id, planner.data.subgoals, planner.data.items); return <section className="goal-workspace-detail" key={goal.id}><p className="eyebrow">Цель → подцели → задачи → планер</p><h3>{goal.data.title}</h3>{goal.data.description ? <p>{goal.data.description}</p> : null}{goal.data.targetDate ? <p>До {new Intl.DateTimeFormat("ru-RU").format(dateFromKey(goal.data.targetDate))}</p> : null}<strong>{progress.completed} из {progress.total} шагов</strong><progress max={100} value={progress.percent} />{planner.data.subgoals.filter(({ data }) => data.goalId === goal.id).map((subgoal) => <article className="goal-subgoal-card" key={subgoal.id}><label><input checked={subgoal.data.status === "completed"} onChange={(event) => void setPlannerSubgoalCompleted(getFirebaseDb(), teacherId, subgoal.id, event.target.checked)} type="checkbox" /><strong>{subgoal.data.title}</strong></label>{subgoal.data.notes ? <p>{subgoal.data.notes}</p> : null}<div className="goal-task-list">{planner.data.items.filter(({ data }) => data.active && data.subgoalId === subgoal.id).map((item) => <PlannerCard item={item} key={item.id} onEdit={() => openEdit(item)} onToggle={() => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")} />)}</div><button className="secondary-button" onClick={() => { setEditing(null); setDraft({ ...emptyInput(focusDate), goalId: goal.id, subgoalId: subgoal.id }); setItemOpen(true); }} type="button">+ Задача в планер</button></article>)}<button className="planner-link-button" onClick={() => setSubgoalFor(goal.id)} type="button">+ Подцель</button></section>; })}</div></Modal> : null}
      {subgoalFor ? <Modal onClose={() => setSubgoalFor(null)} title="Новая подцель"><form className="modal-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void createPlannerSubgoal(getFirebaseDb(), teacherId, subgoalFor, String(form.get("title")), String(form.get("notes")) || null).then(() => setSubgoalFor(null)); }}><label className="form-field"><span>Название</span><input name="title" required /></label><label className="form-field"><span>Заметки</span><textarea name="notes" /></label><button className="primary-button primary-button--fit">Добавить подцель</button></form></Modal> : null}
    </main>
  );
}

function PlannerLesson({ lesson, studentName, timezone }: { lesson: DocumentWithId<Lesson>; studentName?: string; timezone: ResolvedTimezone }) {
  const duration = Math.round((lesson.data.endAt.toMillis() - lesson.data.startAt.toMillis()) / 60_000);
  return <article className="planner-entry planner-entry--lesson" draggable={lesson.data.status === "planned"} onDragStart={(event) => event.dataTransfer.setData("text/planner-lesson-id", lesson.id)}><span>🎓 Урок из календаря</span><strong>{lessonTime(lesson.data, timezone)} · {studentName ?? "Ученик"}</strong><small>{lesson.data.topic ?? "Тема не указана"} · ≈ {duration} мин</small></article>;
}

function PlannerCard({ item, onEdit, onToggle }: { item: DocumentWithId<PlannerItem>; onEdit(): void; onToggle(): void }) {
  const priority = item.data.priority ?? "calm";
  return <article className={`planner-entry planner-entry--${item.data.category} planner-entry--priority-${priority}${item.data.status === "done" ? " planner-entry--done" : ""}`} draggable onDragStart={(event) => event.dataTransfer.setData("text/planner-item-id", item.id)}><button aria-label={item.data.status === "done" ? "Вернуть задачу" : "Выполнить задачу"} className="planner-check" onClick={onToggle} type="button">{item.data.status === "done" ? "✓" : "○"}</button><button className="planner-entry-copy" onClick={onEdit} type="button"><span>{priority === "high" ? "🔴" : priority === "medium" ? "🟠" : "🟢"} {item.data.itemType === "event" ? "Событие" : categoryLabels[item.data.category]}</span><strong>{item.data.startTime ? `${item.data.startTime} — ` : ""}{item.data.title}{item.data.durationMinutes ? ` · ≈ ${item.data.durationMinutes} мин` : ""}</strong>{item.data.notes ? <small>{item.data.notes}</small> : null}</button></article>;
}

function PlannerCategoryColumn({ emoji, title, items, lessons, timezone, onCreate, onEdit, onToggle }: { emoji: string; title: string; items: Array<DocumentWithId<PlannerItem>>; lessons: Array<DocumentWithId<Lesson>>; timezone: ResolvedTimezone; onCreate(): void; onEdit(item: DocumentWithId<PlannerItem>): void; onToggle(item: DocumentWithId<PlannerItem>): void }) {
  return <section className="planner-category-column" data-category={title}><header><h2>{emoji} {title}</h2><button aria-label={`Добавить в ${title}`} onClick={onCreate} type="button">+</button></header><div className="planner-category-list">{lessons.map((lesson) => <PlannerLesson key={lesson.id} lesson={lesson} timezone={timezone} />)}{items.sort((left, right) => (left.data.startTime ?? "99:99").localeCompare(right.data.startTime ?? "99:99")).map((item) => <PlannerCard item={item} key={item.id} onEdit={() => onEdit(item)} onToggle={() => onToggle(item)} />)}{!lessons.length && !items.length ? <p className="content-state">Пока пусто</p> : null}</div></section>;
}

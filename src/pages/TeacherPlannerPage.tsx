import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Timestamp } from "firebase/firestore";
import { Modal } from "../components/Modal";
import { AIShortcutButton } from "../features/ai/AIShortcutButton";
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
  archiveRecurringPlannerTaskScope,
  createPlannerGoal,
  createPlannerItem,
  createRecurringPlannerTask,
  createPlannerSubgoal,
  materializePlannerRecurrence,
  plannerGoalProgress,
  schedulePlannerItem,
  setPlannerItemCompleted,
  setPlannerSubgoalCompleted,
  updatePlannerItem,
  updateRecurringPlannerTaskScope,
  type PlannerItemInput,
  type PlannerRecurrenceInput,
  type PlannerRecurrenceScope,
} from "../lib/firebase/services/plannerWorkflow";
import { isPlannerRecurrenceTemplate } from "../features/planner/recurrence";
import { plannerCategoryCounts, sortPlannerItems } from "../features/planner/sorting";
import {
  plannerIntervalEnd,
  plannerMinutesToTime,
  plannerTimeToMinutes,
  plannerTimelineBounds,
} from "../features/planner/timeline";
import {
  carryForwardOneOffPlannerItems,
  cleanupCompletedOneOffPlannerItems,
} from "../lib/firebase/services/plannerMaintenance";
import { rescheduleLesson } from "../lib/firebase/services/scheduleOperations";
import type {
  DocumentWithId,
  Lesson,
  PlannerCategory,
  PlannerItem,
  PlannerPriority,
  PlannerRecurrencePattern,
  Student,
} from "../lib/firebase/types";

type ViewMode = "day" | "week" | "month" | "timeline";
type DisplayFilter = "all" | "work" | "home";

const categoryLabels: Record<PlannerCategory, string> = {
  work: "Работа",
  home: "Дом",
  personal: "Дом / личное",
  someday: "Когда-нибудь",
};

const priorityLabels: Record<"high" | "medium" | "low", string> = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const emptyRecurrence = (): PlannerRecurrenceInput => ({
  pattern: "weekdays",
  weekdays: [1, 2, 3, 4, 5],
  startsOn: "",
  endsOn: null,
});

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

function lessonEndTime(lesson: Lesson, timezone: ResolvedTimezone) {
  return formatDateTimeForTimezone(lesson.endAt.toDate(), timezone, {
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
  priority: "medium",
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
  const [recurring, setRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<PlannerRecurrenceInput>(emptyRecurrence);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalsWorkspaceOpen, setGoalsWorkspaceOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [subgoalFor, setSubgoalFor] = useState<string | null>(null);
  const [recurrenceAction, setRecurrenceAction] = useState<"save" | "delete" | null>(null);
  const [backlogExpanded, setBacklogExpanded] = useState(
    () => localStorage.getItem("teacher-planner-backlog-expanded") === "true",
  );
  const [message, setMessage] = useState("");
  const planner = useTeacherPlanner(teacherId);
  const range = useMemo(() => {
    const dates = calendarVisibleDates(view === "timeline" ? "day" : view, focusDate);
    return dateRangeForTimezone(dates[0]!, addCalendarDays(dates.at(-1)!, 1), teacherTimezone);
  }, [focusDate, teacherTimezone, view]);
  const schedule = useTeacherSchedule(teacherId, range);
  const visibleItems = planner.data.items.filter(({ data }) => {
    if (!data.active || isPlannerRecurrenceTemplate(data)) return false;
    if (filter === "all") return true;
    return filter === "home"
      ? data.category === "home" || data.category === "personal"
      : data.category === filter;
  });
  const lessons = filter === "all" || filter === "work" ? schedule.data.lessons : [];
  const selectedDates = view === "day" || view === "timeline" ? [focusDate] : view === "week" ? weekDates(focusDate) : monthDates(focusDate);
  const focusItems = visibleItems.filter(({ data }) => data.date === focusDate);
  const focusLessons = lessons.filter(({ data }) => lessonDate(data, teacherTimezone) === focusDate);
  const backlogItems = planner.data.items.filter(
    ({ data }) => data.active && !isPlannerRecurrenceTemplate(data) && data.category === "someday" && !data.date,
  );
  const activeGoals = planner.data.goals.filter(({ data }) => data.status !== "archived");
  const workspaceGoalId = selectedGoalId ?? activeGoals[0]?.id ?? null;
  const setView = (value: ViewMode) => {
    setViewState(value);
    localStorage.setItem("teacher-planner-view", value);
  };

  const recurrenceSignature = useMemo(() => planner.data.items
    .filter(({ data }) => data.active && isPlannerRecurrenceTemplate(data) && data.recurrence)
    .map(({ id, data }) => `${id}:${data.recurrence?.materializedThrough ?? ""}`)
    .sort()
    .join("|"), [planner.data.items]);
  const recurrenceTemplateIds = useMemo(() => recurrenceSignature
    .split("|")
    .filter(Boolean)
    .map((value) => value.split(":", 1)[0]!), [recurrenceSignature]);
  const currentDate = dateKeyForTimezone(new Date(), teacherTimezone);

  useEffect(() => {
    if (!teacherId || !recurrenceSignature) return;
    void Promise.all(
      recurrenceTemplateIds.map((id) =>
        materializePlannerRecurrence(getFirebaseDb(), teacherId, id, currentDate)
      ),
    ).catch(() => setMessage("Не удалось продлить одну из регулярных задач."));
  }, [currentDate, recurrenceSignature, recurrenceTemplateIds, teacherId]);

  useEffect(() => {
    if (!teacherId || planner.loading) return;
    let cancelled = false;
    const cleanupMarker = `teacher-planner-cleanup:${teacherId}:${currentDate.slice(0, 7)}`;
    void (async () => {
      const carried = await carryForwardOneOffPlannerItems(
        getFirebaseDb(),
        teacherId,
        planner.data.items,
        currentDate,
      );
      let deleted = 0;
      if (localStorage.getItem(cleanupMarker) !== "done") {
        deleted = await cleanupCompletedOneOffPlannerItems(
          getFirebaseDb(),
          teacherId,
          planner.data.items,
          currentDate,
        );
        localStorage.setItem(cleanupMarker, "done");
      }
      if (!cancelled && (carried || deleted)) {
        setMessage([
          carried ? `Перенесено на сегодня: ${carried}.` : "",
          deleted ? `Очищено завершённых старых задач: ${deleted}.` : "",
        ].filter(Boolean).join(" "));
      }
    })().catch(() => {
      if (!cancelled) setMessage("Не удалось выполнить автоматическое обслуживание личного планера.");
    });
    return () => { cancelled = true; };
  }, [currentDate, planner.data.items, planner.loading, teacherId]);

  function openCreate(date = focusDate, startTime: string | null = null, itemType: "event" | "task" = "task") {
    setEditing(null);
    setRecurring(false);
    setDraft({ ...emptyInput(date), itemType, startTime, category: itemType === "event" ? "home" : "work" });
    setItemOpen(true);
  }

  function openRecurringCreate() {
    setEditing(null);
    setRecurring(true);
    setRecurrence({ ...emptyRecurrence(), startsOn: focusDate });
    setDraft({ ...emptyInput(focusDate), itemType: "task", category: "work", deadline: null });
    setItemOpen(true);
  }

  function openEdit(item: DocumentWithId<PlannerItem>) {
    setEditing(item);
    setRecurring(false);
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
      priority: item.data.priority === "calm" ? "low" : (item.data.priority ?? "medium"),
      goalId: item.data.goalId,
      subgoalId: item.data.subgoalId,
    });
    setItemOpen(true);
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (editing?.data.recurrenceSeriesId) {
        setRecurrenceAction("save");
        return;
      }
      if (editing) await updatePlannerItem(getFirebaseDb(), teacherId, editing.id, draft);
      else if (recurring) {
        await createRecurringPlannerTask(
          getFirebaseDb(),
          teacherId,
          draft,
          { ...recurrence, startsOn: draft.date ?? "" },
          currentDate,
        );
      } else await createPlannerItem(getFirebaseDb(), teacherId, draft);
      setItemOpen(false);
      setMessage(editing ? "План обновлён." : recurring ? "Регулярная задача добавлена." : "Пункт добавлен в план.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить задачу.");
    }
  }

  async function applyRecurrenceScope(scope: PlannerRecurrenceScope) {
    if (!editing || !recurrenceAction) return;
    try {
      if (recurrenceAction === "save") {
        await updateRecurringPlannerTaskScope(getFirebaseDb(), teacherId, editing.id, draft, scope);
      } else {
        await archiveRecurringPlannerTaskScope(getFirebaseDb(), teacherId, editing.id, scope);
      }
      setRecurrenceAction(null);
      setItemOpen(false);
      setMessage(recurrenceAction === "save" ? "Регулярная задача обновлена." : "Регулярная задача удалена из выбранного периода.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить регулярную задачу.");
    }
  }

  function toggleBacklog() {
    setBacklogExpanded((current) => {
      localStorage.setItem("teacher-planner-backlog-expanded", String(!current));
      return !current;
    });
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

  return (
    <main className="shell-content planner-page" aria-labelledby="planner-title">
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Личное пространство преподавателя</p>
          <h1 id="planner-title">Планер</h1>
          <p>Уроки, работа и личные планы в одном календаре. Личные записи ученикам не видны.</p>
        </div>
        <div className="form-actions">
          <AIShortcutButton prompt="Запланируй мой день на сегодня">Спланировать день</AIShortcutButton>
          <button className="secondary-button" onClick={() => setGoalOpen(true)} type="button">+ Большая цель</button>
          <button className="secondary-button" onClick={openRecurringCreate} type="button">+ Регулярная задача</button>
          <button className="primary-button primary-button--fit" onClick={() => openCreate()} type="button">+ Добавить</button>
        </div>
      </header>
      {planner.error || schedule.error ? <p className="shell-notice">{planner.error ?? schedule.error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}

      <section className="planner-toolbar">
        <div className="segmented-control" aria-label="Вид планера">
          {(["day", "week", "month", "timeline"] as const).map((mode) => <button aria-pressed={view === mode} key={mode} onClick={() => setView(mode)} type="button">{{ day: "День", week: "Неделя", month: "Месяц", timeline: "Временная шкала" }[mode]}</button>)}
        </div>
        <div className="planner-date-nav">
          <button className="icon-button" onClick={() => setFocusDate(addDays(focusDate, view === "day" || view === "timeline" ? -1 : view === "week" ? -7 : -28))} type="button">←</button>
          <input aria-label="Дата планера" onChange={(event) => setFocusDate(event.target.value)} type="date" value={focusDate} />
          <button className="icon-button" onClick={() => setFocusDate(addDays(focusDate, view === "day" || view === "timeline" ? 1 : view === "week" ? 7 : 28))} type="button">→</button>
          <button className="secondary-button" onClick={() => setFocusDate(todayKey())} type="button">Сегодня</button>
        </div>
        <div className="planner-filter" aria-label="Фильтр планера">
          {(["all", "work", "home"] as const).map((value) => <button aria-pressed={filter === value} key={value} onClick={() => setFilter(value)} type="button">{{ all: "Все", work: "Работа", home: "Дом" }[value]}</button>)}
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
                students={schedule.data.students}
                onCreate={() => openCreate(focusDate)}
                onEdit={openEdit}
                onToggle={(item) => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")}
                title="Работа"
                timezone={teacherTimezone}
              />
              <PlannerCategoryColumn
                emoji="🏠"
                items={focusItems.filter(({ data }) => data.category === "home" || data.category === "personal")}
                lessons={[]}
                students={schedule.data.students}
                onCreate={() => { openCreate(focusDate); setDraft({ ...emptyInput(focusDate), category: "home" }); }}
                onEdit={openEdit}
                onToggle={(item) => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")}
                title="Дом"
                timezone={teacherTimezone}
              />
            </div>
          ) : view === "week" ? (
            <PlannerWeek
              dates={selectedDates}
              focusDate={focusDate}
              items={visibleItems}
              lessons={lessons}
              students={schedule.data.students}
              timezone={teacherTimezone}
              onCreate={openCreate}
              onDrop={dropOnDate}
              onEdit={openEdit}
              onOpenDay={(date) => { setFocusDate(date); setView("day"); }}
              onToggle={(item) => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")}
            />
          ) : view === "month" ? (
            <PlannerMonth
              dates={selectedDates}
              focusDate={focusDate}
              items={visibleItems}
              lessons={lessons}
              students={schedule.data.students}
              timezone={teacherTimezone}
              onOpenDay={(date) => { setFocusDate(date); setView("day"); }}
            />
          ) : (
            <PlannerTimeline
              date={focusDate}
              items={focusItems}
              lessons={focusLessons}
              students={schedule.data.students}
              timezone={teacherTimezone}
              onCreate={openCreate}
              onDrop={dropOnDate}
              onEdit={openEdit}
              onToggle={(item) => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")}
            />
          )}
        </section>

        <aside className="planner-sidebar">
          <section className="planner-backlog-panel" data-testid="planner-someday">
            <button aria-expanded={backlogExpanded} className="planner-backlog-toggle" onClick={toggleBacklog} type="button"><span><span className="eyebrow">Backlog</span><strong>Когда-нибудь</strong></span><span>{backlogItems.length} {backlogExpanded ? "▴" : "▾"}</span></button>
            {backlogExpanded ? <div className="planner-backlog-list"><button className="planner-inline-add" onClick={() => { openCreate(""); setDraft({ ...emptyInput(""), category: "someday", date: null }); }} type="button">+ Добавить</button>{backlogItems.map((item) => <BacklogItem item={item} key={item.id} onEdit={() => openEdit(item)} onMove={(date, startTime, category) => void schedulePlannerItem(getFirebaseDb(), teacherId, item.id, date, startTime, category)} today={todayKey()} />)}</div> : null}
          </section>
          <section data-testid="planner-goals">
            <div className="section-heading"><button className="planner-goals-open" onClick={() => { setSelectedGoalId(planner.data.goals.find(({ data }) => data.status !== "archived")?.id ?? null); setGoalsWorkspaceOpen(true); }} type="button"><span><span className="eyebrow">Направление</span><strong>Большие цели</strong></span><span aria-hidden="true">→</span></button></div>
            {planner.data.goals.filter(({ data }) => data.status !== "archived").map((goal) => {
              const progress = plannerGoalProgress(goal.id, planner.data.subgoals, planner.data.items);
              return <article className="planner-goal" key={goal.id}><h3>{goal.data.title}</h3><p>{progress.completed} из {progress.total} шагов выполнено</p><progress max={100} value={progress.percent} /><button className="planner-link-button" onClick={() => { setSelectedGoalId(goal.id); setGoalsWorkspaceOpen(true); }} type="button">Открыть цель →</button>
                {planner.data.subgoals.filter(({ data }) => data.goalId === goal.id).map((subgoal) => <div className="planner-subgoal" key={subgoal.id}><label><input checked={subgoal.data.status === "completed"} onChange={(event) => void setPlannerSubgoalCompleted(getFirebaseDb(), teacherId, subgoal.id, event.target.checked)} type="checkbox" />{subgoal.data.title}</label><button onClick={() => { openCreate(focusDate); setDraft({ ...emptyInput(focusDate), goalId: goal.id, subgoalId: subgoal.id }); }} type="button">Запланировать</button></div>)}
                <button className="planner-link-button" onClick={() => setSubgoalFor(goal.id)} type="button">+ Подцель</button>
              </article>;
            })}
          </section>
        </aside>
      </div>

      {itemOpen ? <Modal className="planner-item-modal" onClose={() => setItemOpen(false)} title={editing ? "Изменить план" : recurring ? "Новая регулярная задача" : "Новый пункт плана"}><form className="modal-form" onSubmit={(event) => void saveItem(event)}>
        {!recurring ? <div className="segmented-control"><button aria-pressed={draft.itemType === "task"} onClick={() => setDraft({ ...draft, itemType: "task", category: draft.category === "personal" ? "home" : draft.category })} type="button">Задача</button><button aria-pressed={draft.itemType === "event"} onClick={() => setDraft({ ...draft, itemType: "event", category: draft.category === "someday" ? "work" : draft.category })} type="button">Событие</button></div> : null}
        <label className="form-field"><span>Название</span><input autoFocus onChange={(event) => setDraft({ ...draft, title: event.target.value })} required value={draft.title} /></label>
        <div className="form-grid"><label className="form-field"><span>Категория</span><select onChange={(event) => { const category = event.target.value as PlannerCategory; setDraft({ ...draft, category, ...(category === "someday" ? { date: null, startTime: null, endTime: null, durationMinutes: null } : {}) }); }} value={draft.category}>{(recurring ? ["work", "home"] : draft.itemType === "task" ? ["work", "home", "someday"] : ["work", "home"]).map((value) => <option key={value} value={value}>{categoryLabels[value as PlannerCategory]}</option>)}</select></label><label className="form-field"><span>Приоритет</span><select onChange={(event) => setDraft({ ...draft, priority: event.target.value as PlannerPriority })} value={draft.priority}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>{recurring ? "Начать с" : "Дата"}</span><input disabled={draft.category === "someday"} onChange={(event) => setDraft({ ...draft, date: event.target.value || null })} required={draft.category !== "someday"} type="date" value={draft.date ?? ""} /></label><label className="form-field"><span>Время начала</span><input disabled={draft.category === "someday"} onChange={(event) => setDraft({ ...draft, startTime: event.target.value || null })} type="time" value={draft.startTime ?? ""} /></label><label className="form-field"><span>Время окончания</span><input disabled={!draft.startTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value || null })} type="time" value={draft.endTime ?? ""} /></label><label className="form-field"><span>Длительность, минут</span><input disabled={!draft.startTime} min="1" onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value ? Number(event.target.value) : null })} type="number" value={draft.durationMinutes ?? ""} /></label>{!recurring ? <label className="form-field"><span>Дедлайн</span><input onChange={(event) => setDraft({ ...draft, deadline: event.target.value || null })} type="date" value={draft.deadline ?? ""} /></label> : null}</div>
        {recurring ? <fieldset className="planner-recurrence"><legend>Регулярность</legend><label className="form-field"><span>Повторять</span><select aria-label="Повторять" onChange={(event) => setRecurrence({ ...recurrence, pattern: event.target.value as PlannerRecurrencePattern })} value={recurrence.pattern}><option value="daily">Каждый день</option><option value="weekdays">По будням (Пн–Пт)</option><option value="custom">Выбранные дни</option></select></label>{recurrence.pattern === "custom" ? <div><span className="planner-recurrence-label">Дни недели</span><div className="planner-weekdays">{weekdayLabels.map((label, index) => { const weekday = index + 1; const selected = recurrence.weekdays.includes(weekday); return <button aria-label={label} aria-pressed={selected} key={label} onClick={() => setRecurrence({ ...recurrence, weekdays: selected ? recurrence.weekdays.filter((value) => value !== weekday) : [...recurrence.weekdays, weekday].sort() })} type="button">{label}</button>; })}</div></div> : null}<label className="form-field"><span>Закончить (необязательно)</span><input min={draft.date ?? undefined} onChange={(event) => setRecurrence({ ...recurrence, endsOn: event.target.value || null })} type="date" value={recurrence.endsOn ?? ""} /></label><small>Задачи создаются без дублей на 12 недель вперёд и автоматически продлеваются при открытии планера.</small></fieldset> : null}
        {editing?.data.recurrenceSeriesId ? <p className="shell-notice">После сохранения выберите: только это повторение, это и следующие или всю серию. Завершённые повторения сохранят историю.</p> : null}
        <label className="form-field"><span>Заметки</span><textarea onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })} rows={3} value={draft.notes ?? ""} /></label>
        <div className="form-actions"><button className="primary-button primary-button--fit">{editing ? "Сохранить" : recurring ? "Добавить регулярную задачу" : "Добавить"}</button>{editing ? <button className="secondary-button" onClick={() => { if (editing.data.recurrenceSeriesId) setRecurrenceAction("delete"); else if (confirm("Удалить этот пункт из планера?")) void archivePlannerItem(getFirebaseDb(), teacherId, editing.id).then(() => setItemOpen(false)); }} type="button">Удалить</button> : null}<button className="secondary-button" onClick={() => setItemOpen(false)} type="button">Отмена</button></div>
      </form></Modal> : null}

      {recurrenceAction ? <Modal onClose={() => setRecurrenceAction(null)} title={recurrenceAction === "save" ? "Какие повторения изменить?" : "Какие повторения удалить?"}><div className="recurrence-scope-options"><p>Прошлые завершённые задачи не будут изменены.</p><button className="secondary-button" onClick={() => void applyRecurrenceScope("occurrence")} type="button">Только это повторение</button><button className="secondary-button" onClick={() => void applyRecurrenceScope("following")} type="button">Это и следующие</button><button className="secondary-button" onClick={() => void applyRecurrenceScope("series")} type="button">Вся серия</button></div></Modal> : null}

      {goalOpen ? <Modal onClose={() => setGoalOpen(false)} title="Большая цель"><form className="modal-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void createPlannerGoal(getFirebaseDb(), teacherId, { title: String(form.get("title")), description: String(form.get("description")) || null, targetDate: String(form.get("targetDate")) || null }).then(() => setGoalOpen(false)); }}><label className="form-field"><span>Название</span><input name="title" required /></label><label className="form-field"><span>Описание</span><textarea name="description" /></label><label className="form-field"><span>Целевая дата</span><input name="targetDate" type="date" /></label><button className="primary-button primary-button--fit">Создать цель</button></form></Modal> : null}
      {goalsWorkspaceOpen ? <Modal className="planner-goals-modal" onClose={() => setGoalsWorkspaceOpen(false)} title="Большие цели"><div className="goals-workspace" data-testid="planner-goals-workspace"><nav aria-label="Большие цели">{activeGoals.map((goal) => <button aria-pressed={workspaceGoalId === goal.id} key={goal.id} onClick={() => setSelectedGoalId(goal.id)} type="button">{goal.data.title}</button>)}<button className="planner-link-button" onClick={() => setGoalOpen(true)} type="button">+ Новая цель</button></nav>{activeGoals.filter(({ id }) => id === workspaceGoalId).map((goal) => { const progress = plannerGoalProgress(goal.id, planner.data.subgoals, planner.data.items); return <section className="goal-workspace-detail" key={goal.id}><p className="eyebrow">Цель → подцели → задачи → планер</p><h3>{goal.data.title}</h3>{goal.data.description ? <p>{goal.data.description}</p> : null}{goal.data.targetDate ? <p>До {new Intl.DateTimeFormat("ru-RU").format(dateFromKey(goal.data.targetDate))}</p> : null}<strong>{progress.completed} из {progress.total} шагов</strong><progress max={100} value={progress.percent} />{planner.data.subgoals.filter(({ data }) => data.goalId === goal.id).map((subgoal) => <article className="goal-subgoal-card" key={subgoal.id}><label><input checked={subgoal.data.status === "completed"} onChange={(event) => void setPlannerSubgoalCompleted(getFirebaseDb(), teacherId, subgoal.id, event.target.checked)} type="checkbox" /><strong>{subgoal.data.title}</strong></label>{subgoal.data.notes ? <p>{subgoal.data.notes}</p> : null}<div className="goal-task-list">{planner.data.items.filter(({ data }) => data.active && !isPlannerRecurrenceTemplate(data) && data.subgoalId === subgoal.id).map((item) => <PlannerCard item={item} key={item.id} onEdit={() => openEdit(item)} onToggle={() => void setPlannerItemCompleted(getFirebaseDb(), teacherId, item.id, item.data.status !== "done")} />)}</div><button className="secondary-button" onClick={() => { openCreate(focusDate); setDraft({ ...emptyInput(focusDate), goalId: goal.id, subgoalId: subgoal.id }); }} type="button">+ Задача в планер</button></article>)}<button className="planner-link-button" onClick={() => setSubgoalFor(goal.id)} type="button">+ Подцель</button></section>; })}</div></Modal> : null}
      {subgoalFor ? <Modal onClose={() => setSubgoalFor(null)} title="Новая подцель"><form className="modal-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void createPlannerSubgoal(getFirebaseDb(), teacherId, subgoalFor, String(form.get("title")), String(form.get("notes")) || null).then(() => setSubgoalFor(null)); }}><label className="form-field"><span>Название</span><input name="title" required /></label><label className="form-field"><span>Заметки</span><textarea name="notes" /></label><button className="primary-button primary-button--fit">Добавить подцель</button></form></Modal> : null}
    </main>
  );
}

function PlannerLesson({ lesson, studentName, timezone }: { lesson: DocumentWithId<Lesson>; studentName?: string; timezone: ResolvedTimezone }) {
  const duration = Math.round((lesson.data.endAt.toMillis() - lesson.data.startAt.toMillis()) / 60_000);
  return <article className="planner-entry planner-entry--lesson" draggable={lesson.data.status === "planned"} onDragStart={(event) => event.dataTransfer.setData("text/planner-lesson-id", lesson.id)}><span>🎓 Урок из календаря</span><strong>{lessonTime(lesson.data, timezone)}–{lessonEndTime(lesson.data, timezone)} · {studentName ?? "Ученик"}</strong><small>{lesson.data.topic ?? "Тема не указана"} · ≈ {duration} мин</small></article>;
}

function PlannerCard({ item, onEdit, onToggle }: { item: DocumentWithId<PlannerItem>; onEdit(): void; onToggle(): void }) {
  const priority = item.data.priority === "calm" ? "low" : (item.data.priority ?? "medium");
  const time = item.data.startTime
    ? `${item.data.startTime}${item.data.endTime ? `–${item.data.endTime}` : ""} — `
    : "";
  const priorityLabel = priority === "high" ? "Высокий приоритет" : priority === "medium" ? "Средний приоритет" : "Низкий приоритет";
  return <article aria-label={priorityLabel} className={`planner-entry planner-entry--${item.data.category} planner-entry--priority-${priority}${item.data.status === "done" ? " planner-entry--done" : ""}`} draggable onDragStart={(event) => event.dataTransfer.setData("text/planner-item-id", item.id)} title={priorityLabel}><button aria-label={item.data.status === "done" ? "Вернуть задачу" : "Выполнить задачу"} className="planner-check" onClick={onToggle} type="button">{item.data.status === "done" ? "✓" : "○"}</button><button className="planner-entry-copy" onClick={onEdit} type="button">{item.data.recurrenceSeriesId ? <span>↻ регулярно</span> : null}<strong>{time}{item.data.title}{item.data.durationMinutes && !item.data.endTime ? ` · ≈ ${item.data.durationMinutes} мин` : ""}</strong>{item.data.notes ? <small>{item.data.notes}</small> : null}</button></article>;
}

function PlannerCategoryColumn({ emoji, title, items, lessons, students, timezone, onCreate, onEdit, onToggle }: { emoji: string; title: string; items: Array<DocumentWithId<PlannerItem>>; lessons: Array<DocumentWithId<Lesson>>; students: Array<DocumentWithId<Student>>; timezone: ResolvedTimezone; onCreate(): void; onEdit(item: DocumentWithId<PlannerItem>): void; onToggle(item: DocumentWithId<PlannerItem>): void }) {
  return <section className="planner-category-column" data-category={title}><header><h2>{emoji} {title}</h2><button aria-label={`Добавить в ${title}`} onClick={onCreate} type="button">+</button></header><div className="planner-category-list">{[...lessons].sort((left, right) => left.data.startAt.toMillis() - right.data.startAt.toMillis()).map((lesson) => <PlannerLesson key={lesson.id} lesson={lesson} studentName={students.find(({ id }) => id === lesson.data.studentId)?.data.displayName} timezone={timezone} />)}{sortPlannerItems(items).map((item) => <PlannerCard item={item} key={item.id} onEdit={() => onEdit(item)} onToggle={() => onToggle(item)} />)}{!lessons.length && !items.length ? <p className="content-state">Пока пусто</p> : null}</div></section>;
}

function BacklogItem({ item, today, onEdit, onMove }: { item: DocumentWithId<PlannerItem>; today: string; onEdit(): void; onMove(date: string, startTime: string | null, category: "work" | "home"): void }) {
  const [customDate, setCustomDate] = useState(today);
  const [customTime, setCustomTime] = useState("");
  return <article className="someday-item" draggable onDragStart={(event) => event.dataTransfer.setData("text/planner-item-id", item.id)}><strong>{item.data.title}</strong><div className="someday-item-actions"><button onClick={() => onMove(today, null, "work")} type="button">Сегодня</button><button onClick={() => onMove(addDays(today, 1), null, "work")} type="button">Завтра</button><button onClick={() => onMove(today, null, "work")} type="button">В работу</button><button onClick={() => onMove(today, null, "home")} type="button">Дом</button><button onClick={onEdit} type="button">Изменить</button></div><div className="someday-schedule"><input aria-label="Дата для задачи" onChange={(event) => setCustomDate(event.target.value)} type="date" value={customDate} /><input aria-label="Время для задачи" onChange={(event) => setCustomTime(event.target.value)} type="time" value={customTime} /><button onClick={() => onMove(customDate, customTime || null, "work")} type="button">Запланировать</button></div></article>;
}

interface PlannerCalendarViewProps {
  dates: string[];
  focusDate: string;
  items: Array<DocumentWithId<PlannerItem>>;
  lessons: Array<DocumentWithId<Lesson>>;
  timezone: ResolvedTimezone;
  onOpenDay(date: string): void;
}

function PlannerWeek({ dates, focusDate, items, lessons, students, timezone, onCreate, onDrop, onEdit, onOpenDay, onToggle }: PlannerCalendarViewProps & { students: Array<DocumentWithId<Student>>; onCreate(date: string, startTime?: string | null, itemType?: "event" | "task"): void; onDrop(event: React.DragEvent, date: string, time?: string | null): void; onEdit(item: DocumentWithId<PlannerItem>): void; onToggle(item: DocumentWithId<PlannerItem>): void }) {
  return <div className="planner-days">{dates.map((date) => {
    const dayItems = sortPlannerItems(items.filter(({ data }) => data.date === date));
    const dayLessons = lessons.filter(({ data }) => lessonDate(data, timezone) === date).sort((left, right) => left.data.startAt.toMillis() - right.data.startAt.toMillis());
    const timed = dayItems.filter(({ data }) => data.startTime && data.status !== "done");
    const untimed = dayItems.filter(({ data }) => !data.startTime && data.status !== "done");
    const completed = dayItems.filter(({ data }) => data.status === "done");
    return <article className={`planner-day planner-week-card${date === focusDate ? " planner-day--selected" : ""}`} key={date} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void onDrop(event, date)}><header><button onClick={() => onOpenDay(date)} type="button"><strong>{new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long" }).format(dateFromKey(date))}</strong></button><button aria-label={`Добавить план ${date}`} onClick={() => onCreate(date)} type="button">+</button></header>{dayLessons.length || timed.length ? <section className="planner-week-group"><h3>По времени</h3>{dayLessons.map((lesson) => <PlannerLesson key={lesson.id} lesson={lesson} studentName={students.find(({ id }) => id === lesson.data.studentId)?.data.displayName} timezone={timezone} />)}{timed.map((item) => <PlannerCard item={item} key={item.id} onEdit={() => onEdit(item)} onToggle={() => onToggle(item)} />)}</section> : null}{untimed.length ? <section className="planner-week-group"><h3>Задачи</h3>{(["work", "home"] as const).map((category) => { const grouped = untimed.filter(({ data }) => category === "work" ? data.category === "work" : data.category === "home" || data.category === "personal"); return grouped.length ? <div className="planner-week-category" key={category}><span>{category === "work" ? "Работа" : "Дом"}</span>{grouped.map((item) => <PlannerCard item={item} key={item.id} onEdit={() => onEdit(item)} onToggle={() => onToggle(item)} />)}</div> : null; })}</section> : null}{completed.length ? <section className="planner-week-group planner-week-group--completed"><h3>Выполнено</h3>{completed.map((item) => <PlannerCard item={item} key={item.id} onEdit={() => onEdit(item)} onToggle={() => onToggle(item)} />)}</section> : null}{!dayLessons.length && !dayItems.length ? <p className="content-state">Свободный день</p> : null}<button className="planner-inline-add" onClick={() => onCreate(date, null, "task")} type="button">+ Добавить</button></article>;
  })}</div>;
}

function PlannerTimeline({ date, items, lessons, students, timezone, onCreate, onDrop, onEdit, onToggle }: {
  date: string;
  items: Array<DocumentWithId<PlannerItem>>;
  lessons: Array<DocumentWithId<Lesson>>;
  students: Array<DocumentWithId<Student>>;
  timezone: ResolvedTimezone;
  onCreate(date: string, startTime?: string | null, itemType?: "event" | "task"): void;
  onDrop(event: React.DragEvent, date: string, time?: string | null): void;
  onEdit(item: DocumentWithId<PlannerItem>): void;
  onToggle(item: DocumentWithId<PlannerItem>): void;
}) {
  const timedItems = sortPlannerItems(items.filter(({ data }) => Boolean(data.startTime)));
  const intervals = [
    ...timedItems.map(({ data }) => ({
      startTime: data.startTime!,
      endTime: data.endTime,
      durationMinutes: data.durationMinutes,
    })),
    ...lessons.map(({ data }) => ({
      startTime: lessonTime(data, timezone),
      endTime: lessonEndTime(data, timezone),
      durationMinutes: null,
    })),
  ];
  const bounds = plannerTimelineBounds(intervals);
  const slots = Array.from(
    { length: Math.max(1, (bounds.end - bounds.start) / 30) },
    (_, index) => bounds.start + index * 30,
  );
  const events = [
    ...timedItems.map((item) => ({
      id: item.id,
      kind: "task" as const,
      title: item.data.title,
      start: plannerTimeToMinutes(item.data.startTime!),
      end: plannerIntervalEnd({
        startTime: item.data.startTime!,
        endTime: item.data.endTime,
        durationMinutes: item.data.durationMinutes,
      }),
      item,
      done: item.data.status === "done",
    })),
    ...lessons.map((lesson) => ({
      id: lesson.id,
      kind: "lesson" as const,
      title: `${students.find(({ id }) => id === lesson.data.studentId)?.data.displayName ?? "Ученик"} · ${lesson.data.topic ?? "Урок"}`,
      start: plannerTimeToMinutes(lessonTime(lesson.data, timezone)),
      end: plannerTimeToMinutes(lessonEndTime(lesson.data, timezone)),
      lesson,
      done: lesson.data.status === "completed",
    })),
  ].sort((left, right) => left.start - right.start || left.end - right.end);
  const laneEnds: number[] = [];
  const laidOut = events.map((event) => {
    let lane = laneEnds.findIndex((end) => end <= event.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = event.end;
    return { ...event, lane };
  });
  const laneCount = Math.max(1, laneEnds.length);
  const rowHeight = 42;
  const untimed = sortPlannerItems(items.filter(({ data }) => !data.startTime));

  return <div className="planner-timeline" data-testid="planner-timeline-content">
    <header className="planner-timeline__heading">
      <div><p className="eyebrow">Временная шкала</p><h2>{new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(dateFromKey(date))}</h2></div>
      <button className="secondary-button" onClick={() => onCreate(date, plannerMinutesToTime(bounds.start))} type="button">+ Задача ко времени</button>
    </header>
    <div className="planner-timeline__grid" style={{ height: slots.length * rowHeight } as CSSProperties}>
      {slots.map((minutes, index) => <div className="planner-timeline__slot" key={minutes} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void onDrop(event, date, plannerMinutesToTime(minutes))} style={{ top: index * rowHeight }}><button aria-label={`Добавить на ${plannerMinutesToTime(minutes)}`} onClick={() => onCreate(date, plannerMinutesToTime(minutes))} type="button">{plannerMinutesToTime(minutes)}</button></div>)}
      <div className="planner-timeline__events">
        {laidOut.map((event) => {
          const style = {
            top: ((event.start - bounds.start) / 30) * rowHeight + 2,
            height: Math.max(rowHeight - 4, ((Math.max(event.end, event.start + 30) - event.start) / 30) * rowHeight - 4),
            left: `calc(${(event.lane / laneCount) * 100}% + 0.2rem)`,
            width: `calc(${100 / laneCount}% - 0.4rem)`,
          } as CSSProperties;
          if (event.kind === "task") {
            return <article className={`planner-timeline__event planner-timeline__event--task${event.done ? " planner-timeline__event--done" : ""}`} draggable key={`task-${event.id}`} onDragStart={(drag) => drag.dataTransfer.setData("text/planner-item-id", event.id)} style={style}><button onClick={() => onEdit(event.item)} type="button"><time>{plannerMinutesToTime(event.start)}–{plannerMinutesToTime(event.end)}</time><strong>{event.title}</strong></button><button aria-label={event.done ? "Вернуть задачу" : "Выполнить задачу"} className="planner-check" onClick={() => onToggle(event.item)} type="button">{event.done ? "✓" : "○"}</button></article>;
          }
          return <article className={`planner-timeline__event planner-timeline__event--lesson${event.done ? " planner-timeline__event--done" : ""}`} draggable={event.lesson.data.status === "planned"} key={`lesson-${event.id}`} onDragStart={(drag) => drag.dataTransfer.setData("text/planner-lesson-id", event.id)} style={style}><time>{plannerMinutesToTime(event.start)}–{plannerMinutesToTime(event.end)}</time><strong>{event.title}</strong></article>;
        })}
      </div>
    </div>
    {untimed.length ? <section className="planner-timeline__untimed"><div className="section-heading"><h3>Без времени</h3><button onClick={() => onCreate(date)} type="button">+</button></div>{untimed.map((item) => <PlannerCard item={item} key={item.id} onEdit={() => onEdit(item)} onToggle={() => onToggle(item)} />)}</section> : null}
  </div>;
}

function PlannerMonth({ dates, focusDate, items, lessons, students, timezone, onOpenDay }: PlannerCalendarViewProps & { students: Array<DocumentWithId<Student>> }) {
  return <><div className="planner-month-weekdays">{weekdayLabels.map((day) => <span key={day}>{day}</span>)}</div><div className="planner-days">{dates.map((date) => {
    const dayItems = sortPlannerItems(items.filter(({ data }) => data.date === date));
    const dayLessons = lessons.filter(({ data }) => lessonDate(data, timezone) === date).sort((left, right) => left.data.startAt.toMillis() - right.data.startAt.toMillis());
    const timedItems = dayItems.filter(({ data }) => data.startTime && data.status !== "done");
    const highlights = [
      ...dayLessons.map((lesson) => ({ id: `lesson-${lesson.id}`, time: `${lessonTime(lesson.data, timezone)}–${lessonEndTime(lesson.data, timezone)}`, title: `${students.find(({ id }) => id === lesson.data.studentId)?.data.displayName ?? "Ученик"} · ${lesson.data.topic ?? "Урок"}` })),
      ...timedItems.map((item) => ({ id: item.id, time: `${item.data.startTime ?? ""}${item.data.endTime ? `–${item.data.endTime}` : ""}`, title: item.data.title })),
    ].sort((left, right) => left.time.localeCompare(right.time));
    const counts = plannerCategoryCounts(dayItems);
    const hidden = Math.max(0, dayLessons.length + dayItems.length - Math.min(2, highlights.length));
    return <button className={`planner-month-cell${date === focusDate ? " planner-day--selected" : ""}`} key={date} onClick={() => onOpenDay(date)} type="button"><strong>{new Intl.DateTimeFormat("ru-RU", { day: "numeric" }).format(dateFromKey(date))}</strong><span className="planner-month-highlights">{highlights.slice(0, 2).map((item) => <span key={item.id}><time>{item.time}</time> {item.title}</span>)}</span><span className="planner-month-counters">{counts.work ? <small>Работа {counts.work}</small> : null}{counts.home ? <small>Дом {counts.home}</small> : null}{counts.done ? <small>✓ {counts.done}</small> : null}</span>{hidden ? <small className="planner-month-more">+ ещё {hidden}</small> : null}</button>;
  })}</div></>;
}

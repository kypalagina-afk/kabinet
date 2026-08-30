import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Timestamp } from "firebase/firestore";
import { Link, useSearchParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { ChevronLeftIcon, ChevronRightIcon } from "../components/Icons";
import { useAuth } from "../features/auth/AuthProvider";
import { useTeacherSchedule } from "../features/schedule/hooks";
import { TimezoneSwitcher } from "../features/schedule/TimezoneSwitcher";
import { CompleteLessonForm } from "../features/schedule/CompleteLessonForm";
import { AIShortcutButton } from "../features/ai/AIShortcutButton";
import { useTeacherStudentWorkspace } from "../features/vertical-slice/hooks";
import {
  addCalendarDays,
  addCalendarMonths,
  calendarQueryRange,
  calendarVisibleDates,
  type CalendarView,
} from "../features/schedule/calendarRange";
import {
  dateKeyForTimezone,
  formatDateTimeForTimezone,
  moscowTimezoneLabel,
  resolveTimezone,
  timezoneUtcOffsetMinutes,
  type TimeDisplayMode,
  zonedLocalDateTimeToDate,
} from "../features/schedule/timezone";
import { getFirebaseDb } from "../lib/firebase/client";
import { findActiveStudentProgramId } from "../lib/firebase/repositories/scheduleRepository";
import {
  cancelLesson,
  cancelLessonSeries,
  createOneOffLesson,
  createLessonSeries,
  deleteLessonSeriesFuture,
  hardDeleteLesson,
  rescheduleLesson,
  changeRecurringSeriesFuture,
} from "../lib/firebase/services/scheduleOperations";
import {
  addPaymentCredits,
  previewPaymentAllocation,
  setLessonPaymentStatus,
} from "../lib/firebase/services/paymentWorkflow";
import type { DocumentWithId, Lesson } from "../lib/firebase/types";

const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const statusLabels: Record<Lesson["status"], string> = {
  planned: "Запланировано",
  completed: "Проведено",
  rescheduled: "Перенесено",
  cancelled_student: "Отменено учеником",
  cancelled_teacher: "Отменено преподавателем",
};

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function TeacherCalendarPage() {
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const [focusDate, setFocusDate] = useState(() =>
    searchParams.get("date") ??
    sessionStorage.getItem("calendar-focus-date") ??
    dateInputValue(new Date()),
  );
  const [view, setView] = useState<CalendarView>(() =>
    (sessionStorage.getItem("calendar-view") as CalendarView | null) ?? "month",
  );
  const [manualOffset, setManualOffset] = useState<number | null>(() => {
    const saved = sessionStorage.getItem("calendar-manual-offset");
    return saved === null ? null : Number(saved);
  });
  const [now, setNow] = useState(() => new Date());
  const [paymentFilter, setPaymentFilter] = useState<"all" | "unpaid">("all");
  const [lessonDraftDate, setLessonDraftDate] = useState(() => focusDate);
  const [quickOpen, setQuickOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentCount, setPaymentCount] = useState(4);
  const [paymentPreview, setPaymentPreview] = useState<Awaited<
    ReturnType<typeof previewPaymentAllocation>
  > | null>(null);
  const queryTimezone = useMemo(
    () => resolveTimezone(profile?.timezone),
    [profile?.timezone],
  );
  const range = useMemo(() => {
    const exact = calendarQueryRange(view, focusDate, queryTimezone);
    return {
      start: new Date(exact.start.getTime() - 86_400_000),
      end: new Date(exact.end.getTime() + 86_400_000),
    };
  }, [focusDate, queryTimezone, view]);
  const { data, loading, error } = useTeacherSchedule(user?.uid ?? "", range);
  const [selectedStudentId, setSelectedStudentId] = useState(
    () => searchParams.get("student") ?? sessionStorage.getItem("calendar-student-id") ?? "",
  );
  const [mode, setMode] = useState<TimeDisplayMode>(
    () =>
      (sessionStorage.getItem(
        "calendar-time-mode",
      ) as TimeDisplayMode | null) ?? "mine",
  );
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(() =>
    searchParams.get("lesson"),
  );
  const [operationStatus, setOperationStatus] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const selectedStudentTimezone = selectedStudentId
    ? data.studentTimezones[selectedStudentId]
    : null;
  const presetTimezone = useMemo(
    () =>
      mode === "moscow"
        ? resolveTimezone({ iana: "Europe/Moscow", moscowOffsetMinutes: 180 })
        : mode === "student"
          ? resolveTimezone(selectedStudentTimezone)
          : resolveTimezone(profile?.timezone),
    [mode, profile?.timezone, selectedStudentTimezone],
  );
  const displayTimezone = useMemo(
    () =>
      manualOffset === null
        ? presetTimezone
        : {
            kind: "offset" as const,
            label: `UTC${manualOffset >= 0 ? "+" : "−"}${Math.abs(manualOffset / 60)}`,
            iana: null,
            offsetMinutes: manualOffset,
          },
    [manualOffset, presetTimezone],
  );
  const mskLabel = useMemo(
    () => moscowTimezoneLabel(now, displayTimezone),
    [displayTimezone, now],
  );
  const selectedLesson =
    data.lessons.find(({ id }) => id === selectedLessonId) ?? null;
  const selectedStudentWorkspace = useTeacherStudentWorkspace(
    user?.uid ?? "",
    selectedLesson?.data.studentId ?? "",
  );
  const visibleLessons = (
    selectedStudentId
      ? data.lessons.filter(
          ({ data: lesson }) => lesson.studentId === selectedStudentId,
        )
      : data.lessons
  ).filter(
    ({ data: lesson }) =>
      paymentFilter === "all" || lesson.paymentStatus !== "paid",
  );
  const dates = useMemo(
    () => calendarVisibleDates(view, focusDate),
    [focusDate, view],
  );
  const focusMonth = useMemo(
    () => new Date(`${focusDate}T12:00:00.000Z`),
    [focusDate],
  );
  const monthLabel = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(focusMonth);
  const activeSeries = data.series.filter(({ data: series }) => series.active);
  const materializedThrough = activeSeries.length && activeSeries.every(({ data: series }) => series.materializedThrough)
    ? Math.min(...activeSeries.map(({ data: series }) => series.materializedThrough!.toMillis()))
    : null;
  const materializationHealthy = materializedThrough !== null && materializedThrough - now.getTime() >= 8 * 7 * 86_400_000;

  useEffect(() => {
    const handle = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(handle);
  }, []);
  useEffect(() => {
    sessionStorage.setItem("calendar-time-mode", mode);
    if (manualOffset === null)
      sessionStorage.removeItem("calendar-manual-offset");
    else sessionStorage.setItem("calendar-manual-offset", String(manualOffset));
  }, [manualOffset, mode]);
  useEffect(() => {
    sessionStorage.setItem("calendar-view", view);
    sessionStorage.setItem("calendar-focus-date", focusDate);
  }, [focusDate, view]);
  useEffect(() => {
    if (selectedStudentId) sessionStorage.setItem("calendar-student-id", selectedStudentId);
    else sessionStorage.removeItem("calendar-student-id");
  }, [selectedStudentId]);

  const byDate = useMemo(() => {
    const result = new Map<string, Array<DocumentWithId<Lesson>>>();
    for (const lesson of visibleLessons) {
      const key = dateKeyForTimezone(
        lesson.data.startAt.toDate(),
        displayTimezone,
      );
      result.set(key, [...(result.get(key) ?? []), lesson]);
    }
    return result;
  }, [displayTimezone, visibleLessons]);

  const runOperation = async (
    operation: () => Promise<unknown>,
    success: string,
  ) => {
    setOperationError(null);
    setOperationStatus(null);
    try {
      await operation();
      setOperationStatus(success);
    } catch (error) {
      console.error("Calendar operation failed", error);
      const reason = error instanceof Error ? error.message : "Неизвестная ошибка";
      setOperationError(
        `Операция не выполнена: ${reason}`,
      );
    }
  };

  const handleCreateSeries = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const studentId = String(form.get("studentId") ?? "");
    const teacherId = user?.uid ?? "";
    const startsOn = String(form.get("startsOn"));
    await runOperation(async () => {
      const studentProgramId = await findActiveStudentProgramId(
        getFirebaseDb(),
        teacherId,
        studentId,
      );
      if (!studentProgramId)
        throw new Error("у ученика нет активной программы. Откройте карточку ученика и проверьте назначенную программу");
      const result = await createLessonSeries(getFirebaseDb(), {
        teacherId,
        studentId,
        studentProgramId,
        weekdays: [Number(form.get("weekday"))],
        interval: 1,
        startLocalTime: String(form.get("startLocalTime")),
        durationMinutes: Number(form.get("durationMinutes")),
        baseTimezone: "Europe/Moscow",
        startsOn,
        endsOn: String(form.get("endsOn") || "") || null,
      });
      setSelectedStudentId(studentId);
      setFocusDate(startsOn);
      setSelectedLessonId(result.createdLessonIds[0] ?? null);
      return result;
    }, "Серия сохранена и материализована на 12 недель.");
  };

  const handleReschedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLesson) return;
    const value = String(new FormData(event.currentTarget).get("newStart"));
    const duration =
      selectedLesson.data.endAt.toMillis() -
      selectedLesson.data.startAt.toMillis();
    const form = new FormData(event.currentTarget);
    const scope = String(form.get("scope") ?? "one");
    await runOperation(
      () => {
        const start = zonedLocalDateTimeToDate(
          value.slice(0, 10),
          value.slice(11, 16),
          "Europe/Moscow",
        );
        if (scope === "future" && selectedLesson.data.lessonSeriesId)
          return changeRecurringSeriesFuture(getFirebaseDb(), {
            seriesId: selectedLesson.data.lessonSeriesId,
            teacherId: user?.uid ?? "",
            effectiveLessonId: selectedLesson.id,
            startsOn: value.slice(0, 10),
            weekdays: [((start.getUTCDay() + 6) % 7) + 1],
            startLocalTime: value.slice(11, 16),
            durationMinutes: duration / 60_000,
            baseTimezone: "Europe/Moscow",
          });
        return rescheduleLesson(getFirebaseDb(), {
          lessonId: selectedLesson.id,
          newStartAt: Timestamp.fromDate(start),
          newEndAt: Timestamp.fromMillis(start.getTime() + duration),
        });
      },
      scope === "future"
        ? "Будущая часть серии изменена, история сохранена."
        : "Занятие перенесено, серия не изменена.",
    );
    setRescheduleOpen(false);
  };

  const handleOneOff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const studentId = String(form.get("studentId"));
    const teacherId = user?.uid ?? "";
    await runOperation(async () => {
      const studentProgramId = await findActiveStudentProgramId(
        getFirebaseDb(),
        teacherId,
        studentId,
      );
      const start = zonedLocalDateTimeToDate(
        String(form.get("date")),
        String(form.get("time")),
        "Europe/Moscow",
      );
      const duration = Number(form.get("duration")) || 60;
      return createOneOffLesson(getFirebaseDb(), {
        teacherId,
        studentId,
        studentProgramId,
        startAt: Timestamp.fromDate(start),
        endAt: Timestamp.fromMillis(start.getTime() + duration * 60_000),
        billingType:
          String(form.get("billingType")) === "free" ? "free" : "regular",
      });
    }, "Занятие создано.");
    setQuickOpen(false);
  };

  async function loadPaymentPreview() {
    if (!user || !selectedStudentId) return;
    setPaymentPreview(
      await previewPaymentAllocation(
        getFirebaseDb(),
        user.uid,
        selectedStudentId,
        paymentCount,
      ),
    );
  }
  async function applyPayment() {
    if (!user || !selectedStudentId) return;
    await runOperation(
      () =>
        addPaymentCredits(getFirebaseDb(), {
          teacherId: user.uid,
          studentId: selectedStudentId,
          lessonCount: paymentCount,
        }),
      `Добавлена оплата за ${paymentCount} занятий.`,
    );
    setPaymentOpen(false);
    setPaymentPreview(null);
  }
  function beginReschedule(
    lesson: DocumentWithId<Lesson>,
    targetDate?: string,
  ) {
    setSelectedLessonId(lesson.id);
    const local = formatDateTimeForTimezone(
      lesson.data.startAt.toDate(),
      { kind: "iana", iana: "Europe/Moscow", label: "МСК", offsetMinutes: 180 },
      { hour: "2-digit", minute: "2-digit", hour12: false },
    );
    setRescheduleDate(
      `${targetDate ?? dateKeyForTimezone(lesson.data.startAt.toDate(), { kind: "iana", iana: "Europe/Moscow", label: "МСК", offsetMinutes: 180 })}T${local}`,
    );
    setRescheduleOpen(true);
  }

  return (
    <main
      className="shell-content calendar-page"
      aria-labelledby="calendar-title"
    >
      <section className="calendar-heading">
        <div>
          <p className="eyebrow">Расписание</p>
          <h1 id="calendar-title">Календарь занятий</h1>
          <p>Все занятия хранятся относительно Москвы · горизонт 12 недель</p>
          <p className="live-clock">
            Сейчас:{" "}
            {formatDateTimeForTimezone(now, displayTimezone, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}{" "}
            ·{" "}
            {mode === "student"
              ? (data.students.find(({ id }) => id === selectedStudentId)?.data
                  .displayName ?? "Время ученика")
              : mode === "moscow"
                ? "Москва"
                : "Моё время"}{" "}
            · {mskLabel}
          </p>
        </div>
        <TimezoneSwitcher
          onChange={(value) => {
            setMode(value);
            setManualOffset(null);
          }}
          studentDisabled={!selectedStudentId}
          value={mode}
        />
      </section>
      {activeSeries.length ? (
        <p
          className={materializationHealthy ? "materialization-health" : "shell-notice materialization-health"}
          data-testid="materialization-health"
        >
          {materializedThrough
            ? `Расписание создано до ${formatDateTimeForTimezone(new Date(materializedThrough), queryTimezone, { day: "numeric", month: "long", year: "numeric" })}.${materializationHealthy ? " Горизонт в норме." : " Горизонт короче 8 недель — требуется запуск защищённого materializer."}`
            : "Горизонт повторяющегося расписания ещё не подтверждён. Требуется запуск защищённого materializer."}
        </p>
      ) : null}

      {error ? (
        <p className="shell-notice" role="alert">
          {error}
        </p>
      ) : null}
      {operationError ? (
        <p className="shell-notice" role="alert">
          {operationError}
        </p>
      ) : null}
      {operationStatus ? (
        <p className="form-success" role="status">
          {operationStatus}
        </p>
      ) : null}

      <section className="calendar-toolbar" aria-label="Управление календарём">
        <div
          className="segmented-control calendar-view-switch"
          aria-label="Вид календаря"
        >
          {(
            [
              ["month", "Месяц"],
              ["week", "Неделя"],
              ["day", "День"],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={view === value}
              key={value}
              onClick={() => setView(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="calendar-toolbar__month">
          <button
            className="icon-button"
            aria-label={view === "month" ? "Предыдущий месяц" : view === "week" ? "Предыдущая неделя" : "Предыдущий день"}
            onClick={() =>
              setFocusDate((value) =>
                view === "month"
                  ? addCalendarMonths(value, -1)
                  : addCalendarDays(value, view === "week" ? -7 : -1),
              )
            }
            type="button"
          >
            ←
          </button>
          <label className="calendar-date-picker">
            <span>{monthLabel}</span>
            <input
              aria-label="Выбрать дату календаря занятий"
              onChange={(event) => setFocusDate(event.target.value)}
              type="date"
              value={focusDate}
            />
          </label>
          <button
            className="icon-button"
            aria-label={view === "month" ? "Следующий месяц" : view === "week" ? "Следующая неделя" : "Следующий день"}
            onClick={() =>
              setFocusDate((value) =>
                view === "month"
                  ? addCalendarMonths(value, 1)
                  : addCalendarDays(value, view === "week" ? 7 : 1),
              )
            }
            type="button"
          >
            →
          </button>
        </div>
        <button
          className="secondary-button"
          onClick={() => setFocusDate(dateKeyForTimezone(new Date(), displayTimezone))}
          type="button"
        >
          Сегодня
        </button>
        <div className="timezone-scroll timezone-stepper">
          <button
            aria-label="Минус один час"
            className="icon-button"
            onClick={() =>
              setManualOffset(
                (value) =>
                  (value ?? timezoneUtcOffsetMinutes(now, presetTimezone)) - 60,
              )
            }
            type="button"
          >
            <ChevronLeftIcon />
          </button>
          <strong>{mskLabel}</strong>
          <button
            aria-label="Плюс один час"
            className="icon-button"
            onClick={() =>
              setManualOffset(
                (value) =>
                  (value ?? timezoneUtcOffsetMinutes(now, presetTimezone)) + 60,
              )
            }
            type="button"
          >
            <ChevronRightIcon />
          </button>
          {manualOffset !== null ? (
            <button
              className="secondary-button"
              onClick={() => {
                setManualOffset(null);
                setMode("mine");
              }}
              type="button"
            >
              Вернуться к моему времени
            </button>
          ) : null}
        </div>
        <label className="calendar-student-filter">
          <span>Ученик</span>
          <select
            value={selectedStudentId}
            onChange={(event) => {
              setSelectedStudentId(event.target.value);
              if (!event.target.value && mode === "student") setMode("mine");
            }}
          >
            <option value="">Все ученики</option>
            {data.students.map(({ id, data: student }) => (
              <option key={id} value={id}>
                {student.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="calendar-student-filter">
          <span>Оплата</span>
          <select
            value={paymentFilter}
            onChange={(event) =>
              setPaymentFilter(event.target.value as "all" | "unpaid")
            }
          >
            <option value="all">Все</option>
            <option value="unpaid">Не оплачено</option>
          </select>
        </label>
        <button
          className="primary-button primary-button--fit"
          onClick={() => {
            setLessonDraftDate(focusDate);
            setQuickOpen(true);
          }}
          type="button"
        >
          + Занятие
        </button>
        <button
          className="secondary-button"
          onClick={() => setPaymentOpen(true)}
          type="button"
        >
          + Добавить оплату
        </button>
      </section>

      <div className="calendar-layout">
        {view === "month" ? (
          <section
            className="month-calendar responsive-calendar"
            data-testid="teacher-month-calendar"
            aria-label={monthLabel}
          >
            <div className="month-calendar__weekdays" aria-hidden="true">
              {weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="month-calendar__grid">
              {dates.map((date) => {
                const lessons = byDate.get(date) ?? [];
                const outsideMonth =
                  Number(date.slice(5, 7)) !== focusMonth.getUTCMonth() + 1;
                return (
                  <article
                    className={
                      outsideMonth
                        ? "calendar-day calendar-day--outside"
                        : "calendar-day"
                    }
                    key={date}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      const id = event.dataTransfer.getData("text/lesson-id");
                      const lesson = data.lessons.find(
                        (item) => item.id === id,
                      );
                      if (lesson) beginReschedule(lesson, date);
                    }}
                  >
                    <time dateTime={date}>{Number(date.slice(8, 10))}</time>
                    <button
                      aria-label={`Добавить занятие ${date}`}
                      className="calendar-day-add"
                      onClick={() => {
                        setFocusDate(date);
                        setLessonDraftDate(date);
                        setQuickOpen(true);
                      }}
                      type="button"
                    >
                      +
                    </button>
                    <div className="calendar-day__events">
                      {lessons.map((lesson) => {
                        const student = data.students.find(
                          ({ id }) => id === lesson.data.studentId,
                        );
                        return (
                          <button
                            className={`calendar-event calendar-event--${lesson.data.status}`}
                            data-testid="calendar-event"
                            key={lesson.id}
                            draggable={lesson.data.status === "planned"}
                            onDragStart={(event) =>
                              event.dataTransfer.setData(
                                "text/lesson-id",
                                lesson.id,
                              )
                            }
                            onClick={() => setSelectedLessonId(lesson.id)}
                            type="button"
                          >
                            <strong>
                              {formatDateTimeForTimezone(
                                lesson.data.startAt.toDate(),
                                displayTimezone,
                                { timeStyle: "short" },
                              )}
                            </strong>
                            <span>{student?.data.displayName ?? "Ученик"}</span>
                            <i
                              aria-label={
                                lesson.data.paymentStatus === "paid"
                                  ? "Оплачено"
                                  : "Не оплачено"
                              }
                              className={
                                lesson.data.paymentStatus === "paid"
                                  ? "payment-dot payment-dot--paid"
                                  : "payment-dot"
                              }
                            />
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section
            className={`agenda-calendar agenda-calendar--${view}`}
            data-testid={`teacher-${view}-calendar`}
          >
            <header>
              <span>Время</span>
              {dates.map(
                (date) => (
                  <strong key={date}>
                    {new Intl.DateTimeFormat("ru-RU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    }).format(new Date(`${date}T12:00:00Z`))}
                  </strong>
                ),
              )}
            </header>
            <div className="agenda-columns">
              {dates.map(
                (date) => (
                  <div
                    className="agenda-day"
                    key={date}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      const id = event.dataTransfer.getData("text/lesson-id");
                      const lesson = data.lessons.find(
                        (item) => item.id === id,
                      );
                      if (lesson) beginReschedule(lesson, date);
                    }}
                  >
                    {(byDate.get(date) ?? []).map((lesson) => {
                      const student = data.students.find(
                        ({ id }) => id === lesson.data.studentId,
                      );
                      return (
                        <article
                          className={`agenda-event agenda-event--${lesson.data.status}`}
                          draggable={lesson.data.status === "planned"}
                          key={lesson.id}
                          onClick={() => setSelectedLessonId(lesson.id)}
                          onDragStart={(event) =>
                            event.dataTransfer.setData(
                              "text/lesson-id",
                              lesson.id,
                            )
                          }
                        >
                          <strong>
                            {formatDateTimeForTimezone(
                              lesson.data.startAt.toDate(),
                              displayTimezone,
                              { timeStyle: "short" },
                            )}
                          </strong>
                          <span>{student?.data.displayName ?? "Ученик"}</span>
                          <small>
                            {lesson.data.topic ?? "Тема не указана"}
                          </small>
                          <span
                            className={`payment-label payment-label--${lesson.data.paymentStatus}`}
                          >
                            {lesson.data.paymentStatus === "paid"
                              ? "Оплачено"
                              : lesson.data.paymentStatus === "free"
                                ? "Бесплатно"
                                : "Не оплачено"}
                          </span>
                        </article>
                      );
                    })}
                    <button
                      className="calendar-empty-slot"
                      onClick={() => {
                        setFocusDate(date);
                        setLessonDraftDate(date);
                        setQuickOpen(true);
                      }}
                      type="button"
                    >
                      + Занятие
                    </button>
                  </div>
                ),
              )}
            </div>
          </section>
        )}

        <aside className="calendar-inspector" aria-label="Детали занятия">
          {selectedLesson ? (
            <>
              <span className="summary-card__label">Выбрано занятие</span>
              <h2>
                {formatDateTimeForTimezone(
                  selectedLesson.data.startAt.toDate(),
                  displayTimezone,
                )}
              </h2>
              <p>{statusLabels[selectedLesson.data.status]}</p>
              <p>{selectedLesson.data.topic ?? "Тема не указана"}</p>
              <span className="status-chip">
                {selectedLesson.data.paymentStatus === "paid"
                  ? "Оплачено"
                  : selectedLesson.data.paymentStatus === "free"
                    ? "Бесплатно"
                    : "Не оплачено"}
              </span>
              <AIShortcutButton prompt={`Подведи итоги урока с ${data.students.find(({ id }) => id === selectedLesson.data.studentId)?.data.displayName ?? "учеником"}`}>Черновик итогов</AIShortcutButton>
              {selectedLesson.data.status === "planned" ||
              selectedLesson.data.status === "completed" ? (
                <CompleteLessonForm
                  lesson={selectedLesson}
                  taskNumbers={selectedStudentWorkspace.data.examBlueprint?.data.tasks.map(
                    (task) => task.number,
                  ) ?? []}
                  teacherId={user?.uid ?? ""}
                />
              ) : null}
              {selectedLesson.data.status === "completed" ? (
                <div className="selected-lesson-summary">
                  {selectedLesson.data.examTaskNumbers?.length ? (
                    <div className="tag-row">
                      {selectedLesson.data.examTaskNumbers.map((number) => (
                        <span className="status-chip" key={number}>
                          №{number}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {selectedLesson.data.understanding ? (
                    <p>
                      <strong>Понимание:</strong>{" "}
                      {selectedLesson.data.understanding.score}/10 ·{" "}
                      {selectedLesson.data.understanding.status === "confident"
                        ? "Уверенно"
                        : selectedLesson.data.understanding.status ===
                            "needs_practice"
                          ? "Нужна отработка"
                          : "В процессе"}
                    </p>
                  ) : (
                    <p className="shell-notice">Итоги занятия не заполнены</p>
                  )}
                  {selectedLesson.data.lessonSummary.focusNotes.length ? (
                    <p>
                      <strong>Обратить внимание:</strong>{" "}
                      {selectedLesson.data.lessonSummary.focusNotes.join("; ")}
                    </p>
                  ) : null}
                  {selectedLesson.data.lessonSummary.studentComment ? (
                    <p>
                      <strong>Комментарий ученику:</strong>{" "}
                      {selectedLesson.data.lessonSummary.studentComment}
                    </p>
                  ) : null}
                  <p>
                    {selectedLesson.data.homeworkResolution === "not_required"
                      ? "ДЗ не требуется"
                      : selectedLesson.data.homeworkResolution === "assigned"
                        ? "ДЗ назначено"
                        : "ДЗ пока не выдано"}
                  </p>
                  <Link
                    className="secondary-button"
                    to={`/teacher/students/${selectedLesson.data.studentId}?tab=lessons&lesson=${selectedLesson.id}`}
                  >
                    Открыть в журнале
                  </Link>
                </div>
              ) : null}
              {selectedLesson.data.status === "planned" ||
              selectedLesson.data.status === "completed" ? (
                <section
                  className="selected-lesson-payment"
                  data-testid="selected-lesson-payment"
                >
                  <h3>Оплата</h3>
                  <p>
                    {selectedLesson.data.paymentStatus === "paid"
                      ? "Занятие оплачено"
                      : selectedLesson.data.paymentStatus === "free"
                        ? "Бесплатное занятие"
                        : "Занятие не оплачено"}
                  </p>
                  <div className="form-actions">
                    {selectedLesson.data.paymentStatus === "unpaid" ? (
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setSelectedStudentId(selectedLesson.data.studentId);
                          setPaymentOpen(true);
                        }}
                        type="button"
                      >
                        Добавить оплату
                      </button>
                    ) : null}
                    <button
                      className="secondary-button"
                      onClick={() =>
                        void runOperation(
                          () =>
                            setLessonPaymentStatus(getFirebaseDb(), {
                              teacherId: user?.uid ?? "",
                              studentId: selectedLesson.data.studentId,
                              lessonId: selectedLesson.id,
                              paymentStatus:
                                selectedLesson.data.paymentStatus === "paid"
                                  ? "unpaid"
                                  : "paid",
                            }),
                          "Статус оплаты обновлён.",
                        )
                      }
                      type="button"
                    >
                      {selectedLesson.data.paymentStatus === "paid"
                        ? "Отметить неоплаченным"
                        : "Отметить это занятие оплаченным"}
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        void runOperation(
                          () =>
                            setLessonPaymentStatus(getFirebaseDb(), {
                              teacherId: user?.uid ?? "",
                              studentId: selectedLesson.data.studentId,
                              lessonId: selectedLesson.id,
                              paymentStatus: "free",
                            }),
                          "Занятие отмечено бесплатным.",
                        )
                      }
                      type="button"
                    >
                      Сделать бесплатным
                    </button>
                  </div>
                </section>
              ) : null}
              {selectedLesson.data.status === "planned" ? (
                <>
                  <div className="calendar-action-stack">
                    <button
                      className="secondary-button"
                      onClick={() => beginReschedule(selectedLesson)}
                      type="button"
                    >
                      Перенести занятие
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        void runOperation(
                          () =>
                            cancelLesson(
                              getFirebaseDb(),
                              selectedLesson.id,
                              "teacher",
                            ),
                          "Одно занятие отменено.",
                        )
                      }
                      type="button"
                    >
                      Отменить один урок
                    </button>
                    <button
                      className="secondary-button secondary-button--danger"
                      data-testid="hard-delete-lesson"
                      onClick={() => {
                        if (!window.confirm("Удалить занятие навсегда?")) return;
                        void runOperation(
                          () => hardDeleteLesson(getFirebaseDb(), {
                            lessonId: selectedLesson.id,
                            teacherId: user?.uid ?? "",
                          }).then((result) => {
                            if (result.status === "applied") setSelectedLessonId(null);
                            return result;
                          }),
                          "Ошибочное занятие удалено без возможности восстановления.",
                        );
                      }}
                      type="button"
                    >
                      Удалить урок
                    </button>
                    {selectedLesson.data.lessonSeriesId ? (
                      <button
                        className="secondary-button secondary-button--danger"
                        onClick={() =>
                          void runOperation(
                            () =>
                              cancelLessonSeries(getFirebaseDb(), {
                                seriesId: selectedLesson.data.lessonSeriesId!,
                                teacherId: user?.uid ?? "",
                                actor: "teacher",
                              }),
                            "Серия и будущие занятия отменены.",
                          )
                        }
                        type="button"
                      >
                        Отменить всю серию
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
              {selectedLesson.data.lessonSeriesId ? (
                <button
                  className="secondary-button secondary-button--danger"
                  data-testid="delete-series-future"
                  onClick={() => {
                    if (!window.confirm("Удалить все будущие занятия этой серии? Уже проведённые уроки и история оплат сохранятся.")) return;
                    void runOperation(
                      () => deleteLessonSeriesFuture(getFirebaseDb(), {
                        seriesId: selectedLesson.data.lessonSeriesId!,
                        teacherId: user?.uid ?? "",
                      }).then((result) => {
                        setSelectedLessonId(null);
                        return result;
                      }),
                      "Будущие занятия удалены, серия завершена. История проведённых уроков сохранена.",
                    );
                  }}
                  type="button"
                >
                  Удалить будущие уроки серии
                </button>
              ) : null}
            </>
          ) : (
            <p className="content-state">Выберите занятие в календаре.</p>
          )}
        </aside>
      </div>

      {quickOpen ? (
        <Modal onClose={() => setQuickOpen(false)} title="Добавить занятие">
          <form
            className="modal-form"
            onSubmit={(event) => void handleOneOff(event)}
          >
            <label className="form-field">
              <span>Ученик</span>
              <select
                defaultValue={selectedStudentId}
                name="studentId"
                required
              >
                <option value="">Выберите ученика</option>
                {data.students
                  .filter(({ data: student }) => student.status === "active")
                  .map(({ id, data: student }) => (
                    <option key={id} value={id}>
                      {student.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <div className="form-grid">
              <label className="form-field">
                <span>Дата</span>
                <input
                  name="date"
                  onChange={(event) => setLessonDraftDate(event.target.value)}
                  required
                  type="date"
                  value={lessonDraftDate}
                />
              </label>
              <label className="form-field">
                <span>Время, МСК</span>
                <input defaultValue="10:00" name="time" required type="time" />
              </label>
              <label className="form-field">
                <span>Длительность</span>
                <select defaultValue="60" name="duration">
                  <option value="45">45 минут</option>
                  <option value="60">60 минут</option>
                  <option value="90">90 минут</option>
                </select>
              </label>
              <label className="form-field">
                <span>Тип</span>
                <select defaultValue="regular" name="billingType">
                  <option value="regular">Обычное</option>
                  <option value="free">Бесплатное / пробное</option>
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button className="primary-button primary-button--fit">
                Добавить занятие
              </button>
              <button
                className="secondary-button"
                onClick={() => setQuickOpen(false)}
                type="button"
              >
                Отмена
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {rescheduleOpen && selectedLesson ? (
        <Modal
          onClose={() => setRescheduleOpen(false)}
          title={`Перенести занятие ${data.students.find(({ id }) => id === selectedLesson.data.studentId)?.data.displayName ?? "ученика"}`}
        >
          <form
            className="modal-form"
            onSubmit={(event) => void handleReschedule(event)}
          >
            <label className="form-field">
              <span>Новая дата и время, МСК</span>
              <input
                name="newStart"
                onChange={(event) => setRescheduleDate(event.target.value)}
                required
                type="datetime-local"
                value={rescheduleDate}
              />
            </label>
            <fieldset className="scope-selector">
              <legend>Что изменить</legend>
              <label>
                <input defaultChecked name="scope" type="radio" value="one" />{" "}
                Только это занятие
              </label>
              {selectedLesson.data.lessonSeriesId ? (
                <label>
                  <input name="scope" type="radio" value="future" /> Это и
                  будущие занятия серии
                </label>
              ) : null}
            </fieldset>
            <p className="workflow-hint">
              Исходное занятие останется в истории как перенесённое.
            </p>
            <div className="form-actions">
              <button className="primary-button primary-button--fit">
                Подтвердить перенос
              </button>
              <button
                className="secondary-button"
                onClick={() => setRescheduleOpen(false)}
                type="button"
              >
                Отмена
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {paymentOpen ? (
        <Modal
          onClose={() => {
            setPaymentOpen(false);
            setPaymentPreview(null);
          }}
          title="Добавить оплату"
        >
          <div className="modal-form">
            <label className="form-field">
              <span>Ученик</span>
              <select
                onChange={(event) => {
                  setSelectedStudentId(event.target.value);
                  setPaymentPreview(null);
                }}
                value={selectedStudentId}
              >
                <option value="">Выберите ученика</option>
                {data.students.map(({ id, data: student }) => (
                  <option key={id} value={id}>
                    {student.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Оплачено занятий: {paymentCount}</span>
              <input
                max="20"
                min="1"
                onChange={(event) => {
                  setPaymentCount(Number(event.target.value));
                  setPaymentPreview(null);
                }}
                type="range"
                value={paymentCount}
              />
            </label>
            <button
              className="secondary-button"
              disabled={!selectedStudentId}
              onClick={() => void loadPaymentPreview()}
              type="button"
            >
              Показать распределение
            </button>
            {paymentPreview ? (
              <div className="payment-preview">
                <strong>
                  Будут покрыты {paymentPreview.paidIds.length} занятий
                </strong>
                <ol>
                  {paymentPreview.candidates
                    .slice(0, paymentPreview.totalCredits)
                    .map((lesson) => (
                      <li key={lesson.id}>
                        {new Intl.DateTimeFormat("ru-RU", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(lesson.startMs))}
                      </li>
                    ))}
                </ol>
              </div>
            ) : null}
            <div className="form-actions">
              <button
                className="primary-button primary-button--fit"
                disabled={!paymentPreview}
                onClick={() => void applyPayment()}
                type="button"
              >
                Подтвердить оплату
              </button>
              <button
                className="secondary-button"
                onClick={() => setPaymentOpen(false)}
                type="button"
              >
                Отмена
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      <form
        className="action-form recurring-series-form responsive-form"
        onSubmit={(event) => void handleCreateSeries(event)}
      >
        <div className="action-form__heading">
          <p className="eyebrow">Повторяющаяся серия</p>
          <h2>Добавить расписание</h2>
          <p>
            Занятия создаются идемпотентно на следующие 12 недель по Москве.
          </p>
        </div>
        <div className="form-grid">
          <label className="form-field">
            <span>Ученик</span>
            <select name="studentId" required>
              <option value="">Выберите ученика</option>
              {data.students.map(({ id, data: student }) => (
                <option key={id} value={id}>
                  {student.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>День недели</span>
            <select defaultValue="4" name="weekday">
              {weekdayLabels.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Время, МСК</span>
            <input
              defaultValue="10:00"
              name="startLocalTime"
              required
              type="time"
            />
          </label>
          <label className="form-field">
            <span>Длительность</span>
            <select defaultValue="60" name="durationMinutes">
              <option value="45">45 минут</option>
              <option value="60">60 минут</option>
              <option value="90">90 минут</option>
            </select>
          </label>
          <label className="form-field">
            <span>Начало серии</span>
            <input
              defaultValue={dateInputValue(new Date())}
              name="startsOn"
              required
              type="date"
            />
          </label>
          <label className="form-field">
            <span>Окончание (необязательно)</span>
            <input name="endsOn" type="date" />
          </label>
        </div>
        <div className="form-actions">
          <button
            className="primary-button primary-button--fit"
            disabled={loading}
            type="submit"
          >
            Создать серию
          </button>
        </div>
      </form>
    </main>
  );
}

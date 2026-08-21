import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../features/avatar/Avatar";
import { useAuth } from "../features/auth/AuthProvider";
import { useTeacherHomeworkBoard } from "../features/homework/hooks";
import { useTeacherPlanner } from "../features/planner/hooks";
import { useTeacherSchedule } from "../features/schedule/hooks";
import { isCurrentDashboardLesson } from "../features/schedule/dashboardLessons";

function dayRange(now: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

const lessonTime = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});

export function TeacherHomePage() {
  const { user, profile } = useAuth();
  const [now] = useState(() => Date.now());
  const range = useMemo(() => dayRange(now), [now]);
  const board = useTeacherHomeworkBoard(user?.uid ?? "");
  const schedule = useTeacherSchedule(user?.uid ?? "", range);
  const planner = useTeacherPlanner(user?.uid ?? "");
  const todayKey = new Intl.DateTimeFormat("en-CA").format(new Date(now));
  const todayPlans = planner.data.items.filter(
    ({ data }) => data.active && data.date === todayKey && data.status !== "done",
  );
  const currentLessons = schedule.data.lessons.filter(({ data }) => isCurrentDashboardLesson(data.status));
  const overdue = board.data.homeworks.filter(
    ({ data }) =>
      data.status === "overdue" ||
      ((data.dueAt?.toMillis() ?? Infinity) < now &&
        !new Set(["checked", "submitted"]).has(data.status)),
  );
  const pending = board.data.submissions.filter(
    ({ data }) => data.status === "submitted",
  );
  const unfinished = currentLessons.filter(
    ({ data }) => data.status === "planned" && data.endAt.toMillis() < now,
  );
  const missingHomework = currentLessons.filter(
    ({ data }) =>
      data.status === "completed" &&
      (data.homeworkResolution ?? "pending") === "pending",
  );
  const unpaid = currentLessons.filter(
    ({ data }) =>
      data.status === "completed" && data.paymentStatus === "unpaid",
  );
  const attention = new Set([
    ...overdue.map(({ data }) => data.studentId),
    ...pending.map(({ data }) => data.studentId),
    ...unfinished.map(({ data }) => data.studentId),
  ]).size;
  const studentName = (id: string) =>
    board.data.students.find((item) => item.id === id)?.data.displayName ??
    "Ученик";

  return (
    <main
      className="shell-content teacher-dashboard"
      aria-labelledby="teacher-page-title"
    >
      <header className="teacher-dashboard-hero">
        <div>
          <p className="eyebrow">Сегодня в кабинете</p>
          <h1 id="teacher-page-title">Здравствуйте, {profile?.displayName ?? profile?.username}!</h1>
          <p>Уроки, работы и ученики — в одном рабочем пространстве.</p>
        </div>
        <Link
          className="primary-button primary-button--fit"
          to="/teacher/calendar"
        >
          Открыть расписание
        </Link>
      </header>
      <section className="teacher-stat-grid" aria-label="Сводка преподавателя">
        <Link to="/teacher/calendar">
          <span className="stat-icon stat-icon--violet">📅</span>
          <div>
            <span>Уроков сегодня</span>
            <strong data-testid="today-active-lesson-count">
              {currentLessons.length}
            </strong>
          </div>
        </Link>
        <Link to="/teacher/homeworks?filter=overdue">
          <span className="stat-icon stat-icon--coral">!</span>
          <div>
            <span>Просрочено ДЗ</span>
            <strong>{overdue.length}</strong>
          </div>
        </Link>
        <Link to="/teacher/homeworks?filter=pending">
          <span className="stat-icon stat-icon--blue">✓</span>
          <div>
            <span>Работ на проверку</span>
            <strong>{pending.length}</strong>
          </div>
        </Link>
        <Link to="/teacher/analytics">
          <span className="stat-icon stat-icon--pink">◇</span>
          <div>
            <span>Требуют внимания</span>
            <strong>{attention}</strong>
          </div>
        </Link>
      </section>
      <div className="teacher-home-layout">
        <section className="teacher-dashboard-panel teacher-today">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Расписание</p>
              <h2>Сегодняшние занятия</h2>
            </div>
            <Link to="/teacher/calendar">Весь календарь →</Link>
          </div>
          {currentLessons.length ? (
            <div className="today-lesson-list">
              {currentLessons.map(({ id, data }) => {
                const student = schedule.data.students.find(
                  ({ id: value }) => value === data.studentId,
                );
                return (
                  <article key={id}>
                    <time>
                      {lessonTime.format(data.startAt.toDate())}
                      {data.wasRescheduled && data.originalStartAt ? (
                        <small>
                          перенесено с{" "}
                          {lessonTime.format(data.originalStartAt.toDate())}
                        </small>
                      ) : null}
                    </time>
                    <Avatar
                      avatarKey={student?.data.avatarKey}
                      label={student?.data.displayName ?? "Ученик"}
                    />
                    <div>
                      <strong>{student?.data.displayName ?? "Ученик"}</strong>
                      <small>{data.topic || "Тема не указана"}</small>
                    </div>
                    <span className="status-chip">
                      {data.status === "completed"
                        ? "Проведён"
                        : "Запланирован"}
                    </span>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="content-state">На сегодня занятий нет.</p>
          )}
        </section>
        <aside className="teacher-dashboard-panel attention-panel">
          <p className="eyebrow">Центр внимания</p>
          <h2>Нужно сделать сегодня</h2>
          {unfinished.map(({ id, data }) => (
            <Action
              key={id}
              title={`${studentName(data.studentId)} · Не завершён урок`}
              subtitle="Заполнить итоги занятия"
              to={`/teacher/calendar?lesson=${id}`}
              warning
            />
          ))}
          {missingHomework.map(({ id, data }) => (
            <Action
              key={id}
              title={`${studentName(data.studentId)} · Не выдано ДЗ`}
              subtitle="Выдать ДЗ или отметить, что оно не требуется"
              to={`/teacher/students/${data.studentId}?tab=homework&sourceLesson=${id}`}
              warning
            />
          ))}
          {pending.slice(0, 4).map(({ id, data }) => (
            <Action
              key={id}
              title={`${studentName(data.studentId)} · Работа ждёт проверки`}
              subtitle="Открыть точное домашнее задание"
              to={`/teacher/homeworks?homework=${data.homeworkId}`}
            />
          ))}
          {unpaid.map(({ id, data }) => (
            <Action
              key={id}
              title={`${studentName(data.studentId)} · Проведено без оплаты`}
              subtitle="Проверить оплату занятия"
              to={`/teacher/calendar?lesson=${id}`}
              warning
            />
          ))}
          {!unfinished.length &&
          !missingHomework.length &&
          !pending.length &&
          !unpaid.length ? (
            <p className="content-state">Всё важное сделано. Отличный темп!</p>
          ) : null}
        </aside>
      </div>
      <section className="teacher-dashboard-panel planner-home-widget" data-testid="planner-home-widget">
        <div className="panel-heading">
          <div><p className="eyebrow">Личный план</p><h2>На сегодня</h2></div>
          <Link to="/teacher/planner">Открыть планер →</Link>
        </div>
        {todayPlans.length ? (
          <div className="planner-home-list">
            {todayPlans.slice(0, 5).map(({ id, data }) => (
              <Link key={id} to="/teacher/planner"><span>{data.startTime ?? "Без времени"}</span><strong>{data.title}</strong><small>{data.category === "work" ? "Работа" : data.category === "home" ? "Дом" : "Личное"}</small></Link>
            ))}
          </div>
        ) : <p className="content-state">Личных задач на сегодня нет.</p>}
      </section>
      <section className="teacher-dashboard-panel" id="students">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Ученики</p>
            <h2>Активные ученики</h2>
          </div>
          <Link to="/teacher/students">Открыть список →</Link>
        </div>
        <div className="dashboard-student-grid">
          {board.data.students.map(({ id, data }) => {
            const active = board.data.homeworks.filter(
              ({ data: homework }) =>
                homework.studentId === id && homework.status !== "checked",
            ).length;
            return (
              <Link
                className="dashboard-student"
                data-testid="student-card"
                key={id}
                to={`/teacher/students/${id}`}
              >
                <Avatar avatarKey={data.avatarKey} label={data.displayName} />
                <div>
                  <strong>{data.displayName}</strong>
                  <small>
                    {data.classGrade} класс · {active} активных ДЗ
                  </small>
                </div>
                <span>→</span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Action({
  title,
  subtitle,
  to,
  warning = false,
}: {
  title: string;
  subtitle: string;
  to: string;
  warning?: boolean;
}) {
  return (
    <Link to={to}>
      <span
        className={`attention-icon${warning ? " attention-icon--warning" : ""}`}
      >
        {warning ? "!" : "✓"}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <b>→</b>
    </Link>
  );
}

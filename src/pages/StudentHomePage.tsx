import { useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "../components/Modal";
import { calculateMockAnalytics } from "../features/analytics/mockAnalytics";
import { useAuth } from "../features/auth/AuthProvider";
import { useExternalPracticeAttempts } from "../features/external-practice/hooks";
import { secondaryScoreForPrimary } from "../features/exams/blueprints";
import { calculateGamificationSummary } from "../features/gamification/gamification";
import { useStudentGamification } from "../features/gamification/hooks";
import { useNextStudentLesson } from "../features/schedule/hooks";
import { NextLessonCard } from "../features/schedule/NextLessonCard";
import { useStudentWorkspace } from "../features/vertical-slice/hooks";
import {
  formatHomeworkDueDate,
  selectCurrentHomework,
  selectLatestMockExam,
} from "../features/vertical-slice/selectors";

function daysUntil(value: { toDate(): Date } | null | undefined) {
  if (!value) return null;
  return Math.max(0, Math.ceil((value.toDate().getTime() - Date.now()) / 86_400_000));
}

export function StudentHomePage() {
  const { profile } = useAuth();
  const studentId = profile?.studentId ?? "";
  const { data, loading, error } = useStudentWorkspace(studentId);
  const nextLesson = useNextStudentLesson(studentId);
  const gamification = useStudentGamification(studentId);
  const practice = useExternalPracticeAttempts(profile?.teacherId ?? "", studentId);
  const [xpOpen, setXpOpen] = useState(false);

  const currentHomework = selectCurrentHomework(data.homeworks);
  const latestMock = selectLatestMockExam(data.mockExams);
  const latestSecondaryScore = latestMock
    ? latestMock.data.secondaryScore
      ?? secondaryScoreForPrimary(
        latestMock.data.total.earned,
        data.examBlueprint?.data.secondaryScoreScale,
      )
    : null;
  const analytics = calculateMockAnalytics(data.mockExams, {
    confidenceAttempts: 3,
    weakThreshold: 45,
    strongThreshold: 75,
    totalExamTasks: data.examBlueprint?.data.tasks.length ?? 0,
    readinessWeights: { latestMock: 0.6, studiedMastery: 0.4 },
    taskWeights: Object.fromEntries(
      data.examBlueprint?.data.tasks.map((item) => [
        item.number,
        item.readinessWeight ?? item.maxScore,
      ]) ?? [],
    ),
  }, practice.data.filter(
    ({ data: attempt }) => attempt.examBlueprintId === data.examBlueprint?.id,
  ));
  const game = calculateGamificationSummary({
    ...gamification.data,
    submissions: data.homeworkSubmissions,
    homeworks: data.homeworks,
    mockExams: data.mockExams,
  });
  const examDays = daysUntil(data.programProfile?.data.examDate);
  const latestAchievement = game.earned[0];
  const unread = data.homeworkSubmissions
    .filter(({ data: item }) => item.status === "checked" && item.reviewedUnread)
    .sort((a, b) => b.data.updatedAt.toMillis() - a.data.updatedAt.toMillis())[0];
  const unreadHomework = unread
    ? data.homeworks.find(({ id }) => id === unread.data.homeworkId)
    : null;
  const readinessLabel = data.programProfile?.data.title
    ? `Готовность: ${data.programProfile.data.title}`
    : "Готовность по активной программе";

  if (!studentId) {
    return <section className="shell-content shell-notice">В профиле не указан studentId.</section>;
  }
  if (loading && !data.student) {
    return <section className="shell-content content-state">Загружаем кабинет…</section>;
  }

  return (
    <section className="shell-content student-dashboard" aria-labelledby="student-page-title">
      {error ? <p className="shell-notice" role="alert">{error}</p> : null}
      <header className="student-dashboard-hero">
        <div>
          <p className="eyebrow">Моя подготовка</p>
          <h1 id="student-page-title">Привет, {data.student?.data.displayName ?? profile?.username}!</h1>
          <p data-testid="student-program-title">{data.programProfile?.data.title ?? "Программа не назначена"}</p>
          {examDays !== null ? <span className="mobile-exam-countdown">До экзамена {examDays} дней</span> : null}
        </div>
        <Link className="hero-goal" to="/student/progress">
          <span>Главная цель</span>
          <strong data-testid="student-goal">{data.studentProgram?.data.goal.displayText ?? "Не задана"}</strong>
          <small>Посмотреть путь →</small>
        </Link>
      </header>

      {unread && unreadHomework ? (
        <Link className="reviewed-homework-event" to={`/student/homework?homework=${unread.data.homeworkId}`}>
          <span className="success-mark">✓</span>
          <span>
            <strong>Домашнее задание проверено</strong>
            <small>
              {unreadHomework.data.title}
              {unread.data.teacherEvaluation
                ? ` · ${unread.data.teacherEvaluation.scoreEarned ?? "—"}/${unread.data.teacherEvaluation.scoreMax ?? "—"}`
                : ""}
            </small>
          </span>
          <b>Посмотреть результат →</b>
        </Link>
      ) : null}

      <section className="student-stat-strip" aria-label="Ключевые показатели">
        <button onClick={() => setXpOpen(true)} type="button">
          <span>Уровень</span><strong>{game.level}</strong><small>{game.totalXp} XP · подробнее</small>
        </button>
        <Link to={currentHomework ? `/student/homework?homework=${currentHomework.id}` : "/student/homework"}>
          <span>Серия</span><strong>{game.streak || "—"}</strong>
          <small>{currentHomework ? "Продолжить текущее ДЗ" : "Новое задание пока не назначено"}</small>
        </Link>
        <article>
          <span>Последнее достижение</span>
          <strong>{latestAchievement?.definition?.data.title ?? "Впереди"}</strong>
          <small>{latestAchievement?.definition?.data.description ?? "Продолжай заниматься"}</small>
        </article>
      </section>

      <div className="student-home-layout">
        <section className="student-home-main">
          <NextLessonCard lesson={nextLesson.data} loading={nextLesson.loading} student={data.student?.data ?? null} timezone={profile?.timezone} />
          <Link
            aria-label="Открыть актуальное домашнее задание"
            className="dashboard-card dashboard-card--homework"
            data-testid="student-homework-card"
            to={currentHomework ? `/student/homework?homework=${currentHomework.id}` : "/student/homework"}
          >
            <div className="dashboard-card__top">
              <span className="summary-card__label">Актуальное ДЗ</span><span>Открыть →</span>
            </div>
            <strong data-testid="student-homework-title">{currentHomework?.data.title ?? "Нет активного задания"}</strong>
            <p>{currentHomework?.data.items?.slice(0, 3).map((item) => `${item.title}${item.examTaskNumbers.length ? ` (${item.examTaskNumbers.map((number) => `№${number}`).join(", ")})` : ""}`).join(" · ") || currentHomework?.data.description || "Можно немного отдохнуть."}</p>
            <span className="dashboard-card__meta">Срок: {currentHomework ? formatHomeworkDueDate(currentHomework.data) : "—"}</span>
          </Link>
        </section>
        <aside className="student-home-aside">
          <Link className="readiness-card" to="/student/progress">
            <span className="progress-ring" style={{ "--progress": `${analytics.examReadiness * 3.6}deg` } as React.CSSProperties}>
              <strong>{analytics.examReadiness}%</strong>
            </span>
            <div>
              <span className="summary-card__label">{readinessLabel}</span>
              <p>{analytics.masteryByTask.length} заданий с данными · {analytics.weakTasks.length} требуют внимания.</p>
              <small>Посмотреть прогресс →</small>
            </div>
          </Link>
          <Link className="dashboard-card" data-testid="student-mock-card" to={latestMock ? `/student/progress?mock=${latestMock.id}` : "/student/progress"}>
            <span className="summary-card__label">Последний результат</span>
            <strong data-testid="student-mock-title">{latestMock?.data.title ?? "Пока нет результата"}</strong>
            {latestMock ? (
              <div className="mock-score">
                <span>{latestMock.data.total.earned}/{latestMock.data.total.max}</span>
                <small>
                  {latestSecondaryScore !== null
                    ? `Тестовый балл ${latestSecondaryScore}/100`
                    : `Оценка ${latestMock.data.grade}`}
                </small>
              </div>
            ) : <p>Результат появится после пробника.</p>}
          </Link>
        </aside>
      </div>

      {xpOpen ? (
        <Modal onClose={() => setXpOpen(false)} title="Уровень и XP">
          <div className="xp-summary"><strong>{game.totalXp} XP</strong><span>Уровень {game.level}</span><progress max={100} value={game.totalXp % 100} /></div>
          <h3>Последние события</h3>
          <ul className="xp-events">
            {gamification.data.events.slice(0, 8).map(({ id, data: event }) => (
              <li key={id}>
                <span>{event.eventType === "homework_completed" ? "Домашняя работа" : event.eventType === "lesson_completed" ? "Занятие" : "Пробник"}</span>
                <strong>+{event.xpDelta} XP</strong>
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}
    </section>
  );
}

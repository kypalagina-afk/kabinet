import { Link, useParams } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { NextLessonCard } from "../features/schedule/NextLessonCard";
import { useTeacherStudentWorkspace } from "../features/vertical-slice/hooks";
import { selectCurrentHomework, selectNearestLesson } from "../features/vertical-slice/selectors";

export function TeacherStudentPreviewPage() {
  const { studentId = "" } = useParams();
  const { user } = useAuth();
  const { data, loading, error } = useTeacherStudentWorkspace(user?.uid ?? "", studentId);
  const lesson = selectNearestLesson(data.lessons);
  const homework = selectCurrentHomework(data.homeworks);
  return <main className="shell-content preview-shell" aria-labelledby="preview-title">
    <div className="preview-banner"><strong>Режим просмотра преподавателя</strong><span>Действия ученика отключены.</span><Link to={`/teacher/students/${studentId}`}>Вернуться в карточку</Link></div>
    {loading ? <p className="content-state">Загружаем кабинет ученика…</p> : null}{error ? <p className="shell-notice">{error}</p> : null}
    {data.student ? <><header className="student-dashboard-hero"><div><p className="eyebrow">Как видит ученик</p><h1 id="preview-title">Привет, {data.student.data.displayName}!</h1><p>{data.programProfile?.data.title}</p></div><div className="hero-goal"><span>Главная цель</span><strong>{data.studentProgram?.data.goal.displayText ?? "Не задана"}</strong></div></header><div className="student-home-layout"><section className="student-home-main"><NextLessonCard lesson={lesson} loading={false} student={data.student.data} timezone={data.studentUser?.data.timezone} /><article className="dashboard-card dashboard-card--homework"><span className="summary-card__label">Актуальное ДЗ</span><strong>{homework?.data.title ?? "Нет активного задания"}</strong><p>{homework?.data.description ?? "Можно немного отдохнуть."}</p></article></section></div></> : null}
  </main>;
}

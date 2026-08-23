import { useAuth } from "../features/auth/AuthProvider";
import { LessonJournal } from "../features/schedule/LessonJournal";
import { useStudentWorkspace } from "../features/vertical-slice/hooks";

export function StudentLessonsPage() {
  const { profile } = useAuth(); const { data, loading, error } = useStudentWorkspace(profile?.studentId ?? ""); const defaultLink = data.student?.data.conferenceLinks?.find((item) => item.isDefault)?.joinUrl ?? data.student?.data.defaultConference.joinUrl;
  return <section className="shell-content" aria-labelledby="lessons-title"><header className="page-heading"><p className="eyebrow">История</p><h1 id="lessons-title">Мои занятия</h1><p>Что уже разобрали и на что обратить внимание дальше.</p></header>{defaultLink ? <section className="join-lesson-banner"><div><span className="summary-card__label">Подключение к занятиям</span><strong>Постоянная ссылка</strong></div><a className="primary-button primary-button--fit" href={defaultLink} rel="noreferrer" target="_blank">Подключиться</a></section> : null}{loading ? <p className="content-state">Загружаем занятия…</p> : null}{error ? <p className="shell-notice">{error}</p> : null}<LessonJournal audience="student" homeworks={data.homeworks} lessons={data.lessons} timezone={profile?.timezone} /></section>;
}

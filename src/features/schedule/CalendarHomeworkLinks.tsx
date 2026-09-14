import { Link } from "react-router-dom";
import type { DocumentWithId, Lesson, Student } from "../../lib/firebase/types";
import type { HomeworkSelection } from "../../lib/firebase/repositories/homeworkSelectionRepository";
import { calendarHomeworkReview, homeworksForLesson } from "./calendarHomework";

export function CalendarHomeworkLinks({ lesson, lessons, students, data, loading, error, onSelectLesson }: {
  lesson: DocumentWithId<Lesson>;
  lessons: Array<DocumentWithId<Lesson>>;
  students: Array<DocumentWithId<Student>>;
  data: HomeworkSelection;
  loading: boolean;
  error: string | null;
  onSelectLesson: (id: string) => void;
}) {
  if (!["planned", "completed"].includes(lesson.data.status) || lesson.data.pairReplaced) return null;
  if (loading) return <small>Загрузка ДЗ…</small>;
  if (error) return <small role="status">Статус ДЗ недоступен</small>;
  const partner = lessons.find(({ id, data: item }) => id === lesson.data.pairedLessonId && item.teacherId === lesson.data.teacherId && !item.pairReplaced);
  const members = partner ? [lesson, partner] : [lesson];
  return <div className="calendar-homework-links" onClick={(event) => event.stopPropagation()}>
    {members.map((member) => {
      const name = students.find(({ id }) => id === member.data.studentId)?.data.displayName ?? "Ученик";
      const homeworks = homeworksForLesson(member, data.homeworks);
      if (homeworks.length) return homeworks.map((homework) => {
        const review = calendarHomeworkReview(homework.data, data.submissions.filter(({ data: item }) => item.homeworkId === homework.id && item.studentId === member.data.studentId && item.teacherId === member.data.teacherId).map(({ data: item }) => item));
        return <Link key={`${member.id}-${homework.id}`} className={`calendar-homework-link calendar-homework-link--${review.tone}`}
          to={`/teacher/homeworks?homework=${encodeURIComponent(homework.id)}&student=${encodeURIComponent(member.data.studentId)}`}
          title={`${name}: ${homework.data.title}. ${review.label}. Открыть ДЗ и проверку`}>
          {members.length > 1 ? <b>{name}</b> : null}
          <span>{review.label}</span>
          <span className="calendar-homework-link__title">{homework.data.title} →</span>
        </Link>;
      });
      const resolution = member.data.homeworkResolution;
      const label = resolution === "not_required" ? "ДЗ не требуется"
        : resolution === "assigned" ? (member.data.homeworkAssignedExternally ? "ДЗ выдано вне платформы" : "ДЗ выдано · Уточнить связь")
        : "ДЗ не выдано / не отмечено";
      return <button key={member.id} type="button" className={`calendar-homework-link calendar-homework-link--${resolution === "pending" || !resolution ? "missing" : "waiting"}`}
        onClick={() => onSelectLesson(member.id)} title={`${name}: ${label}. Открыть отметки выдачи ДЗ`}>
        {members.length > 1 ? <b>{name}</b> : null}<span>{label}</span>
      </button>;
    })}
  </div>;
}

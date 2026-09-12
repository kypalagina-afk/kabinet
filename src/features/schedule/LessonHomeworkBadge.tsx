import type { DocumentWithId, Lesson, Student } from "../../lib/firebase/types";
import { missingHomeworkParticipants } from "./lessonHomework";

export function LessonHomeworkBadge({ lesson, lessons, students }: {
  lesson: DocumentWithId<Lesson>;
  lessons: Array<DocumentWithId<Lesson>>;
  students: Array<DocumentWithId<Student>>;
}) {
  const missing = missingHomeworkParticipants(lesson, lessons);
  if (!missing.length) return null;
  const names = missing.map(({ data }) => students.find(({ id }) => id === data.studentId)?.data.displayName ?? "Ученик");
  const description = `Выдача ДЗ не отмечена: ${names.join(", ")}`;
  return <small className="lesson-homework-badge" title={description} aria-label={description}>
    <b className="lesson-homework-badge__full" aria-hidden="true">ДЗ не отмечено{lesson.data.pairedLessonId ? ` · ${missing.length}/2` : ""}</b>
    <b className="lesson-homework-badge__compact" aria-hidden="true">ДЗ!</b>
  </small>;
}

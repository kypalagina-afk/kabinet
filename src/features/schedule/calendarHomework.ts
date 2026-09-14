import type { DocumentWithId, Homework, HomeworkSubmission, Lesson } from "../../lib/firebase/types.js";
import { homeworkReviewProgress } from "../homework/reviewProgress.js";

export function homeworksForLesson(lesson: DocumentWithId<Lesson>, homeworks: Array<DocumentWithId<Homework>>) {
  return homeworks.filter(({ id, data }) => !data.draft
    && data.teacherId === lesson.data.teacherId && data.studentId === lesson.data.studentId
    && (data.sourceLessonId === lesson.id || (id === lesson.data.linkedHomeworkId && !data.sourceLessonId)));
}

export function calendarHomeworkReview(homework: Homework, submissions: HomeworkSubmission[]) {
  const progress = homeworkReviewProgress(homework, submissions);
  if (progress.checked === progress.total) return { tone: "checked", label: "ДЗ выдано · Проверено" };
  if (progress.pending > 0) return { tone: "pending", label: `ДЗ выдано · Ждёт проверки${progress.total > 1 ? ` ${progress.pending}/${progress.total}` : ""}` };
  if (progress.revision > 0) return { tone: "pending", label: "ДЗ выдано · На доработке" };
  if (progress.checked > 0) return { tone: "waiting", label: `Проверено ${progress.checked}/${progress.total} · Остальное не сдано` };
  return { tone: "waiting", label: "ДЗ выдано · Не сдано" };
}

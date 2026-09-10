import type { DocumentWithId, Lesson } from "../../lib/firebase/types.js";

export function needsLessonHomework(lesson: Lesson): boolean {
  return !lesson.pairReplaced && lesson.status === "completed"
    && (lesson.homeworkResolution ?? "pending") === "pending";
}

export function missingHomeworkParticipants(
  lesson: DocumentWithId<Lesson>,
  lessons: Array<DocumentWithId<Lesson>>,
): Array<DocumentWithId<Lesson>> {
  const partner = lesson.data.pairedLessonId
    ? lessons.find(({ id, data }) => id === lesson.data.pairedLessonId
      && data.teacherId === lesson.data.teacherId
      && data.studentId === lesson.data.pairedStudentId)
    : undefined;
  return [lesson, ...(partner ? [partner] : [])].filter(({ data }) => needsLessonHomework(data));
}

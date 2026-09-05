import type { DocumentWithId, Lesson, Student } from "../../lib/firebase/types.js";

export function studentPairId(firstStudentId: string, secondStudentId: string) {
  const ids = [firstStudentId.trim(), secondStudentId.trim()].sort();
  if (!ids[0] || !ids[1] || ids[0] === ids[1]) {
    throw new Error("Для пары выберите двух разных учеников.");
  }
  return `pair__${ids[0]}__${ids[1]}`;
}

export function sharedPairLessonId(pairId: string, startMs: number) {
  return `${pairId}__lesson__${startMs}`;
}

export function visibleCalendarLessons(
  lessons: Array<DocumentWithId<Lesson>>,
  selectedStudentId = "",
) {
  const available = lessons.filter(({ data }) => !data.pairReplaced);
  const filtered = selectedStudentId
    ? available.filter(({ data }) => data.studentId === selectedStudentId)
    : available;
  const unique = new Map<string, DocumentWithId<Lesson>>();
  for (const lesson of filtered) {
    const key = lesson.data.sharedLessonId ?? lesson.id;
    const current = unique.get(key);
    if (!current || lesson.data.pairPrimary) unique.set(key, lesson);
  }
  return [...unique.values()].sort(
    (left, right) => left.data.startAt.toMillis() - right.data.startAt.toMillis(),
  );
}

export function lessonParticipantLabel(
  lesson: Lesson,
  students: Array<DocumentWithId<Student>>,
) {
  const first = students.find(({ id }) => id === lesson.studentId)?.data.displayName ?? "Ученик";
  if (!lesson.pairedStudentId) return first;
  const second = students.find(({ id }) => id === lesson.pairedStudentId)?.data.displayName ?? "Ученик";
  return `${first} + ${second}`;
}

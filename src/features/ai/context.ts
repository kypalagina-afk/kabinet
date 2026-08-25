import type { DocumentWithId, Lesson, PlannerItem, Student } from "../../lib/firebase/types.js";
import type { TeacherAIContext } from "./schema.js";

export function buildTeacherAIContext(input: {
  teacherId: string;
  today: string;
  timezone: string;
  selectedStudentId: string | null;
  students: Array<DocumentWithId<Student>>;
  lessons: Array<DocumentWithId<Lesson>>;
  plannerItems: Array<DocumentWithId<PlannerItem>>;
}): TeacherAIContext {
  return {
    teacherId: input.teacherId,
    today: input.today,
    timezone: input.timezone,
    selectedStudentId: input.selectedStudentId,
    students: input.students.filter(({ data }) => data.teacherId === input.teacherId).map(({ id, data }) => ({ id, displayName: data.displayName })),
    lessons: input.lessons.filter(({ data }) => data.teacherId === input.teacherId).map(({ id, data }) => ({ id, studentId: data.studentId, startAtMillis: data.startAt.toMillis(), endAtMillis: data.endAt.toMillis(), updatedAtMillis: data.updatedAt?.toMillis() ?? null, status: data.status, topic: data.topic })),
    plannerItems: input.plannerItems.filter(({ data }) => data.teacherId === input.teacherId && data.active && data.recordType !== "recurrence").map(({ id, data }) => ({ id, title: data.title, date: data.date, startTime: data.startTime, category: data.category, updatedAtMillis: data.updatedAt?.toMillis() ?? null })),
  };
}

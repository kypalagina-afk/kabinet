import type { DocumentWithId, Lesson, PlannerItem } from "../../lib/firebase/types.js";
import { dateKeyForTimezone, type ResolvedTimezone } from "../schedule/timezone.js";
import { visibleCalendarLessons } from "../schedule/studentPairs.js";

// View-only participants: never written back to Firestore.
export type PlannerLessonData = Lesson & { plannerParticipants?: Array<DocumentWithId<Lesson>> };

export function plannerLessonMembers(lesson: DocumentWithId<PlannerLessonData>) {
  return lesson.data.plannerParticipants ?? [lesson];
}

export function plannerLessonGroups(lessons: Array<DocumentWithId<Lesson>>) {
  return visibleCalendarLessons(lessons).map((lesson): DocumentWithId<PlannerLessonData> => {
    const partner = lessons.find(({ id, data }) => id === lesson.data.pairedLessonId && data.teacherId === lesson.data.teacherId && data.studentId === lesson.data.pairedStudentId && isPlannerVisibleLesson(data));
    return { ...lesson, data: { ...lesson.data, plannerParticipants: [lesson, ...(partner ? [partner] : [])] } };
  });
}

export function lessonPlannerChecks(lesson: PlannerLessonData) {
  const members = lesson.plannerParticipants?.map(({ data }) => data) ?? [lesson];
  return {
    lesson: members.every((data) => data.status === "completed" || Boolean(data.plannerCompletedAt)),
    preparation: members.every((data) => Boolean(data.plannerPreparationCompletedAt)),
    report: members.every((data) => data.status === "completed"),
    homework: members.every((data) => data.homeworkResolution === "assigned" || data.homeworkResolution === "not_required"),
  };
}

export interface PlannerDayProgress {
  completed: number;
  total: number;
  percent: number;
}

export type PlannerProgressStage = "rest" | "starting" | "working" | "almost" | "complete";

export function isPlannerVisibleLesson(lesson: Lesson): boolean {
  return !lesson.pairReplaced && (lesson.status === "planned" || lesson.status === "completed");
}

export interface CarriedLessonTask {
  lesson: DocumentWithId<Lesson>;
  kind: "lesson" | "preparation" | "wrap-up" | "homework";
  done: boolean;
  originalDate: string;
}

export function carriedLessonTasks(lessons: Array<DocumentWithId<Lesson>>, today: string, timezone: ResolvedTimezone): CarriedLessonTask[] {
  return lessons.flatMap((lesson) => {
    if (!isPlannerVisibleLesson(lesson.data)) return [];
    const originalDate = dateKeyForTimezone(lesson.data.startAt.toDate(), timezone);
    if (originalDate >= today) return [];
    const state = lessonPlannerChecks(lesson.data);
    const members = plannerLessonMembers(lesson);
    const latest = (field: (data: Lesson) => Lesson["plannerCompletedAt"]) => members.map(({ data }) => field(data)).filter((value) => value != null).sort((a, b) => b.toMillis() - a.toMillis())[0];
    const checks = [
      { kind: "lesson" as const, done: state.lesson, at: latest((data) => data.status === "completed" ? data.lessonReportCompletedAt ?? data.plannerCompletedAt : data.plannerCompletedAt) },
      { kind: "preparation" as const, done: state.preparation, at: latest((data) => data.plannerPreparationCompletedAt) },
      { kind: "wrap-up" as const, done: state.report, at: latest((data) => data.lessonReportCompletedAt) },
      { kind: "homework" as const, done: state.homework, at: latest((data) => data.plannerWrapUpCompletedAt) },
    ];
    return checks.filter(({ done, at }) => !done || (at && dateKeyForTimezone(at.toDate(), timezone) === today))
      .map(({ kind, done }) => ({ lesson, kind, done, originalDate }));
  });
}

export function isLessonWrapUpCompleted(lesson: Lesson): boolean {
  return lesson.status === "completed"
    && (lesson.homeworkResolution === "assigned" || lesson.homeworkResolution === "not_required");
}

export function calculatePlannerDayProgress(
  items: Array<DocumentWithId<PlannerItem>>,
  lessons: Array<DocumentWithId<Lesson>>,
  carried: CarriedLessonTask[] = [],
): PlannerDayProgress {
  const activeItems = items.filter(({ data }) =>
    data.active
    && data.category !== "someday"
    && data.recordType !== "recurrence"
  );
  const visibleLessons = lessons.filter(({ data }) => isPlannerVisibleLesson(data));
  const total = activeItems.length + visibleLessons.length * 4 + carried.length;
  const completed = activeItems.filter(({ data }) => data.status === "done").length
    + visibleLessons.reduce((count, { data }) => count + Object.values(lessonPlannerChecks(data)).filter(Boolean).length, 0)
    + carried.filter((task) => task.done).length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}

export function plannerProgressStage(progress: PlannerDayProgress): PlannerProgressStage {
  if (progress.total === 0 || progress.percent === 0) return "rest";
  if (progress.percent < 30) return "starting";
  if (progress.percent < 70) return "working";
  if (progress.percent < 100) return "almost";
  return "complete";
}

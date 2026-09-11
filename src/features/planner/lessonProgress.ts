import type { DocumentWithId, Lesson, PlannerItem } from "../../lib/firebase/types.js";
import { dateKeyForTimezone, type ResolvedTimezone } from "../schedule/timezone.js";

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
  kind: "lesson" | "preparation" | "wrap-up";
  done: boolean;
  originalDate: string;
}

export function carriedLessonTasks(lessons: Array<DocumentWithId<Lesson>>, today: string, timezone: ResolvedTimezone): CarriedLessonTask[] {
  return lessons.flatMap((lesson) => {
    if (!isPlannerVisibleLesson(lesson.data)) return [];
    const originalDate = dateKeyForTimezone(lesson.data.startAt.toDate(), timezone);
    if (originalDate >= today) return [];
    const checks = [
      { kind: "lesson" as const, done: Boolean(lesson.data.plannerCompletedAt), at: lesson.data.plannerCompletedAt },
      { kind: "preparation" as const, done: Boolean(lesson.data.plannerPreparationCompletedAt), at: lesson.data.plannerPreparationCompletedAt },
      { kind: "wrap-up" as const, done: isLessonWrapUpCompleted(lesson.data), at: lesson.data.plannerWrapUpCompletedAt },
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
  const total = activeItems.length + visibleLessons.length * 3 + carried.length;
  const completed = activeItems.filter(({ data }) => data.status === "done").length
    + visibleLessons.reduce((count, { data }) => count
      + Number(Boolean(data.plannerPreparationCompletedAt))
      + Number(Boolean(data.plannerCompletedAt))
      + Number(isLessonWrapUpCompleted(data)), 0) + carried.filter((task) => task.done).length;
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

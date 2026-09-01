import type { DocumentWithId, Lesson, PlannerItem } from "../../lib/firebase/types.js";

export interface PlannerDayProgress {
  completed: number;
  total: number;
  percent: number;
}

export type PlannerProgressStage = "rest" | "starting" | "working" | "almost" | "complete";

export function isPlannerVisibleLesson(lesson: Lesson): boolean {
  return lesson.status === "planned" || lesson.status === "completed";
}

export function isLessonWrapUpCompleted(lesson: Lesson): boolean {
  return lesson.status === "completed"
    && (lesson.homeworkResolution === "assigned" || lesson.homeworkResolution === "not_required");
}

export function calculatePlannerDayProgress(
  items: Array<DocumentWithId<PlannerItem>>,
  lessons: Array<DocumentWithId<Lesson>>,
): PlannerDayProgress {
  const activeItems = items.filter(({ data }) =>
    data.active
    && data.category !== "someday"
    && data.recordType !== "recurrence"
  );
  const visibleLessons = lessons.filter(({ data }) => isPlannerVisibleLesson(data));
  const total = activeItems.length + visibleLessons.length * 3;
  const completed = activeItems.filter(({ data }) => data.status === "done").length
    + visibleLessons.reduce((count, { data }) => count
      + Number(Boolean(data.plannerPreparationCompletedAt))
      + Number(Boolean(data.plannerCompletedAt))
      + Number(isLessonWrapUpCompleted(data)), 0);
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

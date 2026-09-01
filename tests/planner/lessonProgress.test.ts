import { describe, expect, test } from "vitest";
import {
  calculatePlannerDayProgress,
  isPlannerVisibleLesson,
  plannerProgressStage,
} from "../../src/features/planner/lessonProgress.js";
import type { DocumentWithId, Lesson, PlannerItem } from "../../src/lib/firebase/types.js";

function item(status: PlannerItem["status"]): DocumentWithId<PlannerItem> {
  return {
    id: `item-${status}`,
    data: {
      teacherId: "teacher",
      itemType: "task",
      title: "Задача",
      category: "work",
      status,
      date: "2026-09-01",
      startTime: null,
      endTime: null,
      durationMinutes: null,
      deadline: null,
      notes: null,
      priority: "medium",
      goalId: null,
      subgoalId: null,
      sortOrder: 1,
      completedAt: null,
      active: true,
      schemaVersion: 1,
      createdAt: null!,
      updatedAt: null!,
    },
  };
}

function lesson(patch: Partial<Lesson> = {}): DocumentWithId<Lesson> {
  return {
    id: "lesson",
    data: {
      teacherId: "teacher",
      studentId: "student",
      studentProgramId: null,
      lessonSeriesId: null,
      startAt: null!,
      endAt: null!,
      originalStartAt: null,
      rescheduledFromLessonId: null,
      rescheduledToLessonId: null,
      status: "planned",
      topic: null,
      lessonSummary: { homeworkResultText: null, teacherComment: null, focusNotes: [] },
      paymentStatus: "unknown",
      schemaVersion: 1,
      createdAt: null!,
      updatedAt: null!,
      ...patch,
    },
  };
}

describe("planner lesson progress", () => {
  test("hides cancelled and replaced lesson occurrences", () => {
    expect(isPlannerVisibleLesson(lesson().data)).toBe(true);
    expect(isPlannerVisibleLesson(lesson({ status: "completed" }).data)).toBe(true);
    expect(isPlannerVisibleLesson(lesson({ status: "cancelled_student" }).data)).toBe(false);
    expect(isPlannerVisibleLesson(lesson({ status: "cancelled_teacher" }).data)).toBe(false);
    expect(isPlannerVisibleLesson(lesson({ status: "rescheduled" }).data)).toBe(false);
  });

  test("counts a lesson as preparation, planner check and wrap-up", () => {
    const progress = calculatePlannerDayProgress(
      [item("done"), item("todo")],
      [lesson({
        status: "completed",
        homeworkResolution: "assigned",
        plannerCompletedAt: {} as Lesson["plannerCompletedAt"],
        plannerPreparationCompletedAt: {} as Lesson["plannerPreparationCompletedAt"],
      })],
    );
    expect(progress).toEqual({ completed: 4, total: 5, percent: 80 });
    expect(plannerProgressStage(progress)).toBe("almost");
  });

  test("does not count cancelled lessons or backlog", () => {
    const backlog = item("backlog");
    backlog.data.category = "someday";
    expect(calculatePlannerDayProgress(
      [backlog],
      [lesson({ status: "cancelled_teacher" })],
    )).toEqual({ completed: 0, total: 0, percent: 0 });
  });
});

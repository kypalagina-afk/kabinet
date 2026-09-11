import { describe, expect, test } from "vitest";
import { Timestamp } from "firebase/firestore";
import { resolveTimezone } from "../../src/features/schedule/timezone.js";
import {
  calculatePlannerDayProgress,
  carriedLessonTasks,
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
  const timezone = resolveTimezone({ iana: "Asia/Novosibirsk", moscowOffsetMinutes: 420 });
  const at = (value: string) => Timestamp.fromDate(new Date(value));
  const previous = (patch: Partial<Lesson> = {}) => lesson({ startAt: at("2026-09-10T12:00:00Z"), ...patch });

  test("carries unfinished lesson checks and wrap-up but not yesterday's completed preparation", () => {
    const source = previous({ plannerPreparationCompletedAt: at("2026-09-10T10:00:00Z") });
    expect(carriedLessonTasks([source], "2026-09-11", timezone).map(({ kind }) => kind)).toEqual(["lesson", "wrap-up"]);
    expect(source.data.startAt.toMillis()).toBe(at("2026-09-10T12:00:00Z").toMillis());
  });

  test("keeps carrying across missed days without copying lessons", () => {
    expect(carriedLessonTasks([previous()], "2026-09-15", timezone)).toHaveLength(3);
  });

  test.each(["cancelled_student", "cancelled_teacher", "rescheduled"] as const)("excludes %s lessons from carry", (status) => {
    expect(carriedLessonTasks([previous({ status })], "2026-09-11", timezone)).toEqual([]);
  });

  test("excludes replaced, today's and future lessons", () => {
    expect(carriedLessonTasks([previous({ pairReplaced: true })], "2026-09-11", timezone)).toEqual([]);
    expect(carriedLessonTasks([previous()], "2026-09-10", timezone)).toEqual([]);
    expect(carriedLessonTasks([previous()], "2026-09-09", timezone)).toEqual([]);
  });

  test("keeps today's completed carry in progress until the next local day", () => {
    const today = at("2026-09-10T18:00:00Z"); // Already September 11 in Novosibirsk.
    const source = previous({ status: "completed", homeworkResolution: "assigned", plannerPreparationCompletedAt: today, plannerCompletedAt: today, plannerWrapUpCompletedAt: today });
    const carried = carriedLessonTasks([source], "2026-09-11", timezone);
    expect(carried).toHaveLength(3);
    expect(calculatePlannerDayProgress([], [], carried)).toEqual({ completed: 3, total: 3, percent: 100 });
    expect(carriedLessonTasks([source], "2026-09-12", timezone)).toEqual([]);
  });

  test("does not reopen a finished wrap-up due to an unrelated edit today", () => {
    const source = previous({ status: "completed", homeworkResolution: "not_required", updatedAt: at("2026-09-11T10:00:00Z"), plannerPreparationCompletedAt: at("2026-09-10T11:00:00Z"), plannerCompletedAt: at("2026-09-10T11:00:00Z") });
    expect(carriedLessonTasks([source], "2026-09-11", timezone)).toEqual([]);
  });

  test("includes carried work in the day denominator, without three extra tasks per lesson", () => {
    const carried = carriedLessonTasks([previous({ plannerPreparationCompletedAt: at("2026-09-10T10:00:00Z") })], "2026-09-11", timezone);
    expect(calculatePlannerDayProgress([item("done")], [], carried)).toEqual({ completed: 1, total: 3, percent: 33 });
  });

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

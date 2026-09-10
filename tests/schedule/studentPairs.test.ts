import { Timestamp } from "firebase/firestore";
import { missingHomeworkParticipants, needsLessonHomework } from "../../src/features/schedule/lessonHomework.js";
import { describe, expect, test } from "vitest";
import {
  lessonParticipantLabel,
  studentPairId,
  visibleCalendarLessons,
} from "../../src/features/schedule/studentPairs.js";
import type { DocumentWithId, Lesson, Student } from "../../src/lib/firebase/types.js";

function lesson(
  id: string,
  studentId: string,
  overrides: Partial<Lesson> = {},
): DocumentWithId<Lesson> {
  const now = Timestamp.fromMillis(1_000);
  return {
    id,
    data: {
      teacherId: "teacher",
      studentId,
      studentProgramId: `${studentId}-program`,
      lessonSeriesId: null,
      startAt: now,
      endAt: Timestamp.fromMillis(2_000),
      originalStartAt: null,
      rescheduledFromLessonId: null,
      rescheduledToLessonId: null,
      status: "planned",
      topic: null,
      lessonSummary: {
        homeworkResultText: null,
        teacherComment: null,
        focusNotes: [],
      },
      paymentStatus: "unpaid",
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      ...overrides,
    },
  };
}

describe("student pairs", () => {
  test.each(["planned", "rescheduled", "cancelled_student", "cancelled_teacher"] as const)(
    "does not warn about homework for a %s lesson", (status) => {
      expect(needsLessonHomework(lesson("a", "alex", { status }).data)).toBe(false);
    },
  );

  test("warns only for completed lessons requiring homework", () => {
    expect(needsLessonHomework(lesson("a", "alex", { status: "completed" }).data)).toBe(true);
    for (const homeworkResolution of ["assigned", "not_required"] as const) {
      expect(needsLessonHomework(lesson("a", "alex", { status: "completed", homeworkResolution }).data)).toBe(false);
    }
    expect(needsLessonHomework(lesson("a", "alex", { status: "completed", pairReplaced: true }).data)).toBe(false);
  });

  test("a pair badge detects the second pupil's missing homework and clears after assignment", () => {
    const first = lesson("a", "alex", { status: "completed", pairedLessonId: "b", pairedStudentId: "lera", homeworkResolution: "assigned" });
    const second = lesson("b", "lera", { status: "completed", pairedLessonId: "a", pairedStudentId: "alex" });
    expect(missingHomeworkParticipants(first, [first, second]).map(({ id }) => id)).toEqual(["b"]);
    second.data.homeworkResolution = "assigned";
    expect(missingHomeworkParticipants(first, [first, second])).toEqual([]);
  });

  test("both pair participants are listed when both need homework", () => {
    const first = lesson("a", "alex", { status: "completed", pairedLessonId: "b", pairedStudentId: "lera" });
    const second = lesson("b", "lera", { status: "completed" });
    expect(missingHomeworkParticipants(first, [first, second]).map(({ id }) => id)).toEqual(["a", "b"]);
  });

  test("creates the same stable pair id regardless of selection order", () => {
    expect(studentPairId("lera", "alex")).toBe(studentPairId("alex", "lera"));
  });

  test("shows one calendar entry for two linked student lessons", () => {
    const first = lesson("lesson-a", "alex", {
      pairedStudentId: "lera",
      pairedLessonId: "lesson-b",
      sharedLessonId: "shared",
      pairPrimary: true,
    });
    const second = lesson("lesson-b", "lera", {
      pairedStudentId: "alex",
      pairedLessonId: "lesson-a",
      sharedLessonId: "shared",
      pairPrimary: false,
    });
    expect(visibleCalendarLessons([second, first]).map(({ id }) => id)).toEqual([
      "lesson-a",
    ]);
    expect(visibleCalendarLessons([second, first], "lera").map(({ id }) => id)).toEqual([
      "lesson-b",
    ]);
  });

  test("renders both participant names", () => {
    const now = Timestamp.fromMillis(1_000);
    const students: Array<DocumentWithId<Student>> = [
      { id: "alex", data: { teacherId: "teacher", displayName: "Александр", classGrade: 11, status: "active", defaultConference: { provider: "other", joinUrl: null, meetingId: null, passcode: null, chatUrl: null }, archivedAt: null, createdAt: now, updatedAt: now, schemaVersion: 1 } },
      { id: "lera", data: { teacherId: "teacher", displayName: "Лера", classGrade: 11, status: "active", defaultConference: { provider: "other", joinUrl: null, meetingId: null, passcode: null, chatUrl: null }, archivedAt: null, createdAt: now, updatedAt: now, schemaVersion: 1 } },
    ];
    expect(
      lessonParticipantLabel(
        lesson("lesson-a", "alex", { pairedStudentId: "lera" }).data,
        students,
      ),
    ).toBe("Александр + Лера");
  });
});

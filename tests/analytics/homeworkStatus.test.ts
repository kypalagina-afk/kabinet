import { Timestamp } from "firebase/firestore";
import { describe, expect, test } from "vitest";
import {
  effectiveHomeworkStatus,
  homeworkDeadlineAt,
} from "../../src/features/homework/selectors.js";
import { selectCurrentHomework } from "../../src/features/vertical-slice/selectors.js";
import type { DocumentWithId, Homework } from "../../src/lib/firebase/types.js";

const assignedAt = Timestamp.fromDate(new Date("2026-08-20T08:00:00.000Z"));
function homework(id: string, patch: Partial<Homework> = {}): DocumentWithId<Homework> {
  return { id, data: {
    teacherId: "teacher", studentId: "student", studentProgramId: "program",
    sourceLessonId: null, type: "practice", title: id, description: null,
    examTaskNumbers: [], assignedAt, dueAt: null, dueDate: null, dueTime: null,
    dueTimezone: "Europe/Moscow", status: "assigned", requiredAmount: null,
    createdAt: assignedAt, updatedAt: assignedAt, schemaVersion: 1, ...patch,
  } };
}

describe("effective homework status", () => {
  const now = Date.parse("2026-08-23T21:00:00.000Z");
  test("uses dueAt when an exact deadline exists", () => {
    expect(effectiveHomeworkStatus(homework("due", { dueAt: Timestamp.fromMillis(now - 1) }).data, now)).toBe("overdue");
  });
  test("date-only expires at end of day in Europe/Moscow, not browser timezone", () => {
    const item = homework("date", { dueDate: "2026-08-23" }).data;
    expect(homeworkDeadlineAt(item)).toBe(Date.parse("2026-08-23T20:59:59.999Z"));
    expect(effectiveHomeworkStatus(item, now)).toBe("overdue");
  });
  test("revision, submitted and reviewed states are authoritative", () => {
    expect(effectiveHomeworkStatus(homework("revision", { status: "needs_revision", dueDate: "2026-08-01" }).data, now)).toBe("needs_revision");
    expect(effectiveHomeworkStatus(homework("submitted", { status: "submitted", dueDate: "2026-08-01" }).data, now)).toBe("submitted");
    expect(effectiveHomeworkStatus(homework("checked", { status: "checked", dueDate: "2026-08-01" }).data, now)).toBe("checked");
  });
});

describe("current homework priority", () => {
  test("revision beats overdue, then nearest due, then newest assigned", () => {
    const now = Date.parse("2026-08-23T10:00:00.000Z");
    const values = [
      homework("newest", { assignedAt: Timestamp.fromMillis(now), dueDate: "2026-08-30" }),
      homework("nearest", { dueDate: "2026-08-24" }),
      homework("overdue", { dueDate: "2026-08-20" }),
      homework("revision", { status: "needs_revision", dueDate: "2026-08-19" }),
    ];
    expect(selectCurrentHomework(values, now)?.id).toBe("revision");
    expect(selectCurrentHomework(values.filter(({ id }) => id !== "revision"), now)?.id).toBe("overdue");
    expect(selectCurrentHomework(values.filter(({ id }) => !["revision", "overdue"].includes(id)), now)?.id).toBe("nearest");
  });
});

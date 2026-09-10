import type { Firestore } from "firebase/firestore";
import { beforeEach, expect, test, vi } from "vitest";

const memory = vi.hoisted(() => ({ documents: new Map<string, Record<string, unknown>>() }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => name,
  doc: (...parts: unknown[]) => typeof parts[0] === "string" ? parts.join("/") : parts.slice(1).join("/"),
  serverTimestamp: () => "timestamp",
  runTransaction: async (_db: unknown, action: (transaction: unknown) => Promise<unknown>) => {
    const writes: Array<[string, Record<string, unknown>]> = [];
    const result = await action({
      get: async (ref: string) => ({ exists: () => memory.documents.has(ref), data: () => memory.documents.get(ref) }),
      update: (ref: string, data: Record<string, unknown>) => writes.push([ref, data]),
      set: (ref: string, data: Record<string, unknown>) => writes.push([ref, data]),
    });
    for (const [ref, data] of writes) memory.documents.set(ref, { ...memory.documents.get(ref), ...data });
    return result;
  },
}));
import { completeLesson } from "../../src/lib/firebase/services/completeLesson.js";

beforeEach(() => memory.documents.clear());

test.each(["assigned", "not_required", "pending", undefined])("completion preserves homework resolution %s", async (homeworkResolution) => {
  memory.documents.set("lessons/lesson", { teacherId: "teacher", studentId: "student", studentProgramId: "program", status: "planned", homeworkResolution });
  await completeLesson({} as Firestore, {
    lessonId: "lesson", teacherId: "teacher", topic: "Практика",
    lessonSummary: { homeworkResultText: null, teacherComment: null, focusNotes: [] },
  });
  expect(memory.documents.get("lessons/lesson")).toMatchObject({ status: "completed", homeworkResolution: homeworkResolution ?? "pending" });
});

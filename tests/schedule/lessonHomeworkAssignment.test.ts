import type { Firestore } from "firebase/firestore";
import { beforeEach, expect, test, vi } from "vitest";
const memory = vi.hoisted(() => ({ documents: new Map<string, Record<string, unknown>>() }));
vi.mock("firebase/firestore", () => {
  const snapshot = (ref: string) => ({ id: ref.split("/").at(-1), ref, exists: () => memory.documents.has(ref), data: () => memory.documents.get(ref) });
  return {
    collection: (_db: unknown, name: string) => name,
    doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    query: (collection: string, ...filters: Array<{ field: string; value: unknown }>) => ({ collection, filters }),
    getDocs: async ({ collection, filters }: { collection: string; filters: Array<{ field: string; value: unknown }> }) => ({ docs: [...memory.documents.entries()].filter(([ref, data]) => ref.startsWith(`${collection}/`) && filters.every(({ field, value }) => data[field] === value)).map(([ref]) => snapshot(ref)) }),
    serverTimestamp: () => "now",
    runTransaction: async (_db: unknown, action: (transaction: unknown) => Promise<unknown>) => {
      const writes: Array<[string, Record<string, unknown>]> = [];
      await action({ get: async (ref: string) => snapshot(ref), update: (ref: string, data: Record<string, unknown>) => writes.push([ref, data]) });
      for (const [ref, data] of writes) memory.documents.set(ref, { ...memory.documents.get(ref), ...data });
    },
  };
});
import { updateLessonHomeworkAssignment } from "../../src/lib/firebase/services/lessonHomeworkAssignment.js";
const input = { teacherId: "teacher", lessonId: "lesson" };
const db = {} as Firestore;
beforeEach(() => {
  memory.documents.clear();
  memory.documents.set("lessons/lesson", { teacherId: "teacher", studentId: "student", studentProgramId: "program", status: "completed", homeworkResolution: "pending" });
  memory.documents.set("homeworks/homework", { teacherId: "teacher", studentId: "student", studentProgramId: "program", sourceLessonId: null, title: "Сочинение + практика", items: [{ itemId: "essay" }, { itemId: "practice" }], status: "checked", assignedAt: "last-week" });
  memory.documents.set("homeworkSubmissions/submission", { homeworkId: "homework", teacherEvaluation: { scoreEarned: 6, scoreMax: 10 } });
});

test("links an existing package without creating homework or changing its scores", async () => {
  await updateLessonHomeworkAssignment(db, { ...input, mode: "link", homeworkId: "homework" });
  expect(memory.documents.size).toBe(3);
  expect(memory.documents.get("lessons/lesson")).toMatchObject({ homeworkResolution: "assigned", linkedHomeworkId: "homework", plannerWrapUpCompletedAt: "now" });
  expect(memory.documents.get("homeworks/homework")).toMatchObject({ sourceLessonId: "lesson", status: "checked", assignedAt: "last-week", items: [{ itemId: "essay" }, { itemId: "practice" }] });
  expect(memory.documents.get("homeworkSubmissions/submission")).toMatchObject({ teacherEvaluation: { scoreEarned: 6, scoreMax: 10 } });
});

test("confirms a legacy existing link with a stale pending flag", async () => {
  memory.documents.get("homeworks/homework")!.sourceLessonId = "lesson";
  await updateLessonHomeworkAssignment(db, { ...input, mode: "link", homeworkId: "homework" });
  expect(memory.documents.get("lessons/lesson")?.homeworkResolution).toBe("assigned");
});

test("external assignment can be undone without inventing a homework record", async () => {
  await updateLessonHomeworkAssignment(db, { ...input, mode: "external" });
  expect(memory.documents.get("lessons/lesson")).toMatchObject({ homeworkResolution: "assigned", homeworkAssignedExternally: true });
  expect(memory.documents.size).toBe(3);
  await updateLessonHomeworkAssignment(db, { ...input, mode: "pending" });
  expect(memory.documents.get("lessons/lesson")).toMatchObject({ homeworkResolution: "pending", homeworkAssignedExternally: false, plannerWrapUpCompletedAt: null });
});

test("not-required removes the pending flag and repeated saves preserve completion time", async () => {
  await updateLessonHomeworkAssignment(db, { ...input, mode: "not_required" });
  memory.documents.get("lessons/lesson")!.plannerWrapUpCompletedAt = "first-save";
  await updateLessonHomeworkAssignment(db, { ...input, mode: "not_required" });
  expect(memory.documents.get("lessons/lesson")).toMatchObject({ homeworkResolution: "not_required", plannerWrapUpCompletedAt: "first-save" });
});

test("unlinking preserves homework and submissions and restores the reminder", async () => {
  await updateLessonHomeworkAssignment(db, { ...input, mode: "link", homeworkId: "homework" });
  await updateLessonHomeworkAssignment(db, { ...input, mode: "unlink", homeworkId: "homework" });
  expect(memory.documents.get("homeworks/homework")?.sourceLessonId).toBeNull();
  expect(memory.documents.get("lessons/lesson")).toMatchObject({ homeworkResolution: "pending", linkedHomeworkId: null, plannerWrapUpCompletedAt: null });
  expect(memory.documents.size).toBe(3);
});

test.each(["external", "pending", "not_required"] as const)("cannot hide a linked assignment by setting %s", async (mode) => {
  memory.documents.get("homeworks/homework")!.sourceLessonId = "lesson";
  await expect(updateLessonHomeworkAssignment(db, { ...input, mode })).rejects.toThrow("Сначала снимите связь");
});

test.each([
  { studentId: "other" }, { teacherId: "other" }, { studentProgramId: "other" }, { draft: true }, { sourceLessonId: "another-lesson" },
])("rejects an incompatible homework %j", async (patch) => {
  Object.assign(memory.documents.get("homeworks/homework")!, patch);
  await expect(updateLessonHomeworkAssignment(db, { ...input, mode: "link", homeworkId: "homework" })).rejects.toThrow();
  expect(memory.documents.get("lessons/lesson")?.homeworkResolution).toBe("pending");
});

test.each([{ teacherId: "other" }, { status: "cancelled_teacher" }, { pairReplaced: true }])("rejects an incompatible lesson %j", async (patch) => {
  Object.assign(memory.documents.get("lessons/lesson")!, patch);
  await expect(updateLessonHomeworkAssignment(db, { ...input, mode: "external" })).rejects.toThrow();
});

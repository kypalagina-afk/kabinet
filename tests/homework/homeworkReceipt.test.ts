import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Firestore } from "firebase/firestore";

const memory = vi.hoisted(() => ({ documents: new Map<string, Record<string, unknown>>() }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return { ...actual,
    doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
    serverTimestamp: () => actual.Timestamp.fromMillis(100),
    runTransaction: async (_db: unknown, action: (transaction: unknown) => Promise<unknown>) => {
      const writes: Array<[string, Record<string, unknown>]> = [];
      await action({ get: async (ref: string) => ({ exists: () => memory.documents.has(ref), data: () => memory.documents.get(ref) }), update: (ref: string, data: Record<string, unknown>) => writes.push([ref, data]) });
      for (const [ref, data] of writes) memory.documents.set(ref, { ...memory.documents.get(ref), ...data });
    },
  };
});
import { saveHomeworkReceipt } from "../../src/lib/firebase/services/homeworkReceipt.js";

describe("teacher receipt transaction", () => {
  const input = { teacherId: "teacher", homeworkId: "hw", submissionId: "attempt", onTime: null, items: { essay: { received: true, onTime: true }, test: { received: false, onTime: null } } };
  beforeEach(() => {
    memory.documents.clear();
    memory.documents.set("homeworks/hw", { teacherId: "teacher", studentId: "student", items: [{ itemId: "essay", title: "Сочинение" }, { itemId: "test", title: "Тест" }], status: "submitted" });
    memory.documents.set("homeworkSubmissions/attempt", { teacherId: "teacher", studentId: "student", homeworkId: "hw", status: "submitted", studentInput: { completed: true, note: "Комментарий", itemProgress: [{ itemId: "essay", completed: true, responseText: "Текст ученика", attachments: [{ fileAssetId: "file" }] }] }, teacherEvaluation: { itemEvaluations: [{ itemId: "essay", scoreEarned: 8, scoreMax: 10, reviewStatus: "checked" }] } });
  });
  test("partial receipt preserves submitted text, attachments and checked marks", async () => {
    await saveHomeworkReceipt({} as Firestore, input);
    expect(memory.documents.get("homeworkSubmissions/attempt")).toMatchObject({ status: "submitted", studentInput: { completed: false, note: "Комментарий", itemProgress: [{ itemId: "essay", completed: true, responseText: "Текст ученика", attachments: [{ fileAssetId: "file" }] }, { itemId: "test", completed: false }] }, teacherEvaluation: { itemEvaluations: [{ itemId: "essay", scoreEarned: 8 }] }, teacherReceipt: { items: { essay: { received: true, onTime: true }, test: { received: false, receivedAt: null } } } });
    await saveHomeworkReceipt({} as Firestore, { ...input, items: { ...input.items, test: { received: true, onTime: false } } });
    expect(memory.documents.get("homeworkSubmissions/attempt")).toMatchObject({ studentInput: { completed: true }, status: "submitted", teacherReceipt: { items: { test: { received: true, onTime: false } } } });
  });
  test("rejects changing another teacher's records", async () => {
    await expect(saveHomeworkReceipt({} as Firestore, { ...input, teacherId: "other" })).rejects.toThrow();
    expect(memory.documents.get("homeworkSubmissions/attempt")?.teacherReceipt).toBeUndefined();
  });
  test("correcting a receipt preserves earlier review data and reopens the package", async () => {
    await saveHomeworkReceipt({} as Firestore, { ...input, items: { ...input.items, essay: { received: false, onTime: null } } });
    expect(memory.documents.get("homeworkSubmissions/attempt")).toMatchObject({ status: "submitted", teacherReceipt: { items: { essay: { received: false } } }, teacherEvaluation: { itemEvaluations: [{ itemId: "essay", scoreEarned: 8 }] } });
  });
});

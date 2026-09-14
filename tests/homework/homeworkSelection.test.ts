import { expect, test, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
const mock = vi.hoisted(() => ({ listeners: [] as Array<{ query: { name: string; filters: Array<{ field: string; value: unknown }> }; next: (snapshot: unknown) => void; stop: ReturnType<typeof vi.fn> }> }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => name,
  documentId: () => "id",
  where: (field: string, _operator: string, value: unknown) => ({ field, value }),
  query: (name: string, ...filters: Array<{ field: string; value: unknown }>) => ({ name, filters }),
  onSnapshot: (query: (typeof mock.listeners)[number]["query"], next: (snapshot: unknown) => void) => {
    const stop = vi.fn(); mock.listeners.push({ query, next, stop }); return stop;
  },
}));
import { subscribeHomeworkSelection } from "../../src/lib/firebase/repositories/homeworkSelectionRepository.js";
const snapshot = (id: string, data: Record<string, unknown>) => ({ docs: [{ id, data: () => data }] });

test("loads exact old homework and all its submissions, then receives live review changes", () => {
  mock.listeners.length = 0;
  const next = vi.fn();
  const stop = subscribeHomeworkSelection({} as Firestore, "teacher", { homeworkIds: ["old-homework"] }, { next, error: vi.fn() });
  expect(mock.listeners[0]!.query.filters).toContainEqual({ field: "id", value: ["old-homework"] });
  mock.listeners[0]!.next(snapshot("old-homework", { teacherId: "teacher", status: "assigned" }));
  expect(next).not.toHaveBeenCalled();
  expect(mock.listeners[1]!.query.filters).toContainEqual({ field: "homeworkId", value: ["old-homework"] });
  mock.listeners[1]!.next(snapshot("old-attempt", { homeworkId: "old-homework", status: "submitted" }));
  expect(next.mock.lastCall?.[0].submissions[0].data.status).toBe("submitted");
  mock.listeners[1]!.next(snapshot("old-attempt", { homeworkId: "old-homework", status: "checked" }));
  expect(next.mock.lastCall?.[0].submissions[0].data.status).toBe("checked");
  stop();
  expect(mock.listeners.every((item) => item.stop.mock.calls.length === 1)).toBe(true);
});

test("chunks large lesson selections, deduplicates links and does not emit partial false statuses", () => {
  mock.listeners.length = 0;
  const next = vi.fn();
  const stop = subscribeHomeworkSelection({} as Firestore, "teacher", { lessonIds: Array.from({ length: 31 }, (_, i) => `lesson-${i}`), homeworkIds: ["homework"] }, { next, error: vi.fn() });
  expect(mock.listeners).toHaveLength(3);
  mock.listeners[0]!.next(snapshot("homework", { teacherId: "teacher" }));
  mock.listeners[1]!.next({ docs: [] });
  expect(next).not.toHaveBeenCalled();
  mock.listeners[2]!.next(snapshot("homework", { teacherId: "teacher" }));
  expect(mock.listeners).toHaveLength(4);
  mock.listeners[3]!.next({ docs: [] });
  expect(next.mock.lastCall?.[0].homeworks).toHaveLength(1);
  stop();
  const previous = next.mock.calls.length;
  mock.listeners[3]!.next(snapshot("late", {}));
  expect(next).toHaveBeenCalledTimes(previous);
});

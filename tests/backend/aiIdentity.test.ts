import { describe, expect, test } from "vitest";
import { canonicalizeDraftIdentity } from "../../backend/yandex/src/ai/identity.js";

describe("AI draft server identities", () => {
  const providerDraft = {
    actionType: "PLANNER_ITEMS_DRAFT" as const,
    draftId: "draft-1",
    summary: "Три задачи",
    items: ["Тренировка", "Зарядка", "Проверить сочинение"].map((title) => ({
      draftItemId: "item-1",
      selected: true,
      itemType: "task" as const,
      title,
      category: "work" as const,
      date: "2026-08-26",
      startTime: null,
      priority: "medium" as const,
      notes: null,
    })),
  };

  test("replaces repeated provider ids with unique item ids", () => {
    const result = canonicalizeDraftIdentity(providerDraft, "request-A");
    expect(result.draftId).toBe("draft-request-A");
    if (result.actionType !== "PLANNER_ITEMS_DRAFT") throw new Error("unexpected draft");
    expect(result.items.map((item) => item.draftItemId)).toEqual([
      "draft-request-A-item-1",
      "draft-request-A-item-2",
      "draft-request-A-item-3",
    ]);
  });

  test("is stable for the same response and distinct for a new request", () => {
    expect(canonicalizeDraftIdentity(providerDraft, "request-A"))
      .toEqual(canonicalizeDraftIdentity(providerDraft, "request-A"));
    expect(canonicalizeDraftIdentity(providerDraft, "request-A").draftId)
      .not.toBe(canonicalizeDraftIdentity(providerDraft, "request-B").draftId);
  });
});

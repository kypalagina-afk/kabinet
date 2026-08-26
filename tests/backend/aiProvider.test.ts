import { describe, expect, test } from "vitest";
import {
  AIProviderError,
  MockAIProvider,
  normalizeAIResponse,
  parseAIJsonResponse,
  safeAIProviderErrorCode,
} from "../../backend/yandex/src/ai/provider.js";
import { isTeacherAIActor } from "../../backend/yandex/src/ai/authorization.js";

describe("backend AI provider", () => {
  test("validates mock provider output through the production schema", async () => {
    const provider = new MockAIProvider({ actionType: "UNSUPPORTED_REQUEST", draftId: "draft", summary: "Нет действия", reason: "Тест" });
    const result = await provider.interpret({ command: "test", context: {} });
    expect(result.draft.actionType).toBe("UNSUPPORTED_REQUEST");
    expect(result.model).toBe("mock");
  });

  test("fails closed on invalid provider output", async () => {
    const provider = new MockAIProvider({ actionType: "DELETE_STUDENT" });
    await expect(provider.interpret({ command: "test", context: {} })).rejects.toThrow();
  });

  test("allows only teacher actors", () => {
    expect(isTeacherAIActor({ role: "teacher" })).toBe(true);
    expect(isTeacherAIActor({ role: "student" })).toBe(false);
    expect(isTeacherAIActor(null)).toBe(false);
  });

  test("exposes only a bounded safe provider error code", () => {
    expect(safeAIProviderErrorCode(new AIProviderError("AI_PROVIDER_HTTP_403"))).toBe(
      "AI_PROVIDER_HTTP_403",
    );
    expect(safeAIProviderErrorCode(new Error("secret provider response"))).toBe(
      "AI_PROVIDER_UNKNOWN",
    );
  });

  test("accepts a JSON object wrapped in a model code fence or short preface", () => {
    expect(parseAIJsonResponse("```json\n{\"actionType\":\"UNSUPPORTED_REQUEST\"}\n```"))
      .toEqual({ actionType: "UNSUPPORTED_REQUEST" });
    expect(parseAIJsonResponse("Готово: {\"actionType\":\"PLANNER_ITEMS_DRAFT\"}"))
      .toEqual({ actionType: "PLANNER_ITEMS_DRAFT" });
  });

  test("normalizes translated and unknown planner priorities to safe enum values", () => {
    const normalized = normalizeAIResponse({
      actionType: "PLANNER_ITEMS_DRAFT",
      items: [
        { priority: "Высокий" },
        { priority: "низкий" },
        { priority: "обычный" },
        {},
      ],
    }) as { items: Array<{ priority: string }> };

    expect(normalized.items.map(({ priority }) => priority)).toEqual([
      "high",
      "low",
      "medium",
      "medium",
    ]);
  });
});

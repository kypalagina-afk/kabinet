import { describe, expect, test } from "vitest";
import { rescheduleClarification } from "../../backend/yandex/src/ai/clarification.js";

describe("backend AI deterministic clarification", () => {
  test("asks for details instead of sending an incomplete reschedule to the model", () => {
    expect(rescheduleClarification("Перенеси урок", "draft-1")).toMatchObject({
      actionType: "CLARIFICATION_REQUIRED",
      draftId: "draft-1",
    });
  });

  test("lets a complete reschedule command reach the model", () => {
    expect(rescheduleClarification("Перенеси урок Леры на 28.08 в 11:00", "draft-2"))
      .toBeNull();
  });

  test("does not intercept unrelated commands", () => {
    expect(rescheduleClarification("Добавь задачу проверить сочинение", "draft-3"))
      .toBeNull();
  });
});

import { describe, expect, test } from "vitest";
import {
  isDemoAIActor,
  requestLimitForActor,
} from "../../backend/yandex/src/ai/authorization.js";

describe("demo backend policy", () => {
  test("uses a dedicated smaller request budget only for demo accounts", () => {
    expect(isDemoAIActor({ accountMode: "demo" })).toBe(true);
    expect(isDemoAIActor({ accountMode: "standard" })).toBe(false);
    expect(requestLimitForActor({ accountMode: "demo" }, 100, 12)).toBe(12);
    expect(requestLimitForActor({ accountMode: "standard" }, 100, 12)).toBe(100);
    expect(requestLimitForActor(undefined, 100, 12)).toBe(100);
  });
});

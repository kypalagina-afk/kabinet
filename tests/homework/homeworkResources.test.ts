import { describe, expect, test } from "vitest";
import {
  createHomeworkLink,
  createHomeworkText,
  normalizeHomeworkLink,
} from "../../src/features/homework/homeworkResources.js";

describe("homework resources", () => {
  test("normalizes a link without a protocol", () => {
    expect(normalizeHomeworkLink("example.com/task?id=7")).toBe(
      "https://example.com/task?id=7",
    );
  });

  test("rejects unsafe link protocols", () => {
    expect(() => normalizeHomeworkLink("javascript:alert(1)")).toThrow(
      "только ссылки http или https",
    );
  });

  test("creates a clickable link with a hostname fallback title", () => {
    const resource = createHomeworkLink("", "https://example.com/article");
    expect(resource).toMatchObject({
      kind: "external",
      title: "example.com",
      url: "https://example.com/article",
      contentType: "text/uri-list",
    });
  });

  test("creates a trimmed text attachment", () => {
    const resource = createHomeworkText("Правило", "  Длинный текст правила.  ");
    expect(resource).toMatchObject({
      kind: "text",
      title: "Правило",
      textContent: "Длинный текст правила.",
    });
  });
});

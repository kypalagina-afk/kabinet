import { describe, expect, test } from "vitest";
import {
  normalizeImportantLinks,
  normalizeImportantLinkUrl,
} from "../../src/features/students/importantLinks.js";

describe("important student links", () => {
  test("normalizes an address without a protocol", () => {
    expect(normalizeImportantLinkUrl("platform.example.ru/tasks")).toBe(
      "https://platform.example.ru/tasks",
    );
  });

  test("rejects an unsafe protocol", () => {
    expect(() => normalizeImportantLinkUrl("javascript:alert(1)")).toThrow(
      "только ссылки http или https",
    );
  });

  test("trims link data and preserves an optional note", () => {
    expect(
      normalizeImportantLinks([
        {
          id: " link-1 ",
          title: " Русский100 ",
          url: " russian100.ru ",
          note: " Логин: alex ",
        },
      ]),
    ).toEqual([
      {
        id: "link-1",
        title: "Русский100",
        url: "https://russian100.ru/",
        note: "Логин: alex",
      },
    ]);
  });
});

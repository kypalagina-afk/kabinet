import { describe, expect, test } from "vitest";
import { parseRussian100ManualText } from "../../src/features/external-practice/manualImport.js";

describe("manual Russian100 import", () => {
  test("parses semicolon rows and preserves incomplete status", () => {
    const result = parseRussian100ManualText([
      "задание; дата; результат; статус",
      "11; 07.06.2026 13:57; 3/5; завершено",
      "12; 08.06.2026 09:05; 1/4; не завершено",
    ].join("\n"));
    expect(result.errors).toEqual([]);
    expect(result.attempts).toEqual([
      {
        taskNumber: 11,
        localDate: "2026-06-07",
        localTime: "13:57",
        score: 3,
        maxScore: 5,
        status: "completed",
      },
      {
        taskNumber: 12,
        localDate: "2026-06-08",
        localTime: "09:05",
        score: 1,
        maxScore: 4,
        status: "incomplete",
      },
    ]);
  });

  test("parses copied result blocks and removes exact duplicates", () => {
    const block = [
      "Задание №11",
      "07.06.2026 13:57",
      "3/5",
    ].join("\n");
    const result = parseRussian100ManualText(`${block}\n\n${block}`);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.taskNumber).toBe(11);
  });

  test("parses the copied Russian100 history format with a two-digit year", () => {
    const result = parseRussian100ManualText([
      "Задания:",
      "Задание №11:",
      "3/5 от 07.06.26 13:57",
      "Задания:",
      "Задание №11:",
      "5/5 от 07.06.26 13:51",
      "Задания:",
      "Задание №18:",
      "2/4 от 08.06.26 09:05",
    ].join("\n"));
    expect(result.errors).toEqual([]);
    expect(result.attempts).toEqual([
      expect.objectContaining({
        taskNumber: 11,
        localDate: "2026-06-07",
        localTime: "13:57",
        score: 3,
        maxScore: 5,
      }),
      expect.objectContaining({
        taskNumber: 11,
        localDate: "2026-06-07",
        localTime: "13:51",
        score: 5,
        maxScore: 5,
      }),
      expect.objectContaining({
        taskNumber: 18,
        localDate: "2026-06-08",
        localTime: "09:05",
        score: 2,
        maxScore: 4,
      }),
    ]);
  });

  test("rejects an impossible score", () => {
    const result = parseRussian100ManualText("11; 07.06.2026 13:57; 6/5; завершено");
    expect(result.attempts).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

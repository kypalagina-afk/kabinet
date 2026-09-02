import { describe, expect, test } from "vitest";
import { parsePracticeScore } from "../../src/features/homework/practiceScoreParser.js";

describe("practice score parser", () => {
  test.each([
    ["8/10", { earned: 8, maximum: 10 }],
    ["8 баллов из 10", { earned: 8, maximum: 10 }],
    ["3,5 из 5", { earned: 3.5, maximum: 5 }],
  ])("parses an inline score: %s", (input, expected) => {
    expect(parsePracticeScore(input)).toEqual(expected);
  });

  test("selects the matching task from a Russian100 block", () => {
    const input = [
      "Задание №11: 3/5 от 07.06.26 13:57",
      "Задание №15: 9/10 от 07.06.26 14:10",
    ].join("\n");
    expect(parsePracticeScore(input, [15])).toEqual({ earned: 9, maximum: 10 });
  });

  test("rejects an impossible score", () => {
    expect(parsePracticeScore("12 из 10")).toBeNull();
  });
});

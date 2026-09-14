import { describe, expect, test } from "vitest";
import { parsePracticeScore } from "../../src/features/homework/practiceScoreParser.js";

describe("practice score parser", () => {
  test.each([
    ["8/10", { earned: 8, maximum: 10 }],
    ["10\\15", { earned: 10, maximum: 15 }],
    [" 10 \\ 15 ", { earned: 10, maximum: 15 }],
    ["3,5\\5", { earned: 3.5, maximum: 5 }],
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
    expect(parsePracticeScore("16\\15")).toBeNull();
    expect(parsePracticeScore("10\\0")).toBeNull();
  });

  test("sums the user's two copied Russian100 attempts", () => {
    const input = "Задания:\r\nЗадание №15:\r\n6/10 от 09.09.26 20:06\r\nЗадания:\r\nЗадание №15:\r\n7/10 от 09.09.26 20:00";
    expect(parsePracticeScore(input, [15])).toEqual({ earned: 13, maximum: 20 });
    expect(parsePracticeScore(input)).toEqual({ earned: 13, maximum: 20 });
  });

  test.each(["6/10\n7/10", "6\\10 + 7\\10", "6 из 10; 7 баллов из 10"])("sums inline results: %s", (input) => {
    expect(parsePracticeScore(input)).toEqual({ earned: 13, maximum: 20 });
  });

  test("sums denominators rather than averaging percentages", () => {
    expect(parsePracticeScore("1/2\n9/10")).toEqual({ earned: 10, maximum: 12 });
    expect(parsePracticeScore("0,1/1\n0,2/1")).toEqual({ earned: 0.3, maximum: 2 });
  });

  test("excludes other task numbers and exact duplicate attempts", () => {
    const input = [
      "Задание №15: 6/10 от 09.09.26 20:06",
      "Задание №15: 7/10 от 09.09.26 20:00",
      "Задание №15: 6/10 от 09.09.26 20:06",
      "Задание №16: 5/5 от 09.09.26 20:10",
    ].join("\n");
    expect(parsePracticeScore(input, [15])).toEqual({ earned: 13, maximum: 20 });
    expect(parsePracticeScore(input, [15, 16])).toEqual({ earned: 18, maximum: 25 });
    expect(parsePracticeScore(input, [17])).toBeNull();
  });

  test("does not silently skip an invalid inline score", () => {
    expect(parsePracticeScore("6/10\n13/2")).toBeNull();
  });
});

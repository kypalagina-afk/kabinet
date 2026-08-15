import { describe, expect, test } from "vitest";
import { deriveStructuredPackageStatus } from "../../src/features/homework/homeworkWorkflowState.js";
import type { HomeworkItemEvaluation } from "../../src/lib/firebase/types.js";

const evaluation = (
  itemId: string,
  reviewStatus: HomeworkItemEvaluation["reviewStatus"] = "checked",
): HomeworkItemEvaluation => ({
  itemId,
  scoreEarned: 1,
  scoreMax: 1,
  criteria: [],
  comment: null,
  reviewStatus,
  checkedAt: null,
});

describe("multi-item structured homework status", () => {
  test("stays submitted until every required item is reviewed", () => {
    expect(
      deriveStructuredPackageStatus(["essay", "exposition"], [
        evaluation("essay"),
      ]),
    ).toBe("submitted");
  });

  test("becomes checked only after every required item is reviewed", () => {
    expect(
      deriveStructuredPackageStatus(["essay", "exposition"], [
        evaluation("essay"),
        evaluation("exposition"),
      ]),
    ).toBe("checked");
  });

  test("a revision on either item keeps the package in revision", () => {
    expect(
      deriveStructuredPackageStatus(["essay", "exposition"], [
        evaluation("essay", "needs_revision"),
        evaluation("exposition"),
      ]),
    ).toBe("needs_revision");
  });
});

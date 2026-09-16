import { expect, test } from "vitest";
import type { ExamBlueprint } from "../../src/lib/firebase/types.js";
import { describeWrittenCriteria, mockWrittenBreakdown } from "../../src/features/analytics/writtenBreakdown.js";
import { writtenPracticeHistory } from "../../src/features/analytics/writtenPractice.js";
import { examBlueprintSeeds, EGE_RUSSIAN_2027_PROJECT_ID, OGE_RUSSIAN_2027_PROJECT_ID } from "../../src/features/exams/blueprints.js";
import { historyFixture } from "../fixtures/analyticsHistory.js";

const ege = examBlueprintSeeds[EGE_RUSSIAN_2027_PROJECT_ID] as ExamBlueprint;
const oge = examBlueprintSeeds[OGE_RUSSIAN_2027_PROJECT_ID] as ExamBlueprint;

test("uses snapshot criterion title, saved max and zero, including zero errors", () => {
  const criteria = [{ code: "К1", earned: 0, max: 1, errorsCount: 0 }, { code: "OLD", earned: 2, max: 4, errorsCount: null }];
  const result = describeWrittenCriteria(criteria, { content: [{ code: "К1", title: "Историческое название", max: 1 }], literacy: [], factual: null }, ege, 27);
  expect(result[0]).toEqual({ ...criteria[0], title: "Историческое название" });
  expect(result[1]).toEqual({ ...criteria[1], title: null });
  expect(describeWrittenCriteria([{ code: "К1", earned: 2, max: 3, errorsCount: null }], null, ege, 27)[0]!.title).toBeNull();
});

test("homework details are tied to the exact item and attempt, not package total or other review", () => {
  const { homework, submission } = historyFixture();
  const review = submission.data.teacherEvaluation!.itemEvaluations![0]!;
  review.criteria = [{ code: "К1", earned: 0, max: 1, errorsCount: null }];
  review.comment = "Уточнить позицию автора";
  submission.data.teacherEvaluation!.criteria = [{ code: "WRONG", earned: 8, max: 10, errorsCount: null }];
  const next = { ...submission, id: "next", data: { ...submission.data, submissionNumber: 2, teacherEvaluation: { ...submission.data.teacherEvaluation!, itemEvaluations: [{ ...review, criteria: [{ code: "К1", earned: 1, max: 1, errorsCount: null }], comment: "Исправлено" }] } } };
  const rows = writtenPracticeHistory([homework], [submission, next], [], "ege", "ege", "p", ege);
  expect(rows.find((row) => row.id === "homework:sub:essay")).toMatchObject({ comment: "Уточнить позицию автора", criteria: [{ code: "К1", earned: 0, max: 1, title: "Отражение позиции автора" }] });
  expect(rows.find((row) => row.id === "homework:next:essay")!.criteria[0]!.earned).toBe(1);
  expect(rows.flatMap((row) => row.criteria).some((item) => item.code === "WRONG")).toBe(false);
});

test("legacy whole homework keeps its rubric and comment; totals never invent criteria", () => {
  const { homework, submission } = historyFixture();
  homework.data.items = [];
  submission.data.status = "checked";
  submission.data.teacherEvaluation!.criteria = [{ code: "К2", earned: 1, max: 3, errorsCount: 2 }];
  submission.data.teacherEvaluation!.comment = "Объяснить связь примеров";
  const rows = writtenPracticeHistory([homework], [submission], [], "ege", "ege", "p", ege);
  expect(rows[0]).toMatchObject({ comment: "Объяснить связь примеров", criteria: [{ code: "К2", earned: 1, max: 3, errorsCount: 2 }] });
  submission.data.teacherEvaluation!.criteria = [];
  expect(writtenPracticeHistory([homework], [submission], [], "ege", "ege", "p", ege)[0]!.criteria).toEqual([]);
});

test("mock separates OGE essay/exposition and shared literacy without double counting", () => {
  const { mock } = historyFixture();
  mock.data.criteriaResults = [
    { code: "ИК1", earned: 1, max: 2, errorsCount: null },
    { code: "СК1", earned: 0, max: 1, errorsCount: null },
    { code: "ГК1", earned: 2, max: 3, errorsCount: 1 },
    { code: "ФК1", earned: 1, max: 1, errorsCount: 0 },
  ];
  mock.data.sections.literacy.criteria = [{ code: "ГК1", earned: 2, max: 3, errorsCount: 1, category: "ГК1" }];
  mock.data.sections.factualAccuracy = { earned: 1, max: 1, errorsCount: 0 };
  mock.data.sections.essay.comment = "Комментарий к сочинению";
  const essay = mockWrittenBreakdown(mock.data, 13, oge);
  const exposition = mockWrittenBreakdown(mock.data, 1, oge);
  expect(essay.criteria.map((item) => item.code)).toEqual(["СК1"]);
  expect(exposition.criteria.map((item) => item.code)).toEqual(["ИК1"]);
  expect(essay.sharedCriteria.map((item) => item.code)).toEqual(["ГК1", "ФК1"]);
  expect(exposition.comment).toBeNull();
  expect(essay.comment).toBe("Комментарий к сочинению");
});

test("EGE mock exposes all saved essay criteria and no shared OGE criteria", () => {
  const { mock } = historyFixture();
  mock.data.sections.essay.criteria = [{ code: "К7", earned: 0, max: 3, errorsCount: 4 }];
  expect(mockWrittenBreakdown(mock.data, 27, ege)).toMatchObject({ criteria: [{ code: "К7", earned: 0, max: 3, errorsCount: 4, title: "Орфографические нормы" }], sharedCriteria: [] });
});

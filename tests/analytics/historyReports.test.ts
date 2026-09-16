import { expect, test } from "vitest";
import { buildHomeworkReport } from "../../src/features/analytics/homeworkReportData.js";
import { monthlyHistory } from "../../src/features/analytics/monthlyHistory.js";
import { writtenPracticeHistory } from "../../src/features/analytics/writtenPractice.js";
import { resolveTimezone } from "../../src/features/schedule/timezone.js";
import { at, historyFixture } from "../fixtures/analyticsHistory.js";

test("per-item report distinguishes missing work, reviewed scores, and whole quality", () => {
  const { homework, submission } = historyFixture();
  const report = buildHomeworkReport([homework], [submission])[0]!;
  expect(report.quality).toBe("8/10");
  expect(report.items).toMatchObject([
    { itemId: "essay", state: "checked", onTime: true, score: "16/22" },
    { itemId: "test", state: "missing", onTime: null, score: null },
  ]);
  submission.data.teacherReceipt!.onTime = false;
  expect(buildHomeworkReport([homework], [submission])[0]!.items[0]!.onTime).toBe(false);
});

test("report uses latest attempt, infers dates and preserves zero scores", () => {
  const { homework, submission } = historyFixture();
  const newer = structuredClone(submission);
  newer.data = { ...submission.data, submissionNumber: 2, teacherReceipt: undefined, submittedAt: at("2026-09-13T12:00:00Z"), teacherEvaluation: { ...submission.data.teacherEvaluation!, itemEvaluations: [{ ...submission.data.teacherEvaluation!.itemEvaluations![0]!, scoreEarned: 0 }] } };
  const row = buildHomeworkReport([homework], [newer, submission])[0]!.items[0]!;
  expect(row).toMatchObject({ score: "0/22", onTime: false });
  newer.data.submittedAt = null;
  expect(buildHomeworkReport([homework], [newer])[0]!.items[0]!.onTime).toBeNull();
});

test("all dates included in report, drafts excluded, latest assignments first without mutation", () => {
  const { homework } = historyFixture();
  const future = { ...homework, id: "future", data: { ...homework.data, assignedAt: at("2027-01-01T00:00:00Z") } };
  const draft = { ...homework, id: "draft", data: { ...homework.data, draft: true } };
  const input = [homework, draft, future];
  expect(buildHomeworkReport(input, []).map((row) => row.id)).toEqual(["future", "hw"]);
  expect(input[0]).toBe(homework);
});

test("legacy one-part homework score and manual receipt remain visible", () => {
  const { homework, submission } = historyFixture();
  homework.data.items = [];
  submission.data.status = "checked";
  submission.data.teacherEvaluation!.itemEvaluations = [];
  submission.data.teacherReceipt = { onTime: true, items: {} };
  expect(buildHomeworkReport([homework], [submission])[0]!.items).toMatchObject([{ title: "Сочинение и тест", score: "16/22", onTime: true, state: "checked" }]);
});

test("mixed source history is globally descending and grouped using display timezone", () => {
  const rows = [{ id: "r100", time: Date.parse("2026-05-16T10:00:00Z") }, { id: "homework", time: Date.parse("2026-09-15T10:00:00Z") }, { id: "boundary", time: Date.parse("2026-08-31T22:00:00Z") }, { id: "new-year", time: Date.parse("2027-01-01T10:00:00Z") }];
  const grouped = monthlyHistory(rows, (row) => row.time, resolveTimezone(null));
  expect(grouped.map((month) => month.key)).toEqual(["2027-01", "2026-09", "2026-05"]);
  expect(grouped[1]!.items.map((row) => row.id)).toEqual(["homework", "boundary"]);
  expect(rows[0]!.id).toBe("r100");
});

test("written history merges homework and mocks without duplicating mock sections", () => {
  const { homework, submission, mock } = historyFixture();
  mock.data.taskResults = [{ taskNumber: 27, earned: 18, max: 22 }];
  const history = writtenPracticeHistory([homework], [submission], [mock], "ege", "ege", "p");
  expect(history.map((row) => [row.source, row.earned, row.max])).toEqual([["Пробник", 18, 22], ["ДЗ", 16, 22]]);
  expect(history[1]!.title).toBe("Написать сочинение");
  expect(writtenPracticeHistory([homework], [submission], [mock], "other", "ege", "other")).toEqual([]);
});

test("OGE history separates exposition and essay and retains all graded attempts", () => {
  const { homework, submission, mock } = historyFixture();
  homework.data.items![0]!.examTaskNumbers = [13];
  mock.data.examBlueprintId = "oge";
  mock.data.sections.exposition = { earned: 4, max: 6, criteria: [] };
  const second = { ...submission, id: "sub2", data: { ...submission.data, submissionNumber: 2 } };
  const history = writtenPracticeHistory([homework], [submission, second], [mock], "oge", "oge", "p");
  expect(history.filter((row) => row.taskNumber === 13)).toHaveLength(3);
  expect(history.find((row) => row.taskNumber === 1)).toMatchObject({ earned: 4, max: 6, source: "Пробник" });
});

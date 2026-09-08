import type { DocumentWithId, Lesson } from "../../lib/firebase/types.js";

export type TaskUnderstanding = NonNullable<Lesson["taskUnderstanding"]>;
export const understandingLabels = { needs_practice: "Нужна отработка", in_progress: "В процессе", confident: "Уверенно" };
export function understandingStatus(score: number) {
  return score <= 4 ? "needs_practice" as const : score <= 7 ? "in_progress" as const : "confident" as const;
}

export function selectedTaskUnderstanding(tasks: number[], ratings: TaskUnderstanding = {}) {
  const result: TaskUnderstanding = {};
  for (const task of new Set(tasks)) {
    const value = ratings[String(task)];
    if (!value) continue;
    if (!Number.isInteger(task) || task < 1 || !Number.isInteger(value.score) || value.score < 1 || value.score > 10 || !Object.hasOwn(understandingLabels, value.status)) {
      throw new Error("Укажите понимание задания от 1 до 10 и выберите статус.");
    }
    result[String(task)] = { score: value.score, status: value.status };
  }
  return result;
}

export function latestTaskUnderstanding(lessons: Array<DocumentWithId<Lesson>>) {
  const result: Record<string, { score: number; status: keyof typeof understandingLabels; date: Date }> = {};
  const completed = lessons.filter(({ data }) => data.status === "completed" && !data.pairReplaced)
    .sort((a, b) => b.data.startAt.toMillis() - a.data.startAt.toMillis());
  for (const { data } of completed) {
    for (const task of data.examTaskNumbers ?? []) {
      const value = data.taskUnderstanding?.[String(task)];
      if (value && !result[String(task)]) result[String(task)] = { ...value, date: data.startAt.toDate() };
    }
  }
  return result;
}

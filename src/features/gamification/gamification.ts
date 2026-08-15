import { calculateMockAnalytics } from "../analytics/mockAnalytics.js";
import type {
  AchievementDefinition,
  DocumentWithId,
  GamificationEvent,
  Homework,
  HomeworkSubmission,
  MockExam,
  StudentAchievement,
} from "../../lib/firebase/types.js";

export const XP_PER_LEVEL = 500;

export const baseAchievementDefinitions: Array<
  Pick<AchievementDefinition, "code" | "title" | "description" | "iconKey">
> = [
  { code: "first-step", title: "Первый шаг", description: "Отправить первое домашнее задание", iconKey: "spark" },
  { code: "battle-baptism", title: "Боевое крещение", description: "Пройти первый пробник", iconKey: "shield" },
  { code: "on-time", title: "Точно в срок", description: "Сдать работу вовремя", iconKey: "clock" },
  { code: "momentum", title: "Взял темп", description: "Серия из трёх работ", iconKey: "flame" },
  { code: "iron-streak", title: "Железная серия", description: "Серия из семи работ", iconKey: "flame" },
  { code: "unstoppable", title: "Не остановить", description: "Серия из четырнадцати работ", iconKey: "rocket" },
  { code: "sniper", title: "Снайпер", description: "Устойчиво решать задание на 90%", iconKey: "target" },
  { code: "growth", title: "Вот это рост", description: "Прибавить 10 п.п. на пробнике", iconKey: "trend" },
  { code: "comeback", title: "Камбэк", description: "Успешно исправить работу", iconKey: "return" },
  { code: "personal-best", title: "Личный рекорд", description: "Обновить лучший результат", iconKey: "trophy" },
  { code: "first-mastery", title: "Первое освоение", description: "Освоить первое задание", iconKey: "star" },
  { code: "halfway", title: "Полпути", description: "Достичь готовности 50%", iconKey: "route" },
  { code: "almost-ready", title: "Почти готов", description: "Достичь готовности 75%", iconKey: "badge" },
  { code: "exam-ready", title: "Готов к экзамену", description: "Достичь готовности 90%", iconKey: "crown" },
];

export interface GamificationSummary {
  totalXp: number;
  level: number;
  levelXp: number;
  xpToNextLevel: number;
  streak: number;
  earned: Array<{
    achievement: DocumentWithId<StudentAchievement>;
    definition: DocumentWithId<AchievementDefinition> | null;
  }>;
  suggestedCodes: string[];
}

export function calculateHomeworkStreak(
  submissions: Array<DocumentWithId<HomeworkSubmission>>,
): number {
  const checked = submissions
    .filter(({ data }) => data.status === "checked")
    .sort((left, right) => right.data.submissionNumber - left.data.submissionNumber);
  return checked.length;
}

export function calculateGamificationSummary(input: {
  events: Array<DocumentWithId<GamificationEvent>>;
  achievements: Array<DocumentWithId<StudentAchievement>>;
  definitions: Array<DocumentWithId<AchievementDefinition>>;
  submissions: Array<DocumentWithId<HomeworkSubmission>>;
  homeworks: Array<DocumentWithId<Homework>>;
  mockExams: Array<DocumentWithId<MockExam>>;
}): GamificationSummary {
  const totalXp = input.events.reduce((total, { data }) => total + Math.max(0, data.xpDelta), 0);
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const levelXp = totalXp % XP_PER_LEVEL;
  const streak = calculateHomeworkStreak(input.submissions);
  const analytics = calculateMockAnalytics(input.mockExams);
  const suggested = new Set<string>();
  if (input.submissions.length) suggested.add("first-step");
  if (input.mockExams.length) suggested.add("battle-baptism");
  const homeworkById = new Map(input.homeworks.map((homework) => [homework.id, homework.data]));
  if (input.submissions.some(({ data }) => {
    const dueAt = homeworkById.get(data.homeworkId)?.dueAt;
    return data.status === "checked" && dueAt && data.submittedAt && data.submittedAt.toMillis() <= dueAt.toMillis();
  })) suggested.add("on-time");
  if (input.submissions.some(({ data }) => data.status === "checked" && data.submissionNumber > 1)) suggested.add("comeback");
  if (streak >= 3) suggested.add("momentum");
  if (streak >= 7) suggested.add("iron-streak");
  if (streak >= 14) suggested.add("unstoppable");
  if (analytics.mockTrend.some((point) => (point.delta ?? 0) >= 10)) suggested.add("growth");
  if (analytics.masteryByTask.some((task) => task.attempts >= 3 && task.mastery >= 90)) suggested.add("sniper");
  const examsByDate = [...input.mockExams].sort((left, right) =>
    (left.data.takenAt ?? left.data.createdAt).toMillis() - (right.data.takenAt ?? right.data.createdAt).toMillis(),
  );
  if (examsByDate.length > 1) {
    const latest = examsByDate.at(-1)!;
    const latestPercent = latest.data.total.max ? latest.data.total.earned / latest.data.total.max : 0;
    const previousBest = Math.max(...examsByDate.slice(0, -1).map(({ data }) => data.total.max ? data.total.earned / data.total.max : 0));
    if (latestPercent > previousBest) suggested.add("personal-best");
  }
  if (analytics.masteryByTask.some((task) => task.mastery >= 75)) suggested.add("first-mastery");
  if (analytics.examReadiness >= 50) suggested.add("halfway");
  if (analytics.examReadiness >= 75) suggested.add("almost-ready");
  if (analytics.examReadiness >= 90) suggested.add("exam-ready");
  for (const task of analytics.masteryByTask.filter((value) => value.mastery >= 85)) {
    suggested.add(`task-master-${task.taskNumber}`);
  }
  const definitions = new Map(input.definitions.map((definition) => [definition.id, definition]));
  return {
    totalXp,
    level,
    levelXp,
    xpToNextLevel: XP_PER_LEVEL - levelXp,
    streak,
    earned: [...input.achievements]
      .sort((left, right) => right.data.earnedAt.toMillis() - left.data.earnedAt.toMillis())
      .map((achievement) => ({
        achievement,
        definition: definitions.get(achievement.data.achievementDefinitionId) ?? null,
      })),
    suggestedCodes: [...suggested],
  };
}

import type { DocumentWithId, ExamBlueprint, MockExam } from "../../lib/firebase/types.js";

export interface AnalyticsConfig {
  confidenceAttempts: number;
  weakThreshold: number;
  strongThreshold: number;
  totalExamTasks: number;
  readinessWeights: {
    latestMock: number;
    studiedMastery: number;
  };
}

export const defaultAnalyticsConfig: AnalyticsConfig = {
  confidenceAttempts: 3,
  weakThreshold: 45,
  strongThreshold: 75,
  totalExamTasks: 0,
  readinessWeights: { latestMock: 0.6, studiedMastery: 0.4 },
};

export interface TaskMastery {
  taskNumber: number;
  attempts: number;
  earned: number;
  max: number;
  rawPercent: number;
  mastery: number;
  lastEvidenceAt: number | null;
  freshnessDays: number | null;
}

export interface MockAnalytics {
  masteryByTask: TaskMastery[];
  examReadiness: number;
  studiedMastery: number;
  weakTasks: TaskMastery[];
  strongTasks: TaskMastery[];
  mockTrend: Array<{
    id: string;
    label: string;
    earned: number;
    max: number;
    percent: number;
    delta: number | null;
  }>;
  strongestSections: string[];
  growthSections: string[];
}

function percent(earned: number, maximum: number): number {
  return maximum > 0 ? Math.round((earned / maximum) * 100) : 0;
}

export function calculateMockAnalytics(
  exams: Array<DocumentWithId<MockExam>>,
  config = defaultAnalyticsConfig,
): MockAnalytics {
  const taskMap = new Map<number, { attempts: number; earned: number; max: number; lastEvidenceAt: number | null }>();
  for (const { data: exam } of exams) {
    const evidenceAt = (exam.takenAt ?? exam.createdAt).toMillis();
    for (const result of exam.taskResults) {
      const current = taskMap.get(result.taskNumber) ?? {
        attempts: 0,
        earned: 0,
        max: 0,
        lastEvidenceAt: null,
      };
      current.attempts += 1;
      current.earned += result.earned;
      current.max += result.max;
      current.lastEvidenceAt = Math.max(current.lastEvidenceAt ?? 0, evidenceAt);
      taskMap.set(result.taskNumber, current);
    }
  }
  const masteryByTask = [...taskMap.entries()]
    .map(([taskNumber, value]) => {
      const rawPercent = percent(value.earned, value.max);
      const confidence = Math.min(1, value.attempts / config.confidenceAttempts);
      return {
        taskNumber,
        ...value,
        rawPercent,
        mastery: Math.round(rawPercent * confidence),
        freshnessDays: value.lastEvidenceAt ? Math.floor((Date.now() - value.lastEvidenceAt) / 86_400_000) : null,
      };
    })
    .sort((left, right) => left.taskNumber - right.taskNumber);
  const studiedMastery = masteryByTask.length
    ? Math.round(
        masteryByTask.reduce((total, task) => total + task.mastery, 0) /
          masteryByTask.length,
      )
    : 0;

  const chronological = [...exams].sort((left, right) => {
    const leftTime = (left.data.takenAt ?? left.data.createdAt).toMillis();
    const rightTime = (right.data.takenAt ?? right.data.createdAt).toMillis();
    return leftTime - rightTime;
  });
  let previousPercent: number | null = null;
  const mockTrend = chronological.map(({ id, data: exam }) => {
    const currentPercent = percent(exam.total.earned, exam.total.max);
    const result = {
      id,
      label: exam.takenDate ?? exam.title,
      earned: exam.total.earned,
      max: exam.total.max,
      percent: currentPercent,
      delta: previousPercent === null ? null : currentPercent - previousPercent,
    };
    previousPercent = currentPercent;
    return result;
  });
  const latestPercent = mockTrend.at(-1)?.percent ?? 0;
  const totalExamTasks = config.totalExamTasks || new Set(
    exams.flatMap(({ data }) => data.taskResults.map((item) => item.taskNumber)),
  ).size || 1;
  const studiedCoverage = Math.min(1, masteryByTask.length / totalExamTasks);
  const examReadiness = Math.round(
    latestPercent * config.readinessWeights.latestMock +
      studiedMastery * studiedCoverage * config.readinessWeights.studiedMastery,
  );

  const latest = chronological.at(-1)?.data;
  const sectionEntries = latest
    ? [
        ["Тестовая часть", latest.sections.test],
        ["Изложение", latest.sections.exposition],
        ["Сочинение", latest.sections.essay],
        ["Грамотность", latest.sections.literacy],
        ["Фактическая точность", latest.sections.factualAccuracy],
      ] as const
    : [];
  const strongestSections = sectionEntries
    .filter(([, score]) => percent(score.earned, score.max) >= config.strongThreshold)
    .map(([title]) => title);
  const growthSections = sectionEntries
    .filter(([, score]) => percent(score.earned, score.max) < config.weakThreshold)
    .map(([title]) => title);

  return {
    masteryByTask,
    examReadiness,
    studiedMastery,
    weakTasks: masteryByTask.filter((task) => task.mastery < config.weakThreshold),
    strongTasks: masteryByTask.filter((task) => task.mastery >= config.strongThreshold),
    mockTrend,
    strongestSections,
    growthSections,
  };
}

export function gradeForScore(
  earned: number,
  thresholds: Record<string, number>,
): number {
  const entries = Object.entries(thresholds)
    .map(([grade, minimum]) => [Number(grade), minimum] as const)
    .filter(([grade, minimum]) => Number.isFinite(grade) && Number.isFinite(minimum))
    .sort((left, right) => right[1] - left[1]);
  const effective = entries.length
    ? entries
    : ([
        [5, 31],
        [4, 24],
        [3, 15],
        [2, 0],
      ] as const);
  return effective.find(([, minimum]) => earned >= minimum)?.[0] ?? 2;
}

export function gradeForBlueprint(
  earned: number,
  gkScore: number,
  blueprint: Pick<ExamBlueprint, "gradeRules" | "gradeThresholds">,
): { grade: number; explanation: string | null } {
  const rule = blueprint.gradeRules
    ?.filter((candidate) => earned >= candidate.minScore && earned <= candidate.maxScore)
    .sort((left, right) => right.grade - left.grade)[0];
  if (!rule) return { grade: gradeForScore(earned, blueprint.gradeThresholds), explanation: null };
  if (rule.minGkScore !== undefined && gkScore < rule.minGkScore) {
    return {
      grade: rule.fallbackGrade ?? Math.max(2, rule.grade - 1),
      explanation: `По общей сумме порог достигнут, но для оценки ${rule.grade} нужно не менее ${rule.minGkScore} баллов по ГК1–ГК4.`,
    };
  }
  return { grade: rule.grade, explanation: null };
}

import type {
  ExamBlueprint,
  ExamKind,
  EvaluationCriterion,
  Homework,
  ProgramProfile,
} from "../../lib/firebase/types.js";

export type ExamBlueprintSeed = Omit<
  ExamBlueprint,
  "createdAt" | "updatedAt" | "schemaVersion" | "publishedAt"
> & { publishedAt: null };

const FIPI_OGE_2027 = "https://fipi.ru/oge/demoversii-specifikacii-kodifikatory";
const FIPI_OGE_CHANGES_2027 = "https://doc.fipi.ru/oge/demoversii-specifikacii-kodifikatory/2027/Plan_izmeneniya_KIM_OGE_2027.pdf";
const FIPI_OGE_METHOD_2026 = "https://doc.fipi.ru/oge/dlya-predmetnyh-komissiy-subektov-rf/2026/mr_oge_russkiy_yazyk_2026.pdf";
const FIPI_EGE_2027 = "https://fipi.ru/ege/demoversii-specifikacii-kodifikatory";
const FIPI_EGE_CHANGES_2027 = "https://doc.fipi.ru/ege/demoversii-specifikacii-kodifikatory/2027/Plan_izmeneniya_KIM_EGE_2027.pdf";
const FIPI_EGE_NAVIGATOR_2026 = "https://doc.fipi.ru/navigator-podgotovki/navigator-ege/MR_rus_yaz_ege_2026.pdf";
const FIPI_EGE_METHOD_2026 = "https://doc.fipi.ru/ege/dlya-predmetnyh-komissiy-subektov-rf/2026/russki_yazyk_mr_ege_2026.pdf";

const ogeLiteracy = [
  { code: "ГК1", title: "Орфографические нормы", max: 3, errorLabel: "Орфографических ошибок", supportsErrorCount: true },
  { code: "ГК2", title: "Пунктуационные нормы", max: 3, errorLabel: "Пунктуационных ошибок", supportsErrorCount: true },
  { code: "ГК3", title: "Грамматические нормы", max: 3, errorLabel: "Грамматических ошибок", supportsErrorCount: true },
  { code: "ГК4", title: "Речевые нормы", max: 3, errorLabel: "Речевых ошибок", supportsErrorCount: true },
] as const;

const ogeExposition = [
  { code: "ИК1", title: "Содержание изложения", max: 2 },
  { code: "ИК2", title: "Сжатие исходного текста", max: 2 },
  { code: "ИК3", title: "Смысловая цельность и связность", max: 2 },
] as const;

const ogeEssay2026 = [
  { code: "СК1", title: "Ответ на вопрос задания", max: 1 },
  { code: "СК2", title: "Примеры-аргументы", max: 3 },
  { code: "СК3", title: "Смысловая цельность и логика", max: 2 },
  { code: "СК4", title: "Композиционная стройность", max: 1 },
] as const;

const ogeEssay2027 = [
  { code: "СК1", title: "Ответ на вопрос задания", max: 1 },
  { code: "СК2", title: "Примеры и их объяснение", max: 4 },
  { code: "СК3", title: "Смысловая цельность и логика", max: 2 },
  { code: "СК4", title: "Композиционная стройность", max: 1 },
] as const;

const egeEssay = [
  { code: "К1", title: "Отражение позиции автора", max: 1 },
  { code: "К2", title: "Комментарий к позиции автора", max: 3 },
  { code: "К3", title: "Собственное отношение к позиции автора", max: 2 },
  { code: "К4", title: "Фактическая точность", max: 1, errorLabel: "Фактических ошибок", supportsErrorCount: true },
  { code: "К5", title: "Логичность речи", max: 2, errorLabel: "Логических ошибок", supportsErrorCount: true },
  { code: "К6", title: "Этические нормы", max: 1, errorLabel: "Этических ошибок", supportsErrorCount: true },
  { code: "К7", title: "Орфографические нормы", max: 3, errorLabel: "Орфографических ошибок", supportsErrorCount: true },
  { code: "К8", title: "Пунктуационные нормы", max: 3, errorLabel: "Пунктуационных ошибок", supportsErrorCount: true },
  { code: "К9", title: "Грамматические нормы", max: 3, errorLabel: "Грамматических ошибок", supportsErrorCount: true },
  { code: "К10", title: "Речевые нормы", max: 3, errorLabel: "Речевых ошибок", supportsErrorCount: true },
] as const;

function ogeTasks(essayMax: number) {
  const titles: Record<number, string> = {
    2: "Синтаксический анализ",
    3: "Синтаксический анализ",
    4: "Пунктуационный анализ",
    5: "Пунктуационный анализ",
    6: "Орфографический анализ",
    7: "Орфографический анализ",
    8: "Нормы современного русского литературного языка",
    9: "Нормы современного русского литературного языка",
    10: "Анализ содержания текста",
    11: "Изобразительно-выразительные средства",
    12: "Лексический анализ",
  };
  return [
    { number: 1, title: "Сжатое изложение", maxScore: 6, readinessWeight: 6, sectionCode: "exposition", assessmentMode: "criteria" as const },
    ...Array.from({ length: 11 }, (_, index) => ({
      number: index + 2,
      title: titles[index + 2] ?? `Задание №${index + 2}`,
      maxScore: 1,
      readinessWeight: 1,
      sectionCode: "test",
      assessmentMode: "score" as const,
    })),
    {
      number: 13,
      title: "Сочинение-рассуждение",
      maxScore: essayMax,
      readinessWeight: essayMax,
      sectionCode: "essay",
      variants: ["13.1", "13.2", "13.3"],
      assessmentMode: "criteria" as const,
    },
  ];
}

export const OGE_RUSSIAN_2026_PILOT_ID = "oge-russian-2026-pilot-v1";
export const OGE_RUSSIAN_2027_PROJECT_ID = "oge-russian-2027-project-v1";
export const EGE_RUSSIAN_2027_PROJECT_ID = "ege-russian-2027-project-v1";

export const EGE_RUSSIAN_2027_SECONDARY_SCORE_SCALE = [
  0, 3, 5, 8, 10, 12, 15, 17, 20, 22, 24, 27, 29, 32, 34, 36, 37,
  39, 40, 42, 43, 45, 46, 48, 49, 51, 52, 54, 55, 57, 58, 60, 61, 63,
  64, 66, 67, 69, 70, 72, 73, 75, 78, 81, 83, 86, 89, 91, 94, 97, 100,
].map((secondary, primary) => ({ primary, secondary }));

export const examBlueprintSeeds: Record<string, ExamBlueprintSeed> = {
  [OGE_RUSSIAN_2026_PILOT_ID]: {
    programType: "oge", examKind: "oge", subject: "russian", year: 2026,
    versionYear: 2026, version: "pilot-v1", revision: "v1", status: "active",
    sourceStatus: "historical", sourceLabel: "Историческая конфигурация ОГЭ 2026",
    sourceUrls: [FIPI_OGE_2027, FIPI_OGE_METHOD_2026], publishedAt: null, taskCount: 13,
    primaryMaxScore: 37, maxScore: 37, durationMinutes: 235,
    gradeThresholds: { 2: 0, 3: 15, 4: 24, 5: 31 },
    gradeRules: [
      { grade: 2, minScore: 0, maxScore: 14 },
      { grade: 3, minScore: 15, maxScore: 23 },
      { grade: 4, minScore: 24, maxScore: 30 },
      { grade: 5, minScore: 31, maxScore: 37 },
    ], secondaryScoreScale: null,
    readinessWeights: { latestMock: 0.6, studiedMastery: 0.4 },
    sections: [
      { code: "exposition", title: "Изложение", maxScore: 6, taskNumbers: [1] },
      { code: "test", title: "Задания 2–12", maxScore: 11, taskNumbers: Array.from({ length: 11 }, (_, i) => i + 2) },
      { code: "essay", title: "Сочинение", maxScore: 7, taskNumbers: [13] },
      { code: "cross", title: "Грамотность и фактическая точность", maxScore: 13, taskNumbers: [1, 13] },
    ],
    tasks: ogeTasks(7),
    writingCriteria: {
      exposition: [...ogeExposition], essay: [...ogeEssay2026], literacy: [...ogeLiteracy],
      factual: { code: "ФК1", max: 1, errorLabel: "Фактических ошибок" },
      byTask: [
        { taskNumber: 1, title: "Сжатое изложение", criteriaVersion: "oge-2026-ik-v1", minWords: null, criteria: [...ogeExposition] },
        { taskNumber: 13, title: "Сочинение", criteriaVersion: "oge-2026-sk-v1", minWords: null, criteria: [...ogeEssay2026] },
      ],
    },
    crossTaskCriteria: [...ogeLiteracy, { code: "ФК1", title: "Фактическая точность", max: 1, errorLabel: "Фактических ошибок", supportsErrorCount: true }],
    wordCountRules: [{ id: "oge-2026-cross-140", taskNumbers: [1, 13], minimumWords: 140, effect: "zero-cross-task", label: "При суммарном объёме менее 140 слов ГК1–ГК4 и ФК1 оцениваются в 0 баллов." }],
  },
  [OGE_RUSSIAN_2027_PROJECT_ID]: {
    programType: "oge", examKind: "oge", subject: "russian", year: 2027,
    versionYear: 2027, version: "project-v1", revision: "v1", status: "active",
    sourceStatus: "project", sourceLabel: "Проект КИМ ОГЭ 2027 · ФИПИ",
    sourceUrls: [FIPI_OGE_2027, FIPI_OGE_CHANGES_2027, FIPI_OGE_METHOD_2026], publishedAt: null, taskCount: 13,
    primaryMaxScore: 38, maxScore: 38, durationMinutes: 235,
    gradeThresholds: {}, gradeRules: null, secondaryScoreScale: null,
    readinessWeights: { latestMock: 0.6, studiedMastery: 0.4 },
    sections: [
      { code: "exposition", title: "Изложение", maxScore: 6, taskNumbers: [1] },
      { code: "test", title: "Задания 2–12", maxScore: 11, taskNumbers: Array.from({ length: 11 }, (_, i) => i + 2) },
      { code: "essay", title: "Сочинение", maxScore: 8, taskNumbers: [13] },
      { code: "cross", title: "Грамотность и фактическая точность", maxScore: 13, taskNumbers: [1, 13] },
    ],
    tasks: ogeTasks(8),
    writingCriteria: {
      exposition: [...ogeExposition], essay: [...ogeEssay2027], literacy: [...ogeLiteracy],
      factual: { code: "ФК1", max: 1, errorLabel: "Фактических ошибок" },
      byTask: [
        { taskNumber: 1, title: "Сжатое изложение", criteriaVersion: "oge-2027-ik-project-v1", minWords: null, criteria: [...ogeExposition] },
        { taskNumber: 13, title: "Сочинение 13.1 / 13.2 / 13.3", criteriaVersion: "oge-2027-sk-project-v1", minWords: null, criteria: [...ogeEssay2027] },
      ],
    },
    crossTaskCriteria: [...ogeLiteracy, { code: "ФК1", title: "Фактическая точность", max: 1, errorLabel: "Фактических ошибок", supportsErrorCount: true }],
    wordCountRules: [{ id: "oge-2027-project-cross-140", taskNumbers: [1, 13], minimumWords: 140, effect: "zero-cross-task", label: "При суммарном объёме менее 140 слов ГК1–ГК4 и ФК1 оцениваются в 0 баллов." }],
  },
  [EGE_RUSSIAN_2027_PROJECT_ID]: {
    programType: "ege", examKind: "ege", subject: "russian", year: 2027,
    versionYear: 2027, version: "project-v1", revision: "v1", status: "active",
    sourceStatus: "project", sourceLabel: "Проект КИМ ЕГЭ 2027 · ФИПИ (изменений нет)",
    sourceUrls: [FIPI_EGE_2027, FIPI_EGE_CHANGES_2027, FIPI_EGE_NAVIGATOR_2026, FIPI_EGE_METHOD_2026], publishedAt: null, taskCount: 27,
    primaryMaxScore: 50, maxScore: 50, durationMinutes: 210,
    gradeThresholds: {}, gradeRules: null,
    secondaryScoreScale: EGE_RUSSIAN_2027_SECONDARY_SCORE_SCALE,
    readinessWeights: { latestMock: 0.6, studiedMastery: 0.4 },
    sections: [
      { code: "text-style", title: "Текст и стилистика", maxScore: 3, taskNumbers: [1, 2, 3] },
      { code: "norms", title: "Языковые нормы", maxScore: 6, taskNumbers: [4, 5, 6, 7, 8] },
      { code: "orthography", title: "Орфография", maxScore: 7, taskNumbers: [9, 10, 11, 12, 13, 14, 15] },
      { code: "punctuation", title: "Пунктуация", maxScore: 6, taskNumbers: [16, 17, 18, 19, 20, 21] },
      { code: "expressiveness", title: "Выразительность", maxScore: 2, taskNumbers: [22] },
      { code: "text-analysis", title: "Анализ текста", maxScore: 4, taskNumbers: [23, 24, 25, 26] },
      { code: "essay", title: "Сочинение №27", maxScore: 22, taskNumbers: [27] },
    ],
    tasks: Array.from({ length: 27 }, (_, index) => {
      const number = index + 1;
      const sectionCode = number <= 3 ? "text-style" : number <= 8 ? "norms" : number <= 15 ? "orthography" : number <= 21 ? "punctuation" : number === 22 ? "expressiveness" : number <= 26 ? "text-analysis" : "essay";
      const titles = [
        "Логико-смысловые отношения между предложениями в тексте",
        "Лексический анализ слова",
        "Функциональная стилистика и культура речи",
        "Орфоэпические нормы",
        "Лексические нормы и паронимы",
        "Лексическая сочетаемость, тавтология и плеоназм",
        "Морфологические нормы",
        "Синтаксические нормы",
        "Правописание гласных и согласных в корне",
        "Ъ/Ь, приставки, Ы/И после приставок",
        "Правописание суффиксов",
        "Личные окончания глаголов и суффиксы причастий",
        "НЕ / НИ",
        "Слитное, дефисное и раздельное написание",
        "Н / НН",
        "Однородные члены и сложное предложение",
        "Обособление",
        "Вводные конструкции, обращения и междометия",
        "Сложное предложение",
        "Сложное предложение с разными видами связи",
        "Пунктуационный анализ",
        "Изобразительно-выразительные средства",
        "Информационно-смысловая переработка текста",
        "Информативность текста и виды информации",
        "Лексический анализ",
        "Средства связи предложений в тексте",
        "Сочинение-рассуждение по исходному тексту",
      ];
      const maxScore = number === 27 ? 22 : [8, 22].includes(number) ? 2 : 1;
      return { number, title: titles[index] ?? `Задание №${number}`, maxScore, readinessWeight: maxScore, sectionCode, assessmentMode: number === 27 ? "criteria" as const : "score" as const };
    }),
    writingCriteria: {
      exposition: [], essay: [...egeEssay], literacy: [], factual: null,
      byTask: [{ taskNumber: 27, title: "Сочинение №27", criteriaVersion: "ege-2027-k1-k10-project-v1", minWords: 150, criteria: [...egeEssay] }],
    },
    crossTaskCriteria: [],
    wordCountRules: [{ id: "ege-2027-project-essay-150", taskNumbers: [27], minimumWords: 150, effect: "zero-writing", label: "При объёме 149 слов и менее сочинение по К1–К10 оценивается в 0 баллов." }],
  },
};

export function blueprintExamKind(blueprint: ExamBlueprint): ExamKind {
  return blueprint.examKind ?? blueprint.programType;
}

export function programBlueprintId(program: ProgramProfile): string | null {
  return program.currentBlueprintId ?? program.examBlueprintId;
}

export function programDisplayName(program: ProgramProfile): string {
  return program.displayName ?? program.title.replace(/\s*·\s*20\d{2}\s*$/, "");
}

export function blueprintPrimaryMax(blueprint: ExamBlueprint): number {
  return blueprint.primaryMaxScore ?? blueprint.maxScore;
}

export function secondaryScoreForPrimary(
  primary: number,
  scale: ExamBlueprint["secondaryScoreScale"],
): number | null {
  if (!scale?.length || !Number.isFinite(primary)) return null;
  return scale.find((item) => item.primary === primary)?.secondary ?? null;
}

export function blueprintTaskCount(blueprint: ExamBlueprint): number {
  return blueprint.taskCount ?? blueprint.tasks.length;
}

export type BlueprintCriterion = {
  code: string;
  title: string;
  max: number;
  errorLabel?: string;
  supportsErrorCount?: boolean;
};

export function writingConfigForTask(
  blueprint: ExamBlueprint,
  taskNumber: number,
): { title: string; criteriaVersion: string; minWords: number | null; criteria: BlueprintCriterion[] } | null {
  const explicit = blueprint.writingCriteria?.byTask?.find((item) => item.taskNumber === taskNumber);
  if (explicit) return explicit;
  if (blueprint.writingCriteria?.byTask?.length) return null;
  if (taskNumber === 1 && blueprint.writingCriteria?.exposition.length)
    return { title: "Изложение", criteriaVersion: `${blueprint.version}-exposition`, minWords: null, criteria: blueprint.writingCriteria.exposition };
  if (taskNumber === 13 && blueprint.writingCriteria?.essay.length)
    return { title: "Сочинение", criteriaVersion: `${blueprint.version}-essay`, minWords: null, criteria: blueprint.writingCriteria.essay };
  return null;
}

export function reviewCriteriaForTask(
  blueprint: ExamBlueprint,
  taskNumber: number,
): NonNullable<Homework["reviewCriteria"]> | null {
  const writing = writingConfigForTask(blueprint, taskNumber);
  if (!writing) return null;
  const cross = blueprint.crossTaskCriteria ?? [];
  return {
    content: writing.criteria,
    literacy: cross.filter((item) => item.code.startsWith("ГК") || item.code.startsWith("К")).map((item) => ({ ...item, errorLabel: item.errorLabel ?? "Ошибок" })),
    factual: cross.find((item) => item.code.startsWith("ФК"))
      ? { code: cross.find((item) => item.code.startsWith("ФК"))!.code, max: cross.find((item) => item.code.startsWith("ФК"))!.max, errorLabel: cross.find((item) => item.code.startsWith("ФК"))!.errorLabel ?? "Фактических ошибок" }
      : null,
  };
}

export function allScoredCriteria(blueprint: ExamBlueprint): BlueprintCriterion[] {
  return [
    ...(blueprint.writingCriteria?.byTask?.flatMap((item) => item.criteria) ?? []),
    ...(blueprint.crossTaskCriteria ?? []),
  ];
}

export function validateBlueprintTotals(blueprint: ExamBlueprint): boolean {
  const direct = blueprint.tasks
    .filter((task) => !writingConfigForTask(blueprint, task.number))
    .reduce((sum, task) => sum + task.maxScore, 0);
  const writing = blueprint.writingCriteria?.byTask?.reduce(
    (sum, item) => sum + item.criteria.reduce((inner, criterion) => inner + criterion.max, 0), 0,
  ) ?? 0;
  const cross = (blueprint.crossTaskCriteria ?? []).reduce((sum, criterion) => sum + criterion.max, 0);
  return direct + writing + cross === blueprintPrimaryMax(blueprint);
}

export function criteriaScore(criteria: EvaluationCriterion[]) {
  return criteria.reduce((score, criterion) => ({ earned: score.earned + criterion.earned, max: score.max + criterion.max }), { earned: 0, max: 0 });
}

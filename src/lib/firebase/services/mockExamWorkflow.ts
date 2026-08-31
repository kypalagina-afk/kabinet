import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { gradeForBlueprint } from "../../../features/analytics/mockAnalytics.js";
import {
  blueprintPrimaryMax,
  criteriaScore,
  secondaryScoreForPrimary,
  writingConfigForTask,
} from "../../../features/exams/blueprints.js";
import type {
  EvaluationCriterion,
  ExamBlueprint,
  MockExam,
  StudentProgram,
} from "../types.js";

export interface DetailedMockExamInput {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  examBlueprintId: string;
  title: string;
  takenDate: string;
  taskResults: MockExam["taskResults"];
  expositionCriteria: EvaluationCriterion[];
  essayCriteria: EvaluationCriterion[];
  essayComment: string | null;
  literacyCriteria: Array<EvaluationCriterion & { category: string }>;
  factualAccuracy: { earned: number; max: number; errorsCount: number | null };
  teacherComment: string | null;
  taskObservations?: Array<{ taskNumber: number; observation: string }>;
  publicRecommendations?: string[];
  criteriaResults?: EvaluationCriterion[];
}

function validateScore(earned: number, maximum: number, label: string) {
  if (
    !Number.isFinite(earned) ||
    !Number.isFinite(maximum) ||
    maximum < 0 ||
    earned < 0 ||
    earned > maximum
  ) {
    throw new Error(`Invalid score for ${label}`);
  }
}

function sumCriteria(criteria: EvaluationCriterion[]) {
  return criteria.reduce(
    (total, criterion) => {
      validateScore(criterion.earned, criterion.max, criterion.code);
      if (criterion.errorsCount !== null && criterion.errorsCount < 0) {
        throw new Error(`Invalid error count for ${criterion.code}`);
      }
      total.earned += criterion.earned;
      total.max += criterion.max;
      return total;
    },
    { earned: 0, max: 0 },
  );
}

export function calculateDetailedMockExam(
  input: DetailedMockExamInput,
  blueprint: ExamBlueprint,
): Pick<
  MockExam,
  | "taskResults"
  | "criteriaResults"
  | "sectionResults"
  | "sections"
  | "total"
  | "grade"
  | "secondaryScore"
> {
  const taskNumbers = new Set<number>();
  for (const result of input.taskResults) {
    validateScore(result.earned, result.max, `task ${result.taskNumber}`);
    if (taskNumbers.has(result.taskNumber)) throw new Error("Duplicate exam task");
    taskNumbers.add(result.taskNumber);
  }
  if (input.criteriaResults) {
    const blueprintTasks = new Map(blueprint.tasks.map((task) => [task.number, task]));
    const directTasks = blueprint.tasks.filter(
      (task) => !writingConfigForTask(blueprint, task.number),
    );
    const expectedDirect = new Set(directTasks.map((task) => task.number));
    for (const result of input.taskResults) {
      const task = blueprintTasks.get(result.taskNumber);
      if (!task || !expectedDirect.has(result.taskNumber) || result.max !== task.maxScore)
        throw new Error(`Task ${result.taskNumber} does not match blueprint`);
    }
    if (input.taskResults.length !== directTasks.length)
      throw new Error("Mock exam task set does not match blueprint");

    const allowedCriteria = new Map<string, number>();
    for (const task of blueprint.tasks) {
      for (const criterion of writingConfigForTask(blueprint, task.number)?.criteria ?? [])
        allowedCriteria.set(criterion.code, criterion.max);
    }
    for (const criterion of blueprint.crossTaskCriteria ?? [])
      allowedCriteria.set(criterion.code, criterion.max);
    const seen = new Set<string>();
    for (const criterion of input.criteriaResults) {
      validateScore(criterion.earned, criterion.max, criterion.code);
      if (seen.has(criterion.code) || allowedCriteria.get(criterion.code) !== criterion.max)
        throw new Error(`Criterion ${criterion.code} does not match blueprint`);
      if (criterion.errorsCount !== null && criterion.errorsCount < 0)
        throw new Error(`Invalid error count for ${criterion.code}`);
      seen.add(criterion.code);
    }
    if (seen.size !== allowedCriteria.size)
      throw new Error("Mock exam criteria set does not match blueprint");

    const sectionResults: Record<string, { earned: number; max: number }> = {};
    for (const section of blueprint.sections)
      sectionResults[section.code] = { earned: 0, max: 0 };
    for (const result of input.taskResults) {
      const sectionCode = blueprintTasks.get(result.taskNumber)!.sectionCode;
      const score = sectionResults[sectionCode] ?? { earned: 0, max: 0 };
      sectionResults[sectionCode] = {
        earned: score.earned + result.earned,
        max: score.max + result.max,
      };
    }
    const writingByTask = blueprint.writingCriteria?.byTask ?? [];
    for (const writing of writingByTask) {
      const sectionCode = blueprintTasks.get(writing.taskNumber)?.sectionCode ?? "writing";
      const codes = new Set(writing.criteria.map((criterion) => criterion.code));
      const score = criteriaScore(input.criteriaResults.filter((item) => codes.has(item.code)));
      sectionResults[sectionCode] = score;
    }
    const crossCodes = new Set((blueprint.crossTaskCriteria ?? []).map((criterion) => criterion.code));
    if (crossCodes.size)
      sectionResults.cross = criteriaScore(input.criteriaResults.filter((item) => crossCodes.has(item.code)));
    const total = Object.values(sectionResults).reduce(
      (score, section) => ({ earned: score.earned + section.earned, max: score.max + section.max }),
      { earned: 0, max: 0 },
    );
    if (total.max !== blueprintPrimaryMax(blueprint))
      throw new Error(`Detailed mock maximum ${total.max} does not match blueprint ${blueprintPrimaryMax(blueprint)}`);
    const expositionCodes = new Set(writingConfigForTask(blueprint, 1)?.criteria.map((item) => item.code) ?? []);
    const essayTask = writingByTask.find((item) => item.taskNumber !== 1) ?? writingByTask[0];
    const essayCodes = new Set(essayTask?.criteria.map((item) => item.code) ?? []);
    const literacyCodes = new Set((blueprint.crossTaskCriteria ?? []).filter((item) => item.code.startsWith("ГК")).map((item) => item.code));
    const factualCriterion = input.criteriaResults.find((item) => item.code.startsWith("ФК"));
    const expositionCriteria = input.criteriaResults.filter((item) => expositionCodes.has(item.code));
    const essayCriteria = input.criteriaResults.filter((item) => essayCodes.has(item.code));
    const literacyCriteria = input.criteriaResults.filter((item) => literacyCodes.has(item.code)).map((item) => ({ ...item, category: item.code }));
    const test = input.taskResults.reduce((score, result) => ({ earned: score.earned + result.earned, max: score.max + result.max }), { earned: 0, max: 0 });
    const grade = gradeForBlueprint(
      total.earned,
      literacyCriteria.reduce((sum, item) => sum + item.earned, 0),
      blueprint,
    ).grade;
    return {
      taskResults: input.taskResults,
      criteriaResults: input.criteriaResults,
      sectionResults,
      secondaryScore: secondaryScoreForPrimary(total.earned, blueprint.secondaryScoreScale),
      sections: {
        test,
        exposition: { ...criteriaScore(expositionCriteria), criteria: expositionCriteria },
        essay: { ...criteriaScore(essayCriteria), criteria: essayCriteria, comment: input.essayComment?.trim() || null },
        literacy: { ...criteriaScore(literacyCriteria), criteria: literacyCriteria },
        factualAccuracy: factualCriterion
          ? { earned: factualCriterion.earned, max: factualCriterion.max, errorsCount: factualCriterion.errorsCount }
          : { earned: 0, max: 0, errorsCount: null },
      },
      total,
      grade,
    };
  }

  const test = input.taskResults.reduce(
    (score, result) => ({
      earned: score.earned + result.earned,
      max: score.max + result.max,
    }),
    { earned: 0, max: 0 },
  );
  const exposition = sumCriteria(input.expositionCriteria);
  const essay = sumCriteria(input.essayCriteria);
  const literacy = sumCriteria(input.literacyCriteria);
  validateScore(
    input.factualAccuracy.earned,
    input.factualAccuracy.max,
    "factual accuracy",
  );
  const total = [test, exposition, essay, literacy, input.factualAccuracy].reduce(
    (score, section) => ({
      earned: score.earned + section.earned,
      max: score.max + section.max,
    }),
    { earned: 0, max: 0 },
  );
  if (total.max !== blueprint.maxScore) {
    throw new Error(
      `Detailed mock maximum ${total.max} does not match blueprint ${blueprint.maxScore}`,
    );
  }
  return {
    taskResults: input.taskResults,
    sections: {
      test,
      exposition: { ...exposition, criteria: input.expositionCriteria },
      essay: {
        ...essay,
        criteria: input.essayCriteria,
        comment: input.essayComment?.trim() || null,
      },
      literacy: { ...literacy, criteria: input.literacyCriteria },
      factualAccuracy: input.factualAccuracy,
    },
    total,
    grade: gradeForBlueprint(total.earned, literacy.earned, blueprint).grade,
    secondaryScore: secondaryScoreForPrimary(total.earned, blueprint.secondaryScoreScale),
  };
}

export async function createDetailedMockExam(
  db: Firestore,
  input: DetailedMockExamInput,
): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.takenDate)) {
    throw new Error("Mock exam date is invalid");
  }
  const title = input.title.trim();
  if (!title) throw new Error("Mock exam title is required");
  const programReference = doc(db, "studentPrograms", input.studentProgramId);
  const blueprintReference = doc(db, "examBlueprints", input.examBlueprintId);
  const examReference = doc(collection(db, "mockExams"));
  const xpEventReference = doc(db, "gamificationEvents", `mock_completed__${examReference.id}`);
  const achievementReference = doc(db, "studentAchievements", `${input.studentProgramId}__battle-baptism`);

  await runTransaction(db, async (transaction) => {
    const [programSnapshot, blueprintSnapshot, xpEventSnapshot, achievementSnapshot] = await Promise.all([
      transaction.get(programReference),
      transaction.get(blueprintReference),
      transaction.get(xpEventReference),
      transaction.get(achievementReference),
    ]);
    if (!programSnapshot.exists() || !blueprintSnapshot.exists()) {
      throw new Error("Student program or exam blueprint does not exist");
    }
    const program = programSnapshot.data() as StudentProgram;
    if (
      program.teacherId !== input.teacherId ||
      program.studentId !== input.studentId ||
      program.status !== "active"
    ) {
      throw new Error("Active student program ownership check failed");
    }
    const blueprint = blueprintSnapshot.data() as ExamBlueprint;
    const calculated = calculateDetailedMockExam(input, blueprint);
    transaction.set(examReference, {
      teacherId: input.teacherId,
      studentId: input.studentId,
      studentProgramId: input.studentProgramId,
      examBlueprintId: input.examBlueprintId,
      title,
      takenAt: null,
      takenDate: input.takenDate,
      ...calculated,
      teacherComment: input.teacherComment?.trim() || null,
      taskObservations: (input.taskObservations ?? []).map((item) => ({ taskNumber: item.taskNumber, observation: item.observation.trim() })).filter((item) => item.observation),
      publicRecommendations: (input.publicRecommendations ?? []).map((item) => item.trim()).filter(Boolean),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
    if (!xpEventSnapshot.exists()) {
      transaction.set(xpEventReference, {
        teacherId: input.teacherId,
        studentId: input.studentId,
        studentProgramId: input.studentProgramId,
        eventType: "mock_completed",
        sourceType: "mockExam",
        sourceId: examReference.id,
        xpDelta: 100,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
      });
    }
    if (!achievementSnapshot.exists()) {
      transaction.set(achievementReference, {
        teacherId: input.teacherId,
        studentId: input.studentId,
        studentProgramId: input.studentProgramId,
        achievementDefinitionId: "battle-baptism",
        earnedAt: serverTimestamp(),
        metadata: { sourceType: "mockExam", sourceId: examReference.id },
        schemaVersion: 1,
      });
    }
  });
  return examReference.id;
}

export async function updateDetailedMockExam(
  db: Firestore,
  examId: string,
  input: DetailedMockExamInput,
): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.takenDate)) throw new Error("Mock exam date is invalid");
  const title = input.title.trim();
  if (!title) throw new Error("Mock exam title is required");
  const examReference = doc(db, "mockExams", examId);
  const programReference = doc(db, "studentPrograms", input.studentProgramId);
  const blueprintReference = doc(db, "examBlueprints", input.examBlueprintId);
  await runTransaction(db, async (transaction) => {
    const [examSnapshot, programSnapshot, blueprintSnapshot] = await Promise.all([
      transaction.get(examReference), transaction.get(programReference), transaction.get(blueprintReference),
    ]);
    if (!examSnapshot.exists() || !programSnapshot.exists() || !blueprintSnapshot.exists()) throw new Error("Mock exam, program or blueprint does not exist");
    const existing = examSnapshot.data() as MockExam;
    const program = programSnapshot.data() as StudentProgram;
    if (existing.teacherId !== input.teacherId || existing.studentId !== input.studentId || existing.studentProgramId !== input.studentProgramId || program.teacherId !== input.teacherId || program.studentId !== input.studentId) throw new Error("Mock exam ownership check failed");
    const calculated = calculateDetailedMockExam(input, blueprintSnapshot.data() as ExamBlueprint);
    transaction.update(examReference, {
      title,
      takenDate: input.takenDate,
      ...calculated,
      teacherComment: input.teacherComment?.trim() || null,
      taskObservations: (input.taskObservations ?? []).map((item) => ({ taskNumber: item.taskNumber, observation: item.observation.trim() })).filter((item) => item.observation),
      publicRecommendations: (input.publicRecommendations ?? []).map((item) => item.trim()).filter(Boolean),
      updatedAt: serverTimestamp(),
    });
  });
  return examId;
}

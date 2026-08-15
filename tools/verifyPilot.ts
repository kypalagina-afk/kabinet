import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  desiredFieldsMatch,
  PRODUCTION_PROJECT_ID,
  resolveSeedValue,
  validatePlan,
} from "./seed.js";

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function privateInputPath(inputPath: string): string {
  const projectRoot = resolve(import.meta.dirname, "..");
  const privateRoot = resolve(projectRoot, "private");
  const absolute = isAbsolute(inputPath) ? resolve(inputPath) : resolve(projectRoot, inputPath);
  const insidePrivate = relative(privateRoot, absolute);
  if (
    insidePrivate === "" ||
    insidePrivate === ".." ||
    insidePrivate.startsWith(`..${sep}`) ||
    isAbsolute(insidePrivate)
  ) {
    throw new Error("Verification input must be inside the Git-ignored private/ directory");
  }
  return absolute;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is missing or is not an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value.map((item, index) => object(item, `${label}[${index}]`));
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number") throw new Error(`${label} is not numeric`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is not a string`);
  return value;
}

function timestampIso(value: unknown, label: string): string {
  if (!(value instanceof Timestamp)) throw new Error(`${label} is not a Timestamp`);
  return value.toDate().toISOString();
}

async function main(): Promise<void> {
  const input = argumentValue("--input");
  if (!input) throw new Error("Use --input=private/<seed-file>.json");
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Production verification refuses Firebase emulator variables");
  }

  const plan = validatePlan(
    JSON.parse(await readFile(privateInputPath(input), "utf8")) as unknown,
  );
  const teacher = plan.authUsers.find(({ key }) => key === "teacher");
  const student = plan.authUsers.find(({ key }) => key === "student");
  if (!teacher || !student || typeof teacher.username !== "string") {
    throw new Error("Resolved pilot Auth identities are missing");
  }
  const runtime = { teacherUsername: teacher.username };

  const app =
    getApps().find(({ name }) => name === "pilot-production-verification") ??
    initializeApp(
      { credential: applicationDefault(), projectId: PRODUCTION_PROJECT_ID },
      "pilot-production-verification",
    );
  try {
    const auth = getAuth(app);
    const db = getFirestore(app);
    const [teacherUser, studentUser] = await Promise.all([
      auth.getUser(teacher.uid),
      auth.getUser(student.uid),
    ]);
    const expectedAuth = [
      {
        record: teacherUser,
        email: "kypalagina@kabinet25.example.com",
        displayName: teacher.displayName,
      },
      {
        record: studentUser,
        email: "lera9@kabinet25.example.com",
        displayName: student.displayName,
      },
    ];
    for (const expected of expectedAuth) {
      if (
        expected.record.email !== expected.email ||
        expected.record.displayName !== expected.displayName ||
        expected.record.disabled ||
        !expected.record.emailVerified
      ) {
        throw new Error(`Auth verification failed for ${expected.record.uid}`);
      }
    }

    const snapshots = await Promise.all(plan.writes.map(({ path }) => db.doc(path).get()));
    const actual = new Map<string, Record<string, unknown>>();
    plan.writes.forEach(({ path, data }, index) => {
      const snapshot = snapshots[index];
      if (!snapshot?.exists) throw new Error(`Missing Firestore document ${path}`);
      const existing = snapshot.data() ?? {};
      const desired = resolveSeedValue(data, runtime) as Record<string, unknown>;
      if (!desiredFieldsMatch(existing, desired)) {
        throw new Error(`Firestore document differs from seed: ${path}`);
      }
      actual.set(path, existing);
    });

    const program = object(actual.get("programProfiles/oge-russian-2027"), "program profile");
    const mock = object(
      actual.get("mockExams/student-lera9-v1__mock-2026-06-16"),
      "mock exam",
    );
    if (program.examBlueprintId !== null) {
      throw new Error("OGE 2027 program must not reference the historical 2026 blueprint");
    }
    if (mock.examBlueprintId !== "oge-russian-2026-pilot-v1") {
      throw new Error("Historical mock must reference the OGE 2026 pilot blueprint");
    }

    const total = object(mock.total, "mock total");
    const sections = object(mock.sections, "mock sections");
    const testSection = object(sections.test, "mock test section");
    const taskResults = array(mock.taskResults, "mock task results");
    const taskEarned = taskResults.reduce(
      (sum, task) => sum + number(task.earned, "task earned"),
      0,
    );
    const taskMax = taskResults.reduce((sum, task) => sum + number(task.max, "task max"), 0);
    if (
      number(total.earned, "total earned") !== 20 ||
      number(total.max, "total max") !== 37 ||
      number(testSection.earned, "test earned") !== 7 ||
      number(testSection.max, "test max") !== 11 ||
      taskEarned !== 7 ||
      taskMax !== 11
    ) {
      throw new Error("Mock score verification failed");
    }

    const submission = object(
      actual.get(
        "homeworkSubmissions/student-lera9-v1__essay-finish-2026-08-14__submission-1",
      ),
      "homework submission",
    );
    const evaluation = object(submission.teacherEvaluation, "teacher evaluation");
    const criteria = array(evaluation.criteria, "essay criteria");
    const expectedCriteria = new Map([
      ["СК1", [1, 1]],
      ["СК2", [1, 3]],
      ["СК3", [1, 2]],
      ["СК4", [1, 1]],
    ]);
    for (const criterion of criteria) {
      const code = string(criterion.code, "criterion code");
      const expected = expectedCriteria.get(code);
      if (
        !expected ||
        number(criterion.earned, `${code} earned`) !== expected[0] ||
        number(criterion.max, `${code} max`) !== expected[1]
      ) {
        throw new Error(`Essay criterion verification failed for ${code}`);
      }
    }
    if (
      number(evaluation.scoreEarned, "essay earned") !== 4 ||
      number(evaluation.scoreMax, "essay max") !== 7 ||
      criteria.length !== 4
    ) {
      throw new Error("Essay total verification failed");
    }

    const series = object(
      actual.get("lessonSeries/student-lera9-v1__thu-1000-msk"),
      "lesson series",
    );
    const originalLesson = object(
      actual.get("lessons/student-lera9-v1__2026-08-13t1000-msk"),
      "original lesson",
    );
    const movedLesson = object(
      actual.get("lessons/student-lera9-v1__2026-08-14t1000-msk__rescheduled"),
      "moved lesson",
    );
    if (
      series.startLocalTime !== "10:00" ||
      series.durationMinutes !== 60 ||
      series.baseTimezone !== "Europe/Moscow" ||
      originalLesson.rescheduledToLessonId !==
        "student-lera9-v1__2026-08-14t1000-msk__rescheduled" ||
      movedLesson.rescheduledFromLessonId !== "student-lera9-v1__2026-08-13t1000-msk" ||
      originalLesson.status !== "rescheduled" ||
      movedLesson.status !== "completed"
    ) {
      throw new Error("Schedule or reschedule linkage verification failed");
    }

    console.log(`Verified Firebase project: ${PRODUCTION_PROJECT_ID}`);
    console.log("Auth: 2/2 users exist and match UID/email/displayName/state.");
    console.log("Firestore: 14/14 documents exist and match every planned seed field.");
    console.log("Blueprint: OGE-2027 profile=null; historical mock=oge-russian-2026-pilot-v1.");
    console.log(`Mock: ${total.earned}/${total.max}; test: ${testSection.earned}/${testSection.max}.`);
    console.log(
      `Previous essay: ${evaluation.scoreEarned}/${evaluation.scoreMax}; criteria: ` +
        criteria
          .map((criterion) => `${criterion.code} ${criterion.earned}/${criterion.max}`)
          .join(", "),
    );
    console.log(
      `Schedule: Thursday ${series.startLocalTime} ${series.baseTimezone}, ` +
        `${series.durationMinutes} minutes.`,
    );
    console.log(
      `Reschedule: ${timestampIso(originalLesson.startAt, "original start")} -> ` +
        `${timestampIso(movedLesson.startAt, "moved start")}; reciprocal links verified.`,
    );
    console.log("Sensitive conference fields were not printed.");
  } finally {
    await deleteApp(app);
  }
}

const isDirectExecution = process.argv[1]
  ? resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

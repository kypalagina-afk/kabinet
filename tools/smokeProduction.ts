import { emitKeypressEvents } from "node:readline";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deleteApp, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { usernameToTechnicalEmail } from "../src/lib/firebase/authAlias.js";

const PROJECT_ID = "kabinet-25";
const AUTH_ALIAS_DOMAIN = "kabinet25.example.com";
const TEACHER_UID = "teacher-pilot-v1";
const STUDENT_UID = "student-lera9-v1";
const STUDENT_PROGRAM_ID = "student-lera9-v1__oge-russian-2027";
const PROGRAM_PROFILE_ID = "oge-russian-2027";
const LESSON_SERIES_ID = "student-lera9-v1__thu-1000-msk";
const LESSON_ID = "student-lera9-v1__2026-08-14t1000-msk__rescheduled";
const HOMEWORK_ID = "student-lera9-v1__essay-new-due-2026-08-23";
const SUBMISSION_ID = "student-lera9-v1__essay-finish-2026-08-14__submission-1";
const MOCK_EXAM_ID = "student-lera9-v1__mock-2026-06-16";
const XP_SENTINEL_ID = "smoke-forbidden-student-lera9-v1";

interface SmokeCheck {
  actor: "anonymous" | "teacher" | "student" | "runner";
  check: string;
  status: "pass" | "fail";
  details: string;
}

interface SmokeReport {
  projectId: string;
  startedAt: string;
  finishedAt?: string;
  checks: SmokeCheck[];
  summary?: { passed: number; failed: number };
}

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing process-scoped Firebase config: ${name}`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "permission-denied" || code === "firestore/permission-denied";
}

async function promptHidden(message: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("Interactive terminal is required for hidden password input");
  }

  return new Promise((resolvePromise, rejectPromise) => {
    let value = "";
    const wasRaw = process.stdin.isRaw;
    const finish = (error?: Error) => {
      process.stdin.off("keypress", onKeypress);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdout.write("\n");
      if (error) rejectPromise(error);
      else resolvePromise(value);
    };
    const onKeypress = (character: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        finish(new Error("Production smoke test cancelled"));
      } else if (key.name === "return" || key.name === "enter") {
        finish();
      } else if (key.name === "backspace") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (character && !key.ctrl) {
        value += character;
        process.stdout.write("*");
      }
    };

    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", onKeypress);
    process.stdout.write(message);
  });
}

async function expectPermissionDenied(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (isPermissionDenied(error)) return;
    throw new Error(
      `Expected Permission Denied, received ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  throw new Error("Operation unexpectedly succeeded; expected Permission Denied");
}

function record(
  report: SmokeReport,
  actor: SmokeCheck["actor"],
  check: string,
  details: string,
): void {
  report.checks.push({ actor, check, status: "pass", details });
  console.log(`PASS [${actor}] ${check}: ${details}`);
}

async function runCheck(
  report: SmokeReport,
  actor: SmokeCheck["actor"],
  check: string,
  operation: () => Promise<string>,
): Promise<void> {
  try {
    record(report, actor, check, await operation());
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    report.checks.push({ actor, check, status: "fail", details });
    console.error(`FAIL [${actor}] ${check}: ${details}`);
  }
}

async function main(): Promise<void> {
  const reportPath = argumentValue("--report");
  if (!reportPath) throw new Error("--report=<temporary path> is required");
  if (argumentValue("--confirm-project") !== PROJECT_ID) {
    throw new Error(`Exact --confirm-project=${PROJECT_ID} is required`);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Production smoke test refuses Firebase emulator overrides");
  }

  const firebaseOptions: FirebaseOptions = {
    apiKey: requiredEnvironment("FIREBASE_SMOKE_API_KEY"),
    authDomain: requiredEnvironment("FIREBASE_SMOKE_AUTH_DOMAIN"),
    projectId: requiredEnvironment("FIREBASE_SMOKE_PROJECT_ID"),
    appId: requiredEnvironment("FIREBASE_SMOKE_APP_ID"),
  };
  assert(firebaseOptions.projectId === PROJECT_ID, "Firebase SDK project ID mismatch");

  const report: SmokeReport = {
    projectId: PROJECT_ID,
    startedAt: new Date().toISOString(),
    checks: [],
  };
  const apps = [
    initializeApp(firebaseOptions, "production-smoke-anonymous"),
    initializeApp(firebaseOptions, "production-smoke-teacher"),
    initializeApp(firebaseOptions, "production-smoke-student"),
  ];
  const anonymousDb = getFirestore(apps[0]);
  const teacherAuth = getAuth(apps[1]);
  const teacherDb = getFirestore(apps[1]);
  const studentAuth = getAuth(apps[2]);
  const studentDb = getFirestore(apps[2]);

  try {
    await setPersistence(teacherAuth, inMemoryPersistence);
    await setPersistence(studentAuth, inMemoryPersistence);

    await runCheck(report, "anonymous", "single-document read denied", async () => {
      await expectPermissionDenied(() => getDoc(doc(anonymousDb, "students", STUDENT_UID)));
      return "students/student-lera9-v1 returned Permission Denied";
    });
    await runCheck(report, "anonymous", "list/query denied", async () => {
      await expectPermissionDenied(() => getDocs(collection(anonymousDb, "students")));
      return "students collection list returned Permission Denied";
    });
    await runCheck(report, "anonymous", "write denied", async () => {
      await expectPermissionDenied(() =>
        updateDoc(doc(anonymousDb, "students", STUDENT_UID), { displayName: "Лера" }),
      );
      return "same-value student update returned Permission Denied";
    });

    let teacherPassword = await promptHidden("Пароль teacher kypalagina: ");
    await runCheck(report, "teacher", "real password login", async () => {
      const credential = await signInWithEmailAndPassword(
        teacherAuth,
        usernameToTechnicalEmail("kypalagina", AUTH_ALIAS_DOMAIN),
        teacherPassword,
      );
      teacherPassword = "";
      assert(credential.user.uid === TEACHER_UID, `Unexpected teacher UID ${credential.user.uid}`);
      return `authenticated UID ${TEACHER_UID}`;
    });
    teacherPassword = "";

    let studentPassword = await promptHidden("Пароль student lera9: ");
    await runCheck(report, "student", "real password login", async () => {
      const credential = await signInWithEmailAndPassword(
        studentAuth,
        usernameToTechnicalEmail("lera9", AUTH_ALIAS_DOMAIN),
        studentPassword,
      );
      studentPassword = "";
      assert(credential.user.uid === STUDENT_UID, `Unexpected student UID ${credential.user.uid}`);
      return `authenticated UID ${STUDENT_UID}`;
    });
    studentPassword = "";

    await runTeacherReads(report, teacherDb);
    await runStudentReads(report, studentDb);
    await runStudentForbiddenWrites(report, studentDb);
  } finally {
    await Promise.allSettled([signOut(teacherAuth), signOut(studentAuth)]);
    await Promise.allSettled(apps.map((app) => deleteApp(app)));
    report.finishedAt = new Date().toISOString();
    report.summary = {
      passed: report.checks.filter(({ status }) => status === "pass").length,
      failed: report.checks.filter(({ status }) => status === "fail").length,
    };
    await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    console.log(`Smoke report written to temporary path: ${resolve(reportPath)}`);
  }

  if ((report.summary?.failed ?? 1) > 0) process.exitCode = 1;
}

async function runTeacherReads(report: SmokeReport, db: Firestore): Promise<void> {
  await runCheck(report, "teacher", "own user profile", async () => {
    const snapshot = await getDoc(doc(db, "users", TEACHER_UID));
    assert(snapshot.exists(), "teacher user profile is missing");
    assert(snapshot.data().role === "teacher", "teacher role mismatch");
    return "users/teacher-pilot-v1 loaded with role teacher";
  });
  await runCheck(report, "teacher", "Lera is visible in owned students query", async () => {
    const snapshot = await getDocs(
      query(collection(db, "students"), where("teacherId", "==", TEACHER_UID)),
    );
    const lera = snapshot.docs.find(({ id }) => id === STUDENT_UID);
    assert(lera?.data().displayName === "Лера", "Lera is missing from teacher query");
    return `${snapshot.size} owned student(s); Лера found`;
  });
  await runCheck(report, "teacher", "program and goal", async () => {
    const [studentProgram, programProfile] = await Promise.all([
      getDoc(doc(db, "studentPrograms", STUDENT_PROGRAM_ID)),
      getDoc(doc(db, "programProfiles", PROGRAM_PROFILE_ID)),
    ]);
    assert(studentProgram.data()?.goal?.displayText === "ОГЭ на 4", "goal mismatch");
    assert(programProfile.data()?.title === "ОГЭ · Русский язык · 2027", "program mismatch");
    return "ОГЭ · Русский язык · 2027; goal ОГЭ на 4";
  });
  await runCheck(report, "teacher", "lessons query", async () => {
    const snapshot = await getDocs(
      query(
        collection(db, "lessons"),
        where("teacherId", "==", TEACHER_UID),
        where("studentId", "==", STUDENT_UID),
      ),
    );
    assert(snapshot.size >= 3, `expected at least 3 lessons, received ${snapshot.size}`);
    return `${snapshot.size} Lera lessons visible`;
  });
  await runCheck(report, "teacher", "homework and submission", async () => {
    const [homeworks, submission] = await Promise.all([
      getDocs(
        query(
          collection(db, "homeworks"),
          where("teacherId", "==", TEACHER_UID),
          where("studentId", "==", STUDENT_UID),
        ),
      ),
      getDoc(doc(db, "homeworkSubmissions", SUBMISSION_ID)),
    ]);
    assert(homeworks.docs.some(({ id }) => id === HOMEWORK_ID), "new homework is missing");
    const evaluation = submission.data()?.teacherEvaluation;
    assert(evaluation?.scoreEarned === 4 && evaluation?.scoreMax === 7, "submission score mismatch");
    return `${homeworks.size} homework(s); checked submission 4/7 visible`;
  });
  await runCheck(report, "teacher", "detailed mock exam", async () => {
    const snapshot = await getDoc(doc(db, "mockExams", MOCK_EXAM_ID));
    const data = snapshot.data();
    assert(data?.total?.earned === 20 && data?.total?.max === 37, "mock total mismatch");
    assert(data?.sections?.test?.earned === 7 && data?.sections?.test?.max === 11, "test score mismatch");
    assert(Array.isArray(data?.taskResults) && data.taskResults.length === 11, "task detail mismatch");
    return "20/37 total, 7/11 test, 11 task results";
  });
}

async function runStudentReads(report: SmokeReport, db: Firestore): Promise<void> {
  await runCheck(report, "student", "own user and student profiles", async () => {
    const [user, student] = await Promise.all([
      getDoc(doc(db, "users", STUDENT_UID)),
      getDoc(doc(db, "students", STUDENT_UID)),
    ]);
    assert(user.data()?.role === "student", "student user role mismatch");
    assert(student.data()?.displayName === "Лера", "student profile mismatch");
    return "users/student-lera9-v1 and own student profile loaded";
  });
  await runCheck(report, "student", "other user profile denied", async () => {
    await expectPermissionDenied(() => getDoc(doc(db, "users", TEACHER_UID)));
    return "teacher user profile returned Permission Denied";
  });
  await runCheck(report, "student", "unscoped students list denied", async () => {
    await expectPermissionDenied(() => getDocs(collection(db, "students")));
    return "students collection list returned Permission Denied";
  });
  await runCheck(report, "student", "other student document denied", async () => {
    await expectPermissionDenied(() => getDoc(doc(db, "students", "another-student-smoke")));
    return "other student path returned Permission Denied";
  });
  await runCheck(report, "student", "program and goal", async () => {
    const [studentProgram, programProfile] = await Promise.all([
      getDoc(doc(db, "studentPrograms", STUDENT_PROGRAM_ID)),
      getDoc(doc(db, "programProfiles", PROGRAM_PROFILE_ID)),
    ]);
    assert(studentProgram.data()?.goal?.displayText === "ОГЭ на 4", "goal mismatch");
    assert(programProfile.data()?.title === "ОГЭ · Русский язык · 2027", "program mismatch");
    return "ОГЭ · Русский язык · 2027; goal ОГЭ на 4";
  });
  await runCheck(report, "student", "own schedule", async () => {
    const [series, lessons] = await Promise.all([
      getDoc(doc(db, "lessonSeries", LESSON_SERIES_ID)),
      getDocs(query(collection(db, "lessons"), where("studentId", "==", STUDENT_UID))),
    ]);
    assert(series.data()?.startLocalTime === "10:00", "schedule time mismatch");
    assert(series.data()?.weekdays?.includes(4), "Thursday schedule mismatch");
    assert(lessons.size >= 3, `expected at least 3 lessons, received ${lessons.size}`);
    return `Thursday 10:00 Europe/Moscow; ${lessons.size} lessons visible`;
  });
  await runCheck(report, "student", "new homework", async () => {
    const snapshot = await getDoc(doc(db, "homeworks", HOMEWORK_ID));
    const data = snapshot.data();
    assert(data?.title === "Написать новое сочинение", "homework title mismatch");
    assert(data?.dueDate === "2026-08-23", "homework due date mismatch");
    return "Написать новое сочинение; dueDate 2026-08-23";
  });
  await runCheck(report, "student", "mock exam", async () => {
    const snapshot = await getDoc(doc(db, "mockExams", MOCK_EXAM_ID));
    const data = snapshot.data();
    assert(data?.total?.earned === 20 && data?.total?.max === 37, "mock total mismatch");
    return "mock exam 20/37 visible";
  });
}

async function runStudentForbiddenWrites(report: SmokeReport, db: Firestore): Promise<void> {
  const [studentProgram, lesson, mockExam, submission] = await Promise.all([
    getDoc(doc(db, "studentPrograms", STUDENT_PROGRAM_ID)),
    getDoc(doc(db, "lessons", LESSON_ID)),
    getDoc(doc(db, "mockExams", MOCK_EXAM_ID)),
    getDoc(doc(db, "homeworkSubmissions", SUBMISSION_ID)),
  ]);
  assert(studentProgram.exists() && lesson.exists() && mockExam.exists() && submission.exists(), "write fixtures missing");

  await runCheck(report, "student", "goal write denied", async () => {
    await expectPermissionDenied(() =>
      updateDoc(studentProgram.ref, { goal: studentProgram.data().goal }),
    );
    return "same-value goal update returned Permission Denied";
  });
  await runCheck(report, "student", "mockExam write denied", async () => {
    await expectPermissionDenied(() => updateDoc(mockExam.ref, { grade: mockExam.data().grade }));
    return "same-value mockExam update returned Permission Denied";
  });
  await runCheck(report, "student", "paymentStatus write denied", async () => {
    await expectPermissionDenied(() =>
      updateDoc(lesson.ref, { paymentStatus: lesson.data().paymentStatus }),
    );
    return "same-value paymentStatus update returned Permission Denied";
  });
  await runCheck(report, "student", "teacherEvaluation write denied", async () => {
    await expectPermissionDenied(() =>
      updateDoc(submission.ref, { teacherEvaluation: submission.data().teacherEvaluation }),
    );
    return "same-value teacherEvaluation update returned Permission Denied";
  });
  await runCheck(report, "student", "XP event create denied", async () => {
    await expectPermissionDenied(() =>
      setDoc(doc(db, "gamificationEvents", XP_SENTINEL_ID), {
        teacherId: TEACHER_UID,
        studentId: STUDENT_UID,
        studentProgramId: STUDENT_PROGRAM_ID,
        eventType: "production-smoke-forbidden",
        sourceType: "production-smoke",
        sourceId: XP_SENTINEL_ID,
        xpDelta: 1,
        createdAt: Timestamp.fromDate(new Date("2026-08-14T00:00:00.000Z")),
        schemaVersion: 1,
      }),
    );
    return "gamificationEvents create returned Permission Denied";
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

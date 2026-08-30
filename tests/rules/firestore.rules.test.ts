import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  type Firestore,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { completeLesson } from "../../src/lib/firebase/services/completeLesson.js";
import { materializeLessonSeries } from "../../src/lib/firebase/services/materializeLessonSeries.js";
import { FirestoreScheduledLessonMaterializer } from "../../src/lib/firebase/services/scheduledLessonMaterializer.js";
import {
  cancelLesson,
  cancelLessonSeries,
  hardDeleteLesson,
  rescheduleLesson,
} from "../../src/lib/firebase/services/scheduleOperations.js";
import {
  evaluateHomeworkSubmission,
  submitHomework,
} from "../../src/lib/firebase/services/homeworkWorkflow.js";
import {
  archiveMaterial,
  createMaterial,
  updateMaterial,
} from "../../src/lib/firebase/services/materialsWorkflow.js";
import { syncStudentAchievements } from "../../src/lib/firebase/services/gamificationWorkflow.js";
import { createHomework } from "../../src/lib/firebase/services/verticalSliceWrites.js";

const PROJECT_ID = "demo-kabinet-25";
const RULES_PATH = fileURLToPath(
  new URL("../../firebase/firestore.rules", import.meta.url),
);

const teacherAuth = {
  uid: "teacher-1",
  token: { email: "teacher@example.test" },
};
const otherTeacherAuth = {
  uid: "teacher-2",
  token: { email: "other-teacher@example.test" },
};
const studentAuth = {
  uid: "student-1",
  token: { email: "student@example.test" },
};
const otherStudentAuth = {
  uid: "student-2",
  token: { email: "other-student@example.test" },
};

let testEnvironment: RulesTestEnvironment;

function baseTimestamps() {
  return {
    createdAt: new Date("2026-08-14T00:00:00.000Z"),
    updatedAt: new Date("2026-08-14T00:00:00.000Z"),
    schemaVersion: 1,
  };
}

function studentDocument(teacherId: string, displayName: string) {
  return {
    teacherId,
    activeProgramId: teacherId === teacherAuth.uid ? "student-1-program" : "student-2-program",
    displayName,
    classGrade: 9,
    status: "active",
    defaultConference: {
      provider: "zoom",
      joinUrl: null,
      meetingId: null,
      passcode: null,
      chatUrl: null,
    },
    archivedAt: null,
    ...baseTimestamps(),
  };
}

function homeworkDocument(teacherId: string, studentId: string) {
  return {
    teacherId,
    studentId,
    studentProgramId: `${studentId}-program`,
    sourceLessonId: null,
    type: "written",
    title: "Вымышленное домашнее задание",
    description: null,
    examTaskNumbers: [],
    assignedAt: new Date("2026-08-14T00:00:00.000Z"),
    dueAt: null,
    status: "assigned",
    requiredAmount: null,
    ...baseTimestamps(),
  };
}

function submissionDocument(
  homeworkId: string,
  teacherId = teacherAuth.uid,
  studentId = "student-1",
) {
  return {
    teacherId,
    studentId,
    homeworkId,
    submissionNumber: 1,
    studentInput: {
      completed: true,
      selfReportedEarned: null,
      selfReportedMax: null,
      note: null,
      externalAttachmentUrls: [],
    },
    teacherEvaluation: null,
    status: "submitted",
    submittedAt: new Date("2026-08-14T00:00:00.000Z"),
    ...baseTimestamps(),
  };
}

function scheduledLessonDocument(startAt: Date, status = "planned") {
  return {
    teacherId: teacherAuth.uid,
    studentId: "student-1",
    studentProgramId: "student-1-program",
    lessonSeriesId: "series-1",
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
    originalStartAt: null,
    rescheduledFromLessonId: null,
    rescheduledToLessonId: null,
    status,
    topic: null,
    lessonSummary: {
      homeworkResultText: null,
      teacherComment: null,
      focusNotes: [],
    },
    paymentStatus: "unpaid",
    ...baseTimestamps(),
  };
}

async function seedFixture() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", teacherAuth.uid), {
        role: "teacher",
        teacherId: null,
        studentId: null,
        preferences: { theme: "light" },
        timezone: { iana: "Asia/Novosibirsk", moscowOffsetMinutes: 240 },
        ...baseTimestamps(),
      }),
      setDoc(doc(db, "users", otherTeacherAuth.uid), {
        role: "teacher",
        teacherId: null,
        studentId: null,
        preferences: { theme: "light" },
        timezone: { iana: "Europe/Moscow", moscowOffsetMinutes: 180 },
        ...baseTimestamps(),
      }),
      setDoc(doc(db, "users", studentAuth.uid), {
        role: "student",
        teacherId: teacherAuth.uid,
        studentId: "student-1",
        preferences: { theme: "light" },
        timezone: { iana: "Europe/Moscow", moscowOffsetMinutes: 180 },
        ...baseTimestamps(),
      }),
      setDoc(doc(db, "users", otherStudentAuth.uid), {
        role: "student",
        teacherId: otherTeacherAuth.uid,
        studentId: "student-2",
        preferences: { theme: "light" },
        timezone: { iana: "Europe/Moscow", moscowOffsetMinutes: 180 },
        ...baseTimestamps(),
      }),
      setDoc(
        doc(db, "students", "student-1"),
        studentDocument(teacherAuth.uid, "Тестовый ученик"),
      ),
      setDoc(
        doc(db, "students", "student-2"),
        studentDocument(otherTeacherAuth.uid, "Другой тестовый ученик"),
      ),
      setDoc(
        doc(db, "homeworks", "homework-1"),
        homeworkDocument(teacherAuth.uid, "student-1"),
      ),
      setDoc(
        doc(db, "homeworks", "homework-2"),
        homeworkDocument(otherTeacherAuth.uid, "student-2"),
      ),
      setDoc(doc(db, "materials", "material-1"), {
        teacherId: teacherAuth.uid,
        title: "Публичный для учеников материал",
        allowedStudentIds: ["student-1"],
        ...baseTimestamps(),
      }),
      setDoc(doc(db, "programProfiles", "program-1"), {
        title: "Тестовая программа",
        status: "active",
        examBlueprintId: "blueprint-1",
        currentBlueprintId: "blueprint-1",
        ...baseTimestamps(),
      }),
      setDoc(doc(db, "programProfiles", "program-other"), {
        title: "Чужая программа",
        status: "active",
        examBlueprintId: "blueprint-other",
        currentBlueprintId: "blueprint-other",
        ...baseTimestamps(),
      }),
      setDoc(doc(db, "examBlueprints", "blueprint-1"), {
        examKind: "ege", sourceStatus: "project", primaryMaxScore: 50,
        writingCriteria: { byTask: [{ taskNumber: 27, criteria: [{ code: "К1", max: 1 }] }] },
        ...baseTimestamps(),
      }),
      setDoc(doc(db, "examBlueprints", "blueprint-other"), {
        examKind: "oge", sourceStatus: "project", primaryMaxScore: 38,
        ...baseTimestamps(),
      }),
      setDoc(doc(db, "studentPrograms", "student-1-program"), {
        teacherId: teacherAuth.uid,
        studentId: "student-1",
        programProfileId: "program-1",
        status: "active",
        goal: { displayText: "Тестовая цель" },
        ...baseTimestamps(),
      }),
      setDoc(doc(db, "lessonSeries", "series-1"), {
        teacherId: teacherAuth.uid,
        studentId: "student-1",
        studentProgramId: "student-1-program",
        frequency: "weekly",
        weekdays: [4],
        interval: 1,
        startLocalTime: "10:00",
        durationMinutes: 60,
        baseTimezone: "Europe/Moscow",
        active: true,
        startsOn: "2026-08-13",
        endsOn: null,
        cancelledAt: null,
        cancelledBy: null,
        ...baseTimestamps(),
      }),
      setDoc(doc(db, "lessons", "lesson-1"), {
        teacherId: teacherAuth.uid,
        studentId: "student-1",
        status: "planned",
        startAt: new Date("2099-08-15T10:00:00.000Z"),
        ...baseTimestamps(),
      }),
      setDoc(doc(db, "mockExams", "mock-1"), {
        teacherId: teacherAuth.uid,
        studentId: "student-1",
        studentProgramId: "student-1-program",
        title: "Тестовый пробник",
        total: { earned: 20, max: 37 },
        grade: 3,
        ...baseTimestamps(),
      }),
    ]);
  });
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: await readFile(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

describe("homework workflow", () => {
  test("supports submission, revision, retry and a checked result without conflating completion and score", async () => {
    await seedFixture();
    const studentDb = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore() as unknown as Firestore;
    const teacherDb = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore() as unknown as Firestore;

    const first = await submitHomework(studentDb, {
      homeworkId: "homework-1",
      teacherId: teacherAuth.uid,
      studentId: studentAuth.uid,
      submissionNumber: 1,
      studentInput: {
        completed: true,
        selfReportedEarned: null,
        selfReportedMax: null,
        note: "Первая попытка",
        externalAttachmentUrls: [],
      },
    });
    expect(first.status).toBe("applied");
    expect((await getDoc(doc(studentDb, "homeworks", "homework-1"))).data()?.status).toBe(
      "submitted",
    );

    await evaluateHomeworkSubmission(teacherDb, {
      homeworkId: "homework-1",
      submissionId: first.submissionId,
      teacherId: teacherAuth.uid,
      decision: "needs_revision",
      scoreEarned: 4,
      scoreMax: 7,
      criteria: [],
      comment: "Исправить второй пример",
    });
    expect(
      (await getDoc(doc(studentDb, "homeworkSubmissions", first.submissionId))).data()
        ?.teacherEvaluation.scoreEarned,
    ).toBe(4);
    expect((await getDoc(doc(studentDb, "homeworks", "homework-1"))).data()?.status).toBe(
      "needs_revision",
    );

    const second = await submitHomework(studentDb, {
      homeworkId: "homework-1",
      teacherId: teacherAuth.uid,
      studentId: studentAuth.uid,
      submissionNumber: 2,
      studentInput: {
        completed: true,
        selfReportedEarned: null,
        selfReportedMax: null,
        note: "Исправлено",
        externalAttachmentUrls: [],
      },
    });
    await evaluateHomeworkSubmission(teacherDb, {
      homeworkId: "homework-1",
      submissionId: second.submissionId,
      teacherId: teacherAuth.uid,
      decision: "checked",
      scoreEarned: 6,
      scoreMax: 7,
      criteria: [],
      comment: "Хорошая доработка",
    });
    expect((await getDoc(doc(studentDb, "homeworks", "homework-1"))).data()?.status).toBe(
      "checked",
    );
    const xpEvent = await getDoc(
      doc(studentDb, "gamificationEvents", "homework_completed__homework-1"),
    );
    expect(xpEvent.data()?.xpDelta).toBe(50);
    expect(xpEvent.data()?.sourceId).toBe("homework-1");
    expect((await getDoc(
      doc(studentDb, "studentAchievements", "student-1-program__first-step"),
    )).data()?.achievementDefinitionId).toBe("first-step");
    expect((await getDoc(
      doc(studentDb, "studentAchievements", "student-1-program__comeback"),
    )).data()?.achievementDefinitionId).toBe("comeback");
  });
});

afterEach(async () => {
  await testEnvironment.clearFirestore();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("anonymous access", () => {
  test("denies single-document reads and list queries", async () => {
    await seedFixture();
    const db = testEnvironment.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, "students", "student-1")));
    await assertFails(getDocs(collection(db, "students")));
  });
});

describe("backend-only AI transcription jobs", () => {
  test("denies document reads, list queries and writes to every browser role", async () => {
    await seedFixture();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "aiTranscriptionJobs", "job-1"), {
        teacherId: teacherAuth.uid,
        status: "pending",
        rawAudioStored: false,
        transcriptStored: false,
      });
    });

    const databases = [
      testEnvironment.unauthenticatedContext().firestore(),
      testEnvironment.authenticatedContext(teacherAuth.uid, teacherAuth.token).firestore(),
      testEnvironment.authenticatedContext(studentAuth.uid, studentAuth.token).firestore(),
    ];

    for (const db of databases) {
      await assertFails(getDoc(doc(db, "aiTranscriptionJobs", "job-1")));
      await assertFails(getDocs(collection(db, "aiTranscriptionJobs")));
      await assertFails(setDoc(doc(db, "aiTranscriptionJobs", "browser-write"), {
        teacherId: teacherAuth.uid,
        status: "pending",
      }));
    }
  });
});

describe("teacher access", () => {
  test("allows owned document reads and ownership-scoped list queries", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore();

    await assertSucceeds(getDoc(doc(db, "students", "student-1")));
    await assertSucceeds(
      getDocs(
        query(collection(db, "students"), where("teacherId", "==", teacherAuth.uid)),
      ),
    );
  });

  test("denies another teacher's document and an unscoped list", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore();

    await assertFails(getDoc(doc(db, "students", "student-2")));
    await assertFails(getDocs(collection(db, "students")));
  });

  test("allows only point reads of an owned student's timezone profile", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore();

    await assertSucceeds(getDoc(doc(db, "users", "student-1")));
    await assertFails(getDoc(doc(db, "users", "student-2")));
    await assertFails(getDocs(collection(db, "users")));
  });

  test("allows a teacher to update only the owned student's timezone", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore();

    await assertSucceeds(updateDoc(doc(db, "users", "student-1"), {
      timezone: { iana: "Asia/Novosibirsk", moscowOffsetMinutes: 420 },
      updatedAt: Timestamp.now(),
    }));
    await assertFails(updateDoc(doc(db, "users", "student-1"), {
      displayName: "Нельзя менять",
      updatedAt: Timestamp.now(),
    }));
    await assertFails(updateDoc(doc(db, "users", "student-2"), {
      timezone: { iana: "Asia/Omsk", moscowOffsetMinutes: 360 },
      updatedAt: Timestamp.now(),
    }));
  });

  test("allows cleanup deletion only for completed one-off teacher planner items", async () => {
    await seedFixture();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const base = {
        teacherId: teacherAuth.uid,
        itemType: "task",
        title: "Личная задача",
        category: "work",
        date: "2026-07-01",
        active: true,
        ...baseTimestamps(),
      };
      await Promise.all([
        setDoc(doc(db, "plannerItems", "cleanup-done"), { ...base, status: "done" }),
        setDoc(doc(db, "plannerItems", "cleanup-open"), { ...base, status: "todo" }),
        setDoc(doc(db, "plannerItems", "cleanup-recurring"), {
          ...base,
          status: "done",
          recurrenceSeriesId: "series-1",
        }),
      ]);
    });
    const teacherDb = testEnvironment.authenticatedContext(teacherAuth.uid, teacherAuth.token).firestore();
    const studentDb = testEnvironment.authenticatedContext(studentAuth.uid, studentAuth.token).firestore();
    await assertSucceeds(deleteDoc(doc(teacherDb, "plannerItems", "cleanup-done")));
    await assertFails(deleteDoc(doc(teacherDb, "plannerItems", "cleanup-open")));
    await assertFails(deleteDoc(doc(teacherDb, "plannerItems", "cleanup-recurring")));
    await assertFails(deleteDoc(doc(studentDb, "plannerItems", "cleanup-open")));
  });
});

describe("student access", () => {
  test("allows own document and student-scoped homework query", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();

    await assertSucceeds(getDoc(doc(db, "students", "student-1")));
    await assertSucceeds(
      getDocs(
        query(collection(db, "homeworks"), where("studentId", "==", "student-1")),
      ),
    );
  });

  test("denies another student's document and an unscoped homework list", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();

    await assertFails(getDoc(doc(db, "students", "student-2")));
    await assertFails(getDocs(collection(db, "homeworks")));
  });

  test("allows the bounded next-lesson query and denies another student's query", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();

    await assertSucceeds(
      getDocs(
        query(
          collection(db, "lessons"),
          where("studentId", "==", "student-1"),
          where("status", "==", "planned"),
          where("startAt", ">=", Timestamp.fromDate(new Date("2026-08-14T00:00:00.000Z"))),
          orderBy("startAt", "asc"),
          limit(1),
        ),
      ),
    );
    await assertFails(
      getDocs(
        query(
          collection(db, "lessons"),
          where("studentId", "==", "student-2"),
          where("status", "==", "planned"),
          where("startAt", ">=", Timestamp.fromDate(new Date("2026-08-14T00:00:00.000Z"))),
          orderBy("startAt", "asc"),
          limit(1),
        ),
      ),
    );
  });

  test("allows only a student's explicitly scoped material query", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();

    await assertFails(getDocs(collection(db, "materials")));
    await assertSucceeds(getDocs(query(collection(db, "materials"), where("allowedStudentIds", "array-contains", "student-1"))));
    const otherDb = testEnvironment.authenticatedContext(otherStudentAuth.uid, otherStudentAuth.token).firestore();
    await assertFails(getDoc(doc(otherDb, "materials", "material-1")));
  });

  test("denies student material writes", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();
    await assertFails(updateDoc(doc(db, "materials", "material-1"), { active: false }));
    await assertFails(setDoc(doc(db, "materials", "student-material"), {
      teacherId: teacherAuth.uid,
      title: "Запрещённый материал",
    }));
  });

  test("denies changes to goal, payment, grades, homework and XP", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();

    await assertFails(
      updateDoc(doc(db, "studentPrograms", "student-1-program"), {
        goal: { displayText: "Изменённая цель" },
      }),
    );
    await assertFails(
      updateDoc(doc(db, "lessons", "lesson-1"), { paymentStatus: "paid" }),
    );
    await assertFails(updateDoc(doc(db, "mockExams", "mock-1"), { grade: 5 }));
    await assertFails(updateDoc(doc(db, "homeworks", "homework-1"), { status: "checked" }));
    await assertFails(
      setDoc(doc(db, "gamificationEvents", "forbidden-xp"), {
        teacherId: teacherAuth.uid,
        studentId: "student-1",
        studentProgramId: "student-1-program",
        eventType: "manual",
        sourceType: "manual",
        sourceId: "forbidden",
        xpDelta: 1000,
        createdAt: new Date("2026-08-14T00:00:00.000Z"),
        schemaVersion: 1,
      }),
    );
  });
});

describe("materials workflow", () => {
  test("allows teacher create, edit and idempotent archive without delete", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore() as unknown as Firestore;
    const input = {
      title: "  Пунктуация  ",
      type: "link" as const,
      externalUrl: "https://example.com/punctuation",
      programProfileIds: ["program-1"],
      examTaskNumbers: [5, 3, 3],
      tags: [" Полезное ", "полезное"],
    };
    const id = await createMaterial(db, teacherAuth.uid, input);
    expect((await getDoc(doc(db, "materials", id))).data()).toMatchObject({
      title: "Пунктуация",
      examTaskNumbers: [3, 5],
      tags: ["полезное"],
      storagePath: null,
      active: true,
    });
    await updateMaterial(db, teacherAuth.uid, id, { ...input, title: "Сложное предложение" });
    expect((await getDoc(doc(db, "materials", id))).data()?.title).toBe("Сложное предложение");
    await expect(archiveMaterial(db, teacherAuth.uid, id)).resolves.toBe("applied");
    await expect(archiveMaterial(db, teacherAuth.uid, id)).resolves.toBe("noop");
  });
});

describe("gamification workflow", () => {
  test("teacher persists derived achievements with deterministic IDs and no duplicates", async () => {
    await seedFixture();
    const teacherDb = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore() as unknown as Firestore;
    const studentDb = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();
    const input = {
      teacherId: teacherAuth.uid,
      studentId: studentAuth.uid,
      studentProgramId: "student-1-program",
      achievementCodes: ["momentum", "task-master-5"],
    };
    await expect(syncStudentAchievements(teacherDb, input)).resolves.toEqual({
      created: ["momentum", "task-master-5"],
    });
    await expect(syncStudentAchievements(teacherDb, input)).resolves.toEqual({ created: [] });
    await assertSucceeds(getDoc(doc(studentDb, "studentAchievements", "student-1-program__momentum")));
    expect((await getDoc(doc(studentDb, "achievementDefinitions", "task-master-5"))).data()?.title).toBe("Мастер №5");
  });
});

describe("user preferences", () => {
  test("allows a user to update theme but not role", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();
    const userReference = doc(db, "users", studentAuth.uid);

    await assertSucceeds(
      updateDoc(userReference, {
        preferences: { theme: "dark" },
        updatedAt: new Date("2026-08-14T01:00:00.000Z"),
      }),
    );
    await assertFails(updateDoc(userReference, { role: "teacher" }));
  });
});

describe("Phase 2 vertical slice access", () => {
  test("teacher can create owned homework and mock exam", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(db, "homeworks", "teacher-created-homework"),
        homeworkDocument(teacherAuth.uid, "student-1"),
      ),
    );
    await assertSucceeds(
      setDoc(doc(db, "mockExams", "teacher-created-mock"), {
        teacherId: teacherAuth.uid,
        studentId: "student-1",
        studentProgramId: "student-1-program",
        title: "Новый пробник",
        ...baseTimestamps(),
      }),
    );
    await assertFails(
      setDoc(doc(db, "homeworks", "invalid-program-homework"), {
        ...homeworkDocument(teacherAuth.uid, "student-1"),
        studentProgramId: "missing-program",
      }),
    );
  });

  test("student can query own vertical data but cannot create teacher data", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();

    await assertSucceeds(
      getDocs(
        query(
          collection(db, "studentPrograms"),
          where("studentId", "==", "student-1"),
        ),
      ),
    );
    await assertSucceeds(
      getDocs(
        query(collection(db, "lessons"), where("studentId", "==", "student-1")),
      ),
    );
    await assertSucceeds(
      getDocs(
        query(collection(db, "mockExams"), where("studentId", "==", "student-1")),
      ),
    );
    await assertSucceeds(getDoc(doc(db, "programProfiles", "program-1")));
    await assertFails(
      setDoc(
        doc(db, "homeworks", "student-created-homework"),
        homeworkDocument(teacherAuth.uid, "student-1"),
      ),
    );
    await assertFails(
      setDoc(doc(db, "mockExams", "student-created-mock"), {
        teacherId: teacherAuth.uid,
        studentId: "student-1",
        studentProgramId: "student-1-program",
        title: "Запрещённый пробник",
        ...baseTimestamps(),
      }),
    );
  });

  test("teacher can edit the student's managed pilot fields", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore();

    await assertSucceeds(
      updateDoc(doc(db, "studentPrograms", "student-1-program"), {
        goal: { displayText: "ОГЭ на 4" },
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, "lessons", "lesson-1"), { paymentStatus: "paid" }),
    );
    await assertSucceeds(updateDoc(doc(db, "mockExams", "mock-1"), { grade: 4 }));
    await assertSucceeds(updateDoc(doc(db, "homeworks", "homework-1"), { status: "checked" }));
  });
});

describe("homework submission integrity", () => {
  test("allows a student to create and update a submission for their homework", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();
    const submissionReference = doc(db, "homeworkSubmissions", "submission-1");

    await assertSucceeds(
      setDoc(submissionReference, submissionDocument("homework-1")),
    );
    await assertSucceeds(
      updateDoc(submissionReference, {
        studentInput: {
          completed: true,
          selfReportedEarned: 4,
          selfReportedMax: 7,
          note: "Готово",
          externalAttachmentUrls: [],
        },
        updatedAt: new Date("2026-08-14T01:00:00.000Z"),
        status: "submitted",
      }),
    );
  });

  test("denies create when the homework is missing", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();

    await assertFails(
      setDoc(
        doc(db, "homeworkSubmissions", "submission-missing"),
        submissionDocument("missing-homework"),
      ),
    );
  });

  test("denies create when homework studentId or teacherId does not match", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();

    await assertFails(
      setDoc(
        doc(db, "homeworkSubmissions", "submission-other-homework"),
        submissionDocument("homework-2"),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, "homeworkSubmissions", "submission-wrong-teacher"),
        submissionDocument("homework-1", otherTeacherAuth.uid),
      ),
    );
  });

  test("denies changing homeworkId during a student update", async () => {
    await seedFixture();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "homeworkSubmissions", "submission-1"),
        submissionDocument("homework-1"),
      );
    });
    const db = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();

    await assertFails(
      updateDoc(doc(db, "homeworkSubmissions", "submission-1"), {
        homeworkId: "homework-2",
        updatedAt: new Date("2026-08-14T01:00:00.000Z"),
      }),
    );
  });
});

describe("idempotent domain operations", () => {
  test("materializes a deterministic lesson once and never overwrites it", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore() as unknown as Firestore;
    const occurrences = [
      new Date("2026-08-20T07:00:00.000Z"),
      new Date("2026-08-27T07:00:00.000Z"),
      new Date("2026-09-03T07:00:00.000Z"),
    ].map((start) => ({
      startAt: Timestamp.fromDate(start),
      endAt: Timestamp.fromMillis(start.getTime() + 60 * 60 * 1000),
    }));
    const input = {
      seriesId: "series-1",
      teacherId: teacherAuth.uid,
      studentId: "student-1",
      studentProgramId: "student-1-program",
      occurrences,
    };

    const firstResult = await materializeLessonSeries(db, input);
    const secondResult = await materializeLessonSeries(db, input);
    expect(firstResult.createdIds).toHaveLength(3);
    expect(secondResult.skippedIds).toEqual(firstResult.createdIds);

    const protectedStatuses = ["cancelled_student", "rescheduled", "completed"];
    await Promise.all(
      firstResult.createdIds.map((id, index) =>
        updateDoc(doc(db, "lessons", id), { status: protectedStatuses[index] }),
      ),
    );
    await materializeLessonSeries(db, input);
    const statuses = await Promise.all(
      firstResult.createdIds.map(async (id) => (await getDoc(doc(db, "lessons", id))).data()?.status),
    );
    expect(statuses).toEqual(protectedStatuses);
  });

  test("scheduled materializer is idempotent and records its health horizon", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore() as unknown as Firestore;
      await setDoc(doc(db, "lessonSeries", "scheduled-series"), {
        teacherId: teacherAuth.uid,
        studentId: "student-1",
        studentProgramId: "student-1-program",
        frequency: "weekly",
        weekdays: [4],
        interval: 1,
        startLocalTime: "10:00",
        durationMinutes: 60,
        baseTimezone: "Europe/Moscow",
        active: true,
        startsOn: "2026-08-13",
        endsOn: null,
        cancelledAt: null,
        cancelledBy: null,
        ...baseTimestamps(),
      });
      const materializer = new FirestoreScheduledLessonMaterializer(db);
      const first = await materializer.run(new Date("2026-08-14T00:00:00.000Z"));
      const second = await materializer.run(new Date("2026-08-14T00:00:00.000Z"));
      expect(first.series[0]).toMatchObject({ created: 12, skipped: 0, suppressed: 0 });
      expect(second.series[0]).toMatchObject({ created: 0, skipped: 12, suppressed: 0 });
      expect((await getDoc(doc(db, "lessonSeries", "scheduled-series"))).data()?.materializedThrough).toBeTruthy();
    });
  });

  test("reschedules atomically, retries as no-op and rejects a second destination", async () => {
    await seedFixture();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "lessons", "reschedule-source"),
        scheduledLessonDocument(new Date("2026-08-20T07:00:00.000Z")),
      );
    });
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore() as unknown as Firestore;
    const first = await rescheduleLesson(db, {
      lessonId: "reschedule-source",
      newStartAt: Timestamp.fromDate(new Date("2026-08-21T07:00:00.000Z")),
      newEndAt: Timestamp.fromDate(new Date("2026-08-21T08:00:00.000Z")),
    });
    const retry = await rescheduleLesson(db, {
      lessonId: "reschedule-source",
      newStartAt: Timestamp.fromDate(new Date("2026-08-21T07:00:00.000Z")),
      newEndAt: Timestamp.fromDate(new Date("2026-08-21T08:00:00.000Z")),
    });
    expect(first.status).toBe("applied");
    expect(retry.status).toBe("noop");
    expect((await getDoc(doc(db, "lessons", "reschedule-source"))).data()?.status).toBe(
      "rescheduled",
    );
    expect((await getDoc(doc(db, "lessons", first.newLessonId))).data()?.rescheduledFromLessonId).toBe(
      "reschedule-source",
    );
    await expect(
      rescheduleLesson(db, {
        lessonId: "reschedule-source",
        newStartAt: Timestamp.fromDate(new Date("2026-08-22T07:00:00.000Z")),
        newEndAt: Timestamp.fromDate(new Date("2026-08-22T08:00:00.000Z")),
      }),
    ).rejects.toThrow("already rescheduled");
  });

  test("cancels one lesson idempotently and preserves the active series", async () => {
    await seedFixture();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "lessons", "cancel-one"),
        scheduledLessonDocument(new Date("2026-08-20T07:00:00.000Z")),
      );
    });
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore() as unknown as Firestore;
    expect((await cancelLesson(db, "cancel-one", "student")).status).toBe("applied");
    expect((await cancelLesson(db, "cancel-one", "student")).status).toBe("noop");
    expect((await getDoc(doc(db, "lessons", "cancel-one"))).data()?.status).toBe(
      "cancelled_student",
    );
    expect((await getDoc(doc(db, "lessons", "cancel-one"))).exists()).toBe(true);
    expect((await getDoc(doc(db, "lessonSeries", "series-1"))).data()?.active).toBe(true);
  });

  test("hard-deletes one recurring occurrence and materialization keeps it suppressed", async () => {
    await seedFixture();
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore() as unknown as Firestore;
    const occurrence = {
      startAt: Timestamp.fromDate(new Date("2026-09-10T07:00:00.000Z")),
      endAt: Timestamp.fromDate(new Date("2026-09-10T08:00:00.000Z")),
    };
    const input = {
      seriesId: "series-1",
      teacherId: teacherAuth.uid,
      studentId: "student-1",
      studentProgramId: "student-1-program",
      occurrences: [occurrence],
    };
    const materialized = await materializeLessonSeries(db, input);
    const lessonId = materialized.createdIds[0]!;
    const removed = await hardDeleteLesson(db, { lessonId, teacherId: teacherAuth.uid });
    expect(removed).toEqual({ status: "applied", suppressedOccurrence: true });
    expect((await getDoc(doc(db, "lessons", lessonId))).exists()).toBe(false);
    expect((await getDoc(doc(db, "lessonOccurrenceExclusions", lessonId))).data()).toMatchObject({
      teacherId: teacherAuth.uid,
      lessonSeriesId: "series-1",
      reason: "hard_deleted",
    });
    await expect(hardDeleteLesson(db, { lessonId, teacherId: teacherAuth.uid })).resolves.toEqual({
      status: "noop",
      suppressedOccurrence: true,
    });
    const retryMaterialization = await materializeLessonSeries(db, input);
    expect(retryMaterialization.suppressedIds).toEqual([lessonId]);
    expect((await getDoc(doc(db, "lessons", lessonId))).exists()).toBe(false);
  });

  test("hard delete removes payment references and students cannot invoke it", async () => {
    await seedFixture();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, "lessons", "accidental-manual"), {
          ...scheduledLessonDocument(new Date("2026-09-12T07:00:00.000Z")),
          lessonSeriesId: null,
          billingIdentityId: "accidental-manual",
          paymentStatus: "paid",
        }),
        setDoc(doc(db, "lessons", "next-valid"), {
          ...scheduledLessonDocument(new Date("2026-09-19T07:00:00.000Z")),
          lessonSeriesId: null,
          billingIdentityId: "next-valid",
        }),
        setDoc(doc(db, "studentPaymentAccounts", "student-1"), {
          teacherId: teacherAuth.uid,
          studentId: "student-1",
          purchasedLessonCredits: 1,
          reconciledFromLegacyPaidCount: 0,
          lastAllocationLessonIds: ["accidental-manual"],
          manualPaidBillingIds: ["accidental-manual"],
          ...baseTimestamps(),
        }),
      ]);
    });
    const studentDb = testEnvironment
      .authenticatedContext(studentAuth.uid, studentAuth.token)
      .firestore();
    await assertFails(deleteDoc(doc(studentDb, "lessons", "accidental-manual")));
    const teacherDb = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore() as unknown as Firestore;
    await hardDeleteLesson(teacherDb, {
      lessonId: "accidental-manual",
      teacherId: teacherAuth.uid,
    });
    const account = (await getDoc(doc(teacherDb, "studentPaymentAccounts", "student-1"))).data();
    expect(account?.manualPaidBillingIds).toEqual([]);
    expect(account?.lastAllocationLessonIds).toEqual(["next-valid"]);
    expect((await getDoc(doc(teacherDb, "lessons", "next-valid"))).data()?.paymentStatus).toBe("paid");
  });

  test("cancels the series and only future planned lessons", async () => {
    await seedFixture();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(
          doc(db, "lessons", "series-future-planned"),
          scheduledLessonDocument(new Date("2026-08-20T07:00:00.000Z")),
        ),
        setDoc(
          doc(db, "lessons", "series-future-completed"),
          scheduledLessonDocument(new Date("2026-08-27T07:00:00.000Z"), "completed"),
        ),
        setDoc(
          doc(db, "lessons", "series-past"),
          scheduledLessonDocument(new Date("2026-08-01T07:00:00.000Z")),
        ),
      ]);
    });
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore() as unknown as Firestore;
    const first = await cancelLessonSeries(db, {
      seriesId: "series-1",
      teacherId: teacherAuth.uid,
      actor: "teacher",
      effectiveAt: Timestamp.fromDate(new Date("2026-08-14T00:00:00.000Z")),
    });
    const retry = await cancelLessonSeries(db, {
      seriesId: "series-1",
      teacherId: teacherAuth.uid,
      actor: "teacher",
      effectiveAt: Timestamp.fromDate(new Date("2026-08-14T00:00:00.000Z")),
    });
    expect(first.status).toBe("applied");
    expect(retry.status).toBe("noop");
    expect((await getDoc(doc(db, "lessonSeries", "series-1"))).data()?.active).toBe(false);
    expect((await getDoc(doc(db, "lessons", "series-future-planned"))).data()?.status).toBe(
      "cancelled_teacher",
    );
    expect((await getDoc(doc(db, "lessons", "series-future-completed"))).data()?.status).toBe(
      "completed",
    );
    expect((await getDoc(doc(db, "lessons", "series-past"))).data()?.status).toBe("planned");
  });

  test("completes a lesson atomically and returns a no-op on retry", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore() as unknown as Firestore;
      const lessonReference = doc(db, "lessons", "lesson-1");
      const startAt = Timestamp.fromDate(new Date("2026-08-20T07:00:00.000Z"));
      await setDoc(lessonReference, {
        teacherId: teacherAuth.uid,
        studentId: "student-1",
        studentProgramId: "student-1-program",
        lessonSeriesId: "series-1",
        startAt,
        endAt: Timestamp.fromDate(new Date("2026-08-20T08:00:00.000Z")),
        originalStartAt: null,
        rescheduledFromLessonId: null,
        rescheduledToLessonId: null,
        status: "planned",
        topic: null,
        lessonSummary: {
          homeworkResultText: null,
          teacherComment: null,
          focusNotes: [],
        },
        paymentStatus: "unpaid",
        ...baseTimestamps(),
      });

      const firstResult = await completeLesson(db, {
        lessonId: "lesson-1",
        teacherId: teacherAuth.uid,
        topic: "Тестовая тема",
        lessonSummary: {
          homeworkResultText: "Выполнено",
          teacherComment: null,
          focusNotes: ["Тестовый фокус"],
        },
        newHomework: {
          studentProgramId: "student-1-program",
          type: "written",
          title: "Новое тестовое ДЗ",
          description: null,
          examTaskNumbers: [],
          dueAt: null,
          requiredAmount: null,
        },
      });
      const retryResult = await completeLesson(db, {
        lessonId: "lesson-1",
        teacherId: teacherAuth.uid,
        topic: "Не должно перезаписаться",
        lessonSummary: {
          homeworkResultText: null,
          teacherComment: null,
          focusNotes: [],
        },
      });

      expect(firstResult.status).toBe("completed");
      expect(retryResult.status).toBe("already_completed");
      expect((await getDoc(lessonReference)).data()?.topic).toBe("Тестовая тема");
      expect((await getDocs(collection(db, "homeworks"))).size).toBe(1);
    });
  });

  test("links a post-lesson homework atomically and never creates a duplicate", async () => {
    await seedFixture();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "lessons", "completed-for-homework"), {
        ...scheduledLessonDocument(new Date("2026-08-20T07:00:00.000Z"), "completed"),
        homeworkResolution: "pending",
        examTaskNumbers: [2, 3],
        topic: "Связь урока и ДЗ",
      });
    });
    const db = testEnvironment
      .authenticatedContext(teacherAuth.uid, teacherAuth.token)
      .firestore() as unknown as Firestore;
    const input = {
      teacherId: teacherAuth.uid,
      studentId: "student-1",
      studentProgramId: "student-1-program",
      sourceLessonId: "completed-for-homework",
      type: "practice" as const,
      title: "Закрепить тему",
      description: "Фокус урока",
      dueAt: null,
      dueDate: "2026-08-23",
      dueTime: null,
      dueTimezone: "Europe/Moscow",
      examTaskNumbers: [2, 3],
    };
    const firstId = await createHomework(db, input);
    const retryId = await createHomework(db, { ...input, title: "Повторный клик" });
    expect(firstId).toBe("lesson-homework__completed-for-homework");
    expect(retryId).toBe(firstId);
    expect((await getDoc(doc(db, "homeworks", firstId))).data()?.sourceLessonId).toBe("completed-for-homework");
    expect((await getDoc(doc(db, "lessons", "completed-for-homework"))).data()?.homeworkResolution).toBe("assigned");
    const linked = await getDocs(query(
      collection(db, "homeworks"),
      where("teacherId", "==", teacherAuth.uid),
      where("sourceLessonId", "==", "completed-for-homework"),
    ));
    expect(linked.size).toBe(1);
  });

  test("lets a student acknowledge a reviewed submission without changing the evaluation", async () => {
    await seedFixture();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "homeworkSubmissions", "reviewed-submission"), {
        ...submissionDocument("homework-1"),
        status: "checked",
        reviewedUnread: true,
        reviewedOpenedAt: null,
        teacherEvaluation: { scoreEarned: 4, scoreMax: 7, comment: "Проверено" },
      });
    });
    const studentDb = testEnvironment.authenticatedContext(studentAuth.uid, studentAuth.token).firestore();
    await assertSucceeds(updateDoc(doc(studentDb, "homeworkSubmissions", "reviewed-submission"), {
      reviewedUnread: false,
      reviewedOpenedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }));
    await assertFails(updateDoc(doc(studentDb, "homeworkSubmissions", "reviewed-submission"), {
      reviewedUnread: false,
      reviewedOpenedAt: Timestamp.now(),
      teacherEvaluation: { scoreEarned: 7, scoreMax: 7, comment: "Подмена" },
      updatedAt: Timestamp.now(),
    }));
  });

  test("keeps material folders private to explicitly allowed students", async () => {
    await seedFixture();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "materialFolders", "student-folder"), {
        teacherId: teacherAuth.uid,
        title: "Папка ученика",
        allowedStudentIds: ["student-1"],
        ...baseTimestamps(),
      });
    });
    const studentDb = testEnvironment.authenticatedContext(studentAuth.uid, studentAuth.token).firestore();
    const otherStudentDb = testEnvironment.authenticatedContext(otherStudentAuth.uid, otherStudentAuth.token).firestore();
    await assertSucceeds(getDoc(doc(studentDb, "materialFolders", "student-folder")));
    await assertFails(getDoc(doc(otherStudentDb, "materialFolders", "student-folder")));
    await assertSucceeds(getDocs(query(collection(studentDb, "materialFolders"), where("allowedStudentIds", "array-contains", "student-1"))));
  });

  test("allows only the owning teacher to manage payment records", async () => {
    await seedFixture();
    const teacherDb = testEnvironment.authenticatedContext(teacherAuth.uid, teacherAuth.token).firestore();
    const studentDb = testEnvironment.authenticatedContext(studentAuth.uid, studentAuth.token).firestore();
    await assertSucceeds(getDoc(doc(teacherDb, "studentPaymentAccounts", "student-1")));
    await assertFails(getDoc(doc(studentDb, "studentPaymentAccounts", "student-1")));
    const paymentAccount = {
      teacherId: teacherAuth.uid,
      studentId: "student-1",
      purchasedLessonCredits: 4,
      reconciledFromLegacyPaidCount: 0,
      lastAllocationLessonIds: [],
      ...baseTimestamps(),
    };
    await assertSucceeds(setDoc(doc(teacherDb, "studentPaymentAccounts", "student-1"), paymentAccount));
    await assertSucceeds(getDoc(doc(teacherDb, "studentPaymentAccounts", "student-1")));
    await assertFails(getDoc(doc(studentDb, "studentPaymentAccounts", "student-1")));
    await assertFails(setDoc(doc(studentDb, "paymentCreditEvents", "forbidden"), {
      teacherId: teacherAuth.uid,
      studentId: "student-1",
      lessonCount: 10,
      ...baseTimestamps(),
    }));
  });

  test("isolates a demo tenant from the real teacher tenant", async () => {
    const demoTeacher = { uid: "teacher-demo-review-v1", token: { email: "demo.teacher@example.test" } };
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, "users", demoTeacher.uid), {
          role: "teacher",
          accountMode: "demo",
          teacherId: null,
          studentId: null,
          preferences: { theme: "light" },
          timezone: { iana: "Europe/Moscow", moscowOffsetMinutes: 180 },
          ...baseTimestamps(),
        }),
        setDoc(doc(db, "students", "student-demo-review-v1"),
          studentDocument(demoTeacher.uid, "Демо-ученик")),
        setDoc(doc(db, "homeworks", "demo-homework"),
          homeworkDocument(demoTeacher.uid, "student-demo-review-v1")),
      ]);
    });
    const demoDb = testEnvironment.authenticatedContext(demoTeacher.uid, demoTeacher.token).firestore();
    await assertSucceeds(getDoc(doc(demoDb, "students", "student-demo-review-v1")));
    await assertFails(getDoc(doc(demoDb, "students", "student-1")));
    const own = await assertSucceeds(getDocs(query(
      collection(demoDb, "homeworks"),
      where("teacherId", "==", demoTeacher.uid),
    )));
    expect(own.size).toBe(1);
    await assertFails(getDocs(query(
      collection(demoDb, "homeworks"),
      where("teacherId", "==", teacherAuth.uid),
    )));
  });

  test("lets a student read only the active program blueprint and never change criteria", async () => {
    await seedFixture();
    const studentDb = testEnvironment.authenticatedContext(studentAuth.uid, studentAuth.token).firestore();
    await assertSucceeds(getDoc(doc(studentDb, "programProfiles", "program-1")));
    await assertSucceeds(getDoc(doc(studentDb, "examBlueprints", "blueprint-1")));
    await assertFails(getDoc(doc(studentDb, "programProfiles", "program-other")));
    await assertFails(getDoc(doc(studentDb, "examBlueprints", "blueprint-other")));
    await assertFails(updateDoc(doc(studentDb, "examBlueprints", "blueprint-1"), {
      primaryMaxScore: 1,
      updatedAt: Timestamp.now(),
    }));
  });
});

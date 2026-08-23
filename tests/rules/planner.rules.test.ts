import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, Timestamp, where, type Firestore } from "firebase/firestore";
import { createPlannerGoal, createPlannerItem, createPlannerSubgoal, plannerGoalProgress, schedulePlannerItem, setPlannerItemCompleted } from "../../src/lib/firebase/services/plannerWorkflow.js";
import { getTeacherResourceSummary } from "../../src/lib/firebase/services/resourceMonitoring.js";

let environment: RulesTestEnvironment;
beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-kabinet-planner",
    firestore: { rules: readFileSync(fileURLToPath(new URL("../../firebase/firestore.rules", import.meta.url)), "utf8") },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", "teacher-planner"), { role: "teacher" });
    await setDoc(doc(context.firestore(), "users", "student-planner-auth"), { role: "student", teacherId: "teacher-planner", studentId: "student-planner" });
    await setDoc(doc(context.firestore(), "students", "student-planner"), { teacherId: "teacher-planner", displayName: "Ученик" });
  });
});
afterAll(async () => environment.cleanup());

describe("teacher planner rules and workflow", () => {
  test("teacher creates, schedules and completes a private item", async () => {
    const db = environment.authenticatedContext("teacher-planner").firestore() as unknown as Firestore;
    const id = await createPlannerItem(db, "teacher-planner", {
      itemType: "task", title: "Подготовить урок", category: "work", date: "2026-08-21", startTime: null,
      endTime: null, durationMinutes: null, deadline: null, notes: null, goalId: null, subgoalId: null,
      priority: "medium",
    });
    await assertSucceeds(schedulePlannerItem(db, "teacher-planner", id, "2026-08-22", "11:00"));
    expect((await getDoc(doc(db, "plannerItems", id))).data()).toMatchObject({ date: "2026-08-22", startTime: "11:00" });
    await assertSucceeds(setPlannerItemCompleted(db, "teacher-planner", id, true));
    expect((await getDoc(doc(db, "plannerItems", id))).data()?.status).toBe("done");
  });

  test("student and anonymous cannot read, list or write planner data", async () => {
    const studentDb = environment.authenticatedContext("student-planner-auth").firestore();
    const anonymousDb = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(studentDb, "plannerItems", "missing")));
    await assertFails(getDocs(query(collection(studentDb, "plannerItems"), where("teacherId", "==", "teacher-planner"))));
    await assertFails(setDoc(doc(studentDb, "plannerItems", "attack"), { teacherId: "teacher-planner", title: "x" }));
    await assertFails(getDoc(doc(anonymousDb, "plannerGoals", "missing")));
  });

  test("goal progress is derived from subgoals and tasks", async () => {
    const db = environment.authenticatedContext("teacher-planner").firestore() as unknown as Firestore;
    const goalId = await createPlannerGoal(db, "teacher-planner", { title: "Запустить курс", description: null, targetDate: null });
    await createPlannerSubgoal(db, "teacher-planner", goalId, "Подготовить материалы");
    expect(plannerGoalProgress(goalId, [{ data: { teacherId: "teacher-planner", goalId, title: "Шаг", status: "completed", sortOrder: 1 } as never }], [])).toEqual({ completed: 1, total: 1, percent: 100 });
  });

  test("file metadata follows the same teacher/student ownership boundary", async () => {
    const teacherDb = environment.authenticatedContext("teacher-planner").firestore();
    const studentDb = environment.authenticatedContext("student-planner-auth").firestore();
    await assertSucceeds(setDoc(doc(teacherDb, "fileAssets", "teacher-file"), {
      teacherId: "teacher-planner", studentId: "student-planner", ownerType: "teacher", uploadedBy: "teacher-planner", purpose: "homework", allowedStudentIds: ["student-planner"], status: "active",
    }));
    await assertSucceeds(setDoc(doc(studentDb, "fileAssets", "student-file"), {
      teacherId: "teacher-planner", studentId: "student-planner", ownerType: "student", uploadedBy: "student-planner-auth", purpose: "submission", allowedStudentIds: [], status: "active",
    }));
    await assertFails(setDoc(doc(studentDb, "fileAssets", "teacher-impersonation"), {
      teacherId: "teacher-planner", studentId: "student-planner", ownerType: "teacher", uploadedBy: "student-planner-auth", purpose: "homework", allowedStudentIds: [], status: "active",
    }));
  });

  test("teacher can calculate a tenant-scoped resource summary", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "fileAssets", "monitoring-file"), {
        teacherId: "teacher-planner", studentId: "student-planner", ownerType: "teacher", uploadedBy: "teacher-planner",
        purpose: "homework", allowedStudentIds: ["student-planner"], status: "active", size: 2048,
        createdAt: Timestamp.fromDate(new Date("2026-08-10T00:00:00Z")),
      });
    });
    const db = environment.authenticatedContext("teacher-planner").firestore() as unknown as Firestore;
    const summary = await getTeacherResourceSummary(db, "teacher-planner", new Date("2026-08-21T00:00:00Z"));
    expect(summary).toMatchObject({ students: 1, activeFiles: 3, uploadsThisMonth: 1 });
    expect(summary.approximateStorageBytes).toBe(2048);
    expect(summary.trackedFirestoreDocuments).toBeGreaterThanOrEqual(4);
  });
});

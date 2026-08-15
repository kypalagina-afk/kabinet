import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, test } from "vitest";
import {
  desiredFieldsMatch,
  resolveSeedValue,
  validatePlan,
} from "../../tools/seed.js";

function validPlan() {
  return {
    schemaVersion: 1,
    projectId: "kabinet-25",
    authUsers: [
      {
        key: "teacher",
        uid: "teacher-pilot-v1",
        role: "teacher",
        username: { $runtime: "teacherUsername" },
        displayName: "Преподаватель",
      },
      {
        key: "student",
        uid: "student-pilot-v1",
        role: "student",
        username: "student.test",
        displayName: "Тестовый ученик",
      },
    ],
    writes: [
      {
        path: "users/teacher-pilot-v1",
        data: {
          username: { $runtime: "teacherUsername" },
          createdAt: { $timestamp: "2026-08-14T07:00:00.000Z" },
        },
      },
      {
        path: "users/student-pilot-v1",
        data: {
          username: "student.test",
          createdAt: { $timestamp: "2026-08-14T07:00:00.000Z" },
        },
      },
      {
        path: "students/student-pilot-v1",
        data: {
          teacherId: "teacher-pilot-v1",
          createdAt: { $timestamp: "2026-08-14T07:00:00.000Z" },
        },
      },
    ],
    todos: ["Тестовый TODO"],
  };
}

describe("production seed validation", () => {
  test("accepts deterministic Auth and Firestore targets without secrets", () => {
    const plan = validatePlan(validPlan());

    expect(plan.projectId).toBe("kabinet-25");
    expect(plan.authUsers.map(({ uid }) => uid)).toEqual([
      "teacher-pilot-v1",
      "student-pilot-v1",
    ]);
    expect(plan.writes).toHaveLength(3);
  });

  test("rejects passwords anywhere in a seed input", () => {
    const plan = validPlan();
    Object.assign(plan.writes[0]!.data, { password: "must-not-exist" });

    expect(() => validatePlan(plan)).toThrow(/Passwords must never be stored/);
  });

  test("rejects a non-production project and duplicate document paths", () => {
    expect(() => validatePlan({ ...validPlan(), projectId: "another-project" })).toThrow(
      /target kabinet-25/,
    );
    const duplicatePlan = validPlan();
    duplicatePlan.writes.push(structuredClone(duplicatePlan.writes[0]!));
    expect(() => validatePlan(duplicatePlan)).toThrow(/Duplicate seed path/);
  });

  test("resolves runtime username and UTC timestamps", () => {
    const resolved = resolveSeedValue(
      {
        username: { $runtime: "teacherUsername" },
        at: { $timestamp: "2026-08-14T07:00:00.000Z" },
      },
      { teacherUsername: "teacher.test" },
    ) as { username: string; at: Timestamp };

    expect(resolved.username).toBe("teacher.test");
    expect(resolved.at.toDate().toISOString()).toBe("2026-08-14T07:00:00.000Z");
  });

  test("classifies a repeated desired merge as a no-op", () => {
    const desired = {
      role: "student",
      updatedAt: Timestamp.fromDate(new Date("2026-08-14T07:00:00.000Z")),
    };
    const existing = { ...desired, unrelatedFutureField: true };

    expect(desiredFieldsMatch(existing, desired)).toBe(true);
    expect(desiredFieldsMatch({ ...existing, role: "teacher" }, desired)).toBe(false);
  });
});

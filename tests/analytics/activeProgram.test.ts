import { Timestamp } from "firebase/firestore";
import { describe, expect, test } from "vitest";
import { resolveActiveStudentProgram } from "../../src/lib/firebase/repositories/verticalSliceRepository.js";
import type { DocumentWithId, StudentProgram } from "../../src/lib/firebase/types.js";

const timestamp = Timestamp.fromMillis(1);
function program(id: string, status: StudentProgram["status"]): DocumentWithId<StudentProgram> {
  return { id, data: { teacherId: "t", studentId: "s", programProfileId: id,
    status, goal: { type: "custom", targetGrade: null, targetScore: null, displayText: "" },
    startedAt: timestamp, completedAt: null, createdAt: timestamp, updatedAt: timestamp, schemaVersion: 1 } };
}

describe("active program invariant", () => {
  test("uses the single active program and accepts its pointer", () => {
    const values = [program("old", "paused"), program("current", "active")];
    expect(resolveActiveStudentProgram(values)?.id).toBe("current");
    expect(resolveActiveStudentProgram(values, "current")?.id).toBe("current");
  });
  test("fails closed when two programs are active", () => {
    expect(() => resolveActiveStudentProgram([program("a", "active"), program("b", "active")])).toThrow("ambiguous");
  });
});

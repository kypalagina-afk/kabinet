import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, test } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";

const projectId = "demo-kabinet-25";
let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(fileURLToPath(new URL("../../firebase/firestore.rules", import.meta.url)), "utf8") },
    storage: { rules: readFileSync(fileURLToPath(new URL("../../firebase/storage.rules", import.meta.url)), "utf8") },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", "teacher-1"), { role: "teacher", teacherId: null, studentId: null });
    await setDoc(doc(db, "users", "teacher-2"), { role: "teacher", teacherId: null, studentId: null });
    await setDoc(doc(db, "users", "student-auth-1"), { role: "student", teacherId: "teacher-1", studentId: "student-1" });
    await setDoc(doc(db, "users", "student-auth-2"), { role: "student", teacherId: "teacher-2", studentId: "student-2" });
    await setDoc(doc(db, "fileAssets", "submission-asset"), { teacherId: "teacher-1", studentId: "student-1", allowedStudentIds: [], purpose: "submission" });
    await setDoc(doc(db, "fileAssets", "material-asset"), { teacherId: "teacher-1", studentId: null, allowedStudentIds: ["student-1"], purpose: "material" });
    await setDoc(doc(db, "materials", "material-1"), { teacherId: "teacher-1", allowedStudentIds: ["student-1"] });
  });
});

afterAll(async () => environment.cleanup());

describe("Storage Rules", () => {
  test("teacher uploads homework and materials while student uploads only own submissions", async () => {
    const teacher = environment.authenticatedContext("teacher-1").storage();
    const student = environment.authenticatedContext("student-auth-1").storage();
    await assertSucceeds(uploadBytes(ref(teacher, "teachers/teacher-1/homework/student-1/draft/homework-asset/task.pdf"), new Blob(["pdf"], { type: "application/pdf" })));
    await assertSucceeds(uploadBytes(ref(teacher, "teachers/teacher-1/materials/material-1/material-asset/page.webp"), new Blob(["image"], { type: "image/webp" })));
    await assertSucceeds(uploadBytes(ref(student, "students/student-1/submissions/homework-1/submission-asset/work.docx"), new Blob(["doc"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })));
  });

  test("allows intended reads and controlled deletion", async () => {
    const teacher = environment.authenticatedContext("teacher-1").storage();
    const student = environment.authenticatedContext("student-auth-1").storage();
    const submissionPath = "students/student-1/submissions/homework-1/submission-asset/work.txt";
    const materialPath = "teachers/teacher-1/materials/material-1/material-asset/page.png";
    await uploadBytes(ref(student, submissionPath), new Blob(["work"], { type: "text/plain" }));
    await uploadBytes(ref(teacher, materialPath), new Blob(["image"], { type: "image/png" }));
    await assertSucceeds(getBytes(ref(teacher, submissionPath)));
    await assertSucceeds(getBytes(ref(student, materialPath)));
    await assertSucceeds(deleteObject(ref(student, submissionPath)));
    await assertSucceeds(deleteObject(ref(teacher, materialPath)));
  });

  test("denies anonymous, another student and unsafe formats", async () => {
    const ownPath = "students/student-1/submissions/homework-1/unsafe/audio.mp3";
    await assertFails(uploadBytes(ref(environment.unauthenticatedContext().storage(), ownPath), new Blob(["x"], { type: "text/plain" })));
    await assertFails(uploadBytes(ref(environment.authenticatedContext("student-auth-2").storage(), ownPath), new Blob(["x"], { type: "text/plain" })));
    await assertFails(uploadBytes(ref(environment.authenticatedContext("student-auth-1").storage(), ownPath), new Blob(["x"], { type: "audio/mpeg" })));
    await assertFails(uploadBytes(ref(environment.authenticatedContext("student-auth-1").storage(), "students/student-1/submissions/homework-1/unsafe/video.mp4"), new Blob(["x"], { type: "video/mp4" })));
    await assertFails(uploadBytes(ref(environment.authenticatedContext("teacher-1").storage(), "teachers/teacher-1/materials/m/unsafe/run.exe"), new Blob(["x"], { type: "application/x-msdownload" })));
  });

  test("denies an oversized file", async () => {
    await assertFails(uploadBytes(ref(environment.authenticatedContext("teacher-1").storage(), "teachers/teacher-1/materials/m/large/large.pdf"), new Blob([new Uint8Array(15 * 1024 * 1024 + 1)], { type: "application/pdf" })));
  });

  test("does not expose personal files to unrelated users", async () => {
    await assertFails(getBytes(ref(environment.authenticatedContext("student-auth-2").storage(), "teachers/teacher-1/materials/material-1/material-asset/page.webp")));
    await assertFails(getBytes(ref(environment.authenticatedContext("teacher-2").storage(), "students/student-1/submissions/homework-1/submission-asset/work.docx")));
  });
});

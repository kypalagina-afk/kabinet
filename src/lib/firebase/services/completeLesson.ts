import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Timestamp,
} from "firebase/firestore";
import type { Homework, HomeworkItem, HomeworkStatus, Lesson } from "../types.js";

export interface NewHomeworkInput {
  studentProgramId: string;
  type: Homework["type"];
  title: string;
  description: string | null;
  examTaskNumbers: number[];
  dueAt: Timestamp | null;
  requiredAmount: number | null;
  items?: HomeworkItem[];
}

export interface CompleteLessonInput {
  lessonId: string;
  teacherId: string;
  topic: string;
  lessonSummary: Lesson["lessonSummary"];
  understanding?: NonNullable<Lesson["understanding"]>;
  examTaskNumbers?: number[];
  privateTeacherNote?: string | null;
  previousHomework?: {
    id: string;
    status: Extract<HomeworkStatus, "checked" | "completed">;
  };
  newHomework?: NewHomeworkInput;
}

export interface CompleteLessonResult {
  status: "completed" | "already_completed";
  homeworkId: string | null;
}

export function homeworkIdForCompletedLesson(lessonId: string): string {
  if (lessonId.includes("/")) {
    throw new Error("A Firestore lesson document ID cannot contain a slash");
  }

  return `lesson-homework__${lessonId}`;
}

export async function completeLesson(
  db: Firestore,
  input: CompleteLessonInput,
): Promise<CompleteLessonResult> {
  const lessonReference = doc(collection(db, "lessons"), input.lessonId);
  const newHomeworkId = input.newHomework
    ? homeworkIdForCompletedLesson(input.lessonId)
    : null;
  const newHomeworkReference = newHomeworkId
    ? doc(collection(db, "homeworks"), newHomeworkId)
    : null;
  const previousHomeworkReference = input.previousHomework
    ? doc(collection(db, "homeworks"), input.previousHomework.id)
    : null;
  const teacherNoteReference = doc(db, "lessonTeacherNotes", input.lessonId);
  const xpReference = doc(db, "gamificationEvents", `lesson_completed__${input.lessonId}`);

  return runTransaction(db, async (transaction) => {
    const lessonSnapshot = await transaction.get(lessonReference);

    if (!lessonSnapshot.exists()) {
      throw new Error(`Lesson ${input.lessonId} does not exist`);
    }

    const lesson = lessonSnapshot.data() as Lesson;

    if (lesson.teacherId !== input.teacherId) {
      throw new Error("The teacher does not own this lesson");
    }

    if (lesson.status === "completed") {
      return { status: "already_completed", homeworkId: newHomeworkId };
    }

    const [newHomeworkSnapshot, previousHomeworkSnapshot, teacherNoteSnapshot, xpSnapshot] = await Promise.all([
      newHomeworkReference ? transaction.get(newHomeworkReference) : null,
      previousHomeworkReference ? transaction.get(previousHomeworkReference) : null,
      input.privateTeacherNote ? transaction.get(teacherNoteReference) : null,
      transaction.get(xpReference),
    ]);

    if (previousHomeworkReference) {
      if (!previousHomeworkSnapshot?.exists()) {
        throw new Error(`Previous homework ${input.previousHomework?.id} does not exist`);
      }

      const previousHomework = previousHomeworkSnapshot.data() as Homework;
      if (
        previousHomework.teacherId !== lesson.teacherId ||
        previousHomework.studentId !== lesson.studentId
      ) {
        throw new Error("Previous homework does not belong to the lesson student");
      }
    }

    if (newHomeworkSnapshot?.exists()) {
      const existingHomework = newHomeworkSnapshot.data() as Homework;
      if (
        existingHomework.sourceLessonId !== input.lessonId ||
        existingHomework.teacherId !== lesson.teacherId ||
        existingHomework.studentId !== lesson.studentId
      ) {
        throw new Error(`Deterministic homework ID collision: ${newHomeworkId}`);
      }
    }

    const coverageReferences = lesson.studentProgramId
      ? [...new Set(input.examTaskNumbers ?? [])].map((taskNumber) => ({ taskNumber, reference: doc(db, "studentTaskCoverage", `${lesson.studentProgramId}__task__${taskNumber}`) }))
      : [];
    const coverageSnapshots = await Promise.all(coverageReferences.map(({ reference }) => transaction.get(reference)));

    transaction.update(lessonReference, {
      status: "completed",
      topic: input.topic,
      lessonSummary: input.lessonSummary,
      understanding: input.understanding ?? null,
      examTaskNumbers: [...new Set(input.examTaskNumbers ?? [])].sort((a, b) => a - b),
      homeworkResolution: input.newHomework ? "assigned" : "pending",
      updatedAt: serverTimestamp(),
    });

    if (previousHomeworkReference && input.previousHomework) {
      transaction.update(previousHomeworkReference, {
        status: input.previousHomework.status,
        updatedAt: serverTimestamp(),
      });
    }

    if (newHomeworkReference && input.newHomework && !newHomeworkSnapshot?.exists()) {
      transaction.set(newHomeworkReference, {
        teacherId: lesson.teacherId,
        studentId: lesson.studentId,
        studentProgramId: input.newHomework.studentProgramId,
        sourceLessonId: input.lessonId,
        type: input.newHomework.type,
        title: input.newHomework.title,
        description: input.newHomework.description,
        examTaskNumbers: input.newHomework.examTaskNumbers,
        assignedAt: serverTimestamp(),
        dueAt: input.newHomework.dueAt,
        status: "assigned",
        requiredAmount: input.newHomework.requiredAmount,
        items: input.newHomework.items ?? [],
        attachments: [],
        templateId: null,
        draft: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        schemaVersion: 1,
      });
    }

    if (input.privateTeacherNote && !teacherNoteSnapshot?.exists()) transaction.set(teacherNoteReference, { teacherId: lesson.teacherId, studentId: lesson.studentId, lessonId: input.lessonId, note: input.privateTeacherNote.trim(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1 });
    if (!xpSnapshot.exists() && lesson.studentProgramId) transaction.set(xpReference, { teacherId: lesson.teacherId, studentId: lesson.studentId, studentProgramId: lesson.studentProgramId, eventType: "lesson_completed", sourceType: "lesson", sourceId: input.lessonId, xpDelta: 25, createdAt: serverTimestamp(), schemaVersion: 1 });

    if (lesson.studentProgramId) {
      coverageReferences.forEach(({ taskNumber, reference: coverageReference }, index) => {
        const coverageSnapshot = coverageSnapshots[index]!;
        if (!coverageSnapshot.exists()) transaction.set(coverageReference, { teacherId: lesson.teacherId, studentId: lesson.studentId, studentProgramId: lesson.studentProgramId, taskNumber, state: "inProgress", sourceLessonIds: [input.lessonId], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1 });
        else {
          const data = coverageSnapshot.data() as { sourceLessonIds?: string[] };
          transaction.update(coverageReference, { sourceLessonIds: [...new Set([...(data.sourceLessonIds ?? []), input.lessonId])], updatedAt: serverTimestamp() });
        }
      });
    }

    return { status: "completed", homeworkId: newHomeworkId };
  });
}

export async function updateCompletedLessonSummary(db: Firestore, input: Pick<CompleteLessonInput, "lessonId" | "teacherId" | "topic" | "lessonSummary" | "understanding" | "examTaskNumbers" | "privateTeacherNote">) {
  const lessonReference = doc(db, "lessons", input.lessonId);
  const noteReference = doc(db, "lessonTeacherNotes", input.lessonId);
  await runTransaction(db, async (transaction) => {
    const lessonSnapshot = await transaction.get(lessonReference);
    if (!lessonSnapshot.exists()) throw new Error("Lesson does not exist");
    const lesson = lessonSnapshot.data() as Lesson;
    if (lesson.teacherId !== input.teacherId || lesson.status !== "completed") throw new Error("Only an owned completed lesson can be edited");
    transaction.update(lessonReference, { topic: input.topic.trim(), lessonSummary: input.lessonSummary, understanding: input.understanding ?? null, examTaskNumbers: [...new Set(input.examTaskNumbers ?? [])].sort((a, b) => a - b), updatedAt: serverTimestamp() });
    if (input.privateTeacherNote?.trim()) transaction.set(noteReference, { teacherId: lesson.teacherId, studentId: lesson.studentId, lessonId: input.lessonId, note: input.privateTeacherNote.trim(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1 }, { merge: true });
  });
}

export async function setLessonHomeworkResolution(db: Firestore, lessonId: string, teacherId: string, resolution: "pending" | "assigned" | "not_required") {
  const reference = doc(db, "lessons", lessonId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || (snapshot.data() as Lesson).teacherId !== teacherId) throw new Error("Lesson ownership mismatch");
    const lesson = snapshot.data() as Lesson;
    if (lesson.homeworkResolution === resolution) return;
    if (lesson.homeworkResolution === "assigned" && resolution !== "assigned")
      throw new Error("Assigned homework resolution cannot be overwritten");
    transaction.update(reference, { homeworkResolution: resolution, updatedAt: serverTimestamp() });
  });
}

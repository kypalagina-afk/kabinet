import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import type { Attachment, Homework, HomeworkItem, Lesson, MockExam, StudentProgram } from "../types.js";
import { zonedLocalDateTimeToDate } from "../../../features/schedule/timezone.js";
import { homeworkIdForCompletedLesson } from "./completeLesson.js";

interface OwnedStudentProgramInput {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
}

export interface CreateHomeworkInput extends OwnedStudentProgramInput {
  sourceLessonId?: string | null;
  type: Homework["type"];
  title: string;
  description: string | null;
  dueAt: Date | null;
  dueDate?: string | null;
  dueTime?: string | null;
  dueTimezone?: string | null;
  examTaskNumbers?: number[];
  requiredAmount?: number | null;
  items?: HomeworkItem[];
  attachments?: Attachment[];
  draft?: boolean;
  reviewCriteria?: Homework["reviewCriteria"];
  examBlueprintId?: string | null;
  criteriaVersion?: string | null;
  maxScoreSnapshot?: number | null;
  minimumWordCountSnapshot?: number | null;
}

export interface CreateMockExamInput extends OwnedStudentProgramInput {
  examBlueprintId: string;
  title: string;
  takenAt: Date;
  scoreEarned: number;
  scoreMax: number;
  grade: number;
  teacherComment: string | null;
}

function assertValidOwnership(
  program: StudentProgram,
  input: OwnedStudentProgramInput,
) {
  if (
    program.teacherId !== input.teacherId ||
    program.studentId !== input.studentId ||
    program.status !== "active"
  ) {
    throw new Error("Active student program ownership check failed");
  }
}

export async function createHomework(
  db: Firestore,
  input: CreateHomeworkInput,
): Promise<string> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Homework title is required");
  }

  const programReference = doc(db, "studentPrograms", input.studentProgramId);
  const homeworkReference = input.sourceLessonId
    ? doc(db, "homeworks", homeworkIdForCompletedLesson(input.sourceLessonId))
    : doc(collection(db, "homeworks"));
  const lessonReference = input.sourceLessonId
    ? doc(db, "lessons", input.sourceLessonId)
    : null;
  const dueTimezone = input.dueTimezone ?? "Europe/Moscow";
  const dueAt =
    input.dueAt ??
    (input.dueDate && input.dueTime
      ? zonedLocalDateTimeToDate(input.dueDate, input.dueTime, dueTimezone)
      : null);

  await runTransaction(db, async (transaction) => {
    const [programSnapshot, lessonSnapshot, homeworkSnapshot] = await Promise.all([
      transaction.get(programReference),
      lessonReference ? transaction.get(lessonReference) : Promise.resolve(null),
      input.sourceLessonId ? transaction.get(homeworkReference) : Promise.resolve(null),
    ]);
    if (!programSnapshot.exists()) {
      throw new Error("Student program does not exist");
    }
    assertValidOwnership(programSnapshot.data() as StudentProgram, input);

    if (lessonReference) {
      if (!lessonSnapshot?.exists()) throw new Error("Source lesson does not exist");
      const lesson = lessonSnapshot.data() as Lesson;
      if (
        lesson.teacherId !== input.teacherId ||
        lesson.studentId !== input.studentId ||
        lesson.studentProgramId !== input.studentProgramId ||
        lesson.status !== "completed"
      ) throw new Error("Completed lesson ownership check failed");

      if (homeworkSnapshot?.exists()) {
        const existing = homeworkSnapshot.data() as Homework;
        if (
          existing.sourceLessonId !== input.sourceLessonId ||
          existing.teacherId !== input.teacherId ||
          existing.studentId !== input.studentId ||
          existing.studentProgramId !== input.studentProgramId
        ) throw new Error(`Deterministic homework ID collision: ${homeworkReference.id}`);
        if (lesson.homeworkResolution !== "assigned") {
          transaction.update(lessonReference, {
            homeworkResolution: "assigned",
            updatedAt: serverTimestamp(),
          });
        }
        return;
      }
    }

    transaction.set(homeworkReference, {
      teacherId: input.teacherId,
      studentId: input.studentId,
      studentProgramId: input.studentProgramId,
      sourceLessonId: input.sourceLessonId ?? null,
      type: input.type,
      title,
      description: input.description?.trim() || null,
      examTaskNumbers: input.examTaskNumbers ?? [],
      assignedAt: serverTimestamp(),
      dueAt: dueAt ? Timestamp.fromDate(dueAt) : null,
      dueDate: input.dueDate ?? null,
      dueTime: input.dueTime ?? null,
      dueTimezone,
      status: "assigned",
      requiredAmount: input.requiredAmount ?? null,
      items: input.items ?? [],
      attachments: input.attachments ?? [],
      templateId: null,
      draft: input.draft ?? false,
      reviewCriteria: input.reviewCriteria ?? null,
      examBlueprintId: input.examBlueprintId ?? null,
      criteriaVersion: input.criteriaVersion ?? null,
      maxScoreSnapshot: input.maxScoreSnapshot ?? null,
      minimumWordCountSnapshot: input.minimumWordCountSnapshot ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
    if (lessonReference) {
      transaction.update(lessonReference, {
        homeworkResolution: "assigned",
        updatedAt: serverTimestamp(),
      });
    }
  });

  return homeworkReference.id;
}

export async function createMockExam(
  db: Firestore,
  input: CreateMockExamInput,
): Promise<string> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Mock exam title is required");
  }
  if (
    input.scoreMax <= 0 ||
    input.scoreEarned < 0 ||
    input.scoreEarned > input.scoreMax ||
    !Number.isInteger(input.grade) ||
    input.grade < 2 ||
    input.grade > 5
  ) {
    throw new Error("Mock exam score or grade is invalid");
  }

  const programReference = doc(db, "studentPrograms", input.studentProgramId);
  const mockExamReference = doc(collection(db, "mockExams"));

  await runTransaction(db, async (transaction) => {
    const programSnapshot = await transaction.get(programReference);
    if (!programSnapshot.exists()) {
      throw new Error("Student program does not exist");
    }
    assertValidOwnership(programSnapshot.data() as StudentProgram, input);

    transaction.set(mockExamReference, {
      teacherId: input.teacherId,
      studentId: input.studentId,
      studentProgramId: input.studentProgramId,
      examBlueprintId: input.examBlueprintId,
      title,
      takenAt: Timestamp.fromDate(input.takenAt),
      taskResults: [],
      sections: {
        test: { earned: input.scoreEarned, max: input.scoreMax },
        exposition: { earned: 0, max: 0, criteria: [] },
        essay: { earned: 0, max: 0, criteria: [], comment: null },
        literacy: { earned: 0, max: 0, criteria: [] },
        factualAccuracy: { earned: 0, max: 0, errorsCount: null },
      },
      total: { earned: input.scoreEarned, max: input.scoreMax },
      grade: input.grade,
      teacherComment: input.teacherComment?.trim() || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    } satisfies Omit<MockExam, "createdAt" | "updatedAt"> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      updatedAt: ReturnType<typeof serverTimestamp>;
    });
  });

  return mockExamReference.id;
}

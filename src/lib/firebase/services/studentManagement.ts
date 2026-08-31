import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
  where,
  type Firestore,
} from "firebase/firestore";
import type { Lesson, LessonSeries, Student, StudentProgram } from "../types.js";

export async function switchStudentProgram(
  db: Firestore,
  input: {
    teacherId: string;
    studentId: string;
    programProfileId: string;
    goal: StudentProgram["goal"];
  },
) {
  const [programs, series, lessons] = await Promise.all([
    getDocs(query(
      collection(db, "studentPrograms"),
      where("teacherId", "==", input.teacherId),
      where("studentId", "==", input.studentId),
    )),
    getDocs(query(
      collection(db, "lessonSeries"),
      where("teacherId", "==", input.teacherId),
      where("studentId", "==", input.studentId),
    )),
    getDocs(query(
      collection(db, "lessons"),
      where("teacherId", "==", input.teacherId),
      where("studentId", "==", input.studentId),
    )),
  ]);
  const reusable = programs.docs.find((item) => {
    const program = item.data() as StudentProgram;
    return program.programProfileId === input.programProfileId && program.status !== "completed";
  });
  const targetReference = reusable?.ref ?? doc(collection(db, "studentPrograms"));
  const targetId = targetReference.id;
  const batch = writeBatch(db);
  for (const item of programs.docs) {
    const program = item.data() as StudentProgram;
    if (item.id !== targetId && program.status === "active") {
      batch.update(item.ref, { status: "paused", updatedAt: serverTimestamp() });
    }
  }
  if (reusable) {
    batch.update(targetReference, {
      status: "active",
      goal: input.goal,
      completedAt: null,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(targetReference, {
      teacherId: input.teacherId,
      studentId: input.studentId,
      programProfileId: input.programProfileId,
      status: "active",
      goal: input.goal,
      startedAt: serverTimestamp(),
      completedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
  }
  batch.update(doc(db, "students", input.studentId), {
    activeProgramId: targetId,
    updatedAt: serverTimestamp(),
  });
  const today = new Date().toISOString().slice(0, 10);
  for (const item of series.docs) {
    const lessonSeries = item.data() as LessonSeries;
    if (lessonSeries.active && (!lessonSeries.endsOn || lessonSeries.endsOn >= today)) {
      batch.update(item.ref, {
        studentProgramId: targetId,
        updatedAt: serverTimestamp(),
      });
    }
  }
  const now = Date.now();
  for (const item of lessons.docs) {
    const lesson = item.data() as Lesson;
    if (lesson.status === "planned" && lesson.startAt.toMillis() >= now) {
      batch.update(item.ref, {
        studentProgramId: targetId,
        updatedAt: serverTimestamp(),
      });
    }
  }
  batch.set(doc(collection(db, "teacherAuditEvents")), {
    teacherId: input.teacherId,
    studentId: input.studentId,
    entityType: "studentProgram",
    entityId: targetId,
    action: "program_switched",
    summary: `Активная программа изменена на ${input.programProfileId}`,
    createdAt: serverTimestamp(),
    schemaVersion: 1,
  });
  await batch.commit();
  return targetId;
}

export async function setActiveStudentProgram(
  db: Firestore,
  input: { teacherId: string; studentId: string; studentProgramId: string },
) {
  const programs = await getDocs(query(
    collection(db, "studentPrograms"),
    where("teacherId", "==", input.teacherId),
    where("studentId", "==", input.studentId),
  ));
  const studentReference = doc(db, "students", input.studentId);
  await runTransaction(db, async (transaction) => {
    const [studentSnapshot, ...programSnapshots] = await Promise.all([
      transaction.get(studentReference),
      ...programs.docs.map((item) => transaction.get(item.ref)),
    ]);
    if (!studentSnapshot.exists() || (studentSnapshot.data() as Student).teacherId !== input.teacherId)
      throw new Error("Student ownership mismatch");
    const target = programSnapshots.find((item) => item.id === input.studentProgramId);
    if (!target?.exists()) throw new Error("Target student program does not exist");
    if ((target.data() as StudentProgram).status === "completed")
      throw new Error("Completed student program cannot be activated");
    for (const snapshot of programSnapshots) {
      if (!snapshot.exists()) continue;
      const nextStatus = snapshot.id === input.studentProgramId ? "active" :
        (snapshot.data() as StudentProgram).status === "active" ? "paused" : null;
      if (nextStatus && (snapshot.data() as StudentProgram).status !== nextStatus) {
        transaction.update(snapshot.ref, {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }
    }
    transaction.update(studentReference, {
      activeProgramId: input.studentProgramId,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function updateStudentProfile(
  db: Firestore,
  input: {
    teacherId: string;
    studentId: string;
    displayName: string;
    classGrade: number | null;
    avatarKey: string;
    conferenceUrl: string | null;
    secondaryConferenceUrl?: string | null;
  },
) {
  const batch = writeBatch(db);
  const conferenceLinks = [
    input.conferenceUrl
      ? {
          id: "primary",
          label: "Основная",
          provider: "zoom",
          joinUrl: input.conferenceUrl,
          isDefault: true,
        }
      : null,
    input.secondaryConferenceUrl
      ? {
          id: "secondary",
          label: "Дополнительная",
          provider: "other",
          joinUrl: input.secondaryConferenceUrl,
          isDefault: false,
        }
      : null,
  ].filter(Boolean);
  batch.update(doc(db, "students", input.studentId), {
    displayName: input.displayName.trim(),
    classGrade: input.classGrade,
    avatarKey: input.avatarKey,
    "defaultConference.joinUrl": input.conferenceUrl,
    conferenceLinks,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "teacherAuditEvents")), {
    teacherId: input.teacherId,
    studentId: input.studentId,
    entityType: "student",
    entityId: input.studentId,
    action: "profile_updated",
    summary: "Карточка ученика обновлена",
    createdAt: serverTimestamp(),
    schemaVersion: 1,
  });
  await batch.commit();
}

export async function updateStudentTimezone(
  db: Firestore,
  input: {
    teacherId: string;
    studentId: string;
    iana: string;
    moscowOffsetMinutes: number | null;
  },
) {
  const studentReference = doc(db, "students", input.studentId);
  const userReference = doc(db, "users", input.studentId);
  const auditReference = doc(collection(db, "teacherAuditEvents"));
  await runTransaction(db, async (transaction) => {
    const studentSnapshot = await transaction.get(studentReference);
    if (!studentSnapshot.exists() || (studentSnapshot.data() as Student).teacherId !== input.teacherId) {
      throw new Error("Student ownership mismatch");
    }
    transaction.update(userReference, {
      timezone: {
        iana: input.iana,
        moscowOffsetMinutes: input.moscowOffsetMinutes,
      },
      updatedAt: serverTimestamp(),
    });
    transaction.set(auditReference, {
      teacherId: input.teacherId,
      studentId: input.studentId,
      entityType: "student",
      entityId: input.studentId,
      action: "timezone_updated",
      summary: "Часовой пояс ученика обновлён",
      createdAt: serverTimestamp(),
      schemaVersion: 1,
    });
  });
}

export async function updateStudentProgramGoal(
  db: Firestore,
  input: {
    teacherId: string;
    studentId: string;
    studentProgramId: string;
    displayText: string;
  },
) {
  const displayText = input.displayText.trim();
  if (!displayText) throw new Error("Цель программы не может быть пустой");
  const programReference = doc(db, "studentPrograms", input.studentProgramId);
  const auditReference = doc(collection(db, "teacherAuditEvents"));
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(programReference);
    if (!snapshot.exists()) throw new Error("Программа ученика не найдена");
    const program = snapshot.data() as StudentProgram;
    if (program.teacherId !== input.teacherId || program.studentId !== input.studentId)
      throw new Error("Student program ownership mismatch");
    transaction.update(programReference, {
      "goal.displayText": displayText,
      updatedAt: serverTimestamp(),
    });
    transaction.set(auditReference, {
      teacherId: input.teacherId,
      studentId: input.studentId,
      entityType: "studentProgram",
      entityId: input.studentProgramId,
      action: "goal_updated",
      summary: `Цель программы обновлена: ${displayText}`,
      createdAt: serverTimestamp(),
      schemaVersion: 1,
    });
  });
}

export async function setStudentArchived(
  db: Firestore,
  input: { teacherId: string; studentId: string; archived: boolean },
) {
  const batch = writeBatch(db);
  batch.update(doc(db, "students", input.studentId), {
    status: input.archived ? "archived" : "active",
    archivedAt: input.archived ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "teacherAuditEvents")), {
    teacherId: input.teacherId,
    studentId: input.studentId,
    entityType: "student",
    entityId: input.studentId,
    action: input.archived ? "archived" : "restored",
    summary: input.archived ? "Ученик архивирован" : "Ученик восстановлен",
    createdAt: serverTimestamp(),
    schemaVersion: 1,
  });
  await batch.commit();
}

export async function updateStudentConferenceLinks(
  db: Firestore,
  input: {
    teacherId: string;
    studentId: string;
    links: Array<{
      id: string;
      label: string;
      provider: "zoom" | "meet" | "other";
      joinUrl: string;
      isDefault: boolean;
    }>;
  },
) {
  const clean = input.links
    .filter((item) => item.label.trim() && item.joinUrl.trim())
    .map((item, index) => ({
      ...item,
      label: item.label.trim(),
      joinUrl: item.joinUrl.trim(),
      isDefault:
        index === input.links.findIndex((candidate) => candidate.isDefault),
    }));
  if (clean.length && !clean.some((item) => item.isDefault))
    clean[0]!.isDefault = true;
  const primary = clean.find((item) => item.isDefault) ?? null;
  const batch = writeBatch(db);
  batch.update(doc(db, "students", input.studentId), {
    conferenceLinks: clean,
    "defaultConference.provider":
      primary?.provider === "zoom" ? "zoom" : "other",
    "defaultConference.joinUrl": primary?.joinUrl ?? null,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "teacherAuditEvents")), {
    teacherId: input.teacherId,
    studentId: input.studentId,
    entityType: "student",
    entityId: input.studentId,
    action: "conference_links_updated",
    summary: "Постоянные ссылки ученика обновлены",
    createdAt: serverTimestamp(),
    schemaVersion: 1,
  });
  await batch.commit();
}

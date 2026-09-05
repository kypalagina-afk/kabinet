import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import {
  sharedPairLessonId,
  studentPairId,
} from "../../../features/schedule/studentPairs.js";
import type { Lesson, LessonSeries, Student, StudentProgram } from "../types.js";
import { lessonIdForOccurrence } from "./materializeLessonSeries.js";
import {
  cancelLesson,
  cancelLessonSeries,
  changeRecurringSeriesFuture,
  createLessonSeries,
  createOneOffLesson,
  deleteLessonSeriesFuture,
  hardDeleteLesson,
  lessonSeriesIdForSchedule,
  rescheduleLesson,
  type CreateLessonSeriesInput,
  type OperationResult,
} from "./scheduleOperations.js";

async function activeProgramId(
  db: Firestore,
  teacherId: string,
  studentId: string,
) {
  const snapshot = await getDocs(
    query(
      collection(db, "studentPrograms"),
      where("teacherId", "==", teacherId),
      where("studentId", "==", studentId),
    ),
  );
  return (
    snapshot.docs.find(
      (item) => (item.data() as StudentProgram).status === "active",
    )?.id ?? null
  );
}

async function ownedLessons(db: Firestore, teacherId: string) {
  const snapshot = await getDocs(
    query(collection(db, "lessons"), where("teacherId", "==", teacherId)),
  );
  return snapshot.docs.map((item) => ({ id: item.id, data: item.data() as Lesson }));
}

async function ownedSeries(db: Firestore, teacherId: string) {
  const snapshot = await getDocs(
    query(collection(db, "lessonSeries"), where("teacherId", "==", teacherId)),
  );
  return snapshot.docs.map((item) => ({ id: item.id, data: item.data() as LessonSeries }));
}

function mirrorLessonId(sourceLessonId: string, partnerStudentId: string) {
  return `${sourceLessonId}__pair__${partnerStudentId}`;
}

export async function pairExistingStudents(
  db: Firestore,
  input: {
    teacherId: string;
    firstStudentId: string;
    secondStudentId: string;
    scheduleSourceStudentId: string;
    effectiveAt?: Timestamp;
  },
) {
  const pairId = studentPairId(input.firstStudentId, input.secondStudentId);
  if (![input.firstStudentId, input.secondStudentId].includes(input.scheduleSourceStudentId)) {
    throw new Error("Расписание должно принадлежать одному из учеников пары.");
  }
  const partnerStudentId =
    input.scheduleSourceStudentId === input.firstStudentId
      ? input.secondStudentId
      : input.firstStudentId;
  const effectiveAt = input.effectiveAt ?? Timestamp.now();
  const [firstSnapshot, secondSnapshot, lessons, series, partnerProgramId] =
    await Promise.all([
      getDoc(doc(db, "students", input.firstStudentId)),
      getDoc(doc(db, "students", input.secondStudentId)),
      ownedLessons(db, input.teacherId),
      ownedSeries(db, input.teacherId),
      activeProgramId(db, input.teacherId, partnerStudentId),
    ]);
  if (!firstSnapshot.exists() || !secondSnapshot.exists()) {
    throw new Error("Один из учеников не найден.");
  }
  const first = firstSnapshot.data() as Student;
  const second = secondSnapshot.data() as Student;
  if (first.teacherId !== input.teacherId || second.teacherId !== input.teacherId) {
    throw new Error("Ученики не принадлежат преподавателю.");
  }
  if (
    (first.pairId && first.pairId !== pairId) ||
    (second.pairId && second.pairId !== pairId)
  ) {
    throw new Error("Один из учеников уже состоит в другой паре.");
  }
  if (!partnerProgramId) {
    throw new Error("У второго ученика нет активной программы.");
  }

  const future = lessons.filter(
    ({ data }) =>
      data.startAt.toMillis() >= effectiveAt.toMillis() &&
      data.status === "planned",
  );
  const sourceLessons = future
    .filter(({ data }) => data.studentId === input.scheduleSourceStudentId)
    .sort((left, right) => left.data.startAt.toMillis() - right.data.startAt.toMillis());
  const replacedLessons = future
    .filter(({ data }) => data.studentId === partnerStudentId)
    .sort((left, right) => left.data.startAt.toMillis() - right.data.startAt.toMillis());
  const sourceSeries = series.filter(
    ({ data }) => data.studentId === input.scheduleSourceStudentId && data.active,
  );
  const replacedSeries = series.filter(
    ({ data }) => data.studentId === partnerStudentId && data.active,
  );
  if (!sourceLessons.length) {
    throw new Error("У выбранного ученика нет будущих занятий. Выберите расписание второго ученика или сначала создайте занятие.");
  }
  const sourceProgramId = await activeProgramId(
    db,
    input.teacherId,
    input.scheduleSourceStudentId,
  );
  if (!sourceProgramId) throw new Error("У выбранного ученика нет активной программы.");
  const [sourceProgramSnapshot, partnerProgramSnapshot] = await Promise.all([
    getDoc(doc(db, "studentPrograms", sourceProgramId)),
    getDoc(doc(db, "studentPrograms", partnerProgramId)),
  ]);
  if (
    !sourceProgramSnapshot.exists() ||
    !partnerProgramSnapshot.exists() ||
    (sourceProgramSnapshot.data() as StudentProgram).programProfileId !==
      (partnerProgramSnapshot.data() as StudentProgram).programProfileId
  ) {
    throw new Error("Для постоянной пары у учеников должна быть одинаковая программа.");
  }

  const writeCount = 3 + sourceLessons.length * 2 + replacedLessons.length + sourceSeries.length * 2 + replacedSeries.length;
  if (writeCount > 450) throw new Error("Слишком много будущих занятий для одного объединения.");
  const batch = writeBatch(db);
  batch.update(firstSnapshot.ref, {
    pairId,
    pairedStudentId: input.secondStudentId,
    pairedStudentName: second.displayName,
    pairedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(secondSnapshot.ref, {
    pairId,
    pairedStudentId: input.firstStudentId,
    pairedStudentName: first.displayName,
    pairedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const seriesMirrorIds = new Map<string, string>();
  const reusedPartnerSeriesIds = new Set<string>();
  for (const item of sourceSeries) {
    const pairedSeriesId = lessonSeriesIdForSchedule({
      teacherId: input.teacherId,
      studentId: partnerStudentId,
      studentProgramId: partnerProgramId,
      weekdays: item.data.weekdays,
      interval: item.data.interval,
      startLocalTime: item.data.startLocalTime,
      durationMinutes: item.data.durationMinutes,
      baseTimezone: item.data.baseTimezone,
      startsOn: item.data.startsOn ?? new Date(effectiveAt.toMillis()).toISOString().slice(0, 10),
      endsOn: item.data.endsOn ?? null,
    });
    seriesMirrorIds.set(item.id, pairedSeriesId);
    reusedPartnerSeriesIds.add(pairedSeriesId);
    batch.update(doc(db, "lessonSeries", item.id), {
      pairId,
      pairedStudentId: partnerStudentId,
      pairedSeriesId,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "lessonSeries", pairedSeriesId), {
      ...item.data,
      studentId: partnerStudentId,
      studentProgramId: partnerProgramId,
      pairId,
      pairedStudentId: input.scheduleSourceStudentId,
      pairedSeriesId: item.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  for (const item of replacedSeries) {
    if (reusedPartnerSeriesIds.has(item.id)) continue;
    batch.update(doc(db, "lessonSeries", item.id), {
      active: false,
      cancelledAt: serverTimestamp(),
      cancelledBy: "teacher",
      updatedAt: serverTimestamp(),
    });
  }
  const pairedLessonIds = new Set(
    sourceLessons.map((item) => {
      const pairedSeriesId = item.data.lessonSeriesId
        ? seriesMirrorIds.get(item.data.lessonSeriesId)
        : null;
      return pairedSeriesId
        ? lessonIdForOccurrence(pairedSeriesId, item.data.startAt)
        : mirrorLessonId(item.id, partnerStudentId);
    }),
  );
  for (const item of replacedLessons) {
    if (pairedLessonIds.has(item.id)) continue;
    batch.update(doc(db, "lessons", item.id), {
      status: "cancelled_teacher",
      pairId,
      pairReplaced: true,
      updatedAt: serverTimestamp(),
    });
  }
  sourceLessons.forEach((item, index) => {
    const pairedSeriesId = item.data.lessonSeriesId
      ? seriesMirrorIds.get(item.data.lessonSeriesId)
      : null;
    const pairedLessonId = pairedSeriesId
      ? lessonIdForOccurrence(pairedSeriesId, item.data.startAt)
      : mirrorLessonId(item.id, partnerStudentId);
    const sharedLessonId = sharedPairLessonId(pairId, item.data.startAt.toMillis());
    const oldPartnerLesson =
      replacedLessons.find(({ id }) => id === pairedLessonId)?.data ??
      replacedLessons[index]?.data;
    batch.update(doc(db, "lessons", item.id), {
      pairId,
      pairedStudentId: partnerStudentId,
      pairedLessonId,
      sharedLessonId,
      pairPrimary: true,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "lessons", pairedLessonId), {
      ...item.data,
      studentId: partnerStudentId,
      studentProgramId: partnerProgramId,
      lessonSeriesId: pairedSeriesId ?? null,
      pairId,
      pairedStudentId: input.scheduleSourceStudentId,
      pairedLessonId: item.id,
      sharedLessonId,
      pairPrimary: false,
      billingIdentityId: oldPartnerLesson?.billingIdentityId ?? pairedLessonId,
      billingType: oldPartnerLesson?.billingType ?? item.data.billingType ?? "regular",
      paymentStatus: oldPartnerLesson?.paymentStatus ?? "unpaid",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  batch.set(doc(collection(db, "teacherAuditEvents")), {
    teacherId: input.teacherId,
    studentId: input.scheduleSourceStudentId,
    entityType: "student_pair",
    entityId: pairId,
    action: "students_paired",
    summary: "Ученики объединены в постоянную пару",
    createdAt: serverTimestamp(),
    schemaVersion: 1,
  });
  await batch.commit();
  return { pairId, pairedLessonCount: sourceLessons.length };
}

async function linkSeriesAndLessons(
  db: Firestore,
  teacherId: string,
  pairId: string,
  firstSeriesId: string,
  secondSeriesId: string,
  firstStudentId: string,
  secondStudentId: string,
) {
  const lessons = await ownedLessons(db, teacherId);
  const first = lessons.filter(({ data }) => data.lessonSeriesId === firstSeriesId);
  const second = lessons.filter(({ data }) => data.lessonSeriesId === secondSeriesId);
  const batch = writeBatch(db);
  batch.update(doc(db, "lessonSeries", firstSeriesId), {
    pairId,
    pairedStudentId: secondStudentId,
    pairedSeriesId: secondSeriesId,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "lessonSeries", secondSeriesId), {
    pairId,
    pairedStudentId: firstStudentId,
    pairedSeriesId: firstSeriesId,
    updatedAt: serverTimestamp(),
  });
  for (const item of first) {
    const partner = second.find(
      ({ data }) => data.startAt.toMillis() === item.data.startAt.toMillis(),
    );
    if (!partner) continue;
    const sharedLessonId = sharedPairLessonId(pairId, item.data.startAt.toMillis());
    batch.update(doc(db, "lessons", item.id), {
      pairId,
      pairedStudentId: secondStudentId,
      pairedLessonId: partner.id,
      sharedLessonId,
      pairPrimary: true,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, "lessons", partner.id), {
      pairId,
      pairedStudentId: firstStudentId,
      pairedLessonId: item.id,
      sharedLessonId,
      pairPrimary: false,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function createLessonSeriesForStudentOrPair(
  db: Firestore,
  input: CreateLessonSeriesInput,
  now = new Date(),
) {
  const studentSnapshot = await getDoc(doc(db, "students", input.studentId));
  const student = studentSnapshot.exists() ? (studentSnapshot.data() as Student) : null;
  if (!student?.pairId || !student.pairedStudentId) {
    return createLessonSeries(db, input, now);
  }
  const partnerProgramId = await activeProgramId(
    db,
    input.teacherId,
    student.pairedStudentId,
  );
  if (!partnerProgramId) throw new Error("У второго ученика пары нет активной программы.");
  const first = await createLessonSeries(db, input, now);
  const second = await createLessonSeries(
    db,
    { ...input, studentId: student.pairedStudentId, studentProgramId: partnerProgramId },
    now,
  );
  await linkSeriesAndLessons(
    db,
    input.teacherId,
    student.pairId,
    first.seriesId,
    second.seriesId,
    input.studentId,
    student.pairedStudentId,
  );
  return first;
}

export async function createOneOffLessonForStudentOrPair(
  db: Firestore,
  input: Parameters<typeof createOneOffLesson>[1],
) {
  const studentSnapshot = await getDoc(doc(db, "students", input.studentId));
  const student = studentSnapshot.exists() ? (studentSnapshot.data() as Student) : null;
  if (!student?.pairId || !student.pairedStudentId) {
    return createOneOffLesson(db, input);
  }
  const partnerProgramId = await activeProgramId(db, input.teacherId, student.pairedStudentId);
  if (!partnerProgramId) throw new Error("У второго ученика пары нет активной программы.");
  if (input.endAt.toMillis() <= input.startAt.toMillis()) {
    throw new Error("Окончание занятия должно быть позже начала.");
  }
  const firstReference = doc(collection(db, "lessons"));
  const secondReference = doc(collection(db, "lessons"));
  const firstId = firstReference.id;
  const secondId = secondReference.id;
  const sharedLessonId = sharedPairLessonId(student.pairId, input.startAt.toMillis());
  const batch = writeBatch(db);
  const common = {
    teacherId: input.teacherId,
    startAt: input.startAt,
    endAt: input.endAt,
    lessonSeriesId: null,
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
    understanding: null,
    examTaskNumbers: [],
    homeworkResolution: "pending",
    conferenceUrl: null,
    billingType: input.billingType ?? "regular",
    paymentStatus: input.billingType === "free" ? "free" : "unpaid",
    wasRescheduled: false,
    pairId: student.pairId,
    sharedLessonId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
  } as const;
  batch.set(firstReference, {
    ...common,
    studentId: input.studentId,
    studentProgramId: input.studentProgramId,
    pairedStudentId: student.pairedStudentId,
    pairedLessonId: secondId,
    pairPrimary: true,
    billingIdentityId: firstId,
  });
  batch.set(secondReference, {
    ...common,
    studentId: student.pairedStudentId,
    studentProgramId: partnerProgramId,
    pairedStudentId: input.studentId,
    pairedLessonId: firstId,
    pairPrimary: false,
    billingIdentityId: secondId,
  });
  await batch.commit();
  return firstId;
}

async function pairedLesson(db: Firestore, lessonId: string) {
  const snapshot = await getDoc(doc(db, "lessons", lessonId));
  if (!snapshot.exists()) throw new Error("Занятие не найдено.");
  return { id: snapshot.id, data: snapshot.data() as Lesson };
}

export async function cancelLessonForStudentOrPair(
  db: Firestore,
  lessonId: string,
  actor: "teacher" | "student",
): Promise<OperationResult> {
  const lesson = await pairedLesson(db, lessonId);
  await Promise.all([
    cancelLesson(db, lessonId, actor),
    ...(lesson.data.pairedLessonId
      ? [cancelLesson(db, lesson.data.pairedLessonId, actor)]
      : []),
  ]);
  return { status: "applied" };
}

export async function rescheduleLessonForStudentOrPair(
  db: Firestore,
  input: Parameters<typeof rescheduleLesson>[1],
) {
  const lesson = await pairedLesson(db, input.lessonId);
  const first = await rescheduleLesson(db, input);
  if (!lesson.data.pairedLessonId) return first;
  const second = await rescheduleLesson(db, {
    ...input,
    lessonId: lesson.data.pairedLessonId,
  });
  const sharedLessonId = sharedPairLessonId(
    lesson.data.pairId!,
    input.newStartAt.toMillis(),
  );
  const batch = writeBatch(db);
  batch.update(doc(db, "lessons", first.newLessonId), {
    pairedLessonId: second.newLessonId,
    sharedLessonId,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "lessons", second.newLessonId), {
    pairedLessonId: first.newLessonId,
    sharedLessonId,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return first;
}

export async function cancelLessonSeriesForStudentOrPair(
  db: Firestore,
  input: Parameters<typeof cancelLessonSeries>[1],
) {
  const snapshot = await getDoc(doc(db, "lessonSeries", input.seriesId));
  if (!snapshot.exists()) throw new Error("Серия не найдена.");
  const series = snapshot.data() as LessonSeries;
  const first = await cancelLessonSeries(db, input);
  if (series.pairedSeriesId) {
    await cancelLessonSeries(db, { ...input, seriesId: series.pairedSeriesId });
  }
  return first;
}

export async function deleteLessonSeriesFutureForStudentOrPair(
  db: Firestore,
  input: Parameters<typeof deleteLessonSeriesFuture>[1],
) {
  const snapshot = await getDoc(doc(db, "lessonSeries", input.seriesId));
  if (!snapshot.exists()) throw new Error("Серия не найдена.");
  const series = snapshot.data() as LessonSeries;
  const first = await deleteLessonSeriesFuture(db, input);
  if (series.pairedSeriesId) {
    await deleteLessonSeriesFuture(db, { ...input, seriesId: series.pairedSeriesId });
  }
  return first;
}

export async function hardDeleteLessonForStudentOrPair(
  db: Firestore,
  input: Parameters<typeof hardDeleteLesson>[1],
) {
  const lesson = await pairedLesson(db, input.lessonId);
  const first = await hardDeleteLesson(db, input);
  if (lesson.data.pairedLessonId) {
    await hardDeleteLesson(db, { ...input, lessonId: lesson.data.pairedLessonId });
  }
  return first;
}

export async function changeRecurringSeriesFutureForStudentOrPair(
  db: Firestore,
  input: Parameters<typeof changeRecurringSeriesFuture>[1],
) {
  const seriesSnapshot = await getDoc(doc(db, "lessonSeries", input.seriesId));
  const lesson = await pairedLesson(db, input.effectiveLessonId);
  if (!seriesSnapshot.exists()) throw new Error("Серия не найдена.");
  const series = seriesSnapshot.data() as LessonSeries;
  const first = await changeRecurringSeriesFuture(db, input);
  if (!series.pairedSeriesId || !lesson.data.pairedLessonId) return first;
  const second = await changeRecurringSeriesFuture(db, {
    ...input,
    seriesId: series.pairedSeriesId,
    effectiveLessonId: lesson.data.pairedLessonId,
  });
  await linkSeriesAndLessons(
    db,
    input.teacherId,
    series.pairId!,
    first.nextSeriesId,
    second.nextSeriesId,
    series.studentId,
    series.pairedStudentId!,
  );
  return first;
}

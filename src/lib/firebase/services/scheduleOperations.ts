import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  where,
  type Firestore,
} from "firebase/firestore";
import type { Lesson, LessonSeries } from "../types.js";
import { materializeRollingLessonSeries } from "./materializeLessonSeries.js";

export type CancellationActor = "teacher" | "student";

export interface OperationResult {
  status: "applied" | "noop";
}

export interface CreateLessonSeriesInput {
  teacherId: string;
  studentId: string;
  studentProgramId: string | null;
  weekdays: number[];
  interval: number;
  startLocalTime: string;
  durationMinutes: number;
  baseTimezone: string;
  startsOn: string;
  endsOn: string | null;
}

export function lessonSeriesIdForSchedule(input: CreateLessonSeriesInput): string {
  const weekdayKey = [...input.weekdays].sort((left, right) => left - right).join("-");
  const timeKey = input.startLocalTime.replace(":", "");
  return `${input.studentId}__${input.startsOn}__w${weekdayKey}__${timeKey}__i${input.interval}`;
}

export async function createLessonSeries(
  db: Firestore,
  input: CreateLessonSeriesInput,
  now = new Date(),
): Promise<OperationResult & { seriesId: string; createdLessonIds: string[] }> {
  const seriesId = lessonSeriesIdForSchedule(input);
  const reference = doc(db, "lessonSeries", seriesId);
  const transactionResult = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists()) {
      const existing = snapshot.data() as LessonSeries;
      const existingWeekdays = [...existing.weekdays].sort((left, right) => left - right);
      const inputWeekdays = [...input.weekdays].sort((left, right) => left - right);
      const matches =
        existing.teacherId === input.teacherId &&
        existing.studentId === input.studentId &&
        existing.studentProgramId === input.studentProgramId &&
        existingWeekdays.join(",") === inputWeekdays.join(",") &&
        existing.frequency === "weekly" &&
        existing.startLocalTime === input.startLocalTime &&
        existing.startsOn === input.startsOn &&
        (existing.endsOn ?? null) === input.endsOn &&
        existing.interval === input.interval &&
        existing.durationMinutes === input.durationMinutes &&
        existing.baseTimezone === input.baseTimezone;
      if (!matches) throw new Error(`Lesson series ID collision: ${seriesId}`);
      return { status: "noop" as const, series: existing };
    }
    const series: LessonSeries = {
      ...input,
      frequency: "weekly",
      active: true,
      cancelledAt: null,
      cancelledBy: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      schemaVersion: 1,
    };
    transaction.set(reference, {
      ...series,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { status: "applied" as const, series };
  });
  const materialized = await materializeRollingLessonSeries(
    db,
    seriesId,
    transactionResult.series,
    now,
  );
  return {
    status: transactionResult.status,
    seriesId,
    createdLessonIds: materialized.createdIds,
  };
}

function cancellationStatus(actor: CancellationActor): Lesson["status"] {
  return actor === "teacher" ? "cancelled_teacher" : "cancelled_student";
}

export function rescheduledLessonId(lessonId: string, newStartAt: Timestamp): string {
  if (lessonId.includes("/")) throw new Error("A lesson document ID cannot contain a slash");
  return `${lessonId}__rescheduled__${newStartAt.toMillis()}`;
}

export async function rescheduleLesson(
  db: Firestore,
  input: { lessonId: string; newStartAt: Timestamp; newEndAt: Timestamp },
): Promise<OperationResult & { newLessonId: string }> {
  if (input.newEndAt.toMillis() <= input.newStartAt.toMillis()) {
    throw new Error("Rescheduled lesson end must be after start");
  }
  const originalReference = doc(db, "lessons", input.lessonId);
  const newLessonId = rescheduledLessonId(input.lessonId, input.newStartAt);
  const newReference = doc(db, "lessons", newLessonId);

  return runTransaction(db, async (transaction) => {
    const [originalSnapshot, newSnapshot] = await Promise.all([
      transaction.get(originalReference),
      transaction.get(newReference),
    ]);
    if (!originalSnapshot.exists()) throw new Error(`Lesson ${input.lessonId} does not exist`);
    const original = originalSnapshot.data() as Lesson;

    if (original.status === "rescheduled") {
      if (
        original.rescheduledToLessonId === newLessonId &&
        newSnapshot.exists() &&
        newSnapshot.data().rescheduledFromLessonId === input.lessonId
      ) {
        return { status: "noop" as const, newLessonId };
      }
      throw new Error("Lesson is already rescheduled to another occurrence");
    }
    if (original.status !== "planned") {
      throw new Error(`Only planned lessons can be rescheduled; received ${original.status}`);
    }
    if (newSnapshot.exists()) throw new Error(`Rescheduled lesson ID collision: ${newLessonId}`);

    transaction.update(originalReference, {
      status: "rescheduled",
      rescheduledToLessonId: newLessonId,
      updatedAt: serverTimestamp(),
    });
    transaction.set(newReference, {
      teacherId: original.teacherId,
      studentId: original.studentId,
      studentProgramId: original.studentProgramId,
      lessonSeriesId: original.lessonSeriesId,
      startAt: input.newStartAt,
      endAt: input.newEndAt,
      originalStartAt: original.originalStartAt ?? original.startAt,
      rescheduledFromLessonId: input.lessonId,
      rescheduledToLessonId: null,
      wasRescheduled: true,
      status: "planned",
      topic: original.topic,
      lessonSummary: original.lessonSummary,
      examTaskNumbers: original.examTaskNumbers ?? [],
      homeworkResolution: original.homeworkResolution ?? "pending",
      conferenceUrl: original.conferenceUrl ?? null,
      billingType: original.billingType ?? (original.paymentStatus === "free" ? "free" : "regular"),
      billingIdentityId: original.billingIdentityId ?? input.lessonId,
      paymentStatus: original.paymentStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
    return { status: "applied" as const, newLessonId };
  });
}

export async function cancelLesson(
  db: Firestore,
  lessonId: string,
  actor: CancellationActor,
): Promise<OperationResult> {
  const reference = doc(db, "lessons", lessonId);
  const nextStatus = cancellationStatus(actor);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error(`Lesson ${lessonId} does not exist`);
    const lesson = snapshot.data() as Lesson;
    if (lesson.status === nextStatus) return { status: "noop" as const };
    if (lesson.status !== "planned") {
      throw new Error(`Only planned lessons can be cancelled; received ${lesson.status}`);
    }
    transaction.update(reference, { status: nextStatus, updatedAt: serverTimestamp() });
    return { status: "applied" as const };
  });
}

export async function cancelLessonSeries(
  db: Firestore,
  input: {
    seriesId: string;
    teacherId: string;
    actor: CancellationActor;
    effectiveAt?: Timestamp;
  },
): Promise<OperationResult & { cancelledLessonIds: string[] }> {
  const effectiveAt = input.effectiveAt ?? Timestamp.now();
  const lessonQuery = query(
    collection(db, "lessons"),
    where("teacherId", "==", input.teacherId),
    where("lessonSeriesId", "==", input.seriesId),
    where("startAt", ">=", effectiveAt),
  );
  const candidateSnapshot = await getDocs(lessonQuery);
  const seriesReference = doc(db, "lessonSeries", input.seriesId);
  const nextStatus = cancellationStatus(input.actor);

  return runTransaction(db, async (transaction) => {
    const [seriesSnapshot, ...lessonSnapshots] = await Promise.all([
      transaction.get(seriesReference),
      ...candidateSnapshot.docs.map((candidate) => transaction.get(candidate.ref)),
    ]);
    if (!seriesSnapshot.exists()) throw new Error(`Lesson series ${input.seriesId} does not exist`);
    const series = seriesSnapshot.data() as LessonSeries;
    const cancelledLessonIds: string[] = [];
    for (const lessonSnapshot of lessonSnapshots) {
      if (!lessonSnapshot.exists()) continue;
      const lesson = lessonSnapshot.data() as Lesson;
      if (lesson.status !== "planned") continue;
      transaction.update(lessonSnapshot.ref, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      cancelledLessonIds.push(lessonSnapshot.id);
    }
    if (!series.active && series.cancelledBy === input.actor) {
      return { status: "noop" as const, cancelledLessonIds };
    }
    transaction.update(seriesReference, {
      active: false,
      cancelledAt: serverTimestamp(),
      cancelledBy: input.actor,
      updatedAt: serverTimestamp(),
    });
    return { status: "applied" as const, cancelledLessonIds };
  });
}

export async function updateLessonPaymentStatus(
  db: Firestore,
  lessonId: string,
  paymentStatus: Lesson["paymentStatus"],
): Promise<void> {
  await updateDoc(doc(db, "lessons", lessonId), {
    paymentStatus,
    updatedAt: serverTimestamp(),
  });
}

export async function createOneOffLesson(db: Firestore, input: {
  teacherId: string; studentId: string; studentProgramId: string | null;
  startAt: Timestamp; endAt: Timestamp; billingType?: "regular" | "free";
}): Promise<string> {
  if (input.endAt.toMillis() <= input.startAt.toMillis()) throw new Error("Lesson end must be after start");
  const reference = doc(collection(db, "lessons"));
  await runTransaction(db, async (transaction) => transaction.set(reference, {
    ...input, lessonSeriesId: null, originalStartAt: null, rescheduledFromLessonId: null,
    rescheduledToLessonId: null, status: "planned", topic: null,
    lessonSummary: { homeworkResultText: null, teacherComment: null, focusNotes: [] },
    understanding: null, examTaskNumbers: [], homeworkResolution: "pending", conferenceUrl: null,
    billingType: input.billingType ?? "regular", billingIdentityId: reference.id,
    paymentStatus: input.billingType === "free" ? "free" : "unpaid", wasRescheduled: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1,
  }));
  return reference.id;
}

function previousDate(localDate: string) {
  const value = new Date(`${localDate}T12:00:00Z`); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10);
}

export async function changeRecurringSeriesFuture(db: Firestore, input: { seriesId: string; teacherId: string; effectiveLessonId: string; startsOn: string; weekdays: number[]; startLocalTime: string; durationMinutes: number; baseTimezone: string; now?: Date }) {
  const effectiveLessonRef = doc(db, "lessons", input.effectiveLessonId);
  const effectiveSnapshot = await getDoc(effectiveLessonRef);
  if (!effectiveSnapshot.exists()) throw new Error("Effective lesson does not exist");
  const effectiveLesson = effectiveSnapshot.data() as Lesson;
  if (effectiveLesson.teacherId !== input.teacherId || effectiveLesson.lessonSeriesId !== input.seriesId) throw new Error("Series ownership mismatch");
  const candidates = await getDocs(query(collection(db, "lessons"), where("teacherId", "==", input.teacherId), where("lessonSeriesId", "==", input.seriesId), where("startAt", ">=", effectiveLesson.startAt)));
  const seriesRef = doc(db, "lessonSeries", input.seriesId);
  const newInput: CreateLessonSeriesInput = { teacherId: input.teacherId, studentId: effectiveLesson.studentId, studentProgramId: effectiveLesson.studentProgramId, weekdays: input.weekdays, interval: 1, startLocalTime: input.startLocalTime, durationMinutes: input.durationMinutes, baseTimezone: input.baseTimezone, startsOn: input.startsOn, endsOn: null };
  const nextSeriesId = lessonSeriesIdForSchedule(newInput);
  const nextSeriesRef = doc(db, "lessonSeries", nextSeriesId);
  const result = await runTransaction(db, async (transaction) => {
    const [seriesSnapshot, nextSeriesSnapshot, ...lessonSnapshots] = await Promise.all([transaction.get(seriesRef), transaction.get(nextSeriesRef), ...candidates.docs.map((item) => transaction.get(item.ref))]);
    if (!seriesSnapshot.exists()) throw new Error("Series does not exist");
    if (nextSeriesSnapshot.exists()) return { status: "noop" as const, series: nextSeriesSnapshot.data() as LessonSeries };
    const series = seriesSnapshot.data() as LessonSeries;
    if (series.teacherId !== input.teacherId) throw new Error("Series ownership mismatch");
    transaction.update(seriesRef, { active: false, endsOn: previousDate(input.startsOn), updatedAt: serverTimestamp() });
    lessonSnapshots.forEach((snapshot) => { if (snapshot.exists() && (snapshot.data() as Lesson).status === "planned") transaction.update(snapshot.ref, { status: "cancelled_teacher", updatedAt: serverTimestamp() }); });
    const nextSeries: LessonSeries = { ...newInput, frequency: "weekly", active: true, cancelledAt: null, cancelledBy: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), schemaVersion: 1 };
    transaction.set(nextSeriesRef, { ...nextSeries, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return { status: "applied" as const, series: nextSeries };
  });
  const materialized = await materializeRollingLessonSeries(db, nextSeriesId, result.series, input.now ?? new Date());
  return { status: result.status, nextSeriesId, createdLessonIds: materialized.createdIds };
}

export async function markLessonsPaid(db: Firestore, lessonIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  [...new Set(lessonIds)].forEach((lessonId) => batch.update(doc(db, "lessons", lessonId), { paymentStatus: "paid", updatedAt: serverTimestamp() }));
  await batch.commit();
}

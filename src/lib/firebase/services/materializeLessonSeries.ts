import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type Firestore,
  type Timestamp,
} from "firebase/firestore";
import type { Lesson } from "../types.js";
import type { LessonSeries } from "../types.js";
import { generateRollingOccurrences } from "../../../features/schedule/recurrence.js";

const MAX_OCCURRENCES_PER_TRANSACTION = 120;

export interface LessonOccurrence {
  startAt: Timestamp;
  endAt: Timestamp;
}

export interface MaterializeLessonSeriesInput {
  seriesId: string;
  teacherId: string;
  studentId: string;
  studentProgramId: string | null;
  pairId?: string | null;
  pairedStudentId?: string | null;
  pairedSeriesId?: string | null;
  pairPrimary?: boolean;
  occurrences: LessonOccurrence[];
  paymentStatus?: Lesson["paymentStatus"];
}

export interface MaterializeLessonSeriesResult {
  createdIds: string[];
  skippedIds: string[];
  suppressedIds: string[];
}

const rollingMaterializations = new Map<
  string,
  Promise<MaterializeLessonSeriesResult>
>();

export function lessonIdForOccurrence(seriesId: string, startAt: Timestamp): string {
  if (seriesId.includes("/")) {
    throw new Error("A Firestore lessonSeries document ID cannot contain a slash");
  }

  return `${seriesId}__${startAt.toMillis()}`;
}

export async function materializeLessonSeries(
  db: Firestore,
  input: MaterializeLessonSeriesInput,
): Promise<MaterializeLessonSeriesResult> {
  const uniqueOccurrences = new Map(
    input.occurrences.map((occurrence) => [
      lessonIdForOccurrence(input.seriesId, occurrence.startAt),
      occurrence,
    ]),
  );

  if (uniqueOccurrences.size > MAX_OCCURRENCES_PER_TRANSACTION) {
    throw new Error(
      `At most ${MAX_OCCURRENCES_PER_TRANSACTION} lesson occurrences may be materialized at once`,
    );
  }

  const lessonEntries = [...uniqueOccurrences.entries()].map(([id, occurrence]) => ({
    id,
    occurrence,
    reference: doc(collection(db, "lessons"), id),
    exclusionReference: doc(collection(db, "lessonOccurrenceExclusions"), id),
  }));

  return runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(
      lessonEntries.map(({ reference }) => transaction.get(reference)),
    );
    const exclusionSnapshots = await Promise.all(
      lessonEntries.map(({ exclusionReference }) => transaction.get(exclusionReference)),
    );
    const createdIds: string[] = [];
    const skippedIds: string[] = [];
    const suppressedIds: string[] = [];

    lessonEntries.forEach(({ id, occurrence, reference }, index) => {
      const snapshot = snapshots[index];
      const exclusionSnapshot = exclusionSnapshots[index];

      if (!snapshot) {
        throw new Error(`Missing transaction snapshot for lesson ${id}`);
      }

      if (exclusionSnapshot?.exists()) {
        const exclusion = exclusionSnapshot.data();
        if (
          exclusion.lessonSeriesId !== input.seriesId ||
          exclusion.occurrenceStartAt.toMillis() !== occurrence.startAt.toMillis()
        ) {
          throw new Error(`Lesson occurrence exclusion collision: ${id}`);
        }
        suppressedIds.push(id);
        return;
      }

      if (snapshot.exists()) {
        const existing = snapshot.data() as Pick<Lesson, "lessonSeriesId" | "startAt">;
        if (
          existing.lessonSeriesId !== input.seriesId ||
          existing.startAt.toMillis() !== occurrence.startAt.toMillis()
        ) {
          throw new Error(`Deterministic lesson ID collision: ${id}`);
        }
        skippedIds.push(id);
        return;
      }

      transaction.set(reference, {
        teacherId: input.teacherId,
        studentId: input.studentId,
        studentProgramId: input.studentProgramId,
        lessonSeriesId: input.seriesId,
        pairId: input.pairId ?? null,
        pairedStudentId: input.pairedStudentId ?? null,
        pairedLessonId: input.pairedSeriesId
          ? lessonIdForOccurrence(input.pairedSeriesId, occurrence.startAt)
          : null,
        sharedLessonId: input.pairId
          ? `${input.pairId}__lesson__${occurrence.startAt.toMillis()}`
          : null,
        pairPrimary: input.pairPrimary ?? false,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
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
        examTaskNumbers: [],
        homeworkResolution: "pending",
        conferenceUrl: null,
        billingType: "regular",
        billingIdentityId: id,
        paymentStatus: input.paymentStatus ?? "unpaid",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        schemaVersion: 1,
      });
      createdIds.push(id);
    });

    return { createdIds, skippedIds, suppressedIds };
  });
}

export function materializeRollingLessonSeries(
  db: Firestore,
  seriesId: string,
  series: LessonSeries,
  now = new Date(),
): Promise<MaterializeLessonSeriesResult> {
  if (!series.active)
    return Promise.resolve({ createdIds: [], skippedIds: [], suppressedIds: [] });
  const key = `${db.app.options.projectId ?? "local"}:${seriesId}`;
  const inFlight = rollingMaterializations.get(key);
  if (inFlight) return inFlight;
  const occurrences = generateRollingOccurrences(series, now);
  const operation = materializeLessonSeries(db, {
    seriesId,
    teacherId: series.teacherId,
    studentId: series.studentId,
    studentProgramId: series.studentProgramId,
    pairId: series.pairId ?? null,
    pairedStudentId: series.pairedStudentId ?? null,
    pairedSeriesId: series.pairedSeriesId ?? null,
    pairPrimary:
      Boolean(series.pairId) &&
      Boolean(series.pairedStudentId) &&
      series.studentId.localeCompare(series.pairedStudentId!) < 0,
    occurrences,
  }).then(async (result) => {
    const through = occurrences.at(-1)?.startAt ?? null;
    if (through) {
      await updateDoc(doc(db, "lessonSeries", seriesId), {
        materializedThrough: through,
        materializedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return result;
  }).finally(() => {
    if (rollingMaterializations.get(key) === operation)
      rollingMaterializations.delete(key);
  });
  rollingMaterializations.set(key, operation);
  return operation;
}

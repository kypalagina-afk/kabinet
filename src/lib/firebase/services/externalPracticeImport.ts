import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { ExamKind, ExternalPracticeAttempt } from "../types";

export interface ExternalPracticeImportRow {
  taskNumber: number;
  practicedAt: Date;
  score: number;
  maxScore: number;
  status: ExternalPracticeAttempt["status"];
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

export async function importExternalPracticeAttempts(
  db: Firestore,
  input: {
    teacherId: string;
    studentId: string;
    studentProgramId: string;
    examBlueprintId: string;
    examKind: ExamKind;
    rows: ExternalPracticeImportRow[];
  },
): Promise<{ added: number; skipped: number }> {
  if (!input.rows.length) throw new Error("Нет попыток для импорта");
  if (input.rows.length > 200) throw new Error("За один раз можно импортировать не более 200 попыток");
  const prepared = await Promise.all(input.rows.map(async (row) => {
    if (
      !Number.isInteger(row.taskNumber)
      || row.taskNumber <= 0
      || !Number.isFinite(row.score)
      || !Number.isFinite(row.maxScore)
      || row.score < 0
      || row.maxScore <= 0
      || row.score > row.maxScore
      || Number.isNaN(row.practicedAt.getTime())
    ) throw new Error("В импорте обнаружена некорректная попытка");
    const sourceRecordId = await sha256([
      "russian100",
      input.studentId,
      input.examBlueprintId,
      row.taskNumber,
      row.practicedAt.toISOString(),
      row.score,
      row.maxScore,
      row.status,
    ].join("|"));
    return {
      row,
      sourceRecordId,
      reference: doc(db, "externalPracticeAttempts", `russian100_${sourceRecordId}`),
    };
  }));
  const existingSnapshot = await getDocs(query(
    collection(db, "externalPracticeAttempts"),
    where("teacherId", "==", input.teacherId),
    where("studentId", "==", input.studentId),
  ));
  const existingSourceIds = new Set(
    existingSnapshot.docs.map((item) => String(item.data().sourceRecordId ?? "")),
  );
  const pending = prepared.filter(({ sourceRecordId }) => !existingSourceIds.has(sourceRecordId));
  if (!pending.length) return { added: 0, skipped: prepared.length };
  const batch = writeBatch(db);
  for (const { row, sourceRecordId, reference } of pending) {
    batch.set(reference, {
      teacherId: input.teacherId,
      studentId: input.studentId,
      studentProgramId: input.studentProgramId,
      examBlueprintId: input.examBlueprintId,
      provider: "russian100",
      examKind: input.examKind,
      taskNumber: row.taskNumber,
      score: row.score,
      maxScore: row.maxScore,
      accuracy: Math.round((row.score / row.maxScore) * 10_000) / 100,
      status: row.status,
      practicedAt: Timestamp.fromDate(row.practicedAt),
      importedAt: serverTimestamp(),
      importMethod: "manual",
      sourceRecordId,
      sourceUrl: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
  }
  batch.set(doc(collection(db, "teacherAuditEvents")), {
    teacherId: input.teacherId,
    studentId: input.studentId,
    entityType: "externalPracticeImport",
    entityId: pending[0]!.sourceRecordId,
    action: "russian100_manual_import",
    summary: `Импортировано попыток Русский100: ${pending.length}`,
    createdAt: serverTimestamp(),
    schemaVersion: 1,
  });
  await batch.commit();
  return { added: pending.length, skipped: prepared.length - pending.length };
}

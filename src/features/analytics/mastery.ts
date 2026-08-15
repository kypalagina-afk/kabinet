import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch, type Firestore } from "firebase/firestore";
import { useEffect, useState } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import type { CoverageState, DocumentWithId, StudentTaskCoverage, StudentTaskMasteryPublic, TaskMasteryOverride } from "../../lib/firebase/types";

export function useTaskMasteryPublic(studentId: string, teacherId = "") {
  const [data, setData] = useState<Array<DocumentWithId<StudentTaskMasteryPublic>>>([]);
  useEffect(() => { if (!studentId) return; const constraints = [where("studentId", "==", studentId)]; if (teacherId) constraints.push(where("teacherId", "==", teacherId)); return onSnapshot(query(collection(getFirebaseDb(), "studentTaskMasteryPublic"), ...constraints), (snapshot) => setData(snapshot.docs.map((item) => ({ id: item.id, data: item.data() as StudentTaskMasteryPublic })))); }, [studentId, teacherId]);
  return data;
}
export function useTeacherMasteryOverrides(teacherId: string, studentId: string) {
  const [data, setData] = useState<Array<DocumentWithId<TaskMasteryOverride>>>([]);
  useEffect(() => { if (!teacherId || !studentId) return; return onSnapshot(query(collection(getFirebaseDb(), "taskMasteryOverrides"), where("teacherId", "==", teacherId), where("studentId", "==", studentId)), (snapshot) => setData(snapshot.docs.map((item) => ({ id: item.id, data: item.data() as TaskMasteryOverride })))); }, [studentId, teacherId]);
  return data;
}
export async function saveMasteryOverride(db: Firestore, input: { teacherId: string; studentId: string; studentProgramId: string; taskNumber: number; autoMastery: number; manualOverride: number | null; evidenceCount: number; confidence: number }) {
  const id = `${input.studentProgramId}__task__${input.taskNumber}`; const effective = input.manualOverride ?? input.autoMastery; const batch = writeBatch(db); const shared = { teacherId: input.teacherId, studentId: input.studentId, studentProgramId: input.studentProgramId, taskNumber: input.taskNumber, effectiveMastery: effective, evidenceCount: input.evidenceCount, lastEvidenceAt: null, confidence: input.confidence, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1 };
  batch.set(doc(db, "taskMasteryOverrides", id), { ...shared, autoMastery: input.autoMastery, manualOverride: input.manualOverride, privateReason: null, changedAt: serverTimestamp() }, { merge: true });
  batch.set(doc(db, "studentTaskMasteryPublic", id), shared, { merge: true });
  batch.set(doc(collection(db, "teacherAuditEvents")), { teacherId: input.teacherId, studentId: input.studentId, entityType: "taskMastery", entityId: id, action: input.manualOverride === null ? "override_removed" : "override_changed", summary: `№${input.taskNumber}: ${input.autoMastery}% → ${effective}%`, createdAt: serverTimestamp(), schemaVersion: 1 });
  await batch.commit();
}

export function useStudentTaskCoverage(studentId: string, teacherId = "") {
  const [data, setData] = useState<Array<DocumentWithId<StudentTaskCoverage>>>([]);
  useEffect(() => { if (!studentId) return; const constraints = [where("studentId", "==", studentId)]; if (teacherId) constraints.push(where("teacherId", "==", teacherId)); return onSnapshot(query(collection(getFirebaseDb(), "studentTaskCoverage"), ...constraints), (snapshot) => setData(snapshot.docs.map((item) => ({ id: item.id, data: item.data() as StudentTaskCoverage })))); }, [studentId, teacherId]);
  return data;
}

export function useTeacherTaskCoverage(teacherId: string) {
  const [data, setData] = useState<Array<DocumentWithId<StudentTaskCoverage>>>([]);
  useEffect(() => { if (!teacherId) return; return onSnapshot(query(collection(getFirebaseDb(), "studentTaskCoverage"), where("teacherId", "==", teacherId)), (snapshot) => setData(snapshot.docs.map((item) => ({ id: item.id, data: item.data() as StudentTaskCoverage })))); }, [teacherId]);
  return data;
}

export async function saveTaskCoverage(db: Firestore, input: { teacherId: string; studentId: string; studentProgramId: string; taskNumber: number; state: CoverageState }) {
  const id = `${input.studentProgramId}__task__${input.taskNumber}`;
  await writeBatch(db).set(doc(db, "studentTaskCoverage", id), { ...input, sourceLessonIds: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1 }, { merge: true }).commit();
}

import type { Firestore } from "firebase-admin/firestore";

export async function findStudentsByName(db: Firestore, teacherId: string, text: string) {
  const snapshot = await db.collection("students").where("teacherId", "==", teacherId).limit(100).get();
  const normalized = text.toLocaleLowerCase("ru-RU");
  return snapshot.docs.filter((document) => document.data().status === "active" && normalized.includes(String(document.data().displayName ?? "").toLocaleLowerCase("ru-RU"))).map((document) => ({ id: document.id, displayName: String(document.data().displayName ?? "") }));
}

export async function getTeacherScheduleRange(db: Firestore, teacherId: string, startMillis: number, endMillis: number) {
  const snapshot = await db.collection("lessons").where("teacherId", "==", teacherId).where("startAt", ">=", new Date(startMillis)).where("startAt", "<", new Date(endMillis)).limit(80).get();
  return snapshot.docs.map((document) => { const data = document.data(); return { id: document.id, studentId: data.studentId, startAtMillis: data.startAt.toMillis(), endAtMillis: data.endAt.toMillis(), updatedAtMillis: data.updatedAt?.toMillis?.() ?? null, status: data.status, topic: data.topic ?? null }; });
}

export async function getLessonById(db: Firestore, teacherId: string, lessonId: string) {
  const snapshot = await db.doc(`lessons/${lessonId}`).get();
  return snapshot.exists && snapshot.data()?.teacherId === teacherId ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function getStudentUpcomingLessons(db: Firestore, teacherId: string, studentId: string, nowMillis: number) {
  const snapshot = await db.collection("lessons").where("teacherId", "==", teacherId).where("studentId", "==", studentId).where("startAt", ">=", new Date(nowMillis)).orderBy("startAt").limit(20).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}

export async function getPlannerItemsRange(db: Firestore, teacherId: string, startDate: string, endDate: string) {
  const snapshot = await db.collection("plannerItems").where("teacherId", "==", teacherId).limit(2000).get();
  return snapshot.docs.filter((document) => { const data = document.data(); return data.active === true && data.recordType !== "recurrence" && typeof data.date === "string" && data.date >= startDate && data.date <= endDate; }).sort((left, right) => { const a = left.data(); const b = right.data(); return String(a.date).localeCompare(String(b.date)) || String(a.startTime ?? "").localeCompare(String(b.startTime ?? "")); }).slice(0, 80).map((document) => { const data = document.data(); return { id: document.id, title: data.title, category: data.category, date: data.date, startTime: data.startTime, priority: data.priority, updatedAtMillis: data.updatedAt?.toMillis?.() ?? null }; });
}

export async function getActiveHomework(db: Firestore, teacherId: string, studentId: string) {
  const snapshot = await db.collection("homeworks").where("teacherId", "==", teacherId).limit(500).get();
  return snapshot.docs.filter((document) => document.data().studentId === studentId && ["assigned", "in_progress", "submitted"].includes(document.data().status)).slice(0, 30).map((document) => ({ id: document.id, title: document.data().title, dueDate: document.data().dueDate ?? null, status: document.data().status }));
}

export async function getPendingHomeworkReviews(db: Firestore, teacherId: string) {
  const snapshot = await db.collection("homeworkSubmissions").where("teacherId", "==", teacherId).limit(500).get();
  return snapshot.docs.filter((document) => document.data().status === "submitted").slice(0, 50).map((document) => ({ id: document.id, studentId: document.data().studentId, homeworkId: document.data().homeworkId }));
}

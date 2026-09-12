import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where, type Firestore } from "firebase/firestore";
import type { Homework, Lesson } from "../types.js";

export async function updateLessonHomeworkAssignment(db: Firestore, input: {
  teacherId: string;
  lessonId: string;
  mode: "link" | "external" | "not_required" | "pending" | "unlink";
  homeworkId?: string;
}) {
  const lessonRef = doc(db, "lessons", input.lessonId);
  // Include legacy assignments whose lesson has no direct homework pointer.
  const linked = await getDocs(query(collection(db, "homeworks"), where("teacherId", "==", input.teacherId), where("sourceLessonId", "==", input.lessonId)));
  return runTransaction(db, async (transaction) => {
    const lessonSnapshot = await transaction.get(lessonRef);
    if (!lessonSnapshot.exists()) throw new Error("Урок не найден.");
    const lesson = lessonSnapshot.data() as Lesson;
    if (lesson.teacherId !== input.teacherId || lesson.status !== "completed" || lesson.pairReplaced)
      throw new Error("Изменять отметку ДЗ можно только у своего проведённого урока.");
    const ids = [...new Set([
      ...linked.docs.map((item) => item.id),
      `lesson-homework__${input.lessonId}`,
      ...(lesson.linkedHomeworkId ? [lesson.linkedHomeworkId] : []),
      ...(input.homeworkId ? [input.homeworkId] : []),
    ])];
    const snapshots = await Promise.all(ids.map((id) => transaction.get(doc(db, "homeworks", id))));
    const assignments = snapshots.filter((snapshot) => snapshot.exists() && (snapshot.data() as Homework).sourceLessonId === input.lessonId && !(snapshot.data() as Homework).draft);
    if (assignments.some((snapshot) => {
      const homework = snapshot.data() as Homework;
      return homework.teacherId !== input.teacherId || homework.studentId !== lesson.studentId;
    })) throw new Error("Связь ДЗ и ученика требует проверки.");

    if (input.mode === "link" || input.mode === "unlink") {
      const target = snapshots.find((snapshot) => snapshot.id === input.homeworkId);
      if (!target?.exists()) throw new Error("Выберите существующее ДЗ.");
      const homework = target.data() as Homework;
      if (homework.teacherId !== input.teacherId || homework.studentId !== lesson.studentId || homework.studentProgramId !== lesson.studentProgramId || homework.draft)
        throw new Error("Выберите выданное ДЗ этого ученика по программе урока.");
      if (input.mode === "link") {
        if (homework.sourceLessonId && homework.sourceLessonId !== input.lessonId)
          throw new Error("Это ДЗ уже связано с другим уроком.");
        if (assignments.some((snapshot) => snapshot.id !== target.id))
          throw new Error("Сначала снимите связь с другим ДЗ этого урока.");
        transaction.update(target.ref, { sourceLessonId: input.lessonId, updatedAt: serverTimestamp() });
        transaction.update(lessonRef, { homeworkResolution: "assigned", linkedHomeworkId: target.id, homeworkAssignedExternally: false,
          plannerWrapUpCompletedAt: lesson.plannerWrapUpCompletedAt ?? serverTimestamp(), updatedAt: serverTimestamp() });
      } else {
        if (homework.sourceLessonId !== input.lessonId) throw new Error("Это ДЗ не связано с выбранным уроком.");
        const remaining = assignments.filter((snapshot) => snapshot.id !== target.id);
        transaction.update(target.ref, { sourceLessonId: null, updatedAt: serverTimestamp() });
        transaction.update(lessonRef, { homeworkResolution: remaining.length ? "assigned" : "pending", linkedHomeworkId: remaining[0]?.id ?? null,
          homeworkAssignedExternally: false, plannerWrapUpCompletedAt: remaining.length ? lesson.plannerWrapUpCompletedAt ?? serverTimestamp() : null, updatedAt: serverTimestamp() });
      }
      return;
    }
    if (assignments.length) throw new Error("К уроку привязано ДЗ. Сначала снимите связь — само задание сохранится.");
    const resolution = input.mode === "external" ? "assigned" : input.mode;
    transaction.update(lessonRef, { homeworkResolution: resolution, linkedHomeworkId: null, homeworkAssignedExternally: input.mode === "external",
      plannerWrapUpCompletedAt: resolution === "pending" ? null : lesson.plannerWrapUpCompletedAt ?? serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

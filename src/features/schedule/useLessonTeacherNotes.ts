import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import type { DocumentWithId, LessonTeacherNote } from "../../lib/firebase/types";

export function useLessonTeacherNotes(teacherId: string, studentId: string) {
  const [data, setData] = useState<Array<DocumentWithId<LessonTeacherNote>>>([]);
  useEffect(() => { if (!teacherId || !studentId) return; return onSnapshot(query(collection(getFirebaseDb(), "lessonTeacherNotes"), where("teacherId", "==", teacherId), where("studentId", "==", studentId)), (snapshot) => setData(snapshot.docs.map((item) => ({ id: item.id, data: item.data() as LessonTeacherNote })))); }, [studentId, teacherId]);
  return data;
}

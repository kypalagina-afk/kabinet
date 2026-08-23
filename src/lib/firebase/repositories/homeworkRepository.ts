import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  DocumentWithId,
  Homework,
  HomeworkSubmission,
  Student,
} from "../types";
import type { RealtimeObserver } from "./verticalSliceRepository";

export interface TeacherHomeworkBoard {
  students: Array<DocumentWithId<Student>>;
  homeworks: Array<DocumentWithId<Homework>>;
  submissions: Array<DocumentWithId<HomeworkSubmission>>;
}

function mapped<T>(documents: Array<{ id: string; data(): DocumentData }>) {
  return documents.map((snapshot) => ({
    id: snapshot.id,
    data: snapshot.data() as T,
  }));
}

export function subscribeTeacherHomeworkBoard(
  db: Firestore,
  teacherId: string,
  observer: RealtimeObserver<TeacherHomeworkBoard>,
  pageSize = 100,
): Unsubscribe {
  let state: TeacherHomeworkBoard = {
    students: [],
    homeworks: [],
    submissions: [],
  };
  const emit = (patch: Partial<TeacherHomeworkBoard>) => {
    state = { ...state, ...patch };
    observer.next(state);
  };
  const error = (value: Error) => observer.error(value);
  const stops = [
    onSnapshot(
      query(collection(db, "students"), where("teacherId", "==", teacherId)),
      (snapshot) => emit({ students: mapped<Student>(snapshot.docs) }),
      error,
    ),
    onSnapshot(
      query(collection(db, "homeworks"), where("teacherId", "==", teacherId), orderBy("assignedAt", "desc"), limit(pageSize)),
      (snapshot) => emit({ homeworks: mapped<Homework>(snapshot.docs) }),
      error,
    ),
    onSnapshot(
      query(
        collection(db, "homeworkSubmissions"),
        where("teacherId", "==", teacherId),
        orderBy("updatedAt", "desc"),
        limit(Math.max(pageSize * 2, 100)),
      ),
      (snapshot) =>
        emit({ submissions: mapped<HomeworkSubmission>(snapshot.docs) }),
      error,
    ),
  ];
  return () => stops.forEach((stop) => stop());
}

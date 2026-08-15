import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  DocumentWithId,
  Lesson,
  LessonSeries,
  Student,
  StudentProgram,
  UserProfile,
} from "../types.js";
import type { RealtimeObserver } from "./verticalSliceRepository.js";

export interface TeacherScheduleSnapshot {
  students: Array<DocumentWithId<Student>>;
  lessons: Array<DocumentWithId<Lesson>>;
  series: Array<DocumentWithId<LessonSeries>>;
  studentTimezones: Record<string, UserProfile["timezone"]>;
}

function mapped<T>(documents: Array<{ id: string; data(): DocumentData }>) {
  return documents.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() as T }));
}

export function subscribeTeacherSchedule(
  db: Firestore,
  teacherId: string,
  range: { start: Date; end: Date },
  observer: RealtimeObserver<TeacherScheduleSnapshot>,
): Unsubscribe {
  let state: TeacherScheduleSnapshot = {
    students: [],
    lessons: [],
    series: [],
    studentTimezones: {},
  };
  const timezoneStops = new Map<string, Unsubscribe>();
  const emit = (patch: Partial<TeacherScheduleSnapshot>) => {
    state = { ...state, ...patch };
    observer.next(state);
  };
  const reportError = (error: Error) => observer.error(error);

  const stops: Unsubscribe[] = [
    onSnapshot(
      query(collection(db, "students"), where("teacherId", "==", teacherId)),
      (snapshot) => {
        const students = mapped<Student>(snapshot.docs).sort((left, right) =>
          left.data.displayName.localeCompare(right.data.displayName, "ru"),
        );
        const activeIds = new Set(students.map(({ id }) => id));
        for (const [studentId, stop] of timezoneStops) {
          if (!activeIds.has(studentId)) {
            stop();
            timezoneStops.delete(studentId);
          }
        }
        for (const { id: studentId } of students) {
          if (timezoneStops.has(studentId)) continue;
          timezoneStops.set(
            studentId,
            onSnapshot(
              doc(db, "users", studentId),
              (userSnapshot) => {
                if (!userSnapshot.exists()) return;
                emit({
                  studentTimezones: {
                    ...state.studentTimezones,
                    [studentId]: (userSnapshot.data() as UserProfile).timezone,
                  },
                });
              },
              reportError,
            ),
          );
        }
        emit({ students });
      },
      reportError,
    ),
    onSnapshot(
      query(
        collection(db, "lessons"),
        where("teacherId", "==", teacherId),
        where("startAt", ">=", Timestamp.fromDate(range.start)),
        where("startAt", "<", Timestamp.fromDate(range.end)),
        orderBy("startAt", "asc"),
      ),
      (snapshot) => emit({ lessons: mapped<Lesson>(snapshot.docs) }),
      reportError,
    ),
    onSnapshot(
      query(collection(db, "lessonSeries"), where("teacherId", "==", teacherId)),
      (snapshot) => emit({ series: mapped<LessonSeries>(snapshot.docs) }),
      reportError,
    ),
  ];

  return () => {
    stops.forEach((stop) => stop());
    timezoneStops.forEach((stop) => stop());
  };
}

export function subscribeNextStudentLesson(
  db: Firestore,
  studentId: string,
  observer: RealtimeObserver<DocumentWithId<Lesson> | null>,
  now = new Date(),
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, "lessons"),
      where("studentId", "==", studentId),
      where("status", "==", "planned"),
      where("startAt", ">=", Timestamp.fromDate(now)),
      orderBy("startAt", "asc"),
      limit(1),
    ),
    (snapshot) => {
      const first = snapshot.docs[0];
      observer.next(first ? { id: first.id, data: first.data() as Lesson } : null);
    },
    (error) => observer.error(error),
  );
}

export async function findActiveStudentProgramId(
  db: Firestore,
  teacherId: string,
  studentId: string,
): Promise<string | null> {
  const snapshot = await getDocs(
    query(
      collection(db, "studentPrograms"),
      where("teacherId", "==", teacherId),
      where("studentId", "==", studentId),
    ),
  );
  return (
    mapped<StudentProgram>(snapshot.docs).find(({ data }) => data.status === "active")?.id ?? null
  );
}

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  DocumentWithId,
  ExamBlueprint,
  Homework,
  HomeworkSubmission,
  Lesson,
  MockExam,
  ProgramProfile,
  Student,
  StudentProgram,
  UserProfile,
} from "../types";

export interface StudentWorkspaceSnapshot {
  student: DocumentWithId<Student> | null;
  studentProgram: DocumentWithId<StudentProgram> | null;
  programProfile: DocumentWithId<ProgramProfile> | null;
  examBlueprint: DocumentWithId<ExamBlueprint> | null;
  studentUser: DocumentWithId<UserProfile> | null;
  lessons: Array<DocumentWithId<Lesson>>;
  homeworks: Array<DocumentWithId<Homework>>;
  homeworkSubmissions: Array<DocumentWithId<HomeworkSubmission>>;
  mockExams: Array<DocumentWithId<MockExam>>;
}

export interface RealtimeObserver<T> {
  next(value: T): void;
  error(error: Error): void;
}

const emptyWorkspace: StudentWorkspaceSnapshot = {
  student: null,
  studentProgram: null,
  programProfile: null,
  examBlueprint: null,
  studentUser: null,
  lessons: [],
  homeworks: [],
  homeworkSubmissions: [],
  mockExams: [],
};

function mapDocuments<T>(documents: Array<{ id: string; data(): DocumentData }>) {
  return documents.map((snapshot) => ({
    id: snapshot.id,
    data: snapshot.data() as T,
  }));
}

export function subscribeTeacherStudents(
  db: Firestore,
  teacherId: string,
  observer: RealtimeObserver<Array<DocumentWithId<Student>>>,
): Unsubscribe {
  const studentsQuery = query(
    collection(db, "students"),
    where("teacherId", "==", teacherId),
  );

  return onSnapshot(
    studentsQuery,
    (snapshot) => {
      const students = mapDocuments<Student>(snapshot.docs).sort((left, right) =>
        left.data.displayName.localeCompare(right.data.displayName, "ru"),
      );
      observer.next(students);
    },
    (error) => observer.error(error),
  );
}

export function subscribeTeacherStudentPrograms(
  db: Firestore,
  teacherId: string,
  observer: RealtimeObserver<Array<DocumentWithId<StudentProgram>>>,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "studentPrograms"), where("teacherId", "==", teacherId)),
    (snapshot) => observer.next(mapDocuments<StudentProgram>(snapshot.docs)),
    observer.error,
  );
}

export function subscribeTeacherMockExams(db: Firestore, teacherId: string, observer: RealtimeObserver<Array<DocumentWithId<MockExam>>>): Unsubscribe {
  return onSnapshot(query(collection(db, "mockExams"), where("teacherId", "==", teacherId)), (snapshot) => observer.next(mapDocuments<MockExam>(snapshot.docs)), observer.error);
}

function ownedQuery(
  db: Firestore,
  collectionName:
    | "studentPrograms"
    | "lessons"
    | "homeworks"
    | "homeworkSubmissions"
    | "mockExams",
  studentId: string,
  teacherId?: string,
): Query<DocumentData, DocumentData> {
  const constraints: QueryConstraint[] = [where("studentId", "==", studentId)];
  if (teacherId) {
    constraints.push(where("teacherId", "==", teacherId));
  }
  return query(collection(db, collectionName), ...constraints);
}

function subscribeWorkspace(
  db: Firestore,
  studentId: string,
  observer: RealtimeObserver<StudentWorkspaceSnapshot>,
  teacherId?: string,
): Unsubscribe {
  let state: StudentWorkspaceSnapshot = { ...emptyWorkspace };
  let stopProgramProfile: Unsubscribe | null = null;
  let stopExamBlueprint: Unsubscribe | null = null;
  let activeProgramProfileId: string | null = null;
  const emit = (patch: Partial<StudentWorkspaceSnapshot>) => {
    state = { ...state, ...patch };
    observer.next(state);
  };
  const reportError = (error: Error) => observer.error(error);

  const unsubscribes: Unsubscribe[] = [
    onSnapshot(
      doc(db, "users", studentId),
      (snapshot) => emit({ studentUser: snapshot.exists() ? { id: snapshot.id, data: snapshot.data() as UserProfile } : null }),
      reportError,
    ),
    onSnapshot(
      doc(db, "students", studentId),
      (snapshot) =>
        emit({
          student: snapshot.exists()
            ? { id: snapshot.id, data: snapshot.data() as Student }
            : null,
        }),
      reportError,
    ),
    onSnapshot(
      ownedQuery(db, "studentPrograms", studentId, teacherId),
      (snapshot) => {
        const programs = mapDocuments<StudentProgram>(snapshot.docs);
        const activeProgram =
          programs.find((program) => program.data.status === "active") ?? programs[0] ?? null;
        emit({ studentProgram: activeProgram });

        const nextProfileId = activeProgram?.data.programProfileId ?? null;
        if (nextProfileId === activeProgramProfileId) {
          return;
        }

        stopProgramProfile?.();
        stopProgramProfile = null;
        stopExamBlueprint?.();
        stopExamBlueprint = null;
        activeProgramProfileId = nextProfileId;
        emit({ programProfile: null, examBlueprint: null });

        if (nextProfileId) {
          stopProgramProfile = onSnapshot(
            doc(db, "programProfiles", nextProfileId),
            (profileSnapshot) =>
              {
                const profile = profileSnapshot.exists()
                  ? {
                      id: profileSnapshot.id,
                      data: profileSnapshot.data() as ProgramProfile,
                    }
                  : null;
                emit({ programProfile: profile, examBlueprint: null });
                stopExamBlueprint?.();
                stopExamBlueprint = null;
                const blueprintId = profile?.data.examBlueprintId;
                if (blueprintId) {
                  stopExamBlueprint = onSnapshot(
                    doc(db, "examBlueprints", blueprintId),
                    (blueprintSnapshot) =>
                      emit({
                        examBlueprint: blueprintSnapshot.exists()
                          ? {
                              id: blueprintSnapshot.id,
                              data: blueprintSnapshot.data() as ExamBlueprint,
                            }
                          : null,
                      }),
                    reportError,
                  );
                }
              },
            reportError,
          );
        }
      },
      reportError,
    ),
    onSnapshot(
      ownedQuery(db, "lessons", studentId, teacherId),
      (snapshot) => emit({ lessons: mapDocuments<Lesson>(snapshot.docs) }),
      reportError,
    ),
    onSnapshot(
      ownedQuery(db, "homeworks", studentId, teacherId),
      (snapshot) => emit({ homeworks: mapDocuments<Homework>(snapshot.docs) }),
      reportError,
    ),
    onSnapshot(
      ownedQuery(db, "homeworkSubmissions", studentId, teacherId),
      (snapshot) =>
        emit({
          homeworkSubmissions: mapDocuments<HomeworkSubmission>(snapshot.docs),
        }),
      reportError,
    ),
    onSnapshot(
      ownedQuery(db, "mockExams", studentId, teacherId),
      (snapshot) => emit({ mockExams: mapDocuments<MockExam>(snapshot.docs) }),
      reportError,
    ),
  ];

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    stopProgramProfile?.();
    stopExamBlueprint?.();
  };
}

export function subscribeTeacherStudentWorkspace(
  db: Firestore,
  teacherId: string,
  studentId: string,
  observer: RealtimeObserver<StudentWorkspaceSnapshot>,
): Unsubscribe {
  return subscribeWorkspace(db, studentId, observer, teacherId);
}

export function subscribeStudentWorkspace(
  db: Firestore,
  studentId: string,
  observer: RealtimeObserver<StudentWorkspaceSnapshot>,
): Unsubscribe {
  return subscribeWorkspace(db, studentId, observer);
}

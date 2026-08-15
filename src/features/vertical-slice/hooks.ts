import { useEffect, useState } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  subscribeStudentWorkspace,
  subscribeTeacherStudents,
  subscribeTeacherStudentPrograms,
  subscribeTeacherMockExams,
  subscribeTeacherStudentWorkspace,
  type StudentWorkspaceSnapshot,
} from "../../lib/firebase/repositories/verticalSliceRepository";
import type { DocumentWithId, MockExam, Student, StudentProgram } from "../../lib/firebase/types";

interface RealtimeState<T> {
  data: T;
  loading: boolean;
  error: string | null;
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

export function useTeacherStudents(teacherId: string) {
  const [state, setState] = useState<
    RealtimeState<Array<DocumentWithId<Student>>>
  >({ data: [], loading: true, error: null });

  useEffect(
    () =>
      subscribeTeacherStudents(getFirebaseDb(), teacherId, {
        next: (students) => setState({ data: students, loading: false, error: null }),
        error: () =>
          setState((current) => ({
            ...current,
            loading: false,
            error: "Не удалось загрузить список учеников.",
          })),
      }),
    [teacherId],
  );

  return state;
}

export function useTeacherStudentPrograms(teacherId: string) {
  const [state, setState] = useState<RealtimeState<Array<DocumentWithId<StudentProgram>>>>({ data: [], loading: true, error: null });
  useEffect(() => subscribeTeacherStudentPrograms(getFirebaseDb(), teacherId, {
    next: (data) => setState({ data, loading: false, error: null }),
    error: () => setState((current) => ({ ...current, loading: false, error: "Не удалось загрузить программы учеников." })),
  }), [teacherId]);
  return state;
}

export function useTeacherMockExams(teacherId: string) {
  const [state, setState] = useState<RealtimeState<Array<DocumentWithId<MockExam>>>>({ data: [], loading: true, error: null });
  useEffect(() => subscribeTeacherMockExams(getFirebaseDb(), teacherId, { next: (data) => setState({ data, loading: false, error: null }), error: () => setState((current) => ({ ...current, loading: false, error: "Не удалось загрузить пробники." })) }), [teacherId]);
  return state;
}

export function useTeacherStudentWorkspace(teacherId: string, studentId: string) {
  const [state, setState] = useState<RealtimeState<StudentWorkspaceSnapshot>>({
    data: emptyWorkspace,
    loading: true,
    error: null,
  });

  useEffect(
    () =>
      subscribeTeacherStudentWorkspace(getFirebaseDb(), teacherId, studentId, {
        next: (workspace) =>
          setState({ data: workspace, loading: false, error: null }),
        error: () =>
          setState((current) => ({
            ...current,
            loading: false,
            error: "Не удалось загрузить данные ученика.",
          })),
      }),
    [studentId, teacherId],
  );

  return state;
}

export function useStudentWorkspace(studentId: string) {
  const [state, setState] = useState<RealtimeState<StudentWorkspaceSnapshot>>({
    data: emptyWorkspace,
    loading: true,
    error: null,
  });

  useEffect(
    () =>
      subscribeStudentWorkspace(getFirebaseDb(), studentId, {
        next: (workspace) =>
          setState({ data: workspace, loading: false, error: null }),
        error: () =>
          setState((current) => ({
            ...current,
            loading: false,
            error: "Не удалось загрузить кабинет.",
          })),
      }),
    [studentId],
  );

  return state;
}

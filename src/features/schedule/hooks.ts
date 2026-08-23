import { useEffect, useState } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  subscribeNextStudentLesson,
  subscribeTeacherSchedule,
  type TeacherScheduleSnapshot,
} from "../../lib/firebase/repositories/scheduleRepository";
import type { DocumentWithId, Lesson } from "../../lib/firebase/types";

interface RealtimeState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

const emptySchedule: TeacherScheduleSnapshot = {
  students: [],
  lessons: [],
  series: [],
  studentTimezones: {},
};

export function useTeacherSchedule(
  teacherId: string,
  range: { start: Date; end: Date },
) {
  const [state, setState] = useState<RealtimeState<TeacherScheduleSnapshot>>({
    data: emptySchedule,
    loading: true,
    error: null,
  });
  const startMillis = range.start.getTime();
  const endMillis = range.end.getTime();

  useEffect(() => {
    if (!teacherId) return;
    return subscribeTeacherSchedule(
      getFirebaseDb(),
      teacherId,
      { start: new Date(startMillis), end: new Date(endMillis) },
      {
        next: (data) => setState({ data, loading: false, error: null }),
        error: () =>
          setState((current) => ({
            ...current,
            loading: false,
            error: "Не удалось загрузить календарь.",
          })),
      },
    );
  }, [endMillis, startMillis, teacherId]);

  return state;
}

export function useNextStudentLesson(studentId: string) {
  const [state, setState] = useState<RealtimeState<DocumentWithId<Lesson> | null>>({
    data: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    if (!studentId) return;
    return subscribeNextStudentLesson(getFirebaseDb(), studentId, {
      next: (data) => setState({ data, loading: false, error: null }),
      error: () =>
        setState({ data: null, loading: false, error: "Не удалось загрузить занятие." }),
    });
  }, [studentId]);
  return state;
}

import { useEffect, useState } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  subscribeTeacherHomeworkBoard,
  type TeacherHomeworkBoard,
} from "../../lib/firebase/repositories/homeworkRepository";

const emptyBoard: TeacherHomeworkBoard = {
  students: [],
  homeworks: [],
  submissions: [],
};

export function useTeacherHomeworkBoard(teacherId: string) {
  const [state, setState] = useState({
    data: emptyBoard,
    loading: true,
    error: null as string | null,
  });
  useEffect(() => {
    if (!teacherId) return;
    return subscribeTeacherHomeworkBoard(getFirebaseDb(), teacherId, {
      next: (data) => setState({ data, loading: false, error: null }),
      error: () =>
        setState((current) => ({
          ...current,
          loading: false,
          error: "Не удалось загрузить домашние задания.",
        })),
    });
  }, [teacherId]);
  return state;
}

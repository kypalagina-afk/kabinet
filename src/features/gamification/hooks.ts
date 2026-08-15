import { useEffect, useState } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  subscribeStudentGamification,
  type GamificationSnapshot,
} from "../../lib/firebase/repositories/gamificationRepository";

const empty: GamificationSnapshot = { events: [], achievements: [], definitions: [] };

export function useStudentGamification(studentId: string, teacherId?: string) {
  const [state, setState] = useState({ data: empty, loading: true, error: null as string | null });
  useEffect(() => {
    if (!studentId) return;
    return subscribeStudentGamification(getFirebaseDb(), studentId, {
      next: (data) => setState({ data, loading: false, error: null }),
      error: () => setState((current) => ({ ...current, loading: false, error: "Не удалось загрузить достижения." })),
    }, teacherId);
  }, [studentId, teacherId]);
  return state;
}

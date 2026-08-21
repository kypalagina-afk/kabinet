import { useEffect, useState } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  subscribeTeacherPlanner,
  type PlannerSnapshot,
} from "../../lib/firebase/repositories/plannerRepository";

const empty: PlannerSnapshot = { items: [], goals: [], subgoals: [] };

export function useTeacherPlanner(teacherId: string) {
  const [state, setState] = useState({ data: empty, loading: true, error: null as string | null });
  useEffect(() => {
    if (!teacherId) return;
    return subscribeTeacherPlanner(getFirebaseDb(), teacherId, {
      next: (data) => setState({ data, loading: false, error: null }),
      error: () => setState((current) => ({ ...current, loading: false, error: "Не удалось загрузить планы." })),
    });
  }, [teacherId]);
  return state;
}

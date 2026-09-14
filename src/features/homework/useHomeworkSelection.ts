import { useEffect, useState } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import { subscribeHomeworkSelection, type HomeworkSelection } from "../../lib/firebase/repositories/homeworkSelectionRepository";

const empty: HomeworkSelection = { homeworks: [], submissions: [] };

export function useHomeworkSelection(teacherId: string, selection: { lessonIds?: string[]; homeworkIds?: string[] }) {
  const key = JSON.stringify({
    teacherId,
    lessonIds: [...new Set(selection.lessonIds ?? [])].sort(),
    homeworkIds: [...new Set(selection.homeworkIds ?? [])].sort(),
  });
  const [state, setState] = useState({ key: "", data: empty, loading: true, error: null as string | null });
  useEffect(() => {
    const input = JSON.parse(key) as { teacherId: string; lessonIds: string[]; homeworkIds: string[] };
    if (!input.teacherId) return;
    return subscribeHomeworkSelection(getFirebaseDb(), input.teacherId, input, {
      next: (data) => setState({ key, data, loading: false, error: null }),
      error: () => setState({ key, data: empty, loading: false, error: "Не удалось загрузить статус ДЗ." }),
    });
  }, [key]);
  return state.key === key ? state : { data: empty, loading: true, error: null };
}

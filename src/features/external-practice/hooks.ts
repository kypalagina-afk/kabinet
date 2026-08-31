import { useEffect, useState } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import { subscribeExternalPracticeAttempts } from "../../lib/firebase/repositories/externalPracticeRepository";
import type { DocumentWithId, ExternalPracticeAttempt } from "../../lib/firebase/types";

export function useExternalPracticeAttempts(teacherId: string, studentId: string) {
  const [state, setState] = useState({
    data: [] as Array<DocumentWithId<ExternalPracticeAttempt>>,
    loading: true,
    error: null as string | null,
  });
  useEffect(() => subscribeExternalPracticeAttempts(
    getFirebaseDb(),
    teacherId,
    studentId,
    {
      next: (data) => setState({ data, loading: false, error: null }),
      error: () => setState((current) => ({
        ...current,
        loading: false,
        error: "Не удалось загрузить практику Русский100.",
      })),
    },
  ), [studentId, teacherId]);
  return state;
}

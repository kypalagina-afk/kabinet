import {
  collection,
  onSnapshot,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { DocumentWithId, ExternalPracticeAttempt } from "../types";
import type { RealtimeObserver } from "./verticalSliceRepository";

export function subscribeExternalPracticeAttempts(
  db: Firestore,
  teacherId: string,
  studentId: string,
  observer: RealtimeObserver<Array<DocumentWithId<ExternalPracticeAttempt>>>,
): Unsubscribe {
  if (!teacherId || !studentId) {
    observer.next([]);
    return () => undefined;
  }
  return onSnapshot(
    query(
      collection(db, "externalPracticeAttempts"),
      where("teacherId", "==", teacherId),
      where("studentId", "==", studentId),
    ),
    (snapshot) => observer.next(
      snapshot.docs
        .map((item) => ({ id: item.id, data: item.data() as ExternalPracticeAttempt }))
        .sort((left, right) => right.data.practicedAt.toMillis() - left.data.practicedAt.toMillis()),
    ),
    observer.error,
  );
}

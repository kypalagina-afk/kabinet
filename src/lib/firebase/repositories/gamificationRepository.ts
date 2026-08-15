import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  AchievementDefinition,
  DocumentWithId,
  GamificationEvent,
  StudentAchievement,
} from "../types";
import type { RealtimeObserver } from "./verticalSliceRepository";

export interface GamificationSnapshot {
  events: Array<DocumentWithId<GamificationEvent>>;
  achievements: Array<DocumentWithId<StudentAchievement>>;
  definitions: Array<DocumentWithId<AchievementDefinition>>;
}

function mapped<T>(documents: Array<{ id: string; data(): DocumentData }>) {
  return documents.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() as T }));
}

export function subscribeStudentGamification(
  db: Firestore,
  studentId: string,
  observer: RealtimeObserver<GamificationSnapshot>,
  teacherId?: string,
): Unsubscribe {
  let state: GamificationSnapshot = { events: [], achievements: [], definitions: [] };
  const emit = (patch: Partial<GamificationSnapshot>) => {
    state = { ...state, ...patch };
    observer.next(state);
  };
  const error = (value: Error) => observer.error(value);
  const stops = [
    onSnapshot(
      query(collection(db, "gamificationEvents"), where("studentId", "==", studentId), ...(teacherId ? [where("teacherId", "==", teacherId)] : [])),
      (snapshot) => emit({ events: mapped<GamificationEvent>(snapshot.docs) }),
      error,
    ),
    onSnapshot(
      query(collection(db, "studentAchievements"), where("studentId", "==", studentId), ...(teacherId ? [where("teacherId", "==", teacherId)] : [])),
      (snapshot) => emit({ achievements: mapped<StudentAchievement>(snapshot.docs) }),
      error,
    ),
    onSnapshot(
      collection(db, "achievementDefinitions"),
      (snapshot) => emit({ definitions: mapped<AchievementDefinition>(snapshot.docs) }),
      error,
    ),
  ];
  return () => stops.forEach((stop) => stop());
}

import {
  collection,
  onSnapshot,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  DocumentWithId,
  PlannerGoal,
  PlannerItem,
  PlannerSubgoal,
} from "../types.js";

export interface PlannerSnapshot {
  items: Array<DocumentWithId<PlannerItem>>;
  goals: Array<DocumentWithId<PlannerGoal>>;
  subgoals: Array<DocumentWithId<PlannerSubgoal>>;
}

export function subscribeTeacherPlanner(
  db: Firestore,
  teacherId: string,
  observer: {
    next(value: PlannerSnapshot): void;
    error(error: Error): void;
  },
): Unsubscribe {
  const state: PlannerSnapshot = { items: [], goals: [], subgoals: [] };
  const emit = () => observer.next({
    items: [...state.items].sort((a, b) => a.data.sortOrder - b.data.sortOrder),
    goals: [...state.goals].sort((a, b) => a.data.createdAt.toMillis() - b.data.createdAt.toMillis()),
    subgoals: [...state.subgoals].sort((a, b) => a.data.sortOrder - b.data.sortOrder),
  });
  const listen = <T,>(collectionName: string, assign: (value: Array<DocumentWithId<T>>) => void) =>
    onSnapshot(
      query(collection(db, collectionName), where("teacherId", "==", teacherId)),
      (snapshot) => {
        assign(snapshot.docs.map((item) => ({ id: item.id, data: item.data() as T })));
        emit();
      },
      (error) => observer.error(error),
    );
  const unsubscribes = [
    listen<PlannerItem>("plannerItems", (value) => { state.items = value; }),
    listen<PlannerGoal>("plannerGoals", (value) => { state.goals = value; }),
    listen<PlannerSubgoal>("plannerSubgoals", (value) => { state.subgoals = value; }),
  ];
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

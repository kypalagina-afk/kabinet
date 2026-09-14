import { collection, documentId, onSnapshot, query, where, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { DocumentWithId, Homework, HomeworkSubmission } from "../types.js";
import type { RealtimeObserver } from "./verticalSliceRepository.js";

export interface HomeworkSelection {
  homeworks: Array<DocumentWithId<Homework>>;
  submissions: Array<DocumentWithId<HomeworkSubmission>>;
}

function chunks(ids: string[]) {
  const unique = [...new Set(ids)].sort();
  return Array.from({ length: Math.ceil(unique.length / 30) }, (_, index) => unique.slice(index * 30, index * 30 + 30));
}

// Exact selection, without the board's recent-100 limit. Old lessons and direct
// homework links must load their own submissions, not a truncated recent history.
export function subscribeHomeworkSelection(
  db: Firestore,
  teacherId: string,
  selection: { lessonIds?: string[]; homeworkIds?: string[] },
  observer: RealtimeObserver<HomeworkSelection>,
): Unsubscribe {
  const requests = [
    ...chunks(selection.lessonIds ?? []).map((ids) => query(collection(db, "homeworks"), where("teacherId", "==", teacherId), where("sourceLessonId", "in", ids))),
    ...chunks(selection.homeworkIds ?? []).map((ids) => query(collection(db, "homeworks"), where("teacherId", "==", teacherId), where(documentId(), "in", ids))),
  ];
  let active = true;
  let generation = 0;
  let homeworkIdsKey = "";
  let homeworks: HomeworkSelection["homeworks"] = [];
  let submissionStops: Unsubscribe[] = [];
  const homeworkChunks = new Map<number, HomeworkSelection["homeworks"]>();
  const submissionChunks = new Map<number, HomeworkSelection["submissions"]>();
  let expectedSubmissionChunks = 0;
  const reportError = (error: Error) => { if (active) observer.error(error); };
  const emit = () => {
    if (active && homeworkChunks.size === requests.length && submissionChunks.size === expectedSubmissionChunks) {
      observer.next({ homeworks, submissions: [...submissionChunks.values()].flat() });
    }
  };
  const refreshSubmissions = () => {
    homeworks = [...new Map([...homeworkChunks.values()].flat().map((item) => [item.id, item])).values()];
    const ids = homeworks.map(({ id }) => id).sort();
    const nextKey = JSON.stringify(ids);
    if (homeworkIdsKey === nextKey) { emit(); return; }
    homeworkIdsKey = nextKey;
    generation += 1;
    const currentGeneration = generation;
    submissionStops.forEach((stop) => stop());
    submissionChunks.clear();
    const groups = chunks(ids);
    expectedSubmissionChunks = groups.length;
    submissionStops = groups.map((group, index) => onSnapshot(
      query(collection(db, "homeworkSubmissions"), where("teacherId", "==", teacherId), where("homeworkId", "in", group)),
      (snapshot) => {
        if (!active || currentGeneration !== generation) return;
        submissionChunks.set(index, snapshot.docs.map((item) => ({ id: item.id, data: item.data() as HomeworkSubmission })));
        emit();
      },
      reportError,
    ));
    emit();
  };
  const stops = requests.map((request, index) => onSnapshot(request, (snapshot) => {
    if (!active) return;
    homeworkChunks.set(index, snapshot.docs.map((item) => ({ id: item.id, data: item.data() as Homework })));
    if (homeworkChunks.size === requests.length) refreshSubmissions();
  }, reportError));
  if (!requests.length) emit();
  return () => { active = false; stops.forEach((stop) => stop()); submissionStops.forEach((stop) => stop()); };
}

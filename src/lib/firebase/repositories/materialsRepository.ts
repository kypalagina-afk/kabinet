import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { DocumentWithId, Material, MaterialFolder, ProgramProfile } from "../types";
import type { RealtimeObserver } from "./verticalSliceRepository";

function mapped(documents: Array<{ id: string; data(): DocumentData }>): Array<DocumentWithId<Material>> {
  return documents.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() as Material }));
}

export function subscribeTeacherMaterials(
  db: Firestore,
  teacherId: string,
  observer: RealtimeObserver<Array<DocumentWithId<Material>>>,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "materials"), where("teacherId", "==", teacherId)),
    (snapshot) => observer.next(mapped(snapshot.docs)),
    observer.error,
  );
}

export function subscribeStudentMaterials(
  db: Firestore,
  studentId: string,
  programProfileId: string,
  observer: RealtimeObserver<Array<DocumentWithId<Material>>>,
): Unsubscribe {
  if (!programProfileId) {
    observer.next([]);
    return () => undefined;
  }
  return onSnapshot(
    query(
      collection(db, "materials"),
      where("allowedStudentIds", "array-contains", studentId),
      where("active", "==", true),
    ),
    (snapshot) => observer.next(mapped(snapshot.docs).filter(({ data }) => data.programProfileIds.includes(programProfileId))),
    observer.error,
  );
}

export function subscribeMaterialFolders(db: Firestore, teacherId: string, observer: RealtimeObserver<Array<DocumentWithId<MaterialFolder>>>): Unsubscribe {
  return onSnapshot(query(collection(db, "materialFolders"), where("teacherId", "==", teacherId)), (snapshot) => observer.next(snapshot.docs.map((item) => ({ id: item.id, data: item.data() as MaterialFolder }))), observer.error);
}

export function subscribeStudentMaterialFolders(db: Firestore, studentId: string, observer: RealtimeObserver<Array<DocumentWithId<MaterialFolder>>>): Unsubscribe {
  if (!studentId) { observer.next([]); return () => undefined; }
  return onSnapshot(query(collection(db, "materialFolders"), where("allowedStudentIds", "array-contains", studentId)), (snapshot) => observer.next(snapshot.docs.map((item) => ({ id: item.id, data: item.data() as MaterialFolder })).filter(({ data }) => data.active)), observer.error);
}

export function subscribeProgramProfiles(
  db: Firestore,
  observer: RealtimeObserver<Array<DocumentWithId<ProgramProfile>>>,
): Unsubscribe {
  return onSnapshot(
    collection(db, "programProfiles"),
    (snapshot) => observer.next(
      snapshot.docs.map((item) => ({ id: item.id, data: item.data() as ProgramProfile })),
    ),
    observer.error,
  );
}

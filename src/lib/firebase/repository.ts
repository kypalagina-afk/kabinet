import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
  type UpdateData,
  type WithFieldValue,
} from "firebase/firestore";
import type {
  CollectionName,
  CollectionSchema,
  DocumentWithId,
} from "./types";

export interface Repository<T extends DocumentData> {
  getById(id: string): Promise<DocumentWithId<T> | null>;
  list(...constraints: QueryConstraint[]): Promise<Array<DocumentWithId<T>>>;
  set(id: string, data: WithFieldValue<T>): Promise<void>;
  update(id: string, data: UpdateData<T>): Promise<void>;
}

export function createRepository<Name extends CollectionName>(
  db: Firestore,
  collectionName: Name,
): Repository<CollectionSchema[Name]> {
  type Model = CollectionSchema[Name];
  const collectionReference = collection(db, collectionName);

  return {
    async getById(id) {
      const snapshot = await getDoc(doc(collectionReference, id));
      return snapshot.exists()
        ? { id: snapshot.id, data: snapshot.data() as Model }
        : null;
    },

    async list(...constraints) {
      const snapshot = await getDocs(query(collectionReference, ...constraints));
      return snapshot.docs.map((item) => ({
        id: item.id,
        data: item.data() as Model,
      }));
    },

    async set(id, data) {
      await setDoc(doc(collectionReference, id), data as WithFieldValue<DocumentData>);
    },

    async update(id, data) {
      await updateDoc(doc(collectionReference, id), data as UpdateData<DocumentData>);
    },
  };
}

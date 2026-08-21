import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
  type Timestamp,
} from "firebase/firestore";
import type { FileAsset } from "../types.js";

const monitoredCollections = [
  "students",
  "studentPrograms",
  "lessonSeries",
  "lessons",
  "homeworks",
  "homeworkSubmissions",
  "mockExams",
  "materials",
  "materialFolders",
  "fileAssets",
  "plannerItems",
  "plannerGoals",
  "plannerSubgoals",
] as const;

export interface TeacherResourceSummary {
  students: number;
  files: number;
  activeFiles: number;
  approximateStorageBytes: number;
  uploadsThisMonth: number;
  trackedFirestoreDocuments: number;
  documentsByCollection: Record<(typeof monitoredCollections)[number], number>;
}

function isThisMonth(timestamp: Timestamp | undefined, now: Date) {
  if (!timestamp || typeof timestamp.toDate !== "function") return false;
  const value = timestamp.toDate();
  return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth();
}

export async function getTeacherResourceSummary(
  db: Firestore,
  teacherId: string,
  now = new Date(),
): Promise<TeacherResourceSummary> {
  if (!teacherId) throw new Error("Teacher ID is required");
  const snapshots = await Promise.all(
    monitoredCollections.map((name) =>
      getDocs(query(collection(db, name), where("teacherId", "==", teacherId))),
    ),
  );
  const documentsByCollection = Object.fromEntries(
    monitoredCollections.map((name, index) => [name, snapshots[index]!.size]),
  ) as TeacherResourceSummary["documentsByCollection"];
  const fileSnapshot = snapshots[monitoredCollections.indexOf("fileAssets")]!;
  const files = fileSnapshot.docs.map((item) => item.data() as FileAsset);

  return {
    students: documentsByCollection.students,
    files: files.length,
    activeFiles: files.filter((file) => file.status === "active").length,
    approximateStorageBytes: files
      .filter((file) => file.status === "active")
      .reduce((total, file) => total + (Number.isFinite(file.size) ? file.size : 0), 0),
    uploadsThisMonth: files.filter((file) => isThisMonth(file.createdAt, now)).length,
    trackedFirestoreDocuments: Object.values(documentsByCollection).reduce(
      (total, count) => total + count,
      0,
    ),
    documentsByCollection,
  };
}

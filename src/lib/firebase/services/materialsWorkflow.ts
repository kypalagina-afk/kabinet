import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import type { Material } from "../types.js";

export interface MaterialInput {
  title: string;
  type: Material["type"];
  externalUrl: string;
  storagePath?: string | null;
  programProfileIds: string[];
  examTaskNumbers: number[];
  tags: string[];
  folderId?: string | null;
  visibility?: Material["visibility"];
  selectedStudentIds?: string[];
  allowedStudentIds?: string[];
  favorite?: boolean;
}

function normalize(input: MaterialInput): MaterialInput {
  const title = input.title.trim();
  const externalUrl = input.externalUrl.trim();
  if (!title) throw new Error("Название материала обязательно");
  if (!externalUrl && !input.storagePath) throw new Error("Добавьте файл или ссылку");
  const parsed = externalUrl ? new URL(externalUrl) : null;
  if (parsed && !new Set(["http:", "https:"]).has(parsed.protocol))
    throw new Error("Поддерживаются только HTTP(S)-ссылки");
  if (!input.programProfileIds.length) throw new Error("Выберите программу");
  return {
    ...input,
    title,
    externalUrl: parsed?.toString() ?? "",
    storagePath: input.storagePath ?? null,
    programProfileIds: [...new Set(input.programProfileIds.filter(Boolean))],
    examTaskNumbers: [...new Set(input.examTaskNumbers.filter((task) => Number.isInteger(task) && task > 0))].sort((a, b) => a - b),
    tags: [...new Set(input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
    selectedStudentIds: [...new Set(input.selectedStudentIds ?? [])],
    allowedStudentIds: [...new Set(input.allowedStudentIds ?? [])],
  };
}

export async function createMaterial(
  db: Firestore,
  teacherId: string,
  input: MaterialInput,
  materialId?: string,
): Promise<string> {
  const value = normalize(input);
  const reference = materialId
    ? doc(db, "materials", materialId)
    : doc(collection(db, "materials"));
  await runTransaction(db, async (transaction) => {
    transaction.set(reference, {
      teacherId,
      ...value,
      storagePath: value.storagePath ?? null,
      active: true,
      folderId: value.folderId ?? null,
      visibility: value.visibility ?? "program",
      favorite: value.favorite ?? false,
      lastUsedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
  });
  return reference.id;
}

export async function createMaterialFolder(db: Firestore, teacherId: string, title: string): Promise<string> {
  const value = title.trim(); if (!value) throw new Error("Название папки обязательно"); const reference = doc(collection(db, "materialFolders")); await runTransaction(db, async (transaction) => transaction.set(reference, { teacherId, title: value, active: true, allowedStudentIds: [], autoShareNewMaterials: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1 })); return reference.id;
}

export async function grantMaterialAccess(db: Firestore, teacherId: string, materialId: string, studentIds: string[]) {
  const reference = doc(db, "materials", materialId); await runTransaction(db, async (transaction) => { const snapshot = await transaction.get(reference); if (!snapshot.exists() || snapshot.data().teacherId !== teacherId) throw new Error("Материал не найден"); const material = snapshot.data() as Material; transaction.update(reference, { visibility: "selected_students", selectedStudentIds: [...new Set([...(material.selectedStudentIds ?? []), ...studentIds])], allowedStudentIds: [...new Set([...(material.allowedStudentIds ?? []), ...studentIds])], lastUsedAt: serverTimestamp(), updatedAt: serverTimestamp() }); });
}

export async function grantFolderAccess(db: Firestore, input: { teacherId: string; folderId: string; studentIds: string[]; autoShareNewMaterials: boolean }) {
  const folderReference = doc(db, "materialFolders", input.folderId); const materialsSnapshot = await getDocs(query(collection(db, "materials"), where("teacherId", "==", input.teacherId), where("folderId", "==", input.folderId)));
  await runTransaction(db, async (transaction) => { const [folderSnapshot, ...materialSnapshots] = await Promise.all([transaction.get(folderReference), ...materialsSnapshot.docs.map((item) => transaction.get(item.ref))]); if (!folderSnapshot.exists() || folderSnapshot.data().teacherId !== input.teacherId) throw new Error("Папка не найдена"); const folder = folderSnapshot.data() as { allowedStudentIds?: string[] }; transaction.update(folderReference, { allowedStudentIds: [...new Set([...(folder.allowedStudentIds ?? []), ...input.studentIds])], autoShareNewMaterials: input.autoShareNewMaterials, updatedAt: serverTimestamp() }); materialSnapshots.forEach((snapshot) => { if (!snapshot.exists()) return; const material = snapshot.data() as Material; transaction.update(snapshot.ref, { allowedStudentIds: [...new Set([...(material.allowedStudentIds ?? []), ...input.studentIds])], selectedStudentIds: [...new Set([...(material.selectedStudentIds ?? []), ...input.studentIds])], updatedAt: serverTimestamp() }); }); });
}

export async function markMaterialUsed(db: Firestore, teacherId: string, materialId: string) { const reference = doc(db, "materials", materialId); await runTransaction(db, async (transaction) => { const snapshot = await transaction.get(reference); if (!snapshot.exists() || snapshot.data().teacherId !== teacherId) throw new Error("Материал не найден"); transaction.update(reference, { lastUsedAt: serverTimestamp(), updatedAt: serverTimestamp() }); }); }

export async function toggleMaterialFavorite(db: Firestore, teacherId: string, materialId: string, favorite: boolean): Promise<void> {
  const reference = doc(db, "materials", materialId); await runTransaction(db, async (transaction) => { const snapshot = await transaction.get(reference); if (!snapshot.exists() || snapshot.data().teacherId !== teacherId) throw new Error("Материал не найден"); transaction.update(reference, { favorite, updatedAt: serverTimestamp() }); });
}

export async function updateMaterial(
  db: Firestore,
  teacherId: string,
  materialId: string,
  input: MaterialInput,
): Promise<void> {
  const value = normalize(input);
  const reference = doc(db, "materials", materialId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || (snapshot.data() as Material).teacherId !== teacherId) {
      throw new Error("Материал не найден");
    }
    transaction.update(reference, { ...value, storagePath: value.storagePath ?? null, updatedAt: serverTimestamp() });
  });
}

export async function archiveMaterial(
  db: Firestore,
  teacherId: string,
  materialId: string,
): Promise<"applied" | "noop"> {
  const reference = doc(db, "materials", materialId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || (snapshot.data() as Material).teacherId !== teacherId) {
      throw new Error("Материал не найден");
    }
    if (!(snapshot.data() as Material).active) return "noop" as const;
    transaction.update(reference, { active: false, updatedAt: serverTimestamp() });
    return "applied" as const;
  });
}

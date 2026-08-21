import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
} from "firebase/storage";
import type { Attachment, FileAsset, FilePreviewType } from "../types.js";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export interface UploadFileInput {
  teacherId: string;
  studentId: string | null;
  uploadedBy: string;
  ownerType: FileAsset["ownerType"];
  purpose: FileAsset["purpose"];
  homeworkId?: string | null;
  materialId?: string | null;
  itemId?: string | null;
  submissionId?: string | null;
  allowedStudentIds?: string[];
}

export interface UploadedFile {
  assetId: string;
  attachment: Attachment;
  previewType: FilePreviewType;
  size: number;
}

export function validateUpload(file: File): void {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES)
    throw new Error("Размер файла должен быть не больше 15 МБ.");
  if (!allowedMimeTypes.has(file.type))
    throw new Error("Разрешены JPEG, PNG, WebP, PDF, DOC, DOCX и TXT.");
}

function previewType(mimeType: string): FilePreviewType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  return "document";
}

function safeName(name: string): string {
  return name.normalize("NFKC").replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, "-").slice(-120);
}

function storagePath(assetId: string, file: File, input: UploadFileInput): string {
  const name = safeName(file.name) || "file";
  if (input.purpose === "submission")
    return `students/${input.studentId}/submissions/${input.homeworkId}/${assetId}/${name}`;
  if (input.purpose === "material")
    return `teachers/${input.teacherId}/materials/${input.materialId ?? "draft"}/${assetId}/${name}`;
  return `teachers/${input.teacherId}/homework/${input.studentId}/${input.homeworkId ?? "draft"}/${assetId}/${name}`;
}

export async function uploadFileAsset(
  db: Firestore,
  storage: FirebaseStorage,
  file: File,
  input: UploadFileInput,
  onProgress?: (percent: number) => void,
): Promise<UploadedFile> {
  validateUpload(file);
  const assetId = crypto.randomUUID();
  const path = storagePath(assetId, file, input);
  const storageReference = ref(storage, path);
  const task = uploadBytesResumable(storageReference, file, {
    contentType: file.type,
    customMetadata: { assetId, purpose: input.purpose },
  });
  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      reject,
      resolve,
    );
  });
  try {
    await setDoc(doc(db, "fileAssets", assetId), {
      teacherId: input.teacherId,
      studentId: input.studentId,
      ownerType: input.ownerType,
      uploadedBy: input.uploadedBy,
      purpose: input.purpose,
      homeworkId: input.homeworkId ?? null,
      materialId: input.materialId ?? null,
      itemId: input.itemId ?? null,
      submissionId: input.submissionId ?? null,
      originalName: file.name,
      storagePath: path,
      mimeType: file.type,
      size: file.size,
      previewType: previewType(file.type),
      allowedStudentIds: [...new Set(input.allowedStudentIds ?? [])],
      status: "active",
      deletedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
  } catch (error) {
    await deleteObject(storageReference).catch(() => undefined);
    throw error;
  }
  return {
    assetId,
    attachment: {
      id: assetId,
      kind: "storage",
      title: file.name,
      url: await getDownloadURL(storageReference),
      storagePath: path,
      contentType: file.type,
    },
    previewType: previewType(file.type),
    size: file.size,
  };
}

export async function deleteFileAsset(
  db: Firestore,
  storage: FirebaseStorage,
  assetId: string,
): Promise<void> {
  const reference = doc(db, "fileAssets", assetId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new Error("Файл не найден.");
  const asset = snapshot.data() as FileAsset;
  await deleteObject(ref(storage, asset.storagePath));
  await updateDoc(reference, {
    status: "deleted",
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

import { createHash, randomUUID } from "node:crypto";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_MONTHLY_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_ACTIVE_STORAGE_BYTES = 20 * 1024 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export type FilePurpose = "homework" | "submission" | "material";
export type OwnerType = "teacher" | "student";

export interface UploadIntentInput {
  teacherId: string;
  studentId: string | null;
  uploadedBy: string;
  ownerType: OwnerType;
  purpose: FilePurpose;
  homeworkId?: string | null;
  materialId?: string | null;
  itemId?: string | null;
  submissionId?: string | null;
  allowedStudentIds?: string[];
  fileName: string;
  mimeType: string;
  size: number;
}

export function validateUploadIntent(value: UploadIntentInput): void {
  if (!value.teacherId || !value.uploadedBy) throw new Error("Missing file ownership");
  if (!ALLOWED_MIME_TYPES.has(value.mimeType)) throw new Error("Unsupported file type");
  if (!Number.isInteger(value.size) || value.size <= 0 || value.size > MAX_UPLOAD_BYTES) {
    throw new Error("File size must be between 1 byte and 15 MB");
  }
  if (!value.fileName.trim() || value.fileName.length > 255) throw new Error("Invalid file name");
  if (value.ownerType === "student" && value.purpose !== "submission") {
    throw new Error("Students may upload submission files only");
  }
  if (value.purpose === "submission" && (!value.studentId || !value.homeworkId)) {
    throw new Error("Submission ownership is incomplete");
  }
  if (value.purpose === "material" && value.ownerType !== "teacher") {
    throw new Error("Materials are teacher-managed");
  }
}

export function safeFileName(value: string): string {
  const withoutControls = Array.from(value.normalize("NFKC"), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? "-" : character;
  }).join("");
  const normalized = withoutControls.replace(/[/\\<>:"|?*]+/g, "-");
  return normalized
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(-120) || "file";
}

export function storageObjectKey(assetId: string, input: UploadIntentInput): string {
  const name = safeFileName(input.fileName);
  if (input.purpose === "submission") {
    return `students/${input.studentId}/submissions/${input.homeworkId}/${assetId}/${name}`;
  }
  if (input.purpose === "material") {
    return `teachers/${input.teacherId}/materials/${input.materialId ?? "draft"}/${assetId}/${name}`;
  }
  return `teachers/${input.teacherId}/homework/${input.studentId}/${input.homeworkId ?? "draft"}/${assetId}/${name}`;
}

export function newAssetId(): string {
  return randomUUID();
}

export function previewType(mimeType: string): "image" | "pdf" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  return "document";
}

export function rateLimitDocumentId(uid: string, action: string, now = new Date()): string {
  const window = now.toISOString().slice(0, 13);
  return createHash("sha256").update(`${uid}:${action}:${window}`).digest("hex");
}

export function usernameToTechnicalEmail(username: string, aliasDomain: string): string {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(normalized)) throw new Error("Invalid username");
  return `${normalized}@${aliasDomain}`;
}

export function exactObjectPolicy(bucket: string, objectKey: string, actions: string[]): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "kabinet_exact_object",
        Effect: "Allow",
        Principal: "*",
        Action: actions,
        Resource: `arn:aws:s3:::${bucket}/${objectKey}`,
      },
    ],
  });
}

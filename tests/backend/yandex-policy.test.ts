import { describe, expect, test } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  exactObjectPolicy,
  rateLimitDocumentId,
  safeFileName,
  storageObjectKey,
  usernameToTechnicalEmail,
  validateUploadIntent,
  type UploadIntentInput,
} from "../../backend/yandex/src/policy.js";

const valid: UploadIntentInput = {
  teacherId: "teacher-1",
  studentId: "student-1",
  uploadedBy: "teacher-1",
  ownerType: "teacher",
  purpose: "homework",
  homeworkId: "homework-1",
  fileName: "Ответ ученика.pdf",
  mimeType: "application/pdf",
  size: 1024,
};

describe("Yandex backend security policy", () => {
  test("accepts approved input and produces an isolated object key", () => {
    expect(() => validateUploadIntent(valid)).not.toThrow();
    expect(storageObjectKey("asset-1", valid)).toBe(
      "teachers/teacher-1/homework/student-1/homework-1/asset-1/Ответ ученика.pdf",
    );
  });

  test("rejects oversized, unsupported, and cross-purpose student uploads", () => {
    expect(() => validateUploadIntent({ ...valid, size: MAX_UPLOAD_BYTES + 1 })).toThrow();
    expect(() => validateUploadIntent({ ...valid, mimeType: "text/html" })).toThrow();
    expect(() => validateUploadIntent({ ...valid, ownerType: "student", purpose: "material" })).toThrow();
  });

  test("sanitizes object names without losing safe unicode", () => {
    expect(safeFileName('../РНО: итог?.pdf')).toBe("РНО- итог-.pdf");
    expect(safeFileName("///")).toBe("file");
  });

  test("uses the approved technical-email alias algorithm", () => {
    expect(usernameToTechnicalEmail(" Lera9 ", "kabinet25.example.com")).toBe("lera9@kabinet25.example.com");
    expect(() => usernameToTechnicalEmail("лера", "kabinet25.example.com")).toThrow();
  });

  test("scopes ephemeral S3 policy to one exact object", () => {
    const parsed = JSON.parse(exactObjectPolicy("private-bucket", "teachers/t/a.pdf", ["s3:GetObject"]));
    expect(parsed.Statement).toEqual([
      expect.objectContaining({
        Action: ["s3:GetObject"],
        Resource: "arn:aws:s3:::private-bucket/teachers/t/a.pdf",
      }),
    ]);
  });

  test("rate-limit ids are deterministic per hour and do not expose uid", () => {
    const now = new Date("2026-08-23T10:30:00.000Z");
    const value = rateLimitDocumentId("private-user-id", "upload", now);
    expect(value).toHaveLength(64);
    expect(value).toBe(rateLimitDocumentId("private-user-id", "upload", new Date("2026-08-23T10:59:59.000Z")));
    expect(value).not.toContain("private-user-id");
  });
});

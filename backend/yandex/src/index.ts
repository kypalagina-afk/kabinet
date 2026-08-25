import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import {
  MAX_ACTIVE_STORAGE_BYTES,
  MAX_MONTHLY_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  exactObjectPolicy,
  newAssetId,
  previewType,
  rateLimitDocumentId,
  safeFileName,
  storageObjectKey,
  usernameToTechnicalEmail,
  validateUploadIntent,
  type UploadIntentInput,
} from "./policy";
import { aiInterpretInputSchema } from "./ai/schema.js";
import { YandexAIProvider } from "./ai/provider.js";
import { isTeacherAIActor } from "./ai/authorization.js";
import {
  findStudentsByName,
  getActiveHomework,
  getPendingHomeworkReviews,
  getPlannerItemsRange,
  getTeacherScheduleRange,
} from "./ai/context.js";
import { parseFirebaseCredential } from "./firebaseCredential.js";

type Json = Record<string, unknown>;

interface FunctionEvent {
  httpMethod?: string;
  path?: string;
  url?: string;
  queryStringParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: string | Json;
  isBase64Encoded?: boolean;
  requestContext?: { identity?: { sourceIp?: string } };
}

interface FunctionContext {
  requestId?: string;
  token?: { access_token?: string };
  getPayload?: () => unknown;
}

interface UserProfile extends Json {
  role: "teacher" | "student";
  studentId?: string | null;
}

interface FileAssetData extends Json {
  teacherId: string;
  studentId: string | null;
  ownerType: "teacher" | "student";
  uploadedBy: string;
  purpose: "homework" | "submission" | "material";
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  allowedStudentIds: string[];
  status: "pending" | "active" | "deleted";
}

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing backend environment variable: ${name}`);
  return value;
};

const firebaseProjectId = required("FIREBASE_PROJECT_ID");
const bucket = required("YANDEX_STORAGE_BUCKET");
const yandexServiceAccountId = required("YANDEX_SERVICE_ACCOUNT_ID");
const aliasDomain = process.env.AUTH_ALIAS_DOMAIN?.trim() || "kabinet25.example.com";
const allowedOrigins = new Set(
  required("ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const requireAppCheck = process.env.REQUIRE_APP_CHECK === "true";
const aiAssistantEnabled = process.env.AI_ASSISTANT_ENABLED === "true";

const credentialJson = parseFirebaseCredential(
  firebaseProjectId,
  process.env.FIREBASE_ADMIN_JSON,
  process.env.FIREBASE_ADMIN_JSON_B64,
);

const firebaseApp =
  getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: credentialJson.project_id,
      clientEmail: credentialJson.client_email,
      privateKey: credentialJson.private_key,
    }),
    projectId: firebaseProjectId,
  });
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

function header(event: FunctionEvent, name: string): string | undefined {
  const target = name.toLowerCase();
  const match = Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === target);
  return match?.[1];
}

function originOf(event: FunctionEvent): string | null {
  const origin = header(event, "origin") ?? null;
  if (origin && !allowedOrigins.has(origin)) throw new HttpError(403, "Origin is not allowed");
  return origin;
}

function response(statusCode: number, body: unknown, origin: string | null) {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    vary: "Origin",
  };
  if (origin) headers["access-control-allow-origin"] = origin;
  return { statusCode, headers, isBase64Encoded: false, body: JSON.stringify(body) };
}

function corsResponse(origin: string | null) {
  const result = response(204, {}, origin);
  result.headers["access-control-allow-methods"] = "GET,POST,DELETE,OPTIONS";
  result.headers["access-control-allow-headers"] = "Content-Type,X-Firebase-Auth,X-Firebase-AppCheck";
  result.headers["access-control-max-age"] = "600";
  return result;
}

function pathOf(event: FunctionEvent): string {
  const routedPath = event.queryStringParameters?.path;
  if (routedPath?.startsWith("/")) return routedPath;
  if (event.url) {
    const url = new URL(event.url, "https://function.invalid");
    const queryPath = url.searchParams.get("path");
    if (queryPath?.startsWith("/")) return queryPath;
  }
  if (event.path) return event.path;
  if (event.url) return new URL(event.url, "https://function.invalid").pathname;
  return "/";
}

function jsonBody(event: FunctionEvent, context: FunctionContext): Json {
  const payload = context.getPayload?.();
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload as Json;
  if (event.body && typeof event.body === "object") return event.body;
  if (typeof event.body !== "string" || !event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError(400, "JSON object required");
  return parsed as Json;
}

async function authenticate(event: FunctionEvent): Promise<{ uid: string; profile: UserProfile }> {
  const token = (header(event, "x-firebase-auth") ?? header(event, "authorization"))?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Authentication required");
  if (requireAppCheck) {
    const appCheckToken = header(event, "x-firebase-appcheck");
    if (!appCheckToken) throw new HttpError(401, "App Check required");
    await getAppCheck(firebaseApp).verifyToken(appCheckToken).catch(() => {
      throw new HttpError(401, "Invalid App Check token");
    });
  }
  const decoded = await auth.verifyIdToken(token, true).catch(() => {
    throw new HttpError(401, "Invalid authentication token");
  });
  const profileSnapshot = await db.doc(`users/${decoded.uid}`).get();
  if (!profileSnapshot.exists) throw new HttpError(403, "User profile is missing");
  const profile = profileSnapshot.data() as UserProfile;
  if (profile.role !== "teacher" && profile.role !== "student") throw new HttpError(403, "Unsupported role");
  return { uid: decoded.uid, profile };
}

async function rateLimit(uid: string, action: string, limit: number): Promise<void> {
  const reference = db.doc(`backendRateLimits/${rateLimitDocumentId(uid, action)}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const count = Number(snapshot.data()?.count ?? 0);
    if (count >= limit) throw new HttpError(429, "Too many requests");
    transaction.set(
      reference,
      { uidHash: rateLimitDocumentId(uid, "identity"), action, count: count + 1, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });
}

async function issueStorageCredentials(iamToken: string, objectKey: string, actions: string[]) {
  const apiResponse = await fetch(
    "https://iam.api.cloud.yandex.net/iam/aws-compatibility/v1/ephemeralAccessKeys",
    {
      method: "POST",
      headers: { authorization: `Bearer ${iamToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: yandexServiceAccountId,
        sessionName: `kabinet-${Date.now()}`,
        policy: exactObjectPolicy(bucket, objectKey, actions),
        duration: "900s",
      }),
    },
  );
  if (!apiResponse.ok) throw new HttpError(503, "Storage authorization is unavailable");
  const value = (await apiResponse.json()) as {
    accessKeyId?: string;
    secret?: string;
    sessionToken?: string;
  };
  if (!value.accessKeyId || !value.secret || !value.sessionToken) {
    throw new HttpError(503, "Storage authorization response is incomplete");
  }
  return { accessKeyId: value.accessKeyId, secretAccessKey: value.secret, sessionToken: value.sessionToken };
}

async function s3For(context: FunctionContext, objectKey: string, actions: string[]) {
  const iamToken = context.token?.access_token;
  if (!iamToken) throw new HttpError(503, "Function service identity is unavailable");
  const credentials = await issueStorageCredentials(iamToken, objectKey, actions);
  const config: S3ClientConfig = {
    endpoint: "https://storage.yandexcloud.net",
    region: "ru-central1",
    forcePathStyle: true,
    credentials,
  };
  return new S3Client(config);
}

async function assertTeacherStudent(teacherId: string, studentId: string | null): Promise<void> {
  if (!studentId) return;
  const student = await db.doc(`students/${studentId}`).get();
  if (!student.exists || student.data()?.teacherId !== teacherId) throw new HttpError(403, "Student ownership mismatch");
}

async function authorizeIntent(uid: string, profile: UserProfile, input: UploadIntentInput): Promise<void> {
  if (input.uploadedBy !== uid) throw new HttpError(403, "Uploader mismatch");
  if (profile.role === "teacher") {
    if (input.ownerType !== "teacher" || input.teacherId !== uid) throw new HttpError(403, "Teacher ownership mismatch");
    await assertTeacherStudent(uid, input.studentId);
    if (input.allowedStudentIds?.length) {
      await Promise.all(input.allowedStudentIds.map((studentId) => assertTeacherStudent(uid, studentId)));
    }
    return;
  }
  const studentId = profile.studentId;
  if (!studentId || input.ownerType !== "student" || input.studentId !== studentId || input.purpose !== "submission") {
    throw new HttpError(403, "Student upload mismatch");
  }
  const homework = await db.doc(`homeworks/${input.homeworkId}`).get();
  if (
    !homework.exists ||
    homework.data()?.studentId !== studentId ||
    homework.data()?.teacherId !== input.teacherId
  ) {
    throw new HttpError(403, "Homework ownership mismatch");
  }
}

async function authorizeAsset(uid: string, profile: UserProfile, asset: FileAssetData): Promise<void> {
  if (profile.role === "teacher" && asset.teacherId === uid) return;
  if (
    profile.role === "student" &&
    profile.studentId === asset.studentId &&
    (asset.purpose === "submission" || asset.allowedStudentIds.includes(profile.studentId ?? ""))
  ) return;
  throw new HttpError(403, "File access denied");
}

function inputFromBody(body: Json): UploadIntentInput {
  return {
    teacherId: String(body.teacherId ?? ""),
    studentId: body.studentId === null || body.studentId === undefined ? null : String(body.studentId),
    uploadedBy: String(body.uploadedBy ?? ""),
    ownerType: String(body.ownerType ?? "") as UploadIntentInput["ownerType"],
    purpose: String(body.purpose ?? "") as UploadIntentInput["purpose"],
    homeworkId: body.homeworkId === null || body.homeworkId === undefined ? null : String(body.homeworkId),
    materialId: body.materialId === null || body.materialId === undefined ? null : String(body.materialId),
    itemId: body.itemId === null || body.itemId === undefined ? null : String(body.itemId),
    submissionId: body.submissionId === null || body.submissionId === undefined ? null : String(body.submissionId),
    allowedStudentIds: Array.isArray(body.allowedStudentIds) ? body.allowedStudentIds.map(String) : [],
    fileName: String(body.fileName ?? ""),
    mimeType: String(body.mimeType ?? ""),
    size: Number(body.size),
  };
}

async function createUploadIntent(event: FunctionEvent, context: FunctionContext) {
  const identity = await authenticate(event);
  await rateLimit(identity.uid, "file_intent", 300);
  const input = inputFromBody(jsonBody(event, context));
  try {
    validateUploadIntent(input);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid upload");
  }
  await authorizeIntent(identity.uid, identity.profile, input);
  const usage = await db.doc(`storageUsage/${input.teacherId}`).get();
  const usageData = usage.data() ?? {};
  const month = new Date().toISOString().slice(0, 7);
  const activeBytes = Number(usageData.activeBytes ?? 0);
  const monthlyBytes = usageData.month === month ? Number(usageData.monthlyUploadedBytes ?? 0) : 0;
  if (activeBytes + input.size > MAX_ACTIVE_STORAGE_BYTES || monthlyBytes + input.size > MAX_MONTHLY_UPLOAD_BYTES) {
    throw new HttpError(413, "Storage quota exceeded");
  }
  const assetId = newAssetId();
  const objectKey = storageObjectKey(assetId, input);
  const reference = db.doc(`fileAssets/${assetId}`);
  await reference.create({
    teacherId: input.teacherId,
    studentId: input.studentId,
    ownerType: input.ownerType,
    uploadedBy: input.uploadedBy,
    purpose: input.purpose,
    homeworkId: input.homeworkId ?? null,
    materialId: input.materialId ?? null,
    itemId: input.itemId ?? null,
    submissionId: input.submissionId ?? null,
    originalName: input.fileName,
    storagePath: objectKey,
    storageProvider: "yandex",
    mimeType: input.mimeType,
    size: input.size,
    previewType: previewType(input.mimeType),
    allowedStudentIds: [...new Set(input.allowedStudentIds ?? [])],
    status: "pending",
    deletedAt: null,
    uploadExpiresAt: Timestamp.fromMillis(Date.now() + 10 * 60_000),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    schemaVersion: 2,
  });
  try {
    const s3 = await s3For(context, objectKey, ["s3:PutObject"]);
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: input.mimeType }),
      { expiresIn: 300 },
    );
    return { assetId, storagePath: objectKey, uploadUrl, expiresIn: 300 };
  } catch (error) {
    await reference.delete().catch(() => undefined);
    throw error;
  }
}

function attachment(assetId: string, asset: FileAssetData) {
  return {
    id: assetId,
    kind: "storage",
    title: asset.originalName,
    url: null,
    storagePath: asset.storagePath,
    contentType: asset.mimeType,
    storageProvider: "yandex",
  };
}

async function finalizeUpload(event: FunctionEvent, context: FunctionContext, assetId: string) {
  const identity = await authenticate(event);
  await rateLimit(identity.uid, "file_finalize", 300);
  const reference = db.doc(`fileAssets/${assetId}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpError(404, "File metadata not found");
  const asset = snapshot.data() as FileAssetData;
  await authorizeAsset(identity.uid, identity.profile, asset);
  if (asset.status === "active") return { assetId, attachment: attachment(assetId, asset), previewType: previewType(asset.mimeType), size: asset.size };
  if (asset.status !== "pending") throw new HttpError(409, "Upload is not pending");
  const s3 = await s3For(context, asset.storagePath, ["s3:GetObject", "s3:DeleteObject"]);
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.storagePath })).catch(() => {
    throw new HttpError(409, "Uploaded object was not found");
  });
  const actualSize = Number(head.ContentLength ?? 0);
  const actualType = head.ContentType ?? "";
  if (actualSize <= 0 || actualSize > MAX_UPLOAD_BYTES || actualSize !== asset.size || actualType !== asset.mimeType) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: asset.storagePath })).catch(() => undefined);
    await reference.update({ status: "deleted", deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    throw new HttpError(400, "Uploaded object does not match the approved file");
  }
  const month = new Date().toISOString().slice(0, 7);
  try {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(reference);
      if (!current.exists) throw new HttpError(404, "File metadata disappeared");
      const currentAsset = current.data() as FileAssetData;
      if (currentAsset.status === "active") return;
      if (currentAsset.status !== "pending") throw new HttpError(409, "Upload state changed");
      const usageReference = db.doc(`storageUsage/${asset.teacherId}`);
      const usageSnapshot = await transaction.get(usageReference);
      const usage = usageSnapshot.data() ?? {};
      const activeBytes = Number(usage.activeBytes ?? 0);
      const monthlyBytes = usage.month === month ? Number(usage.monthlyUploadedBytes ?? 0) : 0;
      if (activeBytes + actualSize > MAX_ACTIVE_STORAGE_BYTES || monthlyBytes + actualSize > MAX_MONTHLY_UPLOAD_BYTES) {
        throw new HttpError(413, "Storage quota exceeded");
      }
      transaction.update(reference, { status: "active", uploadExpiresAt: null, updatedAt: FieldValue.serverTimestamp() });
      transaction.set(
        usageReference,
        {
          teacherId: asset.teacherId,
          activeBytes: activeBytes + actualSize,
          monthlyUploadedBytes: monthlyBytes + actualSize,
          month,
          updatedAt: FieldValue.serverTimestamp(),
          schemaVersion: 1,
        },
        { merge: true },
      );
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 413) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: asset.storagePath })).catch(() => undefined);
      await reference.update({ status: "deleted", deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    throw error;
  }
  return { assetId, attachment: attachment(assetId, { ...asset, status: "active" }), previewType: previewType(asset.mimeType), size: actualSize };
}

async function downloadFile(event: FunctionEvent, context: FunctionContext, assetId: string) {
  const identity = await authenticate(event);
  await rateLimit(identity.uid, "file_download", 600);
  const snapshot = await db.doc(`fileAssets/${assetId}`).get();
  if (!snapshot.exists) throw new HttpError(404, "File not found");
  const asset = snapshot.data() as FileAssetData;
  await authorizeAsset(identity.uid, identity.profile, asset);
  if (asset.status !== "active") throw new HttpError(404, "File is not active");
  const s3 = await s3For(context, asset.storagePath, ["s3:GetObject"]);
  const disposition = `${asset.mimeType.startsWith("image/") || asset.mimeType === "application/pdf" ? "inline" : "attachment"}; filename="${safeFileName(asset.originalName).replace(/["\\]/g, "-")}"`;
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: asset.storagePath, ResponseContentType: asset.mimeType, ResponseContentDisposition: disposition }),
    { expiresIn: 120 },
  );
  return { url, expiresIn: 120 };
}

async function deleteFile(event: FunctionEvent, context: FunctionContext, assetId: string) {
  const identity = await authenticate(event);
  await rateLimit(identity.uid, "file_delete", 300);
  const reference = db.doc(`fileAssets/${assetId}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) return { status: "deleted" };
  const asset = snapshot.data() as FileAssetData;
  await authorizeAsset(identity.uid, identity.profile, asset);
  if (asset.status === "deleted") return { status: "deleted" };
  const s3 = await s3For(context, asset.storagePath, ["s3:DeleteObject"]);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: asset.storagePath })).catch(() => undefined);
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(reference);
    if (!current.exists || current.data()?.status === "deleted") return;
    const usageReference = db.doc(`storageUsage/${asset.teacherId}`);
    const usage = current.data()?.status === "active"
      ? await transaction.get(usageReference)
      : null;
    transaction.update(reference, { status: "deleted", deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (usage) {
      transaction.set(
        usageReference,
        { activeBytes: Math.max(0, Number(usage.data()?.activeBytes ?? 0) - asset.size), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  });
  return { status: "deleted" };
}

function moscowToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function rollingMoscowLessons(startsOn: string, weekday: number, time: string, durationMinutes: number) {
  const [year, month, day] = startsOn.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const first = new Date(Date.UTC(year!, month! - 1, day!, hour! - 3, minute!));
  while (((first.getUTCDay() + 6) % 7) + 1 !== weekday) first.setUTCDate(first.getUTCDate() + 1);
  return Array.from({ length: 12 }, (_, index) => {
    const start = new Date(first);
    start.setUTCDate(first.getUTCDate() + index * 7);
    return { start, end: new Date(start.getTime() + durationMinutes * 60_000) };
  });
}

async function createStudent(event: FunctionEvent, context: FunctionContext) {
  const identity = await authenticate(event);
  if (identity.profile.role !== "teacher") throw new HttpError(403, "Teacher role required");
  await rateLimit(identity.uid, "student_create", 10);
  const body = jsonBody(event, context);
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim();
  const classGrade = Number(body.classGrade);
  const programProfileId = String(body.programProfileId ?? "");
  const goal = String(body.goal ?? "").trim();
  if (!displayName || !Number.isInteger(classGrade) || classGrade < 1 || classGrade > 11 || password.length < 6) {
    throw new HttpError(400, "Invalid student data");
  }
  let email: string;
  try {
    email = usernameToTechnicalEmail(username, aliasDomain);
  } catch {
    throw new HttpError(400, "Invalid username");
  }
  const programProfile = await db.doc(`programProfiles/${programProfileId}`).get();
  if (!programProfile.exists || programProfile.data()?.active === false) throw new HttpError(400, "Program is unavailable");
  await auth.getUserByEmail(email).then(
    () => { throw new HttpError(409, "Username already exists"); },
    (error: { code?: string }) => {
      if (error.code !== "auth/user-not-found") throw error;
    },
  );
  const duplicate = await db.collection("users").where("usernameNormalized", "==", username).limit(1).get();
  if (!duplicate.empty) throw new HttpError(409, "Username already exists");
  const user = await auth.createUser({ email, password, displayName });
  try {
    const now = Timestamp.now();
    const studentId = user.uid;
    const programId = `student-program__${studentId}`;
    const avatar = body.avatarKey ? { avatarKey: String(body.avatarKey) } : {};
    const batch = db.batch();
    batch.create(db.doc(`users/${studentId}`), {
      role: "student", displayName, username, usernameNormalized: username, teacherId: identity.uid, studentId,
      ...avatar, preferences: { theme: "light" },
      timezone: { iana: String(body.timezone ?? "Europe/Moscow"), moscowOffsetMinutes: null },
      createdAt: now, updatedAt: now, schemaVersion: 1,
    });
    batch.create(db.doc(`students/${studentId}`), {
      teacherId: identity.uid, activeProgramId: programId, displayName, classGrade, ...avatar, status: "active",
      defaultConference: { provider: "other", joinUrl: String(body.conferenceUrl ?? "") || null, meetingId: null, passcode: null, chatUrl: null },
      archivedAt: null, createdAt: now, updatedAt: now, schemaVersion: 1,
    });
    batch.create(db.doc(`studentPrograms/${programId}`), {
      teacherId: identity.uid, studentId, programProfileId, status: "active",
      goal: { type: "custom", targetGrade: null, targetScore: null, displayText: goal },
      startedAt: now, completedAt: null, createdAt: now, updatedAt: now, schemaVersion: 1,
    });
    batch.create(db.doc(`studentPaymentAccounts/${studentId}`), {
      teacherId: identity.uid, studentId, balanceLessons: 0, lessonPrice: null, currency: "RUB",
      purchasedLessonCredits: 0, reconciledFromLegacyPaidCount: 0, lastAllocationLessonIds: [], manualPaidBillingIds: [],
      updatedAt: now, createdAt: now, schemaVersion: 1,
    });
    if (body.scheduleWeekday && body.scheduleTime) {
      const startsOn = moscowToday();
      const time = String(body.scheduleTime);
      const weekday = Number(body.scheduleWeekday);
      const durationMinutes = Number(body.scheduleDuration) || 60;
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        throw new HttpError(400, "Invalid schedule");
      }
      const seriesId = `${studentId}__${startsOn}__w${weekday}__${time.replace(":", "")}__i1`;
      const occurrences = rollingMoscowLessons(startsOn, weekday, time, durationMinutes);
      batch.create(db.doc(`lessonSeries/${seriesId}`), {
        teacherId: identity.uid, studentId, studentProgramId: programId, frequency: "weekly", weekdays: [weekday], interval: 1,
        startLocalTime: time, durationMinutes, baseTimezone: "Europe/Moscow", active: true, startsOn, endsOn: null,
        cancelledAt: null, cancelledBy: null, materializedThrough: Timestamp.fromDate(occurrences.at(-1)!.start),
        materializedAt: now, createdAt: now, updatedAt: now, schemaVersion: 1,
      });
      for (const occurrence of occurrences) {
        const startAt = Timestamp.fromDate(occurrence.start);
        const lessonId = `${seriesId}__${startAt.toMillis()}`;
        batch.create(db.doc(`lessons/${lessonId}`), {
          teacherId: identity.uid, studentId, studentProgramId: programId, lessonSeriesId: seriesId,
          startAt, endAt: Timestamp.fromDate(occurrence.end), originalStartAt: null,
          rescheduledFromLessonId: null, rescheduledToLessonId: null, status: "planned", topic: null,
          lessonSummary: { homeworkResultText: null, teacherComment: null, focusNotes: [] }, examTaskNumbers: [],
          homeworkResolution: "pending", conferenceUrl: null, billingType: "regular", billingIdentityId: lessonId,
          paymentStatus: "unpaid", createdAt: now, updatedAt: now, schemaVersion: 1,
        });
      }
    }
    batch.create(db.doc(`teacherAuditEvents/${randomUUID()}`), {
      teacherId: identity.uid, studentId, entityType: "student", entityId: studentId,
      action: "student_created", summary: "Создан аккаунт ученика", createdAt: now, schemaVersion: 1,
    });
    await batch.commit();
    return { studentId, username };
  } catch (error) {
    await auth.deleteUser(user.uid).catch(() => undefined);
    throw error;
  }
}

async function resetStudentPassword(event: FunctionEvent, context: FunctionContext, studentId: string) {
  const identity = await authenticate(event);
  if (identity.profile.role !== "teacher") throw new HttpError(403, "Teacher role required");
  await rateLimit(identity.uid, "password_reset", 20);
  const body = jsonBody(event, context);
  const password = String(body.password ?? "");
  if (password.length < 6) throw new HttpError(400, "Password must contain at least 6 characters");
  const student = await db.doc(`students/${studentId}`).get();
  if (!student.exists || student.data()?.teacherId !== identity.uid) throw new HttpError(403, "Student ownership mismatch");
  await auth.updateUser(studentId, { password });
  await db.collection("teacherAuditEvents").add({
    teacherId: identity.uid, studentId, entityType: "student", entityId: studentId,
    action: "password_reset", summary: "Пароль ученика сброшен", createdAt: FieldValue.serverTimestamp(), schemaVersion: 1,
  });
  return { status: "reset" };
}

function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function interpretAI(event: FunctionEvent, context: FunctionContext) {
  if (!aiAssistantEnabled) throw new HttpError(404, "AI assistant is disabled");
  const identity = await authenticate(event);
  if (!isTeacherAIActor(identity.profile)) throw new HttpError(403, "Teacher role required");
  const dayKey = new Date().toISOString().slice(0, 10);
  await rateLimit(identity.uid, `ai_interpret_${dayKey}`, 100);
  const parsed = aiInterpretInputSchema.safeParse(jsonBody(event, context));
  if (!parsed.success) throw new HttpError(400, "Не удалось разобрать команду");
  if (parsed.data.context.selectedStudentId) {
    await assertTeacherStudent(identity.uid, parsed.data.context.selectedStudentId);
  }
  const startedAt = Date.now();
  const auditReference = db.collection("aiActionAuditEvents").doc();
  const baseUrl = process.env.AI_BASE_URL?.trim() || "https://ai.api.cloud.yandex.net/v1";
  const modelUri = process.env.AI_MODEL_URI?.trim();
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!modelUri || !apiKey) throw new HttpError(503, "AI временно недоступен");
  const students = await findStudentsByName(db, identity.uid, parsed.data.command);
  if (parsed.data.context.selectedStudentId && !students.some(({ id }) => id === parsed.data.context.selectedStudentId)) {
    const student = await db.doc(`students/${parsed.data.context.selectedStudentId}`).get();
    if (student.exists) students.push({ id: student.id, displayName: String(student.data()?.displayName ?? "") });
  }
  const selectedStudentId = parsed.data.context.selectedStudentId ?? (students.length === 1 ? students[0]!.id : null);
  const [lessons, plannerItems, activeHomework, pendingReviews] = await Promise.all([
    getTeacherScheduleRange(db, identity.uid, Date.now() - 14 * 86_400_000, Date.now() + 90 * 86_400_000),
    getPlannerItemsRange(db, identity.uid, addIsoDays(parsed.data.context.today, -14), addIsoDays(parsed.data.context.today, 90)),
    selectedStudentId ? getActiveHomework(db, identity.uid, selectedStudentId) : Promise.resolve([]),
    getPendingHomeworkReviews(db, identity.uid),
  ]);
  const provider = new YandexAIProvider(baseUrl, modelUri, apiKey);
  try {
    const result = await provider.interpret({
      command: parsed.data.command,
      context: {
        now: new Date().toISOString(),
        today: parsed.data.context.today,
        timezone: parsed.data.context.timezone,
        students,
        selectedStudentId,
        lessons,
        plannerItems,
        activeHomework,
        pendingReviews,
      },
    });
    const relatedIds = [
      "studentId" in result.draft ? result.draft.studentId : null,
      "lessonId" in result.draft ? result.draft.lessonId : null,
      "itemId" in result.draft ? result.draft.itemId : null,
    ].filter((value): value is string => Boolean(value));
    await auditReference.set({
      teacherId: identity.uid,
      actionType: result.draft.actionType,
      status: "draft_created",
      relatedEntityIds: relatedIds,
      model: result.model,
      latencyMs: Date.now() - startedAt,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      rawPromptStored: false,
      createdAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    });
    return result.draft;
  } catch (error) {
    await auditReference.set({ teacherId: identity.uid, actionType: "unknown", status: "failed", relatedEntityIds: [], model: modelUri, latencyMs: Date.now() - startedAt, errorCode: error instanceof Error ? error.name : "Error", rawPromptStored: false, createdAt: FieldValue.serverTimestamp(), schemaVersion: 1 }).catch(() => undefined);
    throw new HttpError(503, "AI временно недоступен");
  }
}

async function aiUsage(event: FunctionEvent) {
  if (!aiAssistantEnabled) throw new HttpError(404, "AI assistant is disabled");
  const identity = await authenticate(event);
  if (!isTeacherAIActor(identity.profile)) throw new HttpError(403, "Teacher role required");
  const snapshot = await db.collection("aiActionAuditEvents").where("teacherId", "==", identity.uid).limit(1000).get();
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
  const rows = snapshot.docs.map((document) => document.data()).filter((row) => row.createdAt?.toMillis);
  const monthRows = rows.filter((row) => row.createdAt.toMillis() >= monthStart);
  const actionTypes: Record<string, number> = {};
  monthRows.forEach((row) => { actionTypes[String(row.actionType)] = (actionTypes[String(row.actionType)] ?? 0) + 1; });
  return {
    today: rows.filter((row) => row.createdAt.toMillis() >= dayStart).length,
    month: monthRows.length,
    failures: monthRows.filter((row) => row.status === "failed").length,
    inputTokens: monthRows.reduce((sum, row) => sum + Number(row.inputTokens ?? 0), 0),
    outputTokens: monthRows.reduce((sum, row) => sum + Number(row.outputTokens ?? 0), 0),
    actionTypes,
  };
}

export async function handler(event: FunctionEvent, context: FunctionContext) {
  let origin: string | null = null;
  try {
    origin = originOf(event);
    const method = (event.httpMethod ?? "GET").toUpperCase();
    if (method === "OPTIONS") return corsResponse(origin);
    const path = pathOf(event).replace(/\/+$/, "") || "/";
    if (method === "GET" && path === "/v1/health") return response(200, { status: "ok", projectId: firebaseProjectId }, origin);
    if (method === "POST" && path === "/v1/students") return response(200, await createStudent(event, context), origin);
    if (method === "POST" && (path === "/v1/ai/interpret" || path === "/ai/interpret")) return response(200, await interpretAI(event, context), origin);
    if (method === "GET" && (path === "/v1/ai/usage" || path === "/ai/usage")) return response(200, await aiUsage(event), origin);
    const passwordMatch = path.match(/^\/v1\/students\/([^/]+)\/password$/);
    if (method === "POST" && passwordMatch) return response(200, await resetStudentPassword(event, context, decodeURIComponent(passwordMatch[1]!)), origin);
    if (method === "POST" && path === "/v1/files/upload-intent") return response(200, await createUploadIntent(event, context), origin);
    const finalizeMatch = path.match(/^\/v1\/files\/([^/]+)\/finalize$/);
    if (method === "POST" && finalizeMatch) return response(200, await finalizeUpload(event, context, decodeURIComponent(finalizeMatch[1]!)), origin);
    const downloadMatch = path.match(/^\/v1\/files\/([^/]+)\/download$/);
    if (method === "GET" && downloadMatch) return response(200, await downloadFile(event, context, decodeURIComponent(downloadMatch[1]!)), origin);
    const deleteMatch = path.match(/^\/v1\/files\/([^/]+)$/);
    if (method === "DELETE" && deleteMatch) return response(200, await deleteFile(event, context, decodeURIComponent(deleteMatch[1]!)), origin);
    throw new HttpError(404, "Endpoint not found");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "Internal server error";
    console.error(JSON.stringify({ requestId: context.requestId ?? null, status, error: error instanceof Error ? error.name : "Error" }));
    return response(status, { error: message }, origin);
  }
}

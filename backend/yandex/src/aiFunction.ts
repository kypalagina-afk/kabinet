import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { isTeacherAIActor } from "./ai/authorization.js";
import { rescheduleClarification } from "./ai/clarification.js";
import {
  findStudentsByName,
  getActiveHomework,
  getPendingHomeworkReviews,
  getPlannerItemsRange,
  getTeacherScheduleRange,
} from "./ai/context.js";
import { safeAIProviderErrorCode, YandexAIProvider } from "./ai/provider.js";
import { referenceClarification, validateDraftReferences } from "./ai/references.js";
import {
  aiInterpretInputSchema,
  voiceTranscriptionInputSchema,
  voiceTranscriptionStatusInputSchema,
} from "./ai/schema.js";
import {
  MAX_VOICE_AUDIO_BYTES,
  SpeechKitError,
  YandexSpeechKitProvider,
} from "./ai/speechkit.js";
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
}

interface FunctionContext {
  requestId?: string;
  getPayload?: () => unknown;
}

interface UserProfile extends Json {
  role: "teacher" | "student";
}

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing backend environment variable: ${name}`);
  return value;
}

const firebaseProjectId = required("FIREBASE_PROJECT_ID");
const allowedOrigins = new Set(
  required("ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const aiAssistantEnabled = process.env.AI_ASSISTANT_ENABLED === "true";
const aiBaseUrl = process.env.AI_BASE_URL?.trim() || "https://ai.api.cloud.yandex.net/v1";
const aiModelUri = required("AI_MODEL_URI");
const aiApiKey = required("AI_API_KEY");
const dailyRequestLimit = Number(process.env.AI_DAILY_REQUEST_LIMIT || "100");
const voiceInputEnabled = process.env.VOICE_INPUT_ENABLED === "true";
const speechKitBaseUrl = process.env.SPEECHKIT_BASE_URL?.trim() || "https://stt.api.cloud.yandex.net";
const speechKitOperationsBaseUrl = process.env.SPEECHKIT_OPERATIONS_BASE_URL?.trim() || "https://operation.api.cloud.yandex.net";
const speechKitApiKey = process.env.SPEECHKIT_API_KEY?.trim() || "";
const voiceDailyRequestLimit = Number(process.env.VOICE_DAILY_REQUEST_LIMIT || "50");

if (!Number.isInteger(dailyRequestLimit) || dailyRequestLimit < 1 || dailyRequestLimit > 1000) {
  throw new Error("AI_DAILY_REQUEST_LIMIT must be an integer from 1 to 1000");
}
if (!Number.isInteger(voiceDailyRequestLimit) || voiceDailyRequestLimit < 1 || voiceDailyRequestLimit > 500) {
  throw new Error("VOICE_DAILY_REQUEST_LIMIT must be an integer from 1 to 500");
}

const credentialJson = parseFirebaseCredential(
  firebaseProjectId,
  process.env.FIREBASE_ADMIN_JSON,
  process.env.FIREBASE_ADMIN_JSON_B64,
);
const existingApp = getApps().find((app) => app.name === "kabinet-ai-backend");
const firebaseApp =
  existingApp ??
  initializeApp(
    {
      credential: cert({
        projectId: credentialJson.project_id,
        clientEmail: credentialJson.client_email,
        privateKey: credentialJson.private_key,
      }),
      projectId: firebaseProjectId,
    },
    "kabinet-ai-backend",
  );
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

function header(event: FunctionEvent, name: string): string | undefined {
  const target = name.toLowerCase();
  return Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === target)?.[1];
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
  result.headers["access-control-allow-methods"] = "GET,POST,OPTIONS";
  result.headers["access-control-allow-headers"] = "Content-Type,X-Firebase-Auth";
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
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "JSON object required");
  }
  return parsed as Json;
}

async function authenticateTeacher(event: FunctionEvent): Promise<{ uid: string; profile: UserProfile }> {
  const token = (header(event, "x-firebase-auth") ?? header(event, "authorization"))?.replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) throw new HttpError(401, "Authentication required");
  const decoded = await auth.verifyIdToken(token, true).catch(() => {
    throw new HttpError(401, "Invalid authentication token");
  });
  const profileSnapshot = await db.doc(`users/${decoded.uid}`).get();
  if (!profileSnapshot.exists) throw new HttpError(403, "User profile is missing");
  const profile = profileSnapshot.data() as UserProfile;
  if (!isTeacherAIActor(profile)) throw new HttpError(403, "Teacher role required");
  return { uid: decoded.uid, profile };
}

async function rateLimit(uid: string, action: string, limit: number): Promise<void> {
  const safeUid = Buffer.from(uid).toString("base64url");
  const reference = db.doc(`backendRateLimits/${safeUid}__${action}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const count = Number(snapshot.data()?.count ?? 0);
    if (count >= limit) throw new HttpError(429, "Too many requests");
    transaction.set(
      reference,
      {
        uidHash: safeUid,
        action,
        count: count + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

async function assertTeacherStudent(teacherId: string, studentId: string): Promise<void> {
  const student = await db.doc(`students/${studentId}`).get();
  if (!student.exists || student.data()?.teacherId !== teacherId) {
    throw new HttpError(403, "Student ownership mismatch");
  }
}

function addIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function interpretAI(event: FunctionEvent, context: FunctionContext) {
  if (!aiAssistantEnabled) throw new HttpError(404, "AI assistant is disabled");
  const identity = await authenticateTeacher(event);
  const dayKey = new Date().toISOString().slice(0, 10);
  await rateLimit(identity.uid, `ai_interpret_${dayKey}`, dailyRequestLimit);

  const parsed = aiInterpretInputSchema.safeParse(jsonBody(event, context));
  if (!parsed.success) throw new HttpError(400, "Не удалось разобрать команду");
  if (parsed.data.context.selectedStudentId) {
    await assertTeacherStudent(identity.uid, parsed.data.context.selectedStudentId);
  }

  const startedAt = Date.now();
  const auditReference = db.collection("aiActionAuditEvents").doc();
  const deterministicClarification = rescheduleClarification(
    parsed.data.command,
    `clarification-${context.requestId ?? auditReference.id}`,
  );
  if (deterministicClarification) {
    await auditReference.set({
      teacherId: identity.uid,
      actionType: deterministicClarification.actionType,
      status: "draft_created",
      relatedEntityIds: [],
      model: "server-guard",
      latencyMs: Date.now() - startedAt,
      inputTokens: 0,
      outputTokens: 0,
      rawPromptStored: false,
      createdAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    });
    return deterministicClarification;
  }
  const students = await findStudentsByName(db, identity.uid, parsed.data.command);
  if (
    parsed.data.context.selectedStudentId &&
    !students.some(({ id }) => id === parsed.data.context.selectedStudentId)
  ) {
    const student = await db.doc(`students/${parsed.data.context.selectedStudentId}`).get();
    if (student.exists) {
      students.push({ id: student.id, displayName: String(student.data()?.displayName ?? "") });
    }
  }
  const selectedStudentId =
    parsed.data.context.selectedStudentId ?? (students.length === 1 ? students[0]!.id : null);
  const [lessons, plannerItems, activeHomework, pendingReviews] = await Promise.all([
    getTeacherScheduleRange(db, identity.uid, Date.now() - 14 * 86_400_000, Date.now() + 90 * 86_400_000),
    getPlannerItemsRange(
      db,
      identity.uid,
      addIsoDays(parsed.data.context.today, -14),
      addIsoDays(parsed.data.context.today, 90),
    ),
    selectedStudentId ? getActiveHomework(db, identity.uid, selectedStudentId) : Promise.resolve([]),
    getPendingHomeworkReviews(db, identity.uid),
  ]);
  const provider = new YandexAIProvider(aiBaseUrl, aiModelUri, aiApiKey);

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
    const referenceError = validateDraftReferences(result.draft, {
      studentIds: new Set(students.map(({ id }) => id)),
      lessons,
      plannerItemIds: new Set(plannerItems.map(({ id }) => id)),
    });
    const draft = referenceError
      ? referenceClarification(result.draft.draftId, referenceError)
      : result.draft;
    const relatedIds = [
      "studentId" in draft ? draft.studentId : null,
      "lessonId" in draft ? draft.lessonId : null,
      "itemId" in draft ? draft.itemId : null,
    ].filter((value): value is string => Boolean(value));
    await auditReference.set({
      teacherId: identity.uid,
      actionType: draft.actionType,
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
    return draft;
  } catch (error) {
    const providerErrorCode = safeAIProviderErrorCode(error);
    console.error(
      JSON.stringify({
        requestId: context.requestId ?? null,
        status: 503,
        error: "AIProviderError",
        providerErrorCode,
      }),
    );
    await auditReference
      .set({
        teacherId: identity.uid,
        actionType: "unknown",
        status: "failed",
        relatedEntityIds: [],
        model: aiModelUri,
        latencyMs: Date.now() - startedAt,
        errorCode: providerErrorCode,
        rawPromptStored: false,
        createdAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      })
      .catch(() => undefined);
    throw new HttpError(503, "AI временно недоступен");
  }
}

async function aiUsage(event: FunctionEvent) {
  if (!aiAssistantEnabled) throw new HttpError(404, "AI assistant is disabled");
  const identity = await authenticateTeacher(event);
  const snapshot = await db
    .collection("aiActionAuditEvents")
    .where("teacherId", "==", identity.uid)
    .limit(1000)
    .get();
  const now = new Date();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const rows = snapshot.docs.map((document) => document.data()).filter((row) => row.createdAt?.toMillis);
  const monthRows = rows.filter((row) => row.createdAt.toMillis() >= monthStart);
  const actionTypes: Record<string, number> = {};
  monthRows.forEach((row) => {
    const actionType = String(row.actionType);
    actionTypes[actionType] = (actionTypes[actionType] ?? 0) + 1;
  });
  return {
    today: rows.filter((row) => row.createdAt.toMillis() >= dayStart).length,
    month: monthRows.length,
    failures: monthRows.filter((row) => row.status === "failed").length,
    inputTokens: monthRows.reduce((sum, row) => sum + Number(row.inputTokens ?? 0), 0),
    outputTokens: monthRows.reduce((sum, row) => sum + Number(row.outputTokens ?? 0), 0),
    actionTypes,
  };
}

function transcriptionJobId(operationId: string): string {
  return createHash("sha256").update(operationId).digest("hex");
}

function speechKitProvider(): YandexSpeechKitProvider {
  if (!voiceInputEnabled) throw new HttpError(404, "Голосовой ввод пока не включён");
  if (!speechKitApiKey) throw new HttpError(503, "Голосовой ввод временно недоступен");
  return new YandexSpeechKitProvider(speechKitBaseUrl, speechKitApiKey, speechKitOperationsBaseUrl);
}

function validatedWav(audioBase64: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) {
    throw new HttpError(400, "Некорректная аудиозапись");
  }
  const audio = Buffer.from(audioBase64, "base64");
  if (audio.length < 44 || audio.length > MAX_VOICE_AUDIO_BYTES) {
    throw new HttpError(413, "Аудиозапись слишком большая");
  }
  if (audio.subarray(0, 4).toString("ascii") !== "RIFF" || audio.subarray(8, 12).toString("ascii") !== "WAVE") {
    throw new HttpError(400, "Поддерживается только WAV-аудио");
  }
  return audio;
}

async function startVoiceTranscription(event: FunctionEvent, context: FunctionContext) {
  const provider = speechKitProvider();
  const identity = await authenticateTeacher(event);
  const parsed = voiceTranscriptionInputSchema.safeParse(jsonBody(event, context));
  if (!parsed.success) throw new HttpError(400, "Некорректная аудиозапись");
  const audio = validatedWav(parsed.data.audioBase64);
  const dayKey = new Date().toISOString().slice(0, 10);
  await rateLimit(identity.uid, `voice_transcription_${dayKey}`, voiceDailyRequestLimit);

  const operationId = await provider.submitWav(audio.toString("base64"));
  const now = Date.now();
  await db.doc(`aiTranscriptionJobs/${transcriptionJobId(operationId)}`).set({
    teacherId: identity.uid,
    operationIdHash: transcriptionJobId(operationId),
    status: "pending",
    durationMs: parsed.data.durationMs,
    audioBytes: audio.length,
    rawAudioStored: false,
    transcriptStored: false,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + 60 * 60_000),
    schemaVersion: 1,
  });
  return { status: "pending", operationId };
}

async function pollVoiceTranscription(event: FunctionEvent, context: FunctionContext) {
  const provider = speechKitProvider();
  const identity = await authenticateTeacher(event);
  const parsed = voiceTranscriptionStatusInputSchema.safeParse(jsonBody(event, context));
  if (!parsed.success) throw new HttpError(400, "Некорректный идентификатор распознавания");
  const reference = db.doc(`aiTranscriptionJobs/${transcriptionJobId(parsed.data.operationId)}`);
  const snapshot = await reference.get();
  if (!snapshot.exists || snapshot.data()?.teacherId !== identity.uid) {
    throw new HttpError(403, "Распознавание недоступно");
  }
  if (snapshot.data()?.status === "consumed") {
    throw new HttpError(410, "Результат распознавания уже получен");
  }
  const expiresAt = snapshot.data()?.expiresAt;
  if (expiresAt?.toMillis && expiresAt.toMillis() < Date.now()) {
    throw new HttpError(410, "Время ожидания распознавания истекло");
  }

  const result = await provider.status(parsed.data.operationId);
  if (result.status === "pending") return result;
  await provider.deleteResult(parsed.data.operationId);
  await reference.set({
    status: "consumed",
    resultDeletedAt: FieldValue.serverTimestamp(),
    transcriptStored: false,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection("aiActionAuditEvents").add({
    teacherId: identity.uid,
    actionType: "VOICE_TRANSCRIPTION",
    status: "completed",
    relatedEntityIds: [],
    model: "speechkit-general",
    durationMs: Number(snapshot.data()?.durationMs ?? 0),
    audioBytes: Number(snapshot.data()?.audioBytes ?? 0),
    rawAudioStored: false,
    transcriptStored: false,
    createdAt: FieldValue.serverTimestamp(),
    schemaVersion: 1,
  });
  return { status: "done", transcript: result.transcript };
}

export async function handler(event: FunctionEvent, context: FunctionContext) {
  let origin: string | null = null;
  try {
    origin = originOf(event);
    const method = (event.httpMethod ?? "GET").toUpperCase();
    if (method === "OPTIONS") return corsResponse(origin);
    const path = pathOf(event).replace(/\/+$/, "") || "/";
    if (method === "GET" && path === "/v1/health") {
      return response(200, { status: "ok", service: "kabinet-ai-api", projectId: firebaseProjectId, voiceInputEnabled: voiceInputEnabled && Boolean(speechKitApiKey) }, origin);
    }
    if (method === "POST" && (path === "/v1/ai/interpret" || path === "/ai/interpret")) {
      return response(200, await interpretAI(event, context), origin);
    }
    if (method === "GET" && (path === "/v1/ai/usage" || path === "/ai/usage")) {
      return response(200, await aiUsage(event), origin);
    }
    if (method === "POST" && path === "/v1/ai/transcribe") {
      return response(202, await startVoiceTranscription(event, context), origin);
    }
    if (method === "POST" && path === "/v1/ai/transcription") {
      return response(200, await pollVoiceTranscription(event, context), origin);
    }
    throw new HttpError(404, "Endpoint not found");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "Internal server error";
    console.error(
      JSON.stringify({
        requestId: context.requestId ?? null,
        status,
        error: error instanceof Error ? error.name : "Error",
        errorCode: error instanceof SpeechKitError ? error.code : null,
      }),
    );
    return response(status, { error: message }, origin);
  }
}

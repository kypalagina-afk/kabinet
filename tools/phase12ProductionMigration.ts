import { createRequire } from "node:module";
import {
  EGE_RUSSIAN_2027_PROJECT_ID,
  OGE_RUSSIAN_2027_PROJECT_ID,
  examBlueprintSeeds,
  validateBlueprintTotals,
} from "../src/features/exams/blueprints.js";

const PROJECT_ID = "kabinet-25";
const APPLY_CONFIRMATION = "APPLY_PHASE12_CATALOG";
const require = createRequire(import.meta.url);

interface FirebaseCliAccount {
  tokens: { refresh_token?: string };
}

interface FirebaseCliAuth {
  getGlobalDefaultAccount(): FirebaseCliAccount | undefined;
  getAccessToken(
    refreshToken: string | undefined,
    scopes: string[],
  ): Promise<{ access_token: string; expires_in?: number }>;
}

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function firebaseCliAccessToken(): Promise<string> {
  const auth = require("firebase-tools/lib/auth.js") as FirebaseCliAuth;
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw new Error("Firebase CLI login is required");
  return (await auth.getAccessToken(account.tokens.refresh_token, [])).access_token;
}

type FirestoreValue = Record<string, unknown>;
interface RestDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  updateTime?: string;
}

function firestoreValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value && typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).filter(([, nested]) => nested !== undefined)
            .map(([key, nested]) => [key, firestoreValue(nested)]),
        ),
      },
    };
  }
  throw new Error(`Unsupported Firestore value: ${typeof value}`);
}

function firestoreFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, firestoreValue(value)]),
  );
}

function stringField(document: RestDocument, name: string): string | undefined {
  return document.fields?.[name]?.stringValue as string | undefined;
}

function integerValue(value: FirestoreValue | undefined): number | null {
  const raw = value?.integerValue;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function secondaryScoreScaleField(document: RestDocument | null): Array<{ primary: number; secondary: number }> {
  const field = document?.fields?.secondaryScoreScale as {
    arrayValue?: { values?: Array<{ mapValue?: { fields?: Record<string, FirestoreValue> } }> };
  } | undefined;
  return (field?.arrayValue?.values ?? []).flatMap((item) => {
    const primary = integerValue(item.mapValue?.fields?.primary);
    const secondary = integerValue(item.mapValue?.fields?.secondary);
    return primary === null || secondary === null ? [] : [{ primary, secondary }];
  });
}

async function apiRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T | null }> {
  const response = await fetch(`https://firestore.googleapis.com/v1/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (response.status === 404) return { status: 404, body: null };
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(`Firestore REST ${response.status}: ${body.error?.message ?? "unknown error"}`);
  }
  return { status: response.status, body };
}

async function main(): Promise<void> {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Production migration refuses FIRESTORE_EMULATOR_HOST");
  }
  const apply = process.argv.includes("--apply");
  if (apply && (
    argumentValue("--confirm-project") !== PROJECT_ID
    || argumentValue("--confirm-write") !== APPLY_CONFIRMATION
  )) {
    throw new Error("Production apply requires exact project and write confirmations");
  }
  for (const id of [OGE_RUSSIAN_2027_PROJECT_ID, EGE_RUSSIAN_2027_PROJECT_ID]) {
    if (!validateBlueprintTotals(examBlueprintSeeds[id] as never)) {
      throw new Error(`Blueprint totals are invalid: ${id}`);
    }
  }

  const token = await firebaseCliAccessToken();
  const root = `projects/${PROJECT_ID}/databases/(default)/documents`;
  const documentPaths = {
    ogeProfile: `${root}/programProfiles/oge-russian-2027`,
    egeProfile: `${root}/programProfiles/ege-russian-2027`,
    ogeBlueprint: `${root}/examBlueprints/${OGE_RUSSIAN_2027_PROJECT_ID}`,
    egeBlueprint: `${root}/examBlueprints/${EGE_RUSSIAN_2027_PROJECT_ID}`,
  };
  const [ogeProfileResult, egeProfileResult, ogeBlueprintResult, egeBlueprintResult] = await Promise.all(
    Object.values(documentPaths).map((path) => apiRequest<RestDocument>(token, path)),
  );
  const ogeProfile = ogeProfileResult.body;
  const egeProfile = egeProfileResult.body;
  const ogeBlueprint = ogeBlueprintResult.body;
  const egeBlueprint = egeBlueprintResult.body;
  const expectedEgeScale = examBlueprintSeeds[EGE_RUSSIAN_2027_PROJECT_ID].secondaryScoreScale ?? [];
  const egeScaleCurrent = JSON.stringify(secondaryScoreScaleField(egeBlueprint)) === JSON.stringify(expectedEgeScale);
  if (!ogeProfile) throw new Error("Stable OGE program profile is missing");
  if (stringField(ogeProfile, "subject") !== "russian"
    || !["exam", "oge"].includes(String(stringField(ogeProfile, "type")))) {
    throw new Error("Stable OGE program profile has an unexpected identity");
  }

  const actions: string[] = [];
  if (stringField(ogeProfile, "currentBlueprintId") !== OGE_RUSSIAN_2027_PROJECT_ID)
    actions.push(`update programProfiles/oge-russian-2027.currentBlueprintId`);
  if (!ogeBlueprint) actions.push(`create examBlueprints/${OGE_RUSSIAN_2027_PROJECT_ID}`);
  if (!egeBlueprint) actions.push(`create examBlueprints/${EGE_RUSSIAN_2027_PROJECT_ID}`);
  else if (!egeScaleCurrent) actions.push(`update examBlueprints/${EGE_RUSSIAN_2027_PROJECT_ID}.secondaryScoreScale`);
  if (!egeProfile) actions.push("create programProfiles/ege-russian-2027");
  console.log(`Verified project: ${PROJECT_ID}`);
  console.log(actions.length ? actions.join("\n") : "Phase 12 catalog is already current (noop).");
  if (!apply || actions.length === 0) {
    console.log(apply ? "No writes were required." : "Plan only: no writes were performed.");
    return;
  }

  const now = new Date().toISOString();
  const writes: Array<Record<string, unknown>> = [];
  if (stringField(ogeProfile, "currentBlueprintId") !== OGE_RUSSIAN_2027_PROJECT_ID) {
    writes.push({
      update: { name: documentPaths.ogeProfile, fields: firestoreFields({
        currentBlueprintId: OGE_RUSSIAN_2027_PROJECT_ID,
        updatedAt: { __timestamp: now },
      }) },
      updateMask: { fieldPaths: ["currentBlueprintId", "updatedAt"] },
      currentDocument: { updateTime: ogeProfile.updateTime },
    });
  }
  const timestampAwareFields = (data: Record<string, unknown>) => {
    const fields = firestoreFields(data);
    fields.createdAt = { timestampValue: now };
    fields.updatedAt = { timestampValue: now };
    return fields;
  };
  // Replace the temporary timestamp marker used by the masked update.
  if (writes.length) {
    const update = writes[0]?.update as { fields?: Record<string, FirestoreValue> } | undefined;
    if (update?.fields) update.fields.updatedAt = { timestampValue: now };
  }
  if (!ogeBlueprint) {
    writes.push({ update: { name: documentPaths.ogeBlueprint, fields: timestampAwareFields({
      ...examBlueprintSeeds[OGE_RUSSIAN_2027_PROJECT_ID],
      schemaVersion: 1,
    }) }, currentDocument: { exists: false } });
  }
  if (!egeBlueprint) {
    writes.push({ update: { name: documentPaths.egeBlueprint, fields: timestampAwareFields({
      ...examBlueprintSeeds[EGE_RUSSIAN_2027_PROJECT_ID],
      schemaVersion: 1,
    }) }, currentDocument: { exists: false } });
  } else if (!egeScaleCurrent) {
    writes.push({
      update: {
        name: documentPaths.egeBlueprint,
        fields: {
          secondaryScoreScale: firestoreValue(expectedEgeScale),
          updatedAt: { timestampValue: now },
        },
      },
      updateMask: { fieldPaths: ["secondaryScoreScale", "updatedAt"] },
      currentDocument: { updateTime: egeBlueprint.updateTime },
    });
  }
  if (!egeProfile) {
    writes.push({ update: { name: documentPaths.egeProfile, fields: timestampAwareFields({
      type: "exam",
      examKind: "ege",
      subject: "russian",
      targetYear: 2027,
      title: "ЕГЭ · Русский язык",
      displayName: "ЕГЭ · Русский язык",
      examDate: null,
      status: "active",
      examBlueprintId: EGE_RUSSIAN_2027_PROJECT_ID,
      currentBlueprintId: EGE_RUSSIAN_2027_PROJECT_ID,
      schemaVersion: 1,
    }) }, currentDocument: { exists: false } });
  }
  await apiRequest(token, `${root}:commit`, {
    method: "POST",
    body: JSON.stringify({ writes }),
  });

  const verification = await Promise.all(
    Object.values(documentPaths).map((path) => apiRequest<RestDocument>(token, path)),
  );
  if (verification.some(({ body }) => !body)) {
    throw new Error("Post-migration verification found a missing catalog document");
  }
  if (stringField(verification[0].body!, "currentBlueprintId") !== OGE_RUSSIAN_2027_PROJECT_ID) {
    throw new Error("Post-migration OGE blueprint pointer verification failed");
  }
  if (stringField(verification[1].body!, "currentBlueprintId") !== EGE_RUSSIAN_2027_PROJECT_ID) {
    throw new Error("Post-migration EGE blueprint pointer verification failed");
  }
  if (JSON.stringify(secondaryScoreScaleField(verification[3].body)) !== JSON.stringify(expectedEgeScale)) {
    throw new Error("Post-migration EGE secondary-score scale verification failed");
  }
  console.log(`Applied ${actions.length} catalog actions and verified all four documents.`);
  console.log("Existing students, assessments, homework and historical blueprint links were not modified.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

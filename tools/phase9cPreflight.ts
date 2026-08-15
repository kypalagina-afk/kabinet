import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applicationDefault, deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import {
  DocumentReference,
  GeoPoint,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";
import { validatePlan } from "./seed.js";

const PROJECT_ID = "kabinet-25";
const SENSITIVE_FIELD = /(password|passcode|secret|credential|privatekey|access.?token|refresh.?token|id.?token)/i;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_FIELD.test(key)) {
    return { redacted: true, sha256: sha256(stable(value)) };
  }
  if (value instanceof Timestamp) return { timestamp: value.toDate().toISOString() };
  if (value instanceof Date) return { date: value.toISOString() };
  if (value instanceof GeoPoint) {
    return { geoPoint: { latitude: value.latitude, longitude: value.longitude } };
  }
  if (value instanceof DocumentReference) return { documentReference: value.path };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { bytesRedacted: true, sha256: sha256(Buffer.from(value).toString("base64")) };
  }
  if (Array.isArray(value)) return value.map((child) => safeValue(child));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
        childKey,
        safeValue(child, childKey),
      ]),
    );
  }
  return value;
}

function safeAuthUser(user: UserRecord) {
  return {
    uid: user.uid,
    email: user.email ?? null,
    emailVerified: user.emailVerified,
    displayName: user.displayName ?? null,
    disabled: user.disabled,
    customClaims: safeValue(user.customClaims ?? {}),
    metadata: {
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime ?? null,
    },
    providerIds: user.providerData.map(({ providerId }) => providerId).sort(),
  };
}

async function listAllAuthUsers(app: App) {
  const auth = getAuth(app);
  const users: ReturnType<typeof safeAuthUser>[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users.map(safeAuthUser));
    pageToken = page.pageToken;
  } while (pageToken);
  return users.sort((left, right) => left.uid.localeCompare(right.uid));
}

async function listAllDocuments(app: App) {
  const db = getFirestore(app);
  const documents: Array<{
    path: string;
    createTime: string | null;
    updateTime: string | null;
    data: unknown;
  }> = [];

  async function visitCollection(collection: FirebaseFirestore.CollectionReference) {
    const snapshot = await collection.get();
    for (const document of snapshot.docs) {
      documents.push({
        path: document.ref.path,
        createTime: document.createTime?.toDate().toISOString() ?? null,
        updateTime: document.updateTime?.toDate().toISOString() ?? null,
        data: safeValue(document.data()),
      });
      const children = await document.ref.listCollections();
      for (const child of children) await visitCollection(child);
    }
  }

  const roots = await db.listCollections();
  for (const collection of roots) await visitCollection(collection);
  return documents.sort((left, right) => left.path.localeCompare(right.path));
}

async function main(): Promise<void> {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Phase 9C production snapshot refuses Firebase emulator variables");
  }
  const credentialProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
  if (credentialProjectId && credentialProjectId !== PROJECT_ID) {
    throw new Error(`Environment project mismatch: ${credentialProjectId}`);
  }

  const app = initializeApp(
    { credential: applicationDefault(), projectId: PROJECT_ID },
    `phase9c-preflight-${Date.now()}`,
  );
  try {
    const seedPath = resolve(import.meta.dirname, "..", "private", "pilot-lera.phase3.json");
    const plan = validatePlan(JSON.parse(await readFile(seedPath, "utf8")) as unknown);
    const expectedPilotPaths = new Set(plan.writes.map(({ path }) => path));
    const [authUsers, documents] = await Promise.all([
      listAllAuthUsers(app),
      listAllDocuments(app),
    ]);
    const unexpectedAuthUsers = authUsers
      .filter(({ uid }) => !plan.authUsers.some((expected) => expected.uid === uid))
      .map(({ uid, email }) => ({ uid, email }));
    const unexpectedDocuments = documents
      .filter(({ path }) => !expectedPilotPaths.has(path))
      .map(({ path }) => path);
    const collections = Object.entries(
      documents.reduce<Record<string, number>>((counts, { path }) => {
        const collection = path.split("/")[0] ?? path;
        counts[collection] = (counts[collection] ?? 0) + 1;
        return counts;
      }, {}),
    )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([collection, count]) => ({ collection, count }));
    const capturedAt = new Date().toISOString();
    const payload = {
      format: "kabinet-phase9c-safe-snapshot-v1",
      projectId: PROJECT_ID,
      capturedAt,
      authUsers,
      firestoreDocuments: documents,
      unexpectedAuthUsers,
      unexpectedDocuments,
    };
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    const outputDir = resolve(import.meta.dirname, "..", "private", "phase9c-snapshots");
    await mkdir(outputDir, { recursive: true });
    const fileName = `preflight-${capturedAt.replace(/[:.]/g, "-")}.json`;
    const outputPath = resolve(outputDir, fileName);
    await writeFile(outputPath, serialized, { encoding: "utf8", flag: "wx" });

    console.log(`Verified Firebase project: ${PROJECT_ID}`);
    console.log(`Auth users: ${authUsers.length}`);
    for (const user of authUsers) {
      console.log(`- ${user.uid}: ${user.email ?? "no-email"}, disabled=${user.disabled}`);
    }
    console.log(`Firestore documents: ${documents.length}`);
    for (const { collection, count } of collections) console.log(`- ${collection}: ${count}`);
    console.log(`Unexpected Auth users: ${unexpectedAuthUsers.length}`);
    console.log(`Unexpected Firestore documents: ${unexpectedDocuments.length}`);
    for (const path of unexpectedDocuments) console.log(`- unexpected document: ${path}`);
    console.log(`Safe snapshot: ${outputPath}`);
    console.log(`Snapshot SHA-256: ${sha256(serialized)}`);
    console.log("Password hashes/salts and sensitive credential-like fields are not present in clear text.");
  } finally {
    await deleteApp(app);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applicationDefault, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "kabinet-25";
const SERIES_PATH = "lessonSeries/student-lera9-v1__thu-1000-msk";
const ADDITIVE_FIELDS = {
  startsOn: "2026-08-13",
  endsOn: null,
  cancelledAt: null,
  cancelledBy: null,
} as const;

type Classification = "update" | "noop" | "conflict";

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function classify(data: FirebaseFirestore.DocumentData): {
  action: Classification;
  missing: string[];
  conflicts: string[];
} {
  const missing: string[] = [];
  const conflicts: string[] = [];
  for (const [field, desired] of Object.entries(ADDITIVE_FIELDS)) {
    if (!(field in data)) missing.push(field);
    else if (!equal(data[field], desired)) conflicts.push(field);
  }
  return {
    action: conflicts.length > 0 ? "conflict" : missing.length > 0 ? "update" : "noop",
    missing,
    conflicts,
  };
}

async function verifyCredentialProject(): Promise<void> {
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS is required");
  const credential = JSON.parse(await readFile(resolve(credentialPath), "utf8")) as {
    project_id?: unknown;
  };
  if (credential.project_id !== PROJECT_ID) {
    throw new Error(`Credential project mismatch: ${String(credential.project_id)}`);
  }
}

async function main(): Promise<void> {
  const planOnly = process.argv.includes("--plan");
  const apply = process.argv.includes("--apply");
  if (planOnly === apply) throw new Error("Use exactly one of --plan or --apply");
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Phase 9C production migration refuses Firebase emulator variables");
  }
  await verifyCredentialProject();
  if (apply && argumentValue("--confirm-project") !== PROJECT_ID) {
    throw new Error("Apply requires --confirm-project=kabinet-25");
  }

  const app = initializeApp(
    { credential: applicationDefault(), projectId: PROJECT_ID },
    `phase9c-migration-${Date.now()}`,
  );
  try {
    const db = getFirestore(app);
    const reference = db.doc(SERIES_PATH);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new Error(`Required pilot document is missing: ${SERIES_PATH}`);
    const data = snapshot.data() ?? {};
    if (
      data.teacherId !== "teacher-pilot-v1" ||
      data.studentId !== "student-lera9-v1" ||
      data.frequency !== "weekly" ||
      data.interval !== 1 ||
      data.startLocalTime !== "10:00" ||
      data.baseTimezone !== "Europe/Moscow"
    ) {
      throw new Error("Pilot lesson series identity/schedule differs from the approved baseline");
    }
    const initial = classify(data);
    console.log(`Verified Firebase project: ${PROJECT_ID}`);
    console.log(`Mode: ${planOnly ? "plan-only" : "apply"}`);
    console.log(`${SERIES_PATH}: ${initial.action}`);
    for (const [field, value] of Object.entries(ADDITIVE_FIELDS)) {
      const state = !(field in data) ? "add" : equal(data[field], value) ? "noop" : "conflict";
      console.log(`- ${field}: ${state} -> ${JSON.stringify(value)}`);
    }
    if (initial.conflicts.length > 0) {
      throw new Error(`Migration conflicts: ${initial.conflicts.join(", ")}`);
    }
    if (planOnly) {
      console.log("Plan only: no Firestore writes were performed.");
      return;
    }
    if (initial.action === "noop") {
      console.log("Apply is idempotent: no write was required.");
      return;
    }

    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(reference);
      if (!current.exists) throw new Error("Pilot lesson series disappeared before apply");
      const currentData = current.data() ?? {};
      const currentClassification = classify(currentData);
      if (currentClassification.conflicts.length > 0) {
        throw new Error(`Migration conflict during transaction: ${currentClassification.conflicts.join(", ")}`);
      }
      const patch = Object.fromEntries(
        Object.entries(ADDITIVE_FIELDS).filter(([field]) => !(field in currentData)),
      );
      if (Object.keys(patch).length > 0) transaction.update(reference, patch);
    });

    const verified = await reference.get();
    const finalClassification = classify(verified.data() ?? {});
    if (finalClassification.action !== "noop") {
      throw new Error(`Post-apply migration verification failed: ${finalClassification.action}`);
    }
    console.log("Apply complete: 1 document updated with additive fields only.");
    console.log("Post-apply dry-run classification: noop.");
  } finally {
    await deleteApp(app);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

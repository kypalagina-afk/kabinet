import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applicationDefault, deleteApp, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "kabinet-25";
const TEACHER_PATH = "users/teacher-pilot-v1";
const TEACHER_TIMEZONE = "Asia/Novosibirsk";
const LEGACY_MOSCOW_OFFSET_MINUTES = 240;

type Classification = "update" | "noop" | "conflict";

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
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

function classify(data: FirebaseFirestore.DocumentData): Classification {
  const timezone = data.timezone;
  if (!timezone || typeof timezone !== "object" || Array.isArray(timezone)) return "conflict";
  if (timezone.moscowOffsetMinutes !== LEGACY_MOSCOW_OFFSET_MINUTES) return "conflict";
  if (timezone.iana === TEACHER_TIMEZONE) return "noop";
  if (timezone.iana === null || !("iana" in timezone)) return "update";
  return "conflict";
}

function assertTeacherIdentity(data: FirebaseFirestore.DocumentData): void {
  if (
    data.role !== "teacher" ||
    data.username !== "kypalagina" ||
    data.usernameNormalized !== "kypalagina" ||
    data.teacherId !== null ||
    data.studentId !== null
  ) {
    throw new Error("Teacher document identity differs from the approved pilot baseline");
  }
}

async function main(): Promise<void> {
  const planOnly = process.argv.includes("--plan");
  const apply = process.argv.includes("--apply");
  if (planOnly === apply) throw new Error("Use exactly one of --plan or --apply");
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Phase 10.1 production migration refuses Firebase emulator variables");
  }
  await verifyCredentialProject();
  if (apply && argumentValue("--confirm-project") !== PROJECT_ID) {
    throw new Error("Apply requires --confirm-project=kabinet-25");
  }
  if (apply && argumentValue("--confirm-write") !== "APPLY_PHASE10_1") {
    throw new Error("Apply requires --confirm-write=APPLY_PHASE10_1");
  }

  const app = initializeApp(
    { credential: applicationDefault(), projectId: PROJECT_ID },
    `phase10-1-migration-${Date.now()}`,
  );
  try {
    const db = getFirestore(app);
    const reference = db.doc(TEACHER_PATH);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new Error(`Required teacher document is missing: ${TEACHER_PATH}`);
    const data = snapshot.data() ?? {};
    assertTeacherIdentity(data);
    const initial = classify(data);

    console.log(`Verified Firebase project: ${PROJECT_ID}`);
    console.log(`Mode: ${planOnly ? "plan-only" : "apply"}`);
    console.log(`${TEACHER_PATH}: ${initial}`);
    console.log(`- timezone.iana: ${initial === "update" ? "set" : initial} -> ${TEACHER_TIMEZONE}`);
    console.log(`- timezone.moscowOffsetMinutes: preserve -> ${LEGACY_MOSCOW_OFFSET_MINUTES}`);
    if (initial === "conflict") {
      throw new Error("Teacher timezone differs from the approved Phase 10.1 baseline");
    }
    if (planOnly) {
      console.log("Plan only: no Firestore writes were performed.");
      return;
    }
    if (initial === "noop") {
      console.log("Apply is idempotent: no write was required.");
      return;
    }

    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(reference);
      if (!current.exists) throw new Error("Teacher document disappeared before apply");
      const currentData = current.data() ?? {};
      assertTeacherIdentity(currentData);
      const currentClassification = classify(currentData);
      if (currentClassification === "conflict") {
        throw new Error("Teacher timezone changed during migration");
      }
      if (currentClassification === "update") {
        transaction.update(reference, new FieldPath("timezone", "iana"), TEACHER_TIMEZONE);
      }
    });

    const verified = await reference.get();
    if (classify(verified.data() ?? {}) !== "noop") {
      throw new Error("Post-apply migration verification failed");
    }
    console.log("Apply complete: one nullable timezone field was populated.");
    console.log("Post-apply dry-run classification: noop.");
  } finally {
    await deleteApp(app);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

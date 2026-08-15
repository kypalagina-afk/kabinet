import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { applicationDefault, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { normalizeUsername, usernameToTechnicalEmail } from "../src/lib/firebase/authAlias.js";

export const PRODUCTION_PROJECT_ID = "kabinet-25";
export const APPLY_CONFIRMATION = "APPLY_PRODUCTION_SEED";
const AUTH_ALIAS_DOMAIN = "kabinet25.example.com";
const MAX_BATCH_WRITES = 500;
const ALLOWED_COLLECTIONS = new Set([
  "users",
  "students",
  "programProfiles",
  "examBlueprints",
  "studentPrograms",
  "lessonSeries",
  "lessons",
  "homeworks",
  "homeworkSubmissions",
  "mockExams",
  "materials",
  "achievementDefinitions",
  "studentAchievements",
  "gamificationEvents",
  "appSettings",
]);

type RuntimeKey = "teacherUsername";

interface TimestampMarker {
  $timestamp: string;
}

interface RuntimeMarker {
  $runtime: RuntimeKey;
}

export type SeedValue =
  | null
  | boolean
  | number
  | string
  | TimestampMarker
  | RuntimeMarker
  | SeedValue[]
  | { [key: string]: SeedValue };

interface AuthSeedUser {
  key: "teacher" | "student";
  uid: string;
  role: "teacher" | "student";
  username: string | RuntimeMarker;
  displayName: string;
}

interface SeedWrite {
  path: string;
  data: Record<string, SeedValue>;
}

export interface SeedPlan {
  schemaVersion: 1;
  projectId: string;
  authUsers: AuthSeedUser[];
  writes: SeedWrite[];
  todos: string[];
}

export interface RuntimeContext {
  teacherUsername: string;
}

type PlannedAction = "create" | "exists" | "update" | "noop" | "ensure" | "conflict";

interface AuthAction {
  uid: string;
  role: AuthSeedUser["role"];
  username: string;
  technicalEmail: string;
  action: PlannedAction;
  reason?: string;
  seedUser: AuthSeedUser;
}

interface FirestoreAction {
  path: string;
  action: PlannedAction;
  data: Record<string, unknown>;
}

interface LivePlan {
  auth: AuthAction[];
  firestore: FirestoreAction[];
}

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function isTimestampMarker(value: unknown): value is TimestampMarker {
  return Boolean(
    value &&
      typeof value === "object" &&
      Object.keys(value).length === 1 &&
      typeof (value as TimestampMarker).$timestamp === "string",
  );
}

function isRuntimeMarker(value: unknown): value is RuntimeMarker {
  return Boolean(
    value &&
      typeof value === "object" &&
      Object.keys(value).length === 1 &&
      (value as RuntimeMarker).$runtime === "teacherUsername",
  );
}

function validateNoPasswords(value: unknown, path = "seed"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNoPasswords(item, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    if (/password/i.test(key)) {
      throw new Error(`Passwords must never be stored in seed input (${path}.${key})`);
    }
    validateNoPasswords(nestedValue, `${path}.${key}`);
  });
}

function validateSeedValue(value: unknown, path: string): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }

  if (isTimestampMarker(value)) {
    const parsed = new Date(value.$timestamp);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value.$timestamp) {
      throw new Error(`Invalid UTC timestamp marker at ${path}`);
    }
    return;
  }

  if (isRuntimeMarker(value)) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSeedValue(item, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nestedValue]) =>
      validateSeedValue(nestedValue, `${path}.${key}`),
    );
    return;
  }

  throw new Error(`Unsupported seed value at ${path}`);
}

function validateDocumentPath(documentPath: string): void {
  const segments = documentPath.split("/");
  if (
    segments.length !== 2 ||
    segments.some((segment) => segment.length === 0) ||
    !ALLOWED_COLLECTIONS.has(segments[0] ?? "")
  ) {
    throw new Error(`Seed path must be an allowed top-level document: ${documentPath}`);
  }
}

function validateInputLocation(inputPath: string): string {
  const projectRoot = resolve(import.meta.dirname, "..");
  const privateRoot = resolve(projectRoot, "private");
  const absoluteInputPath = isAbsolute(inputPath) ? resolve(inputPath) : resolve(projectRoot, inputPath);
  const relativeInputPath = relative(privateRoot, absoluteInputPath);

  if (
    relativeInputPath === "" ||
    relativeInputPath === ".." ||
    relativeInputPath.startsWith(`..${sep}`) ||
    isAbsolute(relativeInputPath)
  ) {
    throw new Error("Seed input must be stored inside the Git-ignored private/ directory");
  }

  return absoluteInputPath;
}

export function validatePlan(value: unknown): SeedPlan {
  validateNoPasswords(value);
  if (!value || typeof value !== "object") {
    throw new Error("Seed input must be a JSON object");
  }

  const candidate = value as Partial<SeedPlan>;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.projectId !== PRODUCTION_PROJECT_ID ||
    !Array.isArray(candidate.authUsers) ||
    !Array.isArray(candidate.writes) ||
    !Array.isArray(candidate.todos)
  ) {
    throw new Error(
      `Seed input must use schemaVersion 1, target ${PRODUCTION_PROJECT_ID}, and contain authUsers[], writes[], todos[]`,
    );
  }
  if (candidate.writes.length === 0 || candidate.writes.length > MAX_BATCH_WRITES) {
    throw new Error(`Seed must contain between 1 and ${MAX_BATCH_WRITES} writes`);
  }
  if (candidate.authUsers.length !== 2) {
    throw new Error("Pilot seed must contain exactly one teacher and one student Auth user");
  }

  const seenAuthKeys = new Set<string>();
  const seenUids = new Set<string>();
  candidate.authUsers.forEach((user) => {
    if (
      !user ||
      (user.key !== "teacher" && user.key !== "student") ||
      user.role !== user.key ||
      typeof user.uid !== "string" ||
      !/^[a-z0-9-]{6,128}$/.test(user.uid) ||
      typeof user.displayName !== "string" ||
      !(typeof user.username === "string" || isRuntimeMarker(user.username))
    ) {
      throw new Error("Invalid Auth seed user");
    }
    if (typeof user.username === "string") {
      normalizeUsername(user.username);
    }
    if (seenAuthKeys.has(user.key) || seenUids.has(user.uid)) {
      throw new Error(`Duplicate Auth key or UID: ${user.key}/${user.uid}`);
    }
    seenAuthKeys.add(user.key);
    seenUids.add(user.uid);
  });

  const seenPaths = new Set<string>();
  candidate.writes.forEach((write) => {
    if (!write || typeof write.path !== "string" || !write.data) {
      throw new Error("Each seed write must contain path and data");
    }
    validateDocumentPath(write.path);
    validateSeedValue(write.data, write.path);
    if (seenPaths.has(write.path)) {
      throw new Error(`Duplicate seed path: ${write.path}`);
    }
    seenPaths.add(write.path);
  });

  candidate.todos.forEach((todo) => {
    if (typeof todo !== "string" || todo.trim().length === 0) {
      throw new Error("Each TODO must be a non-empty string");
    }
  });

  const plan = candidate as SeedPlan;
  validatePilotRelations(plan);
  return plan;
}

function requiredString(data: Record<string, SeedValue>, key: string, path: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path}.${key} must be a non-empty deterministic ID`);
  }
  return value;
}

function numericScore(value: SeedValue | undefined, path: string): { earned: number; max: number } {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${path} must be a score object`);
  }
  const score = value as Record<string, SeedValue>;
  const earned = score.earned;
  const max = score.max;
  if (typeof earned !== "number" || typeof max !== "number") {
    throw new Error(`${path} must contain numeric earned/max`);
  }
  return { earned, max };
}

export function validatePilotRelations(plan: SeedPlan): void {
  const teacher = plan.authUsers.find(({ key }) => key === "teacher");
  const student = plan.authUsers.find(({ key }) => key === "student");
  if (!teacher || !student) throw new Error("Pilot principals are missing");

  const writes = new Map(plan.writes.map((write) => [write.path, write]));
  for (const user of [teacher, student]) {
    if (!writes.has(`users/${user.uid}`)) {
      throw new Error(`Missing users/${user.uid} for Auth principal`);
    }
  }
  if (!writes.has(`students/${student.uid}`)) {
    throw new Error(`Student document ID must match deterministic Auth UID ${student.uid}`);
  }

  const ownedCollections = new Set([
    "studentPrograms",
    "lessonSeries",
    "lessons",
    "homeworks",
    "homeworkSubmissions",
    "mockExams",
  ]);
  for (const write of plan.writes) {
    const [collectionName] = write.path.split("/");
    if (collectionName === "students" && write.data.teacherId !== teacher.uid) {
      throw new Error(`${write.path} must match pilot teacherId`);
    }
    if (!ownedCollections.has(collectionName ?? "")) continue;
    if (write.data.teacherId !== teacher.uid || write.data.studentId !== student.uid) {
      throw new Error(`${write.path} must match pilot teacherId/studentId`);
    }
  }

  for (const write of plan.writes) {
    const [collectionName] = write.path.split("/");
    if (collectionName === "studentPrograms") {
      const programProfileId = requiredString(write.data, "programProfileId", write.path);
      if (!writes.has(`programProfiles/${programProfileId}`)) {
        throw new Error(`${write.path} references missing program profile ${programProfileId}`);
      }
    }
    if (["lessonSeries", "lessons", "homeworks", "mockExams"].includes(collectionName ?? "")) {
      const studentProgramId = requiredString(write.data, "studentProgramId", write.path);
      if (!writes.has(`studentPrograms/${studentProgramId}`)) {
        throw new Error(`${write.path} references missing student program ${studentProgramId}`);
      }
    }
    if (collectionName === "homeworkSubmissions") {
      const homeworkId = requiredString(write.data, "homeworkId", write.path);
      const homework = writes.get(`homeworks/${homeworkId}`);
      if (
        !homework ||
        homework.data.teacherId !== write.data.teacherId ||
        homework.data.studentId !== write.data.studentId
      ) {
        throw new Error(`${write.path} does not match an owned homework`);
      }
    }
    if (collectionName === "mockExams") {
      const blueprintId = requiredString(write.data, "examBlueprintId", write.path);
      if (!writes.has(`examBlueprints/${blueprintId}`)) {
        throw new Error(`${write.path} references missing exam blueprint ${blueprintId}`);
      }
      const taskResults = write.data.taskResults;
      const sections = write.data.sections;
      if (!Array.isArray(taskResults) || !sections || Array.isArray(sections) || typeof sections !== "object") {
        throw new Error(`${write.path} must contain detailed task and section scores`);
      }
      const sectionMap = sections as Record<string, SeedValue>;
      const taskScores = taskResults.map((item, index) =>
        numericScore(item, `${write.path}.taskResults[${index}]`),
      );
      const test = numericScore(sectionMap.test, `${write.path}.sections.test`);
      const sectionScores = ["test", "exposition", "essay", "literacy", "factualAccuracy"].map(
        (key) => numericScore(sectionMap[key], `${write.path}.sections.${key}`),
      );
      const total = numericScore(write.data.total, `${write.path}.total`);
      if (
        taskScores.reduce((sum, score) => sum + score.earned, 0) !== test.earned ||
        taskScores.reduce((sum, score) => sum + score.max, 0) !== test.max ||
        sectionScores.reduce((sum, score) => sum + score.earned, 0) !== total.earned ||
        sectionScores.reduce((sum, score) => sum + score.max, 0) !== total.max
      ) {
        throw new Error(`${write.path} contains inconsistent mock exam totals`);
      }
    }
  }
}

export function resolveSeedValue(value: SeedValue, runtime: RuntimeContext): unknown {
  if (isTimestampMarker(value)) {
    return Timestamp.fromDate(new Date(value.$timestamp));
  }
  if (isRuntimeMarker(value)) {
    return runtime[value.$runtime];
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveSeedValue(item, runtime));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        resolveSeedValue(nestedValue, runtime),
      ]),
    );
  }
  return value;
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    );
  }
  return value;
}

export function desiredFieldsMatch(
  existing: Record<string, unknown>,
  desired: Record<string, unknown>,
): boolean {
  return Object.entries(desired).every(([key, value]) =>
    isDeepStrictEqual(canonicalize(existing[key]), canonicalize(value)),
  );
}

function offlineRuntime(plan: SeedPlan): RuntimeContext {
  const teacher = plan.authUsers.find((user) => user.key === "teacher");
  if (!teacher) throw new Error("Teacher Auth seed is missing");
  return {
    teacherUsername:
      typeof teacher.username === "string"
        ? normalizeUsername(teacher.username)
        : "<запросить локально перед provisioning>",
  };
}

function usernameFor(user: AuthSeedUser, runtime: RuntimeContext): string {
  return typeof user.username === "string" ? normalizeUsername(user.username) : runtime.teacherUsername;
}

function printPlan(plan: SeedPlan, livePlan?: LivePlan): void {
  const runtime = offlineRuntime(plan);
  console.log(`Firebase project: ${plan.projectId}`);
  console.log(livePlan ? "Mode: production read-only inspection" : "Mode: offline dry-run");
  console.log("\nAuth users:");
  console.table(
    livePlan?.auth.map((action) => {
      const row = { ...action };
      delete (row as Partial<AuthAction>).seedUser;
      return row;
    }) ??
      plan.authUsers.map((user) => {
        const username = usernameFor(user, runtime);
        return {
          uid: user.uid,
          role: user.role,
          username,
          technicalEmail:
            isRuntimeMarker(user.username)
              ? "<будет вычислен из локального login>"
              : usernameToTechnicalEmail(username, AUTH_ALIAS_DOMAIN),
          action: "ensure",
        };
      }),
  );

  console.log("\nFirestore documents:");
  console.table(
    livePlan?.firestore.map((action) => ({ path: action.path, action: action.action })) ??
      plan.writes.map(({ path }) => ({ path, action: "ensure" })),
  );

  console.log("\nDeterministic IDs:");
  for (const user of plan.authUsers) {
    console.log(`- Auth UID: ${user.uid}`);
  }
  for (const write of plan.writes) {
    console.log(`- ${write.path}`);
  }

  console.log("\nTODO:");
  for (const todo of plan.todos) {
    console.log(`- ${todo}`);
  }

  if (!livePlan) {
    console.log(
      "\nOffline plan cannot classify create/update without production reads; every target is an idempotent ensure operation.",
    );
  }
  console.log("Plan only: no Auth or Firestore writes were performed.");
}

async function findUserByUid(auth: ReturnType<typeof getAuth>, uid: string): Promise<UserRecord | null> {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      return null;
    }
    throw error;
  }
}

async function findUserByEmail(
  auth: ReturnType<typeof getAuth>,
  email: string,
): Promise<UserRecord | null> {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      return null;
    }
    throw error;
  }
}

async function inspectProduction(plan: SeedPlan, runtime: RuntimeContext): Promise<LivePlan> {
  const app =
    getApps().find((candidate) => candidate.name === "pilot-production-seed") ??
    initializeApp(
      { credential: applicationDefault(), projectId: PRODUCTION_PROJECT_ID },
      "pilot-production-seed",
    );
  const auth = getAuth(app);
  const db = getFirestore(app);

  const authActions = await Promise.all(
    plan.authUsers.map(async (seedUser): Promise<AuthAction> => {
      const username = usernameFor(seedUser, runtime);
      const technicalEmail = usernameToTechnicalEmail(username, AUTH_ALIAS_DOMAIN);
      const [byUid, byEmail] = await Promise.all([
        findUserByUid(auth, seedUser.uid),
        findUserByEmail(auth, technicalEmail),
      ]);

      if (byEmail && byEmail.uid !== seedUser.uid) {
        return {
          uid: seedUser.uid,
          role: seedUser.role,
          username,
          technicalEmail,
          action: "conflict",
          reason: `technical email already belongs to UID ${byEmail.uid}`,
          seedUser,
        };
      }
      if (byUid && byUid.email !== technicalEmail) {
        return {
          uid: seedUser.uid,
          role: seedUser.role,
          username,
          technicalEmail,
          action: "conflict",
          reason: `UID already has a different email (${byUid.email ?? "none"})`,
          seedUser,
        };
      }
      if (
        byUid &&
        (byUid.displayName !== seedUser.displayName || byUid.disabled || !byUid.emailVerified)
      ) {
        return {
          uid: seedUser.uid,
          role: seedUser.role,
          username,
          technicalEmail,
          action: "conflict",
          reason: "UID exists but displayName/disabled/emailVerified does not match the pilot plan",
          seedUser,
        };
      }
      return {
        uid: seedUser.uid,
        role: seedUser.role,
        username,
        technicalEmail,
        action: byUid ? "exists" : "create",
        seedUser,
      };
    }),
  );

  const resolvedWrites = plan.writes.map(({ path, data }) => ({
    path,
    data: resolveSeedValue(data, runtime) as Record<string, unknown>,
  }));
  const snapshots = await Promise.all(resolvedWrites.map(({ path }) => db.doc(path).get()));
  const firestoreActions = resolvedWrites.map(({ path, data }, index): FirestoreAction => {
    const snapshot = snapshots[index];
    if (!snapshot?.exists) {
      return { path, action: "create", data };
    }
    return {
      path,
      action: desiredFieldsMatch(snapshot.data() ?? {}, data) ? "noop" : "update",
      data,
    };
  });

  return { auth: authActions, firestore: firestoreActions };
}

async function promptVisible(message: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive terminal is required for local provisioning prompts");
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await prompt.question(message)).trim();
  } finally {
    prompt.close();
  }
}

async function promptHidden(message: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("Interactive terminal is required for hidden password input");
  }

  return new Promise((resolvePromise, rejectPromise) => {
    let value = "";
    const wasRaw = process.stdin.isRaw;
    const finish = (error?: Error) => {
      process.stdin.off("keypress", onKeypress);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdout.write("\n");
      if (error) rejectPromise(error);
      else resolvePromise(value);
    };
    const onKeypress = (character: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        finish(new Error("Provisioning cancelled"));
      } else if (key.name === "return" || key.name === "enter") {
        finish();
      } else if (key.name === "backspace") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (character && !key.ctrl) {
        value += character;
        process.stdout.write("*");
      }
    };

    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", onKeypress);
    process.stdout.write(message);
  });
}

async function promptNewPassword(label: string): Promise<string> {
  const password = await promptHidden(`Пароль для ${label}: `);
  if (password.length < 6) {
    throw new Error(`Password for ${label} must contain at least 6 characters`);
  }
  const confirmation = await promptHidden(`Повторите пароль для ${label}: `);
  if (password !== confirmation) {
    throw new Error(`Password confirmation for ${label} does not match`);
  }
  return password;
}

function assertProductionApplyGuards(plan: SeedPlan): void {
  if (plan.projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error(`Refusing to target project ${plan.projectId}`);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Production apply refuses to run while Firebase emulator variables are set");
  }
  if (
    argumentValue("--confirm-project") !== PRODUCTION_PROJECT_ID ||
    argumentValue("--confirm-write") !== APPLY_CONFIRMATION
  ) {
    throw new Error(
      `Production write requires --confirm-project=${PRODUCTION_PROJECT_ID} ` +
        `--confirm-write=${APPLY_CONFIRMATION}`,
    );
  }
}

async function applyProduction(plan: SeedPlan, livePlan: LivePlan): Promise<void> {
  const resumeAfterTeacherCreate =
    argumentValue("--resume-after-auth-create") === "teacher-pilot-v1";
  const expectedAuthAction = (action: AuthAction): PlannedAction =>
    resumeAfterTeacherCreate && action.uid === "teacher-pilot-v1" ? "exists" : "create";
  const unexpectedAuth = livePlan.auth.filter(
    (action) => action.action !== expectedAuthAction(action),
  );
  const unexpectedFirestore = livePlan.firestore.filter(({ action }) => action !== "create");
  if (
    livePlan.auth.length !== 2 ||
    livePlan.firestore.length !== 14 ||
    unexpectedAuth.length > 0 ||
    unexpectedFirestore.length > 0
  ) {
    throw new Error(
      "Pilot preflight failed; no writes performed. " +
        `Expected ${resumeAfterTeacherCreate ? "teacher exists + student create" : "2 Auth creates"} ` +
        `and 14 Firestore creates. ` +
        `Unexpected Auth: ${unexpectedAuth
          .map(({ uid, action, reason }) => `${uid}:${action}${reason ? `(${reason})` : ""}`)
          .join(", ") || "none"}. ` +
        `Unexpected Firestore: ${unexpectedFirestore
          .map(({ path, action }) => `${path}:${action}`)
          .join(", ") || "none"}.`,
    );
  }

  const typedProject = await promptVisible(
    `Для финального подтверждения production project введите ${PRODUCTION_PROJECT_ID}: `,
  );
  if (typedProject !== PRODUCTION_PROJECT_ID) {
    throw new Error("Production project confirmation did not match; no writes performed");
  }

  const app = getApps().find((candidate) => candidate.name === "pilot-production-seed");
  if (!app) {
    throw new Error("Production app was not initialized by the read-only inspection");
  }
  const auth = getAuth(app);
  const db = getFirestore(app);

  for (const authAction of livePlan.auth) {
    if (authAction.action !== "create") continue;
    const password = await promptNewPassword(
      `${authAction.role} ${authAction.username} (${authAction.uid})`,
    );
    try {
      await auth.createUser({
        uid: authAction.uid,
        email: authAction.technicalEmail,
        password,
        displayName: authAction.seedUser.displayName,
        emailVerified: true,
        disabled: false,
      });
    } finally {
      // Do not retain password longer than this createUser call.
    }
  }

  const pendingWrites = livePlan.firestore.filter(({ action }) =>
    action === "create" || action === "update",
  );
  if (pendingWrites.length > 0) {
    const batch = db.batch();
    pendingWrites.forEach(({ path, data }) => {
      batch.set(db.doc(path), data, { merge: true });
    });
    await batch.commit();
  }
  console.log(
    `Applied ${livePlan.auth.filter(({ action }) => action === "create").length} Auth creates and ` +
      `${pendingWrites.length} Firestore create/update operations to ${PRODUCTION_PROJECT_ID}.`,
  );
}

async function loadPlan(inputArgument: string): Promise<SeedPlan> {
  const inputPath = validateInputLocation(inputArgument);
  return validatePlan(JSON.parse(await readFile(inputPath, "utf8")) as unknown);
}

async function main(): Promise<void> {
  const planMode = process.argv.includes("--plan");
  const applyMode = process.argv.includes("--apply");
  const inspectMode = process.argv.includes("--inspect-production");
  const inputArgument = argumentValue("--input");

  if (planMode === applyMode || !inputArgument) {
    throw new Error(
      "Use exactly one mode: --plan or --apply, plus --input=private/<seed-file>.json",
    );
  }
  if (inspectMode && !planMode) {
    throw new Error("--inspect-production is only valid with --plan");
  }

  const plan = await loadPlan(inputArgument);
  if (planMode && !inspectMode) {
    printPlan(plan);
    return;
  }

  if (applyMode) {
    assertProductionApplyGuards(plan);
  }

  const teacherSeed = plan.authUsers.find(({ key }) => key === "teacher");
  if (!teacherSeed) throw new Error("Teacher Auth seed is missing");
  const teacherUsernameArgument = argumentValue("--teacher-username");
  if (applyMode && teacherUsernameArgument) {
    throw new Error("Production apply requires an interactive local teacher login prompt");
  }
  let teacherUsername: string;
  if (applyMode) {
    teacherUsername = normalizeUsername(
      await promptVisible("Локальный login преподавателя (пароль сейчас не нужен): "),
    );
    if (typeof teacherSeed.username === "string" && teacherUsername !== teacherSeed.username) {
      throw new Error(
        `Teacher login does not match the approved pilot login ${teacherSeed.username}; no writes performed`,
      );
    }
  } else if (typeof teacherSeed.username === "string") {
    teacherUsername = normalizeUsername(teacherSeed.username);
  } else {
    teacherUsername = normalizeUsername(
      teacherUsernameArgument ??
        (await promptVisible("Локальный login преподавателя (пароль сейчас не нужен): ")),
    );
  }
  const runtime = { teacherUsername };
  const livePlan = await inspectProduction(plan, runtime);
  printPlan(plan, livePlan);

  if (planMode) {
    const app = getApps().find((candidate) => candidate.name === "pilot-production-seed");
    if (app) await deleteApp(app);
    return;
  }

  await applyProduction(plan, livePlan);
}

const isDirectExecution = process.argv[1]
  ? resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

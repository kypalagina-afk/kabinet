import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "private", "pilot-lera.phase3.json");
const outputPath = resolve(root, "private", "demo-review.phase11.json");

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const replacements = new Map([
  ["teacher-pilot-v1", "teacher-demo-review-v1"],
  ["student-lera9-v1", "student-demo-review-v1"],
  ["kypalagina", "demo.teacher"],
  ["lera9", "demo.student"],
  ["Лера", "Алиса (демо)"],
]);

function transform(value: JsonValue): JsonValue {
  if (typeof value === "string") {
    let result = value;
    for (const [from, to] of replacements) result = result.replaceAll(from, to);
    return result;
  }
  if (Array.isArray(value)) return value.map(transform);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, transform(nested)]));
  }
  return value;
}

function timestamp(date: Date) {
  return { $timestamp: date.toISOString() };
}

const source = JSON.parse(await readFile(sourcePath, "utf8")) as JsonValue;
const plan = transform(source) as {
  authUsers: Array<Record<string, JsonValue>>;
  writes: Array<{ path: string; data: Record<string, JsonValue> }>;
  todos: JsonValue[];
};

plan.authUsers[0]!.displayName = "Демо-преподаватель";
// The public reviewer receives only a teacher login. The synthetic student
// remains a Firestore-only tenant member so the teacher workflows are useful,
// but no student Auth account is provisioned.
plan.authUsers = plan.authUsers.filter(({ key }) => key === "teacher");

const teacherProfile = plan.writes.find(({ path }) => path === "users/teacher-demo-review-v1");
const studentProfile = plan.writes.find(({ path }) => path === "users/student-demo-review-v1");
if (!teacherProfile || !studentProfile) throw new Error("Demo user profiles were not generated");
teacherProfile.data.accountMode = "demo";
teacherProfile.data.displayName = "Демо-преподаватель";
teacherProfile.data.avatarKey = "animal_02";
teacherProfile.data.timezone = { iana: "Europe/Moscow", moscowOffsetMinutes: 180 };
studentProfile.data.accountMode = "demo";
studentProfile.data.displayName = "Алиса (демо)";
studentProfile.data.avatarKey = "student_02";

const now = new Date();
const tomorrow = new Date(now);
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
tomorrow.setUTCHours(7, 0, 0, 0);
const tomorrowEnd = new Date(tomorrow.getTime() + 60 * 60_000);
const due = new Date(now);
due.setUTCDate(due.getUTCDate() + 5);
const dueDate = due.toISOString().slice(0, 10);

const plannedLesson = plan.writes.find(({ path }) => path.includes("2026-08-20t1000-msk"));
if (plannedLesson) {
  plannedLesson.data.startAt = timestamp(tomorrow);
  plannedLesson.data.endAt = timestamp(tomorrowEnd);
  plannedLesson.data.topic = "Разбор задания №6 · демо-занятие";
}
const assignedHomework = plan.writes.find(({ path }) => path.includes("essay-new-due"));
if (assignedHomework) {
  assignedHomework.data.title = "Написать вступление к сочинению";
  assignedHomework.data.dueDate = dueDate;
}

plan.todos = [
  "Production apply не выполнять без отдельного подтверждения пользователя.",
  "Пароль demo teacher Auth user запросить локально и скрыто непосредственно перед apply.",
  "Общие programProfiles/oge-russian-2027 и examBlueprints/oge-russian-2026-pilot-v1 должны остаться noop.",
  "После apply проверить tenant isolation от teacher-pilot-v1 и отдельные AI/voice quotas.",
];

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
console.log(`Demo seed plan generated: ${outputPath}`);

function resolveMarkers(value: JsonValue): unknown {
  if (Array.isArray(value)) return value.map(resolveMarkers);
  if (value && typeof value === "object") {
    if (typeof value.$timestamp === "string") {
      return Timestamp.fromDate(new Date(value.$timestamp));
    }
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, resolveMarkers(nested)]));
  }
  return value;
}

if (process.argv.includes("--apply-emulator")) {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Demo emulator apply requires both Firestore and Auth emulator hosts");
  }
  const app = getApps().find(({ name }) => name === "demo-review-seed") ??
    initializeApp({ projectId: "demo-kabinet-25" }, "demo-review-seed");
  const auth = getAuth(app);
  const accounts = [
    { uid: "teacher-demo-review-v1", email: "demo.teacher@kabinet25.example.com", password: "Demo-teacher-2026!", displayName: "Демо-преподаватель" },
  ];
  for (const account of accounts) {
    await auth.getUser(account.uid).then(
      () => auth.updateUser(account.uid, { email: account.email, password: account.password, displayName: account.displayName, disabled: false }),
      (error: { code?: string }) => {
        if (error.code !== "auth/user-not-found") throw error;
        return auth.createUser(account);
      },
    );
  }
  const db = getFirestore(app);
  const batch = db.batch();
  for (const write of plan.writes) {
    batch.set(db.doc(write.path), resolveMarkers(write.data) as Record<string, unknown>, { merge: true });
  }
  await batch.commit();
  console.log(`Emulator demo ready: ${accounts.length} Auth users and ${plan.writes.length} deterministic Firestore documents ensured.`);
} else {
  console.log("No Auth or Firestore writes were performed.");
}

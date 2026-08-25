import { emitKeypressEvents } from "node:readline";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deleteApp, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { teacherAIDraftSchema } from "../src/features/ai/schema.js";
import { usernameToTechnicalEmail } from "../src/lib/firebase/authAlias.js";

const PROJECT_ID = "kabinet-25";
const AUTH_ALIAS_DOMAIN = "kabinet25.example.com";
const TEACHER_UID = "teacher-pilot-v1";
const STUDENT_UID = "student-lera9-v1";
const ALLOWED_ORIGIN = "https://kypalagina-afk.github.io";

interface SmokeResult {
  check: string;
  status: "pass" | "fail";
  details: string;
}

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing process-scoped configuration: ${name}`);
  return value;
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
      if (key.ctrl && key.name === "c") finish(new Error("Production AI smoke cancelled"));
      else if (key.name === "return" || key.name === "enter") finish();
      else if (key.name === "backspace") {
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

async function apiRequest(
  baseUrl: string,
  path: string,
  token: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const endpoint = new URL(baseUrl);
  endpoint.searchParams.set("path", path);
  const response = await fetch(endpoint, {
    method,
    headers: {
      origin: ALLOWED_ORIGIN,
      "x-firebase-auth": `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function main() {
  const reportPath = argumentValue("--report");
  if (!reportPath) throw new Error("--report=<temporary path> is required");
  if (argumentValue("--confirm-project") !== PROJECT_ID) {
    throw new Error(`Exact --confirm-project=${PROJECT_ID} is required`);
  }
  const backendUrl = requiredEnvironment("AI_SMOKE_BACKEND_URL").replace(/\/+$/, "");
  const firebaseOptions: FirebaseOptions = {
    apiKey: requiredEnvironment("FIREBASE_SMOKE_API_KEY"),
    authDomain: requiredEnvironment("FIREBASE_SMOKE_AUTH_DOMAIN"),
    projectId: requiredEnvironment("FIREBASE_SMOKE_PROJECT_ID"),
    appId: requiredEnvironment("FIREBASE_SMOKE_APP_ID"),
  };
  if (firebaseOptions.projectId !== PROJECT_ID) throw new Error("Firebase project mismatch");

  const results: SmokeResult[] = [];
  const teacherApp = initializeApp(firebaseOptions, "ai-smoke-teacher");
  const studentApp = initializeApp(firebaseOptions, "ai-smoke-student");
  const teacherAuth = getAuth(teacherApp);
  const studentAuth = getAuth(studentApp);
  await setPersistence(teacherAuth, inMemoryPersistence);
  await setPersistence(studentAuth, inMemoryPersistence);
  const pass = (check: string, details: string) => {
    results.push({ check, status: "pass", details });
    console.log(`PASS ${check}: ${details}`);
  };

  try {
    const teacherCredential = await signInWithEmailAndPassword(
      teacherAuth,
      usernameToTechnicalEmail("kypalagina", AUTH_ALIAS_DOMAIN),
      await promptHidden("Пароль teacher kypalagina: "),
    );
    if (teacherCredential.user.uid !== TEACHER_UID) throw new Error("Unexpected teacher UID");
    pass("teacher login", TEACHER_UID);

    const studentCredential = await signInWithEmailAndPassword(
      studentAuth,
      usernameToTechnicalEmail("lera9", AUTH_ALIAS_DOMAIN),
      await promptHidden("Пароль student lera9: "),
    );
    if (studentCredential.user.uid !== STUDENT_UID) throw new Error("Unexpected student UID");
    pass("student login", STUDENT_UID);

    const studentResponse = await apiRequest(
      backendUrl,
      "/v1/ai/interpret",
      await studentCredential.user.getIdToken(),
      "POST",
      {
        command: "Добавь задачу на сегодня",
        context: { today: "2026-08-25", timezone: "Europe/Samara", selectedStudentId: null },
      },
    );
    if (studentResponse.status !== 403) {
      throw new Error(`Student AI request returned ${studentResponse.status}, expected 403`);
    }
    pass("student AI denied", "HTTP 403 Teacher role required");

    const token = await teacherCredential.user.getIdToken();
    const scenarios = [
      {
        name: "planner draft",
        command: "Добавь на сегодня в 18:00 рабочую задачу: проверить планы на неделю",
        selectedStudentId: null,
        expected: "PLANNER_ITEMS_DRAFT",
      },
      {
        name: "homework draft",
        command: "Создай Лере домашнее задание: повторить задания 2 и 3, срок 30 августа",
        selectedStudentId: STUDENT_UID,
        expected: "HOMEWORK_DRAFT",
      },
      {
        name: "ambiguous command",
        command: "Перенеси урок",
        selectedStudentId: null,
        expected: "CLARIFICATION_REQUIRED",
      },
    ] as const;
    for (const scenario of scenarios) {
      const response = await apiRequest(backendUrl, "/v1/ai/interpret", token, "POST", {
        command: scenario.command,
        context: {
          today: "2026-08-25",
          timezone: "Europe/Samara",
          selectedStudentId: scenario.selectedStudentId,
        },
      });
      if (response.status !== 200) throw new Error(`${scenario.name} returned HTTP ${response.status}`);
      const draft = teacherAIDraftSchema.parse(response.body);
      if (draft.actionType !== scenario.expected) {
        throw new Error(`${scenario.name} returned ${draft.actionType}, expected ${scenario.expected}`);
      }
      pass(scenario.name, `${draft.actionType}; draft only`);
    }

    const usage = await apiRequest(backendUrl, "/v1/ai/usage", token, "GET");
    if (usage.status !== 200 || !usage.body || typeof usage.body !== "object") {
      throw new Error(`Teacher usage returned HTTP ${usage.status}`);
    }
    const usageBody = usage.body as Record<string, unknown>;
    pass("teacher usage", `today=${Number(usageBody.today ?? 0)}, failures=${Number(usageBody.failures ?? 0)}`);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    results.push({ check: "smoke execution", status: "fail", details });
    console.error(`FAIL: ${details}`);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([signOut(teacherAuth), signOut(studentAuth)]);
    await Promise.allSettled([deleteApp(teacherApp), deleteApp(studentApp)]);
    await writeFile(
      resolve(reportPath),
      `${JSON.stringify({ projectId: PROJECT_ID, backendUrl, finishedAt: new Date().toISOString(), results }, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    console.log("\nПроверка завершена. Пароли очищены из памяти. Это окно можно закрыть.");
  }
}

void main();

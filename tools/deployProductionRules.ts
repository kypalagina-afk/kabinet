import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault } from "firebase-admin/app";

const PROJECT_ID = "kabinet-25";
const RELEASE_ID = "cloud.firestore";
const RELEASE_NAME = `projects/${PROJECT_ID}/releases/${RELEASE_ID}`;
const EXPECTED_OLD_RULESET =
  "projects/kabinet-25/rulesets/c45d236a-ea90-4cf4-a57f-4f652374866c";
const EXPECTED_OLD_SHA256 = "cd5089e4e5116dbb994013dc5fd5e7e411ec348935b8d06d13acd00173cca15b";
const APPROVED_LOCAL_SHA256 = "0d6332eac52cf99d6c068d1ea56c0cb879674f8592a1e2995fc721f204422b2f";
const RULES_API = "https://firebaserules.googleapis.com/v1";

interface ReleaseResponse {
  name: string;
  rulesetName: string;
  createTime?: string;
  updateTime?: string;
}

interface RulesetResponse {
  name: string;
  source?: { files?: Array<{ name?: string; content?: string }> };
  createTime?: string;
}

interface RulesTestResponse {
  issues?: Array<{
    severity?: string;
    message?: string;
    sourcePosition?: { fileName?: string; line?: number; column?: number };
  }>;
}

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function normalize(content: string): string {
  return content.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function apiRequest<T>(
  path: string,
  accessToken: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${RULES_API}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: { status?: string; message?: string } }
      | null;
    const status = errorBody?.error?.status ?? "UNKNOWN";
    const message = errorBody?.error?.message ?? "No API error message returned";
    throw new Error(
      `Rules API ${method} ${path} failed with HTTP ${response.status} (${status}): ${message}`,
    );
  }
  return (await response.json()) as T;
}

async function rulesetSource(rulesetName: string, accessToken: string): Promise<string> {
  const ruleset = await apiRequest<RulesetResponse>(rulesetName, accessToken);
  const content = ruleset.source?.files?.[0]?.content;
  if (typeof content !== "string") throw new Error(`Ruleset ${rulesetName} has no source`);
  return normalize(content);
}

function assertConfirmations(): void {
  if (
    argumentValue("--confirm-project") !== PROJECT_ID ||
    argumentValue("--confirm-scope") !== "firestore:rules" ||
    argumentValue("--confirm-old-ruleset") !== EXPECTED_OLD_RULESET ||
    argumentValue("--confirm-local-sha") !== APPROVED_LOCAL_SHA256
  ) {
    throw new Error(
      "Rules deploy requires exact project, scope, old ruleset and approved local SHA confirmations",
    );
  }
}

async function main(): Promise<void> {
  assertConfirmations();
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_RULES_URL) {
    throw new Error("Production Rules deploy refuses emulator/Rules URL overrides");
  }

  const localPath = resolve(import.meta.dirname, "..", "firebase", "firestore.rules");
  const localContent = normalize(await readFile(localPath, "utf8"));
  const localHash = sha256(localContent);
  if (localHash !== APPROVED_LOCAL_SHA256) {
    throw new Error(`Local rules changed after approval: ${localHash}`);
  }

  const credential = applicationDefault();
  const token = await credential.getAccessToken();
  const accessToken = token.access_token;
  const currentRelease = await apiRequest<ReleaseResponse>(RELEASE_NAME, accessToken);
  if (currentRelease.name !== RELEASE_NAME || currentRelease.rulesetName !== EXPECTED_OLD_RULESET) {
    throw new Error(`Active ruleset changed after preflight: ${currentRelease.rulesetName}`);
  }
  const currentHash = sha256(await rulesetSource(currentRelease.rulesetName, accessToken));
  if (currentHash !== EXPECTED_OLD_SHA256) {
    throw new Error(`Active production rules content changed after preflight: ${currentHash}`);
  }

  const source = { files: [{ name: "firestore.rules", content: localContent }] };
  const testResult = await apiRequest<RulesTestResponse>(
    `projects/${PROJECT_ID}:test`,
    accessToken,
    "POST",
    { source },
  );
  const errors = (testResult.issues ?? []).filter(
    ({ severity }) => severity?.toUpperCase() === "ERROR",
  );
  if (errors.length > 0) {
    throw new Error(
      `Firebase Rules API compile failed: ${errors
        .map(({ message, sourcePosition }) =>
          `${sourcePosition?.fileName ?? "firestore.rules"}:${sourcePosition?.line ?? "?"}:` +
          `${sourcePosition?.column ?? "?"} ${message ?? "unknown error"}`,
        )
        .join("; ")}`,
    );
  }

  const newRuleset = await apiRequest<RulesetResponse>(
    `projects/${PROJECT_ID}/rulesets`,
    accessToken,
    "POST",
    { source },
  );
  if (!newRuleset.name?.startsWith(`projects/${PROJECT_ID}/rulesets/`)) {
    throw new Error("Rules API returned an unexpected ruleset name");
  }

  const updatedRelease = await apiRequest<ReleaseResponse>(
    RELEASE_NAME,
    accessToken,
    "PATCH",
    {
      release: {
        name: RELEASE_NAME,
        rulesetName: newRuleset.name,
      },
    },
  );
  if (updatedRelease.name !== RELEASE_NAME || updatedRelease.rulesetName !== newRuleset.name) {
    throw new Error("Firestore release update returned an unexpected target");
  }

  const verifiedRelease = await apiRequest<ReleaseResponse>(RELEASE_NAME, accessToken);
  const verifiedSource = await rulesetSource(verifiedRelease.rulesetName, accessToken);
  const verifiedHash = sha256(verifiedSource);
  if (verifiedRelease.rulesetName !== newRuleset.name || verifiedHash !== localHash) {
    throw new Error("Post-deploy active Rules verification failed");
  }

  console.log(`Deployed project: ${PROJECT_ID}`);
  console.log(`Release: ${verifiedRelease.name}`);
  console.log(`Previous ruleset: ${EXPECTED_OLD_RULESET}`);
  console.log(`Active ruleset: ${verifiedRelease.rulesetName}`);
  console.log(`Verified production SHA-256: ${verifiedHash}`);
  console.log("Scope: Firebase Rules API only (compile, ruleset create, cloud.firestore release update).");
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

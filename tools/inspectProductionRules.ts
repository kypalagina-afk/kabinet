import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault } from "firebase-admin/app";

const PROJECT_ID = "kabinet-25";
const RELEASE_NAME = `projects/${PROJECT_ID}/releases/cloud.firestore`;
const RULES_API = "https://firebaserules.googleapis.com/v1";

interface ReleaseResponse {
  name: string;
  rulesetName: string;
  createTime?: string;
  updateTime?: string;
}

interface RulesetResponse {
  name: string;
  source?: {
    files?: Array<{ name?: string; content?: string; fingerprint?: string }>;
  };
  createTime?: string;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function normalize(content: string): string {
  return content.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${RULES_API}/${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Rules API GET ${path} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function diffLines(production: string, local: string): string[] {
  const left = normalize(production).split("\n");
  const right = normalize(local).split("\n");
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      lengths[leftIndex]![rightIndex] =
        left[leftIndex] === right[rightIndex]
          ? 1 + lengths[leftIndex + 1]![rightIndex + 1]!
          : Math.max(
              lengths[leftIndex + 1]![rightIndex]!,
              lengths[leftIndex]![rightIndex + 1]!,
            );
    }
  }

  const output: string[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      output.push(`  ${left[leftIndex] ?? ""}`);
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      rightIndex < right.length &&
      (leftIndex >= left.length ||
        lengths[leftIndex]![rightIndex + 1]! >= lengths[leftIndex + 1]![rightIndex]!)
    ) {
      output.push(`+ ${right[rightIndex] ?? ""}`);
      rightIndex += 1;
    } else {
      output.push(`- ${left[leftIndex] ?? ""}`);
      leftIndex += 1;
    }
  }
  return output;
}

async function main(): Promise<void> {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_RULES_URL) {
    throw new Error("Production Rules inspection refuses emulator/Rules URL overrides");
  }
  const credential = applicationDefault();
  const token = await credential.getAccessToken();
  const release = await apiGet<ReleaseResponse>(RELEASE_NAME, token.access_token);
  if (release.name !== RELEASE_NAME || !release.rulesetName.startsWith(`projects/${PROJECT_ID}/`)) {
    throw new Error("Active Firestore release does not belong to kabinet-25");
  }
  const ruleset = await apiGet<RulesetResponse>(release.rulesetName, token.access_token);
  const productionFile = ruleset.source?.files?.[0];
  if (!productionFile || typeof productionFile.content !== "string") {
    throw new Error("Active Firestore ruleset contains no readable rules source");
  }

  const localPath = resolve(import.meta.dirname, "..", "firebase", "firestore.rules");
  const localContent = await readFile(localPath, "utf8");
  const productionContent = normalize(productionFile.content);
  const normalizedLocalContent = normalize(localContent);
  const identical = productionContent === normalizedLocalContent;

  console.log(`Verified project: ${PROJECT_ID}`);
  console.log(`Active release: ${release.name}`);
  console.log(`Active ruleset: ${release.rulesetName}`);
  console.log(`Ruleset created: ${ruleset.createTime ?? "unknown"}`);
  console.log(`Production source file: ${productionFile.name ?? "unnamed"}`);
  console.log(`Production SHA-256: ${sha256(productionContent)}`);
  console.log(`Local SHA-256: ${sha256(normalizedLocalContent)}`);
  console.log(`Identical after line-ending normalization: ${identical}`);
  console.log("\n--- ACTIVE PRODUCTION RULES ---");
  console.log(productionContent);
  console.log("--- SAFE DIFF (- production, + local) ---");
  console.log(diffLines(productionContent, normalizedLocalContent).join("\n"));
  console.log("--- END READ-ONLY RULES INSPECTION ---");
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

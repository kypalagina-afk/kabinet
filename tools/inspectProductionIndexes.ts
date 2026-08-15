import { applicationDefault } from "firebase-admin/app";

const PROJECT_ID = "kabinet-25";
const INDEXES_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
  "/databases/(default)/collectionGroups/-/indexes";

interface IndexResponse {
  indexes?: Array<{
    name?: string;
    state?: string;
    queryScope?: string;
    fields?: Array<{
      fieldPath?: string;
      order?: string;
      arrayConfig?: string;
    }>;
  }>;
}

async function main(): Promise<void> {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Production index inspection refuses emulator overrides");
  }
  const token = await applicationDefault().getAccessToken();
  const response = await fetch(INDEXES_URL, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) {
    throw new Error(`Firestore index inspection failed with HTTP ${response.status}`);
  }
  const result = (await response.json()) as IndexResponse;
  const indexes = result.indexes ?? [];
  console.log(`Verified Firebase project: ${PROJECT_ID}`);
  console.log(`Composite indexes: ${indexes.length}`);
  for (const index of indexes) {
    const collectionGroup = index.name?.split("/collectionGroups/")[1]?.split("/")[0];
    const fields = (index.fields ?? [])
      .filter(({ fieldPath }) => fieldPath !== "__name__")
      .map(
        ({ fieldPath, order, arrayConfig }) =>
          `${fieldPath}:${arrayConfig ?? order ?? "unknown"}`,
      )
      .join(", ");
    console.log(`- ${collectionGroup ?? "unknown"} [${fields}] state=${index.state ?? "unknown"}`);
  }
  const notReady = indexes.filter(({ state }) => state !== "READY");
  if (notReady.length > 0) {
    process.exitCode = 2;
    console.log(`Indexes not ready: ${notReady.length}`);
  } else {
    console.log("All indexes are READY.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export interface FirebaseServiceAccountCredential {
  project_id: string;
  client_email: string;
  private_key: string;
}

function decodeCredentialValue(value: string): string {
  const normalized = value.trim();
  if (normalized.startsWith("{")) return normalized;
  return Buffer.from(normalized, "base64").toString("utf8");
}

export function parseFirebaseCredential(
  expectedProjectId: string,
  lockboxValue?: string,
  legacyBase64Value?: string,
): FirebaseServiceAccountCredential {
  const source = lockboxValue?.trim() || legacyBase64Value?.trim();
  if (!source) throw new Error("Missing Firebase backend credential");

  let parsed: Partial<FirebaseServiceAccountCredential>;
  try {
    parsed = JSON.parse(decodeCredentialValue(source)) as Partial<FirebaseServiceAccountCredential>;
  } catch {
    throw new Error("Firebase backend credential is invalid");
  }

  if (parsed.project_id !== expectedProjectId) {
    throw new Error("Firebase credential project mismatch");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Firebase credential is incomplete");
  }

  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

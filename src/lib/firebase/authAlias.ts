const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

export function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();

  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error("Username may contain only a-z, 0-9, dot, underscore and hyphen");
  }

  return normalized;
}

export function usernameToTechnicalEmail(
  username: string,
  aliasDomain = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env?.VITE_AUTH_ALIAS_DOMAIN,
): string {
  if (!aliasDomain) {
    throw new Error("VITE_AUTH_ALIAS_DOMAIN is not configured");
  }

  return `${normalizeUsername(username)}@${aliasDomain}`;
}

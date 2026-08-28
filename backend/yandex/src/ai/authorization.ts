export function isTeacherAIActor(profile: { role?: string } | null | undefined) {
  return profile?.role === "teacher";
}

export function isDemoAIActor(
  profile: { accountMode?: string } | null | undefined,
) {
  return profile?.accountMode === "demo";
}

export function requestLimitForActor(
  profile: { accountMode?: string } | null | undefined,
  standardLimit: number,
  demoLimit: number,
) {
  return isDemoAIActor(profile) ? demoLimit : standardLimit;
}

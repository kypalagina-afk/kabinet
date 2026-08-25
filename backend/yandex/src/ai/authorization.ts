export function isTeacherAIActor(profile: { role?: string } | null | undefined) {
  return profile?.role === "teacher";
}

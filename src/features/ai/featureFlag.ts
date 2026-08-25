export function teacherAIAssistantEnabled() {
  return import.meta.env.VITE_AI_ASSISTANT_ENABLED === "true"
    || import.meta.env.VITE_FIREBASE_TARGET === "emulator";
}

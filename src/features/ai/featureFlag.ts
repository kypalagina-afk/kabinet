export function teacherAIAssistantEnabled() {
  return import.meta.env.VITE_AI_ASSISTANT_ENABLED === "true"
    || import.meta.env.VITE_FIREBASE_TARGET === "emulator";
}

export function teacherVoiceInputEnabled() {
  return import.meta.env.VITE_VOICE_INPUT_ENABLED === "true";
}

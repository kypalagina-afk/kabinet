import type { User } from "firebase/auth";
import { aiBackendRequest } from "../../lib/backend/apiClient.js";
import { createMockTeacherAIDraft } from "./mockProvider.js";
import { teacherAIDraftSchema, type TeacherAIContext, type TeacherAIDraft } from "./schema.js";

export async function interpretTeacherCommand(command: string, context: TeacherAIContext, user: User): Promise<TeacherAIDraft> {
  if (import.meta.env.VITE_FIREBASE_TARGET === "emulator") {
    return createMockTeacherAIDraft(command, context);
  }
  const result = await aiBackendRequest<unknown>("/v1/ai/interpret", { method: "POST", body: { command, context: { today: context.today, timezone: context.timezone, selectedStudentId: context.selectedStudentId } }, user });
  return teacherAIDraftSchema.parse(result);
}

export interface TeacherAIUsage {
  today: number;
  month: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  actionTypes: Record<string, number>;
}

export async function getTeacherAIUsage(user: User): Promise<TeacherAIUsage | null> {
  if (import.meta.env.VITE_FIREBASE_TARGET === "emulator") return null;
  return aiBackendRequest<TeacherAIUsage>("/v1/ai/usage", { user });
}

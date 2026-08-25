import type { User } from "firebase/auth";
import { aiBackendRequest } from "../../lib/backend/apiClient.js";
import { createMockTeacherAIDraft } from "./mockProvider.js";
import { teacherAIDraftSchema, type TeacherAIContext, type TeacherAIDraft } from "./schema.js";
import type { VoiceRecording } from "./voiceRecorder.js";

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function waitForPoll(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Операция отменена", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, 1_500);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function transcribeTeacherVoice(
  recording: VoiceRecording,
  user: User,
  options: { signal?: AbortSignal; onProcessing?(): void } = {},
): Promise<string> {
  const transcripts: string[] = [];
  for (const segment of recording.segments) {
    options.signal?.throwIfAborted();
    const audioBase64 = arrayBufferToBase64(await segment.blob.arrayBuffer());
    const started = await aiBackendRequest<{ status: "pending"; operationId: string }>("/v1/ai/transcribe", {
      method: "POST",
      body: { audioBase64, contentType: "audio/wav", durationMs: segment.durationMs },
      user,
      signal: options.signal,
    });
    options.onProcessing?.();
    let transcript: string | null = null;
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await waitForPoll(options.signal);
      const result = await aiBackendRequest<{ status: "pending" } | { status: "done"; transcript: string }>("/v1/ai/transcription", {
        method: "POST",
        body: { operationId: started.operationId },
        user,
        signal: options.signal,
      });
      if (result.status === "done") {
        transcript = result.transcript.trim();
        break;
      }
    }
    if (transcript === null) {
      throw new Error("Распознавание занимает слишком много времени. Попробуйте ещё раз.");
    }
    if (transcript) transcripts.push(transcript);
  }
  const combined = transcripts.join("\n").trim();
  if (!combined) throw new Error("Не удалось распознать речь. Попробуйте говорить ближе к микрофону.");
  return combined;
}

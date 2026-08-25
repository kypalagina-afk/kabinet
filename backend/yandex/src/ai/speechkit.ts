export const MAX_VOICE_DURATION_MS = 60_000;
export const MAX_VOICE_AUDIO_BYTES = 2_100_000;

export interface SpeechRecognitionOperation {
  id: string;
  done: boolean;
  error?: { code?: number; message?: string };
}

export type SpeechRecognitionStatus =
  | { status: "pending" }
  | { status: "done"; transcript: string };

export class SpeechKitError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SpeechKitError";
  }
}

function authorization(apiKey: string) {
  return { authorization: `Api-Key ${apiKey}` };
}

async function jsonResponse(response: Response, errorPrefix: string): Promise<Record<string, unknown>> {
  if (!response.ok) throw new SpeechKitError(`${errorPrefix}_${response.status}`);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SpeechKitError(`${errorPrefix}_INVALID_RESPONSE`);
  }
  return value as Record<string, unknown>;
}

function alternativesText(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const alternatives = (value as { alternatives?: unknown }).alternatives;
  if (!Array.isArray(alternatives)) return null;
  const text = alternatives
    .map((alternative) => {
      if (!alternative || typeof alternative !== "object" || Array.isArray(alternative)) return "";
      return typeof (alternative as { text?: unknown }).text === "string"
        ? (alternative as { text: string }).text.trim()
        : "";
    })
    .find(Boolean);
  return text || null;
}

function recognitionEvents(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.flatMap((value) => recognitionEvents(value));
  }
  if (!payload || typeof payload !== "object") return [];
  const row = payload as Record<string, unknown>;
  const nested = [row.result, row.results, row.chunks, row.responses]
    .filter((value) => value !== undefined)
    .flatMap((value) => recognitionEvents(value));
  return [row, ...nested];
}

export function parseSpeechKitTranscript(payload: unknown): string {
  const events = recognitionEvents(payload);
  const refined = new Map<string, string>();
  const finals = new Map<string, string>();

  events.forEach((event, index) => {
    const refinement = event.finalRefinement;
    if (refinement && typeof refinement === "object" && !Array.isArray(refinement)) {
      const value = refinement as { finalIndex?: unknown; normalizedText?: unknown };
      const text = alternativesText(value.normalizedText);
      if (text) refined.set(String(value.finalIndex ?? index), text);
    }
    const finalText = alternativesText(event.final);
    if (finalText) {
      const finalIndex = event.audioCursors && typeof event.audioCursors === "object"
        ? (event.audioCursors as { finalIndex?: unknown }).finalIndex
        : index;
      finals.set(String(finalIndex ?? index), finalText);
    }
  });

  refined.forEach((text, key) => finals.set(key, text));
  const transcript = [...finals.values()].join(" ").replace(/\s+/g, " ").trim();
  if (!transcript) throw new SpeechKitError("SPEECHKIT_EMPTY_TRANSCRIPT");
  return transcript;
}

function parseRecognitionPayload(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    const rows = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
    return rows;
  }
}

export class YandexSpeechKitProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly operationsBaseUrl = "https://operation.api.cloud.yandex.net",
  ) {}

  async submitWav(audioBase64: string): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/stt/v3/recognizeFileAsync`, {
      method: "POST",
      headers: {
        ...authorization(this.apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: audioBase64,
        recognitionModel: {
          model: "general",
          audioFormat: { containerAudio: { containerAudioType: "WAV" } },
          textNormalization: {
            textNormalization: "TEXT_NORMALIZATION_ENABLED",
            literatureText: true,
          },
          languageRestriction: {
            restrictionType: "WHITELIST",
            languageCode: ["ru-RU"],
          },
        },
      }),
    });
    const operation = await jsonResponse(response, "SPEECHKIT_SUBMIT_HTTP");
    if (typeof operation.id !== "string" || !operation.id) {
      throw new SpeechKitError("SPEECHKIT_OPERATION_ID_MISSING");
    }
    return operation.id;
  }

  async status(operationId: string): Promise<SpeechRecognitionStatus> {
    const operationResponse = await fetch(
      `${this.operationsBaseUrl.replace(/\/$/, "")}/operations/${encodeURIComponent(operationId)}`,
      { headers: authorization(this.apiKey) },
    );
    const operation = await jsonResponse(operationResponse, "SPEECHKIT_OPERATION_HTTP");
    if (operation.done !== true) return { status: "pending" };
    if (operation.error) throw new SpeechKitError("SPEECHKIT_RECOGNITION_FAILED");

    const resultResponse = await fetch(
      `${this.baseUrl.replace(/\/$/, "")}/stt/v3/getRecognition?operation_id=${encodeURIComponent(operationId)}`,
      { headers: authorization(this.apiKey) },
    );
    if (!resultResponse.ok) throw new SpeechKitError(`SPEECHKIT_RESULT_HTTP_${resultResponse.status}`);
    const transcript = parseSpeechKitTranscript(parseRecognitionPayload(await resultResponse.text()));
    return { status: "done", transcript };
  }

  async deleteResult(operationId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl.replace(/\/$/, "")}/stt/v3/deleteRecognition?operationId=${encodeURIComponent(operationId)}`,
      { method: "DELETE", headers: authorization(this.apiKey) },
    );
    if (!response.ok) throw new SpeechKitError(`SPEECHKIT_DELETE_HTTP_${response.status}`);
  }
}

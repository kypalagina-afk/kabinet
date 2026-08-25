import { afterEach, describe, expect, test, vi } from "vitest";
import {
  parseSpeechKitTranscript,
  YandexSpeechKitProvider,
} from "../../backend/yandex/src/ai/speechkit.js";

afterEach(() => vi.unstubAllGlobals());

describe("Yandex SpeechKit provider", () => {
  test("prefers normalized refinements and joins separate utterances", () => {
    expect(parseSpeechKitTranscript([
      { audioCursors: { finalIndex: "1" }, final: { alternatives: [{ text: "завтра проверить сочинение" }] } },
      { finalRefinement: { finalIndex: "1", normalizedText: { alternatives: [{ text: "Завтра проверить сочинение." }] } } },
      { audioCursors: { finalIndex: "2" }, final: { alternatives: [{ text: "купить тетради" }] } },
    ])).toBe("Завтра проверить сочинение. купить тетради");
  });

  test("fails closed when recognition contains no final text", () => {
    expect(() => parseSpeechKitTranscript({ partial: { alternatives: [{ text: "не финал" }] } }))
      .toThrow("SPEECHKIT_EMPTY_TRANSCRIPT");
  });

  test("submits WAV, polls, reads and deletes the provider result", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/stt/v3/recognizeFileAsync")) return new Response(JSON.stringify({ id: "operation-1" }), { status: 200 });
      if (url.endsWith("/operations/operation-1")) return new Response(JSON.stringify({ id: "operation-1", done: true }), { status: 200 });
      if (url.includes("/stt/v3/getRecognition")) return new Response(JSON.stringify({ final: { alternatives: [{ text: "Первая задача. Вторая задача." }] } }), { status: 200 });
      if (url.includes("/stt/v3/deleteRecognition")) return new Response("{}", { status: 200 });
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new YandexSpeechKitProvider("https://speech.example", "secret-key");

    expect(await provider.submitWav("UklGRg==")).toBe("operation-1");
    await expect(provider.status("operation-1")).resolves.toEqual({
      status: "done",
      transcript: "Первая задача. Вторая задача.",
    });
    await provider.deleteResult("operation-1");

    expect(requests).toHaveLength(4);
    expect(requests[1]?.url).toBe("https://operation.api.cloud.yandex.net/operations/operation-1");
    expect(requests[2]?.url).toContain("operation_id=operation-1");
    expect(requests[3]?.url).toContain("operationId=operation-1");
    expect(requests.every(({ init }) => (init?.headers as Record<string, string> | undefined)?.authorization === "Api-Key secret-key")).toBe(true);
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      recognitionModel: {
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
    });
    expect(requests[3]?.init?.method).toBe("DELETE");
  });

  test("returns pending without reading recognition result", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "operation-2", done: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new YandexSpeechKitProvider("https://speech.example", "secret-key");
    await expect(provider.status("operation-2")).resolves.toEqual({ status: "pending" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

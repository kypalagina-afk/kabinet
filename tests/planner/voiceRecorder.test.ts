import { describe, expect, test } from "vitest";
import { encodeMonoWav, resampleMono, splitMonoSamples, VOICE_MAX_DURATION_MS, VOICE_SAMPLE_RATE } from "../../src/features/ai/voiceRecorder.js";

describe("teacher voice recorder audio", () => {
  test("encodes mono PCM with a valid WAV header", () => {
    const wav = encodeMonoWav(new Float32Array([-1, 0, 1]));
    const view = new DataView(wav);
    const ascii = (offset: number, length: number) => String.fromCharCode(...new Uint8Array(wav, offset, length));
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(VOICE_SAMPLE_RATE);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(32767);
  });

  test("downsamples microphone audio to the SpeechKit rate", () => {
    const input = new Float32Array(48_000).fill(0.5);
    const output = resampleMono(input, 48_000, 16_000);
    expect(output).toHaveLength(16_000);
    expect(output[8_000]).toBeCloseTo(0.5);
  });

  test("rejects unsupported upsampling", () => {
    expect(() => resampleMono(new Float32Array(100), 8_000, 16_000)).toThrow();
  });

  test("supports a three-minute recording split into request-safe ordered segments", () => {
    expect(VOICE_MAX_DURATION_MS).toBe(180_000);
    const samples = new Float32Array(18);
    samples.forEach((_, index) => { samples[index] = index; });
    const segments = splitMonoSamples(samples, 10, 500);
    expect(segments.map((segment) => Array.from(segment))).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
      [10, 11, 12, 13, 14],
      [15, 16, 17],
    ]);
  });
});

export const VOICE_SAMPLE_RATE = 16_000;
export const VOICE_MAX_DURATION_MS = 180_000;
export const VOICE_SEGMENT_DURATION_MS = 50_000;

export interface VoiceRecordingSegment {
  blob: Blob;
  durationMs: number;
}

export interface VoiceRecording {
  segments: VoiceRecordingSegment[];
  durationMs: number;
}

export interface VoiceRecorder {
  stop(): Promise<VoiceRecording>;
  cancel(): Promise<void>;
}

export function voiceRecordingSupported(): boolean {
  return typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof AudioContext !== "undefined";
}

function mergeSamples(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    samples.set(chunk, offset);
    offset += chunk.length;
  });
  return samples;
}

export function resampleMono(samples: Float32Array, inputRate: number, outputRate = VOICE_SAMPLE_RATE): Float32Array {
  if (inputRate === outputRate) return samples;
  if (inputRate < outputRate || inputRate <= 0 || outputRate <= 0) {
    throw new Error("Неподдерживаемая частота микрофона.");
  }
  const ratio = inputRate / outputRate;
  const output = new Float32Array(Math.max(1, Math.floor(samples.length / ratio)));
  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(samples.length, Math.floor((outputIndex + 1) * ratio));
    let sum = 0;
    for (let inputIndex = start; inputIndex < Math.max(start + 1, end); inputIndex += 1) {
      sum += samples[inputIndex] ?? 0;
    }
    output[outputIndex] = sum / Math.max(1, end - start);
  }
  return output;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function encodeMonoWav(samples: Float32Array, sampleRate = VOICE_SAMPLE_RATE): ArrayBuffer {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * bytesPerSample, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return buffer;
}

export function splitMonoSamples(
  samples: Float32Array,
  sampleRate = VOICE_SAMPLE_RATE,
  segmentDurationMs = VOICE_SEGMENT_DURATION_MS,
): Float32Array[] {
  if (sampleRate <= 0 || segmentDurationMs <= 0) {
    throw new Error("Некорректные параметры сегментации аудио.");
  }
  const samplesPerSegment = Math.max(1, Math.floor(sampleRate * segmentDurationMs / 1_000));
  const segments: Float32Array[] = [];
  for (let offset = 0; offset < samples.length; offset += samplesPerSegment) {
    segments.push(samples.slice(offset, Math.min(samples.length, offset + samplesPerSegment)));
  }
  return segments.length > 0 ? segments : [new Float32Array(1)];
}

export async function startVoiceRecorder(): Promise<VoiceRecorder> {
  if (!voiceRecordingSupported()) throw new Error("Этот браузер не поддерживает запись с микрофона.");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const context = new AudioContext();
  await context.resume();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silentOutput = context.createGain();
  silentOutput.gain.value = 0;
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(context.destination);
  const startedAt = performance.now();
  let finished = false;

  async function finish(createRecording: boolean): Promise<VoiceRecording | null> {
    if (finished) throw new Error("Запись уже завершена.");
    finished = true;
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    silentOutput.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
    if (!createRecording) return null;
    const durationMs = Math.min(VOICE_MAX_DURATION_MS, Math.max(300, Math.round(performance.now() - startedAt)));
    const samples = resampleMono(mergeSamples(chunks), context.sampleRate);
    const segments = splitMonoSamples(samples).map((segment) => ({
      blob: new Blob([encodeMonoWav(segment)], { type: "audio/wav" }),
      durationMs: Math.max(300, Math.round(segment.length / VOICE_SAMPLE_RATE * 1_000)),
    }));
    return { segments, durationMs };
  }

  return {
    async stop() {
      const recording = await finish(true);
      if (!recording) throw new Error("Запись не создана.");
      return recording;
    },
    async cancel() {
      await finish(false);
    },
  };
}

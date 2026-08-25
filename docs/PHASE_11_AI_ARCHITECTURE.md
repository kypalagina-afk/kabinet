# Phase 11 AI architecture (local release candidate)

```text
Teacher UI
  -> Firebase ID token
  -> protected Yandex backend /v1/ai/interpret
  -> role + ownership + rate-limit checks
  -> named safe-read services (minimal context)
  -> AIProvider
       -> MockAIProvider in Emulator/CI
       -> YandexAIProvider in the approved production AI function
  -> Zod allowlist validation (one controlled retry)
  -> editable draft preview
  -> explicit teacher confirmation
  -> existing domain service / existing form
  -> Firestore
```

The model cannot call Firestore and cannot select arbitrary write operations.
Unknown action types fail schema validation. The production feature flag is off
unless `VITE_AI_ASSISTANT_ENABLED=true` and `AI_ASSISTANT_ENABLED=true` are both
deliberately configured in their respective environments.

## Provider configuration

- Base URL: `https://ai.api.cloud.yandex.net/v1`
- Model: server-side `AI_MODEL_URI`; start with a cost-effective YandexGPT model
  supporting predictable JSON output. The model is deliberately not fixed in code.
- Temperature: `0.1`
- Authentication: minimal service-account API key injected from Lockbox/runtime
  secrets. It is never available to React, Firestore, localStorage, logs, or Git.
- Fallback: manual application workflows remain fully available; UI displays
  “AI временно недоступен”. CI uses `MockAIProvider` and never incurs provider cost.

## Safety and audit

Allowed drafts are limited to lesson summary, planner create/update, lesson
reschedule, homework, clarification, and unsupported request. The backend stores
only safe metadata in `aiActionAuditEvents`: teacher, action type, status, related
IDs, model, latency, token counters, and error class. Raw commands are off by
default. Daily teacher rate limiting is enforced before provider access.

## Approved production deployment

- Function: `kabinet-ai-api` (`d4egce769rgduoa7ot5s`), separate from the
  provisioning/upload backend.
- Runtime identity: `kabinet-ai-runtime` with only
  `ai.languageModels.user` for model invocation.
- Model: `yandexgpt-lite`, selected for Russian action extraction and low cost.
- Secrets: the scoped AI API key and the least-privilege Firebase backend
  credential are injected from two Lockbox secrets. Secret values and private
  credentials are not present in this repository or the frontend bundle.
- CORS: only `https://kypalagina-afk.github.io` is allowed in production.
- Limits: 100 AI interpretation requests per teacher per UTC day.

The public frontend uses `VITE_AI_API_BASE` for AI calls and keeps
`VITE_KABINET_API_BASE` unchanged for provisioning and file operations.
Manual workflows remain available when the AI function is unavailable.

## Phase 11B voice input (local release candidate)

```text
Teacher microphone (one continuous recording, max 3 minutes)
  -> browser-side mono PCM capture and 16 kHz WAV encoding
  -> Firebase ID token + protected /v1/ai/transcribe
  -> teacher-role check + independent daily rate limit
  -> Yandex SpeechKit asynchronous recognition
  -> protected /v1/ai/transcription polling
  -> transcript returned once; SpeechKit result deleted
  -> existing /v1/ai/interpret pipeline
  -> up to 30 editable planner drafts
  -> explicit teacher confirmation
```

Neither raw audio nor the transcript is written to Firestore, logs, localStorage,
or Git. `aiTranscriptionJobs` stores only safe operational metadata: teacher ID,
an operation-ID hash, duration, byte count, status, expiry, and deletion markers.
The client receives the opaque SpeechKit operation ID, while every poll verifies
ownership against its hash. Students and anonymous users reuse the same fail-closed
teacher authentication guard as the text assistant.

The browser recording is intentionally bounded to 3 minutes and split into ordered
50-second WAV segments. Each segment is approximately 1.6 MB as raw PCM WAV and
2.14 MB after Base64 encoding. This remains below the 3.5 MB Cloud Functions JSON
request limit and supports a natural list of many short tasks. Recording can be
cancelled before upload. A successful transcription is automatically interpreted,
but no planner item is written until the teacher confirms selected drafts.

Production remains disabled until a separate rollout explicitly provides:

- folder-level `ai.speechkit-stt.user` for the runtime service account;
- a separate scoped SpeechKit API key injected through Lockbox as
  `SPEECHKIT_API_KEY`;
- `VOICE_INPUT_ENABLED=true` in the AI function and
  `VITE_VOICE_INPUT_ENABLED=true` in the Pages build;
- a function version containing the voice endpoints, followed by anonymous,
  student, teacher, CORS, size-limit, deletion, and public mobile smoke tests.

No SpeechKit TTS role is needed. The existing language-model key and Firebase
credential must not be copied, widened, or exposed to the browser.

# Phase 10 production requirements

Phase 10 is implemented and tested only against the Firebase Emulator Suite.
No production service, billing setting, GitHub workflow or public site is changed.

## Secure student provisioning

The browser must never create a second Firebase Auth user in the teacher session.
Production needs an authenticated callable/HTTP backend running Firebase Admin SDK.
It must verify the teacher ID token and role, validate normalized username and
program ownership, create Auth, then write the Firestore document set. If the
Firestore batch fails, it must delete the newly created Auth user. It must rate
limit attempts, emit a teacher audit event, redact passwords and return a one-time
credential payload only. Deploying such a backend requires a separately approved
Blaze/backend rollout. Until then the production adapter is fail-closed.

## Storage and billing

Emulator Storage supports JPEG, PNG, WebP, PDF, DOC, DOCX and TXT up to 15 MB.
Audio, video, executables and all unspecified paths are denied. Production upload
controls remain disabled until a separately approved Blaze/Storage rollout,
bucket CORS review, Rules deployment and monitoring/retention decision.

## Additive production migration plan (not executed)

1. Re-read project ID and active Rules/indexes; export pilot data.
2. Dry-run creation of `fileAssets`, `plannerItems`, `plannerGoals`, and
   `plannerSubgoals`; do not rewrite existing documents.
3. Deploy reviewed Firestore/Storage Rules and the two planner indexes only after
   explicit approval.
4. Deploy the protected provisioning backend only after Blaze approval.
5. Enable the corresponding production feature flags, run anonymous/teacher/
   student smoke tests, and verify the pilot snapshot is unchanged.

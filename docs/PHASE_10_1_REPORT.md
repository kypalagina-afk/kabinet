# Phase 10.1 — local implementation and independent audit

Date: 2026-08-23

Status: ready for local manual acceptance. No production write, deploy, billing change, GitHub push, or Phase 11 work was performed.

## 1. Implementation

### Avatar and navigation

- The reusable `Avatar` component now uses face-focused framing and larger internal image scale.
- Picker previews are 80 px; student and animal portraits receive an additional crop scale.
- An image load failure switches to the safe initial fallback instead of showing the browser broken-image icon.
- All 24 accepted avatar assets are covered by a browser load test.
- The teacher profile popover and its accessible label are named as a teacher profile, not as an avatar-only action.
- The Plans navigation item uses the calendar emoji at the same visual scale as the other sidebar icons.
- The redundant global Create action remains removed. Creation stays in Students, Homework, Mocks, Materials, Calendar, and Planner contexts.

### Planner and goals

- Day is now a semantic board: Work, Home, Someday.
- Lessons are read-only Planner projections and appear automatically in Work.
- Timed tasks show time in their category. Task cards support checkbox, title, optional time, duration, note, and `high | medium | calm` priority.
- Task categories are consistently Work, Home, Someday; events use Work or Home. Legacy `personal` values remain readable as Home for backward compatibility.
- Someday requires neither date nor time. Its tasks can be assigned today, tomorrow, a chosen date/time, Work, or Home.
- Week and Month remain calendar views; lesson/Planner synchronization is retained.
- Big Goals opens a dedicated workspace: Goal → Subgoal → linked Planner tasks. Progress is derived from completed steps rather than manually stored percentages.
- Subgoals support notes and can create a linked Planner task.
- Responsive layouts are one column at 360 px, an intermediate two-column board at tablet widths, and a three-column board with goals sidebar at wide desktop widths.

### Calendar hard delete

- Cancel remains history-preserving. Permanent delete is a separate red action and requires confirmation.
- Only planned, accidental/unlinked lessons can be deleted.
- Recurring occurrences create an immutable deterministic suppression record in `lessonOccurrenceExclusions/{lessonId}` in the same Firestore transaction as the lesson delete.
- Materialization reads suppression records and cannot recreate a permanently deleted occurrence.
- Retry is idempotent. Completed, cancelled, rescheduled, or linked occurrences cannot be hard-deleted through this workflow.
- The transaction removes the lesson from payment allocation/billing identity and recomputes the remaining allocation. Planner and dashboards read lessons directly, so the deleted lesson leaves no projected ghost.

### Teacher timezone

- IANA timezone is the primary source. The label relative to `Europe/Moscow` is calculated dynamically for the current instant.
- `Asia/Novosibirsk` correctly produces `МСК+4`; no `+4` label is hardcoded.
- Teacher profile includes an IANA timezone selector. The saved choice updates Calendar, Planner, lesson creation, switcher, and clock.
- The legacy `moscowOffsetMinutes` field remains a fallback. Its historical meaning is preserved as minutes *ahead of Moscow*, so `240` maps to UTC+7 / МСК+4.
- Production pilot data was not migrated. Before production rollout, the teacher's real IANA zone must be confirmed; if Novosibirsk is correct, the additive value is `Asia/Novosibirsk`.

### Provisioning and Storage

- Emulator student provisioning remains functional and does not replace the teacher session.
- Production provisioning remains fail-closed. Browser-side `createUserWithEmailAndPassword` is not used.
- Production uploads remain fail-closed while Cloud Storage/billing is unavailable. No provider, bucket, paid service, or backend was enabled.

## 2. Independently found and fixed

- The compact Goal card placed “Schedule” on top of long subgoal text. The action now occupies its own row and remains keyboard accessible.
- The mock editing regression test could count cards before its realtime listener had loaded. It now waits for the known fixture count before taking the baseline.
- The acceptance screenshot test depended on a Someday fixture that another test intentionally scheduled. It now restores only its deterministic Emulator fixture before capture, eliminating order-dependent screenshots.
- Avatar sizing had a selector-specificity conflict that reduced custom picker previews back to 60 px. The custom size variable now wins consistently.
- A failed avatar request could expose the native broken-image glyph. The component now hides it and renders the initial fallback.

No additional critical runtime, navigation, permission, or data-consistency regression was found in the automated and visual audit.

## 3. Product audit

### Current product assessment

- Calendar and Planner are sufficiently distinct: Calendar owns teaching schedule, lesson state, recurrence, payment, and history; Planner owns the teacher's private work/home tasks and mirrors lessons without duplicating their source of truth.
- The former global creation duplication is gone. Context actions are discoverable and route to real workflows.
- Homework creation is now direct from Homework with student selection and the same shared package form used from a student card. The remaining review steps correspond to genuinely different states rather than redundant navigation.
- Student Home is understandable: the next lesson and current work are foregrounded, while progress and supporting sections remain available through the mobile shell.
- Analytics is useful for trends and drill-down. With very small cohorts it is visually denser than the amount of data warrants, but it is not functionally blocked.
- The teacher cabinet is usable daily on desktop. At tablet widths the top navigation is dense but remains accessible and does not create horizontal page overflow.

### Recommendations not implemented

#### Critical

1. Protected production provisioning backend.
   - Problem: production teacher cannot create/reset student accounts.
   - Solution: deploy a protected Admin SDK endpoint with Firebase ID-token verification, teacher-role/ownership check, App Check where supported, idempotency key, audit log, and transactional cleanup/compensation.
   - Benefit: completes the production onboarding workflow without changing the teacher session.
   - Complexity: medium.
   - Risk: high if credentials, authorization, retry, or partial-failure handling is implemented incorrectly.

2. Persistent production object storage.
   - Problem: homework/material file actions are intentionally disabled outside Emulator.
   - Solution: enable an approved private object store, keep Firestore metadata, use owner-scoped paths, multiple-attempt identities, confirmed delete, and orphan cleanup.
   - Benefit: completes document/photo/PDF workflows.
   - Complexity: medium to high.
   - Risk: billing exposure or cross-student file leakage if rollout is incomplete.

#### Important

1. Unsaved-change protection in long Homework/Mock forms.
   - Problem: accidental modal close/navigation can lose substantial input.
   - Solution: dirty-state confirmation and optional local draft recovery.
   - Benefit: fewer repeated teacher actions.
   - Complexity: low to medium.
   - Risk: stale drafts unless scoped and expired.

2. Teacher “Needs attention” queue.
   - Problem: submissions awaiting review, overdue homework, unpaid lessons, and imminent lessons live in separate sections.
   - Solution: a compact derived dashboard list linking to existing screens; no new source-of-truth collection.
   - Benefit: high daily-use impact with limited implementation.
   - Complexity: medium.
   - Risk: inefficient queries without careful limits/index review.

3. Explicit long-title reveal on Planner cards.
   - Problem: dense cards intentionally ellipsize long titles.
   - Solution: accessible tooltip/title plus a mobile expand affordance.
   - Benefit: preserves density while making every title readable.
   - Complexity: low.
   - Risk: minimal.

#### Nice to have

1. Contextual empty-state shortcuts.
   - Problem: some empty states only report that no data exists.
   - Solution: reuse the section's existing create action in the empty state.
   - Benefit: reduces discovery time.
   - Complexity: low.
   - Risk: duplicated visual affordances if not applied selectively.

2. Planner quick-add keyboard flow.
   - Problem: repeated small tasks require opening and closing a modal.
   - Solution: inline title capture in a category, with the full modal retained for details.
   - Benefit: faster daily capture.
   - Complexity: medium.
   - Risk: validation and focus complexity on mobile.

#### Future / experimental

1. Parent reports, voice planning, automated mastery recommendations, and external notifications remain roadmap ideas only.
   - Benefit: potentially high after core infrastructure is stable.
   - Complexity: high.
   - Risk: scope, privacy, recurring cost, and product overload.

## 4. Production provisioning proposal

Preferred: a 2nd-generation Firebase callable function using Admin SDK. Callable requests automatically carry Firebase Auth and, when configured, App Check tokens. The function must still verify the caller is the owning teacher, normalize the existing username alias, create Auth + Firestore records idempotently, never persist plaintext passwords, and return credentials only once. Official references: [Firebase callable functions](https://firebase.google.com/docs/functions/callable), [Admin Auth](https://firebase.google.com/docs/auth/admin), and [ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

Deployment requires an approved billing-capable Google/Firebase setup. No attempt should be made to bypass regional/account billing restrictions.

Alternatives if the official Firebase backend cannot be enabled:

| Option | Cost model | Security/integration | Complexity | Maintenance |
| --- | --- | --- | --- | --- |
| Google Cloud Run Node service | Pay per use, scale-to-zero/free tier where eligible | Native Admin SDK and Firebase ID-token verification; strong fit | Medium | Low to medium |
| Managed Node container/VPS | Provider-specific monthly or usage billing | Same Admin SDK flow; secrets and network hardening are operator-owned | Medium to high | Medium to high |
| External serverless gateway | Provider-specific; often a free tier | Must verify Firebase tokens and call Google APIs securely; runtime compatibility must be proven | High | Medium |

Cloud Run is the best fallback when Google billing is available: request-based services can scale to zero and Google documents a free tier, but billing, Artifact Registry, build, logging, and network usage must still be monitored. [Cloud Run overview](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run), [Cloud Run pricing](https://cloud.google.com/run/pricing).

## 5. File storage and cost proposal

Preferred: Cloud Storage for Firebase because it integrates with Firebase Authentication and the already tested Storage Rules model. Current Firebase documentation requires Blaze for Cloud Storage for Firebase; this was not enabled. New default buckets use `PROJECT_ID.firebasestorage.app`. [Firebase Storage web setup](https://firebase.google.com/docs/storage/web/start), [Firebase pricing](https://firebase.google.com/pricing).

For a small pilot, the documented Blaze no-cost allowances for a new Firebase bucket include 5 GB-month storage, 100 GB/month downloads, 5,000 upload operations/month, and 50,000 download operations/month; use beyond those allowances follows Cloud Storage pricing. These are quotas, not a hard budget cap. Configure a small monthly budget and alerts, monitor bytes/objects/operations, disallow public access, and start with conservative file-size/type limits.

The Firebase Console must be checked manually to determine whether an official billing upgrade is actually available for the current account/project. The local audit cannot safely infer Russian payment/account eligibility and did not attempt a purchase.

Alternatives:

| Provider | Cost | Auth/security integration | CORS/signed access | Maintenance |
| --- | --- | --- | --- | --- |
| Cloudflare R2 + Worker | 10 GB-month and large operation allowances documented as free; Standard above free tier is $0.015/GB-month and direct egress is free | Worker must verify Firebase ID tokens and enforce teacher/student ownership | Explicit CORS and short-lived signed URLs | Medium |
| Supabase Storage | Plan-specific | Separate RLS/storage authorization bridge is required; avoid a second end-user identity system | Private buckets and signed URLs supported | Medium to high |
| S3-compatible managed storage + custom backend | Provider-specific | Backend owns all Firebase-token verification and authorization | Mature signed URL/CORS support | High |

Sources: [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 API](https://developers.cloudflare.com/r2/api/), [Supabase Storage](https://supabase.com/docs/guides/storage), [Supabase private downloads](https://supabase.com/docs/guides/storage/serving/downloads).

Lifecycle recommendation: upload to an attempt-scoped deterministic prefix, create metadata only after upload succeeds, use a finalization/cleanup job for abandoned uploads, retain every submitted/reviewed revision until explicit authorized deletion, and make deletion idempotent with confirmation and an audit record.

## 6. Schema, Rules, and indexes

### Additive schema diff

- New `lessonOccurrenceExclusions/{lessonId}` collection: `teacherId`, `studentId`, `lessonSeriesId`, `originalStartAt`, `reason: hard_deleted`, timestamps, schema version.
- `plannerItems.priority`: optional/backward-compatible enum `high | medium | calm`; absent legacy values render as calm.
- `plannerSubgoals.notes`: optional string.
- Existing `users.timezone.iana` becomes teacher-editable and remains optional; `moscowOffsetMinutes` remains fallback.

### Rules diff

- Own user update whitelist admits only validated timezone changes in addition to previously allowed preferences.
- Lesson deletion is teacher-only, planned/unlinked-only; recurring deletion requires the matching immutable suppression create in the same atomic commit.
- Suppression documents are teacher-owner scoped, student/anonymous denied, immutable after create, and point-readable for idempotent materialization.
- Planner validation admits the approved priority field while planner data remains teacher-private.

### Index diff

No new composite index is required. Suppression uses deterministic point reads. The local `firestore.indexes.json` is unchanged and no production index was deployed.

## 7. Verification

- TypeScript project references: pass.
- ESLint `--max-warnings=0`: pass.
- Production-mode Vite build: pass; only the pre-existing Firebase chunk-size advisory remains.
- Unit/domain/tools: 9 files, 33 tests pass.
- Firestore Rules Emulator: 2 files, 36 tests pass.
- Storage Rules Emulator: 1 file, 5 tests pass.
- Phase 10/10.1 + order-sensitive regression sequence: 15 tests pass.
- Responsive login: 360/768/1024/1440, 4 tests pass.
- Full authenticated browser suite: 46/46 tests pass. Two order-dependent fixture issues found during the first run were fixed and the complete suite then passed cleanly.

Expected Emulator shutdown `Connection reset` messages occur after successful test completion and are not application runtime failures.

## 8. Acceptance screenshots

Generated under `artifacts/phase10-1/`:

- `planner-day.png`
- `planner-week.png`
- `planner-month.png`
- `goal-workspace.png`
- `planner-backlog.png`
- `avatar-picker.png`
- `calendar-hard-delete.png`
- `analytics-selectors.png`
- `homework-create.png`

The screenshot fixture is deterministic and isolated from preceding Planner mutations.

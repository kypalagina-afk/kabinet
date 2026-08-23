# Phase 10.2 infrastructure foundation

This document is design-only. Phase 10.2 does not deploy a backend, enable
billing, change production data, or enable Cloud Storage.

## Scheduled lesson materialization

`ScheduledLessonMaterializer` is the domain contract used by the local
foundation. A future protected scheduled process will:

1. authenticate as a dedicated Admin SDK workload (never as a browser user);
2. query active `lessonSeries` records;
3. materialize the rolling +12-week horizon with deterministic occurrence IDs;
4. respect `startsOn`, `endsOn`, cancelled series and
   `lessonOccurrenceExclusions` tombstones;
5. update `materializedThrough` and `materializedAt` on the series;
6. emit a structured run report without student names or lesson content.

The browser no longer extends series when a teacher opens Calendar or Planner.
The teacher-only health indicator reports the shortest confirmed horizon. A
production scheduler remains an explicit post-acceptance infrastructure step.

## Secure production provisioning and password reset

The production UI remains fail-closed until a protected Admin SDK endpoint is
approved and deployed. The endpoint contract must require:

- verified Firebase ID token with `teacher` role and ownership checks;
- App Check where supported;
- per-teacher and per-IP rate limits;
- normalized username validation and deterministic technical email;
- duplicate UID/login/email conflict handling before any write;
- Auth user creation followed by an atomic Firestore batch for `users`,
  `students`, `studentPrograms`, `studentPaymentAccounts` and optional series;
- compensating deletion of a newly-created Auth user if the Firestore batch
  fails;
- a metadata-only `teacherAuditEvents` entry;
- password reset through Admin SDK with a one-time password shown once to the
  teacher and never stored in Firestore, logs, analytics or files.

The endpoint must fail closed when authorization, validation, rate limiting or
audit persistence cannot be completed. No browser-side secondary Auth app or
`createUserWithEmailAndPassword` workaround is allowed.

## Storage

Production Storage stays disabled while the project remains on Spark and until
an explicit billing checkpoint is approved. File controls remain visibly
disabled. Written homework supports `studentInput.itemProgress.responseText`
as a text fallback; this is not a replacement for future photo/PDF uploads.

## Aggregate data path

Current screens use bounded recent data. Future high-volume analytics should
write additive, rebuildable documents such as `studentAnalyticsSummary`,
`homeworkSummary`, `mockSummary` and `paymentSummary`. Source events remain
authoritative; summaries carry `computedThrough`, `sourceVersion` and
`updatedAt`. No summary collection is created or migrated in Phase 10.2.

## Achievement reconciliation

`Серия ДЗ` now means consecutive required homework completed on time, ordered
by homework chronology; retries of the same homework count once. Existing
badges are not deleted or silently rewritten. Before production migration, a
read-only reconciliation must list affected students and proposed badge
changes for manual approval.

# Phase 10.2 — Stability & Trust report

Status: implemented and verified locally against Firebase Emulator Suite. No
production Firebase write/deploy, GitHub push, billing change, Storage rollout,
or Phase 11 work was performed.

## Implementation

### Lesson → Homework integrity

- A homework created from a completed lesson uses the deterministic ID
  `lesson-homework__{lessonId}`.
- One Firestore transaction validates teacher/student/program ownership, reads
  the completed source lesson and active student program, creates the homework,
  and changes `lesson.homeworkResolution` from `pending` to `assigned`.
- A repeated click is a no-op for a matching linked homework and cannot create a
  duplicate. An existing foreign/mismatched deterministic document fails closed.
- The homework form is prefilled from lesson topic, task numbers, errors and
  focus notes. The dashboard action disappears after the transaction succeeds.

### Homework status and current work

- `homeworkDeadlineAt` and `effectiveHomeworkStatus` are now the shared domain
  source for dashboard, lists, analytics and streak calculations.
- Date-only deadlines expire at the end of the chosen date in `Europe/Moscow`,
  independent of browser timezone. Explicit date-time deadlines keep their IANA
  timezone.
- Student current-work priority is deterministic:
  `needs_revision → overdue → nearest assigned deadline → submitted fallback`.

### Calendar and timezone

- Day, Week and Month use one persisted `focusDate`.
- Day queries one exact local day; Week is a real Monday–Sunday week; Month is a
  fixed 42-day grid and includes lessons in visible outside-month cells.
- Query boundaries are converted with the teacher IANA timezone and use a
  one-day safety margin before client-side timezone bucketing.
- Calendar view, focus date, selected student and time mode are stored in
  session storage. Analytics student/date filters and homework tab are also
  retained.
- Dashboard and Planner open the same lesson through shared lesson IDs/services.

### Recurrence foundation

- Browser page-open materialization was removed.
- `FirestoreScheduledLessonMaterializer` is a backend-safe scheduler contract:
  it finds active series and invokes the existing idempotent rolling +12-week
  materializer.
- `lessonSeries.materializedThrough` and `materializedAt` provide observable
  health. Teacher Calendar warns when the horizon is below eight weeks.
- Deterministic lesson IDs plus `lessonOccurrenceExclusions/{lessonId}` preserve
  hard-delete tombstones; cancelled, rescheduled, completed and excluded
  occurrences are never resurrected.
- Deployment of an actual scheduler is deliberately deferred until a protected
  backend runtime is approved.

### Data invariants, analytics and scale

- `students.activeProgramId` is the authoritative optional pointer. A workspace
  fails closed when more than one active program exists; program switching is an
  atomic transaction.
- Analytics no longer exposes a fake program selector. It derives labels from
  real active program profiles and denominators/task numbers from the linked
  exam blueprint or observed evidence.
- Teacher homework listeners are bounded to 100 rows initially and expose
  `loadMore`; related submissions are bounded to 200. Workspace limits are:
  lessons 120, homeworks 120, submissions 160, mocks 50, programs 10.
- Planner listeners are restricted to active items (500), goals (100) and
  subgoals (500). Lesson journal renders 20 rows initially and expands on demand.
- Local composite indexes were added for each new ordered/limited query. No
  production index deployment was performed.

### Trust and UX

- Student written submissions have a text-response fallback when uploads are
  unavailable; teachers can review the stored response text.
- Teacher Student Overview now contains summary cards, payment summary,
  conference/access controls and explicit quick actions instead of duplicating
  full journal/homework/mock workflows.
- Teacher dashboard lesson rows are fully clickable and mobile-readable.
- Teacher mobile navigation is a fixed five-action bottom bar: Home, Schedule,
  Students, Homework and More. More opens Materials, Analytics, Mocks and Planner
  as an overlay row without consuming the first viewport.
- Materials duplicate collection control was removed.
- A production-safe React error boundary emits PII-free structured events with
  only route, action, errorCode, timestamp and appVersion.
- Route-level lazy loading splits teacher/student pages from the initial entry.

### Gamification

- Streak means a chronological run of distinct homework assignments checked on
  time. Retries for one homework count once; a missed/late completed deadline
  breaks the run; unfinished future work does not.
- Achievement creation remains event-driven in domain transactions. The old
  page-open reconciliation side effect was removed.
- Existing production achievements must be audited before any future migration;
  Phase 10.2 does not delete or rewrite them.

## Schema, Rules and indexes

Additive schema fields:

- `students.activeProgramId?: string | null`;
- `lessonSeries.materializedThrough?: Timestamp | null`;
- `lessonSeries.materializedAt?: Timestamp | null`;
- `homeworkSubmissions.studentInput.itemProgress[].responseText?: string | null`.

Rules change:

- `homeworks` now separates `get` and `list`. A signed-in transaction may read a
  missing deterministic target before creating it; existing homework reads and
  every list/query still require teacher/student ownership. Anonymous access is
  unchanged and denied.

Indexes:

- added ordered indexes for teacher/student homeworks and submissions;
- added teacher/student mock indexes by `takenAt desc`;
- added student lesson-history indexes by `startAt desc`;
- added active teacher planner-items index.

The exact local definitions are in `firebase/firestore.indexes.json`; none were
deployed.

## Infrastructure plans and intentional blockers

`PHASE_10_2_INFRASTRUCTURE_PLAN.md` documents:

- protected scheduled materialization runtime, lease/monitoring and alerts;
- Admin SDK student provisioning and password-reset contract with authorization,
  rate limiting, audit records, conflict preflight and rollback behavior;
- proposed summary documents and event-driven maintenance;
- achievement reconciliation before a future production change.

Production Storage remains unavailable on Spark, so upload buttons stay
explicitly disabled/fail-closed while written responses remain usable.
Production student provisioning/reset remains fail-closed until a protected
Admin backend exists.

## Performance

Before Phase 10.2 (Phase 10.1 build):

- one application entry chunk: 293,286 bytes;
- total JavaScript: 1,106,847 bytes.

After route-level splitting:

- initial application entry: 14,433 bytes (5,217 bytes gzip);
- React vendor: 229,300 bytes (73,380 bytes gzip);
- Firebase vendor: 583,720 bytes (171,440 bytes gzip);
- teacher/student route chunks: 0.38–30.45 kB each, loaded on demand;
- total JavaScript across all lazy chunks: 1,131,416 bytes.

The total is slightly larger because of chunk boundaries, but code required for
unvisited teacher/student routes no longer blocks the initial screen. Firebase
remains the known >500 kB vendor chunk; deeper SDK-level splitting is deferred.

## Verification

- TypeScript: pass.
- ESLint: pass.
- Production-mode Vite build: pass.
- Unit/domain suites: 12 files, 43 tests passed.
- Firestore Security Rules: 33 tests passed.
- Storage Rules: 5 tests passed.
- New Phase 10.2 browser regressions: 5 tests passed (dashboard lesson deep link,
  exact calendar ranges, atomic linked homework/no duplicate/action clear,
  mobile navigation, real analytics selector).
- Responsive login: 360 / 768 / 1024 / 1440, 4 tests passed.
- Full historical browser run initially reported 44/52 pass. All eight failures
  were outdated assertions or non-isolated screenshot assumptions affected by
  the approved new behavior; after updating them, each failed scenario was
  rerun and passed (13/16, then 3/4, then the final 1/1).
- Final Phase 10.2 screenshot scenario: 1/1 passed and produced all ten required
  images.

## Screenshots

The acceptance set is stored in `artifacts/phase10-2/`:

1. `teacher-home-clickable-lesson.png`
2. `calendar-day.png`
3. `calendar-week.png`
4. `calendar-month-outside-lesson.png`
5. `student-overview-simplified.png`
6. `homework-linked-to-lesson.png`
7. `student-current-homework-revision.png`
8. `materials-filters.png`
9. `mobile-teacher-navigation.png`
10. `analytics-without-fake-selector.png`

## Audit follow-up

Fixed: lesson/homework consistency, date-only overdue drift, calendar range
drift, browser-side recurrence, ambiguous active program selection, unbounded
primary histories, fake analytics selector, inflated streak, page-open
achievement writes, duplicate overview workflows, mobile teacher navigation and
missing render fallback.

Partially fixed: scale risk is materially reduced with limits and load-more, but
server-maintained summary documents are only designed; recurrence is backend-
ready but has no deployed scheduler.

Deferred with fail-closed behavior: protected production provisioning/password
reset, production Storage uploads, scheduler deployment, production migration,
Rules/index deployment, and achievement reconciliation. These require a separate
post-acceptance production authorization.

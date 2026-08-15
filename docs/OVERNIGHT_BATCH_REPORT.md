# Overnight local development report — Phases 5–9A

Date: 2026-08-15. Scope: local source code, Firebase Emulator and synthetic data only.
Production project `kabinet-25`, production Auth, Firestore data, Rules, indexes and
credentials were not accessed or changed.

## Status

- Phase 5 — complete: full homework workflow, revisions and independent completion/score.
- Phase 6 — complete: detailed OGE mock input, report and confidence-adjusted analytics.
- Phase 7 — complete for the approved no-Cloud-Functions architecture: XP, levels,
  streak, deterministic achievements, popup and history. Direct homework/mock awards
  are transactional; derived awards are synchronized by an idempotent teacher-only
  operation. Student writes remain forbidden.
- Phase 8 — complete: external-link materials, teacher create/edit/archive and student
  program/task/use-case filtering. Storage remains OFF.
- Phase 9A — complete: first connected Light/Dark visual pass for teacher and student.
- Phase 10 — not started.

No blocking defects remain in the local batch. This is a first visual integration, not
final pixel-perfect polish.

## Functional screens and flows

Teacher routes now cover the connected dashboard, schedule/month calendar, students,
student card, homework review, materials and analytics/mock reports. The dashboard shows
today's lessons, overdue homework, submissions waiting for review, attention count,
today's schedule, students and quick actions.

Student routes cover the connected dashboard, homework, progress, materials and profile.
The dashboard shows the next lesson, main goal, days to exam, current homework, readiness,
latest mock, XP, level, streak and latest achievement.

Key workflows:

- teacher creates practice/written/interactive/other homework with deadline;
- student submits completion, optional self-result and comment;
- teacher checks or requests revision; student resubmits;
- checked homework awards deterministic XP and applicable achievements atomically;
- detailed mock form calculates section totals, `20/37`-style report and grade;
- mock save awards deterministic XP and first-mock achievement atomically;
- analytics calculates mastery/readiness/trends without making one attempt 100% mastery;
- teacher creates, edits and archives external materials; student receives changes in
  realtime and sees only materials selected for the active program;
- Light/Dark preference persists and both shells remain role-guarded.

## Responsive screenshots

All screenshots are under `artifacts/phase9a/` and were produced by the Emulator E2E run.
Every role/theme combination was checked at 360, 768, 1024 and 1440 px with no horizontal
document/body overflow.

| Role | Theme | 360 | 768 | 1024 | 1440 |
| --- | --- | --- | --- | --- | --- |
| Teacher | Light | `teacher-light-360.png` | `teacher-light-768.png` | `teacher-light-1024.png` | `teacher-light-1440.png` |
| Teacher | Dark | `teacher-dark-360.png` | `teacher-dark-768.png` | `teacher-dark-1024.png` | `teacher-dark-1440.png` |
| Student | Light | `student-light-360.png` | `student-light-768.png` | `student-light-1024.png` | `student-light-1440.png` |
| Student | Dark | `student-dark-360.png` | `student-dark-768.png` | `student-dark-1024.png` | `student-dark-1440.png` |

## Local data/schema additions requiring production planning

No production migration was run. Before production use, review these additive fields and
documents:

- `lessonSeries`: `startsOn`, `endsOn`, `cancelledAt`, `cancelledBy` (Phase 4; the existing
  Lera series is intentionally not migrated yet);
- `homeworks`: optional `dueDate`, `dueTime`, `dueTimezone`; existing `dueAt` remains valid;
- `mockExams`: detailed task results and section/criteria/error structures plus optional
  `takenDate`; source scores remain authoritative;
- `achievementDefinitions`: 14 base definitions and dynamic `task-master-N` definitions;
- `gamificationEvents`: deterministic `homework_completed__<homeworkId>` and
  `mock_completed__<mockExamId>` documents;
- `studentAchievements`: deterministic `<studentProgramId>__<achievementCode>` documents;
- `materials`: existing schema is used with external URL, active flag, program profile IDs,
  task numbers and tags; `storagePath` stays null.

## Local Rules and indexes

Local Rules SHA-256:
`FF5967E765D7D142A739173B3C82518C078BD33E159FC71C69AAC0C46971492E`.

Changes to review before a future Rules deployment:

- narrow student homework status update to `submitted` only;
- deterministic point reads plus ownership-checked create/read/update for submissions;
- attachment URLs must remain empty while uploads are OFF;
- teacher-only create/update and student-own read for achievements;
- teacher-only immutable XP event creation and student-own read;
- no student XP/achievement/material writes and no deletes.

Local indexes SHA-256:
`33CB432D7C62B99CF8D6D4EA22DE9A752E58A5AC4AD8C29DC1605AF70C831FD6`.

One new production candidate index was added locally:

- `materials`: `programProfileIds ARRAY_CONTAINS` + `active ASC`.

The three Phase 4 lesson indexes remain unchanged in the local index file. Nothing was
deployed.

## Verification results

- `typecheck`: PASS.
- `lint`: PASS, no warnings.
- provisioning/domain tests: 5/5 PASS.
- schedule domain tests: 6/6 PASS.
- analytics domain tests: 4/4 PASS.
- gamification domain tests: 2/2 PASS.
- Firestore Rules Emulator: 26/26 PASS.
- Auth/Firestore E2E: 18/18 PASS.
- standalone responsive login tests: 4/4 PASS.
- production build: PASS (92 modules transformed).

The Firebase Admin SDK prints a non-failing metadata lookup warning after Emulator shutdown;
all commands exit with code 0 and no production lookup is used.

## Morning manual checklist

1. Start Auth + Firestore Emulator and the Vite app using the documented local setup.
2. Sign in as `test.teacher`; verify Light/Dark, dashboard, all seven menu destinations and
   the month calendar at the four target widths.
3. Open the synthetic student; create each homework type, submit as student, request a
   revision, resubmit and check it with both a low and a high score.
4. Confirm completion and score remain separate concepts and the student cannot edit the
   teacher evaluation.
5. Add a detailed mock, verify totals/grade/report/readiness and confirm XP does not duplicate
   after revisiting screens.
6. Create/edit/archive a material and confirm realtime student visibility, program filtering,
   task filtering and the two material modes.
7. Review achievement popup/history/profile and both themes at 360/768/1024/1440.
8. Confirm long titles/URLs and all forms remain usable with keyboard and touch targets.

## Future production steps — not executed

1. Perform a fresh read-only inspection of project ID, active Rules, indexes and affected
   pilot documents; produce a dry-run classification.
2. Decide and separately approve the additive Phase 4/5 schema migration. Keep the existing
   Lera series unmigrated until that explicit decision.
3. Prepare an idempotent plan-only seed for base achievement definitions; no deletes.
4. Re-run all Rules tests against the exact candidate Rules file.
5. With separate approval, deploy only required indexes and wait until they are ready.
6. With another separate approval, deploy only `firestore:rules`, verify active source/hash,
   and confirm Auth/documents did not change.
7. Run production teacher/student/anonymous smoke tests, including forbidden student writes,
   and verify pilot document hashes are unchanged.
8. Treat application hosting/Phase 10 as a separate explicitly approved phase.

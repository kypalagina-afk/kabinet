# Gamification v1

All XP writes are teacher-managed. Student clients can only read their own events and achievements.

## XP

- checked homework: `+50 XP`, deterministic event `homework_completed__<homeworkId>`;
- saved mock exam: `+100 XP`, deterministic event `mock_completed__<mockExamId>`;
- level size: `500 XP`;
- negative XP is not used in v1;
- source documents remain the source of truth.

## Achievement rules

- `first-step` — first submitted homework;
- `battle-baptism` — first mock exam;
- `on-time` — checked homework submitted by its deadline;
- `momentum` / `iron-streak` / `unstoppable` — homework streak 3 / 7 / 14;
- `sniper` — task mastery at least 90 after at least three attempts;
- `growth` — mock trend grows by at least 10 percentage points;
- `comeback` — a revision is followed by a checked attempt;
- `personal-best` — a new best mock score;
- `first-mastery` — first task reaches confidence-adjusted mastery 75;
- `halfway` / `almost-ready` / `exam-ready` — readiness 50 / 75 / 90;
- dynamic `task-master-N` — task N reaches confidence-adjusted mastery 85.

Achievement IDs are deterministic per student program and definition. The client may derive preview state, but persisted awards remain teacher-managed.

Direct workflow awards are transactional: homework checking persists `first-step`, `on-time`
and `comeback` where applicable; mock creation persists `battle-baptism`. Analytics and
streak thresholds are derived from source documents and synchronized by an idempotent,
teacher-only client operation when the teacher opens the student card. Dynamic definitions
use deterministic `task-master-N` IDs. No student client can persist awards or XP.

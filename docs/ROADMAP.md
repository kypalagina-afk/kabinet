# ROADMAP

## Gamification v2

- персонаж, одежда и обмундирование;
- косметические награды и разблокируемые аватары;
- комната, мебель и украшения;
- награды за XP, уровни и достижения.

Персонаж и комната не входят в Phase 9B: сейчас остаются XP, уровни, достижения и CSS-аватары.

## MVP v1
Roles, username/password, Firestore, student cards, program abstraction, OGE Russian 2027 pilot, schedule, recurrence, transfers, timezones, homework, mock exams, report, OGE analytics, goal, countdown, paid flag, link materials, XP/levels/streak/achievements, Light/Dark, GitHub Pages.

## v1.1
File uploads after Storage/billing setup.
Parent shareable report image, no parent account.

## v1.2 — Voice input
Teacher speaks lesson summary -> speech-to-text -> AI structures topic/result/issues/homework/deadline/comment -> editable draft -> teacher confirms -> normal Firestore writes.
Never save AI output without confirmation.

## v1.3 — Essay checker
CloudText-like highlighting, error category, criterion, comment, score, recurring-error analytics.

## v1.4 — Russian100
If API/export exists -> `practiceAttempts`.
Otherwise self-report fallback.

## v2 — Own question bank
questionBank / tests / testItems / testAttempts.

## v2+ — EGE
New programProfile + examBlueprint + report renderer.
Do not fork whole app unless UX requires it.

## School
`programProfile.type = school`, topic-based analytics.

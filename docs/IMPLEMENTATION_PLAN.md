# IMPLEMENTATION PLAN v1

## Phase 0 — Foundation
- Vite + React + TypeScript
- HashRouter
- Firebase modular SDK
- env config
- TS types/schema
- data repositories/services
- rules file
- safe local Admin SDK seed tool
- responsive foundation: mobile-first student shell, desktop-first teacher shell,
  adaptive grids/breakpoints and checks at 360/768/1024/1440 px
- Firebase Emulator + automated Firestore Security Rules tests for anonymous,
  teacher and student single-document and list/query access
- `.gitignore`
- seed НЕ запускать автоматически

Остановиться.

## Phase 1 — Auth + roles
- username/password login
- username -> technical auth email
- auth state
- `users/{uid}`
- route guards
- teacher/student shell
- logout
- theme

Никакой публичной регистрации.

## Phase 2 — Vertical slice
Только:
students, studentPrograms, lessons, homeworks, mockExams.

Teacher:
- список;
- профиль;
- ДЗ;
- пробник.

Student:
- ближайший урок;
- ДЗ;
- последний пробник.

Критерий:
Teacher write -> Firestore -> Student sees it.

## Phase 3 — Pilot seed
Только после разрешения:
- teacher Auth;
- student Auth;
- users docs;
- private seed.
Seed idempotent.

## Phase 4 — Schedule
- month calendar
- recurring series
- +12 weeks materialization
- reschedule/cancel
- paid/unpaid
- timezone switch

## Phase 5 — Homework
Teacher create/check/revision/result.
Student studentInput.
Uploads OFF.

## Phase 6 — Mock + analytics
- detailed form
- totals
- task map
- criteria
- report
- trend
- readiness
- mastery

## Phase 7 — Gamification
XP, level, streak, achievements, one-time events.
Student cannot write XP.

## Phase 8 — Materials
Links, categories, filters.

## Phase 9 — Visual polish
Light/Dark, responsive, animations, achievement visuals.

## Phase 10 — GitHub Pages
Build, HashRouter, deploy, authorized domains if needed, final rules check, no private seed/service account in Git.

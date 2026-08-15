# Phase 9B — local implementation report

Дата проверки: 15.08.2026. Среда: только `demo-kabinet-25` через Firebase Emulator Suite. Production `kabinet-25`, production Auth, rules, indexes, Storage, billing и GitHub не изменялись.

## Реализовано

- единая responsive Light/Dark-система, уменьшенная плотность заголовков и пустот, русские статусы, новые chips, progress states и CSS-аватары;
- password eye, Caps Lock warning, Enter submit; выбор `avatarKey` преподавателем и учеником;
- список учеников с поиском/фильтрами, local Admin provisioning wizard, редактирование, архив/восстановление, одноразовый пароль после create/reset, безопасное копирование реквизитов;
- teacher preview без смены Firebase Auth и без student actions;
- глобальное `+ Создать`, dashboard «Нужно сделать» и кликабельные KPI;
- calendar Month/Week/Day, live clock, presets и ручной ±1 час, student/payment filters, one-off lesson, inline/bulk payment, recurring materialization и существующие атомарные reschedule/cancel operations;
- public lesson understanding и student lesson history; private `lessonTeacherNotes`; быстрый атомарный Complete Lesson с deterministic homework/XP IDs и autosave;
- backward-compatible homework package (`items[]`), отдельный `itemProgress`, progress UI, revision flow, local draft, teacher/student attachment abstraction и Storage Emulator uploads;
- глобальный список пробников, полная история, раскрытие и сравнение в баллах; numeric inputs, GK labels, blueprint-driven literacy gates, local autosave;
- разделение studied mastery/readiness, confidence, freshness warning, teacher override + student-safe public projection, aggregate student table и goal path;
- material folders schema, visibility/explicit `allowedStudentIds`, student-scoped query, search/filter/badges, blueprint task chips, favorites/recent fields;
- roadmap Gamification v2 без реализации персонажа/комнаты.

## Schema diff (additive)

Новые collections: `lessonTeacherNotes`, `materialFolders`, `homeworkTemplates`, `taskMasteryOverrides`, `studentTaskMasteryPublic`, `teacherAuditEvents`.

Новые поля: `avatarKey`; lesson `understanding` и расширенный public summary; homework `items`, `attachments`, `templateId`, `draft`; submission `attachments`, `itemProgress`; material `folderId`, `visibility`, `selectedStudentIds`, `allowedStudentIds`, `favorite`, `lastUsedAt`; blueprint `gradeRules`; series `startsOn`, `endsOn`, `cancelledAt`, `cancelledBy`.

## Rules diff

Firestore: teacher-owned writes для новых private collections; student видит только `studentTaskMasteryPublic`; `lessonTeacherNotes`, override metadata и audit teacher-only; student materials только при membership в `allowedStudentIds`; user avatar self-update разрешён; broad user list по-прежнему запрещён.

Storage: новый локальный `firebase/storage.rules`; homework path scoped teacher/student, до 15 MB, только image/PDF/text/vnd; всё остальное deny. Production rules не развёртывались.

## Indexes diff

Локально добавлен composite index `materials.allowedStudentIds ARRAY_CONTAINS + active ASC`. Предыдущие lesson/material indexes сохранены. Production indexes не развёртывались.

## Production plan / requirements

1. Отдельно утвердить additive data migration/backfill `allowedStudentIds`, grade rules и новые nullable fields.
2. Реализовать защищённый callable/backend `StudentProvisioningService` на Admin SDK; browser creation запрещён.
3. Отдельно разрешить Firebase Storage/billing, deploy Storage Rules и file-upload feature flag.
4. Повторить Rules/Storage tests, dry-run indexes и staged smoke test до любого production deploy.

## Осознанно оставшиеся блокеры

- drag gesture в Week/Day пока не подключён к confirm modal (атомарный перенос через inspector работает);
- изменение recurring series «это и будущие» требует отдельной domain operation; текущие one-off reschedule и cancel history работают;
- кнопка сохранения homework template отображается, но полный reuse/duplicate/assign-another workflow ещё не подключён;
- материал пока нельзя выбрать непосредственно внутри homework item; связи `materialIds[]` в schema готовы;
- auto-generated mock priorities/homework draft ещё не подключены;
- teacher file attachment в homework editor и autosave restore confirmation для всех edit-вариантов требуют завершения;
- aggregate Analytics показывает строки учеников, но полные средние/grade distribution ещё не вычисляет.

Эти пункты означают, что Phase 9B нельзя считать продуктово закрытой, несмотря на зелёный regression suite. Они не маскируются как готовые.

## Tests

- TypeScript: PASS;
- ESLint `--max-warnings=0`: PASS;
- build: PASS;
- domain: 22 PASS (`provisioning 5`, `schedule 6`, `analytics 9`, `gamification 2`);
- Firestore Rules Emulator: 26 PASS;
- Storage Rules Emulator: 2 PASS;
- Auth/E2E/data/realtime/Phase9B: 27 PASS;
- responsive: 4 PASS, widths 360/768/1024/1440;
- screenshots: `artifacts/phase9b/`.

## Manual acceptance

- Проверить mouse/keyboard/touch в teacher/student shells в Light/Dark.
- Создать временного Emulator student, скопировать credentials, reset password, preview, archive/restore.
- Создать one-off/recurring lesson, оплатить inline и bulk, перенести/отменить, завершить урок.
- Создать package homework, отправить legacy/package attempt и файл, проверить/revision.
- Ввести mock с клавиатуры, проверить five grade gate cases и compare.
- Проверить public/private material access двумя student accounts.
- Убедиться, что private notes/override metadata недоступны student.

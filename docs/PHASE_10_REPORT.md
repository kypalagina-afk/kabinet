# Phase 10 — local delivery report

Дата завершения локальной реализации: 22 августа 2026.

Phase 10 реализована и проверена только через Firebase Emulator Suite. Production-проект `kabinet-25`, Firebase billing, production Auth/Firestore/Storage, GitHub и публичный GitHub Pages сайт не изменялись.

## 1. Change report

- Удалена дублирующая глобальная кнопка `+ Создать`; действия создания оставлены внутри соответствующих разделов.
- В общем разделе домашних заданий добавлено контекстное `+ Создать ДЗ`. Форма использует тот же `CreateHomeworkForm` и тот же domain flow, что и карточка ученика; активный фильтр ученика подставляется автоматически.
- Исправлен selector ученика в аналитике: нормальная desktop-ширина, gap между фильтрами, full-width mobile layout и `title` для полного имени.
- Расширен reusable `Avatar`: единый face-focused crop, `size`, `scale`, круглая/rounded-square форма и selected state. Компонент применяется к утверждённым student/animal assets и адаптируется к sidebar, карточкам и picker в Light/Dark.
- В teacher profile используется `displayName`; приветствие не подменяется auth login.
- Добавлен teacher-only маршрут `/teacher/planner`, пункт `Планы`, режимы День/Неделя/Месяц, категории и display-фильтры.
- В планере объединены существующие `lessons` и приватные записи преподавателя без копирования lesson documents. Есть timed/untimed tasks, personal events, backlog «Когда-нибудь», переносы, завершение и история.
- Добавлены большие цели, подцели, связанные задачи и вычисляемый прогресс.
- На Teacher Home добавлен компактный realtime-блок «Планы на сегодня».
- Добавлена production-ready абстракция `StudentProvisioningService`: Emulator implementation создаёт Auth и начальные Firestore records, production adapter остаётся fail-closed.
- Добавлен `fileAssetService` для Storage Emulator: валидация до upload, progress, metadata, structured paths, rollback при ошибке metadata и controlled deletion.
- Upload подключён к student submission, teacher homework attachments и materials. В production UI остаётся понятный disabled state до отдельного разрешения Storage rollout.
- Добавлен teacher-scoped resource monitoring service: ученики, файлы, active files, общий объём, uploads текущего месяца и количество отслеживаемых Firestore documents.

## 2. Schema diff

Изменения additive и описаны в `docs/FIREBASE_SCHEMA.md`.

- `users.displayName?: string` — отображаемое имя отдельно от login.
- `fileAssets/{assetId}` — Firestore metadata файла: ownership, purpose, связи с homework/material/item/submission, MIME, size, Storage path, access list, lifecycle status и audit timestamps.
- `plannerItems/{id}` — teacher-only task/event: category, status, optional date/time/end/duration/deadline, notes, goal/subgoal links и soft-delete fields.
- `plannerGoals/{id}` — большая цель преподавателя.
- `plannerSubgoals/{id}` — шаг большой цели; прогресс вычисляется из завершённых subgoals/tasks и не дублируется отдельным источником истины.
- Существующие `lessons` остаются единственным источником уроков для календаря и планера.

## 3. Firestore Rules diff

- Добавлены правила для `fileAssets`: teacher работает только со своими файлами/учениками, student читает только разрешённый ему asset и управляет только metadata собственного submission; student update ограничен безопасным удалением, ownership и связи менять нельзя.
- Добавлены `plannerItems`, `plannerGoals`, `plannerSubgoals`: доступ только аутентифицированному owner teacher; student и anonymous получают deny.
- Default deny и существующая student privacy сохранены.
- Production Rules не разворачивались.

## 4. Storage Rules diff

- Разрешены только JPEG, PNG, WebP, PDF, DOC, DOCX и TXT размером не более 15 MB.
- Audio, video, executables, неизвестные MIME и неизвестные paths запрещены.
- Teacher paths разделены для homework и materials; teacher должен совпадать с owner metadata.
- Student может загружать только в собственный submission path и читать только собственные/явно доступные assets.
- Другой student не может читать или писать чужой файл.
- Удаление контролируется Firestore metadata и ownership; default deny сохранён.
- Production Storage и Storage Rules не включались и не разворачивались.

## 5. Indexes diff

Локально добавлены два composite index:

- `plannerItems`: `teacherId ASC`, `active ASC`, `date ASC`;
- `plannerSubgoals`: `teacherId ASC`, `goalId ASC`, `sortOrder ASC`.

Production indexes не разворачивались.

## 6. StudentProvisioning production backend requirements

Production implementation должна быть защищённым callable/HTTP endpoint с Admin SDK, а не browser-side Auth workaround. Backend должен:

- проверить Firebase ID token и роль teacher;
- нормализовать username существующим alias-алгоритмом и проверить ownership программы;
- создать Auth user, затем атомарный Firestore batch для `users`, `students`, `studentPrograms`, payment account и optional lesson series;
- удалить только что созданного Auth user, если Firestore batch не прошёл;
- корректно обрабатывать duplicate login/email, rate limit и audit event;
- никогда не логировать и не хранить plaintext password;
- возвращать credentials только один раз, не меняя текущую teacher session.

До отдельного backend/Blaze rollout production adapter намеренно fail-closed.

## 7. Firebase Storage production requirements

Перед включением production uploads нужны отдельное разрешение, проверка bucket/CORS, deployment Storage Rules, feature flag, smoke tests teacher/student/anonymous и решение по retention/monitoring. Firestore хранит metadata, Storage — binary. Original filename не используется как уникальный ID.

Структурированные пути:

- `teachers/{teacherId}/homework/{studentId}/{homeworkId}/{assetId}/{fileName}`;
- `students/{studentId}/submissions/{homeworkId}/{assetId}/{fileName}`;
- `teachers/{teacherId}/materials/{materialId}/{assetId}/{fileName}`.

Файлы не удаляются автоматически при завершении/проверке ДЗ. Manual delete требует подтверждения и выполняется через controlled deletion, чтобы не оставлять orphan binary.

## 8. Blaze/billing requirements

Текущий этап не меняет тариф и не включает платные сервисы. Отдельного решения потребуют:

- официальный upgrade `kabinet-25` на Blaze и Cloud Billing account;
- budget alerts и ожидаемые лимиты;
- production Storage;
- production Admin SDK provisioning endpoint;
- monitoring и retention policy.

## 9. Planner data model and behavior

- Уроки читаются напрямую из `lessons`; personal items — из `plannerItems`.
- Перенос урока из Planner вызывает существующий безопасный lesson reschedule workflow, поэтому Calendar и Planner сразу видят одну и ту же сущность.
- Personal event не участвует в оплатах и никогда не доступен student.
- Day — основной рабочий режим с 08:00–20:00 и отдельной зоной «Без времени».
- Week объединяет timed/untimed items по семи дням; Month даёт compact overview и открывает выбранный день.
- Backlog item можно отправить на сегодня, завтра, выбранную дату/время или перенести drag/drop.
- Filters `Все / Уроки / Работа / Дом / Личное` меняют только отображение.
- Цепочка `goal → subgoal → task` использует ссылки `goalId/subgoalId`; прогресс вычисляется по завершённым шагам.

## 10. Additive production migration plan — not executed

1. Повторно проверить project ID, активные Rules/indexes и сделать backup/snapshot pilot data.
2. Выполнить read-only dry-run для новых collections и полей; не переписывать существующие документы.
3. Отдельно согласовать Firestore Rules и два planner indexes.
4. Отдельно согласовать Blaze, Storage Rules/bucket и защищённый provisioning backend.
5. Включить feature flags только после deployments и выполнить anonymous/teacher/student smoke tests.
6. Сравнить pilot snapshot до/после и подтвердить отсутствие потери/изменения существующих данных.

## 11. Verification results

- TypeScript typecheck: PASS.
- ESLint: PASS.
- Production-mode build: PASS. Есть только non-blocking warning о Firebase chunk 583.72 kB.
- Firestore Rules Emulator: 2 files, 34 tests PASS.
- Storage Rules Emulator: 1 file, 5 tests PASS.
- Unit/domain suites (provisioning, schedule, analytics, gamification, payments): 8 files, 31 tests PASS.
- Full authenticated regression E2E: 40 tests PASS.
- Финальный targeted Phase 10 E2E + screenshots после CSS/timezone fixture fix: 8 tests PASS.
- Standalone responsive login: 4 widths/tests PASS.
- Responsive acceptance: 360, 768, 1024 и 1440 px; horizontal overflow не обнаружен.
- `git diff --check`: PASS; сообщения Git относятся только к будущей нормализации LF/CRLF.

Финальная CSS-правка compact week/month проверена повторным screenshot-test: текст событий сокращается ellipsis и больше не переносится по одному символу.

## 12. Acceptance screenshots

Все кадры находятся в `artifacts/phase10/`:

- `planner-day-light.png` — Planner Day / Light;
- `planner-week.png` — Planner Week;
- `planner-month.png` — Planner Month;
- `planner-month-alternate-theme.png` — Month / alternate theme;
- `planner-goals.png` — Goals/subgoals;
- `planner-someday.png` — Backlog «Когда-нибудь»;
- `teacher-home-planner-widget.png` — Teacher Home widget;
- `create-student.png` — local provisioning UI;
- `file-upload-teacher.png` — teacher upload;
- `file-upload-student-dark.png` — student upload / Dark;
- `planner-360.png`, `planner-768.png`, `planner-1024.png`, `planner-1440.png` — responsive critical view.

## 13. Release boundary

- Production Firebase `kabinet-25`: untouched.
- Production Auth/Firestore/Storage/Rules/indexes: untouched.
- Firebase billing/Blaze: untouched.
- GitHub repository and GitHub Pages: untouched.
- Публичная production-версия сайта: unchanged.

Phase 10 остановлена на локальной границе. Production rollout и roadmap-функции не начинались.

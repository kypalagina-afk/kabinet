# SECURITY RULES v1

## Принцип
**Deny by default.** Не включать Test Mode.

Роль живёт в `users/{request.auth.uid}`.

Ресурсы содержат `teacherId`, ученические — `studentId`.

## Queries are not filters

Учитель для списков обязан query по `teacherId == auth.uid`.
Ученик — по `studentId == currentUserProfile.studentId`.

## Teacher client
Пишет students, studentPrograms, lessonSeries, lessons, homeworks, teacherEvaluation, mockExams, materials, studentAchievements, gamificationEvents.

## Student client
Может читать только свои данные, менять theme и писать только `studentInput` собственного submission.

При create/update `homeworkSubmissions` правила дополнительно проверяют, что
`homeworkId` существует, homework принадлежит тому же `studentId` и имеет тот же
`teacherId`.

При создании `homeworks` и `mockExams` правила проверяют существование активного
`studentProgram` и совпадение его `teacherId`/`studentId`. При последующих
обновлениях связь с программой также должна оставаться валидной.

Не может менять:
teacherEvaluation, grade, mockExam, goal, paymentStatus, XP, achievements, ownership fields.

## Auth provisioning
Не создавать student account через обычный `createUserWithEmailAndPassword` из teacher browser, потому что новый user автоматически становится текущей сессией.

Для v1:
- локальный Admin SDK provisioning/seed;
- позже server function/admin endpoint.

## Пароли
Не хранить в Firestore/Git.
Reset через Admin SDK.

Starter rules: `firebase/firestore.rules`.

Перед production deploy проверить:
- anonymous;
- teacher;
- student;
- single doc;
- list/query.

Эти сценарии покрываются автоматическими тестами через Firebase Emulator.

## Локальная разработка

Phase 1 по умолчанию использует demo-проект `demo-kabinet-25`, Authentication
Emulator и Firestore Emulator. Подключение к production требует отдельного явного
`VITE_FIREBASE_TARGET=production`; реальные аккаунты в локальных fixtures не
используются.

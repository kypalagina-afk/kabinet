# Кабинет ученика — Codex Starter Pack v1

Этот пакет — источник правды для первой реализации платформы.

## Важное

- Не начинать разработку с импровизации.
- Сначала прочитать документацию в `docs/`.
- Не менять схему Firestore без отдельного согласования.
- Никогда не очищать существующую Firestore-базу при деплое.
- Реальные данные ученика лежат в `private/` и исключены из Git.
- Не коммитить service account JSON, реальные пароли, Zoom-ссылки, коды доступа и другие приватные данные.
- Firestore уже создан в Firebase-проекте `kabinet-25`, Standard edition, база `(default)`, production rules deny-all.
- Email/Password Authentication включён.
- Firebase Hosting не используется: целевой хостинг — GitHub Pages.

## Порядок чтения

1. `docs/PROJECT_SPEC.md`
2. `docs/FIREBASE_SCHEMA.md`
3. `docs/SECURITY_RULES.md`
4. `docs/DESIGN_SYSTEM.md`
5. `docs/IMPLEMENTATION_PLAN.md`
6. `docs/ROADMAP.md`
7. `private/SEED_LERA_PRIVATE.md` — только локально
8. `CODEX_START_PROMPT.md`

## Рекомендуемый стек

- Vite
- React
- TypeScript
- Firebase JS SDK modular
- Cloud Firestore
- Firebase Authentication
- HashRouter для GitHub Pages
- Lucide React
- Recharts
- CSS variables для Light/Dark
- Intl API + IANA timezone
- Framer Motion только для небольших полезных анимаций

## Первый критерий успеха

**Учитель вошёл → открыл ученика → назначил ДЗ или внёс пробник → Firestore сохранил → ученик вошёл → увидел обновление.**

До этого не уходить в полировку дизайна.

## Локальная разработка

Требуется Node.js 22.12+ и Java 21+ для Firestore Emulator.

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
npm run test:rules
npm run test:auth
npm run test:responsive
```

Перед первым локальным запуском скопировать `.env.example` в `.env.local`. В
отдельном терминале запустить `npx firebase emulators:start --only auth,firestore`,
затем `npm run dev`. Для browser-тестов нужен установленный Chrome.

`npm run test:rules` использует только demo-проект `demo-kabinet-25` и не
подключается к production Firestore. Локальный seed не запускается ни одной из
команд разработки или тестирования.

В Phase 1 `.env.example` безопасно настроен на локальные Authentication и
Firestore Emulator. Production-подключение не является значением по умолчанию.

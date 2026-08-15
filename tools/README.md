# Local Admin SDK seed tool

Инструмент ничего не запускает автоматически, не удаляет документы и принимает
входной JSON только из исключённой из Git папки `private/`.

Требования:

- Application Default Credentials или локальный service account через
  `GOOGLE_APPLICATION_CREDENTIALS` (сам JSON остаётся вне Git);
- явный `projectId: "kabinet-25"` во входном файле;
- детерминированные пути документов;
- не более 500 create/merge операций за запуск;
- пароль Auth никогда не помещается во входные Firestore-данные.

Сначала обязательный read-only план:

```powershell
npm run seed:plan -- --input=private/seed-plan.json
```

Production-запись требует двух отдельных подтверждений:

```powershell
npm run seed:apply -- --input=private/seed-plan.json `
  --confirm-project=kabinet-25 --confirm-write=APPLY_SEED
```

Pilot seed остаётся Phase 3. В Phase 0 этот инструмент не запускается.

## Phase 3 pilot provisioning

Офлайн dry-run не инициализирует Firebase Admin SDK и гарантированно не читает и не
изменяет production:

```powershell
npm run pilot:plan
```

Read-only inspection классифицирует каждый Auth user и Firestore document как
`create`, `update`, `noop` или `conflict`. Он локально спрашивает только login
преподавателя; пароли для inspection не нужны:

```powershell
npm run pilot:inspect
```

Для автоматизированного read-only inspection можно передать несекретный login:

```powershell
npm run pilot:inspect -- --teacher-username=<login>
```

В apply этот аргумент намеренно запрещён: перед записью login снова запрашивается
интерактивно локально.

Фактический apply разрешён только после отдельного подтверждения пользователя. Он
повторяет inspection, выводит план, ещё раз просит ввести `kabinet-25`, а пароли
запрашивает скрыто и дважды непосредственно перед `Admin SDK createUser`. Пароли
не принимаются через CLI/env, не попадают в seed и не логируются:

```powershell
npm run pilot:apply -- `
  --confirm-project=kabinet-25 --confirm-write=APPLY_PRODUCTION_SEED
```

UID и document ID детерминированы. Firestore использует merge только для полей из
явно показанного плана, не удаляет документы и пропускает совпадающие данные.
Конфликт технического email и UID останавливает apply до любых записей.

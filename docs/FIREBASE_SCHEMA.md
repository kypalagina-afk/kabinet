# FIREBASE SCHEMA v1

## Общие правила

- Firestore Standard, `(default)`.
- Production deny-by-default.
- `schemaVersion` в важных документах.
- архив вместо обычного удаления ученика.
- Firestore/Auth ID вместо имени как ID.
- Timestamp для дат.
- operational collections содержат `teacherId`/`studentId` для безопасных queries.

## `users/{authUid}`

```ts
{
  role: "teacher" | "student",
  username: string,
  usernameNormalized: string,
  teacherId: string | null,
  studentId: string | null,
  preferences: { theme: "light" | "dark" | "system" },
  timezone: { iana: string | null, moscowOffsetMinutes: number | null },
  createdAt: Timestamp,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

Пароль не хранить.

### Login alias

UI: username + password.

В v1 технический auth email:
`<normalizedUsername>@kabinet25.example.com`

Username разрешает `[a-z0-9._-]`.

Email reset не использовать; password reset через Admin SDK.

## `students/{studentId}`

```ts
{
  teacherId: string,
  displayName: string,
  classGrade: number | null,
  status: "active" | "paused" | "finished" | "archived",
  defaultConference: {
    provider: "zoom" | "other",
    joinUrl: string | null,
    meetingId: string | null,
    passcode: string | null,
    chatUrl: string | null
  },
  createdAt: Timestamp,
  updatedAt: Timestamp,
  archivedAt: Timestamp | null,
  schemaVersion: 1
}
```

## `programProfiles/{id}`

```ts
{
  type: "oge" | "ege" | "school",
  subject: "russian",
  targetYear: number | null,
  title: string,
  examDate: Timestamp | null,
  status: "draft" | "active" | "archived",
  examBlueprintId: string | null,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

## `examBlueprints/{id}`

```ts
{
  programType: "oge" | "ege",
  subject: "russian",
  year: number,
  version: string,
  status: "draft" | "active" | "archived",
  maxScore: number,
  gradeThresholds: map,
  sections: Array<{code:string,title:string,maxScore:number}>,
  tasks: Array<{number:number,title:string,maxScore:number,sectionCode:string}>,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

Старый blueprint не менять задним числом после реальных mockExam.

## `studentPrograms/{id}`

```ts
{
  teacherId: string,
  studentId: string,
  programProfileId: string,
  status: "active" | "paused" | "completed",
  goal: {
    type: "grade" | "score" | "custom",
    targetGrade: number | null,
    targetScore: number | null,
    displayText: string
  },
  startedAt: Timestamp,
  completedAt: Timestamp | null,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

## `lessonSeries/{id}`

```ts
{
  teacherId: string,
  studentId: string,
  studentProgramId: string | null,
  frequency: "weekly",
  weekdays: number[],
  interval: number,
  startLocalTime: string,
  durationMinutes: number,
  baseTimezone: string,
  active: boolean,
  startsOn?: string | null, // YYYY-MM-DD in baseTimezone; optional until legacy migration
  endsOn?: string | null,
  cancelledAt?: Timestamp | null,
  cancelledBy?: "teacher" | "student" | null,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

## `lessons/{id}`

```ts
{
  teacherId: string,
  studentId: string,
  studentProgramId: string | null,
  lessonSeriesId: string | null,
  startAt: Timestamp,
  endAt: Timestamp,
  originalStartAt: Timestamp | null,
  rescheduledFromLessonId: string | null,
  rescheduledToLessonId: string | null,
  wasRescheduled?: boolean,
  status: "planned"|"completed"|"rescheduled"|"cancelled_student"|"cancelled_teacher",
  topic: string | null,
  lessonSummary: {
    homeworkResultText: string | null,
    teacherComment: string | null,
    focusNotes: string[]
  },
  paymentStatus: "paid" | "unpaid" | "unknown",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

## `homeworks/{id}`

```ts
{
  teacherId: string,
  studentId: string,
  studentProgramId: string,
  sourceLessonId: string | null,
  type: "practice"|"written"|"interactive"|"other",
  title: string,
  description: string | null,
  examTaskNumbers: number[],
  assignedAt: Timestamp,
  dueAt: Timestamp | null,
  // Для срока без заданного времени dueAt остаётся null.
  dueDate?: string | null,       // YYYY-MM-DD
  dueTime?: string | null,       // HH:mm
  dueTimezone?: string | null,   // IANA
  status: "assigned"|"submitted"|"checked"|"needs_revision"|"completed"|"overdue",
  requiredAmount: number | null,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

## `lessonOccurrenceExclusions/{lessonId}` (Phase 10.1, additive)

A permanent tombstone for one hard-deleted recurring occurrence. Its document
ID is the deterministic lesson occurrence ID. Materialization reads this record
before creating a lesson, so a deleted occurrence cannot return while its
series remains active.

```ts
{
  teacherId: string,
  studentId: string,
  lessonSeriesId: string,
  occurrenceStartAt: Timestamp,
  reason: "hard_deleted",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

## `homeworkSubmissions/{id}`

```ts
{
  teacherId: string,
  studentId: string,
  homeworkId: string,
  submissionNumber: number,
  studentInput: {
    completed: boolean,
    selfReportedEarned: number | null,
    selfReportedMax: number | null,
    note: string | null,
    externalAttachmentUrls: string[]
  },
  teacherEvaluation: {
    scoreEarned: number | null,
    scoreMax: number | null,
    criteria: Array<{code:string,earned:number,max:number,errorsCount:number|null}>,
    issues: Array<{category:string,label:string,comment:string|null}>,
    comment: string | null,
    checkedAt: Timestamp | null
  } | null,
  status: "submitted"|"checked"|"needs_revision",
  submittedAt: Timestamp | null,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

## `mockExams/{id}`

```ts
{
  teacherId: string,
  studentId: string,
  studentProgramId: string,
  examBlueprintId: string,
  title: string,
  takenAt: Timestamp | null,
  takenDate?: string | null, // YYYY-MM-DD, если точное время не задано
  taskResults: Array<{taskNumber:number,earned:number,max:number}>,
  sections: {
    test: {earned:number,max:number},
    exposition: {earned:number,max:number,criteria:Array<object>},
    essay: {earned:number,max:number,criteria:Array<object>,comment:string|null},
    literacy: {
      earned:number,max:number,
      criteria:Array<{code:string,earned:number,max:number,errorsCount:number|null,category:string}>
    },
    factualAccuracy: {earned:number,max:number,errorsCount:number|null}
  },
  total: {earned:number,max:number},
  grade: number,
  teacherComment: string | null,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

## `materials/{id}`

```ts
{
  teacherId: string,
  programProfileIds: string[],
  examTaskNumbers: number[],
  title: string,
  type: "pdf"|"image"|"audio"|"video"|"link"|"interactive"|"other",
  storagePath: string | null,
  externalUrl: string | null,
  tags: string[],
  active: boolean,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

## `achievementDefinitions/{id}`

```ts
{
  code:string,title:string,description:string,iconKey:string,
  xpReward:number,active:boolean,conditionConfig:map,schemaVersion:1
}
```

## `studentAchievements/{id}`

```ts
{
  teacherId:string,studentId:string,studentProgramId:string,
  achievementDefinitionId:string,earnedAt:Timestamp,metadata:map,schemaVersion:1
}
```

## `gamificationEvents/{id}`

```ts
{
  teacherId:string,studentId:string,studentProgramId:string,
  eventType:string,sourceType:string,sourceId:string,xpDelta:number,
  createdAt:Timestamp,schemaVersion:1
}
```

Для одноразовых наград использовать deterministic event ID:
`homework_completed__<homeworkId>`.

## `fileAssets/{assetId}` (Phase 10, additive)

Метаданные файла хранятся в Firestore, бинарное содержимое — только в Storage.

```ts
{
  teacherId:string, studentId:string|null,
  ownerType:"teacher"|"student", uploadedBy:string,
  purpose:"homework"|"submission"|"material",
  homeworkId:string|null, materialId:string|null,
  itemId:string|null, submissionId:string|null,
  originalName:string, storagePath:string, mimeType:string, size:number,
  previewType:"image"|"pdf"|"document",
  allowedStudentIds:string[], status:"active"|"deleted",
  deletedAt:Timestamp|null, createdAt:Timestamp, updatedAt:Timestamp,
  schemaVersion:1
}
```

Storage paths:

- `teachers/{teacherId}/homework/{studentId}/{homeworkId}/{assetId}/{fileName}`;
- `students/{studentId}/submissions/{homeworkId}/{assetId}/{fileName}`;
- `teachers/{teacherId}/materials/{materialId}/{assetId}/{fileName}`.

## Teacher-only planner (Phase 10, additive)

`plannerItems/{id}` stores a personal task/event with `teacherId`, `itemType`,
`category`, `status`, `date`, optional time/deadline/duration/note, `priority`
(`high | medium | calm`), goal links and soft-delete fields. Task categories are
`work | home | someday`; legacy `personal` remains readable as Home. Events use
`work | home`. `plannerGoals/{id}` stores a large goal.
`plannerSubgoals/{id}` stores a goal step and optional notes. Progress is derived
from completed subgoals and linked planner items;
it is not persisted as a competing source of truth. Existing lessons stay in
`lessons` and are only rendered alongside private planner items.

## `appSettings/{id}`

```ts
{
  schema:{currentVersion:1},
  gamification:{xpPerLevel:500},
  features:{
    voiceInput:false,
    russian100Integration:false,
    essayEditor:false,
    parentReports:false,
    fileUploads:false
  },
  updatedAt:Timestamp,
  schemaVersion:1
}
```

## Derived analytics

Не делать агрегат единственным источником правды.

Из `mockExams`, `homeworkSubmissions`, позже `practiceAttempts` вычислять:
- masteryByTask;
- examReadiness;
- studiedMastery;
- weakTasks;
- strongTasks;
- mockTrend.

Кэш добавить позже при необходимости.

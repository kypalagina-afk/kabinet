import type { Timestamp } from "firebase/firestore";

export type UserRole = "teacher" | "student";
export type ProgramType = "oge" | "ege" | "school";
export type DocumentStatus = "draft" | "active" | "archived";

export interface VersionedDocument {
  schemaVersion: 1;
}

export interface AuditedDocument extends VersionedDocument {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserProfile extends AuditedDocument {
  role: UserRole;
  displayName?: string | null;
  username: string;
  usernameNormalized: string;
  teacherId: string | null;
  studentId: string | null;
  preferences: {
    theme: "light" | "dark" | "system";
  };
  timezone: {
    iana: string | null;
    moscowOffsetMinutes: number | null;
  };
  avatarKey?: string;
}

export interface Student extends AuditedDocument {
  teacherId: string;
  activeProgramId?: string | null;
  displayName: string;
  classGrade: number | null;
  status: "active" | "paused" | "finished" | "archived";
  defaultConference: {
    provider: "zoom" | "other";
    joinUrl: string | null;
    meetingId: string | null;
    passcode: string | null;
    chatUrl: string | null;
  };
  conferenceLinks?: Array<{
    id: string;
    label: string;
    provider: "zoom" | "meet" | "other";
    joinUrl: string;
    isDefault: boolean;
  }>;
  archivedAt: Timestamp | null;
  avatarKey?: string;
}

export interface ProgramProfile extends AuditedDocument {
  type: ProgramType;
  subject: "russian";
  targetYear: number | null;
  title: string;
  examDate: Timestamp | null;
  status: DocumentStatus;
  examBlueprintId: string | null;
}

export interface ExamBlueprint extends AuditedDocument {
  programType: "oge" | "ege";
  subject: "russian";
  year: number;
  version: string;
  status: DocumentStatus;
  maxScore: number;
  gradeThresholds: Record<string, number>;
  gradeRules?: Array<{
    grade: number;
    minScore: number;
    maxScore: number;
    minGkScore?: number;
    fallbackGrade?: number;
  }>;
  sections: Array<{
    code: string;
    title: string;
    maxScore: number;
  }>;
  tasks: Array<{
    number: number;
    title: string;
    maxScore: number;
    sectionCode: string;
  }>;
  writingCriteria?: {
    essay: Array<{ code: string; title: string; max: number }>;
    exposition: Array<{ code: string; title: string; max: number }>;
    literacy: Array<{
      code: string;
      title: string;
      max: number;
      errorLabel: string;
    }>;
    factual: { code: string; max: number; errorLabel: string } | null;
  };
}

export interface StudentProgram extends AuditedDocument {
  teacherId: string;
  studentId: string;
  programProfileId: string;
  status: "active" | "paused" | "completed";
  goal: {
    type: "grade" | "score" | "custom";
    targetGrade: number | null;
    targetScore: number | null;
    displayText: string;
  };
  startedAt: Timestamp;
  completedAt: Timestamp | null;
}

export interface LessonSeries extends AuditedDocument {
  teacherId: string;
  studentId: string;
  studentProgramId: string | null;
  frequency: "weekly";
  weekdays: number[];
  interval: number;
  startLocalTime: string;
  durationMinutes: number;
  baseTimezone: string;
  active: boolean;
  startsOn?: string | null;
  endsOn?: string | null;
  cancelledAt?: Timestamp | null;
  cancelledBy?: "teacher" | "student" | null;
  materializedThrough?: Timestamp | null;
  materializedAt?: Timestamp | null;
}

export type LessonStatus =
  | "planned"
  | "completed"
  | "rescheduled"
  | "cancelled_student"
  | "cancelled_teacher";

export interface Lesson extends AuditedDocument {
  teacherId: string;
  studentId: string;
  studentProgramId: string | null;
  lessonSeriesId: string | null;
  startAt: Timestamp;
  endAt: Timestamp;
  originalStartAt: Timestamp | null;
  rescheduledFromLessonId: string | null;
  rescheduledToLessonId: string | null;
  status: LessonStatus;
  topic: string | null;
  lessonSummary: {
    homeworkResultText: string | null;
    teacherComment: string | null;
    focusNotes: string[];
    activities?: string | null;
    successes?: string | null;
    errors?: string[];
    studentComment?: string | null;
  };
  examTaskNumbers?: number[];
  homeworkResolution?: "pending" | "assigned" | "not_required";
  conferenceUrl?: string | null;
  billingType?: "regular" | "free";
  billingIdentityId?: string;
  understanding?: {
    score: number;
    status: "needs_practice" | "in_progress" | "confident";
  } | null;
  paymentStatus: "paid" | "unpaid" | "free" | "unknown";
  wasRescheduled?: boolean;
}

export interface LessonOccurrenceExclusion extends AuditedDocument {
  teacherId: string;
  studentId: string;
  lessonSeriesId: string;
  occurrenceStartAt: Timestamp;
  reason: "hard_deleted";
}

export interface LessonTeacherNote extends AuditedDocument {
  teacherId: string;
  studentId: string;
  lessonId: string;
  note: string;
}

export type HomeworkStatus =
  | "assigned"
  | "submitted"
  | "checked"
  | "needs_revision"
  | "completed"
  | "overdue";

export interface Homework extends AuditedDocument {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  sourceLessonId: string | null;
  type:
    | "theory"
    | "practice"
    | "written"
    | "interactive"
    | "essay"
    | "exposition"
    | "writtenOther"
    | "other";
  title: string;
  description: string | null;
  examTaskNumbers: number[];
  assignedAt: Timestamp;
  dueAt: Timestamp | null;
  dueDate?: string | null;
  dueTime?: string | null;
  dueTimezone?: string | null;
  status: HomeworkStatus;
  requiredAmount: number | null;
  items?: HomeworkItem[];
  attachments?: Attachment[];
  templateId?: string | null;
  draft?: boolean;
  reviewCriteria?: {
    content: Array<{ code: string; title: string; max: number }>;
    literacy: Array<{
      code: string;
      title: string;
      max: number;
      errorLabel: string;
    }>;
    factual: { code: string; max: number; errorLabel: string } | null;
  } | null;
}

export type Attachment = {
  id: string;
  kind: "external" | "storage";
  title: string;
  url: string | null;
  storagePath: string | null;
  contentType: string | null;
};

export interface HomeworkItem {
  itemId: string;
  type:
    | "theory"
    | "practice"
    | "interactive"
    | "essay"
    | "exposition"
    | "writtenOther"
    | "other";
  title: string;
  description: string | null;
  requiredAmount: number | null;
  examTaskNumbers: number[];
  attachments: Attachment[];
  materialIds: string[];
  sortOrder: number;
  reviewCriteria?: Homework["reviewCriteria"];
}

export interface StudentInput {
  completed: boolean;
  selfReportedEarned: number | null;
  selfReportedMax: number | null;
  note: string | null;
  externalAttachmentUrls: string[];
  attachments?: Attachment[];
  itemProgress?: Array<{
    itemId: string;
    completed: boolean;
    selfReportedEarned: number | null;
    selfReportedMax: number | null;
    responseText: string | null;
    attachments: Attachment[];
  }>;
}

export interface EvaluationCriterion {
  code: string;
  earned: number;
  max: number;
  errorsCount: number | null;
}

export interface TeacherEvaluation {
  scoreEarned: number | null;
  scoreMax: number | null;
  criteria: EvaluationCriterion[];
  issues: Array<{
    category: string;
    label: string;
    comment: string | null;
  }>;
  comment: string | null;
  checkedAt: Timestamp | null;
  itemEvaluations?: HomeworkItemEvaluation[];
}

export interface HomeworkItemEvaluation {
  itemId: string;
  scoreEarned: number | null;
  scoreMax: number | null;
  criteria: EvaluationCriterion[];
  comment: string | null;
  reviewStatus: "checked" | "needs_revision";
  checkedAt: Timestamp | null;
}

export interface HomeworkSubmission extends AuditedDocument {
  teacherId: string;
  studentId: string;
  homeworkId: string;
  submissionNumber: number;
  studentInput: StudentInput;
  teacherEvaluation: TeacherEvaluation | null;
  status: "submitted" | "checked" | "needs_revision";
  submittedAt: Timestamp | null;
  reviewedUnread?: boolean;
  reviewedOpenedAt?: Timestamp | null;
}

interface MockSectionScore {
  earned: number;
  max: number;
}

export interface MockExam extends AuditedDocument {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  examBlueprintId: string;
  title: string;
  takenAt: Timestamp | null;
  takenDate?: string | null;
  taskResults: Array<{
    taskNumber: number;
    earned: number;
    max: number;
  }>;
  sections: {
    test: MockSectionScore;
    exposition: MockSectionScore & { criteria: EvaluationCriterion[] };
    essay: MockSectionScore & {
      criteria: EvaluationCriterion[];
      comment: string | null;
    };
    literacy: MockSectionScore & {
      criteria: Array<
        EvaluationCriterion & {
          category: string;
        }
      >;
    };
    factualAccuracy: MockSectionScore & { errorsCount: number | null };
  };
  total: MockSectionScore;
  grade: number;
  teacherComment: string | null;
  taskObservations?: Array<{ taskNumber: number; observation: string }>;
  publicRecommendations?: string[];
}

export interface Material extends AuditedDocument {
  teacherId: string;
  programProfileIds: string[];
  examTaskNumbers: number[];
  title: string;
  type: "pdf" | "image" | "audio" | "video" | "link" | "interactive" | "other";
  storagePath: string | null;
  externalUrl: string | null;
  tags: string[];
  active: boolean;
  folderId?: string | null;
  visibility?: "private" | "program" | "selected_students";
  selectedStudentIds?: string[];
  allowedStudentIds?: string[];
  favorite?: boolean;
  lastUsedAt?: Timestamp | null;
}

export interface MaterialFolder extends AuditedDocument {
  teacherId: string;
  title: string;
  active: boolean;
  allowedStudentIds?: string[];
  autoShareNewMaterials?: boolean;
}

export interface HomeworkTemplate extends AuditedDocument {
  teacherId: string;
  title: string;
  items: HomeworkItem[];
  attachments: Attachment[];
  reviewCriteria?: Homework["reviewCriteria"];
  active: boolean;
}

export interface StudentPaymentAccount extends AuditedDocument {
  teacherId: string;
  studentId: string;
  purchasedLessonCredits: number;
  reconciledFromLegacyPaidCount: number;
  lastAllocationLessonIds: string[];
  manualPaidBillingIds?: string[];
}

export interface PaymentCreditEvent extends AuditedDocument {
  teacherId: string;
  studentId: string;
  lessonCount: number;
  note: string | null;
}

export type CoverageState = "notStarted" | "inProgress" | "studied";

export interface StudentTaskCoverage extends AuditedDocument {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  taskNumber: number;
  state: CoverageState;
  sourceLessonIds: string[];
}

export interface TaskMasteryOverride extends AuditedDocument {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  taskNumber: number;
  autoMastery: number;
  manualOverride: number | null;
  effectiveMastery: number;
  evidenceCount: number;
  lastEvidenceAt: Timestamp | null;
  confidence: number;
  privateReason: string | null;
  changedAt: Timestamp | null;
}

export interface StudentTaskMasteryPublic extends AuditedDocument {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  taskNumber: number;
  effectiveMastery: number;
  evidenceCount: number;
  lastEvidenceAt: Timestamp | null;
  confidence: number;
}

export interface TeacherAuditEvent extends VersionedDocument {
  teacherId: string;
  studentId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  createdAt: Timestamp;
}

export interface AchievementDefinition extends VersionedDocument {
  code: string;
  title: string;
  description: string;
  iconKey: string;
  xpReward: number;
  active: boolean;
  conditionConfig: Record<string, unknown>;
}

export interface StudentAchievement extends VersionedDocument {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  achievementDefinitionId: string;
  earnedAt: Timestamp;
  metadata: Record<string, unknown>;
}

export interface GamificationEvent extends VersionedDocument {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  xpDelta: number;
  createdAt: Timestamp;
}

export type FilePreviewType = "image" | "pdf" | "document";

export interface FileAsset extends AuditedDocument {
  teacherId: string;
  studentId: string | null;
  ownerType: "teacher" | "student";
  uploadedBy: string;
  purpose: "homework" | "submission" | "material";
  homeworkId: string | null;
  materialId: string | null;
  itemId: string | null;
  submissionId: string | null;
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  previewType: FilePreviewType;
  allowedStudentIds: string[];
  status: "active" | "deleted";
  deletedAt: Timestamp | null;
}

export type PlannerCategory = "work" | "home" | "personal" | "someday";
export type PlannerItemStatus = "todo" | "done" | "backlog";
export type PlannerPriority = "high" | "medium" | "calm";

export interface PlannerItem extends AuditedDocument {
  teacherId: string;
  itemType: "event" | "task";
  title: string;
  category: PlannerCategory;
  status: PlannerItemStatus;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  deadline: string | null;
  notes: string | null;
  priority: PlannerPriority;
  goalId: string | null;
  subgoalId: string | null;
  sortOrder: number;
  completedAt: Timestamp | null;
  active: boolean;
}

export interface PlannerGoal extends AuditedDocument {
  teacherId: string;
  title: string;
  description: string | null;
  status: "active" | "completed" | "archived";
  targetDate: string | null;
}

export interface PlannerSubgoal extends AuditedDocument {
  teacherId: string;
  goalId: string;
  title: string;
  notes?: string | null;
  status: "active" | "completed";
  sortOrder: number;
}

export interface AppSettings extends VersionedDocument {
  schema: { currentVersion: 1 };
  gamification: { xpPerLevel: number };
  features: {
    voiceInput: boolean;
    russian100Integration: boolean;
    essayEditor: boolean;
    parentReports: boolean;
    fileUploads: boolean;
  };
  updatedAt: Timestamp;
}

export interface CollectionSchema {
  users: UserProfile;
  students: Student;
  programProfiles: ProgramProfile;
  examBlueprints: ExamBlueprint;
  studentPrograms: StudentProgram;
  lessonSeries: LessonSeries;
  lessons: Lesson;
  lessonOccurrenceExclusions: LessonOccurrenceExclusion;
  lessonTeacherNotes: LessonTeacherNote;
  homeworks: Homework;
  homeworkSubmissions: HomeworkSubmission;
  mockExams: MockExam;
  materials: Material;
  materialFolders: MaterialFolder;
  homeworkTemplates: HomeworkTemplate;
  studentPaymentAccounts: StudentPaymentAccount;
  paymentCreditEvents: PaymentCreditEvent;
  studentTaskCoverage: StudentTaskCoverage;
  taskMasteryOverrides: TaskMasteryOverride;
  studentTaskMasteryPublic: StudentTaskMasteryPublic;
  teacherAuditEvents: TeacherAuditEvent;
  achievementDefinitions: AchievementDefinition;
  studentAchievements: StudentAchievement;
  gamificationEvents: GamificationEvent;
  fileAssets: FileAsset;
  plannerItems: PlannerItem;
  plannerGoals: PlannerGoal;
  plannerSubgoals: PlannerSubgoal;
  appSettings: AppSettings;
}

export type CollectionName = keyof CollectionSchema;

export interface DocumentWithId<T> {
  id: string;
  data: T;
}

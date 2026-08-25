import { z } from "zod";

const plannerItemDraftSchema = z.object({
  draftItemId: z.string().min(1),
  selected: z.boolean().default(true),
  itemType: z.enum(["task", "event"]),
  title: z.string().min(1).max(240),
  category: z.enum(["work", "home", "someday"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  priority: z.enum(["high", "medium", "low"]),
  notes: z.string().max(2000).nullable(),
});

export const teacherAIDraftSchema = z.discriminatedUnion("actionType", [
  z.object({
    actionType: z.literal("PLANNER_ITEMS_DRAFT"),
    draftId: z.string().min(1),
    summary: z.string().min(1),
    items: z.array(plannerItemDraftSchema).min(1).max(30),
  }),
  z.object({
    actionType: z.literal("PLANNER_ITEM_UPDATE_DRAFT"),
    draftId: z.string().min(1),
    summary: z.string().min(1),
    itemId: z.string().min(1),
    baselineUpdatedAtMillis: z.number().nullable(),
    patch: plannerItemDraftSchema.partial().omit({ draftItemId: true, selected: true }),
  }),
  z.object({
    actionType: z.literal("LESSON_RESCHEDULE_DRAFT"),
    draftId: z.string().min(1),
    summary: z.string().min(1),
    lessonId: z.string().min(1),
    studentId: z.string().min(1),
    newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    newTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    durationMinutes: z.number().int().positive().max(480),
    baselineUpdatedAtMillis: z.number().nullable(),
  }),
  z.object({
    actionType: z.literal("HOMEWORK_DRAFT"),
    draftId: z.string().min(1),
    summary: z.string().min(1),
    studentId: z.string().min(1),
    title: z.string().min(1).max(240),
    description: z.string().max(4000),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    examTaskNumbers: z.array(z.number().int().positive()).max(50),
  }),
  z.object({
    actionType: z.literal("LESSON_SUMMARY_DRAFT"),
    draftId: z.string().min(1),
    summary: z.string().min(1),
    lessonId: z.string().min(1),
    studentId: z.string().min(1),
    topic: z.string().min(1).max(240),
    understandingScore: z.number().int().min(1).max(10),
    examTaskNumbers: z.array(z.number().int().positive()).max(50),
    errors: z.array(z.string().min(1).max(240)).max(30),
    studentComment: z.string().max(2000),
    privateNote: z.string().max(2000),
  }),
  z.object({
    actionType: z.literal("CLARIFICATION_REQUIRED"),
    draftId: z.string().min(1),
    summary: z.string().min(1),
    question: z.string().min(1),
  }),
  z.object({
    actionType: z.literal("UNSUPPORTED_REQUEST"),
    draftId: z.string().min(1),
    summary: z.string().min(1),
    reason: z.string().min(1),
  }),
]);

export type TeacherAIDraft = z.infer<typeof teacherAIDraftSchema>;
export type PlannerAIItemDraft = z.infer<typeof plannerItemDraftSchema>;

export interface TeacherAIContext {
  teacherId: string;
  today: string;
  timezone: string;
  selectedStudentId: string | null;
  students: Array<{ id: string; displayName: string }>;
  lessons: Array<{
    id: string;
    studentId: string;
    startAtMillis: number;
    endAtMillis: number;
    updatedAtMillis: number | null;
    status: string;
    topic: string | null;
  }>;
  plannerItems: Array<{
    id: string;
    title: string;
    date: string | null;
    startTime: string | null;
    category: string;
    updatedAtMillis: number | null;
  }>;
}

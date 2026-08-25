import { z } from "zod";

const plannerItem = z.object({
  draftItemId: z.string().min(1), selected: z.boolean().default(true), itemType: z.enum(["task", "event"]), title: z.string().min(1).max(240),
  category: z.enum(["work", "home", "someday"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), priority: z.enum(["high", "medium", "low"]),
  notes: z.string().max(2000).nullable(),
});

export const aiActionDraftSchema = z.discriminatedUnion("actionType", [
  z.object({ actionType: z.literal("LESSON_SUMMARY_DRAFT"), draftId: z.string(), summary: z.string(), lessonId: z.string(), studentId: z.string(), topic: z.string(), understandingScore: z.number().int().min(1).max(10), examTaskNumbers: z.array(z.number().int().positive()), errors: z.array(z.string()), studentComment: z.string(), privateNote: z.string() }),
  z.object({ actionType: z.literal("PLANNER_ITEMS_DRAFT"), draftId: z.string(), summary: z.string(), items: z.array(plannerItem).min(1).max(30) }),
  z.object({ actionType: z.literal("PLANNER_ITEM_UPDATE_DRAFT"), draftId: z.string(), summary: z.string(), itemId: z.string(), baselineUpdatedAtMillis: z.number().nullable(), patch: plannerItem.partial().omit({ draftItemId: true, selected: true }) }),
  z.object({ actionType: z.literal("LESSON_RESCHEDULE_DRAFT"), draftId: z.string(), summary: z.string(), lessonId: z.string(), studentId: z.string(), newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), newTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), durationMinutes: z.number().int().positive().max(480), baselineUpdatedAtMillis: z.number().nullable() }),
  z.object({ actionType: z.literal("HOMEWORK_DRAFT"), draftId: z.string(), summary: z.string(), studentId: z.string(), title: z.string(), description: z.string(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), examTaskNumbers: z.array(z.number().int().positive()) }),
  z.object({ actionType: z.literal("CLARIFICATION_REQUIRED"), draftId: z.string(), summary: z.string(), question: z.string() }),
  z.object({ actionType: z.literal("UNSUPPORTED_REQUEST"), draftId: z.string(), summary: z.string(), reason: z.string() }),
]);

export type AIActionDraft = z.infer<typeof aiActionDraftSchema>;

export const aiInterpretInputSchema = z.object({
  command: z.string().trim().min(1).max(4000),
  context: z.object({
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timezone: z.string().min(1).max(100),
    selectedStudentId: z.string().max(200).nullable(),
  }),
});

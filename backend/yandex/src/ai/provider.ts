import { ZodError } from "zod";
import { aiActionDraftSchema, type AIActionDraft } from "./schema.js";

export interface AIProviderInput {
  command: string;
  context: Record<string, unknown>;
}

export interface AIProviderResult {
  draft: AIActionDraft;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AIProvider {
  interpret(input: AIProviderInput): Promise<AIProviderResult>;
}

export class AIProviderError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AIProviderError";
  }
}

export function safeAIProviderErrorCode(error: unknown): string {
  return error instanceof AIProviderError ? error.code : "AI_PROVIDER_UNKNOWN";
}

function safeSchemaIssueCode(error: unknown): string {
  if (!(error instanceof ZodError)) return "AI_RESPONSE_SCHEMA_INVALID";
  const issues = error.issues.slice(0, 6).map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "root";
    return `${issue.code}@${path}`;
  });
  return `AI_RESPONSE_SCHEMA_INVALID:${issues.join("|")}`.slice(0, 500);
}

function systemPrompt() {
  return `You are a Russian teacher workflow parser. Return exactly one flat JSON object with no markdown and no wrapper key.
Allowed actionType values: LESSON_SUMMARY_DRAFT, PLANNER_ITEMS_DRAFT, PLANNER_ITEM_UPDATE_DRAFT, LESSON_RESCHEDULE_DRAFT, HOMEWORK_DRAFT, CLARIFICATION_REQUIRED, UNSUPPORTED_REQUEST.
Every response MUST contain actionType, draftId and a short Russian summary. Generate temporary draftId and draftItemId strings yourself; they are not database entity IDs. Never invent studentId, lessonId or itemId: use only IDs from context.
Required contracts:
- PLANNER_ITEMS_DRAFT: {actionType,draftId,summary,items:[{draftItemId,selected,itemType,title,category,date,startTime,priority,notes}]}. selected is boolean. itemType is task|event. category is work|home|someday. date is YYYY-MM-DD or null. startTime is HH:mm or null. priority is high|medium|low. notes is string or null.
- PLANNER_ITEM_UPDATE_DRAFT: {actionType,draftId,summary,itemId,baselineUpdatedAtMillis,patch}. baselineUpdatedAtMillis is number or null. patch contains only planner fields being changed.
- LESSON_RESCHEDULE_DRAFT: {actionType,draftId,summary,lessonId,studentId,newDate,newTime,durationMinutes,baselineUpdatedAtMillis}.
- HOMEWORK_DRAFT: {actionType,draftId,summary,studentId,title,description,dueDate,dueTime,examTaskNumbers}. dueDate and dueTime may be null; examTaskNumbers is an array of positive integers.
- LESSON_SUMMARY_DRAFT: {actionType,draftId,summary,lessonId,studentId,topic,understandingScore,examTaskNumbers,errors,studentComment,privateNote}. understandingScore is an integer from 1 to 10. examTaskNumbers is an array of positive integers. errors is an array of strings. studentComment and privateNote are strings.
- CLARIFICATION_REQUIRED: {actionType,draftId,summary,question}.
- UNSUPPORTED_REQUEST: {actionType,draftId,summary,reason}.
Voice input can be a natural monologue without the words "task" or "plan". If it contains several independent future actions, return PLANNER_ITEMS_DRAFT and split them into separate items in spoken order. Preserve a date or time that applies to the following items. Do not merge unrelated actions. Return at most 30 items.
If any required identity, lesson, date, time or duration is missing or ambiguous, MUST return CLARIFICATION_REQUIRED; never return a partial action draft and never guess missing values. Default planner priority is medium. Never grade, change payments, delete students, cancel lessons, or write data.`;
}

export function parseAIJsonResponse(raw: string): unknown {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const firstBrace = unfenced.indexOf("{");
    const lastBrace = unfenced.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) throw new SyntaxError("AI response has no JSON object");
    return JSON.parse(unfenced.slice(firstBrace, lastBrace + 1));
  }
}

function normalizePlannerPriority(value: unknown): "high" | "medium" | "low" {
  if (typeof value !== "string") return "medium";
  const normalized = value.trim().toLowerCase();
  if (["high", "highest", "urgent", "critical", "высокий", "высокая", "срочный", "срочно"].includes(normalized)) return "high";
  if (["low", "lowest", "низкий", "низкая"].includes(normalized)) return "low";
  return "medium";
}

/**
 * YandexGPT occasionally translates enum values even when the JSON contract
 * explicitly asks for English literals. Priority is presentation metadata, so
 * an unknown or omitted value can safely use the documented medium default
 * instead of rejecting an otherwise valid multi-item draft.
 */
export function normalizeAIResponse(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const draft = value as Record<string, unknown>;
  if (draft.actionType === "PLANNER_ITEMS_DRAFT" && Array.isArray(draft.items)) {
    return {
      ...draft,
      items: draft.items.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        return { ...item, priority: normalizePlannerPriority((item as Record<string, unknown>).priority) };
      }),
    };
  }
  if (draft.actionType === "PLANNER_ITEM_UPDATE_DRAFT" && draft.patch && typeof draft.patch === "object" && !Array.isArray(draft.patch)) {
    const patch = draft.patch as Record<string, unknown>;
    if (!("priority" in patch)) return value;
    return { ...draft, patch: { ...patch, priority: normalizePlannerPriority(patch.priority) } };
  }
  return value;
}

export class YandexAIProvider implements AIProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly modelUri: string,
    private readonly apiKey: string,
  ) {}

  async interpret(input: AIProviderInput): Promise<AIProviderResult> {
    let lastError: Error | null = null;
    let retryReason: string | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Api-Key ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.modelUri,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt() },
            { role: "user", content: JSON.stringify({ command: input.command, context: input.context, retryReason }) },
          ],
        }),
      });
      if (!response.ok) throw new AIProviderError(`AI_PROVIDER_HTTP_${response.status}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      try {
        const raw = payload.choices?.[0]?.message?.content;
        if (!raw) throw new Error("AI provider returned empty content");
        return { draft: aiActionDraftSchema.parse(normalizeAIResponse(parseAIJsonResponse(raw))), model: this.modelUri, inputTokens: payload.usage?.prompt_tokens ?? null, outputTokens: payload.usage?.completion_tokens ?? null };
      } catch (error) {
        const code = error instanceof SyntaxError ? "AI_RESPONSE_JSON_INVALID" : safeSchemaIssueCode(error);
        lastError = new AIProviderError(code);
        retryReason = `Previous response was rejected. Correct these schema issues and return the complete JSON contract: ${code}`;
      }
    }
    throw lastError ?? new AIProviderError("AI_RESPONSE_INVALID");
  }
}

export class MockAIProvider implements AIProvider {
  constructor(private readonly response: unknown) {}
  async interpret(input: AIProviderInput): Promise<AIProviderResult> {
    void input;
    return { draft: aiActionDraftSchema.parse(this.response), model: "mock", inputTokens: 0, outputTokens: 0 };
  }
}

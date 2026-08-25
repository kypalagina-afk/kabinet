import type { AIActionDraft } from "./schema.js";

function safeIdentityPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || "request";
}

/**
 * Provider-generated identifiers are untrusted presentation data. Some models
 * reuse values such as `draft-1` between otherwise unrelated requests, which
 * collides with the Firestore confirmation idempotency keys. Replace them with
 * one server-owned identity per interpretation while keeping retries of the
 * returned draft stable in the browser.
 */
export function canonicalizeDraftIdentity(
  draft: AIActionDraft,
  requestIdentity: string,
): AIActionDraft {
  const draftId = `draft-${safeIdentityPart(requestIdentity)}`;
  if (draft.actionType !== "PLANNER_ITEMS_DRAFT") return { ...draft, draftId };

  return {
    ...draft,
    draftId,
    items: draft.items.map((item, index) => ({
      ...item,
      draftItemId: `${draftId}-item-${index + 1}`,
    })),
  };
}

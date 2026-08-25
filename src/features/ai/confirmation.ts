export function aiPlannerConfirmationDocumentId(teacherId: string, draftId: string, draftItemId: string) {
  const safeTeacherId = teacherId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const safeDraftId = draftId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  const safeItemId = draftItemId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  return `ai__${safeTeacherId}__${safeDraftId}__${safeItemId}`;
}

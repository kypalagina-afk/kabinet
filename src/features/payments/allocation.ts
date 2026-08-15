export interface BillableLesson {
  id: string;
  startMs: number;
  status: "planned" | "completed" | "rescheduled" | "cancelled_student" | "cancelled_teacher";
  paymentStatus: "paid" | "unpaid" | "free" | "unknown";
  billingType?: "regular" | "free";
  billingIdentityId?: string;
}

export function allocateLessonCredits(lessons: BillableLesson[], credits: number) {
  const seen = new Set<string>();
  const candidates = lessons
    .filter((lesson) => (lesson.status === "planned" || lesson.status === "completed") && lesson.billingType !== "free" && lesson.paymentStatus !== "free")
    .sort((left, right) => (left.status === "completed" ? 0 : 1) - (right.status === "completed" ? 0 : 1) || left.startMs - right.startMs)
    .filter((lesson) => { const identity = lesson.billingIdentityId ?? lesson.id; if (seen.has(identity)) return false; seen.add(identity); return true; });
  const paidIds = candidates.slice(0, Math.max(0, Math.floor(credits))).map((lesson) => lesson.id);
  return { paidIds, unpaidIds: candidates.slice(paidIds.length).map((lesson) => lesson.id), candidates };
}

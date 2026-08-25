import type { DocumentWithId, PlannerItem, PlannerPriority } from "../../lib/firebase/types.js";

export function plannerPriorityRank(priority: PlannerPriority | null | undefined) {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

export function comparePlannerItems(
  left: DocumentWithId<PlannerItem>,
  right: DocumentWithId<PlannerItem>,
) {
  const leftDone = left.data.status === "done" ? 1 : 0;
  const rightDone = right.data.status === "done" ? 1 : 0;
  if (leftDone !== rightDone) return leftDone - rightDone;

  const leftTimed = left.data.startTime ? 0 : 1;
  const rightTimed = right.data.startTime ? 0 : 1;
  if (leftTimed !== rightTimed) return leftTimed - rightTimed;

  if (left.data.startTime && right.data.startTime) {
    const byTime = left.data.startTime.localeCompare(right.data.startTime);
    if (byTime) return byTime;
  } else {
    const byPriority = plannerPriorityRank(left.data.priority) - plannerPriorityRank(right.data.priority);
    if (byPriority) return byPriority;
  }

  return left.data.sortOrder - right.data.sortOrder || left.id.localeCompare(right.id);
}

export function sortPlannerItems(items: Array<DocumentWithId<PlannerItem>>) {
  return [...items].sort(comparePlannerItems);
}

export function plannerCategoryCounts(items: Array<DocumentWithId<PlannerItem>>) {
  return items.reduce((counts, item) => {
    if (item.data.status === "done") counts.done += 1;
    else if (item.data.category === "work") counts.work += 1;
    else if (item.data.category === "home" || item.data.category === "personal") counts.home += 1;
    return counts;
  }, { work: 0, home: 0, done: 0 });
}

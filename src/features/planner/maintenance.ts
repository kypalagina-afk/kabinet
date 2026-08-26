import type { DocumentWithId, PlannerItem } from "../../lib/firebase/types.js";

function isOneOffPersonalPlannerItem(item: PlannerItem) {
  return item.recordType !== "recurrence" && !item.recurrenceSeriesId;
}

export function firstDayOfPlannerMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export function plannerItemsToCarryForward(
  items: Array<DocumentWithId<PlannerItem>>,
  today: string,
) {
  return items.filter(({ data }) =>
    data.active
    && data.status === "todo"
    && data.category !== "someday"
    && Boolean(data.date)
    && data.date! < today
    && isOneOffPersonalPlannerItem(data)
  );
}

export function plannerItemsToDeleteForMonthlyCleanup(
  items: Array<DocumentWithId<PlannerItem>>,
  today: string,
) {
  const monthStart = firstDayOfPlannerMonth(today);
  return items.filter(({ data }) =>
    Boolean(data.date)
    && data.date! < monthStart
    && (data.status === "done" || !data.active)
    && isOneOffPersonalPlannerItem(data)
  );
}

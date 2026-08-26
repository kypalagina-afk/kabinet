import {
  doc,
  serverTimestamp,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import {
  plannerItemsToCarryForward,
  plannerItemsToDeleteForMonthlyCleanup,
} from "../../../features/planner/maintenance.js";
import type { DocumentWithId, PlannerItem } from "../types.js";

const MAX_BATCH_OPERATIONS = 400;

async function commitInChunks(
  db: Firestore,
  operations: Array<(batch: WriteBatch) => void>,
) {
  for (let index = 0; index < operations.length; index += MAX_BATCH_OPERATIONS) {
    const batch = writeBatch(db);
    operations.slice(index, index + MAX_BATCH_OPERATIONS).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

export async function carryForwardOneOffPlannerItems(
  db: Firestore,
  teacherId: string,
  items: Array<DocumentWithId<PlannerItem>>,
  today: string,
) {
  const targets = plannerItemsToCarryForward(items, today)
    .filter(({ data }) => data.teacherId === teacherId);
  await commitInChunks(db, targets.map((item) => (batch) => {
    batch.update(doc(db, "plannerItems", item.id), {
      date: today,
      carriedFromDate: item.data.date,
      carriedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }));
  return targets.length;
}

export async function cleanupCompletedOneOffPlannerItems(
  db: Firestore,
  teacherId: string,
  items: Array<DocumentWithId<PlannerItem>>,
  today: string,
) {
  const targets = plannerItemsToDeleteForMonthlyCleanup(items, today)
    .filter(({ data }) => data.teacherId === teacherId);
  await commitInChunks(db, targets.map((item) => (batch) => {
    batch.delete(doc(db, "plannerItems", item.id));
  }));
  return targets.length;
}

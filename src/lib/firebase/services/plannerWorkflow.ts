import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import type {
  PlannerGoal,
  PlannerItem,
  PlannerRecurrencePattern,
  PlannerSubgoal,
} from "../types.js";
import {
  addPlannerDays,
  plannerOccurrenceId,
  plannerRecurrenceDates,
  plannerRecurrenceHorizon,
  plannerRecurrenceWeekdays,
} from "../../../features/planner/recurrence.js";

export type PlannerItemInput = Pick<
  PlannerItem,
  | "itemType"
  | "title"
  | "category"
  | "date"
  | "startTime"
  | "endTime"
  | "durationMinutes"
  | "deadline"
  | "notes"
  | "priority"
  | "goalId"
  | "subgoalId"
>;

export interface PlannerRecurrenceInput {
  pattern: PlannerRecurrencePattern;
  weekdays: number[];
  startsOn: string;
  endsOn: string | null;
}

function normalizedItem(input: PlannerItemInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Название обязательно");
  if (input.itemType === "event" && !input.date)
    throw new Error("Для события нужна дата");
  if (input.startTime && !input.date)
    throw new Error("Время можно указать только вместе с датой");
  if (input.itemType === "event" && input.category === "someday")
    throw new Error("Событие нужно отнести к Работе или Дому");
  if (input.itemType === "task" && input.category === "personal")
    throw new Error("Для задачи выберите Работу, Дом или Когда-нибудь");
  if (input.itemType === "task" && input.category !== "someday" && !input.date)
    throw new Error("Для задачи в Работе или Доме нужна дата");
  return {
    ...input,
    title,
    notes: input.notes?.trim() || null,
    endTime: input.startTime ? input.endTime : null,
    durationMinutes: input.startTime ? input.durationMinutes : null,
    priority: input.priority ?? "calm",
    status: input.category === "someday" && !input.date ? "backlog" : "todo",
  } as const;
}

export async function createPlannerItem(
  db: Firestore,
  teacherId: string,
  input: PlannerItemInput,
): Promise<string> {
  const value = normalizedItem(input);
  const reference = doc(collection(db, "plannerItems"));
  await runTransaction(db, async (transaction) => {
    transaction.set(reference, {
      teacherId,
      ...value,
      sortOrder: Date.now(),
      completedAt: null,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
  });
  return reference.id;
}

export async function createRecurringPlannerTask(
  db: Firestore,
  teacherId: string,
  input: PlannerItemInput,
  recurrenceInput: PlannerRecurrenceInput,
  today: string,
): Promise<string> {
  if (input.itemType !== "task") throw new Error("Повторять можно только задачи");
  if (input.category === "someday" || input.category === "personal") {
    throw new Error("Регулярную задачу нужно отнести к Работе или Дому");
  }
  const weekdays = plannerRecurrenceWeekdays(
    recurrenceInput.pattern,
    recurrenceInput.weekdays,
  );
  const value = normalizedItem({
    ...input,
    date: recurrenceInput.startsOn,
    deadline: null,
  });
  const reference = doc(collection(db, "plannerItems"));
  const horizon = plannerRecurrenceHorizon(today);
  const materializedThrough = recurrenceInput.endsOn && recurrenceInput.endsOn < horizon
    ? recurrenceInput.endsOn
    : horizon;
  const recurrence = {
    ...recurrenceInput,
    weekdays,
    materializedThrough,
  };
  const dates = plannerRecurrenceDates(recurrence, today, materializedThrough);
  const nowOrder = Date.now();

  await runTransaction(db, async (transaction) => {
    transaction.set(reference, {
      teacherId,
      ...value,
      date: null,
      deadline: null,
      recordType: "recurrence",
      recurrence,
      recurrenceSeriesId: reference.id,
      recurrenceDate: null,
      sortOrder: nowOrder,
      completedAt: null,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
    dates.forEach((date, index) => {
      transaction.set(doc(db, "plannerItems", plannerOccurrenceId(reference.id, date)), {
        teacherId,
        ...value,
        date,
        deadline: null,
        recordType: "item",
        recurrence: null,
        recurrenceSeriesId: reference.id,
        recurrenceDate: date,
        sortOrder: nowOrder + index + 1,
        completedAt: null,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        schemaVersion: 1,
      });
    });
  });
  return reference.id;
}

export async function materializePlannerRecurrence(
  db: Firestore,
  teacherId: string,
  seriesId: string,
  today: string,
): Promise<number> {
  const reference = doc(db, "plannerItems", seriesId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return 0;
    const template = snapshot.data() as PlannerItem;
    if (
      template.teacherId !== teacherId
      || template.recordType !== "recurrence"
      || !template.active
      || !template.recurrence
    ) return 0;

    const horizon = plannerRecurrenceHorizon(today);
    const desiredThrough = template.recurrence.endsOn && template.recurrence.endsOn < horizon
      ? template.recurrence.endsOn
      : horizon;
    if (desiredThrough <= template.recurrence.materializedThrough) return 0;
    const from = addPlannerDays(template.recurrence.materializedThrough, 1);
    const dates = plannerRecurrenceDates(template.recurrence, from, desiredThrough);
    const occurrenceReferences = dates.map((date) =>
      doc(db, "plannerItems", plannerOccurrenceId(seriesId, date))
    );
    const sortOrder = Date.now();
    occurrenceReferences.forEach((occurrence, index) => {
      const date = dates[index]!;
      transaction.set(occurrence, {
        teacherId,
        itemType: template.itemType,
        title: template.title,
        category: template.category,
        status: "todo",
        date,
        startTime: template.startTime,
        endTime: template.endTime,
        durationMinutes: template.durationMinutes,
        deadline: null,
        notes: template.notes,
        priority: template.priority,
        goalId: template.goalId,
        subgoalId: template.subgoalId,
        recordType: "item",
        recurrence: null,
        recurrenceSeriesId: seriesId,
        recurrenceDate: date,
        sortOrder: sortOrder + index,
        completedAt: null,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        schemaVersion: 1,
      });
    });
    transaction.update(reference, {
      recurrence: {
        ...template.recurrence,
        materializedThrough: desiredThrough,
      },
      updatedAt: serverTimestamp(),
    });
    return occurrenceReferences.length;
  });
}

export async function updatePlannerItem(
  db: Firestore,
  teacherId: string,
  itemId: string,
  input: PlannerItemInput,
): Promise<void> {
  const value = normalizedItem(input);
  const reference = doc(db, "plannerItems", itemId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().teacherId !== teacherId)
      throw new Error("Пункт плана не найден");
    transaction.update(reference, {
      ...value,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function schedulePlannerItem(
  db: Firestore,
  teacherId: string,
  itemId: string,
  date: string,
  startTime: string | null,
  category?: "work" | "home",
): Promise<void> {
  const reference = doc(db, "plannerItems", itemId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().teacherId !== teacherId)
      throw new Error("Пункт плана не найден");
    transaction.update(reference, {
      date,
      startTime,
      category:
        snapshot.data().category === "someday"
          ? (category ?? "work")
          : snapshot.data().category,
      status: "todo",
      updatedAt: serverTimestamp(),
    });
  });
}

export async function setPlannerItemCompleted(
  db: Firestore,
  teacherId: string,
  itemId: string,
  completed: boolean,
): Promise<void> {
  const reference = doc(db, "plannerItems", itemId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().teacherId !== teacherId)
      throw new Error("Пункт плана не найден");
    const item = snapshot.data() as PlannerItem;
    transaction.update(reference, {
      status: completed
        ? "done"
        : item.category === "someday" && !item.date
          ? "backlog"
          : "todo",
      completedAt: completed ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function archivePlannerItem(
  db: Firestore,
  teacherId: string,
  itemId: string,
): Promise<void> {
  const reference = doc(db, "plannerItems", itemId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().teacherId !== teacherId)
      throw new Error("Пункт плана не найден");
    transaction.update(reference, {
      active: false,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function createPlannerGoal(
  db: Firestore,
  teacherId: string,
  input: Pick<PlannerGoal, "title" | "description" | "targetDate">,
): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new Error("Название цели обязательно");
  const reference = doc(collection(db, "plannerGoals"));
  await runTransaction(db, async (transaction) => {
    transaction.set(reference, {
      teacherId,
      title,
      description: input.description?.trim() || null,
      targetDate: input.targetDate || null,
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
  });
  return reference.id;
}

export async function createPlannerSubgoal(
  db: Firestore,
  teacherId: string,
  goalId: string,
  titleValue: string,
  notesValue: string | null = null,
): Promise<string> {
  const title = titleValue.trim();
  if (!title) throw new Error("Название подцели обязательно");
  const reference = doc(collection(db, "plannerSubgoals"));
  await runTransaction(db, async (transaction) => {
    const goal = await transaction.get(doc(db, "plannerGoals", goalId));
    if (!goal.exists() || goal.data().teacherId !== teacherId)
      throw new Error("Цель не найдена");
    transaction.set(reference, {
      teacherId,
      goalId,
      title,
      notes: notesValue?.trim() || null,
      status: "active",
      sortOrder: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
  });
  return reference.id;
}

export async function setPlannerSubgoalCompleted(
  db: Firestore,
  teacherId: string,
  subgoalId: string,
  completed: boolean,
): Promise<void> {
  const reference = doc(db, "plannerSubgoals", subgoalId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().teacherId !== teacherId)
      throw new Error("Подцель не найдена");
    transaction.update(reference, {
      status: completed ? "completed" : "active",
      updatedAt: serverTimestamp(),
    });
  });
}

export function plannerGoalProgress(
  goalId: string,
  subgoals: Array<{ data: PlannerSubgoal }>,
  items: Array<{ data: PlannerItem }>,
) {
  const steps = [
    ...subgoals.filter(({ data }) => data.goalId === goalId).map(({ data }) => data.status === "completed"),
    ...items
      .filter(({ data }) => data.goalId === goalId && data.active && data.recordType !== "recurrence")
      .map(({ data }) => data.status === "done"),
  ];
  return {
    completed: steps.filter(Boolean).length,
    total: steps.length,
    percent: steps.length
      ? Math.round((steps.filter(Boolean).length / steps.length) * 100)
      : 0,
  };
}

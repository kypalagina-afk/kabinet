import type {
  PlannerRecurrencePattern,
  PlannerRecurrenceSettings,
} from "../../lib/firebase/types.js";

export const PLANNER_RECURRENCE_HORIZON_WEEKS = 12;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function dateOnlyToUtc(value: string) {
  if (!datePattern.test(value)) throw new Error("Укажите корректную дату");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Укажите корректную дату");
  }
  return date;
}

export function addPlannerDays(value: string, amount: number) {
  const date = dateOnlyToUtc(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function plannerIsoWeekday(value: string) {
  const weekday = dateOnlyToUtc(value).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function plannerRecurrenceWeekdays(
  pattern: PlannerRecurrencePattern,
  customWeekdays: number[],
) {
  if (pattern === "daily") return [1, 2, 3, 4, 5, 6, 7];
  if (pattern === "weekdays") return [1, 2, 3, 4, 5];
  const weekdays = [...new Set(customWeekdays)].sort((left, right) => left - right);
  if (!weekdays.length || weekdays.some((weekday) => weekday < 1 || weekday > 7)) {
    throw new Error("Выберите хотя бы один день недели");
  }
  return weekdays;
}

export function plannerRecurrenceHorizon(today: string) {
  return addPlannerDays(today, PLANNER_RECURRENCE_HORIZON_WEEKS * 7);
}

export function plannerRecurrenceDates(
  input: Pick<PlannerRecurrenceSettings, "pattern" | "weekdays" | "startsOn" | "endsOn">,
  from: string,
  through: string,
) {
  dateOnlyToUtc(input.startsOn);
  dateOnlyToUtc(from);
  dateOnlyToUtc(through);
  if (input.endsOn) {
    dateOnlyToUtc(input.endsOn);
    if (input.endsOn < input.startsOn) {
      throw new Error("Дата окончания не может быть раньше даты начала");
    }
  }
  const weekdays = new Set(plannerRecurrenceWeekdays(input.pattern, input.weekdays));
  const first = input.startsOn > from ? input.startsOn : from;
  const last = input.endsOn && input.endsOn < through ? input.endsOn : through;
  const dates: string[] = [];
  for (let date = first; date <= last; date = addPlannerDays(date, 1)) {
    if (weekdays.has(plannerIsoWeekday(date))) dates.push(date);
  }
  return dates;
}

export function plannerOccurrenceId(seriesId: string, date: string) {
  dateOnlyToUtc(date);
  return `${seriesId}__${date}`;
}

export function isPlannerRecurrenceTemplate(value: { recordType?: string }) {
  return value.recordType === "recurrence";
}

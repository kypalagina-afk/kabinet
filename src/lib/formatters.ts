import type { Timestamp } from "firebase/firestore";

const compactDate = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
const fullDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

export function asDate(value: Date | Timestamp | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : value.toDate();
}

export function formatCompactDate(value: Date | Timestamp | null | undefined) {
  const date = asDate(value); return date ? compactDate.format(date) : "Дата не указана";
}

export function formatFullDate(value: Date | Timestamp | null | undefined) {
  const date = asDate(value); return date ? fullDate.format(date) : "Дата не указана";
}

export function formatTime(value: Date | Timestamp | null | undefined) {
  const date = asDate(value); return date ? time.format(date) : "—";
}

export function formatLocalDateString(value: string | null | undefined, style: "compact" | "full" = "compact") {
  if (!value) return "Дата не указана";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Дата не указана" : (style === "full" ? fullDate : compactDate).format(date);
}

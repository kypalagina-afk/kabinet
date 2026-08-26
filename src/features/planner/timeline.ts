export interface PlannerTimelineInterval {
  startTime: string;
  endTime?: string | null;
  durationMinutes?: number | null;
}

export function plannerTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return Math.max(0, Math.min(24 * 60, (hours ?? 0) * 60 + (minutes ?? 0)));
}

export function plannerMinutesToTime(value: number) {
  const safe = Math.max(0, Math.min(24 * 60, value));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function plannerIntervalEnd(interval: PlannerTimelineInterval) {
  const start = plannerTimeToMinutes(interval.startTime);
  if (interval.endTime) {
    const end = plannerTimeToMinutes(interval.endTime);
    if (end > start) return end;
  }
  return Math.min(24 * 60, start + Math.max(30, interval.durationMinutes ?? 30));
}

export function plannerTimelineBounds(intervals: PlannerTimelineInterval[]) {
  const starts = intervals.map((item) => plannerTimeToMinutes(item.startTime));
  const ends = intervals.map(plannerIntervalEnd);
  return {
    start: Math.max(0, Math.floor(Math.min(6 * 60, ...starts) / 30) * 30),
    end: Math.min(24 * 60, Math.ceil(Math.max(24 * 60, ...ends) / 30) * 30),
  };
}

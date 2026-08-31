export interface ManualPracticeDraft {
  taskNumber: number;
  localDate: string;
  localTime: string;
  score: number;
  maxScore: number;
  status: "completed" | "incomplete";
}

export interface ManualPracticeParseResult {
  attempts: ManualPracticeDraft[];
  errors: string[];
}

const taskPattern = /(?:задание\s*)?№?\s*(\d{1,3})/iu;
const dateTimePattern = /(?:(\d{2})\.(\d{2})\.(\d{4})|(\d{4})-(\d{2})-(\d{2}))[\sT,;]+(\d{1,2}):(\d{2})/u;
const scorePattern = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/u;

function numberValue(value: string): number {
  return Number(value.replace(",", "."));
}

function parseCandidate(value: string): ManualPracticeDraft | null {
  const task = taskPattern.exec(value);
  const dateTime = dateTimePattern.exec(value);
  const score = scorePattern.exec(value);
  if (!task || !dateTime || !score) return null;
  const taskNumber = Number(task[1]!);
  const day = dateTime[1] ?? dateTime[6];
  const month = dateTime[2] ?? dateTime[5];
  const year = dateTime[3] ?? dateTime[4];
  const hour = dateTime[7]!.padStart(2, "0");
  const minute = dateTime[8]!;
  const earned = numberValue(score[1]!);
  const maximum = numberValue(score[2]!);
  const localDate = `${year}-${month}-${day}`;
  const parsedDate = new Date(`${localDate}T${hour}:${minute}:00.000Z`);
  if (
    !Number.isInteger(taskNumber)
    || taskNumber <= 0
    || !Number.isFinite(earned)
    || !Number.isFinite(maximum)
    || earned < 0
    || maximum <= 0
    || earned > maximum
    || Number.isNaN(parsedDate.getTime())
    || parsedDate.getUTCFullYear() !== Number(year)
    || parsedDate.getUTCMonth() + 1 !== Number(month)
    || parsedDate.getUTCDate() !== Number(day)
  ) return null;
  return {
    taskNumber,
    localDate,
    localTime: `${hour}:${minute}`,
    score: earned,
    maxScore: maximum,
    status: /(?:не\s*заверш|незаверш|incomplete)/iu.test(value)
      ? "incomplete"
      : "completed",
  };
}

function keyFor(value: ManualPracticeDraft): string {
  return [
    value.taskNumber,
    value.localDate,
    value.localTime,
    value.score,
    value.maxScore,
    value.status,
  ].join("|");
}

export function parseRussian100ManualText(input: string): ManualPracticeParseResult {
  const normalized = input.replace(/\u00a0/gu, " ").replace(/\r/gu, "").trim();
  if (!normalized) return { attempts: [], errors: [] };
  const attempts: ManualPracticeDraft[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: ManualPracticeDraft | null) => {
    if (!candidate) return false;
    const key = keyFor(candidate);
    if (!seen.has(key)) {
      seen.add(key);
      attempts.push(candidate);
    }
    return true;
  };

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/задани|task|дата|результат/iu.test(line) && !scorePattern.test(line)) continue;
    if ((line.includes(";") || line.includes("\t") || line.includes(",")) && !add(parseCandidate(line))) {
      errors.push(`Не распознана строка: ${line.slice(0, 120)}`);
    }
  }

  const blocks = normalized.split(/\n\s*\n/gu);
  for (const block of blocks) {
    const dateCount = [...block.matchAll(new RegExp(dateTimePattern.source, "gu"))].length;
    if (dateCount === 1) add(parseCandidate(block));
  }
  const compactPattern = /(?:задание\s*)?№?\s*\d{1,3}[\s\S]{0,100}?(?:(?:\d{2}\.\d{2}\.\d{4})|(?:\d{4}-\d{2}-\d{2}))[\sT,;]+\d{1,2}:\d{2}[\s\S]{0,100}?\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?(?:[ \t;]*(?:не\s*заверш\w*|незаверш\w*|заверш\w*|incomplete|completed))?/giu;
  for (const match of normalized.matchAll(compactPattern)) add(parseCandidate(match[0]));
  if (!attempts.length && !errors.length) {
    errors.push("Не удалось распознать попытки. Используйте формат: 11; 07.06.2026 13:57; 3/5; завершено");
  }
  return { attempts, errors: [...new Set(errors)] };
}

export function practiceDraftKey(value: ManualPracticeDraft): string {
  return keyFor(value);
}

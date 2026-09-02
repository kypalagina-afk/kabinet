import { parseRussian100ManualText } from "../external-practice/manualImport.js";

export interface PracticeScore {
  earned: number;
  maximum: number;
}

const inlineScorePattern = /(\d+(?:[.,]\d+)?)\s*(?:\/|(?:балл(?:а|ов)?\s+)?из)\s*(\d+(?:[.,]\d+)?)/iu;

function numberValue(value: string): number {
  return Number(value.replace(",", "."));
}

function validScore(earned: number, maximum: number): PracticeScore | null {
  return Number.isFinite(earned)
    && Number.isFinite(maximum)
    && earned >= 0
    && maximum > 0
    && earned <= maximum
    ? { earned, maximum }
    : null;
}

export function parsePracticeScore(
  input: string,
  taskNumbers: number[] = [],
): PracticeScore | null {
  const normalized = input.replace(/\u00a0/gu, " ").trim();
  if (!normalized) return null;

  const russian100 = parseRussian100ManualText(normalized).attempts;
  const matching = taskNumbers.length
    ? russian100.filter((attempt) => taskNumbers.includes(attempt.taskNumber))
    : russian100;
  const attempt = matching.at(-1);
  if (attempt) return validScore(attempt.score, attempt.maxScore);

  const inline = inlineScorePattern.exec(normalized);
  if (!inline) return null;
  return validScore(numberValue(inline[1]!), numberValue(inline[2]!));
}

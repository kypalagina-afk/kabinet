import { parseRussian100ManualText } from "../external-practice/manualImport.js";

export interface PracticeScore {
  earned: number;
  maximum: number;
}

const inlineScorePattern = /(\d+(?:[.,]\d+)?)\s*(?:\/|(?:балл(?:а|ов)?\s+)?из)\s*(\d+(?:[.,]\d+)?)/giu;

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

function sumScores(scores: Array<PracticeScore | null>): PracticeScore | null {
  if (!scores.length || scores.some((score) => !score)) return null;
  const total = scores.reduce<PracticeScore>((sum, score) => ({
    earned: sum.earned + score!.earned,
    maximum: sum.maximum + score!.maximum,
  }), { earned: 0, maximum: 0 });
  return validScore(Number(total.earned.toFixed(10)), Number(total.maximum.toFixed(10)));
}

export function parsePracticeScore(
  input: string,
  taskNumbers: number[] = [],
): PracticeScore | null {
  const normalized = input.replace(/\u00a0/gu, " ").replace(/\\/gu, "/").trim();
  if (!normalized) return null;

  const russian100 = parseRussian100ManualText(normalized).attempts;
  const matching = taskNumbers.length
    ? russian100.filter((attempt) => taskNumbers.includes(attempt.taskNumber))
    : russian100;
  if (russian100.length) {
    // No inline fallback here: it could import a result for a different task.
    return sumScores(matching.map((attempt) => validScore(attempt.score, attempt.maxScore)));
  }

  return sumScores([...normalized.matchAll(inlineScorePattern)].map((inline) =>
    validScore(numberValue(inline[1]!), numberValue(inline[2]!)),
  ));
}

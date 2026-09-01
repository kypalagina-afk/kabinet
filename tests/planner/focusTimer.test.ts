import { describe, expect, it } from "vitest";
import {
  createIdleFocusTimer,
  normalizeFocusTimerConfig,
  pauseFocusTimer,
  startFocusTimer,
  syncFocusTimer,
} from "../../src/features/focus-timer/focusTimer.js";

describe("focus timer", () => {
  it("uses manual minute configuration and clamps unsafe values", () => {
    expect(normalizeFocusTimerConfig({ workMinutes: 25, restMinutes: 7, rounds: 3 })).toEqual({ workMinutes: 25, restMinutes: 7, rounds: 3 });
    expect(normalizeFocusTimerConfig({ workMinutes: 0, restMinutes: 500, rounds: -2 })).toEqual({ workMinutes: 1, restMinutes: 60, rounds: 1 });
  });

  it("moves through work, rest and the next round", () => {
    const started = startFocusTimer(createIdleFocusTimer({ workMinutes: 1, restMinutes: 1, rounds: 2 }), 1_000);
    const resting = syncFocusTimer(started, 61_000);
    expect(resting).toMatchObject({ phase: "rest", round: 1, running: true, secondsLeft: 60 });
    const secondRound = syncFocusTimer(resting, 121_000);
    expect(secondRound).toMatchObject({ phase: "work", round: 2, running: true, secondsLeft: 60 });
    expect(syncFocusTimer(secondRound, 181_000)).toMatchObject({ phase: "complete", running: false, secondsLeft: 0 });
  });

  it("preserves the exact remaining time when paused", () => {
    const started = startFocusTimer(createIdleFocusTimer({ workMinutes: 2, restMinutes: 1, rounds: 1 }), 5_000);
    expect(pauseFocusTimer(started, 35_000)).toMatchObject({ running: false, secondsLeft: 90, endsAt: null });
  });
});

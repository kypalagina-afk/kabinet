export type FocusTimerConfig = {
  workMinutes: number;
  restMinutes: number;
  rounds: number;
};

export type FocusTimerPhase = "idle" | "work" | "rest" | "complete";

export type FocusTimerState = {
  config: FocusTimerConfig;
  phase: FocusTimerPhase;
  round: number;
  running: boolean;
  secondsLeft: number;
  endsAt: number | null;
};

export const defaultFocusTimerConfig: FocusTimerConfig = {
  workMinutes: 20,
  restMinutes: 5,
  rounds: 4,
};

function wholeNumber(value: unknown, fallback: number, maximum: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number)
    ? Math.max(1, Math.min(maximum, Math.round(number)))
    : fallback;
}

export function normalizeFocusTimerConfig(value: Partial<FocusTimerConfig> | null | undefined): FocusTimerConfig {
  return {
    workMinutes: wholeNumber(value?.workMinutes, defaultFocusTimerConfig.workMinutes, 180),
    restMinutes: wholeNumber(value?.restMinutes, defaultFocusTimerConfig.restMinutes, 60),
    rounds: wholeNumber(value?.rounds, defaultFocusTimerConfig.rounds, 20),
  };
}

export function createIdleFocusTimer(config = defaultFocusTimerConfig): FocusTimerState {
  return {
    config: normalizeFocusTimerConfig(config),
    phase: "idle",
    round: 1,
    running: false,
    secondsLeft: normalizeFocusTimerConfig(config).workMinutes * 60,
    endsAt: null,
  };
}

export function startFocusTimer(state: FocusTimerState, now: number): FocusTimerState {
  const reset = state.phase === "idle" || state.phase === "complete";
  const phase = reset ? "work" : state.phase;
  const round = reset ? 1 : state.round;
  const secondsLeft = reset ? state.config.workMinutes * 60 : Math.max(1, state.secondsLeft);
  return { ...state, phase, round, secondsLeft, running: true, endsAt: now + secondsLeft * 1_000 };
}

export function pauseFocusTimer(state: FocusTimerState, now: number): FocusTimerState {
  if (!state.running || !state.endsAt) return state;
  return {
    ...state,
    running: false,
    secondsLeft: Math.max(0, Math.ceil((state.endsAt - now) / 1_000)),
    endsAt: null,
  };
}

export function syncFocusTimer(state: FocusTimerState, now: number): FocusTimerState {
  if (!state.running || !state.endsAt) return state;
  let phase = state.phase;
  let round = state.round;
  let endsAt = state.endsAt;
  let guard = 0;

  while (now >= endsAt && guard < state.config.rounds * 2 + 2) {
    guard += 1;
    if (phase === "work") {
      if (round >= state.config.rounds) {
        return { ...state, phase: "complete", running: false, secondsLeft: 0, endsAt: null };
      }
      phase = "rest";
      endsAt += state.config.restMinutes * 60_000;
    } else if (phase === "rest") {
      phase = "work";
      round += 1;
      endsAt += state.config.workMinutes * 60_000;
    } else {
      return state;
    }
  }

  return {
    ...state,
    phase,
    round,
    endsAt,
    secondsLeft: Math.max(0, Math.ceil((endsAt - now) / 1_000)),
  };
}

export function focusTimerPhaseSeconds(state: FocusTimerState) {
  return (state.phase === "rest" ? state.config.restMinutes : state.config.workMinutes) * 60;
}

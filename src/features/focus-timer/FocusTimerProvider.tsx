import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createIdleFocusTimer,
  normalizeFocusTimerConfig,
  pauseFocusTimer,
  startFocusTimer,
  syncFocusTimer,
  type FocusTimerConfig,
  type FocusTimerState,
} from "./focusTimer";
import { FocusTimerContext } from "./FocusTimerContext";

const storageKey = "teacher-focus-timer-v1";

function readStoredTimer(): FocusTimerState {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<FocusTimerState> | null;
    if (!stored) return createIdleFocusTimer();
    const config = normalizeFocusTimerConfig(stored.config);
    const state: FocusTimerState = {
      config,
      phase: stored.phase === "work" || stored.phase === "rest" || stored.phase === "complete" ? stored.phase : "idle",
      round: Math.max(1, Math.min(config.rounds, Number(stored.round) || 1)),
      running: Boolean(stored.running && stored.endsAt),
      secondsLeft: Math.max(0, Number(stored.secondsLeft) || config.workMinutes * 60),
      endsAt: typeof stored.endsAt === "number" ? stored.endsAt : null,
    };
    return syncFocusTimer(state, Date.now());
  } catch {
    return createIdleFocusTimer();
  }
}

function playTransitionTone(phase: FocusTimerState["phase"]) {
  if (phase === "idle") return;
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = phase === "complete" ? 880 : phase === "rest" ? 520 : 720;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.13, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.3);
  oscillator.addEventListener("ended", () => void context.close(), { once: true });
}

export function FocusTimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readStoredTimer);
  const previousStepRef = useRef(`${state.phase}:${state.round}`);
  const soundReadyRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!state.running) return undefined;
    const interval = window.setInterval(() => setState((current) => syncFocusTimer(current, Date.now())), 500);
    return () => window.clearInterval(interval);
  }, [state.running]);

  useEffect(() => {
    const step = `${state.phase}:${state.round}`;
    if (step !== previousStepRef.current && soundReadyRef.current) playTransitionTone(state.phase);
    previousStepRef.current = step;
  }, [state.phase, state.round]);

  const configure = useCallback((config: FocusTimerConfig) => {
    setState(createIdleFocusTimer(normalizeFocusTimerConfig(config)));
  }, []);
  const start = useCallback(() => {
    soundReadyRef.current = true;
    setState((current) => startFocusTimer(current, Date.now()));
  }, []);
  const pause = useCallback(() => setState((current) => pauseFocusTimer(current, Date.now())), []);
  const reset = useCallback(() => setState((current) => createIdleFocusTimer(current.config)), []);
  const value = useMemo(() => ({ state, configure, pause, reset, start }), [configure, pause, reset, start, state]);

  return <FocusTimerContext.Provider value={value}>{children}</FocusTimerContext.Provider>;
}

import { createContext, useContext } from "react";
import type { FocusTimerConfig, FocusTimerState } from "./focusTimer";

export type FocusTimerContextValue = {
  state: FocusTimerState;
  configure(config: FocusTimerConfig): void;
  pause(): void;
  reset(): void;
  start(): void;
};

export const FocusTimerContext = createContext<FocusTimerContextValue | null>(null);

export function useFocusTimer() {
  const value = useContext(FocusTimerContext);
  if (!value) throw new Error("useFocusTimer must be used inside FocusTimerProvider");
  return value;
}

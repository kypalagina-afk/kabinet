import { focusTimerPhaseSeconds, type FocusTimerConfig } from "./focusTimer";
import { useFocusTimer } from "./FocusTimerContext";

const phaseLabels = {
  idle: "Готов к работе",
  work: "Работа",
  rest: "Отдых",
  complete: "Все круги завершены",
} as const;

function clock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function FocusTimerWidget({ compact = false }: { compact?: boolean }) {
  const { state, configure, pause, reset, start } = useFocusTimer();
  const locked = state.phase === "work" || state.phase === "rest";
  const phaseSeconds = focusTimerPhaseSeconds(state);
  const progress = state.phase === "complete"
    ? 100
    : Math.max(0, Math.min(100, Math.round((1 - state.secondsLeft / phaseSeconds) * 100)));

  function changeConfig(field: keyof FocusTimerConfig, value: string) {
    configure({ ...state.config, [field]: Number(value) || 1 });
  }

  return (
    <section className={`focus-timer${compact ? " focus-timer--compact" : ""}`} data-phase={state.phase} data-testid="focus-timer">
      <div className="focus-timer__heading">
        <div>
          <p className="eyebrow">Интервальный таймер</p>
          <h2>{phaseLabels[state.phase]}</h2>
        </div>
        <strong aria-live="polite" className="focus-timer__clock">{clock(state.secondsLeft)}</strong>
      </div>
      <div aria-label={`Интервал выполнен на ${progress}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress} className="focus-timer__track" role="progressbar"><i style={{ width: `${progress}%` }} /></div>
      <div className="focus-timer__meta">
        <span>Круг {state.phase === "idle" ? 1 : state.round} из {state.config.rounds}</span>
        <span>{state.phase === "rest" ? "Можно выдохнуть" : state.phase === "complete" ? "Отличная работа!" : "Сосредоточьтесь на одном деле"}</span>
      </div>
      <div className="focus-timer__settings" aria-label="Ручная настройка таймера">
        <label><span>Работа, мин</span><input disabled={locked} inputMode="numeric" max={180} min={1} onChange={(event) => changeConfig("workMinutes", event.target.value)} type="number" value={state.config.workMinutes} /></label>
        <label><span>Отдых, мин</span><input disabled={locked} inputMode="numeric" max={60} min={1} onChange={(event) => changeConfig("restMinutes", event.target.value)} type="number" value={state.config.restMinutes} /></label>
        <label><span>Кругов</span><input disabled={locked} inputMode="numeric" max={20} min={1} onChange={(event) => changeConfig("rounds", event.target.value)} type="number" value={state.config.rounds} /></label>
      </div>
      <div className="focus-timer__actions">
        {state.running ? <button className="primary-button primary-button--fit" onClick={pause} type="button">Пауза</button> : <button className="primary-button primary-button--fit" onClick={start} type="button">{state.phase === "idle" || state.phase === "complete" ? "Старт" : "Продолжить"}</button>}
        <button className="secondary-button" onClick={reset} type="button">Сбросить</button>
      </div>
    </section>
  );
}

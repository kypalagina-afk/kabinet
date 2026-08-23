import { Component, type ReactNode } from "react";

export interface ClientErrorEvent {
  route: string;
  action: "render";
  errorCode: string;
  timestamp: string;
  appVersion: string;
}

function safeErrorCode(error: Error): string {
  const candidate = (error as Error & { code?: unknown }).code;
  return typeof candidate === "string" && /^[a-z0-9/_-]{1,80}$/i.test(candidate)
    ? candidate
    : "ui/render-failed";
}

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    const event: ClientErrorEvent = {
      route: window.location.hash.split("?")[0] || "#/",
      action: "render",
      errorCode: safeErrorCode(error),
      timestamp: new Date().toISOString(),
      appVersion: import.meta.env.VITE_APP_VERSION || "local",
    };
    window.dispatchEvent(new CustomEvent("kabinet:client-error", { detail: event }));
    console.error("Kabinet UI error", event);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <p className="eyebrow">Не удалось открыть экран</p>
        <h1>Данные в безопасности</h1>
        <p>Обновите экран. Если ошибка повторится, вернитесь на главную.</p>
        <div className="form-actions">
          <button className="primary-button" onClick={() => window.location.reload()} type="button">
            Повторить
          </button>
          <a className="secondary-button" href="#/">На главную</a>
        </div>
      </main>
    );
  }
}

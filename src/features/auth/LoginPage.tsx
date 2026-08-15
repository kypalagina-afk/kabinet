import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthProvider";
import { EyeIcon, EyeOffIcon } from "../../components/Icons";

export function LoginPage() {
  const { login, error, clearError } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
    } catch {
      // AuthProvider exposes a safe, user-facing error without the technical email.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-title">
        <p className="eyebrow">Кабинет ученика</p>
        <h1 id="login-title">Вход в учебное пространство</h1>
        <p>
          Занятия, домашние задания и прогресс — в одном спокойном рабочем месте.
        </p>
      </section>

      <section className="login-panel" aria-label="Форма входа">
        <div className="login-panel__heading">
          <p className="eyebrow">Добро пожаловать</p>
          <h2>Войти</h2>
          <p>Используйте логин и пароль, выданные преподавателем.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Логин</span>
            <input
              autoComplete="username"
              inputMode="text"
              name="username"
              onChange={(event) => {
                clearError();
                setUsername(event.target.value);
              }}
              required
              value={username}
            />
          </label>

          <div className="form-field">
            <label htmlFor="login-password">Пароль</label>
            <span className="password-control">
              <input
                id="login-password"
                autoComplete="current-password"
                name="password"
                onChange={(event) => {
                  clearError();
                  setPassword(event.target.value);
                }}
                onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                required
                type={passwordVisible ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={passwordVisible ? "Скрыть введённые символы" : "Показать введённые символы"}
                title={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                className="password-toggle"
                onClick={() => setPasswordVisible((value) => !value)}
                type="button"
              >
                {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </span>
            {capsLock ? <small className="caps-warning" role="status">Включён Caps Lock</small> : null}
          </div>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Входим…" : "Войти"}
          </button>
        </form>

        <p className="login-help">
          Самостоятельная регистрация отключена. Для восстановления доступа
          обратитесь к преподавателю.
        </p>
      </section>
    </main>
  );
}

import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useAuth();
  const [saving, setSaving] = useState(false);
  const isDark = theme === "dark";

  async function toggleTheme() {
    setSaving(true);
    try {
      await setTheme(isDark ? "light" : "dark");
    } catch {
      // AuthProvider reports the persistence error in the shell.
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      className="icon-button"
      disabled={saving}
      onClick={() => void toggleTheme()}
      type="button"
    >
      <span aria-hidden="true" className="theme-emoji">
        {isDark ? "🌙" : "☀️"}
      </span>
    </button>
  );
}

import { teacherAIAssistantEnabled } from "./featureFlag";

export function AIShortcutButton({ prompt, children }: { prompt: string; children: string }) {
  if (!teacherAIAssistantEnabled()) return null;
  return <button className="secondary-button ai-shortcut-button" onClick={() => window.dispatchEvent(new CustomEvent("open-teacher-ai", { detail: { prompt } }))} type="button">✨ {children}</button>;
}

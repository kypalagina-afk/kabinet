import { useState } from "react";
import type { StudentImportantLink } from "../../lib/firebase/types.js";
import { MAX_IMPORTANT_LINKS, normalizeImportantLinks } from "./importantLinks.js";

export function ImportantLinksCard({
  links,
  onSave,
}: {
  links: StudentImportantLink[];
  onSave?: (links: StudentImportantLink[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StudentImportantLink[]>(links);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!onSave && !links.length) return null;

  function startEditing() {
    setDraft(links);
    setError("");
    setEditing(true);
  }

  function patch(id: string, value: Partial<StudentImportantLink>) {
    setDraft((current) =>
      current.map((item) => (item.id === id ? { ...item, ...value } : item)),
    );
  }

  async function save() {
    if (!onSave) return;
    setSaving(true);
    setError("");
    try {
      await onSave(normalizeImportantLinks(draft));
      setEditing(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Не удалось сохранить ссылки.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="important-links-card" aria-labelledby="important-links-title">
      <div className="panel-heading">
        <div>
          <span className="summary-card__label">Всегда под рукой</span>
          <h2 id="important-links-title">Важные ссылки</h2>
          <p>Платформы, материалы и другие ресурсы для регулярной работы.</p>
        </div>
        {onSave ? (
          <button
            className="secondary-button"
            disabled={saving}
            onClick={() => {
              if (editing) {
                setEditing(false);
                setError("");
              } else {
                startEditing();
              }
            }}
            type="button"
          >
            {editing ? "Отмена" : links.length ? "Изменить" : "+ Добавить"}
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="important-links-editor">
          {draft.map((item, index) => (
            <div className="important-link-edit-row" key={item.id}>
              <label className="form-field">
                <span>Название</span>
                <input
                  aria-label={`Название ссылки ${index + 1}`}
                  maxLength={100}
                  onChange={(event) => patch(item.id, { title: event.target.value })}
                  placeholder="Например, Русский100"
                  value={item.title}
                />
              </label>
              <label className="form-field">
                <span>Адрес</span>
                <input
                  aria-label={`Адрес ссылки ${index + 1}`}
                  inputMode="url"
                  onChange={(event) => patch(item.id, { url: event.target.value })}
                  placeholder="example.ru"
                  value={item.url}
                />
              </label>
              <label className="form-field important-link-note-field">
                <span>Данные / заметка (необязательно)</span>
                <input
                  aria-label={`Заметка к ссылке ${index + 1}`}
                  maxLength={500}
                  onChange={(event) => patch(item.id, { note: event.target.value })}
                  placeholder="Например, логин, код класса или нужный раздел"
                  value={item.note ?? ""}
                />
              </label>
              <button
                aria-label={`Удалить ссылку ${item.title || index + 1}`}
                className="secondary-button secondary-button--danger"
                onClick={() =>
                  setDraft((current) => current.filter((link) => link.id !== item.id))
                }
                type="button"
              >
                Удалить
              </button>
            </div>
          ))}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="form-actions">
            <button
              className="secondary-button"
              disabled={draft.length >= MAX_IMPORTANT_LINKS || saving}
              onClick={() =>
                setDraft((current) => [
                  ...current,
                  { id: crypto.randomUUID(), title: "", url: "", note: null },
                ])
              }
              type="button"
            >
              + Добавить ссылку
            </button>
            <button
              className="primary-button primary-button--fit"
              disabled={saving}
              onClick={() => void save()}
              type="button"
            >
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </div>
      ) : links.length ? (
        <div className="important-links-list">
          {links.map((item) => (
            <a
              className="important-link-item"
              href={item.url}
              key={item.id}
              rel="noreferrer"
              target="_blank"
            >
              <span className="important-link-icon" aria-hidden="true">↗</span>
              <span>
                <strong>{item.title}</strong>
                {item.note ? <small>{item.note}</small> : null}
              </span>
              <b aria-hidden="true">Открыть →</b>
            </a>
          ))}
        </div>
      ) : (
        <p className="content-state">Добавьте платформы и ресурсы, которые нужны ученику регулярно.</p>
      )}
    </section>
  );
}

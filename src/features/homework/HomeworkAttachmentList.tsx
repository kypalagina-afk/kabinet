import type { Attachment } from "../../lib/firebase/types";
import { safeHomeworkLink } from "./homeworkResources";

export function HomeworkAttachmentList({
  attachments,
  onOpenFile,
}: {
  attachments: Attachment[];
  onOpenFile(attachment: Attachment): void;
}) {
  if (!attachments.length) return null;
  return (
    <div className="attachment-buttons">
      {attachments.map((attachment) => {
        if (attachment.kind === "text")
          return (
            <details className="homework-text-attachment" key={attachment.id}>
              <summary>
                <span aria-hidden="true">📝</span>
                <strong>{attachment.title}</strong>
              </summary>
              <div>{attachment.textContent || "Текст не добавлен."}</div>
            </details>
          );
        if (attachment.kind === "external") {
          const externalUrl = safeHomeworkLink(attachment);
          return externalUrl ? (
              <a
                className="attachment-button"
                href={externalUrl}
                key={attachment.id}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span aria-hidden="true">🔗</span>
                <strong>{attachment.title}</strong>
              </a>
            ) : (
              <span className="attachment-button attachment-button--unavailable" key={attachment.id}>
                <span aria-hidden="true">⚠️</span>
                <strong>{attachment.title} · ссылка недоступна</strong>
              </span>
            );
        }
        return (
          <button
            className="attachment-button"
            key={attachment.id}
            onClick={() => onOpenFile(attachment)}
            type="button"
          >
            {attachment.contentType?.startsWith("image/") && attachment.url ? (
              <img alt="" src={attachment.url} />
            ) : (
              <span aria-hidden="true">📎</span>
            )}
            <strong>{attachment.title}</strong>
          </button>
        );
      })}
    </div>
  );
}

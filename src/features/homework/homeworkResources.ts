import type { Attachment } from "../../lib/firebase/types.js";

export const MAX_HOMEWORK_TEXT_LENGTH = 20_000;

export function normalizeHomeworkLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Введите ссылку.");
  const candidate = /^[a-z][a-z\d+.-]*:/iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Проверьте адрес ссылки.");
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol))
    throw new Error("Можно добавлять только ссылки http или https.");
  return parsed.toString();
}

export function createHomeworkLink(title: string, url: string): Attachment {
  const normalizedUrl = normalizeHomeworkLink(url);
  const normalizedTitle = title.trim() || new URL(normalizedUrl).hostname;
  return {
    id: crypto.randomUUID(),
    kind: "external",
    title: normalizedTitle,
    url: normalizedUrl,
    storagePath: null,
    contentType: "text/uri-list",
    storageProvider: null,
  };
}

export function createHomeworkText(title: string, text: string): Attachment {
  const normalizedText = text.trim();
  if (!normalizedText) throw new Error("Введите текст.");
  if (normalizedText.length > MAX_HOMEWORK_TEXT_LENGTH)
    throw new Error(`Текст должен быть не длиннее ${MAX_HOMEWORK_TEXT_LENGTH.toLocaleString("ru-RU")} символов.`);
  return {
    id: crypto.randomUUID(),
    kind: "text",
    title: title.trim() || "Текст к заданию",
    url: null,
    storagePath: null,
    contentType: "text/plain",
    storageProvider: null,
    textContent: normalizedText,
  };
}

export function safeHomeworkLink(attachment: Attachment): string | null {
  if (attachment.kind !== "external" || !attachment.url) return null;
  try {
    return normalizeHomeworkLink(attachment.url);
  } catch {
    return null;
  }
}

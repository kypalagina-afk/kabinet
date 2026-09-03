import type { StudentImportantLink } from "../../lib/firebase/types.js";

export const MAX_IMPORTANT_LINKS = 20;
export const MAX_IMPORTANT_LINK_TITLE_LENGTH = 100;
export const MAX_IMPORTANT_LINK_NOTE_LENGTH = 500;

export function normalizeImportantLinkUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Введите адрес ссылки.");
  const candidate = /^[a-z][a-z\d+.-]*:/iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Проверьте адрес ссылки.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Можно добавлять только ссылки http или https.");
  }
  return parsed.toString();
}

export function normalizeImportantLinks(
  links: StudentImportantLink[],
): StudentImportantLink[] {
  if (links.length > MAX_IMPORTANT_LINKS) {
    throw new Error(`Можно добавить не больше ${MAX_IMPORTANT_LINKS} ссылок.`);
  }
  const ids = new Set<string>();
  return links.map((link) => {
    const id = link.id.trim();
    const title = link.title.trim();
    const note = link.note?.trim() || null;
    if (!id || ids.has(id)) throw new Error("Не удалось сохранить список ссылок.");
    ids.add(id);
    if (!title) throw new Error("Укажите название каждой ссылки.");
    if (title.length > MAX_IMPORTANT_LINK_TITLE_LENGTH) {
      throw new Error(
        `Название должно быть не длиннее ${MAX_IMPORTANT_LINK_TITLE_LENGTH} символов.`,
      );
    }
    if (note && note.length > MAX_IMPORTANT_LINK_NOTE_LENGTH) {
      throw new Error(
        `Заметка должна быть не длиннее ${MAX_IMPORTANT_LINK_NOTE_LENGTH} символов.`,
      );
    }
    return {
      id,
      title,
      url: normalizeImportantLinkUrl(link.url),
      note,
    };
  });
}

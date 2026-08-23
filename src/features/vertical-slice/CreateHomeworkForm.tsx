import { useEffect, useMemo, useState, type FormEvent } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { useTeacherMaterials } from "../materials/hooks";
import {
  getFirebaseDb,
  getFirebaseStorage,
  isFirebaseStorageUploadAvailable,
} from "../../lib/firebase/client";
import {
  saveHomeworkTemplate,
  subscribeHomeworkTemplates,
} from "../../lib/firebase/services/homeworkTemplates";
import { createHomework } from "../../lib/firebase/services/verticalSliceWrites";
import { deleteFileAsset, uploadFileAsset } from "../../lib/firebase/services/fileAssetService";
import type {
  Attachment,
  ExamBlueprint,
  Homework,
  HomeworkItem,
  HomeworkTemplate,
  Lesson,
  StudentProgram,
  ProgramProfile,
  DocumentWithId,
} from "../../lib/firebase/types";

interface Props {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  sourceLesson?: DocumentWithId<Lesson> | null;
}
const labels: Record<HomeworkItem["type"], string> = {
  theory: "Теория",
  practice: "Практика",
  interactive: "Интерактив",
  essay: "Сочинение",
  exposition: "Изложение",
  writtenOther: "Другая письменная работа",
  other: "Другое",
};
function newItem(index: number): HomeworkItem {
  return {
    itemId: crypto.randomUUID(),
    type: "practice",
    title: "",
    description: null,
    requiredAmount: null,
    examTaskNumbers: [],
    attachments: [],
    materialIds: [],
    sortOrder: index,
  };
}
function smartTitle(title: string, items: HomeworkItem[]) {
  if (title.trim()) return title.trim();
  const meaningful = items.filter((item) => item.title.trim());
  const first = meaningful[0];
  if (meaningful.length === 1 && first)
    return `${first.title.trim()}${first.examTaskNumbers.length ? ` · ${first.examTaskNumbers.map((n) => `№${n}`).join(", ")}` : ""}`;
  if (meaningful.length > 1 && first)
    return `${first.title.trim()} + ${meaningful.length - 1} задания`;
  return "Домашнее задание";
}
function criteriaForItem(
  item: HomeworkItem,
  blueprint: ExamBlueprint | null,
): Homework["reviewCriteria"] {
  const config = blueprint?.writingCriteria;
  if (!config || (item.type !== "essay" && item.type !== "exposition"))
    return null;
  return {
    content: item.type === "essay" ? config.essay : config.exposition,
    literacy: config.literacy,
    factual: config.factual,
  };
}

export function CreateHomeworkForm(props: Props) {
  const draftKey = `homework-draft:${props.teacherId}:${props.studentId}${props.sourceLesson ? `:${props.sourceLesson.id}` : ""}`;
  const uploadsAvailable = isFirebaseStorageUploadAvailable();
  const [title, setTitle] = useState(() =>
    props.sourceLesson?.data.topic
      ? `Закрепить тему: ${props.sourceLesson.data.topic}`
      : "",
  );
  const [description, setDescription] = useState(() => {
    const errors = props.sourceLesson?.data.lessonSummary.errors ??
      props.sourceLesson?.data.lessonSummary.focusNotes ?? [];
    return errors.length ? `Фокус отработки: ${errors.join("; ")}.` : "";
  });
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [items, setItems] = useState<HomeworkItem[]>(() => [{
    ...newItem(0),
    title: props.sourceLesson?.data.topic
      ? `Отработать: ${props.sourceLesson.data.topic}`
      : "",
    examTaskNumbers: [...(props.sourceLesson?.data.examTaskNumbers ?? [])],
  }]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [createdId, setCreatedId] = useState("");
  const [message, setMessage] = useState("");
  const [draftFound, setDraftFound] = useState(() =>
    Boolean(localStorage.getItem(draftKey)),
  );
  const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null);
  const [templates, setTemplates] = useState<
    Array<DocumentWithId<HomeworkTemplate>>
  >([]);
  const [templateId, setTemplateId] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const materials = useTeacherMaterials(props.teacherId);
  useEffect(
    () =>
      subscribeHomeworkTemplates(
        getFirebaseDb(),
        props.teacherId,
        setTemplates,
      ),
    [props.teacherId],
  );
  useEffect(() => {
    void (async () => {
      const program = await getDoc(
        doc(getFirebaseDb(), "studentPrograms", props.studentProgramId),
      );
      if (!program.exists()) return;
      const profile = await getDoc(
        doc(
          getFirebaseDb(),
          "programProfiles",
          (program.data() as StudentProgram).programProfileId,
        ),
      );
      if (
        !profile.exists() ||
        !(profile.data() as ProgramProfile).examBlueprintId
      )
        return;
      const result = await getDoc(
        doc(
          getFirebaseDb(),
          "examBlueprints",
          (profile.data() as ProgramProfile).examBlueprintId!,
        ),
      );
      setBlueprint(result.exists() ? (result.data() as ExamBlueprint) : null);
    })();
  }, [props.studentProgramId]);
  useEffect(() => {
    if (status === "success") return;
    const handle = window.setTimeout(
      () =>
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            title,
            description,
            dueDate,
            dueTime,
            items,
            attachments,
          }),
        ),
      350,
    );
    return () => window.clearTimeout(handle);
  }, [
    attachments,
    description,
    draftKey,
    dueDate,
    dueTime,
    items,
    status,
    title,
  ]);
  const taskNumbers = useMemo(
    () =>
      blueprint?.tasks.map((task) => task.number) ??
      Array.from({ length: 13 }, (_, index) => index + 1),
    [blueprint],
  );
  const reviewCriteria = useMemo<Homework["reviewCriteria"]>(() => {
    const structured = items.find(
      (item) => item.type === "essay" || item.type === "exposition",
    );
    const config = blueprint?.writingCriteria;
    if (!structured || !config) return null;
    return {
      content: structured.type === "essay" ? config.essay : config.exposition,
      literacy: config.literacy,
      factual: config.factual,
    };
  }, [blueprint, items]);
  function restore() {
    const raw = localStorage.getItem(draftKey);
    if (!raw) return;
    const draft = JSON.parse(raw) as {
      title: string;
      description: string;
      dueDate: string;
      dueTime: string;
      items: HomeworkItem[];
      attachments?: Attachment[];
    };
    setTitle(draft.title);
    setDescription(draft.description);
    setDueDate(draft.dueDate);
    setDueTime(draft.dueTime);
    setItems(draft.items);
    setAttachments(draft.attachments ?? []);
    setDraftFound(false);
  }
  function patchItem(itemId: string, patch: Partial<HomeworkItem>) {
    setItems((current) =>
      current.map((item) =>
        item.itemId === itemId ? { ...item, ...patch } : item,
      ),
    );
  }
  function toggleTask(item: HomeworkItem, task: number) {
    patchItem(item.itemId, {
      examTaskNumbers: item.examTaskNumbers.includes(task)
        ? item.examTaskNumbers.filter((value) => value !== task)
        : [...item.examTaskNumbers, task].sort((a, b) => a - b),
    });
  }
  function removeAttachment(attachment: Attachment, itemId?: string) {
    if (attachment.kind === "storage")
      void deleteFileAsset(getFirebaseDb(), getFirebaseStorage(), attachment.id).catch(() =>
        setMessage("Не удалось удалить файл. Попробуйте ещё раз."),
      );
    if (itemId)
      setItems((current) => current.map((item) => item.itemId === itemId
        ? { ...item, attachments: item.attachments.filter(({ id }) => id !== attachment.id) }
        : item));
    else setAttachments((current) => current.filter(({ id }) => id !== attachment.id));
  }
  async function upload(files: FileList | null, itemId?: string) {
    if (!files?.length) return;
    if (!uploadsAvailable) {
      setMessage(
        "Прикрепление файлов временно недоступно в публичной версии.",
      );
      return;
    }
    setMessage("Загружаем файлы…");
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      const uploaded = await uploadFileAsset(
        getFirebaseDb(),
        getFirebaseStorage(),
        file,
        {
          teacherId: props.teacherId,
          studentId: props.studentId,
          uploadedBy: props.teacherId,
          ownerType: "teacher",
          purpose: "homework",
          homeworkId: null,
          itemId: itemId ?? null,
        },
      );
      next.push(uploaded.attachment);
    }
    if (itemId)
      setItems((current) =>
        current.map((item) =>
          item.itemId === itemId
            ? { ...item, attachments: [...item.attachments, ...next] }
            : item,
        ),
      );
    else setAttachments((current) => [...current, ...next]);
    setMessage("Файлы прикреплены.");
  }
  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setTitle(template.data.title);
    setItems(
      template.data.items.map((item, sortOrder) => ({
        ...item,
        itemId: crypto.randomUUID(),
        sortOrder,
      })),
    );
    setAttachments([...template.data.attachments]);
    setStatus("idle");
  }
  async function saveTemplate() {
    const name = smartTitle(title, items);
    setTemplateSaving(true);
    try {
      await saveHomeworkTemplate(getFirebaseDb(), {
        teacherId: props.teacherId,
        title: name,
        items,
        attachments,
        reviewCriteria,
      });
      setMessage(`Шаблон «${name}» сохранён.`);
    } finally {
      setTemplateSaving(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "saving") return;
    setStatus("saving");
    try {
      const cleanItems = items.map((item, sortOrder) => ({
        ...item,
        title: item.title.trim() || title.trim(),
        sortOrder,
        reviewCriteria: criteriaForItem(item, blueprint),
      }));
      const finalTitle = smartTitle(title, cleanItems);
      const id = await createHomework(getFirebaseDb(), {
        ...props,
        sourceLessonId: props.sourceLesson?.id ?? null,
        title: finalTitle,
        description: description || null,
        type: cleanItems[0]?.type ?? "other",
        dueAt: null,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        dueTimezone: "Europe/Moscow",
        items: cleanItems,
        attachments,
        reviewCriteria,
      });
      localStorage.removeItem(draftKey);
      setCreatedId(id);
      setMessage(`Домашнее задание назначено ✓`);
      setStatus("success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось назначить ДЗ. Черновик сохранён.",
      );
      setStatus("error");
    }
  }
  function reset() {
    setTitle("");
    setDescription("");
    setDueDate("");
    setDueTime("");
    setItems([newItem(0)]);
    setAttachments([]);
    setCreatedId("");
    setStatus("idle");
    setMessage("");
  }
  if (status === "success")
    return (
      <section className="action-form homework-success" role="status">
        <span className="success-mark">✓</span>
        <h2>Домашнее задание назначено</h2>
        <p>
          {smartTitle(title, items)} · срок{" "}
          {dueDate
            ? new Intl.DateTimeFormat("ru-RU").format(
                new Date(`${dueDate}T12:00:00`),
              )
            : "не задан"}{" "}
          · {items.length} пунктов
        </p>
        <div className="form-actions">
          <Link
            className="primary-button primary-button--fit"
            to={`/teacher/homeworks?homework=${createdId}`}
          >
            Открыть ДЗ
          </Link>
          <button className="secondary-button" onClick={reset} type="button">
            Создать ещё одно
          </button>
        </div>
      </section>
    );
  return (
    <form
      className="action-form homework-package-form responsive-form"
      data-testid="homework-package-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="action-form__heading">
        <p className="eyebrow">Пакет заданий</p>
        <h2>Новое домашнее задание</h2>
        <p>Один срок, несколько пунктов и материалы рядом с каждым заданием.</p>
      </div>
      {props.sourceLesson ? (
        <p className="workflow-hint" data-testid="homework-source-lesson">
          ДЗ будет атомарно связано с завершённым занятием
          {props.sourceLesson.data.topic ? ` «${props.sourceLesson.data.topic}»` : ""}.
        </p>
      ) : null}
      {draftFound ? (
        <div className="draft-banner">
          <span>Найден незавершённый черновик.</span>
          <button className="secondary-button" onClick={restore} type="button">
            Продолжить
          </button>
        </div>
      ) : null}
      {templates.length ? (
        <label className="form-field">
          <span>Создать из шаблона</span>
          <select
            onChange={(event) => applyTemplate(event.target.value)}
            value={templateId}
          >
            <option value="">Без шаблона</option>
            {templates.map(({ id, data }) => (
              <option key={id} value={id}>
                {data.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="form-grid">
        <label className="form-field form-field--wide">
          <span>Общее название · необязательно</span>
          <input
            name="homeworkTitle"
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </label>
        <label className="form-field">
          <span>Дата сдачи</span>
          <input
            name="homeworkDueDate"
            onChange={(event) => setDueDate(event.target.value)}
            required
            type="date"
            value={dueDate}
          />
        </label>
        <label className="form-field">
          <span>Время, МСК · необязательно</span>
          <input
            onChange={(event) => setDueTime(event.target.value)}
            type="time"
            value={dueTime}
          />
        </label>
        <label className="form-field form-field--wide">
          <span>Общий комментарий</span>
          <textarea
            name="homeworkDescription"
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            value={description}
          />
        </label>
      </div>
      <label className="file-drop">
        <span>
          {uploadsAvailable
            ? "Прикрепить общие файлы"
            : "Прикрепление файлов временно недоступно в публичной версии"}
        </span>
        <input
          accept="image/*,.pdf,.txt,.doc,.docx"
          disabled={!uploadsAvailable}
          multiple
          onChange={(event) => void upload(event.target.files)}
          type="file"
        />
      </label>
      {attachments.length ? (
        <AttachmentList
          attachments={attachments}
          onRemove={(id) => {
            const attachment = attachments.find((item) => item.id === id);
            if (attachment) removeAttachment(attachment);
          }}
        />
      ) : null}
      <section className="homework-item-editor">
        <div className="panel-heading">
          <h3>Пункты · {items.length}</h3>
          <button
            className="secondary-button"
            onClick={() =>
              setItems((current) => [...current, newItem(current.length)])
            }
            type="button"
          >
            + Добавить пункт
          </button>
        </div>
        {items.map((item, index) => (
          <article
            className="homework-edit-item homework-edit-item--package"
            key={item.itemId}
          >
            <span className="homework-edit-item__number">{index + 1}</span>
            <label className="form-field">
              <span>Тип</span>
              <select
                onChange={(event) =>
                  patchItem(item.itemId, {
                    type: event.target.value as HomeworkItem["type"],
                  })
                }
                value={item.type}
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field homework-edit-item__title">
              <span>Что сделать</span>
              <input
                onChange={(event) =>
                  patchItem(item.itemId, { title: event.target.value })
                }
                required={!title.trim()}
                value={item.title}
              />
            </label>
            {items.length > 1 ? (
              <button
                aria-label="Удалить пункт"
                className="icon-button"
                onClick={() =>
                  setItems((current) =>
                    current.filter(({ itemId }) => itemId !== item.itemId),
                  )
                }
                type="button"
              >
                ×
              </button>
            ) : null}
            <fieldset className="task-chip-selector homework-item-tasks">
              <legend>Задания экзамена</legend>
              <button
                aria-pressed={!item.examTaskNumbers.length}
                className="task-chip task-chip--general"
                onClick={() => patchItem(item.itemId, { examTaskNumbers: [] })}
                type="button"
              >
                Без номера
              </button>
              {taskNumbers.map((task) => (
                <button
                  aria-pressed={item.examTaskNumbers.includes(task)}
                  className="task-chip"
                  key={task}
                  onClick={() => toggleTask(item, task)}
                  type="button"
                >
                  №{task}
                </button>
              ))}
            </fieldset>
            <details className="homework-item-resources">
              <summary>Файлы и материалы</summary>
              <label className="file-drop file-drop--compact">
                <span>
                  {uploadsAvailable
                    ? "Прикрепить файл"
                    : "Файлы недоступны в публичной версии"}
                </span>
                <input
                  accept="image/*,.pdf,.txt,.doc,.docx"
                  disabled={!uploadsAvailable}
                  multiple
                  onChange={(event) =>
                    void upload(event.target.files, item.itemId)
                  }
                  type="file"
                />
              </label>
              {item.attachments.length ? (
                <AttachmentList
                  attachments={item.attachments}
                  onRemove={(id) => {
                    const attachment = item.attachments.find((value) => value.id === id);
                    if (attachment) removeAttachment(attachment, item.itemId);
                  }}
                />
              ) : null}
              <div className="library-picker">
                <strong>Добавить из библиотеки</strong>
                {materials.data
                  .filter(({ data }) => data.active)
                  .map(({ id, data }) => (
                    <label key={id}>
                      <input
                        checked={item.materialIds.includes(id)}
                        onChange={() =>
                          patchItem(item.itemId, {
                            materialIds: item.materialIds.includes(id)
                              ? item.materialIds.filter((value) => value !== id)
                              : [...item.materialIds, id],
                          })
                        }
                        type="checkbox"
                      />
                      {data.title}
                    </label>
                  ))}
              </div>
            </details>
          </article>
        ))}
      </section>
      <div className="form-actions">
        <button
          className="primary-button primary-button--fit"
          disabled={status === "saving"}
        >
          {status === "saving" ? "Назначаем…" : "Назначить ДЗ"}
        </button>
        <button
          className="secondary-button"
          disabled={templateSaving}
          onClick={() => void saveTemplate()}
          type="button"
        >
          {templateSaving ? "Сохраняем шаблон…" : "Сохранить как шаблон"}
        </button>
        {message ? (
          <span className={status === "error" ? "form-error" : "form-success"}>
            {message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function AttachmentList({
  attachments,
  onRemove,
}: {
  attachments: Attachment[];
  onRemove(id: string): void;
}) {
  return (
    <ul className="attachment-preview">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          {attachment.contentType?.startsWith("image/") && attachment.url ? (
            <img alt="" src={attachment.url} />
          ) : (
            <span>📎</span>
          )}
          <strong>{attachment.title}</strong>
          <button
            aria-label={`Удалить ${attachment.title}`}
            onClick={() => onRemove(attachment.id)}
            type="button"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

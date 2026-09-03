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
import {
  createHomework,
  updateHomework,
} from "../../lib/firebase/services/verticalSliceWrites";
import {
  deleteFileAsset,
  uploadFileAsset,
} from "../../lib/firebase/services/fileAssetService";
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
import { useAuth } from "../auth/AuthProvider";
import { isDemoProfile } from "../demo/demoMode";
import {
  createHomeworkLink,
  createHomeworkText,
  MAX_HOMEWORK_TEXT_LENGTH,
} from "../homework/homeworkResources";
import {
  programBlueprintId,
  reviewCriteriaForTask,
  writingConfigForTask,
} from "../exams/blueprints";

interface Props {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  sourceLesson?: DocumentWithId<Lesson> | null;
  homework?: DocumentWithId<Homework> | null;
  onSaved?(): void;
}
const labels: Record<HomeworkItem["type"], string> = {
  theory: "Теория",
  practice: "Практика",
  interactive: "Интерактив",
  essay: "Сочинение",
  exposition: "Изложение",
  exam_written_work: "Письменная работа по критериям экзамена",
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
  const taskNumber = item.examTaskNumbers[0];
  if (!config || !taskNumber) return null;
  return reviewCriteriaForTask(blueprint, taskNumber);
}

export function CreateHomeworkForm(props: Props) {
  const { profile } = useAuth();
  const editing = Boolean(props.homework);
  const existingHomework = props.homework?.data;
  const draftKey = `homework-draft:${props.teacherId}:${props.studentId}${props.sourceLesson ? `:${props.sourceLesson.id}` : ""}`;
  const uploadsAvailable =
    !isDemoProfile(profile) && isFirebaseStorageUploadAvailable();
  const [title, setTitle] = useState(
    () =>
      existingHomework?.title ??
      (props.sourceLesson?.data.topic
        ? `Закрепить тему: ${props.sourceLesson.data.topic}`
        : ""),
  );
  const [description, setDescription] = useState(() => {
    if (existingHomework) return existingHomework.description ?? "";
    const errors =
      props.sourceLesson?.data.lessonSummary.errors ??
      props.sourceLesson?.data.lessonSummary.focusNotes ??
      [];
    return errors.length ? `Фокус отработки: ${errors.join("; ")}.` : "";
  });
  const [dueDate, setDueDate] = useState(existingHomework?.dueDate ?? "");
  const [dueTime, setDueTime] = useState(existingHomework?.dueTime ?? "");
  const [items, setItems] = useState<HomeworkItem[]>(() =>
    existingHomework?.items?.length
      ? existingHomework.items.map((item) => ({
          ...item,
          attachments: [...item.attachments],
          materialIds: [...item.materialIds],
        }))
      : [
          {
            ...newItem(0),
            title: props.sourceLesson?.data.topic
              ? `Отработать: ${props.sourceLesson.data.topic}`
              : "",
            examTaskNumbers: [
              ...(props.sourceLesson?.data.examTaskNumbers ?? []),
            ],
          },
        ],
  );
  const [attachments, setAttachments] = useState<Attachment[]>(() => [
    ...(existingHomework?.attachments ?? []),
  ]);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [createdId, setCreatedId] = useState("");
  const [message, setMessage] = useState("");
  const [draftFound, setDraftFound] = useState(
    () => !editing && Boolean(localStorage.getItem(draftKey)),
  );
  const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null);
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
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
        !programBlueprintId(profile.data() as ProgramProfile)
      )
        return;
      const activeBlueprintId = programBlueprintId(
        profile.data() as ProgramProfile,
      )!;
      const result = await getDoc(
        doc(getFirebaseDb(), "examBlueprints", activeBlueprintId),
      );
      setBlueprint(result.exists() ? (result.data() as ExamBlueprint) : null);
      setBlueprintId(result.exists() ? activeBlueprintId : null);
    })();
  }, [props.studentProgramId]);
  useEffect(() => {
    if (editing || status === "success") return;
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
    editing,
    status,
    title,
  ]);
  const taskNumbers = useMemo(
    () => blueprint?.tasks.map((task) => task.number) ?? [],
    [blueprint],
  );
  const reviewCriteria = useMemo<Homework["reviewCriteria"]>(() => {
    const structured = items.find((item) =>
      item.examTaskNumbers.some(
        (task) => blueprint && writingConfigForTask(blueprint, task),
      ),
    );
    return structured && blueprint
      ? criteriaForItem(structured, blueprint)
      : null;
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
    const writing = blueprint ? writingConfigForTask(blueprint, task) : null;
    patchItem(item.itemId, {
      examTaskNumbers: item.examTaskNumbers.includes(task)
        ? item.examTaskNumbers.filter((value) => value !== task)
        : [...item.examTaskNumbers, task].sort((a, b) => a - b),
      ...(writing
        ? {
            type: "exam_written_work" as const,
            title: item.title || writing.title,
          }
        : {}),
    });
  }
  function removeAttachment(attachment: Attachment, itemId?: string) {
    if (attachment.kind === "storage")
      void deleteFileAsset(
        getFirebaseDb(),
        getFirebaseStorage(),
        attachment.id,
      ).catch(() => setMessage("Не удалось удалить файл. Попробуйте ещё раз."));
    if (itemId)
      setItems((current) =>
        current.map((item) =>
          item.itemId === itemId
            ? {
                ...item,
                attachments: item.attachments.filter(
                  ({ id }) => id !== attachment.id,
                ),
              }
            : item,
        ),
      );
    else
      setAttachments((current) =>
        current.filter(({ id }) => id !== attachment.id),
      );
  }
  function addAttachment(attachment: Attachment, itemId?: string) {
    if (itemId)
      setItems((current) =>
        current.map((item) =>
          item.itemId === itemId
            ? { ...item, attachments: [...item.attachments, attachment] }
            : item,
        ),
      );
    else setAttachments((current) => [...current, attachment]);
  }
  async function upload(files: FileList | null, itemId?: string) {
    if (!files?.length) return;
    if (!uploadsAvailable) {
      setMessage("Прикрепление файлов временно недоступно в публичной версии.");
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
        examBlueprintId: blueprintId,
        criteriaVersion:
          item.examTaskNumbers[0] && blueprint
            ? (writingConfigForTask(blueprint, item.examTaskNumbers[0])
                ?.criteriaVersion ?? null)
            : null,
        minimumWordCountSnapshot: null,
        maxScoreSnapshot:
          item.examTaskNumbers[0] && blueprint
            ? (blueprint.tasks.find(
                (task) => task.number === item.examTaskNumbers[0],
              )?.maxScore ?? null)
            : null,
      }));
      const finalTitle = smartTitle(title, cleanItems);
      const writeInput = {
        teacherId: props.teacherId,
        studentId: props.studentId,
        studentProgramId: props.studentProgramId,
        title: finalTitle,
        description: description || null,
        type: cleanItems[0]?.type ?? "other",
        dueAt: null,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        dueTimezone: "Europe/Moscow",
        examTaskNumbers: [
          ...new Set(cleanItems.flatMap((item) => item.examTaskNumbers)),
        ].sort((left, right) => left - right),
        items: cleanItems,
        attachments,
        reviewCriteria,
        examBlueprintId: blueprintId,
        criteriaVersion:
          cleanItems.find((item) => item.criteriaVersion)?.criteriaVersion ??
          null,
        maxScoreSnapshot:
          cleanItems.reduce(
            (sum, item) => sum + (item.maxScoreSnapshot ?? 0),
            0,
          ) || null,
        minimumWordCountSnapshot: null,
      };
      const id = props.homework?.id;
      if (id) {
        await updateHomework(getFirebaseDb(), {
          ...writeInput,
          homeworkId: id,
        });
      } else {
        const created = await createHomework(getFirebaseDb(), {
          ...writeInput,
          sourceLessonId: props.sourceLesson?.id ?? null,
        });
        setCreatedId(created);
        localStorage.removeItem(draftKey);
      }
      setMessage(
        editing
          ? "Домашнее задание обновлено ✓"
          : "Домашнее задание назначено ✓",
      );
      setStatus("success");
      props.onSaved?.();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : editing
            ? "Не удалось обновить ДЗ. Изменения остались в форме."
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
        <h2>
          {editing
            ? "Домашнее задание обновлено"
            : "Домашнее задание назначено"}
        </h2>
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
          {editing ? (
            <button
              className="primary-button primary-button--fit"
              onClick={props.onSaved}
              type="button"
            >
              Готово
            </button>
          ) : (
            <>
              <Link
                className="primary-button primary-button--fit"
                to={`/teacher/homeworks?homework=${createdId}`}
              >
                Открыть ДЗ
              </Link>
              <button
                className="secondary-button"
                onClick={reset}
                type="button"
              >
                Создать ещё одно
              </button>
            </>
          )}
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
        <p className="eyebrow">
          {editing ? "Управление заданием" : "Пакет заданий"}
        </p>
        <h2>
          {editing
            ? "Редактировать домашнее задание"
            : "Новое домашнее задание"}
        </h2>
        <p>Один срок, несколько пунктов и материалы рядом с каждым заданием.</p>
      </div>
      {!editing && props.sourceLesson ? (
        <p className="workflow-hint" data-testid="homework-source-lesson">
          ДЗ будет атомарно связано с завершённым занятием
          {props.sourceLesson.data.topic
            ? ` «${props.sourceLesson.data.topic}»`
            : ""}
          .
        </p>
      ) : null}
      {!editing && draftFound ? (
        <div className="draft-banner">
          <span>Найден незавершённый черновик.</span>
          <button className="secondary-button" onClick={restore} type="button">
            Продолжить
          </button>
        </div>
      ) : null}
      {!editing && templates.length ? (
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
      <HomeworkResourceAdder
        onAdd={(attachment) => addAttachment(attachment)}
      />
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
              {(
                blueprint?.sections ?? [
                  { code: "all", title: "Задания", maxScore: 0 },
                ]
              ).map((section) => {
                const visibleTasks = taskNumbers.filter((taskNumber) => {
                  const task = blueprint?.tasks.find(
                    (item) => item.number === taskNumber,
                  );
                  return !blueprint || task?.sectionCode === section.code;
                });
                if (!visibleTasks.length) return null;
                return (
                  <div className="task-selector-group" key={section.code}>
                    <strong>{section.title}</strong>
                    <div>
                      {visibleTasks.map((task) => (
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
                    </div>
                  </div>
                );
              })}
            </fieldset>
            {blueprint?.tasks.find((task) => task.number === 13)?.variants
              ?.length && item.examTaskNumbers.includes(13) ? (
              <label className="form-field">
                <span>Вариант сочинения</span>
                <select
                  onChange={(event) =>
                    patchItem(item.itemId, {
                      writingVariant: event.target.value || null,
                    })
                  }
                  value={item.writingVariant ?? ""}
                >
                  <option value="">Выберите вариант</option>
                  {blueprint.tasks
                    .find((task) => task.number === 13)
                    ?.variants?.map((variant) => (
                      <option key={variant} value={variant}>
                        {variant}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
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
              <HomeworkResourceAdder
                compact
                onAdd={(attachment) => addAttachment(attachment, item.itemId)}
              />
              {item.attachments.length ? (
                <AttachmentList
                  attachments={item.attachments}
                  onRemove={(id) => {
                    const attachment = item.attachments.find(
                      (value) => value.id === id,
                    );
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
        <button
          className="secondary-button homework-add-item"
          onClick={() =>
            setItems((current) => [...current, newItem(current.length)])
          }
          type="button"
        >
          + Добавить пункт
        </button>
      </section>
      <div className="form-actions">
        <button
          className="primary-button primary-button--fit"
          disabled={status === "saving"}
        >
          {status === "saving"
            ? editing
              ? "Сохраняем…"
              : "Назначаем…"
            : editing
              ? "Сохранить изменения"
              : "Назначить ДЗ"}
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
            <span>
              {attachment.kind === "text"
                ? "📝"
                : attachment.kind === "external"
                  ? "🔗"
                  : "📎"}
            </span>
          )}
          <span>
            <strong>{attachment.title}</strong>
            {attachment.kind === "text" && attachment.textContent ? (
              <small>
                {attachment.textContent.slice(0, 100)}
                {attachment.textContent.length > 100 ? "…" : ""}
              </small>
            ) : attachment.kind === "external" && attachment.url ? (
              <small>{attachment.url}</small>
            ) : null}
          </span>
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

function HomeworkResourceAdder({
  compact = false,
  onAdd,
}: {
  compact?: boolean;
  onAdd(attachment: Attachment): void;
}) {
  const [mode, setMode] = useState<"link" | "text">("link");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function add() {
    try {
      onAdd(
        mode === "link"
          ? createHomeworkLink(title, value)
          : createHomeworkText(title, value),
      );
      setTitle("");
      setValue("");
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось добавить материал.",
      );
    }
  }

  return (
    <details
      className={`homework-resource-adder${compact ? " homework-resource-adder--compact" : ""}`}
    >
      <summary>+ Добавить ссылку или текст</summary>
      <div className="homework-resource-adder__body">
        <div
          className="segmented-control homework-resource-kind"
          aria-label="Тип материала"
        >
          <button
            aria-pressed={mode === "link"}
            onClick={() => {
              setMode("link");
              setError("");
            }}
            type="button"
          >
            Ссылка
          </button>
          <button
            aria-pressed={mode === "text"}
            onClick={() => {
              setMode("text");
              setError("");
            }}
            type="button"
          >
            Длинный текст
          </button>
        </div>
        <label className="form-field">
          <span>Название · необязательно</span>
          <input
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              mode === "link"
                ? "Например, тренажёр"
                : "Например, текст для анализа"
            }
            value={title}
          />
        </label>
        <label className="form-field">
          <span>{mode === "link" ? "Адрес ссылки" : "Текст"}</span>
          {mode === "link" ? (
            <input
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
              placeholder="example.com или https://example.com"
              type="text"
              value={value}
            />
          ) : (
            <textarea
              maxLength={MAX_HOMEWORK_TEXT_LENGTH}
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
              placeholder="Вставьте сюда правило, условие, фрагмент произведения или другой текст"
              rows={compact ? 5 : 7}
              value={value}
            />
          )}
        </label>
        {mode === "text" ? (
          <small className="homework-resource-counter">
            {value.length.toLocaleString("ru-RU")} /{" "}
            {MAX_HOMEWORK_TEXT_LENGTH.toLocaleString("ru-RU")}
          </small>
        ) : null}
        <button
          className="secondary-button"
          disabled={!value.trim()}
          onClick={add}
          type="button"
        >
          {mode === "link" ? "Добавить ссылку" : "Прикрепить текст"}
        </button>
        {error ? (
          <span className="form-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </details>
  );
}

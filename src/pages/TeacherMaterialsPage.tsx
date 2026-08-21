import { useEffect, useMemo, useState, type FormEvent } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../features/auth/AuthProvider";
import {
  useMaterialFolders,
  useProgramProfiles,
  useTeacherMaterials,
} from "../features/materials/hooks";
import {
  useTeacherStudentPrograms,
  useTeacherStudents,
} from "../features/vertical-slice/hooks";
import { getFirebaseDb, getFirebaseStorage, isFirebaseStorageUploadAvailable } from "../lib/firebase/client";
import { uploadFileAsset } from "../lib/firebase/services/fileAssetService";
import {
  archiveMaterial,
  createMaterial,
  createMaterialFolder,
  grantFolderAccess,
  grantMaterialAccess,
  markMaterialUsed,
  toggleMaterialFavorite,
  updateMaterial,
  type MaterialInput,
} from "../lib/firebase/services/materialsWorkflow";
import type {
  DocumentWithId,
  ExamBlueprint,
  Material,
} from "../lib/firebase/types";

const typeLabels: Record<Material["type"], string> = {
  pdf: "PDF",
  image: "Изображение",
  audio: "Аудио",
  video: "Видео",
  link: "Ссылка",
  interactive: "Интерактив",
  other: "Другое",
};
function initialInput(programId = ""): MaterialInput {
  return {
    title: "",
    type: "link",
    externalUrl: "",
    programProfileIds: programId ? [programId] : [],
    examTaskNumbers: [],
    tags: [],
    folderId: null,
    visibility: "private",
    selectedStudentIds: [],
    allowedStudentIds: [],
    favorite: false,
  };
}

export function TeacherMaterialsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const materials = useTeacherMaterials(user?.uid ?? "");
  const programs = useProgramProfiles();
  const folders = useMaterialFolders(user?.uid ?? "");
  const students = useTeacherStudents(user?.uid ?? "");
  const assignments = useTeacherStudentPrograms(user?.uid ?? "");
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [mode, setMode] = useState<"all" | "favorites">("all");
  const [materialOpen, setMaterialOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderTitle, setFolderTitle] = useState("");
  const [editing, setEditing] = useState<DocumentWithId<Material> | null>(null);
  const [input, setInput] = useState<MaterialInput>(() => initialInput());
  const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [assignMaterial, setAssignMaterial] =
    useState<DocumentWithId<Material> | null>(null);
  const [assignFolder, setAssignFolder] = useState("");
  const [assignStudentIds, setAssignStudentIds] = useState<string[]>([]);
  const [autoShare, setAutoShare] = useState(false);
  const [assignMode, setAssignMode] = useState<"access" | "homework">("access");
  const selectedProgramId =
    input.programProfileIds[0] ?? programs.data[0]?.id ?? "";
  useEffect(() => {
    const profile = programs.data.find(({ id }) => id === selectedProgramId);
    if (!profile?.data.examBlueprintId) {
      queueMicrotask(() => setBlueprint(null));
      return;
    }
    void getDoc(
      doc(getFirebaseDb(), "examBlueprints", profile.data.examBlueprintId),
    ).then((snapshot) =>
      setBlueprint(
        snapshot.exists() ? (snapshot.data() as ExamBlueprint) : null,
      ),
    );
  }, [programs.data, selectedProgramId]);
  const visible = useMemo(
    () =>
      materials.data
        .filter(({ data }) => {
          const term = query.toLocaleLowerCase("ru");
          return (
            data.active &&
            (!folderFilter || data.folderId === folderFilter) &&
            (!term ||
              data.title.toLocaleLowerCase("ru").includes(term) ||
              data.tags.some((tag) => tag.includes(term))) &&
            (mode === "all" || (mode === "favorites" && data.favorite))
          );
        })
        .sort((a, b) => Number(Boolean(b.data.favorite)) - Number(Boolean(a.data.favorite)) || a.data.title.localeCompare(b.data.title, "ru")),
    [folderFilter, materials.data, mode, query],
  );
  const programStudentIds = assignments.data
    .filter(
      ({ data }) =>
        data.status === "active" && data.programProfileId === selectedProgramId,
    )
    .map(({ data }) => data.studentId);
  function effectiveInput() {
    const selected = input.selectedStudentIds ?? [];
    return {
      ...input,
      programProfileIds: [selectedProgramId],
      allowedStudentIds:
        input.visibility === "private"
          ? []
          : input.visibility === "selected_students"
            ? selected
            : programStudentIds,
    };
  }
  function openCreate() {
    setEditing(null);
    setInput(initialInput(programs.data[0]?.id));
    setFile(null);
    setMaterialOpen(true);
  }
  function openEdit(item: DocumentWithId<Material>) {
    setEditing(item);
    setInput({
      title: item.data.title,
      type: item.data.type,
      externalUrl: item.data.externalUrl ?? "",
      programProfileIds: item.data.programProfileIds,
      examTaskNumbers: item.data.examTaskNumbers,
      tags: item.data.tags,
      folderId: item.data.folderId ?? null,
      visibility: item.data.visibility ?? "private",
      selectedStudentIds: item.data.selectedStudentIds ?? [],
      allowedStudentIds: item.data.allowedStudentIds ?? [],
      favorite: item.data.favorite ?? false,
      storagePath: item.data.storagePath,
    });
    setFile(null);
    setMaterialOpen(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    try {
      const materialId = editing?.id ?? crypto.randomUUID();
      let value = effectiveInput();
      if (file) {
        const uploaded = await uploadFileAsset(
          getFirebaseDb(),
          getFirebaseStorage(),
          file,
          {
            teacherId: user.uid,
            studentId: null,
            uploadedBy: user.uid,
            ownerType: "teacher",
            purpose: "material",
            materialId,
            allowedStudentIds: value.allowedStudentIds,
          },
          setUploadProgress,
        );
        value = {
          ...value,
          externalUrl: uploaded.attachment.url ?? "",
          storagePath: uploaded.attachment.storagePath,
          type: uploaded.previewType === "image" ? "image" : uploaded.previewType === "pdf" ? "pdf" : "other",
        };
      }
      if (editing)
        await updateMaterial(
          getFirebaseDb(),
          user.uid,
          editing.id,
          value,
        );
      else await createMaterial(getFirebaseDb(), user.uid, value, materialId);
      setMaterialOpen(false);
      setMessage("Материал сохранён ✓");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить материал",
      );
    } finally {
      setSaving(false);
    }
  }
  function toggleStudent(id: string) {
    setAssignStudentIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }
  async function applyAssignment() {
    if (!user || !assignStudentIds.length) return;
    if (assignFolder) {
      await grantFolderAccess(getFirebaseDb(), {
        teacherId: user.uid,
        folderId: assignFolder,
        studentIds: assignStudentIds,
        autoShareNewMaterials: autoShare,
      });
      setMessage("Папка назначена ученикам ✓");
    } else if (assignMaterial) {
      if (assignMode === "access") {
        await grantMaterialAccess(
          getFirebaseDb(),
          user.uid,
          assignMaterial.id,
          assignStudentIds,
        );
        setMessage("Доступ к материалу выдан ✓");
      } else {
        const studentId = assignStudentIds[0];
        const assignment = assignments.data.find(
          ({ data }) =>
            data.studentId === studentId && data.status === "active",
        );
        if (!assignment) throw new Error("У ученика нет активной программы");
        localStorage.setItem(
          `homework-draft:${user.uid}:${studentId}`,
          JSON.stringify({
            title: assignMaterial.data.title,
            description: "",
            dueDate: "",
            dueTime: "",
            items: [
              {
                itemId: crypto.randomUUID(),
                type: "theory",
                title: assignMaterial.data.title,
                description: null,
                requiredAmount: null,
                examTaskNumbers: assignMaterial.data.examTaskNumbers,
                attachments: [],
                materialIds: [assignMaterial.id],
                sortOrder: 0,
              },
            ],
          }),
        );
        navigate(`/teacher/students/${studentId}?tab=homework`);
        return;
      }
    }
    setAssignFolder("");
    setAssignMaterial(null);
    setAssignStudentIds([]);
  }
  return (
    <main
      className="shell-content materials-page"
      aria-labelledby="teacher-materials-title"
    >
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Библиотека</p>
          <h1 id="teacher-materials-title">Материалы</h1>
          <p>Сначала найти и назначить, затем — создавать новое.</p>
        </div>
        <div className="form-actions">
          <button
            className="secondary-button"
            onClick={() => setFolderOpen(true)}
            type="button"
          >
            + Папка
          </button>
          <button
            className="primary-button primary-button--fit"
            onClick={openCreate}
            type="button"
          >
            + Добавить материал
          </button>
        </div>
      </header>
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}
      <section className="smart-collections">
        <button aria-pressed={mode === "all"} onClick={() => setMode("all")} type="button"><strong>Все материалы</strong><span>{materials.data.filter(({ data }) => data.active).length}</span></button>
        <button
          aria-pressed={mode === "favorites"}
          onClick={() => setMode("favorites")}
          type="button"
        >
          <strong>⭐ Избранное</strong>
          <span>
            {
              materials.data.filter(({ data }) => data.favorite && data.active)
                .length
            }
          </span>
        </button>
      </section>
      <section className="filter-bar">
        <label>
          <span>Поиск</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название или тег"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span>Коллекция</span>
          <select
            onChange={(event) => setMode(event.target.value as typeof mode)}
            value={mode}
          >
            <option value="all">Все</option>
            <option value="favorites">Избранные</option>
          </select>
        </label>
        <label>
          <span>Папка</span>
          <select
            onChange={(event) => setFolderFilter(event.target.value)}
            value={folderFilter}
          >
            <option value="">Все папки</option>
            {folders.data
              .filter(({ data }) => data.active)
              .map(({ id, data }) => (
                <option key={id} value={id}>
                  {data.title}
                </option>
              ))}
          </select>
        </label>
      </section>
      {mode !== "all" || query || folderFilter ? <button className="secondary-button" onClick={() => { setMode("all"); setQuery(""); setFolderFilter(""); }} type="button">Сбросить фильтры</button> : null}
      <section className="folder-grid">
        {folders.data
          .filter(({ data }) => data.active)
          .map(({ id, data }) => (
            <article
              className={`folder-card${folderFilter === id ? " folder-card--active" : ""}`}
              key={id}
            >
              <button
                onClick={() => setFolderFilter(folderFilter === id ? "" : id)}
                type="button"
              >
                <span>📁</span>
                <strong>{data.title}</strong>
                <small>
                  {
                    materials.data.filter(
                      ({ data: item }) => item.folderId === id && item.active,
                    ).length
                  }{" "}
                  материалов
                </small>
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setAssignFolder(id);
                  setAssignMaterial(null);
                  setAssignStudentIds([]);
                }}
                type="button"
              >
                Назначить папку
              </button>
            </article>
          ))}
      </section>
      <section className="material-list material-grid">
        {visible.map((item) => (
          <article className="material-card" key={item.id}>
            <button
              aria-label={
                item.data.favorite
                  ? "Убрать из избранного"
                  : "Добавить в избранное"
              }
              className="favorite-button"
              onClick={() =>
                user &&
                void toggleMaterialFavorite(
                  getFirebaseDb(),
                  user.uid,
                  item.id,
                  !item.data.favorite,
                )
              }
              type="button"
            >
              {item.data.favorite ? "★" : "☆"}
            </button>
            <span className="material-type">{typeLabels[item.data.type]}</span>
            <h2>{item.data.title}</h2>
            <div className="tag-row">
              {item.data.examTaskNumbers.map((number) => (
                <span className="status-chip" key={number}>
                  №{number}
                </span>
              ))}
            </div>
            <div className="material-actions">
              <button
                className="primary-button"
                onClick={() => {
                  setAssignMaterial(item);
                  setAssignFolder("");
                  setAssignStudentIds([]);
                  setAssignMode("access");
                }}
                type="button"
              >
                Назначить ▾
              </button>
              <a
                className="secondary-button"
                href={item.data.externalUrl ?? "#"}
                onClick={() =>
                  user &&
                  void markMaterialUsed(getFirebaseDb(), user.uid, item.id)
                }
                rel="noreferrer"
                target="_blank"
              >
                Открыть
              </a>
              <details className="secondary-menu">
                <summary aria-label="Другие действия">•••</summary>
                <button onClick={() => openEdit(item)} type="button">
                  Изменить
                </button>
                <button
                  onClick={() =>
                    user &&
                    void archiveMaterial(getFirebaseDb(), user.uid, item.id)
                  }
                  type="button"
                >
                  Архивировать
                </button>
              </details>
            </div>
          </article>
        ))}
      </section>
      {!materials.loading && !visible.length ? (
        <p className="content-state">В этой коллекции пока нет материалов.</p>
      ) : null}
      {folderOpen ? (
        <Modal onClose={() => setFolderOpen(false)} title="Новая папка">
          <form
            className="modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (user && folderTitle.trim())
                void createMaterialFolder(
                  getFirebaseDb(),
                  user.uid,
                  folderTitle,
                ).then(() => {
                  setFolderOpen(false);
                  setFolderTitle("");
                  setMessage("Папка создана ✓");
                });
            }}
          >
            <label className="form-field">
              <span>Название папки</span>
              <input
                autoFocus
                onChange={(event) => setFolderTitle(event.target.value)}
                required
                value={folderTitle}
              />
            </label>
            <div className="form-actions">
              <button className="primary-button primary-button--fit">
                Создать
              </button>
              <button
                className="secondary-button"
                onClick={() => setFolderOpen(false)}
                type="button"
              >
                Отмена
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {materialOpen ? (
        <Modal
          className="material-editor-modal"
          onClose={() => setMaterialOpen(false)}
          title={editing ? "Редактировать материал" : "Добавить материал"}
        >
          <form className="modal-form" onSubmit={(event) => void submit(event)}>
            <label className="form-field">
              <span>Название</span>
              <input
                onChange={(event) =>
                  setInput({ ...input, title: event.target.value })
                }
                required
                value={input.title}
              />
            </label>
            <label className="form-field">
              <span>Ссылка</span>
              <input
                onChange={(event) =>
                  setInput({ ...input, externalUrl: event.target.value })
                }
                type="url"
                value={input.externalUrl}
              />
            </label>
            <label className="file-drop" aria-disabled={!isFirebaseStorageUploadAvailable()}>
              <span>{isFirebaseStorageUploadAvailable() ? "Или загрузите файл до 15 МБ" : "Загрузка файлов недоступна в публичной версии"}</span>
              <input
                accept="image/jpeg,image/png,image/webp,.pdf,.txt,.doc,.docx"
                disabled={!isFirebaseStorageUploadAvailable()}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              {file ? <strong>{file.name}</strong> : null}
              {uploadProgress > 0 && uploadProgress < 100 ? <progress max="100" value={uploadProgress} /> : null}
            </label>
            <div className="form-grid">
              <label className="form-field">
                <span>Тип</span>
                <select
                  onChange={(event) =>
                    setInput({
                      ...input,
                      type: event.target.value as Material["type"],
                    })
                  }
                  value={input.type}
                >
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Папка</span>
                <select
                  onChange={(event) =>
                    setInput({ ...input, folderId: event.target.value || null })
                  }
                  value={input.folderId ?? ""}
                >
                  <option value="">Без папки</option>
                  {folders.data.map(({ id, data }) => (
                    <option key={id} value={id}>
                      {data.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Программа</span>
                <select
                  onChange={(event) =>
                    setInput({
                      ...input,
                      programProfileIds: [event.target.value],
                    })
                  }
                  value={selectedProgramId}
                >
                  {programs.data.map(({ id, data }) => (
                    <option key={id} value={id}>
                      {data.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="task-chip-selector">
              <legend>Задания экзамена</legend>
              <button
                aria-pressed={!input.examTaskNumbers.length}
                className="task-chip task-chip--general"
                onClick={() => setInput({ ...input, examTaskNumbers: [] })}
                type="button"
              >
                Общий материал
              </button>
              {(blueprint?.tasks ?? []).map((task) => (
                <button
                  aria-pressed={input.examTaskNumbers.includes(task.number)}
                  className="task-chip"
                  key={task.number}
                  onClick={() =>
                    setInput({
                      ...input,
                      examTaskNumbers: input.examTaskNumbers.includes(
                        task.number,
                      )
                        ? input.examTaskNumbers.filter(
                            (number) => number !== task.number,
                          )
                        : [...input.examTaskNumbers, task.number].sort(
                            (a, b) => a - b,
                          ),
                    })
                  }
                  type="button"
                >
                  №{task.number}
                </button>
              ))}
            </fieldset>
            <label className="form-field">
              <span>Теги через запятую</span>
              <input
                onChange={(event) =>
                  setInput({
                    ...input,
                    tags: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
                value={input.tags.join(", ")}
              />
            </label>
            <div className="form-actions">
              <button
                className="primary-button primary-button--fit"
                disabled={saving}
              >
                {saving ? "Сохраняем…" : "Сохранить"}
              </button>
              <button
                className="secondary-button"
                onClick={() => setMaterialOpen(false)}
                type="button"
              >
                Отмена
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {assignMaterial || assignFolder ? (
        <Modal
          onClose={() => {
            setAssignMaterial(null);
            setAssignFolder("");
          }}
          title={
            assignFolder
              ? "Назначить папку"
              : `Назначить «${assignMaterial?.data.title}»`
          }
        >
          <div className="modal-form">
            {assignMaterial ? (
              <div className="segmented-control">
                <button
                  aria-pressed={assignMode === "access"}
                  onClick={() => setAssignMode("access")}
                  type="button"
                >
                  Дать доступ
                </button>
                <button
                  aria-pressed={assignMode === "homework"}
                  onClick={() => setAssignMode("homework")}
                  type="button"
                >
                  Добавить в ДЗ
                </button>
              </div>
            ) : null}
            <fieldset className="student-access-list">
              <legend>
                {assignMode === "homework"
                  ? "Выберите одного ученика"
                  : "Ученики"}
              </legend>
              {students.data
                .filter(({ data }) => data.status === "active")
                .map(({ id, data }) => (
                  <label key={id}>
                    <input
                      checked={assignStudentIds.includes(id)}
                      onChange={() =>
                        assignMode === "homework"
                          ? setAssignStudentIds([id])
                          : toggleStudent(id)
                      }
                      type={assignMode === "homework" ? "radio" : "checkbox"}
                    />
                    {data.displayName}
                  </label>
                ))}
            </fieldset>
            {assignFolder ? (
              <label className="checkbox-row">
                <input
                  checked={autoShare}
                  onChange={(event) => setAutoShare(event.target.checked)}
                  type="checkbox"
                />
                Автоматически давать доступ к новым материалам этой папки
              </label>
            ) : null}
            <p className="workflow-hint">
              {assignFolder && !autoShare
                ? "Доступ получат только текущие материалы папки."
                : "Изменения появятся у учеников сразу."}
            </p>
            <div className="form-actions">
              <button
                className="primary-button primary-button--fit"
                disabled={!assignStudentIds.length}
                onClick={() => void applyAssignment()}
                type="button"
              >
                Подтвердить
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setAssignMaterial(null);
                  setAssignFolder("");
                }}
                type="button"
              >
                Отмена
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

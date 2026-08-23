import { useMemo, useState } from "react";
import { useAuth } from "../features/auth/AuthProvider";
import { useStudentMaterialFolders, useStudentMaterials } from "../features/materials/hooks";
import { useStudentWorkspace } from "../features/vertical-slice/hooks";
import { getFileAssetDownloadUrl } from "../lib/firebase/services/fileAssetService";
import type { Material } from "../lib/firebase/types";

export function StudentMaterialsPage() {
  const { profile } = useAuth();
  const studentId = profile?.studentId ?? "";
  const workspace = useStudentWorkspace(studentId);
  const materials = useStudentMaterials(workspace.data.programProfile?.id ?? "", studentId);
  const folders = useStudentMaterialFolders(studentId);
  const [mode, setMode] = useState<"all" | "study" | "practice">("all");
  const [task, setTask] = useState(0);
  const [folderId, setFolderId] = useState("");
  const [message, setMessage] = useState("");
  const [currentTime] = useState(() => Date.now());
  const tasks = workspace.data.examBlueprint?.data.tasks.map((item) => item.number)
    ?? [...new Set(materials.data.flatMap(({ data }) => data.examTaskNumbers))].sort((a, b) => a - b);
  const visible = useMemo(
    () => materials.data.filter(({ data }) => {
      const matchesMode = mode === "all" || (mode === "practice"
        ? data.tags.includes("тренировка") || data.type === "interactive"
        : data.tags.includes("полезное") || data.type !== "interactive");
      return matchesMode && (!task || data.examTaskNumbers.includes(task)) && (!folderId || data.folderId === folderId);
    }),
    [folderId, materials.data, mode, task],
  );

  async function openMaterial(material: Material) {
    const url = material.externalUrl || (material.fileAssetId
      ? await getFileAssetDownloadUrl(material.fileAssetId)
      : "");
    if (!url) throw new Error("Ссылка на материал недоступна.");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="shell-content materials-page" aria-labelledby="student-materials-title">
      <header className="page-heading"><p className="eyebrow">Моя библиотека</p><h1 id="student-materials-title">Материалы</h1><p>{workspace.data.programProfile?.data.title}</p></header>
      {message ? <p className="shell-notice" role="alert">{message}</p> : null}
      {folders.data.length ? <section className="student-folder-grid">{folders.data.map(({ id, data }) => <button aria-pressed={folderId === id} key={id} onClick={() => setFolderId(folderId === id ? "" : id)} type="button"><span>📁</span><strong>{data.title}</strong><small>{materials.data.filter(({ data: item }) => item.folderId === id).length} материалов</small></button>)}</section> : null}
      <div className="materials-filters"><div className="segmented-control" aria-label="Тип материалов">{([['all', 'Все'], ['study', 'Полезное'], ['practice', 'Тренировка']] as const).map(([value, label]) => <button aria-pressed={mode === value} key={value} onClick={() => setMode(value)} type="button">{label}</button>)}</div><label className="form-field compact-filter"><span>Задание</span><select value={task} onChange={(event) => setTask(Number(event.target.value))}><option value={0}>Все</option>{tasks.map((value) => <option key={value} value={value}>№{value}</option>)}</select></label></div>
      {materials.loading ? <p className="content-state">Загружаем материалы…</p> : null}
      {materials.error ? <p className="shell-notice">{materials.error}</p> : null}
      <div className="student-material-grid" data-testid="student-material-list">{visible.map(({ id, data }) => { const isNew = currentTime - data.createdAt.toMillis() < 7 * 86_400_000; return <article className="material-card" key={id}>{isNew ? <span className="new-badge">Новое</span> : null}<span className="material-type">{({ pdf: "PDF", image: "Изображение", audio: "Аудио", video: "Видео", link: "Ссылка", interactive: "Интерактив", other: "Материал" } as const)[data.type]}</span><h2>{data.title}</h2><p>{data.examTaskNumbers.length ? `Задания: ${data.examTaskNumbers.map((value) => `№${value}`).join(", ")}` : "Общий материал"}</p><div className="tag-row">{data.tags.map((tag) => <span className="status-chip" key={tag}>{tag}</span>)}</div><button className="primary-button" onClick={() => void openMaterial(data).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Не удалось открыть материал"))} type="button">Открыть материал</button></article>; })}</div>
      {!materials.loading && !visible.length ? <p className="content-state">В этой папке или фильтре материалов пока нет.</p> : null}
    </section>
  );
}

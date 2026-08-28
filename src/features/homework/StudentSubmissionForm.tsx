import { useMemo, useState, type FormEvent } from "react";
import {
  getFirebaseAuth,
  getFirebaseDb,
  getFirebaseStorage,
  isFirebaseStorageUploadAvailable,
} from "../../lib/firebase/client";
import {
  homeworkSubmissionId,
  submitHomework,
} from "../../lib/firebase/services/homeworkWorkflow";
import { deleteFileAsset, uploadFileAsset } from "../../lib/firebase/services/fileAssetService";
import type {
  Attachment,
  Homework,
  HomeworkItem,
  HomeworkSubmission,
} from "../../lib/firebase/types";
import { useAuth } from "../auth/AuthProvider";
import { isDemoProfile } from "../demo/demoMode";

const labels: Record<HomeworkItem["type"], string> = {
  theory: "Теория",
  practice: "Практика",
  interactive: "Интерактив",
  essay: "Сочинение",
  exposition: "Изложение",
  writtenOther: "Письменная работа",
  other: "Задание",
};
const writtenTypes = new Set<HomeworkItem["type"]>([
  "essay",
  "exposition",
  "writtenOther",
]);

export function StudentSubmissionForm({
  homeworkId,
  homework,
  submissions,
}: {
  homeworkId: string;
  homework: Homework;
  submissions: HomeworkSubmission[];
}) {
  const { profile } = useAuth();
  const [note, setNote] = useState("");
  const [earned, setEarned] = useState("");
  const [maximum, setMaximum] = useState("");
  const [completedItems, setCompletedItems] = useState<string[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const uploadsAvailable = !isDemoProfile(profile) && isFirebaseStorageUploadAvailable();
  const submissionNumber =
    Math.max(0, ...submissions.map((submission) => submission.submissionNumber)) + 1;
  const items = homework.items ?? [];
  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      })),
    [files],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;
    setState("saving");
    const uploadedAssetIds: string[] = [];
    try {
      const attachments: Attachment[] = [];
      if (!uploadsAvailable && files.length > 0) {
        throw new Error("Production file upload is unavailable");
      }
      const uploadedBy = getFirebaseAuth().currentUser?.uid;
      if (!uploadedBy) throw new Error("Требуется вход в аккаунт.");
      const submissionId = homeworkSubmissionId(homeworkId, submissionNumber);
      for (const file of files) {
        const uploaded = await uploadFileAsset(
          getFirebaseDb(),
          getFirebaseStorage(),
          file,
          {
            teacherId: homework.teacherId,
            studentId: homework.studentId,
            uploadedBy,
            ownerType: "student",
            purpose: "submission",
            homeworkId,
            submissionId,
          },
        );
        uploadedAssetIds.push(uploaded.assetId);
        attachments.push(uploaded.attachment);
      }
      await submitHomework(getFirebaseDb(), {
        homeworkId,
        teacherId: homework.teacherId,
        studentId: homework.studentId,
        submissionNumber,
        studentInput: {
          completed: items.length
            ? completedItems.length === items.length
            : true,
          selfReportedEarned: !items.length && earned ? Number(earned) : null,
          selfReportedMax: !items.length && maximum ? Number(maximum) : null,
          note: note || null,
          externalAttachmentUrls: [],
          attachments,
          itemProgress: items.map((item) => ({
            itemId: item.itemId,
            completed: completedItems.includes(item.itemId),
            selfReportedEarned: null,
            selfReportedMax: null,
            responseText: responses[item.itemId]?.trim() || null,
            attachments: [],
          })),
        },
      });
      setState("success");
    } catch {
      await Promise.all(
        uploadedAssetIds.map((assetId) =>
          deleteFileAsset(getFirebaseDb(), getFirebaseStorage(), assetId).catch(() => undefined),
        ),
      );
      setState("error");
    }
  }

  const hasLegacyScore =
    !items.length &&
    (homework.type === "practice" || homework.type === "interactive");

  return (
    <form
      className="inline-workflow-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      {items.length ? (
        <div className="student-homework-items">
          <div className="homework-progress">
            <strong>
              Прогресс {completedItems.length}/{items.length}
            </strong>
            <span>
              <i
                style={{
                  width: `${Math.round((completedItems.length / items.length) * 100)}%`,
                }}
              />
            </span>
          </div>
          {items.map((item) => (
            <div className="student-homework-response" key={item.itemId}>
              <label className="student-homework-item">
                <input
                  checked={completedItems.includes(item.itemId)}
                  onChange={() =>
                    setCompletedItems((current) =>
                      current.includes(item.itemId)
                        ? current.filter((id) => id !== item.itemId)
                        : [...current, item.itemId],
                    )
                  }
                  type="checkbox"
                />
                <span>
                  <small>{labels[item.type]}</small>
                  <strong>{item.title}</strong>
                </span>
              </label>
              {writtenTypes.has(item.type) ? (
                <label className="form-field written-response-field">
                  <span>Текст ответа</span>
                  <textarea
                    onChange={(event) => setResponses((current) => ({
                      ...current,
                      [item.itemId]: event.target.value,
                    }))}
                    placeholder="Вставьте сочинение, изложение или другой письменный ответ"
                    required={!uploadsAvailable}
                    rows={8}
                    value={responses[item.itemId] ?? ""}
                  />
                </label>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="workflow-hint">
          Попытка №{submissionNumber}. Оценка появится после проверки.
        </p>
      )}
      {hasLegacyScore ? (
        <div className="score-inputs">
          <label className="form-field">
            <span>Мой результат</span>
            <input
              min="0"
              onChange={(event) => setEarned(event.target.value)}
              required
              type="number"
              value={earned}
            />
          </label>
          <label className="form-field">
            <span>Из скольких</span>
            <input
              min="1"
              onChange={(event) => setMaximum(event.target.value)}
              required
              type="number"
              value={maximum}
            />
          </label>
        </div>
      ) : null}
      <label className="form-field">
        <span>{!items.length && homework.type === "written" ? "Текст ответа" : "Комментарий для преподавателя · необязательно"}</span>
        <textarea
          onChange={(event) => setNote(event.target.value)}
          required={!items.length && homework.type === "written" && !uploadsAvailable}
          rows={!items.length && homework.type === "written" ? 8 : 3}
          value={note}
        />
      </label>
      <label className="file-drop" aria-disabled={!uploadsAvailable}>
        <span>
          {uploadsAvailable
            ? "Прикрепить фото, PDF или документ"
            : "Прикрепление файлов временно недоступно в публичной версии"}
        </span>
        <input
          accept="image/*,.pdf,.txt,.doc,.docx"
          disabled={!uploadsAvailable}
          multiple
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          type="file"
        />
      </label>
      {previews.length ? (
        <ul className="attachment-preview">
          {previews.map(({ file, url }) => (
            <li key={`${file.name}-${file.size}`}>
              {url ? <img alt="" src={url} /> : <span>📎</span>}
              <strong>{file.name}</strong>
              <button
                aria-label={`Удалить ${file.name}`}
                onClick={() =>
                  setFiles((current) =>
                    current.filter((item) => item !== file),
                  )
                }
                type="button"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        className="primary-button primary-button--fit"
        disabled={state === "saving"}
      >
        {state === "saving"
          ? "Отправляем…"
          : submissionNumber > 1
            ? "Отправить повторно"
            : "Отправить работу"}
      </button>
      {state === "success" ? (
        <span className="form-success">Работа отправлена · ждёт проверки</span>
      ) : null}
      {state === "error" ? (
        <span className="form-error">
          Не удалось отправить работу. Данные формы сохранены.
        </span>
      ) : null}
    </form>
  );
}

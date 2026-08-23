import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { HomeworkStatus } from "../features/homework/HomeworkStatus";
import { effectiveHomeworkStatus } from "../features/homework/selectors";
import { StudentSubmissionForm } from "../features/homework/StudentSubmissionForm";
import { useStudentWorkspace } from "../features/vertical-slice/hooks";
import { formatHomeworkDueDate } from "../features/vertical-slice/selectors";
import { getFirebaseDb } from "../lib/firebase/client";
import { getAttachmentDownloadUrl } from "../lib/firebase/services/fileAssetService";
import { markHomeworkReviewOpened } from "../lib/firebase/services/homeworkWorkflow";
import type {
  Attachment,
  Homework,
  HomeworkItemEvaluation,
} from "../lib/firebase/types";

const typeLabels: Record<Homework["type"], string> = {
  theory: "Теория",
  practice: "Практика",
  written: "Письменная работа",
  interactive: "Интерактив",
  essay: "Сочинение",
  exposition: "Изложение",
  writtenOther: "Другая письменная работа",
  other: "Задание",
};

export function StudentHomeworkPage() {
  const { profile } = useAuth();
  const studentId = profile?.studentId ?? "";
  const { data, loading, error } = useStudentWorkspace(studentId);
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("homework");
  const selectedHomework = data.homeworks.find(({ id }) => id === selectedId);
  const effectiveTab =
    selectedHomework &&
    ["checked", "completed"].includes(
      effectiveHomeworkStatus(selectedHomework.data),
    )
      ? "completed"
      : tab;
  const homeworks = useMemo(
    () =>
      [...data.homeworks]
        .filter(({ data: homework }) => {
          const status = effectiveHomeworkStatus(homework);
          const completed = status === "checked" || status === "completed";
          return effectiveTab === "completed" ? completed : !completed;
        })
        .sort(
          (a, b) => b.data.assignedAt.toMillis() - a.data.assignedAt.toMillis(),
        ),
    [data.homeworks, effectiveTab],
  );
  useEffect(() => {
    if (!selectedId || !studentId) return;
    const latest = data.homeworkSubmissions
      .filter(
        ({ data: item }) =>
          item.homeworkId === selectedId && item.status === "checked",
      )
      .sort((a, b) => b.data.submissionNumber - a.data.submissionNumber)[0];
    if (latest?.data.reviewedUnread)
      void markHomeworkReviewOpened(getFirebaseDb(), latest.id, studentId);
  }, [data.homeworkSubmissions, selectedId, studentId]);
  function toggle(id: string) {
    const next = new URLSearchParams(params);
    if (selectedId === id) next.delete("homework");
    else next.set("homework", id);
    setParams(next);
  }
  return (
    <section
      className="shell-content homework-page"
      aria-labelledby="student-homework-title"
    >
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Домашние задания</p>
          <h1 id="student-homework-title">Мои задания</h1>
          <p>Отмечай готовые пункты и отправляй работу преподавателю.</p>
        </div>
        <div className="segmented-control" aria-label="Фильтр домашних заданий">
          <button
            aria-pressed={tab === "active"}
            onClick={() => setTab("active")}
            type="button"
          >
            Активные
          </button>
          <button
            aria-pressed={tab === "completed"}
            onClick={() => setTab("completed")}
            type="button"
          >
            Завершённые
          </button>
        </div>
      </header>
      {loading ? <p className="content-state">Загружаем задания…</p> : null}
      {error ? <p className="shell-notice">{error}</p> : null}
      <div className="homework-list" data-testid="student-homework-list">
        {homeworks.map(({ id, data: homework }) => {
          const submissions = data.homeworkSubmissions
            .filter(({ data: item }) => item.homeworkId === id)
            .sort((a, b) => a.data.submissionNumber - b.data.submissionNumber);
          const latest = submissions.at(-1)?.data;
          const canSubmit =
            homework.status === "assigned" ||
            effectiveHomeworkStatus(homework) === "overdue" ||
            homework.status === "needs_revision";
          const open = selectedId === id;
          return (
            <article
              className={`workflow-card student-homework-card${open ? " student-homework-card--open" : ""}`}
              data-testid="homework-card"
              key={id}
            >
              <button
                className="student-homework-card__heading"
                onClick={() => toggle(id)}
                type="button"
              >
                <span>
                  <small>{typeLabels[homework.type]}</small>
                  <strong>{homework.title}</strong>
                  <em>
                    Срок:{" "}
                    {formatHomeworkDueDate(homework)}
                  </em>
                </span>
                <HomeworkStatus homework={homework} />
                <b>{open ? "−" : "+"}</b>
              </button>
              {open ? (
                <div className="student-homework-detail">
                  {homework.description ? <p>{homework.description}</p> : null}
                  <ol className="assigned-item-list">
                    {(homework.items ?? []).map((item) => (
                      <li key={item.itemId}>
                        <div>
                          <strong>{item.title}</strong>
                          <small>
                            {item.examTaskNumbers
                              .map((n) => `№${n}`)
                              .join(", ") || typeLabels[item.type]}
                          </small>
                        </div>
                        <StudentAttachments attachments={item.attachments} />
                        {latest?.teacherEvaluation?.itemEvaluations?.find(
                          (evaluation) => evaluation.itemId === item.itemId,
                        ) ? (
                          <ItemResult
                            evaluation={
                              latest.teacherEvaluation.itemEvaluations.find(
                                (evaluation) =>
                                  evaluation.itemId === item.itemId,
                              )!
                            }
                          />
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  <StudentAttachments
                    attachments={homework.attachments ?? []}
                  />
                  {latest?.teacherEvaluation &&
                  !latest.teacherEvaluation.itemEvaluations?.length ? (
                    <div className="evaluation-result reviewed-result">
                      <span className="success-mark">✓</span>
                      <h3>Домашнее задание проверено</h3>
                      <strong>
                        Результат: {latest.teacherEvaluation.scoreEarned ?? "—"}
                        /{latest.teacherEvaluation.scoreMax ?? "—"}
                      </strong>
                      <Criteria criteria={latest.teacherEvaluation.criteria} />
                      <p>
                        {latest.teacherEvaluation.comment ||
                          "Без дополнительного комментария."}
                      </p>
                    </div>
                  ) : null}
                  {latest?.teacherEvaluation?.itemEvaluations?.length ? (
                    <p className="evaluation-package-status">
                      <strong>
                        {latest.status === "checked"
                          ? "Все пункты проверены"
                          : latest.status === "needs_revision"
                            ? "Один или несколько пунктов нужно доработать"
                            : "Проверка отдельных пунктов продолжается"}
                      </strong>
                    </p>
                  ) : null}
                  {canSubmit ? (
                    <StudentSubmissionForm
                      homework={homework}
                      homeworkId={id}
                      submissions={submissions.map(({ data: item }) => item)}
                    />
                  ) : null}
                  {homework.status === "submitted" &&
                  !latest?.teacherEvaluation ? (
                    <div className="submitted-state">
                      <strong>Работа отправлена · ждёт проверки</strong>
                      <span>
                        {latest?.submittedAt
                          ? new Intl.DateTimeFormat("ru-RU", {
                              dateStyle: "short",
                              timeStyle: "short",
                            }).format(latest.submittedAt.toDate())
                          : ""}
                      </span>
                      <StudentAttachments
                        attachments={latest?.studentInput.attachments ?? []}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
        {!loading && !homeworks.length ? (
          <p className="content-state">В этом разделе пока нет заданий.</p>
        ) : null}
      </div>
    </section>
  );
}

function Criteria({
  criteria,
}: {
  criteria: HomeworkItemEvaluation["criteria"];
}) {
  return criteria.length ? (
    <div className="criteria-report">
      {criteria.map((criterion) => (
        <span
          className={
            criterion.earned === criterion.max
              ? "criteria-chip--full"
              : criterion.earned === 0
                ? "criteria-chip--zero"
                : "criteria-chip--partial"
          }
          key={criterion.code}
        >
          {criterion.code}: {criterion.earned}/{criterion.max}
          {criterion.errorsCount !== null
            ? ` · ошибок ${criterion.errorsCount}`
            : ""}
        </span>
      ))}
    </div>
  ) : null;
}
function ItemResult({ evaluation }: { evaluation: HomeworkItemEvaluation }) {
  return (
    <div className="item-evaluation-result">
      <span
        className={`status-chip${evaluation.reviewStatus === "needs_revision" ? " status-chip--warning" : ""}`}
      >
        {evaluation.reviewStatus === "needs_revision"
          ? "Нужна доработка этого пункта"
          : "Пункт проверен"}
      </span>
      <strong>
        {evaluation.scoreEarned ?? "—"}/{evaluation.scoreMax ?? "—"}
      </strong>
      <Criteria criteria={evaluation.criteria} />
      {evaluation.comment ? <p>{evaluation.comment}</p> : null}
    </div>
  );
}
function StudentAttachments({ attachments }: { attachments: Attachment[] }) {
  const [error, setError] = useState("");
  async function open(attachment: Attachment) {
    setError("");
    const url = await getAttachmentDownloadUrl(attachment);
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return attachments.length ? (
    <div className="attachment-buttons">
      {attachments.map((attachment) => (
        <button
          className="attachment-button"
          key={attachment.id}
          onClick={() => void open(attachment).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Не удалось открыть файл."))}
          type="button"
        >
          {attachment.contentType?.startsWith("image/") && attachment.url ? (
            <img alt="" src={attachment.url} />
          ) : (
            <span>📎</span>
          )}
          <strong>{attachment.title}</strong>
        </button>
      ))}
      {error ? <span role="alert">{error}</span> : null}
    </div>
  ) : null;
}

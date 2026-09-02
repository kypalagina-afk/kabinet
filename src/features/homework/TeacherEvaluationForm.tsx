import { useMemo, useState, type FormEvent } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  evaluateHomeworkItem,
  evaluateHomeworkSubmission,
  submitHomework,
  undoTeacherExternalHomeworkSubmission,
} from "../../lib/firebase/services/homeworkWorkflow";
import type {
  DocumentWithId,
  EvaluationCriterion,
  Homework,
  HomeworkItem,
  HomeworkSubmission,
} from "../../lib/firebase/types";
import { parsePracticeScore } from "./practiceScoreParser";

type ReviewConfig = NonNullable<Homework["reviewCriteria"]>;

export function TeacherExternalSubmissionControls({
  homework,
  homeworkId,
  submissions,
  teacherId,
}: {
  homework: Homework;
  homeworkId: string;
  submissions: Array<DocumentWithId<HomeworkSubmission>>;
  teacherId: string;
}) {
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const latest = [...submissions]
    .sort((left, right) => left.data.submissionNumber - right.data.submissionNumber)
    .at(-1);
  const canRecord = new Set<Homework["status"]>([
    "assigned",
    "overdue",
    "needs_revision",
  ]).has(homework.status);
  const canUndo = latest?.data.submissionSource === "teacher_external"
    && latest.data.status === "submitted";

  async function record() {
    setState("saving");
    try {
      await submitHomework(getFirebaseDb(), {
        homeworkId,
        teacherId,
        studentId: homework.studentId,
        submissionNumber: (latest?.data.submissionNumber ?? 0) + 1,
        submissionSource: "teacher_external",
        studentInput: {
          completed: true,
          selfReportedEarned: null,
          selfReportedMax: null,
          note: "Сдано вне платформы — через мессенджер или лично.",
          externalAttachmentUrls: [],
          attachments: [],
          itemProgress: (homework.items ?? []).map((item) => ({
            itemId: item.itemId,
            completed: true,
            selfReportedEarned: null,
            selfReportedMax: null,
            responseText: null,
            attachments: [],
          })),
        },
      });
      setState("success");
    } catch {
      setState("error");
    }
  }

  async function undo() {
    if (!latest) return;
    setState("saving");
    try {
      await undoTeacherExternalHomeworkSubmission(getFirebaseDb(), {
        homeworkId,
        submissionId: latest.id,
        teacherId,
      });
      setState("idle");
    } catch {
      setState("error");
    }
  }

  if (!canRecord && !canUndo) return null;
  return (
    <section className="external-homework-submission">
      <div>
        <strong>Сдача вне платформы</strong>
        <span>Если ученик прислал работу в мессенджере, отметьте её сданной и выставьте баллы здесь.</span>
      </div>
      {canUndo ? (
        <button className="secondary-button" disabled={state === "saving"} onClick={() => void undo()} type="button">
          Отменить отметку о сдаче
        </button>
      ) : (
        <button className="secondary-button" disabled={state === "saving"} onClick={() => void record()} type="button">
          {state === "saving" ? "Отмечаем…" : "Отметить сданным вне платформы"}
        </button>
      )}
      {state === "success" ? <span className="form-success">Работа отмечена сданной. Теперь можно выставить баллы.</span> : null}
      {state === "error" ? <span className="form-error">Не удалось изменить отметку о сдаче.</span> : null}
    </section>
  );
}

export function TeacherEvaluationForm({
  homeworkId,
  homework,
  submission,
  submissionId,
  teacherId,
}: {
  homeworkId: string;
  homework: Homework;
  submission: HomeworkSubmission;
  submissionId: string;
  teacherId: string;
}) {
  const reviewable = (homework.items ?? []).filter(
    (item) =>
      item.type === "practice"
      || (
        (item.type === "essay" || item.type === "exposition" || item.type === "exam_written_work")
        && (item.reviewCriteria || homework.reviewCriteria)
      ),
  );
  const [qualityScore, setQualityScore] = useState(
    submission.teacherEvaluation?.qualityScore?.toString() ?? "",
  );
  if (reviewable.length)
    return (
      <div className="multi-item-review" data-testid="multi-item-review">
        <div className="review-context">
          <strong>Попытка №{submission.submissionNumber}</strong>
          <span>
            {submission.submittedAt
              ? `Отправлено ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(submission.submittedAt.toDate())}`
              : "Работа отправлена"}
          </span>
        </div>
        <QualityScoreField onChange={setQualityScore} value={qualityScore} />
        {reviewable.map((item, index) => (
          <ItemEvaluationForm
            homeworkId={homeworkId}
            index={index}
            item={item}
            key={item.itemId}
            onQualityScoreChange={setQualityScore}
            qualityScore={qualityScore}
            submission={submission}
            submissionId={submissionId}
            teacherId={teacherId}
          />
        ))}
      </div>
    );
  return (
    <SingleEvaluationForm
      homeworkId={homeworkId}
      homework={homework}
      submission={submission}
      submissionId={submissionId}
      teacherId={teacherId}
    />
  );
}

function ItemEvaluationForm({
  homeworkId,
  index,
  item,
  submission,
  submissionId,
  teacherId,
  qualityScore,
  onQualityScoreChange,
}: {
  homeworkId: string;
  index: number;
  item: HomeworkItem;
  submission: HomeworkSubmission;
  submissionId: string;
  teacherId: string;
  qualityScore: string;
  onQualityScoreChange(value: string): void;
}) {
  const existing = submission.teacherEvaluation?.itemEvaluations?.find(
    (evaluation) => evaluation.itemId === item.itemId,
  );
  return (
    <details
      className="structured-item-review"
      data-testid={`item-review-${item.itemId}`}
      open={index === 0 || !existing}
    >
      <summary>
        <span>
          Пункт {index + 1} · {item.title}
        </span>
        <span
          className={`status-chip${existing?.reviewStatus === "needs_revision" ? " status-chip--warning" : ""}`}
        >
          {existing?.reviewStatus === "checked"
            ? "Проверено"
            : existing?.reviewStatus === "needs_revision"
              ? "На доработке"
              : "Ждёт проверки"}
        </span>
      </summary>
      <EvaluationEditor
        config={(item.reviewCriteria ?? null) as ReviewConfig | null}
        existing={existing}
        practiceTaskNumbers={item.type === "practice" ? item.examTaskNumbers : undefined}
        qualityScore={qualityScore}
        onQualityScoreChange={onQualityScoreChange}
        showQualityScore={false}
        itemId={item.itemId}
        minimumWords={item.minimumWordCountSnapshot ?? null}
        responseText={submission.studentInput.itemProgress?.find((progress) => progress.itemId === item.itemId)?.responseText ?? null}
        onEvaluate={(decision, scoreEarned, scoreMax, quality, criteria, comment) =>
          evaluateHomeworkItem(getFirebaseDb(), {
            homeworkId,
            submissionId,
            teacherId,
            itemId: item.itemId,
            decision,
            scoreEarned,
            scoreMax,
            qualityScore: quality,
            criteria,
            comment,
          })
        }
      />
    </details>
  );
}

function SingleEvaluationForm({
  homeworkId,
  homework,
  submission,
  submissionId,
  teacherId,
}: {
  homeworkId: string;
  homework: Homework;
  submission: HomeworkSubmission;
  submissionId: string;
  teacherId: string;
}) {
  const [qualityScore, setQualityScore] = useState(
    submission.teacherEvaluation?.qualityScore?.toString() ?? "",
  );
  return (
    <div className="inline-workflow-form structured-review">
      <div className="review-context">
        <strong>Попытка №{submission.submissionNumber}</strong>
        <span>
          {submission.submittedAt
            ? `Отправлено ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(submission.submittedAt.toDate())}`
            : "Работа отправлена"}
        </span>
      </div>
      <EvaluationEditor
        config={homework.reviewCriteria ?? null}
        existing={submission.teacherEvaluation ?? undefined}
        fallbackMax={homework.requiredAmount ?? submission.studentInput.selfReportedMax}
        qualityScore={qualityScore}
        onQualityScoreChange={setQualityScore}
        showQualityScore
        onEvaluate={(decision, scoreEarned, scoreMax, quality, criteria, comment) =>
          evaluateHomeworkSubmission(getFirebaseDb(), {
            homeworkId,
            submissionId,
            teacherId,
            decision,
            scoreEarned,
            scoreMax,
            qualityScore: quality,
            criteria,
            comment,
          })
        }
      />
    </div>
  );
}

function EvaluationEditor({
  config,
  existing,
  itemId,
  fallbackMax,
  practiceTaskNumbers,
  qualityScore,
  onQualityScoreChange,
  showQualityScore,
  minimumWords,
  responseText,
  onEvaluate,
}: {
  config: ReviewConfig | null;
  existing?: {
    scoreEarned: number | null;
    scoreMax: number | null;
    criteria: EvaluationCriterion[];
    comment: string | null;
  };
  itemId?: string;
  fallbackMax?: number | null;
  practiceTaskNumbers?: number[];
  qualityScore: string;
  onQualityScoreChange(value: string): void;
  showQualityScore: boolean;
  minimumWords?: number | null;
  responseText?: string | null;
  onEvaluate(
    decision: "checked" | "needs_revision",
    scoreEarned: number | null,
    scoreMax: number | null,
    qualityScore: number | null,
    criteria: EvaluationCriterion[],
    comment: string | null,
  ): Promise<unknown>;
}) {
  const initialCriteria = useMemo<EvaluationCriterion[]>(
    () =>
      config
        ? [
            ...config.content.map((item) => ({
              code: item.code,
              earned:
                existing?.criteria.find((value) => value.code === item.code)
                  ?.earned ?? 0,
              max: item.max,
              errorsCount: item.supportsErrorCount
                ? existing?.criteria.find((value) => value.code === item.code)
                    ?.errorsCount ?? 0
                : null,
            })),
            ...config.literacy.map((item) => ({
              code: item.code,
              earned:
                existing?.criteria.find((value) => value.code === item.code)
                  ?.earned ?? 0,
              max: item.max,
              errorsCount:
                existing?.criteria.find((value) => value.code === item.code)
                  ?.errorsCount ?? 0,
            })),
            ...(config.factual
              ? [
                  {
                    code: config.factual.code,
                    earned:
                      existing?.criteria.find(
                        (value) => value.code === config.factual?.code,
                      )?.earned ?? 0,
                    max: config.factual.max,
                    errorsCount:
                      existing?.criteria.find(
                        (value) => value.code === config.factual?.code,
                      )?.errorsCount ?? 0,
                  },
                ]
              : []),
          ]
        : [],
    [config, existing],
  );
  const [criteria, setCriteria] = useState(initialCriteria);
  const [earned, setEarned] = useState(existing?.scoreEarned?.toString() ?? "");
  const [maximum, setMaximum] = useState(
    existing?.scoreMax?.toString() ?? fallbackMax?.toString() ?? "",
  );
  const [practiceText, setPracticeText] = useState("");
  const [practiceError, setPracticeError] = useState("");
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const wordCount = responseText?.trim()
    ? responseText.trim().split(/\s+/u).filter(Boolean).length
    : 0;
  const belowMinimum = Boolean(minimumWords && wordCount < minimumWords);
  const effectiveCriteria = belowMinimum
    ? criteria.map((criterion) => ({ ...criterion, earned: 0 }))
    : criteria;
  const calculatedMax = config
    ? initialCriteria.reduce((sum, item) => sum + item.max, 0)
    : maximum === ""
      ? null
      : Number(maximum);
  const calculatedEarned = config
    ? effectiveCriteria.reduce((sum, item) => sum + item.earned, 0)
    : earned === ""
      ? null
      : Number(earned);
  function patchCriterion(code: string, patch: Partial<EvaluationCriterion>) {
    setCriteria((current) =>
      current.map((item) =>
        item.code === code ? { ...item, ...patch } : item,
      ),
    );
  }
  async function evaluate(decision: "checked" | "needs_revision") {
    if (state === "saving") return;
    setState("saving");
    try {
      await onEvaluate(
        decision,
        calculatedEarned,
        calculatedMax,
        qualityScore === "" ? null : Number(qualityScore),
        effectiveCriteria,
        comment || null,
      );
      setState("success");
    } catch {
      setState("error");
    }
  }
  return (
    <form
      className="inline-workflow-form structured-review"
      data-item-id={itemId}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void evaluate("checked");
      }}
    >
      {config ? (
        <>
          {minimumWords ? (
            <p className={belowMinimum ? "form-error" : "form-success"} role="status">
              Объём: {wordCount} слов · минимум {minimumWords}.
              {belowMinimum ? " По правилу blueprint итог по критериям будет 0." : " Полная проверка доступна."}
            </p>
          ) : null}
          <section className="criteria-editor">
            <h4>Критерии содержания</h4>
            {config.content.map((item) => (
              <CriterionInput
                criterion={criteria.find((value) => value.code === item.code)!}
                errorLabel={item.supportsErrorCount ? item.errorLabel ?? "Ошибок" : undefined}
                key={item.code}
                label={item.title}
                onChange={patchCriterion}
              />
            ))}
          </section>
          <section className="criteria-editor">
            <h4>Грамотность</h4>
            {config.literacy.map((item) => (
              <CriterionInput
                criterion={criteria.find((value) => value.code === item.code)!}
                errorLabel={item.errorLabel}
                key={item.code}
                label={item.title}
                onChange={patchCriterion}
              />
            ))}
            {config.factual ? (
              <CriterionInput
                criterion={
                  criteria.find((value) => value.code === config.factual!.code)!
                }
                errorLabel={config.factual.errorLabel}
                label="Фактическая точность"
                onChange={patchCriterion}
              />
            ) : null}
          </section>
          <div className="structured-total">
            <span>Итог рассчитывается автоматически</span>
            <strong>
              {calculatedEarned}/{calculatedMax}
            </strong>
          </div>
        </>
      ) : (
        <>
          {practiceTaskNumbers ? (
            <div className="practice-result-import">
              <label className="form-field">
                <span>Результат практики · можно вставить из Русского100</span>
                <textarea
                  onChange={(event) => {
                    setPracticeText(event.target.value);
                    setPracticeError("");
                  }}
                  placeholder="Например: 8/10 или Задание №15: 8/10 от 01.09.26 18:30"
                  rows={3}
                  value={practiceText}
                />
              </label>
              <button
                className="secondary-button"
                disabled={!practiceText.trim()}
                onClick={() => {
                  const parsed = parsePracticeScore(practiceText, practiceTaskNumbers);
                  if (!parsed) {
                    setPracticeError("Не удалось распознать результат. Используйте формат 8/10 или вставьте строку из Русского100.");
                    return;
                  }
                  setEarned(String(parsed.earned));
                  setMaximum(String(parsed.maximum));
                  setPracticeError("");
                }}
                type="button"
              >
                Распознать результат
              </button>
              {practiceError ? <span className="form-error">{practiceError}</span> : null}
            </div>
          ) : null}
          <div className="score-inputs">
            <label className="form-field">
              <span>Набрано баллов</span>
              <input
                max={calculatedMax ?? undefined}
                min="0"
                onChange={(event) => setEarned(event.target.value)}
                type="number"
                value={earned}
              />
            </label>
            <label className="form-field">
              <span>Из скольких</span>
              <input
                min="1"
                onChange={(event) => setMaximum(event.target.value)}
                type="number"
                value={maximum}
              />
            </label>
          </div>
        </>
      )}
      {showQualityScore ? (
        <QualityScoreField onChange={onQualityScoreChange} value={qualityScore} />
      ) : null}
      <label className="form-field">
        <span>Комментарий ученику</span>
        <textarea
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          value={comment}
        />
      </label>
      <div className="form-actions">
        <button
          className="primary-button primary-button--fit"
          disabled={state === "saving"}
        >
          {state === "saving" ? "Сохраняем…" : "Проверено"}
        </button>
        <button
          className="secondary-button"
          disabled={state === "saving"}
          onClick={() => void evaluate("needs_revision")}
          type="button"
        >
          Вернуть на доработку
        </button>
      </div>
      {state === "success" ? (
        <span className="form-success">Проверка пункта сохранена.</span>
      ) : null}
      {state === "error" ? (
        <span className="form-error">
          Не удалось сохранить проверку. Данные формы не очищены.
        </span>
      ) : null}
    </form>
  );
}

function QualityScoreField({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  return (
    <label className="form-field homework-quality-field">
      <span>Качество выполнения ДЗ · необязательно</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">Не выставлять</option>
        {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => (
          <option key={score} value={score}>{score} из 10</option>
        ))}
      </select>
    </label>
  );
}

function CriterionInput({
  criterion,
  label,
  errorLabel,
  onChange,
}: {
  criterion: EvaluationCriterion;
  label: string;
  errorLabel?: string;
  onChange(code: string, patch: Partial<EvaluationCriterion>): void;
}) {
  return (
    <div className="criterion-row">
      <strong>
        {criterion.code}
        <small> · {label}</small>
      </strong>
      <label className="form-field">
        <span>Балл / {criterion.max}</span>
        <input
          aria-label={`${criterion.code} балл`}
          max={criterion.max}
          min="0"
          onChange={(event) =>
            onChange(criterion.code, { earned: Number(event.target.value) })
          }
          type="number"
          value={criterion.earned}
        />
      </label>
      {errorLabel ? (
        <label className="form-field">
          <span>{errorLabel}</span>
          <input
            aria-label={`${criterion.code} ошибок`}
            min="0"
            onChange={(event) =>
              onChange(criterion.code, {
                errorsCount: Number(event.target.value),
              })
            }
            type="number"
            value={criterion.errorsCount ?? 0}
          />
        </label>
      ) : null}
    </div>
  );
}

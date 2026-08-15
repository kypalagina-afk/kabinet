import { useMemo, useState, type FormEvent } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  evaluateHomeworkItem,
  evaluateHomeworkSubmission,
} from "../../lib/firebase/services/homeworkWorkflow";
import type {
  EvaluationCriterion,
  Homework,
  HomeworkItem,
  HomeworkSubmission,
} from "../../lib/firebase/types";

type ReviewConfig = NonNullable<Homework["reviewCriteria"]>;

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
  const structured = (homework.items ?? []).filter(
    (item) =>
      (item.type === "essay" || item.type === "exposition") &&
      (item.reviewCriteria || homework.reviewCriteria),
  );
  if (structured.length)
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
        {structured.map((item, index) => (
          <ItemEvaluationForm
            homeworkId={homeworkId}
            index={index}
            item={item}
            key={item.itemId}
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
}: {
  homeworkId: string;
  index: number;
  item: HomeworkItem;
  submission: HomeworkSubmission;
  submissionId: string;
  teacherId: string;
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
        itemId={item.itemId}
        onEvaluate={(decision, scoreEarned, scoreMax, criteria, comment) =>
          evaluateHomeworkItem(getFirebaseDb(), {
            homeworkId,
            submissionId,
            teacherId,
            itemId: item.itemId,
            decision,
            scoreEarned,
            scoreMax,
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
        onEvaluate={(decision, scoreEarned, scoreMax, criteria, comment) =>
          evaluateHomeworkSubmission(getFirebaseDb(), {
            homeworkId,
            submissionId,
            teacherId,
            decision,
            scoreEarned,
            scoreMax,
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
  onEvaluate(
    decision: "checked" | "needs_revision",
    scoreEarned: number | null,
    scoreMax: number | null,
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
              errorsCount: null,
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
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const calculatedMax = config
    ? initialCriteria.reduce((sum, item) => sum + item.max, 0)
    : (existing?.scoreMax ?? fallbackMax ?? null);
  const calculatedEarned = config
    ? criteria.reduce((sum, item) => sum + item.earned, 0)
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
        criteria,
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
          <section className="criteria-editor">
            <h4>Критерии содержания</h4>
            {config.content.map((item) => (
              <CriterionInput
                criterion={criteria.find((value) => value.code === item.code)!}
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
        <label className="form-field">
          <span>Результат{calculatedMax ? ` / ${calculatedMax}` : ""}</span>
          <input
            max={calculatedMax ?? undefined}
            min="0"
            onChange={(event) => setEarned(event.target.value)}
            type="number"
            value={earned}
          />
        </label>
      )}
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

import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type SetStateAction } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import { calculateDetailedMockExam, createDetailedMockExam, updateDetailedMockExam, type DetailedMockExamInput } from "../../lib/firebase/services/mockExamWorkflow";
import type { DocumentWithId, EvaluationCriterion, ExamBlueprint, MockExam } from "../../lib/firebase/types";
import { blueprintExamKind, blueprintPrimaryMax, writingConfigForTask, type BlueprintCriterion } from "../exams/blueprints";

function existingDate(exam?: DocumentWithId<MockExam> | null) {
  if (exam?.data.takenDate) return exam.data.takenDate;
  const value = exam?.data.takenAt?.toDate();
  return value ? value.toISOString().slice(0, 10) : "";
}

function legacyCriteria(exam?: DocumentWithId<MockExam> | null) {
  if (!exam) return [];
  if (exam.data.criteriaResults) return exam.data.criteriaResults;
  const values: EvaluationCriterion[] = [
    ...exam.data.sections.exposition.criteria,
    ...exam.data.sections.essay.criteria,
    ...exam.data.sections.literacy.criteria,
  ];
  if (exam.data.sections.factualAccuracy.max)
    values.push({ code: "ФК1", earned: exam.data.sections.factualAccuracy.earned, max: exam.data.sections.factualAccuracy.max, errorsCount: exam.data.sections.factualAccuracy.errorsCount });
  return values;
}

function moveScoreFocus(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const inputs = Array.from(event.currentTarget.form?.querySelectorAll<HTMLInputElement>("[data-exam-score]") ?? []);
  const index = inputs.indexOf(event.currentTarget);
  const next = event.key === "ArrowLeft" ? inputs[index - 1] : inputs[index + 1];
  if (!next) return;
  event.preventDefault();
  next.focus();
  next.select();
}

export function DetailedMockExamForm({ teacherId, studentId, studentProgramId, blueprintId, blueprint, existing, onSaved }: {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  blueprintId: string;
  blueprint: ExamBlueprint;
  existing?: DocumentWithId<MockExam> | null;
  onSaved?(examId: string): void;
}) {
  const examName = blueprintExamKind(blueprint) === "ege" ? "ЕГЭ" : "ОГЭ";
  const [title, setTitle] = useState(existing?.data.title ?? `Пробный ${examName}`);
  const [takenDate, setTakenDate] = useState(() => existingDate(existing));
  const [tasks, setTasks] = useState<Record<number, number>>(() => Object.fromEntries(existing?.data.taskResults.map((item) => [item.taskNumber, item.earned]) ?? []));
  const initialCriteria = useMemo(() => legacyCriteria(existing), [existing]);
  const [criteria, setCriteria] = useState<Record<string, number>>(() => Object.fromEntries(initialCriteria.map((item) => [item.code, item.earned])));
  const [errors, setErrors] = useState<Record<string, number>>(() => Object.fromEntries(initialCriteria.map((item) => [item.code, item.errorsCount ?? 0])));
  const [teacherComment, setTeacherComment] = useState(existing?.data.teacherComment ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const directTasks = useMemo(() => blueprint.tasks.filter((task) => !writingConfigForTask(blueprint, task.number)), [blueprint]);
  const writingTasks = useMemo(() => blueprint.tasks
    .map((task) => ({ task, config: writingConfigForTask(blueprint, task.number) }))
    .filter((item): item is { task: ExamBlueprint["tasks"][number]; config: NonNullable<ReturnType<typeof writingConfigForTask>> } => Boolean(item.config)), [blueprint]);
  const allCriteria = useMemo(() => [...writingTasks.flatMap(({ config }) => config.criteria), ...(blueprint.crossTaskCriteria ?? [])], [blueprint.crossTaskCriteria, writingTasks]);
  const draftKey = `mock-draft:${teacherId}:${studentId}:${existing?.id ?? blueprintId}`;
  const [draftFound, setDraftFound] = useState(() => Boolean(localStorage.getItem(draftKey)));

  useEffect(() => {
    const handle = window.setTimeout(() => localStorage.setItem(draftKey, JSON.stringify({ title, takenDate, tasks, criteria, errors, teacherComment })), 350);
    return () => window.clearTimeout(handle);
  }, [criteria, draftKey, errors, takenDate, tasks, teacherComment, title]);

  const criteriaResults = useMemo<EvaluationCriterion[]>(() => allCriteria.map((criterion) => ({
    code: criterion.code,
    earned: criteria[criterion.code] ?? 0,
    max: criterion.max,
    errorsCount: criterion.supportsErrorCount ? errors[criterion.code] ?? 0 : null,
  })), [allCriteria, criteria, errors]);
  const input = useMemo<DetailedMockExamInput>(() => ({
    teacherId, studentId, studentProgramId, examBlueprintId: blueprintId, title, takenDate,
    taskResults: directTasks.map((task) => ({ taskNumber: task.number, earned: tasks[task.number] ?? 0, max: task.maxScore })),
    criteriaResults, expositionCriteria: [], essayCriteria: [], essayComment: null, literacyCriteria: [],
    factualAccuracy: { earned: 0, max: 0, errorsCount: null }, teacherComment: teacherComment || null,
  }), [blueprintId, criteriaResults, directTasks, studentId, studentProgramId, takenDate, tasks, teacherComment, teacherId, title]);
  const preview = useMemo(() => { try { return calculateDetailedMockExam(input, blueprint); } catch { return null; } }, [blueprint, input]);

  function restoreDraft() {
    const raw = localStorage.getItem(draftKey);
    if (!raw) return;
    const draft = JSON.parse(raw) as { title: string; takenDate: string; tasks: Record<number, number>; criteria: Record<string, number>; errors: Record<string, number>; teacherComment: string };
    setTitle(draft.title); setTakenDate(draft.takenDate); setTasks(draft.tasks); setCriteria(draft.criteria); setErrors(draft.errors); setTeacherComment(draft.teacherComment); setDraftFound(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("saving");
    try {
      const examId = existing ? await updateDetailedMockExam(getFirebaseDb(), existing.id, input) : await createDetailedMockExam(getFirebaseDb(), input);
      localStorage.removeItem(draftKey); setStatus("success"); onSaved?.(examId);
    } catch (error) { console.error(error); setStatus("error"); }
  }

  return (
    <form className="action-form detailed-mock-form responsive-form blueprint-mock-form" data-testid="detailed-mock-form" onSubmit={(event) => void submit(event)}>
      <div className="action-form__heading">
        <p className="eyebrow">{examName} · {blueprint.sourceStatus === "project" ? "проект ФИПИ" : "историческая версия"}</p>
        <h2>{existing ? "Редактирование результата" : `Результаты ${examName}`}</h2>
        <p>{blueprint.taskCount ?? blueprint.tasks.length} заданий · {blueprint.durationMinutes ?? "—"} минут · максимум {blueprintPrimaryMax(blueprint)} первичных баллов.</p>
      </div>
      {draftFound ? <div className="draft-banner"><span>Есть незавершённый пробник.</span><button className="secondary-button" onClick={restoreDraft} type="button">Продолжить</button><button className="icon-button" aria-label="Удалить черновик" onClick={() => { localStorage.removeItem(draftKey); setDraftFound(false); }} type="button">×</button></div> : null}
      <div className="form-grid">
        <label className="form-field"><span>Название</span><input onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
        <label className="form-field"><span>Дата</span><input onChange={(event) => setTakenDate(event.target.value)} required type="date" value={takenDate} /></label>
      </div>
      {blueprint.sections.map((section) => {
        const sectionTasks = directTasks.filter((task) => task.sectionCode === section.code);
        if (!sectionTasks.length) return null;
        return <details className="score-fieldset exam-score-section" key={section.code} open>
          <summary>{section.title} · {sectionTasks.length} заданий</summary>
          <div className="task-score-grid task-score-grid--compact">
            {sectionTasks.map((task) => <label className="task-score-input" key={task.number} title={task.title}>
              <span>№{task.number}</span><input aria-label={`Задание №${task.number}`} data-exam-score inputMode="numeric" max={task.maxScore} min="0" onChange={(event) => setTasks((current) => ({ ...current, [task.number]: event.target.value === "" ? 0 : Number(event.target.value) }))} onFocus={(event) => event.currentTarget.select()} onKeyDown={moveScoreFocus} step="1" type="number" value={tasks[task.number] ?? 0} /><small>/ {task.maxScore}</small>
            </label>)}
          </div>
        </details>;
      })}
      {writingTasks.map(({ task, config }) => <CriteriaSection criteria={config.criteria} errors={errors} key={task.number} onErrors={setErrors} onScores={setCriteria} scores={criteria} subtitle={`Задание №${task.number} · максимум ${task.maxScore}`} title={config.title} />)}
      {(blueprint.crossTaskCriteria?.length ?? 0) > 0 ? <CriteriaSection criteria={blueprint.crossTaskCriteria ?? []} errors={errors} onErrors={setErrors} onScores={setCriteria} scores={criteria} subtitle="Общие критерии не являются отдельным заданием" title="Грамотность и фактическая точность" /> : null}
      {blueprint.wordCountRules?.map((rule) => <p className="workflow-hint" key={rule.id}>{rule.label}</p>)}
      <label className="form-field"><span>Комментарий ученику</span><textarea onChange={(event) => setTeacherComment(event.target.value)} rows={3} value={teacherComment} /></label>
      <aside className="sticky-score-total" aria-live="polite"><span>Первичный балл</span><strong>{preview ? preview.total.earned : "—"}/{blueprintPrimaryMax(blueprint)}</strong><small>{preview?.grade ? `Оценка ${preview.grade}` : "Без неофициального перевода"}</small></aside>
      <div className="form-actions"><button className="primary-button primary-button--fit" disabled={!preview || status === "saving"}>{status === "saving" ? "Сохраняем…" : existing ? "Сохранить изменения" : "Сохранить пробник"}</button>{status === "success" ? <span className="form-success">Пробник сохранён.</span> : null}{status === "error" ? <span className="form-error">Проверьте значения. Черновик сохранён локально.</span> : null}</div>
    </form>
  );
}

function CriteriaSection({ title, subtitle, criteria, scores, errors, onScores, onErrors }: {
  title: string; subtitle: string; criteria: BlueprintCriterion[]; scores: Record<string, number>; errors: Record<string, number>;
  onScores(value: SetStateAction<Record<string, number>>): void; onErrors(value: SetStateAction<Record<string, number>>): void;
}) {
  const total = criteria.reduce((sum, item) => sum + (scores[item.code] ?? 0), 0);
  const maximum = criteria.reduce((sum, item) => sum + item.max, 0);
  return <details className="score-fieldset criteria-score-section" open>
    <summary><span>{title}<small>{subtitle}</small></span><strong>{total}/{maximum}</strong></summary>
    <div className="criteria-quick-table">
      {criteria.map((criterion) => <div className="criterion-row" key={criterion.code}>
        <strong>{criterion.code}<small> · {criterion.title}</small></strong>
        <label className="form-field"><span>Балл / {criterion.max}</span><input aria-label={`${criterion.code} балл`} data-exam-score max={criterion.max} min="0" onChange={(event) => onScores((current) => ({ ...current, [criterion.code]: Number(event.target.value) }))} onFocus={(event) => event.currentTarget.select()} onKeyDown={moveScoreFocus} type="number" value={scores[criterion.code] ?? 0} /></label>
        {criterion.supportsErrorCount ? <label className="form-field"><span>{criterion.errorLabel ?? "Ошибок"}</span><input aria-label={`${criterion.code} ошибок`} min="0" onChange={(event) => onErrors((current) => ({ ...current, [criterion.code]: Number(event.target.value) }))} type="number" value={errors[criterion.code] ?? 0} /></label> : <span />}
      </div>)}
    </div>
  </details>;
}

import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "firebase/auth";
import { getStudentProvisioningService } from "../../lib/firebase/services/studentProvisioning";
import type { DocumentWithId, ProgramProfile } from "../../lib/firebase/types";
import { russianTimezoneOptions } from "../schedule/timezoneOptions";
import { programDisplayName } from "../exams/blueprints";

export function StudentWizard({
  user,
  programs,
  onClose,
}: {
  user: User;
  programs: Array<DocumentWithId<ProgramProfile>>;
  onClose(): void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const [password, setPassword] = useState("");
  const [programProfileId, setProgramProfileId] = useState(
    () => programs[0]?.id ?? "",
  );
  const effectiveProgramProfileId = programProfileId || programs[0]?.id || "";
  const selectedProgram = programs.find(({ id }) => id === effectiveProgramProfileId)?.data;

  function validate(allSteps = false) {
    const scope = allSteps ? formRef.current : formRef.current?.querySelector(`[data-step="${step}"]`);
    const fields = scope?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
    const invalid = [...(fields ?? [])].find((field) => !field.checkValidity());
    if (!invalid) return true;
    const invalidStep = Number(invalid.closest<HTMLElement>("[data-step]")?.dataset.step ?? step);
    setStep(invalidStep);
    setStatus("Проверь выделенное поле, затем продолжи.");
    // Hidden required fields used to stop submission without a visible error.
    requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
    return false;
  }

  function nextStep() {
    if (!validate()) return;
    setStatus("");
    setStep((value) => Math.min(4, value + 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (step < 4) { nextStep(); return; }
    if (!validate(true)) return;
    const form = new FormData(event.currentTarget);
    inFlight.current = true;
    setSubmitting(true);
    setStatus("Создаём аккаунт ученика…");
    try {
      const goal = String(form.get("goal"));
      const numericGoal = Number(goal.match(/\d+/)?.[0] ?? 0) || null;
      const goalType = (selectedProgram?.examKind ?? selectedProgram?.type) === "ege" ? "test_score" : "grade";
      const result = await getStudentProvisioningService().create(user, {
        displayName: String(form.get("displayName")).trim(),
        classGrade: Number(form.get("classGrade")),
        programProfileId: effectiveProgramProfileId,
        goal,
        goalType,
        targetGrade: goalType === "grade" ? numericGoal : null,
        targetScore: goalType === "test_score" ? numericGoal : null,
        timezone: String(form.get("timezone")),
        username: String(form.get("username")).trim().toLowerCase(),
        password,
        conferenceUrl: String(form.get("conferenceUrl") ?? ""),
        scheduleWeekday: Number(form.get("scheduleWeekday")) || undefined,
        scheduleTime: String(form.get("scheduleTime") ?? ""),
        scheduleDuration: Number(form.get("scheduleDuration")) || 60,
      });
      navigate(`/teacher/students/${result.studentId}`, {
        state: { oneTimePassword: password },
      });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Не удалось создать ученика.",
      );
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="student-wizard-title"
        className="responsive-modal wizard-modal"
        role="dialog"
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Шаг {step} из 4</p>
            <h2 id="student-wizard-title">Добавить ученика</h2>
          </div>
          <button
            aria-label="Закрыть"
            className="icon-button"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <form ref={formRef} noValidate onSubmit={(event) => void submit(event)}>
          <div
            data-step="1"
            className={
              step === 1 ? "wizard-step" : "wizard-step wizard-step--hidden"
            }
          >
            <label className="form-field">
              <span>Имя</span>
              <input name="displayName" required />
            </label>
            <label className="form-field">
              <span>Класс</span>
              <input
                max="11"
                min="1"
                name="classGrade"
                required
                type="number"
              />
            </label>
          </div>
          <div
            data-step="2"
            className={
              step === 2 ? "wizard-step" : "wizard-step wizard-step--hidden"
            }
          >
            <label className="form-field">
              <span>Программа</span>
              <select
                name="programProfileId"
                onChange={(event) => setProgramProfileId(event.target.value)}
                required
                value={effectiveProgramProfileId}
              >
                {programs.map(({ id, data }) => (
                  <option key={id} value={id}>
                    {programDisplayName(data)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Цель</span>
              <input
                name="goal"
                placeholder={(selectedProgram?.examKind ?? selectedProgram?.type) === "ege" ? "Например, 80+ баллов" : "Например, ОГЭ на 4"}
                required
              />
            </label>
            <label className="form-field">
              <span>Часовой пояс</span>
              <select defaultValue="Europe/Moscow" name="timezone">
                {russianTimezoneOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            data-step="3"
            className={
              step === 3 ? "wizard-step" : "wizard-step wizard-step--hidden"
            }
          >
            <label className="form-field">
              <span>Логин</span>
              <input name="username" aria-describedby="student-username-help" pattern="[a-zA-Z0-9._\-]+" title="Латинские буквы, цифры, точка, дефис или подчёркивание" autoCapitalize="none" autoCorrect="off" required />
            </label>
            <small id="student-username-help">Латинские буквы, цифры, точка, дефис или подчёркивание.</small>
            <label className="form-field">
              <span>Пароль</span>
              <input
                autoComplete="new-password"
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Введите пароль для ученика"
                required
                type="text"
                value={password}
              />
            </label>
            <label className="form-field">
              <span>Ссылка на конференцию · необязательно</span>
              <input name="conferenceUrl" type="url" />
            </label>
          </div>
          <div
            data-step="4"
            className={
              step === 4 ? "wizard-step" : "wizard-step wizard-step--hidden"
            }
          >
            <p>Постоянное расписание можно пропустить и добавить позже.</p>
            <label className="form-field">
              <span>День недели</span>
              <select defaultValue="" name="scheduleWeekday">
                <option value="">Добавить позже</option>
                <option value="1">Понедельник</option>
                <option value="2">Вторник</option>
                <option value="3">Среда</option>
                <option value="4">Четверг</option>
                <option value="5">Пятница</option>
                <option value="6">Суббота</option>
                <option value="7">Воскресенье</option>
              </select>
            </label>
            <label className="form-field">
              <span>Время, МСК</span>
              <input name="scheduleTime" type="time" />
            </label>
            <label className="form-field">
              <span>Длительность</span>
              <select defaultValue="60" name="scheduleDuration">
                <option value="45">45 минут</option>
                <option value="60">60 минут</option>
                <option value="90">90 минут</option>
              </select>
            </label>
          </div>
          <div className="wizard-actions">
            {step > 1 ? (
              <button
                className="secondary-button"
                disabled={submitting}
                onClick={() => setStep((value) => value - 1)}
                type="button"
              >
                Назад
              </button>
            ) : (
              <span />
            )}
            {step < 4 ? (
              <button
                className="primary-button primary-button--fit"
                onClick={nextStep}
                type="button"
              >
                Далее
              </button>
            ) : (
              <button
                className="primary-button primary-button--fit"
                disabled={submitting}
                type="submit"
              >
                {submitting ? "Создаём…" : "Создать ученика"}
              </button>
            )}
          </div>
          {status ? (
            <p className="form-message" role="status">
              {status}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { DetailedMockExamForm } from "../features/analytics/DetailedMockExamForm";
import { Avatar } from "../features/avatar/Avatar";
import { useAuth } from "../features/auth/AuthProvider";
import { programDisplayName } from "../features/exams/blueprints";
import { useProgramProfiles } from "../features/materials/hooks";
import { LessonJournal } from "../features/schedule/LessonJournal";
import { formatDateTimeForTimezone, resolveTimezone } from "../features/schedule/timezone";
import { russianTimezoneOptions, timezoneOffsetMinutes } from "../features/schedule/timezoneOptions";
import { useLessonTeacherNotes } from "../features/schedule/useLessonTeacherNotes";
import { CreateHomeworkForm } from "../features/vertical-slice/CreateHomeworkForm";
import { useTeacherStudentWorkspace } from "../features/vertical-slice/hooks";
import {
  formatHomeworkDueDate,
  selectCurrentHomework,
  selectLatestMockExam,
  selectNearestLesson,
} from "../features/vertical-slice/selectors";
import { getFirebaseDb, isProductionBackendAvailable, isUsingFirebaseEmulators } from "../lib/firebase/client";
import { getStudentProvisioningService } from "../lib/firebase/services/studentProvisioning";
import {
  setStudentArchived,
  switchStudentProgram,
  updateStudentConferenceLinks,
  updateStudentProfile,
  updateStudentProgramGoal,
  updateStudentTimezone,
} from "../lib/firebase/services/studentManagement";
import type { Student } from "../lib/firebase/types";
import { isDemoProfile } from "../features/demo/demoMode";

type Tab = "overview" | "lessons" | "homework" | "mocks" | "payment";
const tabs: Array<[Tab, string]> = [
  ["overview", "Обзор"],
  ["lessons", "Занятия"],
  ["homework", "Домашние задания"],
  ["mocks", "Пробники"],
  ["payment", "Оплата"],
];
type ConferenceLink = NonNullable<Student["conferenceLinks"]>[number];

export function TeacherStudentPage() {
  const { studentId = "" } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  const tab = (
    tabs.some(([value]) => value === params.get("tab"))
      ? params.get("tab")
      : "overview"
  ) as Tab;
  const { user, profile } = useAuth();
  const demoMode = isDemoProfile(profile);
  const provisioningAvailable = !demoMode && (isUsingFirebaseEmulators() || isProductionBackendAvailable());
  const [editing, setEditing] = useState(false);
  const [credentialPassword, setCredentialPassword] = useState(
    () =>
      (location.state as { oneTimePassword?: string } | null)
        ?.oneTimePassword ?? "",
  );
  const [notice, setNotice] = useState("");
  const { data, loading, error } = useTeacherStudentWorkspace(
    user?.uid ?? "",
    studentId,
  );
  const programProfiles = useProgramProfiles();
  const lessonNotes = useLessonTeacherNotes(user?.uid ?? "", studentId);
  if (loading && !data.student)
    return (
      <main className="shell-content content-state">Загружаем карточку…</main>
    );
  if (error || !data.student)
    return (
      <main className="shell-content">
        <Link className="back-link" to="/teacher/students">
          ← К ученикам
        </Link>
        <p className="shell-notice" role="alert">
          {error ?? "Ученик не найден или недоступен."}
        </p>
      </main>
    );
  const student = data.student.data;
  const nearestLesson = selectNearestLesson(data.lessons);
  const currentHomework = selectCurrentHomework(data.homeworks);
  const latestMock = selectLatestMockExam(data.mockExams);
  const paidRemaining = data.lessons.filter(
    ({ data: lesson }) =>
      lesson.status === "planned" && lesson.paymentStatus === "paid",
  ).length;
  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = new FormData(event.currentTarget);
    const primary =
      student.conferenceLinks?.find((item) => item.isDefault)?.joinUrl ??
      student.defaultConference.joinUrl;
    const secondary =
      student.conferenceLinks?.find((item) => !item.isDefault)?.joinUrl ?? null;
    await updateStudentProfile(getFirebaseDb(), {
      teacherId: user.uid,
      studentId,
      displayName: String(form.get("displayName")),
      classGrade: Number(form.get("classGrade")) || null,
      avatarKey: student.avatarKey ?? "",
      conferenceUrl: primary,
      secondaryConferenceUrl: secondary,
    });
    const timezoneIana = String(form.get("timezone") || "Europe/Moscow");
    await updateStudentTimezone(getFirebaseDb(), {
      teacherId: user.uid,
      studentId,
      iana: timezoneIana,
      moscowOffsetMinutes: timezoneOffsetMinutes(timezoneIana),
    });
    const programProfileId = String(
      form.get("programProfileId") ?? data.studentProgram?.data.programProfileId ?? "",
    );
    const programGoal = String(
      form.get("programGoal") ?? data.studentProgram?.data.goal.displayText ?? "",
    ).trim();
    if (
      data.studentProgram &&
      programProfileId &&
      programProfileId !== data.studentProgram.data.programProfileId
    ) {
      const selectedProfile = programProfiles.data.find(({ id }) => id === programProfileId);
      if (!selectedProfile) throw new Error("Выбранная программа не найдена");
      const numericGoal = Number(programGoal.match(/\d+/)?.[0] ?? 0) || null;
      const examKind = selectedProfile.data.examKind ?? selectedProfile.data.type;
      await switchStudentProgram(getFirebaseDb(), {
        teacherId: user.uid,
        studentId,
        programProfileId,
        goal: {
          type: examKind === "ege" ? "test_score" : "grade",
          targetGrade: examKind === "ege" ? null : numericGoal,
          targetScore: examKind === "ege" ? numericGoal : null,
          displayText: programGoal,
        },
      });
    } else if (data.studentProgram) {
      await updateStudentProgramGoal(getFirebaseDb(), {
        teacherId: user.uid,
        studentId,
        studentProgramId: data.studentProgram.id,
        displayText: programGoal,
      });
    }
    setEditing(false);
    setNotice("Карточка обновлена.");
  }
  async function updateCredentials(username: string, password: string) {
    if (!user) return;
    if (!provisioningAvailable) {
      setNotice(
        demoMode
          ? "В демо-режиме изменение данных входа отключено."
          : "Изменение данных входа временно недоступно: требуется защищённый серверный provisioning.",
      );
      return;
    }
    await getStudentProvisioningService().updateCredentials(
      user,
      studentId,
      { username, ...(password ? { password } : {}) },
    );
    setCredentialPassword(password);
    setNotice(
      password
        ? "Логин и новый пароль сохранены. Скопируйте пароль: после обновления страницы он больше не показывается."
        : "Логин сохранён.",
    );
  }
  return (
    <main className="shell-content" aria-labelledby="student-profile-title">
      <Link className="back-link" to="/teacher/students">
        ← К ученикам
      </Link>
      <section className="student-profile-heading">
        <Avatar
          avatarKey={student.avatarKey}
          label={student.displayName}
          size="large"
        />
        <div>
          <p className="eyebrow">Карточка ученика</p>
          <h1 id="student-profile-title">{student.displayName}</h1>
          <p>
            {student.classGrade
              ? `${student.classGrade} класс`
              : "Класс не указан"}
          </p>
          <p>
            Часовой пояс: {russianTimezoneOptions.find(([value]) => value === data.studentUser?.data.timezone.iana)?.[1]
              ?? data.studentUser?.data.timezone.iana
              ?? "не указан"}
          </p>
        </div>
        <div className="student-profile-actions">
          <Link
            className="primary-button"
            to={`/teacher/students/${studentId}?tab=homework`}
          >
            + Выдать ДЗ
          </Link>
          <Link
            className="secondary-button"
            to={`/teacher/students/${studentId}/preview`}
          >
            Посмотреть как ученик
          </Link>
          <button
            className="secondary-button"
            onClick={() => setEditing((value) => !value)}
            type="button"
          >
            Редактировать
          </button>
          <button
            className="secondary-button secondary-button--danger"
            onClick={() =>
              user &&
              void setStudentArchived(getFirebaseDb(), {
                teacherId: user.uid,
                studentId,
                archived: student.status !== "archived",
              })
            }
            type="button"
          >
            {student.status === "archived" ? "Восстановить" : "Архивировать"}
          </button>
        </div>
      </section>
      <nav className="student-card-tabs" aria-label="Разделы карточки ученика">
        {tabs.map(([value, label]) => (
          <Link
            aria-current={tab === value ? "page" : undefined}
            key={value}
            to={`/teacher/students/${studentId}?tab=${value}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {notice ? (
        <p className="form-success" role="status">
          {notice}
        </p>
      ) : null}
      {editing ? (
        <form
          className="compact-edit-form"
          onSubmit={(event) => void saveStudent(event)}
        >
          <label className="form-field">
            <span>Имя</span>
            <input
              defaultValue={student.displayName}
              name="displayName"
              required
            />
          </label>
          <label className="form-field">
            <span>Класс</span>
            <input
              defaultValue={student.classGrade ?? ""}
              name="classGrade"
              type="number"
            />
          </label>
          <label className="form-field">
            <span>Часовой пояс ученика</span>
            <select
              defaultValue={data.studentUser?.data.timezone.iana ?? "Europe/Moscow"}
              name="timezone"
            >
              {russianTimezoneOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {data.studentProgram ? (
            <>
              <label className="form-field">
                <span>Программа подготовки</span>
                <select
                  defaultValue={data.studentProgram.data.programProfileId}
                  name="programProfileId"
                  required
                >
                  {programProfiles.data
                    .filter(({ data: item }) => item.status === "active")
                    .map(({ id, data: item }) => (
                      <option key={id} value={id}>{programDisplayName(item)}</option>
                    ))}
                </select>
              </label>
              <label className="form-field">
                <span>Цель занятий по программе</span>
                <input
                  defaultValue={data.studentProgram.data.goal.displayText}
                  name="programGoal"
                  required
                />
              </label>
            </>
          ) : null}
          <button className="primary-button primary-button--fit">
            Сохранить
          </button>
        </form>
      ) : null}
      {tab === "overview" ? (
        <>
          <section className="summary-grid">
            <article className="summary-card">
              <span className="summary-card__label">Программа</span>
              <strong data-testid="teacher-program-title">
                {data.programProfile?.data.title ?? "Не назначена"}
              </strong>
              <p>
                {data.studentProgram?.data.goal.displayText ?? "Цель не задана"}
              </p>
            </article>
            <article className="summary-card">
              <span className="summary-card__label">Ближайшее занятие</span>
              <strong>
                {nearestLesson
                  ? formatDateTimeForTimezone(nearestLesson.data.startAt.toDate(), resolveTimezone(profile?.timezone))
                  : "Не запланировано"}
              </strong>
              <p>{nearestLesson?.data.topic ?? "Тема пока не указана"}</p>
            </article>
            <article className="summary-card">
              <span className="summary-card__label">Актуальное ДЗ</span>
              <strong>
                {currentHomework?.data.title ?? "Нет активного ДЗ"}
              </strong>
              <p>
                Срок:{" "}
                {currentHomework
                  ? formatHomeworkDueDate(currentHomework.data)
                  : "—"}
              </p>
            </article>
            <article className="summary-card">
              <span className="summary-card__label">Последний пробник</span>
              <strong>{latestMock?.data.title ?? "Пока нет пробников"}</strong>
              <p>
                {latestMock
                  ? `${latestMock.data.total.earned}/${latestMock.data.total.max}${latestMock.data.grade ? ` · оценка ${latestMock.data.grade}` : ""}`
                  : "—"}
              </p>
            </article>
            <article className={`summary-card${paidRemaining <= 1 ? " summary-card--warning" : ""}`}>
              <span className="summary-card__label">Оплата</span>
              <strong>{paidRemaining} оплаченных занятий</strong>
              <p>Подробности и изменения — во вкладке «Оплата».</p>
            </article>
          </section>
          <ConferenceLinksEditor
            links={student.conferenceLinks ?? []}
            onNotice={setNotice}
            studentId={studentId}
            teacherId={user?.uid ?? ""}
          />
          <Credentials
            key={studentId}
            provisioningAvailable={provisioningAvailable}
            password={credentialPassword}
            username={data.studentUser?.data.username ?? ""}
            onSave={updateCredentials}
          />
          <section className="student-overview-actions" aria-label="Быстрые действия">
            <Link className="primary-button primary-button--fit" to={`/teacher/students/${studentId}?tab=homework`}>
              + Выдать ДЗ
            </Link>
            <Link className="secondary-button" to={`/teacher/students/${studentId}?tab=mocks`}>
              + Добавить пробник
            </Link>
            <Link className="secondary-button" to={`/teacher/students/${studentId}?tab=lessons`}>
              Открыть журнал
            </Link>
          </section>
        </>
      ) : null}
      {tab === "lessons" ? (
        <LessonJournal
          audience="teacher"
          homeworks={data.homeworks}
          initialLessonId={params.get("lesson")}
          lessons={data.lessons}
          notes={lessonNotes}
          teacherId={user?.uid ?? ""}
          taskNumbers={data.examBlueprint?.data.tasks.map((item) => item.number)}
          timezone={profile?.timezone}
        />
      ) : null}
      {tab === "homework" && data.studentProgram ? (
        <CreateHomeworkForm
          studentId={studentId}
          studentProgramId={data.studentProgram.id}
          teacherId={user?.uid ?? ""}
          sourceLesson={data.lessons.find(({ id }) => id === params.get("sourceLesson"))}
        />
      ) : null}
      {tab === "mocks" && data.studentProgram ? (
        data.examBlueprint ? (
          <DetailedMockExamForm
            blueprint={data.examBlueprint.data}
            blueprintId={data.examBlueprint.id}
            studentId={studentId}
            studentProgramId={data.studentProgram.id}
            teacherId={user?.uid ?? ""}
          />
        ) : (
          <p className="content-state">
            Для пробника нужен exam blueprint программы.
          </p>
        )
      ) : null}
      {tab === "payment" ? (
        <section
          className={`summary-card${paidRemaining <= 1 ? " summary-card--warning" : ""}`}
        >
          <span className="summary-card__label">Оплаченные занятия</span>
          <strong>{paidRemaining} осталось</strong>
          <p>Изменить оплату и отдельные статусы можно в календаре.</p>
          <Link
            className="primary-button primary-button--fit"
            to={`/teacher/calendar?student=${studentId}`}
          >
            Открыть оплату в календаре
          </Link>
        </section>
      ) : null}
    </main>
  );
}

function Credentials({
  username,
  password,
  onSave,
  provisioningAvailable,
}: {
  username: string;
  password: string;
  onSave(username: string, password: string): Promise<void>;
  provisioningAvailable: boolean;
}) {
  const [draftUsername, setDraftUsername] = useState(username);
  const [draftPassword, setDraftPassword] = useState(password);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(draftUsername.trim().toLowerCase(), draftPassword);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить данные для входа.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(
      `${draftUsername}${draftPassword ? `\n${draftPassword}` : ""}`,
    );
  }
  return (
    <section className="credentials-card">
      <div>
        <span className="summary-card__label">Безопасный доступ</span>
        <h2>Данные для входа</h2>
        <p>Логин виден всегда. Новый пароль показывается только до обновления страницы и не хранится в Firestore.</p>
      </div>
      <form className="credentials-form" onSubmit={(event) => void submit(event)}>
        <label className="form-field">
          <span>Логин</span>
          <input
            autoComplete="username"
            disabled={!provisioningAvailable || saving}
            onChange={(event) => setDraftUsername(event.target.value)}
            pattern="[a-z0-9._-]+"
            required
            value={draftUsername}
          />
        </label>
        <label className="form-field">
          <span>Новый пароль · оставьте пустым, если менять не нужно</span>
          <input
            autoComplete="new-password"
            disabled={!provisioningAvailable || saving}
            minLength={6}
            onChange={(event) => setDraftPassword(event.target.value)}
            placeholder="Введите новый пароль"
            type="text"
            value={draftPassword}
          />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-actions">
          <button
            className="primary-button primary-button--fit"
            disabled={!provisioningAvailable || saving}
            type="submit"
          >
            {saving ? "Сохраняем…" : "Сохранить данные входа"}
          </button>
        <button
          className="secondary-button"
          onClick={() => void navigator.clipboard.writeText(draftUsername)}
          type="button"
        >
          Копировать логин
        </button>
        <button
          className="secondary-button"
          disabled={!draftPassword}
          onClick={() => void copy()}
          type="button"
        >
          Скопировать данные для входа
        </button>
        </div>
      </form>
      {!provisioningAvailable ? (
        <p className="workflow-hint">
          Создание аккаунтов и изменение данных входа временно недоступны в публичной
          версии.
        </p>
      ) : null}
    </section>
  );
}

function ConferenceLinksEditor({
  links,
  teacherId,
  studentId,
  onNotice,
}: {
  links: ConferenceLink[];
  teacherId: string;
  studentId: string;
  onNotice(value: string): void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ConferenceLink[]>(links);
  function patch(id: string, value: Partial<ConferenceLink>) {
    setDraft((current) =>
      current.map((item) => (item.id === id ? { ...item, ...value } : item)),
    );
  }
  async function save() {
    await updateStudentConferenceLinks(getFirebaseDb(), {
      teacherId,
      studentId,
      links: draft,
    });
    setEditing(false);
    onNotice("Ссылки на занятия сохранены.");
  }
  return (
    <section className="summary-card conference-links-card">
      <div className="panel-heading">
        <div>
          <span className="summary-card__label">Постоянные ссылки</span>
          <h2>Подключение к занятиям</h2>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            if (!editing) setDraft(links);
            setEditing((value) => !value);
          }}
          type="button"
        >
          {editing ? "Отмена" : "Изменить"}
        </button>
      </div>
      {editing ? (
        <div className="conference-link-list">
          {draft.map((item) => (
            <div className="conference-link-row" key={item.id}>
              <label className="form-field">
                <span>Название</span>
                <input
                  onChange={(event) =>
                    patch(item.id, { label: event.target.value })
                  }
                  value={item.label}
                />
              </label>
              <label className="form-field">
                <span>Ссылка</span>
                <input
                  onChange={(event) =>
                    patch(item.id, { joinUrl: event.target.value })
                  }
                  type="url"
                  value={item.joinUrl}
                />
              </label>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  disabled={item.isDefault}
                  onClick={() =>
                    setDraft((current) =>
                      current.map((value) => ({
                        ...value,
                        isDefault: value.id === item.id,
                      })),
                    )
                  }
                  type="button"
                >
                  Сделать основной
                </button>
                <button
                  className="secondary-button secondary-button--danger"
                  onClick={() =>
                    setDraft((current) =>
                      current.filter((value) => value.id !== item.id),
                    )
                  }
                  type="button"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
          <div className="form-actions">
            <button
              className="secondary-button"
              onClick={() =>
                setDraft((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    label: "Новая ссылка",
                    provider: "other",
                    joinUrl: "",
                    isDefault: !current.length,
                  },
                ])
              }
              type="button"
            >
              + Добавить ссылку
            </button>
            <button
              className="primary-button primary-button--fit"
              onClick={() => void save()}
              type="button"
            >
              Сохранить ссылки
            </button>
          </div>
        </div>
      ) : (
        <div className="conference-link-list">
          {links.length ? (
            links.map((item) => (
              <div className="conference-link-row" key={item.id}>
                <strong>
                  {item.label}
                  {item.isDefault ? " · основная" : ""}
                </strong>
                <span>{item.joinUrl}</span>
                <div className="form-actions">
                  <a
                    className="secondary-button"
                    href={item.joinUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Открыть
                  </a>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void navigator.clipboard.writeText(item.joinUrl)
                    }
                    type="button"
                  >
                    Копировать
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="content-state">
              Постоянная ссылка пока не добавлена.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

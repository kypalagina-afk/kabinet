import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../features/auth/AuthProvider";
import { Avatar } from "../features/avatar/Avatar";
import { useProgramProfiles } from "../features/materials/hooks";
import { StudentWizard } from "../features/students/StudentWizard";
import { getFirebaseDb, isProductionBackendAvailable, isUsingFirebaseEmulators } from "../lib/firebase/client";
import { pairExistingStudents } from "../lib/firebase/services/studentPairing";
import { useTeacherStudentPrograms, useTeacherStudents } from "../features/vertical-slice/hooks";
import { isDemoProfile } from "../features/demo/demoMode";

export function TeacherStudentsPage() {
  const { user, profile } = useAuth();
  const students = useTeacherStudents(user?.uid ?? "");
  const programs = useTeacherStudentPrograms(user?.uid ?? "");
  const profiles = useProgramProfiles();
  const [wizard, setWizard] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairFirstId, setPairFirstId] = useState("");
  const [pairSecondId, setPairSecondId] = useState("");
  const [pairScheduleSourceId, setPairScheduleSourceId] = useState("");
  const [pairStatus, setPairStatus] = useState<"idle" | "saving" | "error">("idle");
  const [pairMessage, setPairMessage] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [classGrade, setClassGrade] = useState("");
  const [programId, setProgramId] = useState("");
  const demoMode = isDemoProfile(profile);
  const provisioningAvailable = !demoMode && (isUsingFirebaseEmulators() || isProductionBackendAvailable());
  const availableForPair = students.data.filter(
    ({ data }) => data.status === "active" && !data.pairId,
  );
  async function createPair() {
    if (!user || !pairFirstId || !pairSecondId || !pairScheduleSourceId) return;
    setPairStatus("saving");
    setPairMessage("");
    try {
      const result = await pairExistingStudents(getFirebaseDb(), {
        teacherId: user.uid,
        firstStudentId: pairFirstId,
        secondStudentId: pairSecondId,
        scheduleSourceStudentId: pairScheduleSourceId,
      });
      setPairMessage(`Пара создана. Объединено будущих занятий: ${result.pairedLessonCount}.`);
      setPairStatus("idle");
      setPairOpen(false);
      setPairFirstId("");
      setPairSecondId("");
      setPairScheduleSourceId("");
    } catch (error) {
      setPairStatus("error");
      setPairMessage(error instanceof Error ? error.message : "Не удалось создать пару.");
    }
  }
  const visible = useMemo(() => students.data.filter(({ id, data }) => {
    const assigned = programs.data.find((item) => item.data.studentId === id && item.data.status === "active");
    return data.displayName.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))
      && (!status || data.status === status)
      && (!classGrade || String(data.classGrade) === classGrade)
      && (!programId || assigned?.data.programProfileId === programId);
  }), [classGrade, programId, programs.data, search, status, students.data]);

  return <main className="shell-content" aria-labelledby="teacher-students-title">
    <header className="page-heading page-heading--split"><div><p className="eyebrow">Ученики</p><h1 id="teacher-students-title">Мои ученики</h1><p>Программы, цели и текущие задачи в одном месте.</p></div><div className="form-actions"><button className="secondary-button" disabled={availableForPair.length < 2} onClick={() => { setPairStatus("idle"); setPairMessage(""); setPairOpen(true); }} type="button">Объединить в пару</button><button className="primary-button primary-button--fit" disabled={!provisioningAvailable} onClick={() => setWizard(true)} title={provisioningAvailable ? undefined : "Создание аккаунтов временно недоступно в публичной версии"} type="button">+ Добавить ученика</button></div></header>
    {pairMessage && !pairOpen ? <p className="form-success" role="status">{pairMessage}</p> : null}
    {!provisioningAvailable ? <p className="shell-notice">{demoMode ? "В демо-режиме создание новых аккаунтов отключено." : "Создание новых аккаунтов временно недоступно в публичной версии. Для него требуется защищённый серверный provisioning."}</p> : null}
    <section className="filter-bar" aria-label="Фильтры учеников">
      <label><span>Поиск</span><input aria-label="Поиск ученика" onChange={(event) => setSearch(event.target.value)} placeholder="Имя ученика" type="search" value={search} /></label>
      <label><span>Программа</span><select onChange={(event) => setProgramId(event.target.value)} value={programId}><option value="">Все</option>{profiles.data.map(({ id, data }) => <option key={id} value={id}>{data.title}</option>)}</select></label>
      <label><span>Класс</span><select onChange={(event) => setClassGrade(event.target.value)} value={classGrade}><option value="">Все</option>{Array.from({ length: 11 }, (_, index) => index + 1).map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select></label>
      <label><span>Статус</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="active">Активные</option><option value="archived">Архив</option><option value="">Все</option></select></label>
    </section>
    {students.loading ? <p className="content-state">Загружаем учеников…</p> : null}
    {students.error ? <p className="shell-notice">{students.error}</p> : null}
    <section className="student-card-grid">{visible.map(({ id, data: student }) => {
      const assigned = programs.data.find((item) => item.data.studentId === id && item.data.status === "active");
      const profile = profiles.data.find((item) => item.id === assigned?.data.programProfileId);
      const partner = student.pairedStudentId
        ? students.data.find(({ id: candidateId }) => candidateId === student.pairedStudentId)
        : null;
      return <Link className="student-card" data-testid="student-card" key={id} to={`/teacher/students/${id}`}><Avatar avatarKey={student.avatarKey} label={student.displayName} /><span className="student-card__body"><strong>{student.displayName}</strong><span>{student.classGrade ? `${student.classGrade} класс` : "Класс не указан"}</span><small>{profile?.data.title ?? "Программа не назначена"}</small>{partner ? <small className="student-pair-label">Пара с {partner.data.displayName}</small> : null}</span><span className={`status-chip ${student.status === "archived" ? "status-chip--muted" : ""}`}>{student.status === "active" ? "Активен" : student.status === "archived" ? "В архиве" : "На паузе"}</span><span className="student-card__arrow">→</span></Link>;
    })}</section>
    {!students.loading && visible.length === 0 ? <p className="content-state">По выбранным фильтрам учеников нет.</p> : null}
    {wizard && user && provisioningAvailable ? <StudentWizard onClose={() => setWizard(false)} programs={profiles.data.filter(({ data }) => data.status === "active")} user={user} /> : null}
    {pairOpen ? <Modal onClose={() => setPairOpen(false)} title="Объединить учеников в пару"><div className="modal-form"><p className="workflow-hint">Прошедшие уроки сохранятся. Будущее расписание второго ученика заменится общим парным расписанием. Для пары у учеников должна быть выбрана одинаковая программа.</p><label className="form-field"><span>Первый ученик</span><select onChange={(event) => { setPairFirstId(event.target.value); setPairScheduleSourceId(event.target.value); }} value={pairFirstId}><option value="">Выберите ученика</option>{availableForPair.map(({ id, data }) => <option disabled={id === pairSecondId} key={id} value={id}>{data.displayName}</option>)}</select></label><label className="form-field"><span>Второй ученик</span><select onChange={(event) => setPairSecondId(event.target.value)} value={pairSecondId}><option value="">Выберите ученика</option>{availableForPair.map(({ id, data }) => <option disabled={id === pairFirstId} key={id} value={id}>{data.displayName}</option>)}</select></label>{pairFirstId && pairSecondId ? <label className="form-field"><span>Чьё будущее расписание взять за основу</span><select onChange={(event) => setPairScheduleSourceId(event.target.value)} value={pairScheduleSourceId}><option value={pairFirstId}>{students.data.find(({ id }) => id === pairFirstId)?.data.displayName}</option><option value={pairSecondId}>{students.data.find(({ id }) => id === pairSecondId)?.data.displayName}</option></select></label> : null}{pairStatus === "error" ? <p className="form-error" role="alert">{pairMessage}</p> : null}<div className="form-actions"><button className="primary-button primary-button--fit" disabled={!pairFirstId || !pairSecondId || pairStatus === "saving"} onClick={() => void createPair()} type="button">{pairStatus === "saving" ? "Объединяем…" : "Создать постоянную пару"}</button><button className="secondary-button" onClick={() => setPairOpen(false)} type="button">Отмена</button></div></div></Modal> : null}
  </main>;
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { Avatar } from "../features/avatar/Avatar";
import { useProgramProfiles } from "../features/materials/hooks";
import { StudentWizard } from "../features/students/StudentWizard";
import { isUsingFirebaseEmulators } from "../lib/firebase/client";
import { useTeacherStudentPrograms, useTeacherStudents } from "../features/vertical-slice/hooks";

export function TeacherStudentsPage() {
  const { user } = useAuth();
  const students = useTeacherStudents(user?.uid ?? "");
  const programs = useTeacherStudentPrograms(user?.uid ?? "");
  const profiles = useProgramProfiles();
  const [wizard, setWizard] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [classGrade, setClassGrade] = useState("");
  const [programId, setProgramId] = useState("");
  const provisioningAvailable = isUsingFirebaseEmulators();
  const visible = useMemo(() => students.data.filter(({ id, data }) => {
    const assigned = programs.data.find((item) => item.data.studentId === id && item.data.status === "active");
    return data.displayName.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))
      && (!status || data.status === status)
      && (!classGrade || String(data.classGrade) === classGrade)
      && (!programId || assigned?.data.programProfileId === programId);
  }), [classGrade, programId, programs.data, search, status, students.data]);

  return <main className="shell-content" aria-labelledby="teacher-students-title">
    <header className="page-heading page-heading--split"><div><p className="eyebrow">Ученики</p><h1 id="teacher-students-title">Мои ученики</h1><p>Программы, цели и текущие задачи в одном месте.</p></div><button className="primary-button primary-button--fit" disabled={!provisioningAvailable} onClick={() => setWizard(true)} title={provisioningAvailable ? undefined : "Создание аккаунтов временно недоступно в публичной версии"} type="button">+ Добавить ученика</button></header>
    {!provisioningAvailable ? <p className="shell-notice">Создание новых аккаунтов временно недоступно в публичной версии. Для него требуется защищённый серверный provisioning.</p> : null}
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
      return <Link className="student-card" data-testid="student-card" key={id} to={`/teacher/students/${id}`}><Avatar avatarKey={student.avatarKey} label={student.displayName} /><span className="student-card__body"><strong>{student.displayName}</strong><span>{student.classGrade ? `${student.classGrade} класс` : "Класс не указан"}</span><small>{profile?.data.title ?? "Программа не назначена"}</small></span><span className={`status-chip ${student.status === "archived" ? "status-chip--muted" : ""}`}>{student.status === "active" ? "Активен" : student.status === "archived" ? "В архиве" : "На паузе"}</span><span className="student-card__arrow">→</span></Link>;
    })}</section>
    {!students.loading && visible.length === 0 ? <p className="content-state">По выбранным фильтрам учеников нет.</p> : null}
    {wizard && user && provisioningAvailable ? <StudentWizard onClose={() => setWizard(false)} programs={profiles.data.filter(({ data }) => data.status === "active")} user={user} /> : null}
  </main>;
}

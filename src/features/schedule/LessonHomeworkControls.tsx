import { useState } from "react";
import { Link } from "react-router-dom";
import { getFirebaseDb } from "../../lib/firebase/client";
import { updateLessonHomeworkAssignment } from "../../lib/firebase/services/lessonHomeworkAssignment";
import type { DocumentWithId, Homework, Lesson } from "../../lib/firebase/types";

export function LessonHomeworkControls({ lesson, studentName, teacherId, homeworks, loading, error }: {
  lesson: DocumentWithId<Lesson>; studentName: string; teacherId: string;
  homeworks: Array<DocumentWithId<Homework>>; loading: boolean; error: string | null;
}) {
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const eligible = homeworks.filter(({ data }) => data.teacherId === teacherId && data.studentId === lesson.data.studentId && data.studentProgramId === lesson.data.studentProgramId && !data.draft);
  const linked = eligible.filter(({ data }) => data.sourceLessonId === lesson.id);
  const candidates = eligible.filter(({ data }) => !data.sourceLessonId || data.sourceLessonId === lesson.id);
  const status = linked.length ? "ДЗ выдано на платформе" : lesson.data.homeworkResolution === "not_required" ? "ДЗ не требуется"
    : lesson.data.homeworkResolution === "assigned" ? lesson.data.homeworkAssignedExternally ? "ДЗ выдано вне платформы" : "ДЗ отмечено выданным" : "Выдача ДЗ не отмечена";
  async function save(mode: Parameters<typeof updateLessonHomeworkAssignment>[1]["mode"], homeworkId?: string) {
    setSaving(true); setFailed(false); setMessage("");
    try {
      await updateLessonHomeworkAssignment(getFirebaseDb(), { teacherId, lessonId: lesson.id, mode, homeworkId });
      setMessage(mode === "unlink" ? "Связь снята. Само ДЗ, ответы и оценки сохранены." : "Отметка ДЗ сохранена.");
    } catch (error) {
      setFailed(true); setMessage(error instanceof Error ? error.message : "Не удалось сохранить отметку ДЗ.");
    } finally { setSaving(false); }
  }
  if (lesson.data.status !== "completed") return null;
  return <section className="lesson-homework-controls" aria-label={`Домашнее задание — ${studentName}`}>
    <strong>ДЗ · {studentName}</strong>
    <p>{status}</p>
    <p className="workflow-hint">Если ДЗ уже выдано, выберите его ниже или отметьте выдачу вне платформы. Заново создавать задание не нужно.</p>
    {loading ? <p role="status">Загружаем ДЗ…</p> : error ? <p className="form-error" role="alert">{error}</p> : <>
      {linked.map((homework) => <div className="lesson-homework-linked" key={homework.id}>
        <Link to={`/teacher/homeworks?homework=${homework.id}`}>{homework.data.title}</Link>
        {lesson.data.homeworkResolution !== "assigned" ? <button className="secondary-button" disabled={saving} onClick={() => void save("link", homework.id)} type="button">Подтвердить выдачу</button> : null}
        <button className="planner-link-button" disabled={saving} onClick={() => { if (window.confirm("Снять связь этого ДЗ с уроком? Само задание, ответы и оценки останутся.")) void save("unlink", homework.id); }} type="button">Снять связь</button>
      </div>)}
      {!linked.length ? <>
        <label className="form-field"><span>Связать с уже выданным ДЗ</span>
          <select value={selected} disabled={saving} onChange={(event) => setSelected(event.target.value)}>
            <option value="">Выберите ДЗ</option>
            {candidates.map(({ id, data }) => <option key={id} value={id}>{data.title} · {data.assignedAt.toDate().toLocaleDateString("ru-RU")}</option>)}
          </select>
        </label>
        <button className="secondary-button" disabled={saving || !selected} onClick={() => void save("link", selected)} type="button">Связать с уроком</button>
        <div className="lesson-homework-actions">
          <button className="secondary-button" disabled={saving} onClick={() => void save("external")} type="button">Уже выдано вне платформы</button>
          <button className="secondary-button" disabled={saving} onClick={() => void save("not_required")} type="button">ДЗ не требуется</button>
          {lesson.data.homeworkResolution && lesson.data.homeworkResolution !== "pending" ? <button className="planner-link-button" disabled={saving} onClick={() => void save("pending")} type="button">Вернуть отметку «Не выдано»</button> : null}
        </div>
        <Link className="secondary-button" to={`/teacher/students/${lesson.data.studentId}?tab=homework&sourceLesson=${lesson.id}`}>+ Выдать новое ДЗ</Link>
      </> : null}
    </>}
    {message ? <p className={failed ? "form-error" : "form-success"} role={failed ? "alert" : "status"}>{message}</p> : null}
  </section>;
}

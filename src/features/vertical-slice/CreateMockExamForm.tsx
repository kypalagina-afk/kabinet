import { useState, type FormEvent } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import { createMockExam } from "../../lib/firebase/services/verticalSliceWrites";

interface CreateMockExamFormProps {
  teacherId: string;
  studentId: string;
  studentProgramId: string;
  examBlueprintId: string;
}

export function CreateMockExamForm(props: CreateMockExamFormProps) {
  const [title, setTitle] = useState("Пробный экзамен");
  const [takenDate, setTakenDate] = useState("");
  const [scoreEarned, setScoreEarned] = useState("");
  const [scoreMax, setScoreMax] = useState("37");
  const [grade, setGrade] = useState("3");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    try {
      await createMockExam(getFirebaseDb(), {
        ...props,
        title,
        takenAt: new Date(`${takenDate}T12:00:00`),
        scoreEarned: Number(scoreEarned),
        scoreMax: Number(scoreMax),
        grade: Number(grade),
        teacherComment: comment || null,
      });
      setScoreEarned("");
      setComment("");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="action-form" onSubmit={handleSubmit}>
      <div className="action-form__heading">
        <h2>Добавить пробник</h2>
        <p>Phase 2 сохраняет итог; детальная раскладка появится в Phase 6.</p>
      </div>

      <div className="form-grid">
        <label className="form-field form-field--wide">
          <span>Название</span>
          <input
            name="mockTitle"
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <label className="form-field">
          <span>Дата</span>
          <input
            name="mockDate"
            onChange={(event) => setTakenDate(event.target.value)}
            required
            type="date"
            value={takenDate}
          />
        </label>
        <label className="form-field">
          <span>Балл</span>
          <input
            min="0"
            name="mockScoreEarned"
            onChange={(event) => setScoreEarned(event.target.value)}
            required
            type="number"
            value={scoreEarned}
          />
        </label>
        <label className="form-field">
          <span>Максимум</span>
          <input
            min="1"
            name="mockScoreMax"
            onChange={(event) => setScoreMax(event.target.value)}
            required
            type="number"
            value={scoreMax}
          />
        </label>
        <label className="form-field">
          <span>Оценка</span>
          <select name="mockGrade" onChange={(event) => setGrade(event.target.value)} value={grade}>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>
        <label className="form-field form-field--wide">
          <span>Комментарий</span>
          <textarea
            name="mockComment"
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            value={comment}
          />
        </label>
      </div>

      <div className="form-actions">
        <button className="primary-button primary-button--fit" disabled={status === "saving"}>
          {status === "saving" ? "Сохраняем…" : "Сохранить пробник"}
        </button>
        {status === "success" ? (
          <span className="form-success" role="status">
            Пробник сохранён
          </span>
        ) : null}
        {status === "error" ? (
          <span className="form-error" role="alert">
            Проверьте баллы и повторите.
          </span>
        ) : null}
      </div>
    </form>
  );
}

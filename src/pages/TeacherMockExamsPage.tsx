import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { DetailedMockExamForm } from "../features/analytics/DetailedMockExamForm";
import { MockExamReport } from "../features/analytics/MockAnalyticsDashboard";
import { useAuth } from "../features/auth/AuthProvider";
import {
  useTeacherMockExams,
  useTeacherStudents,
  useTeacherStudentWorkspace,
} from "../features/vertical-slice/hooks";
import type { DocumentWithId, MockExam } from "../lib/firebase/types";
import { formatCompactDate } from "../lib/formatters";

export function TeacherMockExamsPage() {
  const { user } = useAuth();
  const teacherId = user?.uid ?? "";
  const students = useTeacherStudents(teacherId);
  const exams = useTeacherMockExams(teacherId);
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentWithId<MockExam> | null>(null);
  const [detailId, setDetailId] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const visible = useMemo(
    () =>
      [...exams.data]
        .filter(({ data }) => !studentId || data.studentId === studentId)
        .sort(
          (a, b) =>
            (b.data.takenAt ?? b.data.createdAt).toMillis() -
            (a.data.takenAt ?? a.data.createdAt).toMillis(),
        ),
    [exams.data, studentId],
  );
  const detail = exams.data.find(({ id }) => id === detailId);
  const compared = compare
    .map((id) => exams.data.find((item) => item.id === id))
    .filter(Boolean) as Array<DocumentWithId<MockExam>>;
  function createHomeworkDraft(exam: DocumentWithId<MockExam>) {
    if (!user) return;
    const weak = exam.data.taskResults
      .filter((item) => item.earned < item.max)
      .map((item) => item.taskNumber);
    const items = weak.map((taskNumber, index) => ({
      itemId: crypto.randomUUID(),
      type: "practice" as const,
      title: `Закрепить задание №${taskNumber}`,
      description: null,
      requiredAmount: null,
      examTaskNumbers: [taskNumber],
      attachments: [],
      materialIds: [],
      sortOrder: index,
    }));
    if (exam.data.sections.essay.earned < exam.data.sections.essay.max)
      items.push({
        itemId: crypto.randomUUID(),
        type: "practice",
        title: "Доработать сочинение по результатам пробника",
        description: null,
        requiredAmount: null,
        examTaskNumbers: [13],
        attachments: [],
        materialIds: [],
        sortOrder: items.length,
      });
    localStorage.setItem(
      `homework-draft:${user.uid}:${exam.data.studentId}`,
      JSON.stringify({
        title: `ДЗ по пробнику · ${exam.data.title}`,
        description:
          "Черновик создан по зонам роста. Проверьте и отредактируйте перед назначением.",
        dueDate: "",
        dueTime: "",
        items,
      }),
    );
    navigate(`/teacher/students/${exam.data.studentId}?tab=homework`);
  }
  return (
    <main className="shell-content" aria-labelledby="mock-list-title">
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Пробники</p>
          <h1 id="mock-list-title">Все пробники</h1>
          <p>
            Добавление, подробные отчёты и сравнение остаются в одном workflow.
          </p>
        </div>
        <button
          className="primary-button primary-button--fit"
          onClick={() => setAddOpen(true)}
          type="button"
        >
          + Добавить пробник
        </button>
      </header>
      <section className="filter-bar">
        <label>
          <span>Ученик</span>
          <select
            onChange={(event) => setStudentId(event.target.value)}
            value={studentId}
          >
            <option value="">Все ученики</option>
            {students.data.map(({ id, data }) => (
              <option key={id} value={id}>
                {data.displayName}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          onClick={() => {
            setCompareMode((value) => !value);
            setCompare([]);
          }}
          type="button"
        >
          {compareMode ? "Отменить сравнение" : "Сравнить пробники"}
        </button>
      </section>
      {compared.length === 2 ? (
        <Comparison first={compared[1]} second={compared[0]} />
      ) : null}
      <section className="mock-history">
        {visible.map((exam) => {
          const student = students.data.find(
            (item) => item.id === exam.data.studentId,
          );
          return (
            <article className="mock-history-card" key={exam.id}>
              {compareMode ? (
                <label className="compare-check">
                  <input
                    checked={compare.includes(exam.id)}
                    disabled={!compare.includes(exam.id) && compare.length >= 2}
                    onChange={() =>
                      setCompare((current) =>
                        current.includes(exam.id)
                          ? current.filter((value) => value !== exam.id)
                          : [...current, exam.id],
                      )
                    }
                    type="checkbox"
                  />{" "}
                  Выбрать
                </label>
              ) : null}
              <div>
                <small>
                  {student?.data.displayName ?? "Ученик"} ·{" "}
                  {formatCompactDate(exam.data.takenAt ?? exam.data.createdAt)}
                </small>
                <h2>
                  {exam.data.total.earned}/{exam.data.total.max} · оценка{" "}
                  {exam.data.grade}
                </h2>
                <p>
                  Тест {exam.data.sections.test.earned}/
                  {exam.data.sections.test.max} · Изложение{" "}
                  {exam.data.sections.exposition.earned}/
                  {exam.data.sections.exposition.max} · Сочинение{" "}
                  {exam.data.sections.essay.earned}/
                  {exam.data.sections.essay.max}
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() => setDetailId(exam.id)}
                type="button"
              >
                Подробнее
              </button>
            </article>
          );
        })}
      </section>
      {!exams.loading && !visible.length ? (
        <p className="content-state">Пробников пока нет.</p>
      ) : null}
      {addOpen ? (
        <AddMockModal
          existing={editing}
          initialStudentId={editing?.data.studentId ?? studentId}
          onClose={() => {
            setAddOpen(false);
            setEditing(null);
          }}
          onSaved={(id) => {
            setAddOpen(false);
            setEditing(null);
            setDetailId(id);
          }}
          students={students.data}
          teacherId={teacherId}
        />
      ) : null}
      {detail ? (
        <Modal
          className="mock-detail-modal"
          onClose={() => setDetailId("")}
          title="Отчёт по пробнику"
        >
          <MockExamReport audience="teacher" exam={detail.data} />
          <div className="form-actions">
            <button
              className="primary-button primary-button--fit"
              onClick={() => createHomeworkDraft(detail)}
              type="button"
            >
              Создать ДЗ по результатам пробника
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setEditing(detail);
                setDetailId("");
                setAddOpen(true);
              }}
              type="button"
            >
              Редактировать
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setStudentId(detail.data.studentId);
                setEditing(null);
                setDetailId("");
                setAddOpen(true);
              }}
              type="button"
            >
              Добавить новый результат
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

function AddMockModal({
  teacherId,
  students,
  initialStudentId,
  existing,
  onClose,
  onSaved,
}: {
  teacherId: string;
  students: ReturnType<typeof useTeacherStudents>["data"];
  initialStudentId: string;
  existing?: DocumentWithId<MockExam> | null;
  onClose(): void;
  onSaved(id: string): void;
}) {
  const [studentId, setStudentId] = useState(initialStudentId);
  const workspace = useTeacherStudentWorkspace(teacherId, studentId);
  return (
    <Modal
      className="mock-form-modal"
      onClose={onClose}
      title={existing ? "Редактировать пробник" : "Добавить пробник"}
    >
      <label className="form-field">
        <span>Ученик</span>
        <select
          disabled={Boolean(existing)}
          onChange={(event) => setStudentId(event.target.value)}
          value={studentId}
        >
          <option value="">Выберите ученика</option>
          {students.map(({ id, data }) => (
            <option key={id} value={id}>
              {data.displayName}
            </option>
          ))}
        </select>
      </label>
      {workspace.data.studentProgram && workspace.data.examBlueprint ? (
        <DetailedMockExamForm
          blueprint={workspace.data.examBlueprint.data}
          blueprintId={workspace.data.examBlueprint.id}
          existing={existing}
          onSaved={onSaved}
          studentId={studentId}
          studentProgramId={workspace.data.studentProgram.id}
          teacherId={teacherId}
        />
      ) : studentId ? (
        <p className="content-state">
          У программы ученика нет активного blueprint.
        </p>
      ) : null}
    </Modal>
  );
}
function Comparison({
  first,
  second,
}: {
  first?: DocumentWithId<MockExam>;
  second?: DocumentWithId<MockExam>;
}) {
  if (!first || !second) return null;
  const scores = [
    ["Итог", first.data.total.earned, second.data.total.earned],
    ["Тест", first.data.sections.test.earned, second.data.sections.test.earned],
    [
      "Изложение",
      first.data.sections.exposition.earned,
      second.data.sections.exposition.earned,
    ],
    [
      "Сочинение",
      first.data.sections.essay.earned,
      second.data.sections.essay.earned,
    ],
    [
      "Грамотность",
      first.data.sections.literacy.earned,
      second.data.sections.literacy.earned,
    ],
  ] as const;
  return (
    <section className="compare-card">
      <h2>Сравнение двух пробников</h2>
      <div className="report-section-grid">
        {scores.map(([label, before, after]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>
              {before} → {after}
            </strong>
            <small>
              {after - before >= 0 ? "+" : ""}
              {after - before} балла
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { HomeworkAnalyticsPanel } from "../features/analytics/HomeworkAnalyticsPanel";
import { MockAnalyticsDashboard } from "../features/analytics/MockAnalyticsDashboard";
import {
  saveMasteryOverride,
  saveTaskCoverage,
  useStudentTaskCoverage,
  useTaskMasteryPublic,
  useTeacherMasteryOverrides,
  useTeacherTaskCoverage,
} from "../features/analytics/mastery";
import { useAuth } from "../features/auth/AuthProvider";
import { useTeacherHomeworkBoard } from "../features/homework/hooks";
import { useExamBlueprints, useProgramProfiles } from "../features/materials/hooks";
import {
  useTeacherMockExams,
  useTeacherStudents,
  useTeacherStudentPrograms,
  useTeacherStudentWorkspace,
} from "../features/vertical-slice/hooks";
import { getFirebaseDb } from "../lib/firebase/client";
import { programBlueprintId, programDisplayName } from "../features/exams/blueprints";
import { ExternalPracticePanel } from "../features/external-practice/ExternalPracticePanel";

export function TeacherAnalyticsPage() {
  const { user } = useAuth();
  const teacherId = user?.uid ?? "";
  const students = useTeacherStudents(teacherId);
  const mocks = useTeacherMockExams(teacherId);
  const board = useTeacherHomeworkBoard(teacherId);
  const coverage = useTeacherTaskCoverage(teacherId);
  const assignments = useTeacherStudentPrograms(teacherId);
  const profiles = useProgramProfiles();
  const blueprints = useExamBlueprints();
  const [studentId, setStudentId] = useState(
    () => sessionStorage.getItem("teacher-analytics-student") ?? "all",
  );
  const [programFilter, setProgramFilter] = useState<"all" | "oge" | "ege" | "school">("all");
  const activeStudentId = !students.loading
    && studentId !== "all"
    && !students.data.some(({ id }) => id === studentId)
    ? "all"
    : studentId;
  const activeProfileTitles = [...new Set(assignments.data
    .filter(({ data }) => data.status === "active")
    .map(({ data }) => profiles.data.find(({ id }) => id === data.programProfileId)?.data.title)
    .filter((value): value is string => Boolean(value)))];
  return (
    <main
      className="shell-content progress-page"
      aria-labelledby="teacher-analytics-title"
    >
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Аналитика</p>
          <h1 id="teacher-analytics-title">Прогресс и готовность к экзамену</h1>
          <p>{activeProfileTitles.length ? activeProfileTitles.join(" · ") : "Программы активных учеников"}</p>
        </div>
        <div className="inline-control analytics-filters">
          <label className="form-field compact-filter analytics-student-filter">
            <span>Ученик</span>
            <select
              onChange={(event) => {
                setStudentId(event.target.value);
                sessionStorage.setItem("teacher-analytics-student", event.target.value);
              }}
              title={
                activeStudentId === "all"
                  ? "Все ученики"
                  : students.data.find(({ id }) => id === activeStudentId)?.data
                      .displayName
              }
              value={activeStudentId}
            >
              <option value="all">Все ученики</option>
              {students.data.map(({ id, data }) => (
                <option key={id} value={id}>
                  {data.displayName}
                </option>
              ))}
            </select>
          </label>
          {activeStudentId === "all" ? (
            <label className="form-field compact-filter">
              <span>Программа</span>
              <select
                aria-label="Программа аналитики"
                onChange={(event) => setProgramFilter(event.target.value as typeof programFilter)}
                value={programFilter}
              >
                <option value="all">Все программы</option>
                <option value="oge">ОГЭ</option>
                <option value="ege">ЕГЭ</option>
                <option value="school">Школа</option>
              </select>
            </label>
          ) : null}
        </div>
      </header>
      {activeStudentId === "all" ? (
        <AllStudentsAnalytics
          board={board.data}
          assignments={assignments.data}
          blueprints={blueprints.data}
          coverage={coverage}
          mocks={mocks.data}
          profiles={profiles.data}
          programFilter={programFilter}
          students={students.data}
        />
      ) : (
        <TeacherAnalyticsWorkspace
          studentId={activeStudentId}
          teacherId={teacherId}
        />
      )}
    </main>
  );
}

function TeacherAnalyticsWorkspace({
  teacherId,
  studentId,
}: {
  teacherId: string;
  studentId: string;
}) {
  const { data, loading, error } = useTeacherStudentWorkspace(
    teacherId,
    studentId,
  );
  const publicMastery = useTaskMasteryPublic(studentId, teacherId);
  const overrides = useTeacherMasteryOverrides(teacherId, studentId);
  const coverage = useStudentTaskCoverage(studentId, teacherId);
  const [editing, setEditing] = useState<{
    taskNumber: number;
    autoMastery: number;
    attempts: number;
  } | null>(null);
  const [value, setValue] = useState(0);
  if (loading) return <p className="content-state">Считаем аналитику…</p>;
  if (error) return <p className="shell-notice">{error}</p>;
  async function save(manualOverride: number | null) {
    if (!editing || !data.studentProgram) return;
    await saveMasteryOverride(getFirebaseDb(), {
      teacherId,
      studentId,
      studentProgramId: data.studentProgram.id,
      taskNumber: editing.taskNumber,
      autoMastery: editing.autoMastery,
      manualOverride,
      evidenceCount: editing.attempts,
      confidence: Math.min(100, Math.round((editing.attempts / 3) * 100)),
    });
    setEditing(null);
  }
  return (
    <>
      <HomeworkAnalyticsPanel
        homeworks={data.homeworks}
        submissions={data.homeworkSubmissions}
        teacherControls
      />
      <ExternalPracticePanel
        studentId={studentId}
        teacherId={teacherId}
      />
      <MockAnalyticsDashboard
        audience="teacher"
        coverage={coverage}
        exams={data.mockExams}
        masteryPublic={publicMastery}
        programTitle={data.programProfile?.data.title}
        taskNumbers={data.examBlueprint?.data.tasks.map((item) => item.number)}
        taskWeights={Object.fromEntries(
          data.examBlueprint?.data.tasks.map((item) => [
            item.number,
            item.readinessWeight ?? item.maxScore,
          ]) ?? [],
        )}
        onCoverageChange={(taskNumber, state) =>
          data.studentProgram &&
          void saveTaskCoverage(getFirebaseDb(), {
            teacherId,
            studentId,
            studentProgramId: data.studentProgram.id,
            taskNumber,
            state,
          })
        }
        onEditMastery={(taskNumber, autoMastery, attempts) => {
          setEditing({ taskNumber, autoMastery, attempts });
          setValue(
            publicMastery.find(
              ({ data: item }) => item.taskNumber === taskNumber,
            )?.data.effectiveMastery ?? autoMastery,
          );
        }}
      />
      {editing ? (
        <div className="modal-backdrop">
          <form
            className="responsive-modal mastery-modal"
            onSubmit={(event) => {
              event.preventDefault();
              void save(value);
            }}
          >
            <h2>Изменить % освоения задания №{editing.taskNumber}?</h2>
            <p>
              Авто: <strong>{editing.autoMastery}%</strong> · новое:{" "}
              <strong>{value}%</strong>
            </p>
            {overrides.find(
              ({ data: item }) => item.taskNumber === editing.taskNumber,
            )?.data.manualOverride != null ? (
              <p className="teacher-only-note">
                Ручное значение активно и сохранится после перезагрузки.
              </p>
            ) : null}
            <label className="form-field">
              <span>Новое значение · {value}%</span>
              <input
                max="100"
                min="0"
                onChange={(event) => setValue(Number(event.target.value))}
                type="range"
                value={value}
              />
            </label>
            <div className="form-actions">
              <button
                className="secondary-button"
                onClick={() => setEditing(null)}
                type="button"
              >
                Отмена
              </button>
              <button className="primary-button primary-button--fit">
                Изменить
              </button>
              <button
                className="secondary-button"
                onClick={() => void save(null)}
                type="button"
              >
                Вернуть авто
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function AllStudentsAnalytics({
  students,
  mocks,
  coverage,
  board,
  assignments,
  profiles,
  blueprints,
  programFilter,
}: {
  students: ReturnType<typeof useTeacherStudents>["data"];
  mocks: ReturnType<typeof useTeacherMockExams>["data"];
  coverage: ReturnType<typeof useTeacherTaskCoverage>;
  board: ReturnType<typeof useTeacherHomeworkBoard>["data"];
  assignments: ReturnType<typeof useTeacherStudentPrograms>["data"];
  profiles: ReturnType<typeof useProgramProfiles>["data"];
  blueprints: ReturnType<typeof useExamBlueprints>["data"];
  programFilter: "all" | "oge" | "ege" | "school";
}) {
  const visibleStudents = students.filter((student) => {
    if (programFilter === "all") return true;
    const assignment = assignments.find(({ data }) => data.studentId === student.id && data.status === "active");
    const profile = profiles.find(({ id }) => id === assignment?.data.programProfileId)?.data;
    return (profile?.examKind ?? profile?.type) === programFilter;
  });
  const visibleStudentIds = new Set(visibleStudents.map(({ id }) => id));
  const summaries = visibleStudents.map((student) => {
    const exams = mocks
      .filter(({ data }) => data.studentId === student.id)
      .sort(
        (a, b) =>
          (b.data.takenAt ?? b.data.createdAt).toMillis() -
          (a.data.takenAt ?? a.data.createdAt).toMillis(),
      );
    const latest = exams[0];
    const previous = exams[1];
    const studied = coverage.filter(
      ({ data }) => data.studentId === student.id && data.state === "studied",
    ).length;
    const assignment = assignments.find(({ data }) =>
      data.studentId === student.id && data.status === "active",
    );
    const profile = profiles.find(({ id }) => id === assignment?.data.programProfileId);
    const blueprint = blueprints.find(({ id }) => id === (profile ? programBlueprintId(profile.data) : null));
    const evidenceTaskCount = new Set([
      ...coverage.filter(({ data }) => data.studentId === student.id).map(({ data }) => data.taskNumber),
      ...(latest?.data.taskResults.map((item) => item.taskNumber) ?? []),
    ]).size;
    const totalTasks = blueprint?.data.tasks.length ?? evidenceTaskCount;
    return {
      student,
      latest,
      delta:
        latest && previous
          ? latest.data.total.earned - previous.data.total.earned
          : null,
      readiness: latest
        ? Math.round((latest.data.total.earned / latest.data.total.max) * 100)
        : 0,
      coverage: totalTasks ? Math.round((studied / totalTasks) * 100) : 0,
      programTitle: profile ? programDisplayName(profile.data) : "Программа не назначена",
    };
  });
  const average = (values: number[]) =>
    values.length
      ? Math.round(
          values.reduce((sum, value) => sum + value, 0) / values.length,
        )
      : 0;
  return (
    <>
      <HomeworkAnalyticsPanel
        homeworks={board.homeworks.filter(({ data }) => visibleStudentIds.has(data.studentId))}
        submissions={board.submissions.filter(({ data }) => visibleStudentIds.has(data.studentId))}
        teacherControls
      />
      <section className="analytics-panel">
        <p className="eyebrow">Все ученики</p>
        <h2>Сводка группы</h2>
        <div className="analytics-stat-grid">
          <article className="metric-card">
            <span>Средняя готовность</span>
            <strong>{average(summaries.map((item) => item.readiness))}%</strong>
          </article>
          <article className="metric-card">
            <span>Пройдено программы</span>
            <strong>{average(summaries.map((item) => item.coverage))}%</strong>
          </article>
          <article className="metric-card">
            <span>Ученики с зоной роста</span>
            <strong>{summaries.filter((item) => item.readiness < 45).length}</strong>
          </article>
        </div>
        <div className="analytics-student-table">
          <div className="analytics-student-row analytics-student-row--head">
            <span>Ученик</span>
            <span>Готовность</span>
            <span>Программа</span>
            <span>Последний результат</span>
            <span>Динамика</span>
          </div>
          {summaries.map(
            ({
              student,
              readiness,
              coverage: programCoverage,
              latest,
              delta,
              programTitle,
            }) => (
              <Link
                className="analytics-student-row"
                key={student.id}
                to={`/teacher/students/${student.id}`}
              >
                <span>{student.data.displayName}</span>
                <span>{readiness}%</span>
                <span title={programTitle}>{programCoverage}% · {programTitle}</span>
                <span>
                  {latest
                    ? `${latest.data.total.earned}/${latest.data.total.max}`
                    : "—"}
                </span>
                <span>
                  {delta === null
                    ? "Мало данных"
                    : `${delta >= 0 ? "+" : ""}${delta} балла`}
                </span>
              </Link>
            ),
          )}
        </div>
      </section>
    </>
  );
}

import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../features/auth/AuthProvider";
import {
  AuthHomeRedirect,
  GuestOnlyRoute,
  RoleRoute,
} from "../features/auth/RouteGuards";
const LoginPage = lazy(() => import("../features/auth/LoginPage").then((module) => ({ default: module.LoginPage })));
const StudentShell = lazy(() => import("../layouts/StudentShell").then((module) => ({ default: module.StudentShell })));
const TeacherShell = lazy(() => import("../layouts/TeacherShell").then((module) => ({ default: module.TeacherShell })));
const StudentHomePage = lazy(() => import("../pages/StudentHomePage").then((module) => ({ default: module.StudentHomePage })));
const TeacherHomePage = lazy(() => import("../pages/TeacherHomePage").then((module) => ({ default: module.TeacherHomePage })));
const TeacherCalendarPage = lazy(() => import("../pages/TeacherCalendarPage").then((module) => ({ default: module.TeacherCalendarPage })));
const TeacherStudentPage = lazy(() => import("../pages/TeacherStudentPage").then((module) => ({ default: module.TeacherStudentPage })));
const StudentHomeworkPage = lazy(() => import("../pages/StudentHomeworkPage").then((module) => ({ default: module.StudentHomeworkPage })));
const TeacherHomeworksPage = lazy(() => import("../pages/TeacherHomeworksPage").then((module) => ({ default: module.TeacherHomeworksPage })));
const StudentProgressPage = lazy(() => import("../pages/StudentProgressPage").then((module) => ({ default: module.StudentProgressPage })));
const TeacherAnalyticsPage = lazy(() => import("../pages/TeacherAnalyticsPage").then((module) => ({ default: module.TeacherAnalyticsPage })));
const StudentProfilePage = lazy(() => import("../pages/StudentProfilePage").then((module) => ({ default: module.StudentProfilePage })));
const TeacherMaterialsPage = lazy(() => import("../pages/TeacherMaterialsPage").then((module) => ({ default: module.TeacherMaterialsPage })));
const StudentMaterialsPage = lazy(() => import("../pages/StudentMaterialsPage").then((module) => ({ default: module.StudentMaterialsPage })));
const TeacherStudentsPage = lazy(() => import("../pages/TeacherStudentsPage").then((module) => ({ default: module.TeacherStudentsPage })));
const TeacherStudentPreviewPage = lazy(() => import("../pages/TeacherStudentPreviewPage").then((module) => ({ default: module.TeacherStudentPreviewPage })));
const StudentLessonsPage = lazy(() => import("../pages/StudentLessonsPage").then((module) => ({ default: module.StudentLessonsPage })));
const TeacherMockExamsPage = lazy(() => import("../pages/TeacherMockExamsPage").then((module) => ({ default: module.TeacherMockExamsPage })));
const TeacherPlannerPage = lazy(() => import("../pages/TeacherPlannerPage").then((module) => ({ default: module.TeacherPlannerPage })));

export function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<main className="content-state">Открываем раздел…</main>}>
      <Routes>
        <Route path="/" element={<AuthHomeRedirect />} />

        <Route element={<GuestOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<RoleRoute role="teacher" />}>
          <Route path="/teacher" element={<TeacherShell />}>
            <Route index element={<TeacherHomePage />} />
            <Route path="calendar" element={<TeacherCalendarPage />} />
            <Route path="planner" element={<TeacherPlannerPage />} />
            <Route path="homeworks" element={<TeacherHomeworksPage />} />
            <Route path="analytics" element={<TeacherAnalyticsPage />} />
            <Route path="mock-exams" element={<TeacherMockExamsPage />} />
            <Route path="materials" element={<TeacherMaterialsPage />} />
            <Route path="students/:studentId" element={<TeacherStudentPage />} />
            <Route path="students/:studentId/preview" element={<TeacherStudentPreviewPage />} />
            <Route path="students" element={<TeacherStudentsPage />} />
          </Route>
        </Route>

        <Route element={<RoleRoute role="student" />}>
          <Route path="/student" element={<StudentShell />}>
            <Route index element={<StudentHomePage />} />
            <Route path="homework" element={<StudentHomeworkPage />} />
            <Route path="lessons" element={<StudentLessonsPage />} />
            <Route path="progress" element={<StudentProgressPage />} />
            <Route path="profile" element={<StudentProfilePage />} />
            <Route path="materials" element={<StudentMaterialsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AuthProvider>
  );
}

import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../features/auth/AuthProvider";
import { LoginPage } from "../features/auth/LoginPage";
import {
  AuthHomeRedirect,
  GuestOnlyRoute,
  RoleRoute,
} from "../features/auth/RouteGuards";
import { StudentShell } from "../layouts/StudentShell";
import { TeacherShell } from "../layouts/TeacherShell";
import { StudentHomePage } from "../pages/StudentHomePage";
import { TeacherHomePage } from "../pages/TeacherHomePage";
import { TeacherCalendarPage } from "../pages/TeacherCalendarPage";
import { TeacherStudentPage } from "../pages/TeacherStudentPage";
import { StudentHomeworkPage } from "../pages/StudentHomeworkPage";
import { TeacherHomeworksPage } from "../pages/TeacherHomeworksPage";
import { StudentProgressPage } from "../pages/StudentProgressPage";
import { TeacherAnalyticsPage } from "../pages/TeacherAnalyticsPage";
import { StudentProfilePage } from "../pages/StudentProfilePage";
import { TeacherMaterialsPage } from "../pages/TeacherMaterialsPage";
import { StudentMaterialsPage } from "../pages/StudentMaterialsPage";
import { TeacherStudentsPage } from "../pages/TeacherStudentsPage";
import { TeacherStudentPreviewPage } from "../pages/TeacherStudentPreviewPage";
import { StudentLessonsPage } from "../pages/StudentLessonsPage";
import { TeacherMockExamsPage } from "../pages/TeacherMockExamsPage";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<AuthHomeRedirect />} />

        <Route element={<GuestOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<RoleRoute role="teacher" />}>
          <Route path="/teacher" element={<TeacherShell />}>
            <Route index element={<TeacherHomePage />} />
            <Route path="calendar" element={<TeacherCalendarPage />} />
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
    </AuthProvider>
  );
}

import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ChevronLeftIcon, ChevronRightIcon } from "../components/Icons";
import { useAuth } from "../features/auth/AuthProvider";
import { Avatar } from "../features/avatar/Avatar";
import { ThemeToggle } from "../features/theme/ThemeToggle";
import { useStudentWorkspace } from "../features/vertical-slice/hooks";

const links = [
  ["/student", "Главная", "🏠", true],
  ["/student/homework", "ДЗ", "📝"],
  ["/student/lessons", "Занятия", "📅"],
  ["/student/progress", "Прогресс", "📊"],
  ["/student/materials", "Материалы", "📚"],
] as const;

export function StudentShell() {
  const { profile, error, logout } = useAuth();
  const workspace = useStudentWorkspace(profile?.studentId ?? "");
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("student-sidebar-collapsed") === "true",
  );
  const [today] = useState(() => Date.now());
  const examDate = workspace.data.programProfile?.data.examDate?.toDate();
  const days = examDate
    ? Math.max(0, Math.ceil((examDate.getTime() - today) / 86_400_000))
    : null;
  function toggle() {
    setCollapsed((value) => {
      localStorage.setItem("student-sidebar-collapsed", String(!value));
      return !value;
    });
  }
  const navigation = links.map(([to, label, icon, end]) => (
    <NavLink
      aria-label={label}
      className={({ isActive }) =>
        isActive
          ? "student-navigation__item student-navigation__item--active"
          : "student-navigation__item"
      }
      end={end}
      key={to}
      title={collapsed ? label : undefined}
      to={to}
    >
      <span aria-hidden="true" className="sidebar-icon">
        {icon}
      </span>
      <span className="student-nav-label">{label}</span>
    </NavLink>
  ));
  return (
    <div
      className={`student-shell${collapsed ? " student-shell--collapsed" : ""}`}
      data-testid="student-shell"
    >
      <aside
        className="student-sidebar"
        onClick={(event) => {
          if (collapsed && event.target === event.currentTarget) toggle();
        }}
      >
        <Link
          aria-label="Профиль"
          className="student-account"
          to="/student/profile"
        >
          <Avatar
            avatarKey={profile?.avatarKey}
            label={profile?.username ?? "Ученик"}
          />
          <span className="student-nav-label">
            <strong>
              {workspace.data.student?.data.displayName ?? profile?.username}
            </strong>
            <small>Мой кабинет</small>
          </span>
        </Link>
        <nav aria-label="Навигация ученика">{navigation}</nav>
        {days !== null ? (
          <div className="sidebar-countdown">
            <span className="student-nav-label">До ОГЭ</span>
            <strong>{days}</strong>
            <small className="student-nav-label">дней</small>
          </div>
        ) : null}
        <div
          aria-hidden="true"
          className="sidebar-expand-zone"
          onClick={() => {
            if (collapsed) toggle();
          }}
        />
        <button
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className="sidebar-toggle"
          onClick={toggle}
          type="button"
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          <span className="student-nav-label">Свернуть</span>
        </button>
      </aside>
      <div className="student-workspace">
        <header className="student-header">
          <div>
            <p className="shell-kicker">Кабинет ученика</p>
            <p className="shell-title">
              Привет,{" "}
              {workspace.data.student?.data.displayName ?? profile?.username}
            </p>
          </div>
          <div className="shell-actions">
            <Link
              aria-label="Открыть профиль"
              className="avatar-button mobile-only"
              to="/student/profile"
            >
              <Avatar
                avatarKey={profile?.avatarKey}
                label={profile?.username ?? "Ученик"}
              />
            </Link>
            <ThemeToggle />
            <button
              aria-label="Выйти"
              className="icon-button"
              onClick={() => void logout()}
              type="button"
            >
              ↪
            </button>
          </div>
        </header>
        <main className="student-content">
          {error ? (
            <p className="shell-notice" role="alert">
              {error}
            </p>
          ) : null}
          <Outlet />
        </main>
      </div>
      <nav
        className="student-navigation"
        aria-label="Мобильная навигация ученика"
      >
        {navigation}
      </nav>
    </div>
  );
}

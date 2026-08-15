import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ChevronLeftIcon, ChevronRightIcon } from "../components/Icons";
import { useAuth } from "../features/auth/AuthProvider";
import { Avatar, AvatarPicker } from "../features/avatar/Avatar";
import { ThemeToggle } from "../features/theme/ThemeToggle";
import { QuickCreate } from "../features/teacher/QuickCreate";

const links = [
  ["/teacher", "Главная", "🏠", true],
  ["/teacher/calendar", "Расписание", "📅"],
  ["/teacher/students", "Ученики", "👥"],
  ["/teacher/homeworks", "Домашние задания", "📝"],
  ["/teacher/materials", "Материалы", "📚"],
  ["/teacher/analytics", "Аналитика", "📊"],
  ["/teacher/mock-exams", "Пробники", "🎯"],
] as const;

export function TeacherShell() {
  const { profile, error, logout, setAvatar } = useAuth();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("teacher-sidebar-collapsed") === "true",
  );
  function toggleSidebar() {
    setCollapsed((value) => {
      localStorage.setItem("teacher-sidebar-collapsed", String(!value));
      return !value;
    });
  }
  return (
    <div
      className={`teacher-shell${collapsed ? " teacher-shell--collapsed" : ""}`}
      data-testid="teacher-shell"
    >
      <aside
        className="teacher-sidebar"
        onClick={(event) => {
          if (collapsed && event.target === event.currentTarget)
            toggleSidebar();
        }}
      >
        <div className="brand-mark" aria-label="Кабинет ученика">
          <span className="brand-mark__icon" aria-hidden="true">
            К
          </span>
          <span className="sidebar-label">
            <strong>Кабинет</strong>
            <small>Панель преподавателя</small>
          </span>
        </div>
        <nav
          className="teacher-navigation"
          aria-label="Навигация преподавателя"
        >
          {links.map(([to, label, icon, end]) => (
            <NavLink
              aria-label={label}
              className={({ isActive }) =>
                isActive
                  ? "navigation-item navigation-item--active"
                  : "navigation-item"
              }
              end={end}
              key={to}
              title={collapsed ? label : undefined}
              to={to}
            >
              <span aria-hidden="true" className="sidebar-icon">
                {icon}
              </span>
              <span className="sidebar-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div
          aria-hidden="true"
          className="sidebar-expand-zone"
          onClick={() => {
            if (collapsed) toggleSidebar();
          }}
        />
        <button
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className="sidebar-toggle"
          onClick={toggleSidebar}
          type="button"
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          <span className="sidebar-label">Свернуть</span>
        </button>
        <div className="teacher-account teacher-avatar-control">
          <button
            aria-label="Выбрать аватар преподавателя"
            className="avatar-button"
            onClick={() => setAvatarOpen((value) => !value)}
            type="button"
          >
            <Avatar
              avatarKey={profile?.avatarKey}
              label={profile?.username ?? "Преподаватель"}
            />
          </button>
          <span className="account-copy sidebar-label">
            <strong>{profile?.username}</strong>
            <small>Преподаватель</small>
          </span>
          {avatarOpen ? (
            <div className="avatar-popover">
              <strong>Мой аватар</strong>
              <AvatarPicker
                value={profile?.avatarKey}
                onChange={(key) => void setAvatar(key)}
              />
            </div>
          ) : null}
        </div>
      </aside>
      <div className="teacher-workspace">
        <header className="shell-header">
          <div>
            <p className="shell-kicker">Рабочее пространство</p>
            <p className="shell-title">Панель преподавателя</p>
          </div>
          <div className="shell-actions">
            <QuickCreate />
            <ThemeToggle />
            <button
              className="secondary-button"
              onClick={() => void logout()}
              type="button"
            >
              Выйти
            </button>
          </div>
        </header>
        {error ? (
          <p className="shell-notice" role="alert">
            {error}
          </p>
        ) : null}
        <Outlet />
      </div>
    </div>
  );
}

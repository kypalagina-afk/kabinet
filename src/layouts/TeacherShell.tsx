import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ChevronLeftIcon, ChevronRightIcon } from "../components/Icons";
import { useAuth } from "../features/auth/AuthProvider";
import { Avatar, AvatarPicker } from "../features/avatar/Avatar";
import { moscowTimezoneLabel, resolveTimezone } from "../features/schedule/timezone";
import { ThemeToggle } from "../features/theme/ThemeToggle";
import { teacherAIAssistantEnabled } from "../features/ai/featureFlag";
import { DEMO_MUTATION_NOTICE, isDemoProfile } from "../features/demo/demoMode";

const TeacherAIAssistant = lazy(() => import("../features/ai/TeacherAIAssistant").then((module) => ({ default: module.TeacherAIAssistant })));

const links = [
  ["/teacher", "Главная", "🏠", true],
  ["/teacher/calendar", "Расписание", "📅"],
  ["/teacher/planner", "Планы", "🗓️"],
  ["/teacher/students", "Ученики", "👥"],
  ["/teacher/homeworks", "Домашние задания", "📝"],
  ["/teacher/materials", "Материалы", "📚"],
  ["/teacher/analytics", "Аналитика", "📊"],
  ["/teacher/mock-exams", "Пробники", "🎯"],
] as const;
const primaryMobilePaths = new Set([
  "/teacher",
  "/teacher/calendar",
  "/teacher/students",
  "/teacher/homeworks",
]);

export function TeacherShell() {
  const { profile, error, logout, setAvatar, setTimezone } = useAuth();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("teacher-sidebar-collapsed") === "true",
  );
  function toggleSidebar() {
    setCollapsed((value) => {
      localStorage.setItem("teacher-sidebar-collapsed", String(!value));
      return !value;
    });
  }
  useEffect(() => {
    const openAssistant = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      setAssistantPrompt(detail?.prompt ?? "");
      setAssistantOpen(true);
    };
    window.addEventListener("open-teacher-ai", openAssistant);
    return () => window.removeEventListener("open-teacher-ai", openAssistant);
  }, []);
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
          className={`teacher-navigation${mobileMoreOpen ? " teacher-navigation--more-open" : ""}`}
          aria-label="Навигация преподавателя"
        >
          {links.map(([to, label, icon, end]) => (
            <NavLink
              aria-label={label}
              className={({ isActive }) =>
                `${isActive ? "navigation-item navigation-item--active" : "navigation-item"}${primaryMobilePaths.has(to) ? " navigation-item--primary-mobile" : " navigation-item--secondary-mobile"}`
              }
              end={end}
              key={to}
              title={collapsed ? label : undefined}
              to={to}
              onClick={() => setMobileMoreOpen(false)}
            >
              <span aria-hidden="true" className="sidebar-icon">
                {icon}
              </span>
              <span className="sidebar-label">{label}</span>
            </NavLink>
          ))}
          <button
            aria-expanded={mobileMoreOpen}
            className="navigation-item navigation-more-toggle"
            onClick={() => setMobileMoreOpen((value) => !value)}
            type="button"
          >
            <span aria-hidden="true" className="sidebar-icon">•••</span>
            <span className="sidebar-label">Ещё</span>
          </button>
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
            aria-label="Открыть профиль преподавателя"
            className="avatar-button"
            onClick={() => setAvatarOpen((value) => !value)}
            type="button"
          >
            <Avatar
              avatarKey={profile?.avatarKey}
              label={profile?.displayName ?? profile?.username ?? "Преподаватель"}
            />
          </button>
          <span className="account-copy sidebar-label">
            <strong>{profile?.displayName ?? profile?.username}</strong>
            <small>Преподаватель</small>
          </span>
          {avatarOpen ? (
            <div className="avatar-popover">
              <strong>Профиль преподавателя</strong>
              <AvatarPicker
                value={profile?.avatarKey}
                onChange={(key) => void setAvatar(key)}
              />
              {profile?.role === "teacher" ? (
                <label className="form-field teacher-timezone-field">
                  <span>Часовой пояс</span>
                  <select
                    aria-label="Часовой пояс преподавателя"
                    onChange={(event) => {
                      if (event.target.value) void setTimezone(event.target.value);
                    }}
                    value={profile.timezone.iana ?? ""}
                  >
                    {!profile.timezone.iana ? <option value="">Сохранённое смещение · {moscowTimezoneLabel(new Date(), resolveTimezone(profile.timezone))}</option> : null}
                    <option value="Europe/Moscow">Москва</option>
                    <option value="Asia/Yekaterinburg">Екатеринбург</option>
                    <option value="Asia/Omsk">Омск</option>
                    <option value="Asia/Novosibirsk">Новосибирск</option>
                    <option value="Asia/Krasnoyarsk">Красноярск</option>
                    <option value="Asia/Irkutsk">Иркутск</option>
                    <option value="Asia/Yakutsk">Якутск</option>
                    <option value="Asia/Vladivostok">Владивосток</option>
                  </select>
                  <small>
                    {profile.timezone.iana ?? "Europe/Moscow"} · {moscowTimezoneLabel(new Date(), resolveTimezone(profile.timezone))}
                  </small>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
      <div className="teacher-workspace">
        <header className="shell-header">
          <div>
            <p className="shell-kicker">Рабочее пространство</p>
            <p className="shell-title">Здравствуйте, {profile?.displayName ?? profile?.username}</p>
          </div>
          <div className="shell-actions">
            {teacherAIAssistantEnabled() ? <button aria-label="Открыть AI-помощника" className="ai-assistant-button" onClick={() => setAssistantOpen(true)} type="button">✨ <span>Помощник</span></button> : null}
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
        {isDemoProfile(profile) ? (
          <aside className="demo-mode-banner" data-testid="demo-mode-banner">
            <strong>Демо-режим</strong>
            <span>{DEMO_MUTATION_NOTICE} AI: до 12 запросов и 3 голосовых записей в день.</span>
          </aside>
        ) : null}
        {error ? (
          <p className="shell-notice" role="alert">
            {error}
          </p>
        ) : null}
        <Outlet />
      </div>
      {assistantOpen ? <Suspense fallback={<div className="assistant-loading" role="status">Загружаем помощника…</div>}><TeacherAIAssistant initialCommand={assistantPrompt} onClose={() => setAssistantOpen(false)} /></Suspense> : null}
    </div>
  );
}

# DESIGN SYSTEM v1

## Основа
Одна компонентная система, две темы.

Референсы:
- `references/light-theme-reference.png`
- `references/dark-theme-reference.png`

Не копировать макеты пиксель-в-пиксель.

## Light
- white / very light lavender;
- violet / pink / blue accents;
- мягкие градиенты и тени;
- заметная, но взрослая геймификация.

Не делать стерильно-корпоративно или детсадовски.

## Dark
- navy / indigo / plum;
- не почти чёрный;
- violet + coral + electric lilac;
- яркие reward элементы.

Не делать meditation/wellness mood, excessive glow или cyberpunk.

## Reusable components
AppShell, Sidebar, BottomNav, ThemeToggle, StatCard, LessonCard, HomeworkCard, StudentCard, ProgressRing, ExamTaskStatusChip, AchievementBadge, XPBar, StreakChip, EmptyState, Modal/Drawer, FormField, ConfirmationDialog, TimezoneSwitcher, CalendarMonth, MockExamReport.

## Icons
Lucide React для системных иконок.

Отдельные assets позже только для:
- achievements;
- level crystal/badge;
- empty states;
- reward popups.

## Анимации
hover/press, theme transition, progress update, achievement popup, modal/drawer.
Без постоянных фоновых motion effects.

## Responsive foundation

Контрольные viewport: 360, 768, 1024 и 1440 px.

- Student shell начинается с одной колонки и нижней навигации; планшет получает
  самостоятельную двухколоночную компоновку, где это полезно.
- Teacher shell использует sidebar и несколько колонок на desktop, а на узких
  экранах перестраивает навигацию, таблицы, календарь и аналитику без потери
  функций.
- Компоненты используют fluid sizing, CSS Grid/Flexbox и container-friendly
  ограничения вместо фиксированной ширины.
- Минимальный touch target — 44×44 CSS px.
- Страница не создаёт горизонтальный скролл; длинный текст и внешние ссылки
  безопасно переносятся.
- Modal/Drawer ограничивается viewport, формы не требуют горизонтального скролла,
  графики получают responsive container, а таблицы имеют карточное представление
  на узких экранах.

import { useState } from "react";
import { Link } from "react-router-dom";

const actions = [
  ["Ученик", "/teacher/students?create=student", "♙"],
  ["Урок", "/teacher/calendar?create=lesson", "▦"],
  ["ДЗ", "/teacher/homeworks?create=homework", "✓"],
  ["Пробник", "/teacher/mock-exams?create=mock", "◎"],
  ["Материал", "/teacher/materials?create=material", "▤"],
] as const;

export function QuickCreate() {
  const [open, setOpen] = useState(false);
  return <div className="quick-create"><button aria-expanded={open} className="primary-button primary-button--fit" onClick={() => setOpen((value) => !value)} type="button">＋ Создать</button>{open ? <div className="quick-create__menu" role="menu">{actions.map(([label, to, icon]) => <Link key={label} onClick={() => setOpen(false)} role="menuitem" to={to}><span aria-hidden="true">{icon}</span>{label}</Link>)}</div> : null}</div>;
}

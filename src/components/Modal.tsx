import { useEffect, type ReactNode } from "react";

export function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose(): void; className?: string }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation">
      <section aria-label={title} aria-modal="true" className={`responsive-modal ${className}`.trim()} role="dialog">
        <header className="modal-heading"><h2>{title}</h2><button aria-label="Закрыть" className="icon-button" onClick={onClose} type="button">×</button></header>
        {children}
      </section>
    </div>
  );
}

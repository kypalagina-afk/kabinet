import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose(): void; className?: string }) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
    const preferred = dialogRef.current?.querySelector<HTMLElement>("[autofocus], [data-autofocus='true']");
    (preferred ?? focusable()[0])?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) return;
      const firstControl = controls[0]!;
      const lastControl = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === firstControl) {
        event.preventDefault();
        lastControl.focus();
      } else if (!event.shiftKey && document.activeElement === lastControl) {
        event.preventDefault();
        firstControl.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation">
      <section aria-label={title} aria-modal="true" className={`responsive-modal ${className}`.trim()} ref={dialogRef} role="dialog">
        <header className="modal-heading"><h2>{title}</h2><button aria-label="Закрыть" className="icon-button" onClick={onClose} type="button">×</button></header>
        {children}
      </section>
    </div>
  );
}

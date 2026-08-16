"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function DromapDialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  maxWidthClassName = "max-w-lg",
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  maxWidthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[95000] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dromap-dialog-title"
        className={`w-full ${maxWidthClassName} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 id="dromap-dialog-title" className="text-base font-black text-slate-950">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
          >
            ×
          </button>
        </header>
        {children ? <div className="px-5 py-5">{children}</div> : null}
        {footer ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}

"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type DromapButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success";

const VARIANT_CLASSES: Record<DromapButtonVariant, string> = {
  primary:
    "border-teal-600 bg-teal-600 text-white hover:border-teal-500 hover:bg-teal-500 disabled:border-slate-300 disabled:bg-slate-300",
  secondary:
    "border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400",
  ghost:
    "border-transparent bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-400",
  danger:
    "border-red-600 bg-red-600 text-white hover:border-red-500 hover:bg-red-500 disabled:border-slate-300 disabled:bg-slate-300",
  success:
    "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-500 hover:bg-emerald-500 disabled:border-slate-300 disabled:bg-slate-300",
};

type DromapButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: DromapButtonVariant;
  icon?: ReactNode;
  fullWidth?: boolean;
};

export function DromapButton({
  variant = "secondary",
  icon,
  fullWidth = false,
  className = "",
  children,
  type = "button",
  ...props
}: DromapButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {icon ? <span className="shrink-0" aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}

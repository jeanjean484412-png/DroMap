import type { ButtonHTMLAttributes, ReactNode } from "react";

export function MapDockButton({
  icon,
  label,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      {...props}
      className={`group pointer-events-auto flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border bg-white px-3 text-sm font-bold shadow-lg transition-colors ${className}`}
    >
      <span className="flex shrink-0 items-center" aria-hidden="true">{icon}</span>
      {label ? <span className="ml-2 whitespace-nowrap text-xs">{label}</span> : null}
      <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 group-focus-visible:max-w-48 group-focus-visible:opacity-100 group-hover:max-w-48 group-hover:opacity-100 motion-reduce:transition-none">
        <span className="pl-2">{children}</span>
      </span>
    </button>
  );
}

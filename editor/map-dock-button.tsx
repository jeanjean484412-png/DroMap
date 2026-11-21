import type { ButtonHTMLAttributes, ReactNode } from "react";

export function MapDockButton({
  icon,
  label,
  children,
  className = "",
  revealDetails = false,
  framedDetails = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; label?: string; revealDetails?: boolean; framedDetails?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`group/map-dock pointer-events-auto flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border bg-white px-3 text-sm font-bold shadow-lg transition-colors ${className}`}
    >
      <span className="flex shrink-0 items-center" aria-hidden="true">{icon}</span>
      {label ? <span className="ml-2 whitespace-nowrap text-xs">{label}</span> : null}
      <span className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 group-focus-visible/map-dock:max-w-48 group-focus-visible/map-dock:opacity-100 group-hover/map-dock:max-w-48 group-hover/map-dock:opacity-100 motion-reduce:transition-none ${revealDetails ? "max-w-48 opacity-100" : "max-w-0 opacity-0"}`}>
        {framedDetails ? (
          <span className="ml-2 block max-w-40 truncate rounded-md border border-current/20 bg-current/5 px-2 py-1 text-xs leading-none">
            {children}
          </span>
        ) : <span className="pl-2">{children}</span>}
      </span>
    </button>
  );
}

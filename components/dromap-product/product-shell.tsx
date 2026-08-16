import type { ReactNode } from "react";
import { DromapProductNavigation } from "./product-navigation";
import { DromapCloudStatusIndicator } from "./cloud-status-indicator";

export function DromapProductShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-950">
      <DromapProductNavigation />
      <main className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-7 py-5">
          <div>
            <h1 className="text-xl font-black tracking-tight">{title}</h1>
            {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DromapCloudStatusIndicator />
            {actions}
          </div>
        </header>
        <div className="p-7">{children}</div>
      </main>
    </div>
  );
}

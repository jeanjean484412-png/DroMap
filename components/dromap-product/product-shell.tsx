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
    <div className="flex h-dvh overflow-hidden bg-[#f7f9f8] pt-16 text-slate-950 lg:pt-0">
      <DromapProductNavigation />
      <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#fbfcfb] px-4 py-4 sm:px-6 sm:py-5 lg:px-7">
          <div className="min-w-0">
            <h1 className="text-lg font-black tracking-tight sm:text-xl">{title}</h1>
            {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <DromapCloudStatusIndicator />
            {actions}
          </div>
        </header>
        <div className="p-4 sm:p-6 lg:p-7">{children}</div>
      </main>
    </div>
  );
}

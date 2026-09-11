import type { ReactNode } from "react";

export function DromapEmptyState({
  title,
  description,
  action,
  icon = "◇",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-xl text-teal-700">
        {icon}
      </div>
      <h2 className="mt-4 text-base font-black text-slate-950">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

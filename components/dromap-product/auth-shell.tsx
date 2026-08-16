import Link from "next/link";
import type { ReactNode } from "react";

export function DromapAuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 text-slate-950">
      <div className="w-full max-w-md">
        <Link href="/dashboard" className="mx-auto mb-6 flex w-fit items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 font-black text-white">D</span>
          <span className="text-lg font-black tracking-tight">DroMap</span>
        </Link>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50">
          <h1 className="text-2xl font-black tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </main>
  );
}

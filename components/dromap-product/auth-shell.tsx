import Link from "next/link";
import type { ReactNode } from "react";
import { DromapLogoMark } from "./dromap-brand";

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
    <main className="grid min-h-screen place-items-center bg-[#f7f9f8] px-4 py-10 text-slate-950">
      <div className="w-full max-w-md">
        <Link href="/accueil" className="mx-auto mb-6 flex w-fit items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-[#b9ddd7] bg-[#e9f6f3]">
            <DromapLogoMark className="h-10 w-10 object-contain" />
          </span>
          <span className="text-lg font-black tracking-tight text-[#123a59]">DroMap</span>
        </Link>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
          <h1 className="text-2xl font-black tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </main>
  );
}

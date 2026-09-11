import Link from "next/link";
import type { ReactNode } from "react";

import { DROMAP_LEGAL_LAST_UPDATED } from "@/lib/dromap/legal-public";
import { DromapLegalContactLink } from "./legal-contact-link";
import { DromapBrandBlock } from "./dromap-brand";

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
  missingConfiguration?: string[];
  lastUpdated?: string;
};

export function DromapLegalPageShell({
  eyebrow,
  title,
  intro,
  children,
  missingConfiguration = [],
  lastUpdated = DROMAP_LEGAL_LAST_UPDATED,
}: LegalPageShellProps) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8 lg:py-5">
          <Link href="/accueil" aria-label="Accueil DroMap">
            <DromapBrandBlock markClassName="h-14 w-auto" titleClassName="text-[1.45rem] font-black tracking-tight text-[#123a59]" subtitle="Éditeur cartographique" />
          </Link>
          <nav className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-slate-600 md:w-auto md:justify-end md:gap-5" aria-label="Navigation juridique">
            <Link href="/confidentialite" className="hover:text-slate-950">Confidentialité</Link>
            <Link href="/conditions-generales" className="hover:text-slate-950">Conditions générales</Link>
            <Link href="/credits" className="hover:text-slate-950">Crédits</Link>
            <Link href="/dashboard" className="rounded-xl bg-slate-950 px-4 py-2.5 font-black text-white hover:bg-slate-800">Ouvrir DroMap</Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">{eyebrow}</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">{intro}</p>
          <div className="mt-5 text-sm font-semibold text-slate-500">Dernière mise à jour : {lastUpdated}</div>

          {process.env.VERCEL_ENV !== "production" && missingConfiguration.length > 0 ? (
            <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <strong>Préproduction — informations d’éditeur à compléter.</strong>{" "}
              Les textes juridiques sont structurés et reliés au produit, mais ces variables doivent être renseignées avant le passage en production : {missingConfiguration.join(", ")}.
            </div>
          ) : null}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12 lg:px-8 lg:py-12">
        <aside className="self-start rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Documents DroMap</div>
          <div className="mt-3 space-y-1">
            <Link href="/confidentialite" className="block rounded-lg px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">Politique de confidentialité</Link>
            <Link href="/conditions-generales" className="block rounded-lg px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">Conditions générales</Link>
            <Link href="/credits" className="block rounded-lg px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">Crédits & licences</Link>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
            Question juridique ou confidentialité ?<br />
            <DromapLegalContactLink className="font-bold text-teal-700 hover:underline">contact@dromap.fr</DromapLegalContactLink>
          </div>
        </aside>

        <article className="min-w-0 space-y-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:space-y-10 lg:p-8">
          {children}
        </article>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <span>© 2026 DroMap</span>
          <div className="flex gap-4">
            <Link href="/confidentialite" className="hover:text-slate-900">Confidentialité</Link>
            <Link href="/conditions-generales" className="hover:text-slate-900">Conditions générales</Link>
            <DromapLegalContactLink className="hover:text-slate-900">Contact</DromapLegalContactLink>
          </div>
        </div>
      </footer>
    </main>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">{children}</div>
    </section>
  );
}

export function LegalCallout({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm leading-6 text-teal-950">{children}</div>;
}

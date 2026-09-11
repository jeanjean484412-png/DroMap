import type { Metadata } from "next";
import Link from "next/link";

import { DromapLogoMark } from "@/components/dromap-product/dromap-brand";

export const metadata: Metadata = {
  title: "Page introuvable",
  description: "La page demandée n’existe pas ou n’est plus disponible sur DroMap.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 py-12">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white px-7 py-8 text-center shadow-sm sm:px-10 sm:py-10">
        <Link
          href="/"
          aria-label="Retour à DroMap"
          className="inline-flex items-center justify-center gap-3"
        >
          <span className="grid h-14 w-14 place-items-center rounded-xl border border-[#b9ddd7] bg-[#e9f6f3]">
            <DromapLogoMark className="h-11 w-11 object-contain" />
          </span>
          <span className="text-2xl font-bold tracking-tight text-[#123a59]">DroMap</span>
        </Link>

        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-[#2b8e88]">Erreur 404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Page introuvable</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600">
          L’adresse est peut-être incorrecte, ou la page demandée n’est plus disponible.
        </p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#123a59] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f314b]"
          >
            Retour à DroMap
          </Link>
          <Link
            href="/library"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#2b8e88] hover:text-[#123a59]"
          >
            Voir les cartes publiques
          </Link>
        </div>
      </section>
    </main>
  );
}

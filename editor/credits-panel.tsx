"use client";

import { useEffect, useMemo, useState } from "react";

import { DROMAP_THIRD_PARTY_CREDITS } from "@/lib/dromap/credits";
import {
  bringFloatingPanelToFront,
  getInitialFloatingPanelZIndex,
} from "./floating-panel-z-index";

const CATEGORY_LABELS: Record<string, string> = {
  fond: "Fonds de carte",
  donnees: "Données géographiques",
  icones: "Icônes",
  bibliotheques: "Bibliothèques",
};

export function CreditsPanel({ docked = false }: { docked?: boolean } = {}) {
  const [hasMounted, setHasMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [panelZIndex, setPanelZIndex] = useState(getInitialFloatingPanelZIndex());

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const creditsByCategory = useMemo(() => {
    return DROMAP_THIRD_PARTY_CREDITS.reduce(
      (groups, credit) => {
        const group = groups[credit.category] ?? [];
        group.push(credit);
        groups[credit.category] = group;
        return groups;
      },
      {} as Record<string, typeof DROMAP_THIRD_PARTY_CREDITS>,
    );
  }, []);

  if (!hasMounted) {
    return null;
  }

  const triggerButton = (
    <button
      type="button"
      onClick={() => {
        setIsOpen((value) => !value);
        setPanelZIndex(bringFloatingPanelToFront());
      }}
      className={
        docked
          ? "h-11 shrink-0 rounded-xl border border-slate-200 bg-white/95 px-4 text-sm font-black text-slate-700 shadow-lg backdrop-blur transition hover:bg-slate-50"
          : "absolute right-4 top-4 z-[1350] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-lg backdrop-blur transition hover:bg-slate-50"
      }
      title="Afficher les crédits et licences tierces"
      aria-expanded={isOpen}
    >
      Crédits / licences
    </button>
  );

  const panel = isOpen ? (
    <aside
      className={
        docked
          ? "absolute left-0 top-[calc(100%+0.5rem)] max-h-[calc(100vh-8rem)] w-[24rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-4 text-xs text-slate-700 shadow-lg backdrop-blur"
          : "absolute right-4 top-16 max-h-[calc(100vh-5rem)] w-[24rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-4 text-xs text-slate-700 shadow-lg backdrop-blur"
      }
      style={{ zIndex: panelZIndex }}
      onMouseDown={() => setPanelZIndex(bringFloatingPanelToFront())}
      onFocusCapture={() => setPanelZIndex(bringFloatingPanelToFront())}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-sm font-black text-slate-950">
            Crédits et licences
          </h2>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            Les crédits cartographiques sont affichés sur la carte, la preview
            et les exports quand la source correspondante est visible.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
        >
          Fermer
        </button>
      </div>

      <a
        href="/credits"
        className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-black text-slate-900 transition hover:border-teal-300 hover:text-teal-700"
      >
        <span>Voir la page complète Crédits &amp; licences</span>
        <span aria-hidden="true">→</span>
      </a>

      <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-[11px] leading-snug text-teal-950">
        <p className="font-black">Inventaire logiciel exhaustif</p>
        <p className="mt-1">
          Les 384 paquets détectés dans l’arbre node_modules fourni, avec les textes de licence embarqués, sont publiés avec l’application.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href="/THIRD_PARTY_LICENSES.txt"
            target="_blank"
            rel="noreferrer"
            className="font-black underline underline-offset-2"
          >
            Textes de licences
          </a>
          <a
            href="/dromap_dependency_licenses.csv"
            target="_blank"
            rel="noreferrer"
            className="font-black underline underline-offset-2"
          >
            Inventaire CSV
          </a>
        </div>
      </div>

      <div className="mt-3 space-y-4">
        {Object.entries(creditsByCategory).map(([category, credits]) => (
          <section key={category} className="space-y-2">
            <h3 className="text-[11px] font-black uppercase tracking-wide text-slate-500">
              {CATEGORY_LABELS[category] ?? category}
            </h3>
            <div className="space-y-2">
              {credits.map((credit) => (
                <article
                  key={credit.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={credit.href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-black text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-teal-700"
                    >
                      {credit.title}
                    </a>
                    {credit.visibleOnMap ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        carte/export
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 leading-snug text-slate-600">
                    {credit.usage}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    Licence / condition : {credit.license}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  ) : null;

  if (docked) {
    return (
      <div className="pointer-events-auto relative shrink-0">
        {triggerButton}
        {panel}
      </div>
    );
  }

  return (
    <>
      {triggerButton}
      {panel}
    </>
  );
}

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

export function CreditsPanel() {
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

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen((value) => !value);
          setPanelZIndex(bringFloatingPanelToFront());
        }}
        className="absolute right-4 top-4 z-[1000] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-lg backdrop-blur transition hover:bg-slate-50"
        title="Afficher les crédits et licences tierces"
      >
        Crédits
      </button>

      {isOpen ? (
        <aside
          className="absolute right-4 top-16 max-h-[calc(100vh-5rem)] w-[24rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-4 text-xs text-slate-700 shadow-2xl backdrop-blur"
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
                          className="font-black text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-indigo-700"
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
      ) : null}
    </>
  );
}

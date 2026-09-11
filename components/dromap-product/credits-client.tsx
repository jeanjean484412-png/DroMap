"use client";

import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapProductShell } from "./product-shell";
import { DROMAP_THIRD_PARTY_CREDITS } from "@/lib/dromap/credits";

const CATEGORY_LABELS: Record<string, string> = {
  fond: "Fonds de carte",
  donnees: "Données géographiques",
  icones: "Icônes",
  bibliotheques: "Bibliothèques et services",
};

function groupCredits() {
  return DROMAP_THIRD_PARTY_CREDITS.reduce(
    (groups, credit) => {
      const group = groups[credit.category] ?? [];
      group.push(credit);
      groups[credit.category] = group;
      return groups;
    },
    {} as Record<string, typeof DROMAP_THIRD_PARTY_CREDITS>,
  );
}

function CreditsContent() {
  const creditsByCategory = groupCredits();

  return (
    <DromapProductShell
      title="Crédits"
      description="Sources cartographiques, données, services et logiciels utilisés par DroMap."
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-black text-slate-950">Sources cartographiques</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Les cartes DroMap peuvent combiner plusieurs fonds et jeux de données. Les mentions
          obligatoires sont ajoutées automatiquement aux cartes concernées.
        </p>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <article className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-black text-slate-950">OpenFreeMap, OpenMapTiles et OpenStreetMap</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Les fonds Classique et Clair utilisent OpenFreeMap, le projet OpenMapTiles et des données OpenStreetMap.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-black text-slate-950">IGN / Géoplateforme</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Le Plan IGN, les photographies aériennes et certaines données françaises proviennent de l’IGN et de la Géoplateforme.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-black text-slate-950">Natural Earth</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Plusieurs fonds blancs mondiaux et continentaux utilisent des frontières issues de Natural Earth.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-black text-slate-950">France — IGN Admin Express COG</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Les contours des régions et départements des fonds blancs France reposent sur les données IGN Admin Express COG 2018, diffusées au format GeoJSON par le projet france-geojson.
            </p>
          </article>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">Sources, services et logiciels</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Retrouvez ici les principales ressources tierces utilisées par DroMap.
            </p>
          </div>
          <a
            href="/THIRD_PARTY_LICENSES.txt"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black shadow-sm transition hover:border-teal-300 hover:text-teal-700"
          >
            Notices de licences
          </a>
        </div>

        <div className="mt-6 space-y-7">
          {Object.entries(creditsByCategory).map(([category, credits]) => (
            <section key={category}>
              <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                {CATEGORY_LABELS[category] ?? category}
              </h3>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {credits.map((credit) => (
                  <article key={credit.id} className="rounded-xl border border-slate-200 p-4">
                    <a
                      href={credit.href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-black text-slate-950 underline decoration-slate-300 underline-offset-4 hover:text-teal-700"
                    >
                      {credit.title}
                    </a>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{credit.usage}</p>
                    <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                      Licence / conditions : {credit.license}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">
        <h2 className="font-black text-slate-950">Contenus ajoutés dans une carte</h2>
        <p className="mt-2">
          Les images, SVG, marqueurs, GeoJSON ou autres fichiers ajoutés à une carte peuvent avoir leurs propres auteurs et conditions d’utilisation.
        </p>
      </section>
    </DromapProductShell>
  );
}

export function DromapCreditsClient() {
  return (
    <DromapProductBootstrap>
      <CreditsContent />
    </DromapProductBootstrap>
  );
}

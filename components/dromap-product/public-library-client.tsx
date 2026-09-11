"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapProductShell } from "./product-shell";
import { DromapEmptyState } from "@/components/dromap-ui/empty-state";
import { getDromapPublicationAccessLabel, type DromapPublicPublication } from "@/lib/dromap/publications";

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}

function PublicLibraryContent() {
  const [publications, setPublications] = useState<DromapPublicPublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch("/api/dromap/publications", { method: "GET", cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { publications?: DromapPublicPublication[]; error?: string }
          | null;
        if (cancelled) return;
        if (!response.ok) {
          setError(payload?.error ?? "La bibliothèque publique ne peut pas être chargée.");
          return;
        }
        setPublications(Array.isArray(payload?.publications) ? payload.publications : []);
      })
      .catch(() => {
        if (!cancelled) setError("La bibliothèque publique ne peut pas être chargée.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    const filtered = normalizedQuery
      ? publications.filter((publication) => {
          const haystack = [
            publication.title,
            publication.description,
            publication.authorName ?? "",
            ...publication.tags,
          ].join(" ").toLocaleLowerCase("fr");
          return haystack.includes(normalizedQuery);
        })
      : [...publications];
    return filtered.sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "fr", { sensitivity: "base" })
        : b.publishedAt.localeCompare(a.publishedAt),
    );
  }, [publications, query, sort]);

  return (
    <DromapProductShell
      title="Cartes publiques"
      description="Parcours librement les cartes publiées par la communauté DroMap."
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4 text-sm leading-6 text-teal-950">
          <strong className="block font-black">Bibliothèque publique DroMap</strong>
          Tout le monde peut consulter les cartes gratuitement. Chaque créateur choisit ensuite si sa carte reste en lecture seule, peut être exportée, ou peut aussi être copiée et modifiée.
        </div>

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="min-w-[16rem] flex-1 text-sm font-semibold text-slate-800">
            Rechercher
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Titre, créateur, mot-clé…"
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Trier par
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value === "title" ? "title" : "recent")}
              className="mt-2 block rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            >
              <option value="recent">Plus récentes</option>
              <option value="title">Titre</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="dromap-skeleton aspect-[16/9]" />
                <div className="space-y-3 p-4">
                  <div className="dromap-skeleton h-4 w-2/3 rounded-md" />
                  <div className="dromap-skeleton h-3 w-1/2 rounded-md" />
                  <div className="dromap-skeleton h-3 w-full rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-900">{error}</div>
        ) : visible.length === 0 ? (
          <DromapEmptyState
            title={publications.length === 0 ? "Aucune carte publique pour le moment" : "Aucun résultat"}
            description={publications.length === 0 ? "Les premières cartes publiées apparaîtront ici." : "Essaie un autre terme de recherche."}
            icon="◎"
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((publication) => (
              <Link
                key={publication.slug}
                href={`/library/${publication.slug}`}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-teal-300"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={publication.thumbnailDataUrl}
                    alt={`Aperçu de ${publication.title}`}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain transition duration-300 group-"
                    onContextMenu={(event) => event.preventDefault()}
                  />
                  <div className="absolute left-3 top-3 rounded-full border border-white/70 bg-slate-950/75 px-2.5 py-1 text-[11px] font-black text-white">
                    Publique
                  </div>
                  <div className="absolute bottom-3 right-3 rounded-full border border-white/70 bg-white px-2.5 py-1 text-[10px] font-black text-slate-800 shadow-sm">
                    {getDromapPublicationAccessLabel(publication.accessMode)}
                  </div>
                </div>
                <div className="p-4">
                  <h2 className="line-clamp-2 font-black text-slate-950">{publication.title}</h2>
                  <div className="mt-1 text-xs text-slate-500">
                    {publication.authorName ? `${publication.authorName} · ` : ""}publiée le {formatDate(publication.publishedAt)}
                  </div>
                  {publication.description ? (
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{publication.description}</p>
                  ) : null}
                  {publication.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {publication.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DromapProductShell>
  );
}

export function DromapPublicLibraryClient() {
  return (
    <DromapProductBootstrap>
      <PublicLibraryContent />
    </DromapProductBootstrap>
  );
}

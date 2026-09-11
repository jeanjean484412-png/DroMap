"use client";

import { useEffect, useMemo, useState } from "react";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { getProjectStatusLabel } from "@/lib/dromap/product";
import { useDromapProductStore } from "@/stores/dromap-product";
import { useEditorCustomMarkersStore } from "@/stores/editor-custom-markers";
import { useEditorExportStore } from "@/stores/editor-export";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorGeoJsonLayersStore } from "@/stores/editor-geojson-layers";
import { useEditorLayersStore } from "@/stores/editor-layers";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1).replace(".", ",")} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

export function DromapProjectInfoDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const project = useDromapProductStore((state) =>
    state.projects.find((item) => item.id === projectId),
  );
  const userMode = useDromapProductStore((state) => state.userMode);
  const features = useEditorFeaturesStore((state) => state.features);
  const layers = useEditorLayersStore((state) => state.layers);
  const geoJsonLayers = useEditorGeoJsonLayersStore(
    (state) => state.geoJsonLayers,
  );
  const customMarkers = useEditorCustomMarkersStore(
    (state) => state.customMarkers,
  );
  const workspaceBounds = useEditorWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const exportFormat = useEditorExportStore((state) => state.exportFormat);

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }

    window.addEventListener("dromap:open-project-info", handleOpen);
    return () =>
      window.removeEventListener("dromap:open-project-info", handleOpen);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const estimatedSize = useMemo(() => {
    try {
      return new Blob([
        JSON.stringify({
          features,
          layers,
          geoJsonLayers,
          customMarkers,
          workspaceBounds,
        }),
      ]).size;
    } catch {
      return 0;
    }
  }, [customMarkers, features, geoJsonLayers, layers, workspaceBounds]);

  if (!open || !project) return null;

  const basemap = getDromapBasemapConfig(project.setup.basemapId);
  const geoJsonFeatureCount = geoJsonLayers.reduce(
    (total, layer) => total + (layer.featureCount ?? 0),
    0,
  );
  const visibleCustomMarkerCount = customMarkers.filter(
    (marker) => !marker.hiddenFromLibrary,
  ).length;

  return (
    <div
      className="fixed inset-0 z-[6200] flex items-center justify-center bg-slate-950/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dromap-project-info-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-teal-600">
              Informations du projet
            </div>
            <h2 id="dromap-project-info-title" className="mt-1 text-xl font-black text-slate-950">
              {project.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Vue synthétique du contenu, du rendu et de l’état de sauvegarde.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label="Fermer"
          >
            ×
          </button>
        </header>

        <div className="max-h-[calc(90vh-9rem)] overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-black text-slate-950">Projet</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Créateur</dt><dd className="text-right font-semibold text-slate-900">{project.creatorName}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Accès</dt><dd className="text-right font-semibold text-slate-900">{userMode === "guest" ? "Projet invité · cet appareil" : "Privé · enregistré en ligne"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Création</dt><dd className="text-right font-semibold text-slate-900">{formatDate(project.createdAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Modification</dt><dd className="text-right font-semibold text-slate-900">{formatDate(project.updatedAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Dernière sauvegarde</dt><dd className="text-right font-semibold text-slate-900">{formatDate(project.lastSavedAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">État</dt><dd className="text-right font-semibold text-slate-900">{getProjectStatusLabel(project, userMode)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Fichier importé</dt><dd className="max-w-52 truncate text-right font-semibold text-slate-900">{project.importedFileName ?? "Aucun"}</dd></div>
              </dl>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-black text-slate-950">Carte et rendu</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Fond</dt><dd className="text-right font-semibold text-slate-900">{basemap.label}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Zone validée</dt><dd className="text-right font-semibold text-slate-900">{workspaceBounds ? "Oui" : "Non"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Format de composition</dt><dd className="text-right font-semibold text-slate-900">{exportFormat}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Miniature</dt><dd className="text-right font-semibold text-slate-900">{project.thumbnailDataUrl ? "Générée" : "À générer"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Volume estimé</dt><dd className="text-right font-semibold text-slate-900">{formatBytes(estimatedSize)}</dd></div>
              </dl>
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-black text-slate-950">Contenu de la carte</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["Objets", features.length],
                ["Calques DroMap", layers.length],
                ["Calques GeoJSON", geoJsonLayers.length],
                ["Entités GeoJSON", geoJsonFeatureCount],
                ["Marqueurs perso.", visibleCustomMarkerCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center">
                  <div className="text-2xl font-black text-slate-950">{Number(value).toLocaleString("fr-FR")}</div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">{label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-950">
            Les paramètres de fond, de zone, de niveau de détail, d’écritures, de légende, d’échelle, de flèche nord et de titre de carte font partie de la sauvegarde complète du projet.
          </section>
        </div>
      </section>
    </div>
  );
}

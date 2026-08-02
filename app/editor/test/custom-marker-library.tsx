"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DroMapMarkerSymbol } from "@/lib/dromap/feature";
import {
  createCustomMarkerId,
  useEditorTestCustomMarkersStore,
  type DroMapCustomMarkerDefinition,
} from "@/stores/editor-test-custom-markers";
import { CustomMarkerDesignerModal } from "./custom-marker-designer-modal";
import { normalizeImportedMarkerImage } from "./custom-marker-rendering";
import { getMarkerSymbolHtml } from "./marker-symbol";

type CustomMarkerLibraryProps = {
  selectedSymbol?: DroMapMarkerSymbol | null;
  onSelect: (symbol: DroMapMarkerSymbol) => void;
  className?: string;
};

function MarkerThumbnail({ marker }: { marker: DroMapCustomMarkerDefinition }) {
  const html = useMemo(
    () =>
      getMarkerSymbolHtml(
        {
          properties: {
            style: {
              markerSize: 42,
              opacity: 1,
              color: "#111827",
            },
            symbol: {
              type: marker.kind === "drawn" ? "drawn" : "custom-image",
              id: marker.id,
            },
          },
        },
        { size: 42 },
      ),
    [marker.id, marker.kind, marker.updatedAt],
  );

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none inline-flex h-12 w-12 items-center justify-center"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function CustomMarkerLibrary({
  selectedSymbol,
  onSelect,
  className = "",
}: CustomMarkerLibraryProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const customMarkers = useEditorTestCustomMarkersStore(
    (state) => state.customMarkers,
  );
  const loadFromStorage = useEditorTestCustomMarkersStore(
    (state) => state.loadFromStorage,
  );
  const addCustomMarker = useEditorTestCustomMarkersStore(
    (state) => state.addCustomMarker,
  );
  const updateCustomMarker = useEditorTestCustomMarkersStore(
    (state) => state.updateCustomMarker,
  );
  const removeCustomMarker = useEditorTestCustomMarkersStore(
    (state) => state.removeCustomMarker,
  );
  const visibleCustomMarkers = useMemo(
    () => customMarkers.filter((marker) => !marker.hiddenFromLibrary),
    [customMarkers],
  );

  const [designerMarker, setDesignerMarker] =
    useState<DroMapCustomMarkerDefinition | null | undefined>(undefined);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  async function handleImportFile(file: File | null) {
    if (!file || isImporting) return;

    try {
      setIsImporting(true);
      setImportStatus("Préparation de l’image…");
      const dataUrl = await normalizeImportedMarkerImage(file);
      const name = file.name.replace(/\.[^.]+$/, "").trim() || "Marqueur importé";
      const marker = addCustomMarker({
        id: createCustomMarkerId("image"),
        name,
        kind: "image",
        dataUrl,
      });
      onSelect({ type: "custom-image", id: marker.id });
      setImportStatus(`« ${marker.name} » ajouté à Mes marqueurs.`);
    } catch (error) {
      setImportStatus(
        error instanceof Error
          ? error.message
          : "L’image n’a pas pu être importée.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className={className}>
      <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-blue-50 p-3">
        <div className="mb-2">
          <strong className="block text-xs text-slate-900">
            Créer mes propres marqueurs
          </strong>
          <span className="text-[10px] leading-relaxed text-slate-500">
            Dessine un symbole avec des formes, lignes et flèches, ou importe une image détourée.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDesignerMarker(null)}
            className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-violet-300 bg-white px-2 py-3 text-center text-violet-800 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-500 hover:shadow-md"
          >
            <span className="text-2xl">✎</span>
            <strong className="text-[11px]">Dessiner un marqueur</strong>
          </button>
          <button
            type="button"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-blue-300 bg-white px-2 py-3 text-center text-blue-800 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-500 hover:shadow-md disabled:cursor-wait disabled:opacity-60"
          >
            <span className="text-2xl">⇧</span>
            <strong className="text-[11px]">
              {isImporting ? "Import en cours…" : "Importer un marqueur"}
            </strong>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/webp,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = "";
            void handleImportFile(file);
          }}
        />

        {importStatus ? (
          <div className="mt-2 rounded-lg bg-white/80 px-2 py-1.5 text-[10px] leading-relaxed text-slate-600">
            {importStatus}
          </div>
        ) : null}
      </section>

      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <strong className="block text-xs text-slate-900">Mes marqueurs</strong>
            <span className="text-[10px] text-slate-500">
              Disponibles sur la carte, dans la légende et dans les exports.
            </span>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
            {visibleCustomMarkers.length}
          </span>
        </div>

        {visibleCustomMarkers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center text-[11px] leading-relaxed text-slate-500">
            Tes marqueurs dessinés ou importés apparaîtront ici.
          </div>
        ) : (
          <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
            {visibleCustomMarkers.map((marker) => {
              const symbolType =
                marker.kind === "drawn" ? "drawn" : "custom-image";
              const selected =
                selectedSymbol?.type === symbolType &&
                selectedSymbol.id === marker.id;

              return (
                <div
                  key={marker.id}
                  className={[
                    "relative rounded-xl border bg-white p-1.5 transition",
                    selected
                      ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100"
                      : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/40",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onSelect({ type: symbolType, id: marker.id })
                    }
                    className="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center"
                    title={marker.name}
                  >
                    <MarkerThumbnail marker={marker} />
                    <span className="line-clamp-2 min-h-6 text-[9px] font-bold leading-tight text-slate-700">
                      {marker.name}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeCustomMarker(marker.id);
                      if (selected) {
                        onSelect({ type: "builtin", id: "circle" });
                      }
                      setImportStatus(`« ${marker.name} » a été supprimé de Mes marqueurs.`);
                    }}
                    className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-md border border-red-200 bg-white text-[12px] font-black text-red-600 shadow-sm hover:border-red-400 hover:bg-red-50"
                    title="Supprimer de Mes marqueurs"
                    aria-label={`Supprimer ${marker.name} de Mes marqueurs`}
                  >
                    ×
                  </button>

                  {marker.kind === "drawn" ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDesignerMarker(marker);
                      }}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-[11px] font-black text-slate-600 shadow-sm hover:border-violet-300 hover:text-violet-700"
                      title="Modifier ce marqueur dessiné"
                      aria-label={`Modifier ${marker.name}`}
                    >
                      ✎
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {designerMarker !== undefined ? (
        <CustomMarkerDesignerModal
          initialMarker={designerMarker}
          onCancel={() => setDesignerMarker(undefined)}
          onSave={({ name, elements, dataUrl }) => {
            if (designerMarker) {
              updateCustomMarker(designerMarker.id, {
                name,
                elements,
                dataUrl,
              });
              onSelect({ type: "drawn", id: designerMarker.id });
            } else {
              const marker = addCustomMarker({
                id: createCustomMarkerId("drawn"),
                name,
                kind: "drawn",
                dataUrl,
                elements,
              });
              onSelect({ type: "drawn", id: marker.id });
            }
            setDesignerMarker(undefined);
          }}
        />
      ) : null}
    </div>
  );
}

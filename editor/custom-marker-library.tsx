"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DroMapMarkerSymbol } from "@/lib/dromap/feature";
import {
  createCustomMarkerId,
  useEditorCustomMarkersStore,
  type DroMapCustomMarkerDefinition,
} from "@/stores/editor-custom-markers";
import { CustomMarkerDesignerModal } from "./custom-marker-designer-modal";
import { normalizeImportedMarkerImage } from "./custom-marker-rendering";
import { getMarkerSymbolHtml } from "./marker-symbol";
import { useDromapProductRuntime } from "@/components/dromap-product/product-runtime";

type CustomMarkerLibraryProps = {
  selectedSymbol?: DroMapMarkerSymbol | null;
  onSelect: (symbol: DroMapMarkerSymbol) => void;
  className?: string;
  selectionOnly?: boolean;
};

function LockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`block shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v2" />
    </svg>
  );
}

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
  selectionOnly = false,
}: CustomMarkerLibraryProps) {
  const runtime = useDromapProductRuntime();
  const keepsPersonalLibrary =
    !runtime.enabled ||
    runtime.capabilities.canSaveCustomMarkersToLibrary;
  const canCreateCustomMarkers =
    !runtime.enabled || runtime.capabilities.canCreateCustomMarkers;
  const personalLibraryLocked = runtime.enabled && !keepsPersonalLibrary;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const customMarkers = useEditorCustomMarkersStore(
    (state) => state.customMarkers,
  );
  const loadFromStorage = useEditorCustomMarkersStore(
    (state) => state.loadFromStorage,
  );
  const addCustomMarker = useEditorCustomMarkersStore(
    (state) => state.addCustomMarker,
  );
  const updateCustomMarker = useEditorCustomMarkersStore(
    (state) => state.updateCustomMarker,
  );
  const removeCustomMarker = useEditorCustomMarkersStore(
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

  function requestCustomMarkerAccess() {
    runtime.requestRestriction({
      title: "Marqueurs personnalisés réservés",
      description:
        "La création, l’import et la modification de marqueurs personnalisés sont disponibles avec les formules Plus et Pro.",
    });
  }

  async function handleImportFile(file: File | null) {
    if (!file || isImporting) return;
    if (!canCreateCustomMarkers) {
      requestCustomMarkerAccess();
      return;
    }

    try {
      setIsImporting(true);
      setImportStatus("Préparation de l’image…");
      const dataUrl = await normalizeImportedMarkerImage(file);
      const name =
        file.name.replace(/\.[^.]+$/, "").trim() || "Marqueur importé";
      const marker = addCustomMarker({
        id: createCustomMarkerId("image"),
        name,
        kind: "image",
        dataUrl,
      });
      onSelect({ type: "custom-image", id: marker.id });
      setImportStatus(
        keepsPersonalLibrary
          ? `« ${marker.name} » ajouté à Mes marqueurs.`
          : `« ${marker.name} » ajouté au projet temporaire.`,
      );
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
      <section className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <strong className="flex items-center gap-1.5 text-xs text-slate-900">
              Mes marqueurs
              {personalLibraryLocked ? (
                <span
                  className="inline-flex text-amber-700"
                  title="Bibliothèque personnelle réservée aux formules Plus et Pro"
                >
                  <LockIcon className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </strong>
            <span className="text-[10px] text-slate-500">
              {keepsPersonalLibrary
                ? "Tes marqueurs enregistrés apparaissent ici en priorité pour être réutilisés rapidement."
                : canCreateCustomMarkers
                  ? "Conservés uniquement dans le projet courant."
                  : "Les marqueurs déjà présents restent affichés, mais la création est réservée aux formules Plus et Pro."}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {personalLibraryLocked ? (
              <button
                type="button"
                onClick={requestCustomMarkerAccess}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-800 transition hover:bg-amber-200"
                title="Débloquer Mes marqueurs"
                aria-label="Débloquer Mes marqueurs"
              >
                <LockIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
              {visibleCustomMarkers.length}
            </span>
          </div>
        </div>

        {personalLibraryLocked ? (
          <button
            type="button"
            onClick={requestCustomMarkerAccess}
            className="mb-2 flex w-full items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-left text-[10px] font-semibold leading-relaxed text-amber-950 hover:border-amber-400 hover:bg-amber-100"
          >
            <LockIcon className="h-4 w-4 shrink-0" />
            La bibliothèque personnelle de marqueurs est réservée aux formules Plus et Pro.
          </button>
        ) : !keepsPersonalLibrary ? (
          <div className="mb-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-[10px] leading-relaxed text-teal-900">
            Les marqueurs de ce projet ne sont pas enregistrés dans une bibliothèque personnelle.
          </div>
        ) : null}

        {visibleCustomMarkers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center text-[11px] leading-relaxed text-slate-500">
            Aucun marqueur personnel enregistré pour le moment.
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
                      ? "border-teal-500 bg-teal-50 ring-2 ring-teal-100"
                      : "border-slate-200 hover:border-teal-300 hover:bg-teal-50/40",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (personalLibraryLocked) {
                        requestCustomMarkerAccess();
                        return;
                      }
                      onSelect({ type: symbolType, id: marker.id });
                    }}
                    className={[
                      "flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center",
                      personalLibraryLocked ? "cursor-pointer opacity-55" : "",
                    ].join(" ")}
                    title={marker.name}
                  >
                    <MarkerThumbnail marker={marker} />
                    <span className="line-clamp-2 min-h-6 text-[9px] font-bold leading-tight text-slate-700">
                      {marker.name}
                    </span>
                  </button>

                  {!selectionOnly ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (personalLibraryLocked) {
                          requestCustomMarkerAccess();
                          return;
                        }
                        removeCustomMarker(marker.id);
                        if (selected) {
                          onSelect({ type: "builtin", id: "circle" });
                        }
                        setImportStatus(
                          `« ${marker.name} » a été supprimé de Mes marqueurs.`,
                        );
                      }}
                      className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-md border border-red-200 bg-white text-[12px] font-black text-red-600 shadow-sm hover:border-red-400 hover:bg-red-50"
                      title="Supprimer de Mes marqueurs"
                      aria-label={`Supprimer ${marker.name} de Mes marqueurs`}
                    >
                      ×
                    </button>
                  ) : null}

                  {!selectionOnly && marker.kind === "drawn" ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!canCreateCustomMarkers) {
                          requestCustomMarkerAccess();
                          return;
                        }
                        setDesignerMarker(marker);
                      }}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-[11px] font-black text-slate-600 shadow-sm hover:border-teal-300 hover:text-teal-700"
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

      {!selectionOnly ? (
        <section className="mt-3 rounded-2xl border border-teal-200 bg-teal-50 p-3">
          <div className="mb-2">
            <strong className="block text-xs text-slate-900">
              Créer un marqueur personnalisé
            </strong>
            <span className="text-[10px] leading-relaxed text-slate-500">
              Fonction annexe : utilise-la si les marqueurs enregistrés et la
              bibliothèque DroMap ne correspondent pas à ton besoin.
            </span>
          </div>
  
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (!canCreateCustomMarkers) {
                  requestCustomMarkerAccess();
                  return;
                }
                setDesignerMarker(null);
              }}
              className="relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-teal-300 bg-white px-2 py-3 text-center text-teal-800 shadow-sm transition hover:border-teal-500"
            >
              <span className="text-2xl">✎</span>
              <strong className="text-[11px]">Dessiner un marqueur</strong>
              {!canCreateCustomMarkers ? (
                <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-300">
                  <LockIcon className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </button>
            <button
              type="button"
              disabled={isImporting}
              onClick={() => {
                if (!canCreateCustomMarkers) {
                  requestCustomMarkerAccess();
                  return;
                }
                fileInputRef.current?.click();
              }}
              className="relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-blue-300 bg-white px-2 py-3 text-center text-blue-800 shadow-sm transition hover:border-blue-500 disabled:cursor-wait disabled:opacity-60"
            >
              <span className="text-2xl">⇧</span>
              <strong className="text-[11px]">
                {isImporting ? "Import en cours…" : "Importer un marqueur"}
              </strong>
              {!canCreateCustomMarkers ? (
                <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-300">
                  <LockIcon className="h-3.5 w-3.5" />
                </span>
              ) : null}
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
      ) : null}

      {!selectionOnly && designerMarker !== undefined ? (
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

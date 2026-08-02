"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import {
  bringFloatingPanelToFront,
  getInitialFloatingPanelZIndex,
} from "./floating-panel-z-index";

type PlaceSearchResult = {
  id: string;
  displayName: string;
  lat: number;
  lng: number;
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  } | null;
  category: string;
  type: string;
  importance: number | null;
};

type PlaceSearchResponse = {
  results?: PlaceSearchResult[];
  attribution?: string;
  error?: string;
};

type SearchStatus =
  | { kind: "idle"; message: string }
  | { kind: "loading"; message: string }
  | { kind: "success"; message: string }
  | { kind: "warning"; message: string }
  | { kind: "error"; message: string };

const DEFAULT_ATTRIBUTION =
  "Données © contributeurs OpenStreetMap · recherche Nominatim";

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.7-3.7" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}

function getResultParts(displayName: string) {
  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    title: parts[0] ?? displayName,
    subtitle: parts.slice(1).join(", "),
  };
}

function resultToWorkspaceBounds(result: PlaceSearchResult): WorkspaceBounds {
  if (result.bounds) {
    const latSpan = Math.abs(result.bounds.north - result.bounds.south);
    const lngSpan = Math.abs(result.bounds.east - result.bounds.west);

    if (latSpan > 0.00001 || lngSpan > 0.00001) {
      return {
        southWest: {
          lat: result.bounds.south,
          lng: result.bounds.west,
        },
        northEast: {
          lat: result.bounds.north,
          lng: result.bounds.east,
        },
      };
    }
  }

  const latitudePadding = 0.02;
  const longitudePadding = Math.max(
    0.02,
    latitudePadding / Math.max(0.2, Math.cos((result.lat * Math.PI) / 180)),
  );

  return {
    southWest: {
      lat: result.lat - latitudePadding,
      lng: result.lng - longitudePadding,
    },
    northEast: {
      lat: result.lat + latitudePadding,
      lng: result.lng + longitudePadding,
    },
  };
}

export function PlaceSearchControl() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [attribution, setAttribution] = useState(DEFAULT_ATTRIBUTION);
  const [status, setStatus] = useState<SearchStatus>({
    kind: "idle",
    message: "Saisis une ville, un pays, une adresse ou un lieu.",
  });
  const [panelZIndex, setPanelZIndex] = useState(
    getInitialFloatingPanelZIndex(),
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const clearWorkspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.clearWorkspaceBounds,
  );
  const requestMapFitToBounds = useEditorTestSelectionStore(
    (state) => state.requestMapFitToBounds,
  );
  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const statusClassName = useMemo(() => {
    if (status.kind === "error") {
      return "border-red-200 bg-red-50 text-red-700";
    }

    if (status.kind === "warning") {
      return "border-amber-200 bg-amber-50 text-amber-800";
    }

    if (status.kind === "success") {
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    }

    return "border-slate-200 bg-slate-50 text-slate-600";
  }, [status.kind]);

  function bringToFront() {
    setPanelZIndex(bringFloatingPanelToFront());
  }

  function goToResult(result: PlaceSearchResult) {
    const targetBounds = resultToWorkspaceBounds(result);
    const hadWorkspace = currentMode === "edit" && workspaceBounds !== null;

    // La recherche de lieu est une action de navigation globale. Si une zone
    // était validée, elle est retirée (et historisée) avant le déplacement afin
    // que ses contraintes de pan/zoom ne bloquent jamais le résultat recherché.
    if (workspaceBounds) {
      clearWorkspaceBounds();
      clearSelectedFeatureId();
    }

    const navigate = () => {
      requestMapFitToBounds(targetBounds, {
        maxZoom: 17,
        animate: true,
      });
    };

    // Laisser React-Leaflet retirer les maxBounds de l'ancienne zone avant le
    // fit. Un double requestAnimationFrame évite les sauts sur les fonds
    // MapLibre et sur les zones très resserrées.
    if (hadWorkspace) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(navigate);
      });
    } else {
      navigate();
    }

    setSelectedResultId(result.id);
    setStatus({
      kind: "success",
      message: hadWorkspace
        ? `Zone de travail retirée. Carte centrée sur ${getResultParts(result.displayName).title}.`
        : `Carte centrée sur ${getResultParts(result.displayName).title}.`,
    });
    return true;
  }

  async function searchPlaces() {
    const normalizedQuery = query.replace(/\s+/g, " ").trim();

    if (normalizedQuery.length < 2) {
      setStatus({
        kind: "error",
        message: "Saisis au moins deux caractères.",
      });
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setResults([]);
    setSelectedResultId(null);
    setStatus({ kind: "loading", message: "Recherche du lieu…" });

    try {
      const response = await fetch(
        `/api/dromap/place-search?q=${encodeURIComponent(normalizedQuery)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        },
      );
      const payload = (await response.json()) as PlaceSearchResponse;

      if (requestId !== requestIdRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error || "La recherche n’a pas pu être effectuée.",
        );
      }

      const nextResults = Array.isArray(payload.results) ? payload.results : [];
      setResults(nextResults);
      setAttribution(payload.attribution || DEFAULT_ATTRIBUTION);

      if (nextResults.length === 0) {
        setStatus({
          kind: "warning",
          message: "Aucun lieu trouvé. Essaie avec un nom plus précis.",
        });
        return;
      }

      const bestResult = nextResults[0];
      const didNavigate = goToResult(bestResult);

      if (didNavigate && nextResults.length > 1) {
        setStatus({
          kind: "success",
          message:
            "La carte a été centrée sur le meilleur résultat. Les autres propositions restent disponibles ci-dessous.",
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "La recherche de lieux est momentanément indisponible.",
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void searchPlaces();
  }

  return (
    <section
      className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 lg:left-[53rem] lg:translate-x-0"
      style={{ zIndex: panelZIndex }}
      onMouseDownCapture={bringToFront}
      onFocusCapture={bringToFront}
    >
      {!isOpen ? (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            bringToFront();
          }}
          className="pointer-events-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-bold text-slate-800 shadow-lg backdrop-blur transition hover:border-indigo-300 hover:bg-white hover:text-indigo-700"
          title="Rechercher un lieu et centrer la carte"
        >
          <SearchIcon />
          <span className="hidden sm:inline">Rechercher un lieu</span>
        </button>
      ) : (
        <div
          className="pointer-events-auto w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white/95 p-3 text-sm shadow-2xl backdrop-blur"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-black text-slate-950">
                <SearchIcon size={19} />
                Rechercher un lieu
              </h2>
              <p className="mt-1 text-xs leading-snug text-slate-500">
                La carte se centre automatiquement sur le meilleur résultat.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
            >
              Fermer
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Lieu à rechercher</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon size={17} />
              </span>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ex. Lyon, Mont Fuji, 10 Downing Street…"
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </label>
            <button
              type="submit"
              disabled={status.kind === "loading"}
              className="h-11 shrink-0 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-wait disabled:bg-indigo-300"
            >
              {status.kind === "loading" ? "Recherche…" : "Aller"}
            </button>
          </form>

          <div
            className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-snug ${statusClassName}`}
            role="status"
            aria-live="polite"
          >
            {status.message}
          </div>

          {results.length > 0 ? (
            <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
              {results.map((result, index) => {
                const parts = getResultParts(result.displayName);
                const isSelected = selectedResultId === result.id;

                return (
                  <button
                    key={`${result.id}-${index}`}
                    type="button"
                    onClick={() => goToResult(result)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      isSelected
                        ? "border-indigo-300 bg-indigo-50 text-indigo-950"
                        : "border-slate-200 bg-white text-slate-800 hover:border-indigo-200 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 ${
                        isSelected ? "text-indigo-600" : "text-slate-400"
                      }`}
                    >
                      <PinIcon />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold">
                        {parts.title}
                      </span>
                      {parts.subtitle ? (
                        <span className="mt-0.5 block line-clamp-2 text-xs leading-snug text-slate-500">
                          {parts.subtitle}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <p className="mt-3 border-t border-slate-200 pt-2 text-[10px] leading-snug text-slate-400">
            {attribution}. Recherche déclenchée uniquement avec le bouton Aller
            ou la touche Entrée.
          </p>
        </div>
      )}
    </section>
  );
}

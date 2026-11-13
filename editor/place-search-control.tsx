"use client";

import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import { parsePlaceSearchCoordinates } from "@/lib/dromap/place-search-coordinates";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { FloatingPanelPortal } from "./floating-panel-portal";
import { MapDockButton } from "./map-dock-button";
import { PlaceSearchNavigationContext } from "./place-search-navigation";
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
const IDLE_STATUS: SearchStatus = {
  kind: "idle",
  message: "Saisis un lieu ou des coordonnées MGRS, DMS ou décimales.",
};

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

export function PlaceSearchControl({ product = false }: { product?: boolean } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [attribution, setAttribution] = useState(DEFAULT_ATTRIBUTION);
  const [status, setStatus] = useState<SearchStatus>(IDLE_STATUS);
  const [panelZIndex, setPanelZIndex] = useState(
    getInitialFloatingPanelZIndex(),
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const panelId = useId();
  const navigation = useContext(PlaceSearchNavigationContext);

  const closeSearch = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus((current) => current.kind === "loading" ? IDLE_STATUS : current);
    setIsOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener("dromap:open-ai-assistant", closeSearch);
    return () => {
      window.removeEventListener("dromap:open-ai-assistant", closeSearch);
    };
  }, [closeSearch]);

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
        closeSearch();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeSearch, isOpen]);

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
    const outcome = navigation?.current?.({
      lat: result.lat,
      lng: result.lng,
      bounds: resultToWorkspaceBounds(result),
    });
    if (!outcome) {
      setStatus({ kind: "warning", message: "La carte est en cours de chargement. Réessaie dans un instant." });
      return;
    }

    setSelectedResultId(result.id);
    const title = getResultParts(result.displayName).title;
    switch (outcome) {
      case "outside-visible":
        setStatus({ kind: "warning", message: `${title} est hors de la zone de travail. Un repère indique sa position.` });
        break;
      case "outside-hidden":
        setStatus({ kind: "warning", message: `${title} est hors de la zone de travail et hors de l’écran.` });
        break;
      case "marked":
        setStatus({ kind: "success", message: `Repère placé sur ${title}.` });
        break;
      case "centered":
        setStatus({ kind: "success", message: `Carte centrée sur ${title}.` });
        break;
    }
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
    setResults([]);
    setSelectedResultId(null);
    const coordinates = parsePlaceSearchCoordinates(normalizedQuery);

    if (coordinates.kind === "invalid") {
      setStatus({ kind: "error", message: coordinates.message });
      return;
    }

    if (coordinates.kind === "coordinates") {
      const result: PlaceSearchResult = {
        ...coordinates.point,
        id: `coordinates:${coordinates.point.lat}:${coordinates.point.lng}`,
        displayName: `Coordonnées ${coordinates.format}, ${coordinates.point.lat.toFixed(6)}° / ${coordinates.point.lng.toFixed(6)}°`,
        bounds: null,
        category: "coordinates",
        type: coordinates.format,
        importance: null,
      };
      setResults([result]);
      setAttribution("");
      goToResult(result);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setAttribution(DEFAULT_ATTRIBUTION);
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

      if (controller.signal.aborted) {
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

      goToResult(nextResults[0]);
    } catch (error) {
      if (controller.signal.aborted) {
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
    <>
      <MapDockButton
        icon={<SearchIcon />}
        aria-label="Rechercher un lieu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => {
          if (isOpen) {
            closeSearch();
            return;
          }
          window.dispatchEvent(new Event("dromap:open-place-search"));
          setIsOpen(true);
          bringToFront();
        }}
        className="border-slate-200 text-slate-800 hover:border-teal-300 hover:text-teal-700"
      >
        Rechercher un lieu
      </MapDockButton>
      <FloatingPanelPortal active={isOpen}>
        {isOpen ? (
          <section
            id={panelId}
            aria-labelledby={`${panelId}-title`}
            data-dromap-place-search="open"
            className={`pointer-events-auto fixed left-1/2 w-[440px] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-xl ${product ? "top-[4.5rem] max-h-[calc(100dvh-5.5rem)]" : "top-4 max-h-[calc(100dvh-2rem)]"}`}
            style={{ zIndex: panelZIndex }}
            onPointerDownCapture={bringToFront}
            onFocusCapture={bringToFront}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id={`${panelId}-title`} className="flex items-center gap-2 font-black text-slate-950">
                  <SearchIcon size={19} />
                  Rechercher un lieu
                </h2>
              </div>
              <button
                type="button"
                onClick={closeSearch}
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
                  placeholder="Ex. Lyon ou 31U DQ 48252 11954"
                  autoComplete="off"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <button
                type="submit"
                disabled={status.kind === "loading"}
                className="h-11 shrink-0 rounded-xl bg-teal-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-teal-500 disabled:cursor-wait disabled:bg-teal-300"
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
                          ? "border-teal-300 bg-teal-50 text-teal-950"
                          : "border-slate-200 bg-white text-slate-800 hover:border-teal-200 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`mt-0.5 shrink-0 ${
                          isSelected ? "text-teal-600" : "text-slate-400"
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

            {attribution ? (
              <p className="mt-3 border-t border-slate-200 pt-2 text-[10px] leading-snug text-slate-500">
                {attribution}
              </p>
            ) : null}
          </section>
        ) : null}
      </FloatingPanelPortal>
    </>
  );
}

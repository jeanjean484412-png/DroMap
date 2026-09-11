"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDromapProductRuntime } from "@/components/dromap-product/product-runtime";
import {
  DROMAP_ROAD_IMPORT_CATEGORIES,
  getDromapRoadImportMaxAreaKm2,
  type DromapRoadImportCategory,
} from "@/lib/dromap/road-import";
import { useEditorModeStore } from "@/stores/editor-mode";
import {
  analyzeDromapRoads,
  getDromapManagedRoadLayers,
  getInitialRoadSelectionIds,
  reconcileDromapRoadImport,
  type DromapRoadSourceMetadata,
} from "./road-import-runtime";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { DROMAP_OPEN_ROUTES_IMPORT_EVENT } from "./import-launcher-events";
import {
  bringFloatingPanelToFront,
  getInitialFloatingPanelZIndex,
} from "./floating-panel-z-index";
import type { RouteSelectionFeature } from "./route-selection-modal";

const RouteSelectionModal = dynamic(
  () => import("./route-selection-modal").then((module) => module.RouteSelectionModal),
  { ssr: false },
);

type NormalizedWorkspaceBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type RoadImportStatus =
  | { kind: "idle"; message: string }
  | { kind: "loading"; message: string }
  | { kind: "success"; message: string }
  | { kind: "warning"; message: string }
  | { kind: "error"; message: string };

type PendingRoadImport = {
  features: RouteSelectionFeature[];
  source: DromapRoadSourceMetadata;
  categories: DromapRoadImportCategory[];
  initialSelectedIds: string[];
  hadExistingRoadLayer: boolean;
};



function normalizeWorkspaceBounds(
  workspaceBounds: ReturnType<typeof useEditorWorkspaceStore.getState>["workspaceBounds"],
): NormalizedWorkspaceBounds | null {
  if (!workspaceBounds) return null;
  const south = Math.max(-85.05112878, Math.min(workspaceBounds.southWest.lat, workspaceBounds.northEast.lat));
  const north = Math.min(85.05112878, Math.max(workspaceBounds.southWest.lat, workspaceBounds.northEast.lat));
  const west = Math.max(-180, Math.min(workspaceBounds.southWest.lng, workspaceBounds.northEast.lng));
  const east = Math.min(180, Math.max(workspaceBounds.southWest.lng, workspaceBounds.northEast.lng));
  if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east) {
    return null;
  }
  return { south, west, north, east };
}

function getWorkspaceDimensions(bounds: NormalizedWorkspaceBounds) {
  const middleLatitude = (bounds.south + bounds.north) / 2;
  const heightKm = Math.abs(bounds.north - bounds.south) * 111.32;
  const widthKm =
    Math.abs(bounds.east - bounds.west) *
    111.32 *
    Math.max(0.05, Math.cos((middleLatitude * Math.PI) / 180));
  return { widthKm, heightKm, areaKm2: widthKm * heightKm };
}

function formatDimension(value: number) {
  if (value < 1) return `${Math.max(1, Math.round(value * 1_000))} m`;
  if (value < 10) return `${value.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(value).toLocaleString("fr-FR")} km`;
}

function formatArea(value: number) {
  if (value < 10) return `${value.toFixed(1).replace(".", ",")} km²`;
  return `${Math.round(value).toLocaleString("fr-FR")} km²`;
}


function RoadIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3 6 21M16 3l2 18M12 4v3M12 10v4M12 17v3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

const TOUR_ROUTES_FALLBACK_BOUNDS: NormalizedWorkspaceBounds = {
  south: 48.846,
  west: 2.326,
  north: 48.874,
  east: 2.372,
};

function createTourRoadFeatures(
  bounds: NormalizedWorkspaceBounds,
): RouteSelectionFeature[] {
  const width = Math.max(0.004, bounds.east - bounds.west);
  const height = Math.max(0.004, bounds.north - bounds.south);
  const lng = (ratio: number) => bounds.west + width * ratio;
  const lat = (ratio: number) => bounds.south + height * ratio;
  const rows: Array<{
    id: string;
    label: string;
    category: DromapRoadImportCategory;
    coordinates: [number, number][];
  }> = [
    {
      id: "tour-road-a1",
      label: "A1",
      category: "motorways",
      coordinates: [[lng(0.12), lat(0.28)], [lng(0.42), lat(0.48)], [lng(0.88), lat(0.72)]],
    },
    {
      id: "tour-road-n1",
      label: "N1",
      category: "main",
      coordinates: [[lng(0.18), lat(0.78)], [lng(0.48), lat(0.54)], [lng(0.84), lat(0.32)]],
    },
    {
      id: "tour-road-d12",
      label: "D12",
      category: "secondary",
      coordinates: [[lng(0.24), lat(0.18)], [lng(0.46), lat(0.38)], [lng(0.66), lat(0.2)]],
    },
    {
      id: "tour-road-local",
      label: "Route locale",
      category: "local",
      coordinates: [[lng(0.58), lat(0.82)], [lng(0.66), lat(0.6)], [lng(0.8), lat(0.5)]],
    },
  ];

  return rows.map((row) => ({
    type: "Feature",
    id: row.id,
    properties: {
      label: row.label,
      ref: row.label,
      __dromapRoadSelectionId: row.id,
      __dromapRoadCategory: row.category,
      __dromapRoadGroupKey: row.id,
    },
    geometry: { type: "LineString", coordinates: row.coordinates },
  }));
}

function statusClassName(status: RoadImportStatus) {
  if (status.kind === "error") return "border-red-200 bg-red-50 text-red-800";
  if (status.kind === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status.kind === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status.kind === "loading") return "border-teal-200 bg-teal-50 text-teal-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function RoadImportController() {
  const { enabled: productRuntimeEnabled, capabilities, requestRestriction } = useDromapProductRuntime();
  const workspaceBounds = useEditorWorkspaceStore((state) => state.workspaceBounds);
  const currentMode = useEditorModeStore((state) => state.currentMode);

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isChoiceOpen, setIsChoiceOpen] = useState(false);
  const [isSelectionOpen, setIsSelectionOpen] = useState(false);
  const [isTourDemo, setIsTourDemo] = useState(false);
  const [pendingRoads, setPendingRoads] = useState<PendingRoadImport | null>(null);
  const [categories, setCategories] = useState<DromapRoadImportCategory[]>(["motorways"]);
  const [panelZIndex, setPanelZIndex] = useState(getInitialFloatingPanelZIndex());
  const [status, setStatus] = useState<RoadImportStatus>({
    kind: "idle",
    message: "Choisis les catégories de routes à rechercher dans la zone de travail.",
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const normalizedBounds = useMemo(
    () => normalizeWorkspaceBounds(workspaceBounds),
    [workspaceBounds],
  );
  const workspaceDimensions = useMemo(
    () => (normalizedBounds ? getWorkspaceDimensions(normalizedBounds) : null),
    [normalizedBounds],
  );
  const maxAreaKm2 = useMemo(
    () => getDromapRoadImportMaxAreaKm2(categories),
    [categories],
  );
  const hasImportableWorkspace = normalizedBounds !== null && currentMode === "edit";
  const canUseRoadImport = !productRuntimeEnabled || capabilities.canImportBuildings;
  const currentAreaKm2 = workspaceDimensions?.areaKm2 ?? 0;
  const areaIsAllowed = categories.length > 0 && currentAreaKm2 <= maxAreaKm2;
  const allCategoriesSelected = categories.length === DROMAP_ROAD_IMPORT_CATEGORIES.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        categories.length > 0 && !allCategoriesSelected;
    }
  }, [allCategoriesSelected, categories.length]);


  const openPanel = useCallback(() => {
    if (!hasImportableWorkspace) return;
    if (!canUseRoadImport) {
      requestRestriction({
        title: "Import de routes réservé aux offres premium",
        description:
          "L’import cartographique de routes utilise pour l’instant le même niveau d’accès que l’import de bâtiments. La carte actuelle ne sera pas modifiée.",
      });
      return;
    }
    setPanelZIndex(bringFloatingPanelToFront());
    setStatus({
      kind: "idle",
      message: "Choisis les catégories de routes. La taille maximale autorisée s’adapte automatiquement au niveau de détail demandé.",
    });
    setIsPanelOpen(true);
  }, [canUseRoadImport, hasImportableWorkspace, requestRestriction]);

  useEffect(() => {
    const handleOpen = () => openPanel();
    window.addEventListener(DROMAP_OPEN_ROUTES_IMPORT_EVENT, handleOpen);
    return () => window.removeEventListener(DROMAP_OPEN_ROUTES_IMPORT_EVENT, handleOpen);
  }, [openPanel]);

  useEffect(() => {
    const getTourPendingRoads = () => {
      const bounds = normalizedBounds ?? TOUR_ROUTES_FALLBACK_BOUNDS;
      const features = createTourRoadFeatures(bounds);
      const source: DromapRoadSourceMetadata = {
        source: "OpenStreetMap",
        sourceName: "openstreetmap-roads.geojson",
        sourceLabel: "OpenStreetMap — Routes",
        sourceUrl: "https://www.openstreetmap.org/",
        license: "ODbL 1.0",
        attribution: "© OpenStreetMap contributors",
      };
      return {
        bounds,
        pending: {
          features,
          source,
          categories: ["motorways", "main", "secondary", "local"],
          initialSelectedIds: features.slice(0, 2).map((feature) => String(feature.id)),
          hadExistingRoadLayer: true,
        } satisfies PendingRoadImport,
      };
    };

    const showTourStage = (stage: "panel" | "choice" | "selection") => {
      abortControllerRef.current?.abort();
      const { pending } = getTourPendingRoads();
      setIsTourDemo(true);
      setPanelZIndex(bringFloatingPanelToFront());

      if (stage === "choice") {
        setPendingRoads(pending);
        setIsPanelOpen(false);
        setIsSelectionOpen(false);
        setIsChoiceOpen(true);
        setStatus({
          kind: "success",
          message: `${pending.features.length.toLocaleString("fr-FR")} routes trouvées dans la zone. Choisis maintenant le mode d’import.`,
        });
        return;
      }

      if (stage === "selection") {
        setPendingRoads(pending);
        setIsPanelOpen(false);
        setIsChoiceOpen(false);
        setIsSelectionOpen(true);
        setStatus({
          kind: "success",
          message: "Choisis les routes utiles puis valide la sélection.",
        });
        return;
      }

      setIsChoiceOpen(false);
      setIsSelectionOpen(false);
      setPendingRoads(null);
      setStatus({
        kind: "idle",
        message:
          "Choisis les catégories de routes. La taille maximale autorisée s’adapte automatiquement au niveau de détail demandé.",
      });
      setIsPanelOpen(true);
    };

    const openTourDemo = () => showTourStage("panel");
    const setTourDemoStage = (event: Event) => {
      const stage = (event as CustomEvent<{ stage?: "panel" | "choice" | "selection" }>).detail?.stage;
      if (stage === "panel" || stage === "choice" || stage === "selection") {
        showTourStage(stage);
      }
    };
    const closeTourDemo = () => {
      setIsPanelOpen(false);
      setIsChoiceOpen(false);
      setIsSelectionOpen(false);
      setPendingRoads(null);
      setIsTourDemo(false);
    };

    window.addEventListener("dromap:tour-open-routes-import-demo", openTourDemo);
    window.addEventListener("dromap:tour-routes-import-demo-stage", setTourDemoStage);
    window.addEventListener("dromap:tour-close-routes-import-demo", closeTourDemo);

    return () => {
      window.removeEventListener("dromap:tour-open-routes-import-demo", openTourDemo);
      window.removeEventListener("dromap:tour-routes-import-demo-stage", setTourDemoStage);
      window.removeEventListener("dromap:tour-close-routes-import-demo", closeTourDemo);
    };
  }, [normalizedBounds]);

  useEffect(() => {
    if (isTourDemo || (hasImportableWorkspace && canUseRoadImport)) return;
    abortControllerRef.current?.abort();
    setIsPanelOpen(false);
    setIsChoiceOpen(false);
    setIsSelectionOpen(false);
    setPendingRoads(null);
  }, [canUseRoadImport, hasImportableWorkspace, isTourDemo]);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!isPanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      abortControllerRef.current?.abort();
      setIsPanelOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPanelOpen]);

  const toggleCategory = (category: DromapRoadImportCategory, checked: boolean) => {
    setCategories((current) => {
      const next = new Set(current);
      if (checked) next.add(category);
      else next.delete(category);
      return DROMAP_ROAD_IMPORT_CATEGORIES.map((item) => item.id).filter((id) => next.has(id));
    });
    setStatus({
      kind: "idle",
      message: "Catégories modifiées. Vérifie la limite de zone avant de lancer l’analyse.",
    });
  };

  const analyzeRoads = async () => {
    if (!normalizedBounds || !areaIsAllowed || categories.length === 0) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStatus({
      kind: "loading",
      message: "Analyse des routes OpenStreetMap présentes dans la zone…",
    });

    try {
      const analysis = await analyzeDromapRoads({
        bounds: normalizedBounds,
        categories: [...categories],
        signal: controller.signal,
      });
      const features = analysis.features as RouteSelectionFeature[];
      const managedLayers = getDromapManagedRoadLayers();
      setPendingRoads({
        features,
        source: analysis.source,
        categories: analysis.categories,
        initialSelectedIds: getInitialRoadSelectionIds(features),
        hadExistingRoadLayer: managedLayers.length > 0,
      });
      setStatus({
        kind: "success",
        message: `${features.length.toLocaleString("fr-FR")} route${features.length > 1 ? "s" : ""} trouvée${features.length > 1 ? "s" : ""}. Choisis maintenant le mode d’import.`,
      });
      setIsPanelOpen(false);
      setIsChoiceOpen(true);
      setPanelZIndex(bringFloatingPanelToFront());
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "L’analyse des routes a échoué.",
      });
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  };

  const importRoadGeoJsonLayer = (
    features: RouteSelectionFeature[],
    mode: "all" | "selection",
  ) => {
    if (!pendingRoads) return;

    try {
      const result = reconcileDromapRoadImport({
        features: features as Parameters<typeof reconcileDromapRoadImport>[0]["features"],
        source: pendingRoads.source,
        categories: pendingRoads.categories,
        mode,
      });
      setStatus({
        kind: "success",
        message:
          result.selectedCount > 0
            ? `${result.selectedCount.toLocaleString("fr-FR")} route${result.selectedCount > 1 ? "s" : ""} conservée${result.selectedCount > 1 ? "s" : ""} dans le calque GeoJSON ${result.layerName ?? "Routes"}.`
            : result.removed
              ? "Toutes les routes ont été désélectionnées : le calque Routes a été retiré."
              : "Aucune route n’a été importée.",
      });
      setIsChoiceOpen(false);
      setIsSelectionOpen(false);
      setPendingRoads(null);
    } catch (error) {
      setIsSelectionOpen(false);
      setIsChoiceOpen(true);
      setPanelZIndex(bringFloatingPanelToFront());
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "L’import des routes a échoué.",
      });
    }
  };

  const importAllPendingRoads = () => {
    if (!pendingRoads) return;
    importRoadGeoJsonLayer(pendingRoads.features, "all");
  };

  const importSelectedRoads = (selectedRoads: RouteSelectionFeature[]) => {
    importRoadGeoJsonLayer(selectedRoads, "selection");
  };

  const routeSelectionBounds =
    normalizedBounds ?? (isTourDemo ? TOUR_ROUTES_FALLBACK_BOUNDS : null);

  const derivedStatus: RoadImportStatus =
    categories.length === 0
      ? { kind: "warning", message: "Coche au moins une catégorie de routes." }
      : !areaIsAllowed && workspaceDimensions
        ? {
            kind: "error",
            message: `La zone actuelle fait environ ${formatArea(workspaceDimensions.areaKm2)}. Avec ces catégories, la limite est ${formatArea(maxAreaKm2)}. Réduis la zone ou décoche les catégories les plus détaillées.`,
          }
        : status;

  return (
    <>
      {isPanelOpen ? (
        <div
          className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]"
          style={{ zIndex: panelZIndex }}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              abortControllerRef.current?.abort();
              setIsPanelOpen(false);
              setIsTourDemo(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dromap-routes-title"
            data-dromap-tour="routes-import-dialog"
            data-dromap-ignore-map-wheel="true"
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
            onMouseDown={() => setPanelZIndex(bringFloatingPanelToFront())}
          >
            <header className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-slate-800">
                  <RoadIcon size={20} />
                  <h2 id="dromap-routes-title" className="text-base font-black text-slate-950">
                    Routes de la zone
                  </h2>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Choisis d’abord le niveau de détail. Plus tu demandes de petites routes, plus la zone maximale doit être réduite. Après l’analyse, tu pourras importer toutes les routes trouvées ou en sélectionner seulement certaines.
                </p>
              </div>
              <button type="button" onClick={() => { abortControllerRef.current?.abort(); setIsPanelOpen(false); setIsTourDemo(false); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" title="Fermer" aria-label="Fermer">
                <CloseIcon />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5">
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Largeur</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{workspaceDimensions ? formatDimension(workspaceDimensions.widthKm) : "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Hauteur</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{workspaceDimensions ? formatDimension(workspaceDimensions.heightKm) : "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Zone approximative</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{workspaceDimensions ? formatArea(workspaceDimensions.areaKm2) : "—"}</div>
                </div>
              </div>

              <div
                data-dromap-tour="routes-import-categories"
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <label className="flex cursor-pointer items-center gap-3 border-b border-slate-200 pb-3 text-sm font-black text-slate-950">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allCategoriesSelected}
                    onChange={(event) => {
                      setCategories(event.target.checked ? DROMAP_ROAD_IMPORT_CATEGORIES.map((item) => item.id) : []);
                      setStatus({ kind: "idle", message: "Catégories modifiées. Vérifie la limite de zone avant de lancer l’analyse." });
                    }}
                    className="h-4 w-4"
                  />
                  Tout sélectionner
                </label>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {DROMAP_ROAD_IMPORT_CATEGORIES.map((category) => (
                    <label key={category.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <input
                        type="checkbox"
                        checked={categories.includes(category.id)}
                        onChange={(event) => toggleCategory(category.id, event.target.checked)}
                        className="mt-0.5 h-4 w-4"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-black text-slate-900">{category.label}</span>
                        <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{category.description}</span>
                        <span className="mt-1 block text-[10px] font-bold text-teal-700">Zone max seule : {formatArea(category.maxAreaKm2)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div
                data-dromap-tour="routes-import-limit"
                className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs leading-5 text-teal-900"
              >
                <strong>Limite avec la sélection actuelle :</strong>{" "}
                {categories.length ? formatArea(maxAreaKm2) : "—"}. La catégorie la plus détaillée cochée impose la limite.
              </div>

              <div className={`rounded-xl border px-4 py-3 text-sm leading-5 ${statusClassName(derivedStatus)}`}>
                <div className="flex items-start gap-2">
                  {derivedStatus.kind === "loading" ? <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal-200 border-t-teal-700" /> : null}
                  <span>{derivedStatus.message}</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                Données routières : OpenStreetMap. Les bretelles et sorties (_link), chemins, pistes agricoles, pistes cyclables et voies piétonnes sont exclues afin d’éviter les traits parasites et les chargements inutiles.
              </div>
            </div>

            <footer className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => { abortControllerRef.current?.abort(); setIsPanelOpen(false); setIsTourDemo(false); }} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100">
                Fermer
              </button>
              <button
                type="button"
                data-dromap-tour="routes-import-analyze"
                onClick={() => {
                  if (isTourDemo) return;
                  void analyzeRoads();
                }}
                disabled={(!isTourDemo && !areaIsAllowed) || derivedStatus.kind === "loading"}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                <RoadIcon />
                {derivedStatus.kind === "loading" ? "Analyse en cours…" : "Analyser les routes"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {isChoiceOpen && pendingRoads ? (
        <div
          className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
          style={{ zIndex: panelZIndex }}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return;
            setIsChoiceOpen(false);
            setPendingRoads(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dromap-routes-choice-title"
            data-dromap-ignore-map-wheel="true"
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
            onMouseDown={() => setPanelZIndex(bringFloatingPanelToFront())}
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <div className="flex items-center gap-2 text-slate-800">
                  <RoadIcon size={20} />
                  <h2 id="dromap-routes-choice-title" className="text-base font-black text-slate-950">
                    Quelles routes veux-tu ajouter ?
                  </h2>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {pendingRoads.features.length.toLocaleString("fr-FR")} route{pendingRoads.features.length > 1 ? "s" : ""} trouvée{pendingRoads.features.length > 1 ? "s" : ""} dans la zone de travail.
                </p>
                <p className="mt-1 text-[11px] font-semibold text-teal-700">
                  Source : {pendingRoads.source.sourceLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setIsChoiceOpen(false); setPendingRoads(null); }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                title="Fermer"
                aria-label="Fermer"
              >
                <CloseIcon />
              </button>
            </header>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  if (isTourDemo) return;
                  importAllPendingRoads();
                }}
                className="group rounded-2xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-teal-300 hover:bg-teal-50"
              >
                <div className="text-sm font-black text-slate-950">Toutes les routes</div>
                <div className="mt-2 text-xs leading-5 text-slate-600">
                  Ajoute directement toutes les routes trouvées dans un seul calque GeoJSON léger, sans ouvrir la fenêtre de sélection.
                </div>
                <div className="mt-4 inline-flex rounded-lg bg-teal-600 px-3 py-2 text-xs font-black text-white">
                  Ajouter le calque complet
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isTourDemo) return;
                  setIsChoiceOpen(false);
                  setIsSelectionOpen(true);
                }}
                className="group rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 text-left transition hover:border-amber-500 hover:bg-amber-100"
              >
                <div className="text-sm font-black text-slate-950">Sélectionner certaines routes</div>
                <div className="mt-2 text-xs leading-5 text-slate-700">
                  Ouvre la zone en plein écran pour choisir uniquement les axes utiles. La sélection validée sera elle aussi importée dans un seul calque GeoJSON.
                </div>
                <div className="mt-4 inline-flex rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-slate-950 transition group-hover:bg-amber-400">
                  Ouvrir la sélection
                </div>
              </button>
            </div>

            {status.kind === "error" ? (
              <div className="mx-5 mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-800">
                {status.message}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {isSelectionOpen && pendingRoads && routeSelectionBounds ? (
        <RouteSelectionModal
          features={pendingRoads.features}
          bounds={routeSelectionBounds}
          initialSelectedIds={pendingRoads.initialSelectedIds}
          allowEmptyConfirm={pendingRoads.hadExistingRoadLayer}
          onCancel={() => {
            if (isTourDemo) return;
            setIsSelectionOpen(false);
            setIsChoiceOpen(true);
            setPanelZIndex(bringFloatingPanelToFront());
          }}
          onConfirm={(features) => {
            if (isTourDemo) return;
            importSelectedRoads(features);
          }}
        />
      ) : null}
    </>
  );
}

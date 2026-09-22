"use client";

import { DromapLogoMark } from "@/components/dromap-product/dromap-brand";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapButton } from "@/components/dromap-ui/button";
import { BasemapPreviewThumbnail } from "@/editor/basemap-controls";
import GraphicZoomViewport from "@/editor/graphic-zoom-viewport";
import { SavedLayersLibraryModal } from "@/editor/saved-layers-library-modal";
import { DromapDialog } from "@/components/dromap-ui/dialog";
import {
  DEFAULT_DROMAP_BASEMAP_ID,
  DROMAP_BASEMAP_MENU_SECTIONS,
  getDromapBasemapConfig,
  isDromapBasemapId,
  type DromapBasemapId,
  type DromapBasemapMenuItem,
  type DromapBasemapMenuSection,
} from "@/lib/dromap/basemap";
import {
  DROMAP_FULL_WORLD_WORKSPACE_BOUNDS,
  type WorkspaceBounds,
} from "@/lib/dromap/workspace-bounds";
import { validateWorkspaceBoundsRatio } from "@/lib/dromap/workspace-validation";
import { getDromapCapabilities } from "@/lib/dromap/product";
import {
  remapSavedGeoJsonLayerToMap,
  type DromapGeoJsonPrecisionMode,
} from "@/stores/editor-geojson-layers";
import {
  GeoJsonFileImportError,
  importGeoJsonFileAutomatically,
  type GeoJsonFileImportProgress,
} from "@/editor/geojson-file-import";
import {
  createDefaultDromapLayer,
  useEditorLayersStore,
} from "@/stores/editor-layers";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorGeoJsonLayersStore } from "@/stores/editor-geojson-layers";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import { useEditorMapViewStore } from "@/stores/editor-map-view";
import { useDromapProductStore } from "@/stores/dromap-product";

const SetupMap = dynamic(() => import("@/editor/editor-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-slate-100 text-sm text-slate-600">
      Chargement de la carte…
    </div>
  ),
});

type BasemapChoice = {
  id: DromapBasemapId;
  label: string;
  description: string;
  sectionId: string;
  sectionLabel: string;
  groupPath: string[];
};

function flattenBasemapMenuItems(
  items: DromapBasemapMenuItem[],
  sectionId: string,
  sectionLabel: string,
  groupPath: string[] = [],
): BasemapChoice[] {
  return items.flatMap((item) => {
    if (item.type === "group") {
      return flattenBasemapMenuItems(
        item.items,
        sectionId,
        sectionLabel,
        [...groupPath, item.label],
      );
    }

    const basemap = getDromapBasemapConfig(item.basemapId);
    return [
      {
        id: basemap.id,
        label: item.label ?? basemap.label,
        description: item.description ?? basemap.description,
        sectionId,
        sectionLabel,
        groupPath,
      },
    ];
  });
}

const BASEMAP_CHOICES = DROMAP_BASEMAP_MENU_SECTIONS.flatMap((section) =>
  flattenBasemapMenuItems(
    section.items,
    section.id,
    section.label,
  ),
);

type LeafletBoundsLike = {
  getSouth(): number;
  getWest(): number;
  getNorth(): number;
  getEast(): number;
};

const WORLD_SOLID_BASEMAP_IDS = new Set<DromapBasemapId>([
  "blank-white",
  "white-borders",
  "white-borders-basic",
]);

/** Fonds blancs qui représentent réellement le monde entier. */
const WHITE_VECTOR_WORLD_BASEMAP_IDS = new Set<DromapBasemapId>([
  "white-borders-basic",
  "white-borders",
]);

function getSetupBasemapChoice(basemapId: DromapBasemapId) {
  return BASEMAP_CHOICES.find((choice) => choice.id === basemapId) ?? null;
}

function isSetupWhiteVectorBasemap(basemapId: DromapBasemapId) {
  return getSetupBasemapChoice(basemapId)?.sectionId === "white-vector";
}

function canSelectWholeWorldFromSetup(basemapId: DromapBasemapId) {
  return (
    !isSetupWhiteVectorBasemap(basemapId) ||
    WHITE_VECTOR_WORLD_BASEMAP_IDS.has(basemapId)
  );
}

function getSetupBasemapPerformanceWarning(basemapId: DromapBasemapId) {
  if (basemapId === "white-borders") {
    return {
      title: "Frontières précises du monde",
      description:
        "Ce fond charge des frontières détaillées à l’échelle du monde entier. Selon la machine et la carte créée, la validation de la zone, la navigation et certains rendus peuvent être plus lents.",
    };
  }

  if (basemapId === "continent-europe") {
    return {
      title: "Europe entière",
      description:
        "Afficher toute l’Europe avec ses frontières détaillées peut demander davantage de ressources. Selon la machine et la carte créée, la validation de la zone, la navigation et certains rendus peuvent être plus lents.",
    };
  }

  return null;
}

const WORKSPACE_MIN_LAT = -85.05112878;
const WORKSPACE_MAX_LAT = 85.05112878;
const WORKSPACE_MIN_LNG = -240;
const WORKSPACE_MAX_LNG = 240;

function clampWorkspaceNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, min), max);
}

/**
 * Miroir volontaire de la règle utilisée dans BasemapControls : un fond blanc
 * territorial présélectionne sa zone uniquement s'il ne s'agit pas d'un fond
 * monde générique. La validation reste volontairement à la main dans le
 * parcours de création.
 */
function shouldAutoWorkspaceForSetupBasemap(basemapId: DromapBasemapId) {
  const basemap = getDromapBasemapConfig(basemapId);
  return (
    basemap.kind === "solid" &&
    Boolean(basemap.boundaryOverlay) &&
    !WORLD_SOLID_BASEMAP_IDS.has(basemapId)
  );
}

/** Même marge que l'onglet Fonds de carte de l'éditeur. */
function createSetupWorkspaceBoundsAroundBasemap(bounds: LeafletBoundsLike) {
  const rawSouth = bounds.getSouth();
  const rawWest = bounds.getWest();
  const rawNorth = bounds.getNorth();
  const rawEast = bounds.getEast();
  const south = Math.min(rawSouth, rawNorth);
  const north = Math.max(rawSouth, rawNorth);
  const west = Math.min(rawWest, rawEast);
  const east = Math.max(rawWest, rawEast);
  const latSpan = Math.max(0.000001, north - south);
  const lngSpan = Math.max(0.000001, east - west);
  const latPadding = Math.min(10, Math.max(0.15, latSpan * 0.05));
  const lngPadding = Math.min(10, Math.max(0.15, lngSpan * 0.05));

  return {
    southWest: {
      lat: clampWorkspaceNumber(
        south - latPadding,
        WORKSPACE_MIN_LAT,
        WORKSPACE_MAX_LAT,
      ),
      lng: clampWorkspaceNumber(
        west - lngPadding,
        WORKSPACE_MIN_LNG,
        WORKSPACE_MAX_LNG,
      ),
    },
    northEast: {
      lat: clampWorkspaceNumber(
        north + latPadding,
        WORKSPACE_MIN_LAT,
        WORKSPACE_MAX_LAT,
      ),
      lng: clampWorkspaceNumber(
        east + lngPadding,
        WORKSPACE_MIN_LNG,
        WORKSPACE_MAX_LNG,
      ),
    },
  } satisfies WorkspaceBounds;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .trim();
}

function collectDefaultOpenGroupIds(items: DromapBasemapMenuItem[]): string[] {
  return items.flatMap((item) => {
    if (item.type !== "group") return [];
    return [
      ...(item.defaultOpen ? [item.id] : []),
      ...collectDefaultOpenGroupIds(item.items),
    ];
  });
}

function getInitialOpenGroupIds(section: DromapBasemapMenuSection) {
  return new Set(collectDefaultOpenGroupIds(section.items));
}

function SetupBasemapPicker({
  selectedBasemapId,
  onSelect,
}: {
  selectedBasemapId: DromapBasemapId;
  onSelect: (basemapId: DromapBasemapId) => void;
}) {
  const selectedBasemap = getDromapBasemapConfig(selectedBasemapId);
  const selectedSection =
    DROMAP_BASEMAP_MENU_SECTIONS.find((section) =>
      flattenBasemapMenuItems(section.items, section.id, section.label).some(
        (choice) => choice.id === selectedBasemapId,
      ),
    ) ?? DROMAP_BASEMAP_MENU_SECTIONS[0];

  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(
    () => new Set<string>(),
  );

  const normalizedQuery = normalizeSearchText(searchQuery);
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];

    return BASEMAP_CHOICES.filter((choice) =>
      normalizeSearchText(
        [
          choice.label,
          choice.description,
          choice.sectionLabel,
          ...choice.groupPath,
        ].join(" "),
      ).includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  function toggleSection(section: DromapBasemapMenuSection) {
    setSearchQuery("");
    setOpenSectionId((current) => {
      const next = current === section.id ? null : section.id;
      if (next) {
        setOpenGroupIds(getInitialOpenGroupIds(section));
      }
      return next;
    });
  }

  function chooseBasemap(choice: BasemapChoice) {
    onSelect(choice.id);
    setOpenSectionId(choice.sectionId);
  }

  function renderBasemapChoice(choice: BasemapChoice) {
    const selected = choice.id === selectedBasemapId;
    const showIndividualPreview =
      choice.sectionId === "classic" || choice.id === "blank-white";

    return (
      <button
        key={`${choice.id}-${choice.label}`}
        type="button"
        onClick={() => chooseBasemap(choice)}
        className={`w-full rounded-xl border px-3 py-2 text-left transition ${
          selected
            ? "border-teal-300 bg-teal-50 text-teal-950 shadow-sm"
            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <span
          className={`flex ${
            showIndividualPreview ? "items-center gap-3" : "items-start"
          }`}
        >
          {showIndividualPreview ? (
            <BasemapPreviewThumbnail basemapId={choice.id} />
          ) : null}
          <span className="min-w-0 flex-1">
            {choice.groupPath.length > 0 ? (
              <span className="mb-0.5 block truncate text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {[choice.sectionLabel, ...choice.groupPath].join(" › ")}
              </span>
            ) : null}
            <span className="block text-sm font-semibold">{choice.label}</span>
            <span className="mt-0.5 block text-xs leading-snug text-slate-500">
              {choice.description}
            </span>
          </span>
          {selected ? (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-600 text-xs font-black text-white">
              ✓
            </span>
          ) : null}
        </span>
      </button>
    );
  }

  function renderMenuItem(
    item: DromapBasemapMenuItem,
    section: DromapBasemapMenuSection,
    groupPath: string[] = [],
    index = 0,
  ): ReactNode {
    if (item.type === "basemap") {
      if (!isDromapBasemapId(item.basemapId)) return null;

      const basemap = getDromapBasemapConfig(item.basemapId);
      return renderBasemapChoice({
        id: item.basemapId,
        label: item.label ?? basemap.label,
        description: item.description ?? basemap.description,
        sectionId: section.id,
        sectionLabel: section.label,
        groupPath,
      });
    }

    const isOpen = openGroupIds.has(item.id);

    return (
      <details
        key={`${item.id}-${index}`}
        open={isOpen}
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open;
          setOpenGroupIds((current) => {
            const next = new Set(current);
            if (nextOpen) next.add(item.id);
            else next.delete(item.id);
            return next;
          });
        }}
        className="rounded-xl border border-slate-200 bg-slate-50/70"
      >
        <summary className="cursor-pointer select-none rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100">
          {item.label}
          {item.description ? (
            <span className="mt-0.5 block pr-2 text-xs font-normal leading-snug text-slate-500">
              {item.description}
            </span>
          ) : null}
        </summary>
        <div className="space-y-2 px-2 pb-2">
          {item.items.map((child, childIndex) =>
            renderMenuItem(
              child,
              section,
              [...groupPath, item.label],
              childIndex,
            ),
          )}
        </div>
      </details>
    );
  }

  function getSectionRepresentative(section: DromapBasemapMenuSection) {
    if (section.id === "classic") {
      return selectedSection?.id === "classic"
        ? selectedBasemapId
        : ("openfreemap-liberty" as DromapBasemapId);
    }

    return selectedSection?.id === "white-vector"
      ? selectedBasemapId
      : ("france-regions" as DromapBasemapId);
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <label
        htmlFor="setup-basemap-search"
        className="mb-2 block text-sm font-semibold text-slate-800"
      >
        Rechercher un fond
      </label>
      <input
        id="setup-basemap-search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="France, satellite, Europe, départements…"
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
      />

      {normalizedQuery ? (
        <div className="mt-3 max-h-[430px] space-y-2 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-slate-50 p-3">
          {searchResults.length > 0 ? (
            searchResults.slice(0, 100).map(renderBasemapChoice)
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-5 text-center text-sm text-slate-500">
              Aucun fond trouvé.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {DROMAP_BASEMAP_MENU_SECTIONS.map((section) => {
            const isOpen = openSectionId === section.id;
            const sectionContainsSelection = section.id === selectedSection?.id;
            const representativeId = getSectionRepresentative(section);

            return (
              <section
                key={section.id}
                className={`overflow-hidden rounded-2xl border bg-white transition ${
                  sectionContainsSelection
                    ? "border-teal-300 shadow-sm ring-2 ring-teal-100"
                    : "border-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(section)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <BasemapPreviewThumbnail basemapId={representativeId} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-black text-slate-950">
                      {section.id === "classic"
                        ? "Cartes classiques"
                        : "Fonds blancs"}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                      {section.description}
                    </span>
                    {sectionContainsSelection ? (
                      <span className="mt-1 block text-xs font-semibold text-teal-700">
                        Sélection actuelle : {selectedBasemap.label}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
                    {isOpen ? "Réduire ▴" : "Afficher ▾"}
                  </span>
                </button>

                {isOpen ? (
                  <div className="border-t border-slate-200 bg-slate-50/70 p-3">
                    {section.id === "white-vector" ? (
                      <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <BasemapPreviewThumbnail basemapId="france-regions" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Aperçu fixe
                          </div>
                          <div className="mt-0.5 text-sm font-semibold text-slate-900">
                            Exemple de fond blanc
                          </div>
                          <div className="mt-0.5 text-xs leading-5 text-slate-500">
                            Le rendu reste blanc et épuré ; les frontières changent selon le territoire choisi.
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="max-h-[390px] space-y-2 overflow-y-auto overscroll-contain pr-1">
                      {section.items.map((item, index) =>
                        renderMenuItem(item, section, [], index),
                      )}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5">
        <BasemapPreviewThumbnail basemapId={selectedBasemapId} compact />
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide text-teal-700">
            Fond sélectionné
          </div>
          <div className="truncate text-sm font-black text-teal-950">
            {selectedBasemap.label}
          </div>
        </div>
      </div>
    </div>
  );
}


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
};

type PlaceSearchResponse = {
  results?: PlaceSearchResult[];
  error?: string;
};

function resultToWorkspaceBounds(result: PlaceSearchResult): WorkspaceBounds {
  if (result.bounds) {
    return {
      southWest: { lat: result.bounds.south, lng: result.bounds.west },
      northEast: { lat: result.bounds.north, lng: result.bounds.east },
    };
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

function StepProgress({ step }: { step: number }) {
  const labels = ["Nom", "Fond", "Zone", "Calques"];
  return (
    <div className="grid grid-cols-4 gap-2" aria-label={`Étape ${step} sur 4`}>
      {labels.map((label, index) => {
        const number = index + 1;
        const active = number === step;
        const complete = number < step;
        return (
          <div key={label} className="min-w-0">
            <div
              className={`h-1.5 rounded-full ${complete ? "bg-emerald-500" : active ? "bg-teal-600" : "bg-slate-200"}`}
            />
            <div
              className={`mt-1.5 truncate text-xs font-semibold ${active ? "text-teal-700" : complete ? "text-emerald-700" : "text-slate-400"}`}
            >
              {number}. {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SetupMapStep({
  projectId,
  basemapId,
  initialBounds,
  onBoundsChange,
  onValidationChange,
  onBack,
  onContinue,
  onSkip,
  canContinue,
}: {
  projectId: string;
  basemapId: DromapBasemapId;
  initialBounds: WorkspaceBounds | null;
  onBoundsChange: (bounds: WorkspaceBounds | null) => void;
  onValidationChange: (validated: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
  canContinue: boolean;
}) {
  const workspaceBounds = useEditorWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const workspaceBasemapBaseZoom = useEditorWorkspaceStore(
    (state) => state.workspaceBasemapBaseZoom,
  );
  const setWorkspaceBounds = useEditorWorkspaceStore(
    (state) => state.setWorkspaceBounds,
  );
  const clearWorkspaceBounds = useEditorWorkspaceStore(
    (state) => state.clearWorkspaceBounds,
  );
  const validateWorkspaceZone = useEditorWorkspaceStore(
    (state) => state.validateWorkspaceZone,
  );
  const modifyWorkspaceZone = useEditorWorkspaceStore(
    (state) => state.modifyWorkspaceZone,
  );
  const currentMode = useEditorModeStore((state) => state.currentMode);
  const currentView = useEditorMapViewStore((state) => state.currentView);
  const requestMapFitToBounds = useEditorSelectionStore(
    (state) => state.requestMapFitToBounds,
  );
  const setBasemapId = useEditorBasemapStore((state) => state.setBasemapId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<string>(
    "Recherche une ville, un pays, une adresse ou trace directement un rectangle sur la carte.",
  );
  const [isSearching, setIsSearching] = useState(false);
  const requestIdRef = useRef(0);
  const initialBoundsRef = useRef(initialBounds);
  const allowSelectWholeWorld = canSelectWholeWorldFromSetup(basemapId);

  useEffect(() => {
    useEditorFeaturesStore.getState().replaceFeatures([]);
    useEditorLayersStore
      .getState()
      .setLayers([createDefaultDromapLayer()]);
    useEditorGeoJsonLayersStore.getState().setGeoJsonLayers([]);
    useEditorModeStore.getState().setCurrentMode("workspace-select");
    useEditorMapViewStore.getState().setCurrentView(null);
    onValidationChange(false);
    setBasemapId(basemapId, { fit: true });

    const startingBounds = initialBoundsRef.current;
    if (startingBounds) {
      setWorkspaceBounds(startingBounds);
      window.requestAnimationFrame(() => {
        requestMapFitToBounds(startingBounds, { animate: false, maxZoom: 12 });
      });
    } else {
      clearWorkspaceBounds();
    }
  }, [
    basemapId,
    clearWorkspaceBounds,
    onValidationChange,
    projectId,
    requestMapFitToBounds,
    setBasemapId,
    setWorkspaceBounds,
  ]);

  useEffect(() => {
    onBoundsChange(workspaceBounds);
  }, [onBoundsChange, workspaceBounds]);

  const workspaceValidation = validateWorkspaceBoundsRatio(workspaceBounds);
  const isWorkspaceValidated = Boolean(
    currentMode === "edit" &&
      workspaceBounds &&
      currentView &&
      workspaceBasemapBaseZoom !== null,
  );

  useEffect(() => {
    onValidationChange(isWorkspaceValidated);
  }, [isWorkspaceValidated, onValidationChange]);

  async function searchPlace() {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || isSearching) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsSearching(true);
    setSearchStatus("Recherche en cours…");

    try {
      const response = await fetch(
        `/api/dromap/place-search?q=${encodeURIComponent(normalizedQuery)}`,
        { headers: { Accept: "application/json", "Accept-Language": "fr" } },
      );
      const payload = (await response.json()) as PlaceSearchResponse;
      if (requestId !== requestIdRef.current) return;
      if (!response.ok) throw new Error(payload.error || "Recherche impossible.");
      const nextResults = payload.results ?? [];
      setResults(nextResults);
      setSearchStatus(
        nextResults.length > 0
          ? `${nextResults.length} résultat${nextResults.length > 1 ? "s" : ""}. Choisis le territoire à utiliser comme zone.`
          : "Aucun résultat. Essaie une formulation plus précise.",
      );
    } catch (error) {
      setSearchStatus(
        error instanceof Error ? error.message : "Recherche impossible.",
      );
      setResults([]);
    } finally {
      if (requestId === requestIdRef.current) setIsSearching(false);
    }
  }

  function selectBounds(bounds: WorkspaceBounds) {
    useEditorMapViewStore.getState().setCurrentView(null);
    setWorkspaceBounds(bounds);
    useEditorModeStore.getState().setCurrentMode("workspace-select");
    onValidationChange(false);
    requestMapFitToBounds(bounds, { animate: false, maxZoom: 12 });
  }

  function handleValidateWorkspace() {
    if (!workspaceBounds || !workspaceValidation.isValid || currentMode === "edit") {
      return;
    }

    // Comme dans l'éditeur, la validation déclenche le cadrage définitif de la
    // zone, puis verrouille le niveau de détail du fond sur ce rendu final.
    // On efface la vue précédente afin de n'accepter comme vue sauvegardée que
    // celle produite après le fitBounds de validation.
    useEditorMapViewStore.getState().setCurrentView(null);
    onValidationChange(false);
    validateWorkspaceZone();
  }

  function handleModifyWorkspace() {
    if (!workspaceBounds) return;

    useEditorMapViewStore.getState().setCurrentView(null);
    onValidationChange(false);
    modifyWorkspaceZone();
  }

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-slate-200">
      <GraphicZoomViewport>
        <SetupMap />
      </GraphicZoomViewport>

      <aside className="absolute bottom-4 left-4 top-4 z-[1300] flex w-[350px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-teal-600">
            Étape 3 sur 4
          </div>
          <h1 className="mt-1 text-xl font-black text-slate-950">
            Définir la zone de travail
          </h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {allowSelectWholeWorld
              ? "Recherche un territoire, trace un rectangle directement sur la carte ou appuie sur « Sélectionner le monde ». "
              : "Recherche un territoire ou trace un rectangle directement sur la carte. "}
            Cette zone de travail sera là où vous éditerez votre carte.
            Vous pourrez la modifier plus tard pendant l’édition.
          </p>

          <div className="mt-4 space-y-2">
            <label
              htmlFor="setup-place-search"
              className="text-sm font-semibold text-slate-800"
            >
              Rechercher un lieu
            </label>
            <div className="flex gap-2">
              <input
                id="setup-place-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchPlace();
                }}
                placeholder="Paris, Bretagne, Arménie…"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              />
              <DromapButton
                onClick={() => void searchPlace()}
                disabled={isSearching || query.trim().length < 2}
              >
                Aller
              </DromapButton>
            </div>
            <p className="text-xs leading-5 text-slate-500">{searchStatus}</p>
          </div>

          {results.length > 0 ? (
            <div className="mt-3 space-y-2">
              {results.slice(0, 6).map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => selectBounds(resultToWorkspaceBounds(result))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 transition hover:border-teal-300 hover:bg-teal-50"
                >
                  {result.displayName}
                </button>
              ))}
            </div>
          ) : null}

          {allowSelectWholeWorld ? (
            <div className="mt-5 space-y-2 border-t border-slate-200 pt-4">
              <DromapButton
                fullWidth
                onClick={() => selectBounds(DROMAP_FULL_WORLD_WORKSPACE_BOUNDS)}
              >
                Sélectionner le monde
              </DromapButton>
            </div>
          ) : null}

          {workspaceBounds ? (
            <div className="mt-5 border-t border-slate-200 pt-4">
              {isWorkspaceValidated ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                  <div className="flex items-start gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-black text-white">
                      ✓
                    </span>
                    <div className="min-w-0">
                      <strong className="block text-sm text-emerald-950">
                        Zone validée
                      </strong>
                      <p className="mt-1 text-xs leading-5 text-emerald-800">
                        Vous pouvez maintenant continuer.
                      </p>
                    </div>
                  </div>
                  <DromapButton
                    fullWidth
                    className="mt-3"
                    onClick={handleModifyWorkspace}
                  >
                    Modifier la zone
                  </DromapButton>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <DromapButton
                    fullWidth
                    variant="primary"
                    onClick={handleValidateWorkspace}
                    disabled={!workspaceValidation.isValid || currentMode === "edit"}
                  >
                    Valider pour continuer
                  </DromapButton>
                  {!workspaceValidation.isValid ? (
                    <p className="mt-2 text-xs leading-5 text-amber-900">
                      {workspaceValidation.message}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white p-3 shadow-[0_-8px_20px_rgba(15,23,42,0.06)]">
          <DromapButton onClick={onBack}>Retour</DromapButton>
          <button
            type="button"
            onClick={onSkip}
            className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
          >
            Passer les étapes
          </button>
          <DromapButton
            fullWidth
            variant="primary"
            onClick={onContinue}
            disabled={!canContinue}
          >
            Continuer
          </DromapButton>
        </div>
      </aside>

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-[1200] -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-lg">
        {!workspaceBounds
          ? allowSelectWholeWorld
            ? "Trace un rectangle ou choisis le monde entier"
            : "Trace un rectangle ou recherche un territoire"
          : isWorkspaceValidated
            ? "Zone validée — vous pouvez continuer."
            : currentMode === "edit"
              ? "Validation de la zone…"
              : "Zone sélectionnée — clique maintenant sur « Valider pour continuer »."}
      </div>
    </div>

  );
}

function SetupContent({ projectId }: { projectId: string }) {
  const router = useRouter();
  const project = useDromapProductStore((state) =>
    state.projects.find((item) => item.id === projectId),
  );
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountPlan = useDromapProductStore((state) => state.accountPlan);
  const renameProject = useDromapProductStore((state) => state.renameProject);
  const updateProjectSetup = useDromapProductStore((state) => state.updateProjectSetup);
  const setSetupStep = useDromapProductStore((state) => state.setSetupStep);
  const completeSetupStep = useDromapProductStore(
    (state) => state.completeSetupStep,
  );
  const setProjectBasemap = useDromapProductStore(
    (state) => state.setProjectBasemap,
  );
  const setProjectWorkspace = useDromapProductStore(
    (state) => state.setProjectWorkspace,
  );
  const setProjectWorkspaceView = useDromapProductStore(
    (state) => state.setProjectWorkspaceView,
  );
  const setProjectLayerChoice = useDromapProductStore(
    (state) => state.setProjectLayerChoice,
  );
  const completeProjectSetup = useDromapProductStore(
    (state) => state.completeProjectSetup,
  );
  const [nameDraft, setNameDraft] = useState(project?.name ?? "Projet sans titre");
  const [selectedBasemapId, setSelectedBasemapId] = useState<DromapBasemapId>(
    project?.setup.basemapId ?? "openfreemap-liberty",
  );
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceBounds | null>(
    project?.setup.workspaceBounds ?? null,
  );
  const [workspaceValidated, setWorkspaceValidated] = useState(false);
  const [isPreparingBasemapWorkspace, setIsPreparingBasemapWorkspace] =
    useState(false);
  const initialSavedGeoJsonLayerId =
    project?.setup.layerChoice?.kind === "geojson"
      ? project.setup.layerChoice.geoJsonLayer.sourceSavedLayerId ?? ""
      : "";
  const [layerChoiceKind, setLayerChoiceKind] = useState<
    "empty" | "none" | "saved" | "geojson" | null
  >(initialSavedGeoJsonLayerId ? "saved" : project?.setup.layerChoice?.kind ?? null);
  const [selectedSavedLayerId, setSelectedSavedLayerId] = useState<string>(
    project?.setup.layerChoice?.kind === "saved"
      ? project.setup.layerChoice.savedLayer.id
      : "",
  );
  const [selectedSavedGeoJsonLayerId, setSelectedSavedGeoJsonLayerId] =
    useState<string>(initialSavedGeoJsonLayerId);
  const [geoJsonLayer, setGeoJsonLayer] = useState(
    project?.setup.layerChoice?.kind === "geojson"
      ? project.setup.layerChoice.geoJsonLayer
      : null,
  );
  const [geoJsonPrecision, setGeoJsonPrecision] =
    useState<DromapGeoJsonPrecisionMode>("original");
  const [geoJsonError, setGeoJsonError] = useState<string | null>(null);
  const [isImportingGeoJson, setIsImportingGeoJson] = useState(false);
  const [geoJsonImportProgress, setGeoJsonImportProgress] =
    useState<GeoJsonFileImportProgress | null>(null);
  const [quitDialogOpen, setQuitDialogOpen] = useState(false);
  const [savedLayersLibraryOpen, setSavedLayersLibraryOpen] = useState(false);
  const [pendingPerformanceBasemapId, setPendingPerformanceBasemapId] =
    useState<DromapBasemapId | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const geoJsonImportAbortRef = useRef<AbortController | null>(null);
  const autoWorkspaceBasemapIdRef = useRef<DromapBasemapId | null>(null);
  const basemapWorkspaceRequestRef = useRef(0);
  const loadSavedLayersFromStorage = useEditorLayersStore(
    (state) => state.loadSavedLayersFromStorage,
  );
  const savedLayers = useEditorLayersStore((state) => state.savedLayers);
  const loadSavedGeoJsonLayersFromStorage = useEditorGeoJsonLayersStore(
    (state) => state.loadSavedGeoJsonLayersFromStorage,
  );
  const savedGeoJsonLayers = useEditorGeoJsonLayersStore(
    (state) => state.savedGeoJsonLayers,
  );
  const renameSavedLayer = useEditorLayersStore(
    (state) => state.renameSavedLayer,
  );
  const deleteSavedLayer = useEditorLayersStore(
    (state) => state.deleteSavedLayer,
  );
  const renameSavedGeoJsonLayer = useEditorGeoJsonLayersStore(
    (state) => state.renameSavedGeoJsonLayer,
  );
  const deleteSavedGeoJsonLayer = useEditorGeoJsonLayersStore(
    (state) => state.deleteSavedGeoJsonLayer,
  );
  const capabilities = getDromapCapabilities(userMode, accountPlan);
  const selectedBasemap = getDromapBasemapConfig(selectedBasemapId);

  useEffect(() => {
    if (!capabilities.canSaveLayersToLibrary) return;
    loadSavedLayersFromStorage();
    loadSavedGeoJsonLayersFromStorage();
  }, [
    capabilities.canSaveLayersToLibrary,
    loadSavedGeoJsonLayersFromStorage,
    loadSavedLayersFromStorage,
  ]);

  useEffect(() => {
    if (!project) return;
    setNameDraft(project.name);
    setSelectedBasemapId(project.setup.basemapId);
    setWorkspaceDraft(project.setup.workspaceBounds);
    setWorkspaceValidated(false);
  }, [project]);

  useEffect(() => {
    if (project?.setupComplete) {
      router.replace(`/projects/${project.id}/editor`);
    }
  }, [project, router]);

  useEffect(
    () => () => {
      geoJsonImportAbortRef.current?.abort();
      geoJsonImportAbortRef.current = null;
    },
    [],
  );

  if (!project || project.status === "trashed") {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-black text-slate-950">Projet introuvable</h1>
          <DromapButton className="mt-4" onClick={() => router.push("/dashboard")}>
            Menu principal
          </DromapButton>
        </div>
      </div>
    );
  }

  const activeProject = project;

  function requestSetupBasemapSelect(nextBasemapId: DromapBasemapId) {
    if (nextBasemapId === selectedBasemapId) return;

    if (getSetupBasemapPerformanceWarning(nextBasemapId)) {
      setPendingPerformanceBasemapId(nextBasemapId);
      return;
    }

    void handleSetupBasemapSelect(nextBasemapId);
  }

  async function handleSetupBasemapSelect(nextBasemapId: DromapBasemapId) {
    setSelectedBasemapId(nextBasemapId);
    setWorkspaceValidated(false);

    const requestId = basemapWorkspaceRequestRef.current + 1;
    basemapWorkspaceRequestRef.current = requestId;

    const canReplaceWithAutomaticWorkspace =
      workspaceDraft === null || autoWorkspaceBasemapIdRef.current !== null;

    if (
      !shouldAutoWorkspaceForSetupBasemap(nextBasemapId) ||
      !canReplaceWithAutomaticWorkspace
    ) {
      setIsPreparingBasemapWorkspace(false);
      if (
        autoWorkspaceBasemapIdRef.current !== null &&
        !shouldAutoWorkspaceForSetupBasemap(nextBasemapId)
      ) {
        autoWorkspaceBasemapIdRef.current = null;
        setWorkspaceDraft(null);
      }
      return;
    }

    setIsPreparingBasemapWorkspace(true);

    try {
      const { getBasemapViewportBounds } = await import(
        "@/editor/basemap-viewport-bounds"
      );
      const basemap = getDromapBasemapConfig(nextBasemapId);
      const bounds = await getBasemapViewportBounds(basemap);

      if (
        requestId !== basemapWorkspaceRequestRef.current ||
        !bounds.isValid()
      ) {
        return;
      }

      autoWorkspaceBasemapIdRef.current = nextBasemapId;
      setWorkspaceDraft(createSetupWorkspaceBoundsAroundBasemap(bounds));
    } catch (error) {
      console.warn(
        "Impossible de préparer automatiquement la zone du fond blanc sélectionné.",
        error,
      );
    } finally {
      if (requestId === basemapWorkspaceRequestRef.current) {
        setIsPreparingBasemapWorkspace(false);
      }
    }
  }

  const selectedLibraryLayerLabel = selectedSavedLayerId
    ? savedLayers.find((layer) => layer.id === selectedSavedLayerId)?.name ?? null
    : selectedSavedGeoJsonLayerId
      ? savedGeoJsonLayers.find((layer) => layer.id === selectedSavedGeoJsonLayerId)
          ?.name ?? null
      : null;

  if (activeProject.setupComplete) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-600">
        Ouverture de l’éditeur…
      </div>
    );
  }

  const step = activeProject.setup.currentStep;
  const workspaceValidation = validateWorkspaceBoundsRatio(workspaceDraft);
  const canContinue =
    step === 1
      ? true
      : step === 2
        ? Boolean(selectedBasemapId) && !isPreparingBasemapWorkspace
        : step === 3
          ? workspaceDraft !== null &&
            workspaceValidation.isValid &&
            workspaceValidated
          : layerChoiceKind !== null &&
            (layerChoiceKind !== "saved" ||
              Boolean(selectedSavedLayerId || selectedSavedGeoJsonLayerId)) &&
            (layerChoiceKind !== "geojson" || geoJsonLayer !== null);

  function persistWorkspaceDraft(options?: { requireValidatedView?: boolean }) {
    if (!workspaceDraft) return false;

    const currentMapView = useEditorMapViewStore.getState().currentView;
    const requireValidatedView = options?.requireValidatedView === true;

    if (requireValidatedView && (!workspaceValidated || !currentMapView)) {
      return false;
    }

    setProjectWorkspace(activeProject.id, workspaceDraft);
    setProjectWorkspaceView(
      activeProject.id,
      currentMapView ?? activeProject.setup.workspaceView,
    );
    return true;
  }

  function persistCurrentStepDraft() {
    if (step === 1) {
      renameProject(activeProject.id, nameDraft);
      return;
    }

    if (step === 2) {
      setProjectBasemap(activeProject.id, selectedBasemapId);
      return;
    }

    if (step === 3 && workspaceDraft) {
      persistWorkspaceDraft();
      return;
    }

    if (step === 4 && layerChoiceKind) {
      if (layerChoiceKind === "empty") {
        setProjectLayerChoice(activeProject.id, { kind: "empty" });
      } else if (layerChoiceKind === "none") {
        setProjectLayerChoice(activeProject.id, { kind: "none" });
      } else if (layerChoiceKind === "saved") {
        const savedLayer = savedLayers.find(
          (layer) => layer.id === selectedSavedLayerId,
        );
        if (savedLayer) {
          setProjectLayerChoice(activeProject.id, { kind: "saved", savedLayer });
        } else {
          const savedGeoJsonLayer = savedGeoJsonLayers.find(
            (layer) => layer.id === selectedSavedGeoJsonLayerId,
          );
          if (savedGeoJsonLayer) {
            setProjectLayerChoice(activeProject.id, {
              kind: "geojson",
              geoJsonLayer: remapSavedGeoJsonLayerToMap(savedGeoJsonLayer, 0),
            });
          }
        }
      } else if (geoJsonLayer) {
        setProjectLayerChoice(activeProject.id, { kind: "geojson", geoJsonLayer });
      }
    }
  }

  function goBack() {
    if (step === 1) {
      setQuitDialogOpen(true);
      return;
    }

    persistCurrentStepDraft();
    if (step === 3) {
      autoWorkspaceBasemapIdRef.current = null;
    }
    setSetupStep(activeProject.id, (step - 1) as 1 | 2 | 3 | 4);
  }

  function continueSetup() {
    if (!canContinue) return;

    if (step === 1) {
      renameProject(activeProject.id, nameDraft);
      completeSetupStep(activeProject.id, 1);
      setSetupStep(activeProject.id, 2);
      return;
    }

    if (step === 2) {
      setProjectBasemap(activeProject.id, selectedBasemapId);
      completeSetupStep(activeProject.id, 2);
      setSetupStep(activeProject.id, 3);
      return;
    }

    if (step === 3 && workspaceDraft) {
      if (!persistWorkspaceDraft({ requireValidatedView: true })) return;
      completeSetupStep(activeProject.id, 3);
      setSetupStep(activeProject.id, 4);
      return;
    }

    if (step === 4 && layerChoiceKind) {
      if (layerChoiceKind === "empty") {
        setProjectLayerChoice(activeProject.id, { kind: "empty" });
      } else if (layerChoiceKind === "none") {
        setProjectLayerChoice(activeProject.id, { kind: "none" });
      } else if (layerChoiceKind === "saved") {
        const savedLayer = savedLayers.find(
          (layer) => layer.id === selectedSavedLayerId,
        );
        if (savedLayer) {
          setProjectLayerChoice(activeProject.id, { kind: "saved", savedLayer });
        } else {
          const savedGeoJsonLayer = savedGeoJsonLayers.find(
            (layer) => layer.id === selectedSavedGeoJsonLayerId,
          );
          if (!savedGeoJsonLayer) return;
          setProjectLayerChoice(activeProject.id, {
            kind: "geojson",
            geoJsonLayer: remapSavedGeoJsonLayerToMap(savedGeoJsonLayer, 0),
          });
        }
      } else if (geoJsonLayer) {
        setProjectLayerChoice(activeProject.id, { kind: "geojson", geoJsonLayer });
      }
      completeSetupStep(activeProject.id, 4);
      completeProjectSetup(activeProject.id);
      router.push(`/projects/${activeProject.id}/editor`);
    }
  }

  function skipSetupAndOpenEditor() {
    const finalName = nameDraft.trim() || "Projet sans titre";

    // Le raccourci part volontairement d'une base neutre et prévisible :
    // fond par défaut, aucune zone validée et un calque DroMap vide.
    renameProject(activeProject.id, finalName);
    updateProjectSetup(activeProject.id, {
      currentStep: 4,
      completedSteps: [1, 2, 3, 4],
      basemapId: DEFAULT_DROMAP_BASEMAP_ID,
      workspaceBounds: null,
      workspaceView: null,
      layerChoice: { kind: "empty" },
    });

    // Nettoyer aussi les stores cartographiques transitoires du parcours afin
    // que l'éditeur ne récupère pas une zone ou un fond provisoire.
    useEditorFeaturesStore.getState().replaceFeatures([]);
    useEditorLayersStore.getState().setLayers([createDefaultDromapLayer()]);
    useEditorGeoJsonLayersStore.getState().setGeoJsonLayers([]);
    useEditorWorkspaceStore.setState({
      workspaceBounds: null,
      pendingFitToWorkspace: false,
      workspaceBasemapZoom: null,
      workspaceBasemapBaseZoom: null,
      workspaceNavigationUnlocked: false,
    });
    useEditorModeStore.getState().setCurrentMode("workspace-select");
    useEditorMapViewStore.getState().setCurrentView(null);
    useEditorBasemapStore.getState().setBasemapId(DEFAULT_DROMAP_BASEMAP_ID, { fit: true });

    completeProjectSetup(activeProject.id);
    router.push(`/projects/${activeProject.id}/editor`);
  }

  async function handleGeoJsonFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file || isImportingGeoJson) return;

    try {
      const abortController = new AbortController();
      geoJsonImportAbortRef.current = abortController;
      setGeoJsonError(null);
      setIsImportingGeoJson(true);
      setGeoJsonImportProgress(null);
      const result = await importGeoJsonFileAutomatically(file, {
        workspaceBounds: workspaceDraft,
        precisionMode: geoJsonPrecision,
        signal: abortController.signal,
        onProgress: setGeoJsonImportProgress,
      });
      setGeoJsonLayer(result.layer);
      if (result.summary.automaticallyOptimized) {
        setGeoJsonPrecision("light");
      }
      setSelectedSavedLayerId("");
      setSelectedSavedGeoJsonLayerId("");
      setLayerChoiceKind("geojson");
    } catch (error) {
      setGeoJsonLayer(null);
      setGeoJsonError(
        error instanceof GeoJsonFileImportError && error.code === "cancelled"
          ? "Import GeoJSON annulé."
          : error instanceof Error
            ? error.message
            : "Import GeoJSON impossible.",
      );
    } finally {
      geoJsonImportAbortRef.current = null;
      setIsImportingGeoJson(false);
      setGeoJsonImportProgress(null);
    }
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f7f9f8] text-slate-950">
      <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex sm:min-h-14 sm:items-center sm:py-0">
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#b9ddd7] bg-[#e9f6f3] sm:h-11 sm:w-11 sm:rounded-2xl">
              <DromapLogoMark className="h-9 w-9 object-contain" />
            </span>
            <div>
              <div className="font-black">DroMap</div>
              <div className="max-w-72 truncate text-xs text-slate-500">{activeProject.name}</div>
            </div>
          </div>
          <div className="order-3 col-span-2 w-full sm:order-none sm:col-span-1 sm:max-w-md"><StepProgress step={step} /></div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                persistCurrentStepDraft();
                router.push("/help");
              }}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Aide
            </button>
            <button
              type="button"
              onClick={() => setQuitDialogOpen(true)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Quitter
            </button>
          </div>
        </div>
      </header>

      <main className={step === 3 ? "relative min-h-0 w-full flex-1 overflow-hidden" : "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-y-auto p-4 sm:p-6"}>
        {step === 1 ? (
          <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="text-sm font-bold uppercase tracking-wide text-teal-600">Étape 1 sur 4</div>
            <h1 className="mt-2 text-2xl font-black">Nommer le projet</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              « Projet sans titre » est accepté.
            </p>
            <p className="mt-2 text-xs font-semibold text-teal-700">
              Ce choix n’est pas définitif : vous pourrez modifier le nom du projet plus tard.
            </p>
            <label htmlFor="project-name" className="mt-7 block text-sm font-semibold text-slate-800">
              Nom du projet
            </label>
            <input
              id="project-name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              autoFocus
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mx-auto w-full max-w-4xl">
            <div className="mb-5">
              <div className="text-sm font-bold uppercase tracking-wide text-teal-600">Étape 2 sur 4</div>
              <h1 className="mt-2 text-2xl font-black">Choisir le fond de carte</h1>
              <p className="mt-2 text-xs font-semibold text-teal-700">
                Ce choix n’est pas définitif : vous pourrez modifier le fond de carte plus tard dans l’éditeur.
              </p>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <SetupBasemapPicker
                selectedBasemapId={selectedBasemapId}
                onSelect={requestSetupBasemapSelect}
              />

              <div className="mx-auto mt-5 max-w-3xl rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                <strong className="text-slate-900">{selectedBasemap.label}</strong> — {selectedBasemap.description}
              </div>
              {isPreparingBasemapWorkspace ? (
                <p className="mx-auto mt-2 max-w-3xl text-xs font-semibold text-teal-700">
                  Préparation automatique de la zone du fond blanc…
                </p>
              ) : null}
            </section>
          </div>
        ) : null}

        {step === 3 ? (
          <SetupMapStep
            projectId={activeProject.id}
            basemapId={selectedBasemapId}
            initialBounds={workspaceDraft}
            onBoundsChange={setWorkspaceDraft}
            onValidationChange={setWorkspaceValidated}
            onBack={goBack}
            onContinue={continueSetup}
            onSkip={skipSetupAndOpenEditor}
            canContinue={canContinue}
          />
        ) : null}

        {step === 4 ? (
          <div>
            <div className="mb-5">
              <div className="text-sm font-bold uppercase tracking-wide text-teal-600">Étape 4 sur 4</div>
              <h1 className="mt-2 text-2xl font-black">Préparer les calques et les données</h1>
              <p className="mt-2 text-sm text-slate-600">Choisis une structure initiale. Aucun type de calque n’est obligatoire.</p>
              <p className="mt-2 text-xs font-semibold text-teal-700">
                Ce choix n’est pas définitif : vous pourrez ajouter, retirer ou modifier les calques plus tard dans l’éditeur.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              className="hidden"
              onChange={handleGeoJsonFile}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setLayerChoiceKind("empty")}
                className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:border-teal-300 ${layerChoiceKind === "empty" ? "border-teal-600 ring-4 ring-teal-100" : "border-slate-200"}`}
              >
                <h2 className="font-black">Créer un calque vide</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Commencer avec « Calque 1 », prêt à recevoir les nouveaux objets.</p>
              </button>

              <button
                type="button"
                onClick={() => setLayerChoiceKind("none")}
                className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:border-teal-300 ${layerChoiceKind === "none" ? "border-teal-600 ring-4 ring-teal-100" : "border-slate-200"}`}
              >
                <h2 className="font-black">Commencer sans calque DroMap</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Autorise un projet composé uniquement de données GeoJSON ou l’ajout de calques plus tard.</p>
              </button>

              <div className={`rounded-2xl border bg-white p-5 shadow-sm ${layerChoiceKind === "geojson" ? "border-teal-600 ring-4 ring-teal-100" : "border-slate-200"}`}>
                <h2 className="font-black">Importer un GeoJSON</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Le fichier reste un calque léger et pourra être transformé en objets DroMap plus tard.</p>
                <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="setup-geojson-precision">Précision d’affichage</label>
                <select
                  id="setup-geojson-precision"
                  value={geoJsonPrecision}
                  onChange={(event) => setGeoJsonPrecision(event.target.value as DromapGeoJsonPrecisionMode)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="original">Originale</option>
                  <option value="intermediate">Intermédiaire</option>
                  <option value="light">Légère</option>
                </select>
                <DromapButton
                  className="mt-3"
                  disabled={isImportingGeoJson}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isImportingGeoJson
                    ? `Analyse${geoJsonImportProgress ? ` · ${geoJsonImportProgress.percent}%` : "…"}`
                    : "Choisir un fichier"}
                </DromapButton>
                {isImportingGeoJson ? (
                  <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                    <div className="flex items-center justify-between gap-3 font-bold">
                      <span>Lecture progressive et recadrage automatique</span>
                      <button
                        type="button"
                        onClick={() => geoJsonImportAbortRef.current?.abort()}
                        className="rounded-lg border border-sky-300 bg-white px-2 py-1 font-black text-sky-800"
                      >
                        Annuler
                      </button>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-100">
                      <div
                        className="h-full rounded-full bg-sky-600 transition-[width] duration-200"
                        style={{ width: `${geoJsonImportProgress?.percent ?? 2}%` }}
                      />
                    </div>
                  </div>
                ) : null}
                {geoJsonLayer ? (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    {geoJsonLayer.name} · {geoJsonLayer.featureCount.toLocaleString("fr-FR")} entité{geoJsonLayer.featureCount > 1 ? "s" : ""}
                  </div>
                ) : null}
                {geoJsonError ? <div className="mt-3 text-xs text-red-700">{geoJsonError}</div> : null}
              </div>

              <div className={`rounded-2xl border bg-white p-5 shadow-sm ${layerChoiceKind === "saved" ? "border-teal-600 ring-4 ring-teal-100" : "border-slate-200"}`}>
                <h2 className="font-black">Utiliser un calque enregistré {capabilities.canSaveLayersToLibrary ? "" : "🔒"}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {capabilities.canSaveLayersToLibrary
                    ? "Ajoute une copie indépendante d’un calque de ta bibliothèque personnelle."
                    : "La bibliothèque personnelle de calques nécessite un compte."}
                </p>
                {capabilities.canSaveLayersToLibrary ? (
                  <>
                    <DromapButton
                      className="mt-4"
                      onClick={() => setSavedLayersLibraryOpen(true)}
                    >
                      Ouvrir la bibliothèque de calques
                    </DromapButton>
                    {selectedLibraryLayerLabel ? (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        Calque choisi : <strong>{selectedLibraryLayerLabel}</strong>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        La bibliothèque affichée est la même que dans l’éditeur, avec prévisualisation des calques DroMap et GeoJSON enregistrés.
                      </p>
                    )}
                  </>
                ) : (
                  <DromapButton
                    className="mt-4"
                    onClick={() => router.push("/signup")}
                  >
                    Activer le compte de test
                  </DromapButton>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {step !== 3 ? (
        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_20px_rgba(15,23,42,0.06)] sm:px-6 sm:py-4">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-4">
            <DromapButton onClick={goBack}>{step === 1 ? "Quitter" : "Retour"}</DromapButton>
            <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 sm:flex">
              <button
                type="button"
                onClick={skipSetupAndOpenEditor}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
              >
                Passer les étapes
              </button>
              <div className="hidden text-xs text-slate-500 md:block">
                Le brouillon est enregistré automatiquement sur cet appareil.
              </div>
            </div>
            <DromapButton variant="primary" onClick={continueSetup} disabled={!canContinue}>
              {step === 4 ? "Commencer à créer la carte" : "Continuer"}
            </DromapButton>
          </div>
        </footer>
      ) : null}

      <SavedLayersLibraryModal
        isOpen={savedLayersLibraryOpen}
        zIndex={2600}
        mode="select"
        selectActionLabel="Choisir ce calque"
        savedLayers={savedLayers}
        savedGeoJsonLayers={savedGeoJsonLayers}
        appliedSavedLayerIds={new Set<string>()}
        appliedSavedGeoJsonLayerIds={new Set<string>()}
        onClose={() => setSavedLayersLibraryOpen(false)}
        onApplySavedLayer={(layer) => {
          setSelectedSavedLayerId(layer.id);
          setSelectedSavedGeoJsonLayerId("");
          setLayerChoiceKind("saved");
          setSavedLayersLibraryOpen(false);
        }}
        onRenameSavedLayer={(layer) => renameSavedLayer(layer.id, layer.name)}
        onDeleteSavedLayer={(layer) => deleteSavedLayer(layer.id)}
        onApplySavedGeoJsonLayer={(layer) => {
          setSelectedSavedLayerId("");
          setSelectedSavedGeoJsonLayerId(layer.id);
          setGeoJsonLayer(remapSavedGeoJsonLayerToMap(layer, 0));
          setLayerChoiceKind("saved");
          setSavedLayersLibraryOpen(false);
        }}
        onRenameSavedGeoJsonLayer={(layer) =>
          renameSavedGeoJsonLayer(layer.id, layer.name)
        }
        onDeleteSavedGeoJsonLayer={(layer) => deleteSavedGeoJsonLayer(layer.id)}
      />

      <DromapDialog
        open={pendingPerformanceBasemapId !== null}
        title={
          pendingPerformanceBasemapId
            ? getSetupBasemapPerformanceWarning(pendingPerformanceBasemapId)?.title ??
              "Attention aux performances"
            : "Attention aux performances"
        }
        description={
          pendingPerformanceBasemapId
            ? getSetupBasemapPerformanceWarning(pendingPerformanceBasemapId)
                ?.description ??
              "Ce fond peut demander davantage de ressources."
            : "Ce fond peut demander davantage de ressources."
        }
        onClose={() => setPendingPerformanceBasemapId(null)}
        footer={
          <>
            <DromapButton onClick={() => setPendingPerformanceBasemapId(null)}>
              Annuler
            </DromapButton>
            <DromapButton
              variant="primary"
              onClick={() => {
                const nextBasemapId = pendingPerformanceBasemapId;
                setPendingPerformanceBasemapId(null);
                if (nextBasemapId) {
                  void handleSetupBasemapSelect(nextBasemapId);
                }
              }}
            >
              Utiliser ce fond
            </DromapButton>
          </>
        }
      />

      <DromapDialog
        open={quitDialogOpen}
        title="Quitter le parcours ?"
        description="Le brouillon est conservé. La prochaine ouverture reprendra à cette étape."
        onClose={() => setQuitDialogOpen(false)}
        footer={
          <>
            <DromapButton onClick={() => setQuitDialogOpen(false)}>Rester</DromapButton>
            <DromapButton
              variant="primary"
              onClick={() => {
                persistCurrentStepDraft();
                router.push("/dashboard");
              }}
            >
              Quitter vers le tableau de bord
            </DromapButton>
          </>
        }
      />
    </div>
  );
}

export function DromapProjectSetupClient({ projectId }: { projectId: string }) {
  return (
    <DromapProductBootstrap>
      <SetupContent projectId={projectId} />
    </DromapProductBootstrap>
  );
}

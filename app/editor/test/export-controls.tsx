"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  parseGeoJsonTextToDromapGeoJsonLayer,
  useEditorTestGeoJsonLayersStore,
} from "@/stores/editor-test-geojson-layers";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestLayersStore } from "@/stores/editor-test-layers";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import {
  bringFloatingPanelToFront,
  getInitialFloatingPanelZIndex,
} from "./floating-panel-z-index";
import { convertGeoJsonLayerToDromapFeatures } from "./geojson-layer-conversion";
import type { BuildingSelectionFeature } from "./building-selection-modal";
import {
  downloadOvertureBuildings,
  enrichBuildingNamesFromOverturePlaces,
} from "./overture-buildings-client";

const BuildingSelectionModal = dynamic(
  () =>
    import("./building-selection-modal").then(
      (module) => module.BuildingSelectionModal,
    ),
  { ssr: false },
);

type BuildingProvider = "ign" | "overture";

type BuildingSourceMetadata = {
  provider: BuildingProvider;
  source: string;
  sourceName: string;
  sourceLabel: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  release?: string;
};

type BuildingImportResponse = {
  type?: "FeatureCollection";
  features?: unknown[];
  metadata?: Partial<BuildingSourceMetadata> & {
    featureCount?: number;
    matchedCount?: number | null;
    bbox?: {
      south: number;
      west: number;
      north: number;
      east: number;
    };
  };
  error?: string;
  code?: string;
};

type ImportStatus =
  | { kind: "idle"; message: string }
  | { kind: "loading"; message: string }
  | { kind: "success"; message: string }
  | { kind: "warning"; message: string }
  | { kind: "error"; message: string };

type NormalizedWorkspaceBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type PendingBuildingsImport = {
  features: BuildingSelectionFeature[];
  featureCount: number;
  buildingsKey: string;
  source: BuildingSourceMetadata;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBuildingSelectionFeature(
  value: unknown,
): value is BuildingSelectionFeature {
  if (!isRecord(value) || value.type !== "Feature") {
    return false;
  }

  const geometry = value.geometry;

  return (
    isRecord(geometry) &&
    (geometry.type === "Polygon" || geometry.type === "MultiPolygon") &&
    Array.isArray(geometry.coordinates)
  );
}

function BuildingsIcon({ size = 16 }: { size?: number }) {
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
      <path d="M4 21V8l8-5 8 5v13" />
      <path d="M9 21v-6h6v6" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </svg>
  );
}

function CloseIcon() {
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
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function normalizeWorkspaceBounds(
  workspaceBounds: ReturnType<typeof useEditorTestWorkspaceStore.getState>["workspaceBounds"],
): NormalizedWorkspaceBounds | null {
  if (!workspaceBounds) {
    return null;
  }

  const southWest =
    workspaceBounds.southWest ??
    workspaceBounds.sw ??
    workspaceBounds._southWest ??
    (typeof workspaceBounds.south === "number" &&
    typeof workspaceBounds.west === "number"
      ? { lat: workspaceBounds.south, lng: workspaceBounds.west }
      : null);
  const northEast =
    workspaceBounds.northEast ??
    workspaceBounds.ne ??
    workspaceBounds._northEast ??
    (typeof workspaceBounds.north === "number" &&
    typeof workspaceBounds.east === "number"
      ? { lat: workspaceBounds.north, lng: workspaceBounds.east }
      : null);

  if (!southWest || !northEast) {
    return null;
  }

  const south = Math.max(-85.05112878, Math.min(southWest.lat, northEast.lat));
  const north = Math.min(85.05112878, Math.max(southWest.lat, northEast.lat));
  const west = Math.max(-180, Math.min(southWest.lng, northEast.lng));
  const east = Math.min(180, Math.max(southWest.lng, northEast.lng));

  if (
    ![south, west, north, east].every(Number.isFinite) ||
    south >= north ||
    west >= east
  ) {
    return null;
  }

  return { south, west, north, east };
}

function createWorkspaceBuildingsKey(bounds: NormalizedWorkspaceBounds) {
  return [bounds.south, bounds.west, bounds.north, bounds.east]
    .map((value) => value.toFixed(6))
    .join(":");
}

const MAX_BUILDINGS_PER_IMPORT = 15_000;

const METROPOLITAN_FRANCE_RING: Array<[number, number]> = [
  [-5.35, 48.75],
  [-4.8, 47.7],
  [-2.2, 46.7],
  [-1.85, 43.3],
  [3.15, 42.25],
  [7.55, 43.5],
  [7.65, 48.35],
  [6.15, 49.55],
  [4.2, 49.95],
  [2.5, 51.15],
  [0.0, 49.55],
  [-1.95, 49.75],
  [-5.35, 48.75],
];

const FRANCE_OVERSEAS_BOUNDS = [
  { west: 8.45, south: 41.25, east: 9.65, north: 43.15 }, // Corse
  { west: -61.85, south: 15.75, east: -60.95, north: 16.65 }, // Guadeloupe
  { west: -61.3, south: 14.3, east: -60.75, north: 14.95 }, // Martinique
  { west: -54.75, south: 2.0, east: -51.4, north: 5.95 }, // Guyane
  { west: 55.15, south: -21.45, east: 55.95, north: -20.8 }, // Réunion
  { west: 44.9, south: -13.05, east: 45.35, north: -12.55 }, // Mayotte
];

function pointInRing(
  longitude: number,
  latitude: number,
  ring: Array<[number, number]>,
) {
  let inside = false;

  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude =
      currentLatitude > latitude !== previousLatitude > latitude;
    const intersectionLongitude =
      ((previousLongitude - currentLongitude) *
        (latitude - currentLatitude)) /
        (previousLatitude - currentLatitude || Number.EPSILON) +
      currentLongitude;

    if (crossesLatitude && longitude < intersectionLongitude) {
      inside = !inside;
    }
  }

  return inside;
}

function isWorkspaceCenteredInFrance(bounds: NormalizedWorkspaceBounds) {
  const longitude = (bounds.west + bounds.east) / 2;
  const latitude = (bounds.south + bounds.north) / 2;

  if (pointInRing(longitude, latitude, METROPOLITAN_FRANCE_RING)) {
    return true;
  }

  return FRANCE_OVERSEAS_BOUNDS.some(
    (territory) =>
      longitude >= territory.west &&
      longitude <= territory.east &&
      latitude >= territory.south &&
      latitude <= territory.north,
  );
}

function getPreferredBuildingProvider(
  bounds: NormalizedWorkspaceBounds,
): BuildingProvider {
  return isWorkspaceCenteredInFrance(bounds) ? "ign" : "overture";
}

function normalizeSourceMetadata(
  metadata: BuildingImportResponse["metadata"],
  provider: BuildingProvider,
): BuildingSourceMetadata {
  if (provider === "ign") {
    return {
      provider,
      source: metadata?.source ?? "IGN BD TOPO®",
      sourceName: metadata?.sourceName ?? "ign-bdtopo-buildings.geojson",
      sourceLabel: metadata?.sourceLabel ?? "IGN BD TOPO® — Bâtiments",
      sourceUrl: metadata?.sourceUrl ?? "https://cartes.gouv.fr/",
      license: metadata?.license ?? "Licence Ouverte / Etalab 2.0",
      attribution: metadata?.attribution ?? "© IGN · BD TOPO®",
      ...(metadata?.release ? { release: metadata.release } : {}),
    };
  }

  return {
    provider,
    source: metadata?.source ?? "Overture Maps Buildings",
    sourceName:
      metadata?.sourceName ??
      `overture-buildings-${metadata?.release ?? "latest"}.geojson`,
    sourceLabel: metadata?.sourceLabel ?? "Overture Maps — Bâtiments",
    sourceUrl:
      metadata?.sourceUrl ??
      "https://docs.overturemaps.org/guides/buildings/",
    license: metadata?.license ?? "ODbL 1.0",
    attribution:
      metadata?.attribution ??
      "© OpenStreetMap contributors · © Overture Maps Foundation",
    ...(metadata?.release ? { release: metadata.release } : {}),
  };
}

function createBuildingsCatalogKey(
  source: BuildingSourceMetadata,
  bounds: NormalizedWorkspaceBounds,
) {
  const sourcePrefix =
    source.provider === "ign"
      ? "ign-bdtopo-buildings"
      : "overture-buildings";

  return `${sourcePrefix}:${createWorkspaceBuildingsKey(bounds)}`;
}

type BuildingServiceError = Error & {
  code?: string;
  status?: number;
};

function createBuildingServiceError(
  message: string,
  options: { code?: string; status?: number } = {},
): BuildingServiceError {
  const error = new Error(message) as BuildingServiceError;
  error.code = options.code;
  error.status = options.status;
  return error;
}

function getWorkspaceDimensions(bounds: NormalizedWorkspaceBounds) {
  const middleLatitude = (bounds.south + bounds.north) / 2;
  const heightKm = Math.abs(bounds.north - bounds.south) * 111.32;
  const widthKm =
    Math.abs(bounds.east - bounds.west) *
    111.32 *
    Math.max(0.05, Math.cos((middleLatitude * Math.PI) / 180));

  return {
    widthKm,
    heightKm,
    areaKm2: widthKm * heightKm,
  };
}

function formatDimension(value: number) {
  if (value < 1) {
    return `${Math.max(1, Math.round(value * 1_000))} m`;
  }

  if (value < 10) {
    return `${value.toFixed(1).replace(".", ",")} km`;
  }

  return `${Math.round(value).toLocaleString("fr-FR")} km`;
}

function getStatusClassName(status: ImportStatus) {
  if (status.kind === "error") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (status.kind === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (status.kind === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status.kind === "loading") {
    return "border-indigo-200 bg-indigo-50 text-indigo-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function ExportControls() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isBuildingsPanelOpen, setIsBuildingsPanelOpen] = useState(false);
  const [isBuildingsChoiceOpen, setIsBuildingsChoiceOpen] = useState(false);
  const [isBuildingsSelectionOpen, setIsBuildingsSelectionOpen] = useState(false);
  const [pendingBuildings, setPendingBuildings] =
    useState<PendingBuildingsImport | null>(null);
  const [panelZIndex, setPanelZIndex] = useState(
    getInitialFloatingPanelZIndex(),
  );
  const [status, setStatus] = useState<ImportStatus>({
    kind: "idle",
    message:
      "DroMap analyse les bâtiments de la zone, puis te laisse importer tout le calque ou seulement certains bâtiments.",
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const openExportPanel = useEditorTestExportStore(
    (state) => state.openExportPanel,
  );
  const openImportPanel = useEditorTestExportStore(
    (state) => state.openImportPanel,
  );
  const isExportPanelOpen = useEditorTestExportStore(
    (state) => state.isExportPanelOpen,
  );
  const closeExportPanel = useEditorTestExportStore(
    (state) => state.closeExportPanel,
  );

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const geoJsonLayers = useEditorTestGeoJsonLayersStore(
    (state) => state.geoJsonLayers,
  );
  const addGeoJsonLayer = useEditorTestGeoJsonLayersStore(
    (state) => state.addGeoJsonLayer,
  );
  const addFeaturesWithHistory = useEditorTestFeaturesStore(
    (state) => state.addFeaturesWithHistory,
  );
  const createLayer = useEditorTestLayersStore((state) => state.createLayer);
  const deleteLayer = useEditorTestLayersStore((state) => state.deleteLayer);

  const normalizedBounds = useMemo(
    () => normalizeWorkspaceBounds(workspaceBounds),
    [workspaceBounds],
  );
  const workspaceDimensions = useMemo(
    () => (normalizedBounds ? getWorkspaceDimensions(normalizedBounds) : null),
    [normalizedBounds],
  );
  const preferredProvider = useMemo(
    () =>
      normalizedBounds ? getPreferredBuildingProvider(normalizedBounds) : null,
    [normalizedBounds],
  );
  const preferredBuildingsKey = useMemo(() => {
    if (!normalizedBounds || !preferredProvider) {
      return null;
    }

    const source = normalizeSourceMetadata(undefined, preferredProvider);
    return createBuildingsCatalogKey(source, normalizedBounds);
  }, [normalizedBounds, preferredProvider]);
  const preferredAlreadyImported = Boolean(
    preferredBuildingsKey &&
      geoJsonLayers.some(
        (layer) => layer.catalogDatasetId === preferredBuildingsKey,
      ),
  );
  const pendingAlreadyImported = Boolean(
    pendingBuildings &&
      geoJsonLayers.some(
        (layer) => layer.catalogDatasetId === pendingBuildings.buildingsKey,
      ),
  );

  const canExport = workspaceBounds !== null && currentMode === "edit";
  const canImportBuildings = normalizedBounds !== null && currentMode === "edit";

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!canExport && isExportPanelOpen) {
      closeExportPanel();
    }
  }, [canExport, closeExportPanel, isExportPanelOpen]);

  useEffect(() => {
    if (canImportBuildings) {
      return;
    }

    abortControllerRef.current?.abort();
    setIsBuildingsPanelOpen(false);
    setIsBuildingsChoiceOpen(false);
    setIsBuildingsSelectionOpen(false);
    setPendingBuildings(null);
  }, [canImportBuildings]);

  useEffect(() => {
    if (!isBuildingsPanelOpen && !isBuildingsChoiceOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      abortControllerRef.current?.abort();

      if (isBuildingsChoiceOpen) {
        setIsBuildingsChoiceOpen(false);
        setPendingBuildings(null);
      } else {
        setIsBuildingsPanelOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBuildingsChoiceOpen, isBuildingsPanelOpen]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  if (!hasMounted) {
    return null;
  }

  const openBuildingsPanel = () => {
    if (!canImportBuildings) {
      return;
    }

    setPanelZIndex(bringFloatingPanelToFront());
    setStatus(
      preferredAlreadyImported
        ? {
            kind: "warning",
            message:
              "Le calque complet de cette zone est déjà présent. Tu peux néanmoins analyser la zone pour choisir seulement certains bâtiments à ajouter comme objets DroMap.",
          }
        : {
            kind: "idle",
            message:
              "DroMap télécharge les bâtiments de la zone, puis te propose de tous les garder dans un calque léger ou d’en sélectionner certains.",
          },
    );
    setIsBuildingsPanelOpen(true);
  };

  const importBuildings = async () => {
    if (!normalizedBounds || !preferredProvider) {
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fetchIgnBuildings = async () => {
      setStatus({
        kind: "loading",
        message:
          "Source détectée : IGN BD TOPO®. Analyse puis téléchargement des bâtiments français…",
      });

      const searchParams = new URLSearchParams({
        south: String(normalizedBounds.south),
        west: String(normalizedBounds.west),
        north: String(normalizedBounds.north),
        east: String(normalizedBounds.east),
      });
      const response = await fetch(`/api/dromap/buildings?${searchParams}`, {
        method: "GET",
        headers: { Accept: "application/geo+json,application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json()) as BuildingImportResponse;

      if (!response.ok) {
        throw createBuildingServiceError(
          payload.error ??
            "L’import des bâtiments IGN de cette zone n’a pas pu être effectué.",
          { code: payload.code, status: response.status },
        );
      }

      return payload;
    };

    const fetchOvertureBuildings = async () => {
      const payload = await downloadOvertureBuildings(normalizedBounds, {
        maxFeatures: MAX_BUILDINGS_PER_IMPORT,
        signal: controller.signal,
        onProgress: (message) => {
          setStatus({ kind: "loading", message });
        },
      });

      return payload as BuildingImportResponse;
    };

    try {
      let payload: BuildingImportResponse;
      let actualProvider = preferredProvider;

      if (preferredProvider === "ign") {
        try {
          payload = await fetchIgnBuildings();
        } catch (error) {
          const serviceError = error as BuildingServiceError;
          const canUseWorldwideFallback =
            serviceError.code === "NO_BUILDINGS" ||
            (typeof serviceError.status === "number" &&
              serviceError.status >= 500);

          if (!canUseWorldwideFallback) {
            throw error;
          }

          actualProvider = "overture";
          setStatus({
            kind: "loading",
            message:
              "La source IGN n’a rien renvoyé ou est indisponible. Recherche de secours dans Overture Maps…",
          });
          payload = await fetchOvertureBuildings();
        }
      } else {
        payload = await fetchOvertureBuildings();
      }

      let receivedFeatures = Array.isArray(payload.features)
        ? payload.features.filter(isBuildingSelectionFeature)
        : [];

      if (payload.type !== "FeatureCollection" || receivedFeatures.length === 0) {
        throw new Error(
          "Aucun bâtiment exploitable n’a été reçu pour cette zone.",
        );
      }

      const nameEnrichment = await enrichBuildingNamesFromOverturePlaces(
        receivedFeatures,
        normalizedBounds,
        {
          maxPlaces: Math.min(25_000, Math.max(5_000, receivedFeatures.length * 4)),
          signal: controller.signal,
          onProgress: (message) => {
            setStatus({ kind: "loading", message });
          },
        },
      );
      receivedFeatures = nameEnrichment.features;
      const featureCount = receivedFeatures.length;

      const baseSource = normalizeSourceMetadata(payload.metadata, actualProvider);
      const source =
        nameEnrichment.enrichedCount > 0 &&
        !baseSource.attribution.includes("Overture Maps Foundation")
          ? {
              ...baseSource,
              attribution: `${baseSource.attribution} · © Overture Maps Foundation`,
            }
          : baseSource;
      const buildingsKey = createBuildingsCatalogKey(
        source,
        normalizedBounds,
      );

      setPendingBuildings({
        features: receivedFeatures,
        featureCount,
        buildingsKey,
        source,
      });
      setStatus({
        kind: "success",
        message: `${featureCount.toLocaleString("fr-FR")} bâtiment${featureCount > 1 ? "s" : ""} trouvé${featureCount > 1 ? "s" : ""} avec ${source.sourceLabel}.${nameEnrichment.enrichedCount > 0 ? ` ${nameEnrichment.enrichedCount.toLocaleString("fr-FR")} nom${nameEnrichment.enrichedCount > 1 ? "s" : ""} supplémentaire${nameEnrichment.enrichedCount > 1 ? "s" : ""} obtenu${nameEnrichment.enrichedCount > 1 ? "s" : ""} grâce à Overture Maps Places.` : ""} Choisis maintenant le mode d’import.`,
      });
      setIsBuildingsPanelOpen(false);
      setIsBuildingsChoiceOpen(true);
      setPanelZIndex(bringFloatingPanelToFront());
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "L’import des bâtiments a échoué.",
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const createBuildingsGeoJsonLayer = (
    features: BuildingSelectionFeature[],
    options: {
      layerName: string;
      source: BuildingSourceMetadata;
      catalogDatasetId?: string;
    },
  ) => {
    const layer = parseGeoJsonTextToDromapGeoJsonLayer(
      JSON.stringify({ type: "FeatureCollection", features }),
      {
        sourceName: options.source.sourceName,
        layerName: options.layerName,
        existingLayerCount: geoJsonLayers.length,
        // Les angles des empreintes de bâtiments doivent rester exacts.
        precisionMode: "original",
        ...(options.catalogDatasetId
          ? { catalogDatasetId: options.catalogDatasetId }
          : {}),
        sourceLabel: options.source.sourceLabel,
        sourceUrl: options.source.sourceUrl,
        sourceLicense: options.source.license,
        sourceAttribution: options.source.attribution,
      },
    );

    return {
      ...layer,
      locked: true,
      style: {
        ...layer.style,
        strokeColor: "#475569",
        strokeWeight: 1,
        strokeOpacity: 0.9,
        fillColor: "#94a3b8",
        fillOpacity: 0.18,
      },
    };
  };

  const importAllPendingBuildings = () => {
    if (!pendingBuildings || pendingAlreadyImported) {
      return;
    }

    const layer = createBuildingsGeoJsonLayer(pendingBuildings.features, {
      layerName: `Bâtiments de la zone (${pendingBuildings.featureCount.toLocaleString("fr-FR")})`,
      source: pendingBuildings.source,
      catalogDatasetId: pendingBuildings.buildingsKey,
    });

    addGeoJsonLayer(layer);
    setStatus({
      kind: "success",
      message: `${pendingBuildings.featureCount.toLocaleString("fr-FR")} bâtiment${pendingBuildings.featureCount > 1 ? "s" : ""} ajouté${pendingBuildings.featureCount > 1 ? "s" : ""} dans un calque GeoJSON léger.`,
    });
    setIsBuildingsChoiceOpen(false);
    setPendingBuildings(null);
  };

  const importSelectedBuildings = (
    selectedBuildings: BuildingSelectionFeature[],
  ) => {
    if (!pendingBuildings || selectedBuildings.length === 0) {
      return;
    }

    const layerName = `Bâtiments sélectionnés (${selectedBuildings.length.toLocaleString("fr-FR")})`;
    const temporaryGeoJsonLayer = createBuildingsGeoJsonLayer(
      selectedBuildings,
      { layerName, source: pendingBuildings.source },
    );
    const nextLayerId = createLayer(layerName);

    try {
      const convertedFeatures = convertGeoJsonLayerToDromapFeatures(
        temporaryGeoJsonLayer,
        nextLayerId,
      ).map((feature) => {
        const { lockOverride: _lockOverride, ...properties } =
          feature.properties;

        return {
          ...feature,
          properties: {
            ...properties,
            locked: false,
            geometryLocked: true,
          },
        };
      });

      if (convertedFeatures.length === 0) {
        throw new Error(
          "Aucun bâtiment sélectionné n’a pu être converti en objet DroMap.",
        );
      }

      useEditorTestLayersStore.setState((state) => ({
        layers: state.layers.map((layer) =>
          layer.id === nextLayerId
            ? {
                ...layer,
                name: layerName,
                locked: false,
                sourceGeoJsonLayerId: temporaryGeoJsonLayer.id,
                sourceGeoJsonLayerName: temporaryGeoJsonLayer.name,
                sourceGeoJsonSourceName:
                  temporaryGeoJsonLayer.sourceName ?? null,
                updatedAt: new Date().toISOString(),
              }
            : layer,
        ),
        activeLayerId: nextLayerId,
      }));

      addFeaturesWithHistory(convertedFeatures);
      setStatus({
        kind: "success",
        message: `${convertedFeatures.length.toLocaleString("fr-FR")} bâtiment${convertedFeatures.length > 1 ? "s" : ""} ajouté${convertedFeatures.length > 1 ? "s" : ""} directement comme objet${convertedFeatures.length > 1 ? "s" : ""} DroMap.`,
      });
      setIsBuildingsSelectionOpen(false);
      setIsBuildingsChoiceOpen(false);
      setPendingBuildings(null);
    } catch (error) {
      deleteLayer(nextLayerId);
      setIsBuildingsSelectionOpen(false);
      setIsBuildingsChoiceOpen(true);
      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "La conversion des bâtiments sélectionnés a échoué.",
      });
    }
  };

  return (
    <>
      <section className="absolute left-[8.5rem] top-4 z-[1000] flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-2 py-2 text-sm shadow-lg backdrop-blur">
        <div className="hidden min-w-0 sm:block">
          <div className="text-xs font-semibold leading-none text-slate-900">
            Fichiers
          </div>
          <div className="mt-0.5 max-w-40 truncate text-[10px] leading-none text-slate-500">
            {canExport
              ? "Export et bâtiments disponibles"
              : workspaceBounds
                ? "Valide la zone pour continuer"
                : "Import disponible"}
          </div>
        </div>

        <button
          type="button"
          onClick={openExportPanel}
          disabled={!canExport}
          title={
            canExport
              ? "Exporter la carte"
              : "Sélectionne et valide d’abord une zone de travail."
          }
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Exporter
        </button>

        <button
          type="button"
          onClick={openImportPanel}
          title="Importer un projet DroMap JSON ou un calque GeoJSON"
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100"
        >
          Importer
        </button>

        <button
          type="button"
          onClick={openBuildingsPanel}
          disabled={!canImportBuildings}
          title={
            canImportBuildings
              ? "Importer les bâtiments de la zone : IGN en France, Overture Maps ailleurs"
              : "Valide d’abord la zone de travail pour importer ses bâtiments."
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          <BuildingsIcon />
          Bâtiments
        </button>
      </section>

      {isBuildingsPanelOpen ? (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]"
          style={{ zIndex: panelZIndex }}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              abortControllerRef.current?.abort();
              setIsBuildingsPanelOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dromap-buildings-title"
            data-dromap-ignore-map-wheel="true"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onMouseDown={() => {
              setPanelZIndex(bringFloatingPanelToFront());
            }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-amber-800">
                  <BuildingsIcon size={20} />
                  <h2
                    id="dromap-buildings-title"
                    className="text-base font-black text-slate-950"
                  >
                    Bâtiments de la zone
                  </h2>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Source choisie automatiquement : IGN BD TOPO® en France,
                  Overture Maps dans le reste du monde. Après l’analyse, tu
                  choisis entre un calque complet léger ou une sélection de
                  bâtiments directement éditables.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  abortControllerRef.current?.abort();
                  setIsBuildingsPanelOpen(false);
                }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                title="Fermer"
                aria-label="Fermer"
              >
                <CloseIcon />
              </button>
            </header>

            <div className="space-y-4 px-5 py-5">
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Largeur
                  </div>
                  <div className="mt-1 text-sm font-black text-slate-900">
                    {workspaceDimensions
                      ? formatDimension(workspaceDimensions.widthKm)
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Hauteur
                  </div>
                  <div className="mt-1 text-sm font-black text-slate-900">
                    {workspaceDimensions
                      ? formatDimension(workspaceDimensions.heightKm)
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Zone approximative
                  </div>
                  <div className="mt-1 text-sm font-black text-slate-900">
                    {workspaceDimensions
                      ? `${workspaceDimensions.areaKm2.toFixed(
                          workspaceDimensions.areaKm2 < 10 ? 1 : 0,
                        ).replace(".", ",")} km²`
                      : "—"}
                  </div>
                </div>
              </div>

              <div
                className={`rounded-xl border px-4 py-3 text-sm leading-5 ${getStatusClassName(status)}`}
              >
                <div className="flex items-start gap-2">
                  {status.kind === "loading" ? (
                    <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-700" />
                  ) : null}
                  <span>{status.message}</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                DroMap télécharge les bâtiments qui touchent le rectangle de
                la zone. L’import mondial lit directement les données
                GeoParquet d’Overture Maps : le premier chargement peut être
                un peu plus long. Une zone très vaste ou très dense sera
                refusée plutôt que de bloquer l’éditeur.
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  abortControllerRef.current?.abort();
                  setIsBuildingsPanelOpen(false);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
              >
                Fermer
              </button>

              <button
                type="button"
                onClick={() => void importBuildings()}
                disabled={!canImportBuildings || status.kind === "loading"}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                <BuildingsIcon />
                {status.kind === "loading"
                  ? "Analyse en cours…"
                  : "Analyser les bâtiments"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {isBuildingsChoiceOpen && pendingBuildings ? (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
          style={{ zIndex: panelZIndex }}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) {
              return;
            }

            setIsBuildingsChoiceOpen(false);
            setPendingBuildings(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dromap-buildings-choice-title"
            data-dromap-ignore-map-wheel="true"
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onMouseDown={() => setPanelZIndex(bringFloatingPanelToFront())}
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <div className="flex items-center gap-2 text-amber-800">
                  <BuildingsIcon size={20} />
                  <h2
                    id="dromap-buildings-choice-title"
                    className="text-base font-black text-slate-950"
                  >
                    Quels bâtiments veux-tu ajouter ?
                  </h2>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {pendingBuildings.featureCount.toLocaleString("fr-FR")} bâtiment
                  {pendingBuildings.featureCount > 1 ? "s" : ""} trouvé
                  {pendingBuildings.featureCount > 1 ? "s" : ""} dans la zone de
                  travail.
                </p>
                <p className="mt-1 text-[11px] font-semibold text-indigo-700">
                  Source : {pendingBuildings.source.sourceLabel}
                  {pendingBuildings.source.release
                    ? ` · version ${pendingBuildings.source.release}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsBuildingsChoiceOpen(false);
                  setPendingBuildings(null);
                }}
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
                onClick={importAllPendingBuildings}
                disabled={pendingAlreadyImported}
                className="group rounded-2xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:opacity-70"
              >
                <div className="text-sm font-black text-slate-950">
                  Tous les bâtiments
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-600">
                  Ajoute l’ensemble dans un seul calque GeoJSON léger. C’est le
                  choix le plus fluide pour afficher et styliser toute la zone.
                </div>
                <div className="mt-4 inline-flex rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white group-disabled:bg-slate-400">
                  {pendingAlreadyImported
                    ? "Calque complet déjà présent"
                    : "Ajouter le calque complet"}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsBuildingsChoiceOpen(false);
                  setIsBuildingsSelectionOpen(true);
                }}
                className="group rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 text-left transition hover:border-amber-500 hover:bg-amber-100"
              >
                <div className="text-sm font-black text-slate-950">
                  Sélectionner certains bâtiments
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-700">
                  Ouvre la zone en plein écran. Clique uniquement sur les
                  bâtiments utiles : ils seront ajoutés directement comme objets
                  DroMap, sans importer les milliers d’empreintes inutiles.
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

      {isBuildingsSelectionOpen && pendingBuildings && normalizedBounds ? (
        <BuildingSelectionModal
          features={pendingBuildings.features}
          bounds={normalizedBounds}
          onCancel={() => {
            setIsBuildingsSelectionOpen(false);
            setIsBuildingsChoiceOpen(true);
            setPanelZIndex(bringFloatingPanelToFront());
          }}
          onConfirm={importSelectedBuildings}
        />
      ) : null}
    </>
  );
}

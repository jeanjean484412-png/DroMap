"use client";

import {
  parseGeoJsonTextToDromapGeoJsonLayer,
  type DromapGeoJsonLayer,
  useEditorGeoJsonLayersStore,
} from "@/stores/editor-geojson-layers";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import type { DromapRoadImportCategory } from "@/lib/dromap/road-import";

export const DROMAP_ROAD_IMPORT_DATASET_ID = "dromap-road-import";
export const DROMAP_ROAD_IMPORT_SOURCE_NAME = "openstreetmap-roads.geojson";

export type DromapRoadSelectionFeature = GeoJSON.Feature<
  GeoJSON.LineString | GeoJSON.MultiLineString,
  GeoJSON.GeoJsonProperties
>;

export type DromapRoadImportBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type DromapRoadSourceMetadata = {
  source: string;
  sourceName: string;
  sourceLabel: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  extractionService?: string;
};

export type DromapRoadAnalysis = {
  features: DromapRoadSelectionFeature[];
  source: DromapRoadSourceMetadata;
  categories: DromapRoadImportCategory[];
};

type RoadImportResponse = {
  type?: "FeatureCollection";
  features?: unknown[];
  metadata?: Partial<DromapRoadSourceMetadata> & {
    categories?: DromapRoadImportCategory[];
  };
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRoadFeature(value: unknown): value is DromapRoadSelectionFeature {
  if (!isRecord(value) || value.type !== "Feature") return false;
  const geometry = value.geometry;
  return (
    isRecord(geometry) &&
    (geometry.type === "LineString" || geometry.type === "MultiLineString") &&
    Array.isArray(geometry.coordinates)
  );
}

export function getDromapRoadFeatureSelectionId(
  feature: DromapRoadSelectionFeature,
  fallbackIndex: number,
) {
  const properties = feature.properties;
  if (properties && typeof properties === "object") {
    const preferred = properties.__dromapRoadSelectionId;
    if (typeof preferred === "string" || typeof preferred === "number") {
      return String(preferred);
    }
  }
  if (typeof feature.id === "string" || typeof feature.id === "number") {
    return String(feature.id);
  }
  if (properties && typeof properties === "object") {
    for (const key of ["osm_id", "id", "ref", "name", "label"]) {
      const candidate = properties[key];
      if (typeof candidate === "string" || typeof candidate === "number") {
        return String(candidate);
      }
    }
  }
  return `route-${fallbackIndex + 1}`;
}

function getRoadStableKey(feature: DromapRoadSelectionFeature, fallbackIndex: number) {
  const properties = feature.properties;
  if (properties && typeof properties === "object") {
    const groupKey = properties.__dromapRoadGroupKey;
    if (typeof groupKey === "string" && groupKey.trim()) {
      return `group:${groupKey.trim()}`;
    }
    const selectionId = properties.__dromapRoadSelectionId;
    if (typeof selectionId === "string" || typeof selectionId === "number") {
      return `selection:${String(selectionId)}`;
    }
  }
  return `selection:${getDromapRoadFeatureSelectionId(feature, fallbackIndex)}`;
}

export function isDromapManagedRoadLayer(layer: DromapGeoJsonLayer) {
  return (
    layer.catalogDatasetId === DROMAP_ROAD_IMPORT_DATASET_ID ||
    layer.sourceName === DROMAP_ROAD_IMPORT_SOURCE_NAME ||
    (layer.sourceLabel === "OpenStreetMap — Routes" &&
      /route/i.test(layer.name))
  );
}

export function getDromapManagedRoadLayers(
  layers = useEditorGeoJsonLayersStore.getState().geoJsonLayers,
) {
  return layers
    .filter(isDromapManagedRoadLayer)
    .sort((a, b) => a.order - b.order);
}

export function getInitialRoadSelectionIds(
  analyzedFeatures: DromapRoadSelectionFeature[],
  layers = useEditorGeoJsonLayersStore.getState().geoJsonLayers,
) {
  const managedLayers = getDromapManagedRoadLayers(layers);
  if (!managedLayers.length) return [] as string[];

  const existingKeys = new Set<string>();
  managedLayers.forEach((layer) => {
    layer.data.features.forEach((feature, index) => {
      const typed = feature as DromapRoadSelectionFeature;
      if (typed.properties?.__dromapRoadIsConnector === true) return;
      existingKeys.add(getRoadStableKey(typed, index));
    });
  });

  return analyzedFeatures.flatMap((feature, index) => {
    if (feature.properties?.__dromapRoadIsConnector === true) return [];
    return existingKeys.has(getRoadStableKey(feature, index))
      ? [getDromapRoadFeatureSelectionId(feature, index)]
      : [];
  });
}

function normalizeSourceMetadata(
  metadata: RoadImportResponse["metadata"],
): DromapRoadSourceMetadata {
  return {
    source: metadata?.source ?? "OpenStreetMap",
    sourceName: metadata?.sourceName ?? DROMAP_ROAD_IMPORT_SOURCE_NAME,
    sourceLabel: metadata?.sourceLabel ?? "OpenStreetMap — Routes",
    sourceUrl: metadata?.sourceUrl ?? "https://www.openstreetmap.org/copyright",
    license: metadata?.license ?? "ODbL 1.0",
    attribution: metadata?.attribution ?? "© OpenStreetMap contributors",
    ...(metadata?.extractionService
      ? { extractionService: metadata.extractionService }
      : {}),
  };
}

export async function analyzeDromapRoads(input: {
  bounds: DromapRoadImportBounds;
  categories: DromapRoadImportCategory[];
  signal?: AbortSignal;
}): Promise<DromapRoadAnalysis> {
  const searchParams = new URLSearchParams({
    south: String(input.bounds.south),
    west: String(input.bounds.west),
    north: String(input.bounds.north),
    east: String(input.bounds.east),
    categories: input.categories.join(","),
  });
  const response = await fetch(`/api/dromap/routes?${searchParams}`, {
    method: "GET",
    headers: { Accept: "application/geo+json,application/json" },
    cache: "no-store",
    signal: input.signal,
  });
  const payload = (await response.json()) as RoadImportResponse;
  if (!response.ok) {
    throw new Error(payload.error ?? "L’analyse des routes a échoué.");
  }
  const features = Array.isArray(payload.features)
    ? payload.features.filter(isRoadFeature)
    : [];
  if (payload.type !== "FeatureCollection" || features.length === 0) {
    throw new Error("Aucune route exploitable n’a été reçue pour cette zone.");
  }
  return {
    features,
    source: normalizeSourceMetadata(payload.metadata),
    categories: [...input.categories],
  };
}

function isAutomaticRoadLayerName(name: string) {
  return /^Routes (de la zone|sélectionnées)( \([\d\s.,]+\))?$/i.test(name.trim());
}

function createRoadGeoJsonLayer(input: {
  features: DromapRoadSelectionFeature[];
  source: DromapRoadSourceMetadata;
  categories: DromapRoadImportCategory[];
  layerName: string;
  existingLayerCount: number;
}) {
  const layer = parseGeoJsonTextToDromapGeoJsonLayer(
    JSON.stringify({ type: "FeatureCollection", features: input.features }),
    {
      sourceName: input.source.sourceName,
      layerName: input.layerName,
      existingLayerCount: input.existingLayerCount,
      precisionMode: "original",
      sourceLabel: input.source.sourceLabel,
      sourceUrl: input.source.sourceUrl,
      sourceLicense: input.source.license,
      sourceAttribution: input.source.attribution,
    },
  );

  return {
    ...layer,
    catalogDatasetId: DROMAP_ROAD_IMPORT_DATASET_ID,
    sourceVersion: `dromap-routes-v2:${input.categories.join(",")}`,
    locked: true,
    style: {
      ...layer.style,
      strokeColor: "#334155",
      strokeWeight: 2,
      strokeOpacity: 1,
      fillOpacity: 0,
      dashStyle: "solid" as const,
    },
  };
}

export function reconcileDromapRoadImport(input: {
  features: DromapRoadSelectionFeature[];
  source: DromapRoadSourceMetadata;
  categories: DromapRoadImportCategory[];
  mode: "all" | "selection";
  layerName?: string | null;
}) {
  const store = useEditorGeoJsonLayersStore.getState();
  const currentLayers = store.geoJsonLayers;
  const managedLayers = getDromapManagedRoadLayers(currentLayers);
  const managedIds = new Set(managedLayers.map((layer) => layer.id));
  const primary = managedLayers[0] ?? null;

  if (input.features.length === 0) {
    if (!managedLayers.length) {
      return { layerId: null, layerName: null, selectedCount: 0, removed: false };
    }
    useEditorFeaturesStore
      .getState()
      .commitFeaturesHistory({ includeParticipants: true });
    store.setGeoJsonLayers(currentLayers.filter((layer) => !managedIds.has(layer.id)));
    return { layerId: null, layerName: null, selectedCount: 0, removed: true };
  }

  const autoName =
    input.mode === "all"
      ? `Routes de la zone (${input.features.length.toLocaleString("fr-FR")})`
      : `Routes sélectionnées (${input.features.length.toLocaleString("fr-FR")})`;
  const requestedName = input.layerName?.trim() || null;
  const targetName = requestedName
    ?? (primary && !isAutomaticRoadLayerName(primary.name) ? primary.name : autoName);
  let nextLayer: DromapGeoJsonLayer = createRoadGeoJsonLayer({
    features: input.features,
    source: input.source,
    categories: input.categories,
    layerName: targetName,
    existingLayerCount: Math.max(0, currentLayers.length - managedLayers.length),
  });

  if (primary) {
    nextLayer = {
      ...nextLayer,
      id: primary.id,
      name: targetName,
      visible: primary.visible,
      opacity: primary.opacity,
      locked: primary.locked,
      order: primary.order,
      createdAt: primary.createdAt,
      style: primary.style,
    };
  }

  const withoutManaged = currentLayers.filter((layer) => !managedIds.has(layer.id));
  const orderedCurrent = [...currentLayers].sort((a, b) => a.order - b.order);
  const primaryIndex = primary
    ? Math.max(0, orderedCurrent.findIndex((layer) => layer.id === primary.id))
    : withoutManaged.length;
  const nextLayers = [...withoutManaged];
  nextLayers.splice(Math.min(primaryIndex, nextLayers.length), 0, nextLayer);

  useEditorFeaturesStore
    .getState()
    .commitFeaturesHistory({ includeParticipants: true });
  store.setGeoJsonLayers(nextLayers);

  return {
    layerId: nextLayer.id,
    layerName: nextLayer.name,
    selectedCount: input.features.length,
    removed: false,
  };
}

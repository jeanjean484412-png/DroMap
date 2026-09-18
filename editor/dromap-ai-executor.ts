"use client";

import { createCurvedLineCoordinates } from "@/lib/dromap/curved-line";

import type {
  DroMapFeature,
  DroMapFeatureStyle,
  DroMapFeatureType,
  DroMapMarkerSymbol,
} from "@/lib/dromap/feature";
import {
  getCurrentEditorMapZoom,
  getFeatureVisualScale,
} from "@/lib/dromap/feature-visual-scale";
import {
  normalizeWorkspaceBounds,
  type WorkspaceBounds,
} from "@/lib/dromap/workspace-bounds";
import { getDromapRoadImportMaxAreaKm2, type DromapRoadImportCategory } from "@/lib/dromap/road-import";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import {
  createCustomMarkerId,
  useEditorCustomMarkersStore,
} from "@/stores/editor-custom-markers";
import { useEditorExportStore } from "@/stores/editor-export";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import {
  parseGeoJsonTextToDromapGeoJsonLayer,
  useEditorGeoJsonLayersStore,
  type DromapGeoJsonFeature,
  type DromapGeoJsonLayer,
} from "@/stores/editor-geojson-layers";
import {
  isFeatureEffectivelyLocked,
  useEditorLayersStore,
} from "@/stores/editor-layers";
import { useEditorMapLabelsStore } from "@/stores/editor-map-labels";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import { useEditorToolStore } from "@/stores/editor-tool";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";

import { DROMAP_GEOJSON_CATALOG } from "./geojson-data-catalog";
import { convertGeoJsonLayerToDromapFeatures } from "./geojson-layer-conversion";
import {
  canConvertDromapLayerToGeoJsonLayer,
  convertDromapLayerToGeoJsonLayer,
} from "./dromap-layer-to-geojson-conversion";
import { duplicateDroMapFeature } from "./feature-duplication";
import { getLegendDedupeKey, getLegendFeatureLabel } from "./legend-entry";
import { getGeoJsonLayerLegendId } from "./geojson-layer-legend";
import {
  DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE,
  MAX_EXPORT_LEGEND_SYMBOL_SIZE,
  getExportLegendGlobalSymbolScale,
} from "./export-legend-layout";
import {
  createZoneFillFeatureAtLngLat,
  createZoneFillFeatureFromGeoJsonLayersAtLngLat,
  createWorkspaceWaterFillFeatureAtLngLat,
} from "./zone-fill";
import {
  fitDroMapAiMapBounds,
  flyDroMapAiMapTo,
  getDroMapAiMapZoom,
} from "./dromap-ai-map-bridge";
import {
  analyzeDromapRoads,
  getDromapManagedRoadLayers,
  getDromapRoadFeatureSelectionId,
  getInitialRoadSelectionIds,
  reconcileDromapRoadImport,
  type DromapRoadSelectionFeature,
  type DromapRoadSourceMetadata,
} from "./road-import-runtime";

import type {
  DroMapAiBounds,
  DroMapAiChoroplethClass,
  DroMapAiCommand,
  DroMapAiCoordinate,
  DroMapAiFeatureSelector,
  DroMapAiPlan,
  DroMapAiSeriesItem,
  DroMapAiStylePatch,
  DroMapAiWorkspaceMode,
} from "./dromap-ai-types";

type StoreDataSnapshot = Record<string, unknown>;

type DroMapAiSnapshot = {
  basemap: StoreDataSnapshot;
  customMarkers: StoreDataSnapshot;
  export: StoreDataSnapshot;
  features: StoreDataSnapshot;
  geoJsonLayers: StoreDataSnapshot;
  layers: StoreDataSnapshot;
  mapLabels: StoreDataSnapshot;
  mode: StoreDataSnapshot;
  selection: StoreDataSnapshot;
  tool: StoreDataSnapshot;
  workspace: StoreDataSnapshot;
};

type PlaceSearchResult = {
  id: string;
  displayName: string;
  lat: number;
  lng: number;
  bounds: DroMapAiBounds | null;
};

type PlaceSearchResponse = {
  results?: PlaceSearchResult[];
  error?: string;
};

export type DroMapAiExecutionResult = {
  appliedCommandCount: number;
  createdFeatureIds: string[];
  createdGeoJsonLayerIds: string[];
  warnings: string[];
};

let lastSuccessfulSnapshot: DroMapAiSnapshot | null = null;
let activePreviewSnapshot: DroMapAiSnapshot | null = null;
let activePreviewPreviousUndoSnapshot: DroMapAiSnapshot | null = null;
let activePreviewResult: DroMapAiExecutionResult | null = null;

function cloneDataState(state: object): StoreDataSnapshot {
  return structuredClone(
    Object.fromEntries(
      Object.entries(state).filter(([, value]) => typeof value !== "function"),
    ),
  );
}

function captureSnapshot(): DroMapAiSnapshot {
  return {
    basemap: cloneDataState(useEditorBasemapStore.getState()),
    customMarkers: cloneDataState(useEditorCustomMarkersStore.getState()),
    export: cloneDataState(useEditorExportStore.getState()),
    features: cloneDataState(useEditorFeaturesStore.getState()),
    geoJsonLayers: cloneDataState(useEditorGeoJsonLayersStore.getState()),
    layers: cloneDataState(useEditorLayersStore.getState()),
    mapLabels: cloneDataState(useEditorMapLabelsStore.getState()),
    mode: cloneDataState(useEditorModeStore.getState()),
    selection: cloneDataState(useEditorSelectionStore.getState()),
    tool: cloneDataState(useEditorToolStore.getState()),
    workspace: cloneDataState(useEditorWorkspaceStore.getState()),
  };
}

function restoreStoreData(setState: unknown, snapshot: StoreDataSnapshot) {
  (setState as (partial: StoreDataSnapshot) => void)(snapshot);
}

function restoreSnapshot(snapshot: DroMapAiSnapshot) {
  restoreStoreData(useEditorLayersStore.setState, snapshot.layers);
  restoreStoreData(useEditorFeaturesStore.setState, snapshot.features);
  restoreStoreData(
    useEditorGeoJsonLayersStore.setState,
    snapshot.geoJsonLayers,
  );
  restoreStoreData(
    useEditorCustomMarkersStore.setState,
    snapshot.customMarkers,
  );
  restoreStoreData(useEditorWorkspaceStore.setState, snapshot.workspace);
  restoreStoreData(useEditorModeStore.setState, snapshot.mode);
  restoreStoreData(useEditorBasemapStore.setState, snapshot.basemap);
  restoreStoreData(useEditorExportStore.setState, snapshot.export);
  restoreStoreData(useEditorMapLabelsStore.setState, snapshot.mapLabels);
  restoreStoreData(useEditorSelectionStore.setState, snapshot.selection);
  restoreStoreData(useEditorToolStore.setState, snapshot.tool);
}

export function canUndoLastDroMapAiPlan() {
  return activePreviewSnapshot === null && lastSuccessfulSnapshot !== null;
}

export function undoLastDroMapAiPlan() {
  if (activePreviewSnapshot || !lastSuccessfulSnapshot) return false;
  const snapshot = lastSuccessfulSnapshot;
  lastSuccessfulSnapshot = null;
  restoreSnapshot(snapshot);
  return true;
}

export function hasActiveDroMapAiPreview() {
  return activePreviewSnapshot !== null;
}

export function cancelDroMapAiPreview() {
  if (!activePreviewSnapshot) return false;
  const snapshot = activePreviewSnapshot;
  const previousUndoSnapshot = activePreviewPreviousUndoSnapshot;
  activePreviewSnapshot = null;
  activePreviewPreviousUndoSnapshot = null;
  activePreviewResult = null;
  restoreSnapshot(snapshot);
  lastSuccessfulSnapshot = previousUndoSnapshot;
  return true;
}

export function commitDroMapAiPreview() {
  if (!activePreviewSnapshot || !activePreviewResult) return null;
  const snapshot = activePreviewSnapshot;
  const result = activePreviewResult;
  activePreviewSnapshot = null;
  activePreviewPreviousUndoSnapshot = null;
  activePreviewResult = null;
  lastSuccessfulSnapshot = snapshot;
  return result;
}

function createId(prefix: string) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function cleanString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stylePatchToFeatureStyle(patch: DroMapAiStylePatch) {
  const next: DroMapFeatureStyle = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  if (typeof next.opacity === "number")
    next.opacity = clamp(next.opacity, 0, 1);
  if (typeof next.fillOpacity === "number")
    next.fillOpacity = clamp(next.fillOpacity, 0, 1);
  if (typeof next.textBackgroundOpacity === "number")
    next.textBackgroundOpacity = clamp(next.textBackgroundOpacity, 0, 1);
  if (typeof next.weight === "number")
    next.weight = clamp(next.weight, 0.1, 200);
  if (typeof next.markerSize === "number")
    next.markerSize = clamp(next.markerSize, 1, 4096);
  if (typeof next.fontSize === "number")
    next.fontSize = clamp(next.fontSize, 6, 1024);
  if (typeof next.freehandSmoothing === "number")
    next.freehandSmoothing = clamp(next.freehandSmoothing, 0, 100);
  if ((next as Record<string, unknown>).zoneHatchingStyle === "dots") {
    next.zoneHatchingStyle = "none";
    next.zoneDotsEnabled = true;
  }
  return next;
}

function defaultStyleForType(type: DroMapFeatureType): DroMapFeatureStyle {
  if (type === "marker") {
    return {
      color: "#111827",
      weight: 5,
      opacity: 1,
      markerSize: 28,
      markerFilled: true,
      markerRotation: 0,
    };
  }
  if (type === "line") {
    return {
      color: "#2563eb",
      weight: 4,
      opacity: 1,
      dashStyle: "solid",
      arrowStart: false,
      arrowEnd: false,
      freehandSmoothing: 45,
    };
  }
  if (type === "zone") {
    return {
      color: "#2563eb",
      weight: 2,
      opacity: 1,
      fillColor: "#60a5fa",
      fillOpacity: 0.3,
      dashStyle: "solid",
      zoneStrokeEnabled: true,
      zoneFillEnabled: true,
      zoneHatchingStyle: "none",
      zoneDotsEnabled: false,
      freehandSmoothing: 45,
    };
  }
  return {
    color: "#111827",
    opacity: 1,
    fontSize: 24,
    textRotation: 0,
    textBackgroundEnabled: false,
    textBackgroundColor: "#ffffff",
    textBackgroundOpacity: 0.85,
    textBorderEnabled: false,
    textBorderColor: "#111827",
    textBorderWidth: 2,
  };
}

function resolveLayerId(layerRef: string | null, aliases: Map<string, string>) {
  const state = useEditorLayersStore.getState();
  const ref = cleanString(layerRef);
  if (!ref) return state.activeLayerId;
  const alias = aliases.get(ref);
  if (alias) return alias;
  const lower = ref.toLocaleLowerCase("fr");
  const layer = state.layers.find(
    (candidate) =>
      candidate.id === ref ||
      candidate.name.trim().toLocaleLowerCase("fr") === lower,
  );
  if (!layer) throw new Error(`Calque introuvable : ${ref}.`);
  return layer.id;
}

function resolveGeoJsonLayerId(
  layerRef: string | null,
  aliases: Map<string, string>,
) {
  const state = useEditorGeoJsonLayersStore.getState();
  const ref = cleanString(layerRef);
  if (!ref) throw new Error("Référence de calque GeoJSON manquante.");
  const alias = aliases.get(ref);
  if (alias) return alias;
  const lower = ref.toLocaleLowerCase("fr");
  const layer = state.geoJsonLayers.find(
    (candidate) =>
      candidate.id === ref ||
      candidate.name.trim().toLocaleLowerCase("fr") === lower,
  );
  if (!layer) throw new Error(`Calque GeoJSON introuvable : ${ref}.`);
  return layer.id;
}

function hasSelectorConstraint(selector: DroMapAiFeatureSelector) {
  return (
    selector.all ||
    selector.featureIds.length > 0 ||
    Boolean(cleanString(selector.labelContains)) ||
    Boolean(cleanString(selector.legendLabelContains)) ||
    Boolean(cleanString(selector.layerName)) ||
    selector.featureType !== null ||
    selector.sourceType !== null
  );
}

function selectFeatures(selector: DroMapAiFeatureSelector) {
  if (!hasSelectorConstraint(selector)) {
    throw new Error("Sélecteur d'objets vide : action refusée par sécurité.");
  }
  const features = useEditorFeaturesStore.getState().features;
  if (selector.all) return features;
  const layers = useEditorLayersStore.getState().layers;
  const ids = new Set(selector.featureIds);
  const labelNeedle = normalizeKey(selector.labelContains);
  const legendNeedle = normalizeKey(selector.legendLabelContains);
  const layerNeedle = normalizeKey(selector.layerName);
  const layerIds = layerNeedle
    ? new Set(
        layers
          .filter((layer) => normalizeKey(layer.name) === layerNeedle)
          .map((layer) => layer.id),
      )
    : null;
  return features.filter((feature) => {
    if (ids.size && !ids.has(feature.id)) return false;
    if (
      labelNeedle &&
      !normalizeKey(feature.properties.label).includes(labelNeedle)
    )
      return false;
    if (
      legendNeedle &&
      !normalizeKey(feature.properties.legendLabel).includes(legendNeedle)
    )
      return false;
    if (layerIds && !layerIds.has(feature.properties.layerId ?? ""))
      return false;
    if (
      selector.featureType &&
      feature.properties.type !== selector.featureType
    )
      return false;
    if (
      selector.sourceType &&
      feature.properties.source?.type !== selector.sourceType
    )
      return false;
    return true;
  });
}

async function searchPlace(
  query: string,
  cache: Map<string, PlaceSearchResult>,
) {
  const normalized = query.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Nom de lieu vide.");
  const key = normalized.toLocaleLowerCase("fr");
  const cached = cache.get(key);
  if (cached) return cached;
  const response = await fetch(
    `/api/dromap/place-search?q=${encodeURIComponent(normalized)}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  const payload = (await response.json()) as PlaceSearchResponse;
  if (!response.ok)
    throw new Error(payload.error || `Lieu introuvable : ${normalized}.`);
  const result = payload.results?.[0];
  if (!result)
    throw new Error(`Aucun résultat géographique pour « ${normalized} ».`);
  cache.set(key, result);
  return result;
}

async function resolvePoint(
  command: DroMapAiCommand,
  cache: Map<string, PlaceSearchResult>,
) {
  if (command.coordinate) return command.coordinate;
  const place = cleanString(command.place) ?? cleanString(command.places[0]);
  if (!place)
    throw new Error(`${command.type} exige un lieu ou une coordonnée.`);
  const result = await searchPlace(place, cache);
  return { lng: result.lng, lat: result.lat };
}

async function resolveSeriesPoint(
  item: DroMapAiSeriesItem,
  cache: Map<string, PlaceSearchResult>,
) {
  if (item.coordinate) return item.coordinate;
  if (!item.place) throw new Error(`Lieu manquant pour ${item.label}.`);
  const result = await searchPlace(item.place, cache);
  return { lng: result.lng, lat: result.lat };
}

function isCoordinateInsideWorkspace(
  coordinate: DroMapAiCoordinate,
  workspaceBounds: WorkspaceBounds,
) {
  const south = Math.min(
    workspaceBounds.southWest.lat,
    workspaceBounds.northEast.lat,
  );
  const north = Math.max(
    workspaceBounds.southWest.lat,
    workspaceBounds.northEast.lat,
  );
  const west = Math.min(
    workspaceBounds.southWest.lng,
    workspaceBounds.northEast.lng,
  );
  const east = Math.max(
    workspaceBounds.southWest.lng,
    workspaceBounds.northEast.lng,
  );

  return (
    coordinate.lat >= south &&
    coordinate.lat <= north &&
    coordinate.lng >= west &&
    coordinate.lng <= east
  );
}

async function assertAiMarkersInsideManualWorkspace(
  plan: DroMapAiPlan,
  workspaceBounds: WorkspaceBounds,
  cache: Map<string, PlaceSearchResult>,
) {
  const conflicts: string[] = [];

  for (const command of plan.commands) {
    if (command.type === "create_marker") {
      const coordinate = await resolvePoint(command, cache);
      if (!isCoordinateInsideWorkspace(coordinate, workspaceBounds)) {
        conflicts.push(
          cleanString(command.label) ??
            cleanString(command.place) ??
            "Marqueur sans nom",
        );
      }
      continue;
    }

    if (command.type === "create_proportional_markers") {
      for (const item of command.seriesItems) {
        const coordinate = await resolveSeriesPoint(item, cache);
        if (!isCoordinateInsideWorkspace(coordinate, workspaceBounds)) {
          conflicts.push(item.label);
        }
      }
    }
  }

  if (!conflicts.length) {
    return;
  }

  const uniqueConflicts = [...new Set(conflicts)];
  const visibleNames = uniqueConflicts.slice(0, 12);
  const remaining = uniqueConflicts.length - visibleNames.length;
  const suffix = remaining > 0 ? ` et ${remaining} autre(s)` : "";

  throw new Error(
    `Alerte zone de travail : l’IA veut placer ${uniqueConflicts.length} marqueur(s) hors de la zone validée (${visibleNames.join(", ")}${suffix}). Aucun élément n’a été ajouté. Agrandis la zone manuelle ou relance l’assistant en mode « Sélection automatique par l’IA ».`,
  );
}

async function resolvePathCoordinates(
  command: DroMapAiCommand,
  cache: Map<string, PlaceSearchResult>,
) {
  if (command.coordinates.length >= 2) return command.coordinates;
  const points: DroMapAiCoordinate[] = [];
  for (const place of command.places) {
    const result = await searchPlace(place, cache);
    points.push({ lng: result.lng, lat: result.lat });
  }
  return points;
}

function makeFeatureBase(
  command: DroMapAiCommand,
  type: DroMapFeatureType,
  layerId: string,
) {
  const fallback =
    type === "marker"
      ? "Marqueur"
      : type === "line"
        ? "Ligne"
        : type === "zone"
          ? "Zone"
          : "Texte";
  return {
    id: createId(type),
    label: cleanString(command.label) ?? cleanString(command.place) ?? fallback,
    legendLabel: cleanString(command.legendLabel),
    layerId,
    style: {
      ...defaultStyleForType(type),
      ...stylePatchToFeatureStyle(command.style),
    },
  };
}

function resolveMarkerSymbol(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
): DroMapMarkerSymbol {
  const customRef = cleanString(command.customMarkerRef);
  if (customRef) {
    const customState = useEditorCustomMarkersStore.getState();
    const alias = aliases.get(customRef);
    const marker = customState.customMarkers.find(
      (candidate) =>
        candidate.id === alias ||
        candidate.id === customRef ||
        normalizeKey(candidate.name) === normalizeKey(customRef),
    );
    if (!marker)
      throw new Error(`Marqueur personnalisé introuvable : ${customRef}.`);
    return {
      type: marker.kind === "drawn" ? "drawn" : "custom-image",
      id: marker.id,
    };
  }
  return { type: "builtin", id: cleanString(command.symbolId) ?? "circle" };
}

function createPointFeature(
  command: DroMapAiCommand,
  point: DroMapAiCoordinate,
  layerId: string,
  aliases: Map<string, string>,
): DroMapFeature {
  const base = makeFeatureBase(
    command,
    command.type === "create_text" ? "text" : "marker",
    layerId,
  );
  const isText = command.type === "create_text";
  return {
    type: "Feature",
    id: base.id,
    geometry: { type: "Point", coordinates: [point.lng, point.lat] },
    properties: isText
      ? {
          type: "text",
          style: {
            ...base.style,
            textReferenceZoom: getCurrentEditorMapZoom() ?? undefined,
          },
          label: base.label,
          ...(base.legendLabel ? { legendLabel: base.legendLabel } : {}),
          layerId,
          locked: command.locked ?? false,
          geometryLocked: command.geometryLocked ?? false,
          meta: { version: 1 },
        }
      : {
          type: "marker",
          style: base.style,
          label: base.label,
          ...(base.legendLabel ? { legendLabel: base.legendLabel } : {}),
          symbol: resolveMarkerSymbol(command, aliases),
          ...(command.mapLabelVisibility
            ? { mapLabelVisibility: command.mapLabelVisibility }
            : {}),
          layerId,
          locked: command.locked ?? false,
          geometryLocked: command.geometryLocked ?? false,
          meta: { version: 1 },
        },
  };
}

function createLineFeature(
  command: DroMapAiCommand,
  coordinates: DroMapAiCoordinate[],
  layerId: string,
): DroMapFeature {
  if (coordinates.length < 2)
    throw new Error("Une ligne exige au moins deux points.");
  const base = makeFeatureBase(command, "line", layerId);
  if (command.lineVariant === "curved" && coordinates.length > 3) {
    throw new Error("Un trait courbe attend deux extrémités et, éventuellement, un point de courbure entre les deux.");
  }
  const points: [number, number][] = coordinates.map(({ lng, lat }) => [lng, lat]);
  return {
    type: "Feature",
    id: base.id,
    geometry: {
      type: "LineString",
      coordinates: command.lineVariant === "curved"
        ? createCurvedLineCoordinates(points[0], points[points.length - 1], points.length === 3 ? points[1] : undefined)
        : points,
    },
    properties: {
      type: "line",
      style: base.style,
      label: base.label,
      ...(base.legendLabel ? { legendLabel: base.legendLabel } : {}),
      lineVariant: command.lineVariant ?? "straight",
      layerId,
      locked: command.locked ?? false,
      geometryLocked: command.geometryLocked ?? false,
      meta: { version: 1 },
    },
  };
}

function closeRing(points: DroMapAiCoordinate[]) {
  if (points.length === 0) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return first.lng === last.lng && first.lat === last.lat
    ? points
    : [...points, first];
}

function shapeRing(command: DroMapAiCommand, center: DroMapAiCoordinate) {
  if (command.bounds) {
    const { south, west, north, east } = command.bounds;
    if (command.shapeKind === "rectangle") {
      return closeRing([
        { lng: west, lat: south },
        { lng: east, lat: south },
        { lng: east, lat: north },
        { lng: west, lat: north },
      ]);
    }
    const points: DroMapAiCoordinate[] = [];
    const count = 64;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      points.push({
        lng: (west + east) / 2 + ((east - west) / 2) * Math.cos(angle),
        lat: (south + north) / 2 + ((north - south) / 2) * Math.sin(angle),
      });
    }
    return closeRing(points);
  }
  const width = Math.max(0.08, (command.style.zoneShapeWidth ?? 180) / 1000);
  const height = Math.max(0.05, (command.style.zoneShapeHeight ?? 110) / 1000);
  const bounds = {
    west: center.lng - width,
    east: center.lng + width,
    south: center.lat - height,
    north: center.lat + height,
  };
  return shapeRing({ ...command, bounds }, center);
}

function createZoneFeature(
  command: DroMapAiCommand,
  coordinates: DroMapAiCoordinate[],
  layerId: string,
): DroMapFeature {
  if (coordinates.length < 3)
    throw new Error("Une zone exige au moins trois points.");
  const base = makeFeatureBase(command, "zone", layerId);
  return {
    type: "Feature",
    id: base.id,
    geometry: {
      type: "Polygon",
      coordinates: [closeRing(coordinates).map(({ lng, lat }) => [lng, lat])],
    },
    properties: {
      type: "zone",
      style: base.style,
      label: base.label,
      ...(base.legendLabel ? { legendLabel: base.legendLabel } : {}),
      zoneVariant: command.zoneVariant ?? "polygon",
      ...(command.shapeKind ? { zoneShapeKind: command.shapeKind } : {}),
      layerId,
      locked: command.locked ?? false,
      geometryLocked: command.geometryLocked ?? false,
      meta: { version: 1 },
    },
  };
}

async function createBoundaryFillFeature(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
  cache: Map<string, PlaceSearchResult>,
) {
  const point = await resolvePoint(command, cache);
  const style = {
    ...defaultStyleForType("zone"),
    ...stylePatchToFeatureStyle(command.style),
  };
  const workspace = useEditorWorkspaceStore.getState().workspaceBounds;
  const geoJsonResult = createZoneFillFeatureFromGeoJsonLayersAtLngLat({
    layers: useEditorGeoJsonLayersStore.getState().geoJsonLayers,
    lngLat: [point.lng, point.lat],
    style,
    workspaceBounds: workspace,
  });
  const basemapId = useEditorBasemapStore.getState().basemapId;
  const basemapResult = geoJsonResult.match
    ? geoJsonResult
    : await createZoneFillFeatureAtLngLat({
        basemapId,
        lngLat: [point.lng, point.lat],
        style,
      });
  const waterResult = basemapResult.match
    ? basemapResult
    : await createWorkspaceWaterFillFeatureAtLngLat({
        basemapId,
        lngLat: [point.lng, point.lat],
        style,
        workspaceBounds: workspace,
      });
  const match = waterResult.match;
  if (!match) {
    throw new Error(
      `Aucun contour vectoriel remplissable n'a été trouvé à ${command.place ?? `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`}.`,
    );
  }
  const layerId = resolveLayerId(command.layerRef, aliases);
  const feature: DroMapFeature = {
    ...match.feature,
    id: createId("zone-fill"),
    properties: {
      ...match.feature.properties,
      label: cleanString(command.label) ?? match.sourceLabel,
      legendLabel: cleanString(command.legendLabel) ?? "Zone",
      layerId,
      locked: command.locked ?? false,
      geometryLocked: command.geometryLocked ?? false,
      style,
      meta: { version: 1 },
    },
  };
  return feature;
}

function getFeatureBounds(features: DroMapFeature[]): DroMapAiBounds | null {
  const points: Array<[number, number]> = [];
  for (const feature of features) {
    if (feature.geometry.type === "Point")
      points.push(feature.geometry.coordinates);
    else if (feature.geometry.type === "LineString")
      points.push(...feature.geometry.coordinates);
    else feature.geometry.coordinates.forEach((ring) => points.push(...ring));
  }
  if (!points.length) return null;
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const width = Math.max(east - west, 0.08);
  const height = Math.max(north - south, 0.08);
  return {
    west: west - width * 0.2,
    east: east + width * 0.2,
    south: south - height * 0.2,
    north: north + height * 0.2,
  };
}

function mergeAiBounds(
  current: DroMapAiBounds | null,
  next: DroMapAiBounds | null,
): DroMapAiBounds | null {
  if (!next) return current;
  if (!current) return { ...next };
  return {
    south: Math.min(current.south, next.south),
    west: Math.min(current.west, next.west),
    north: Math.max(current.north, next.north),
    east: Math.max(current.east, next.east),
  };
}

function pointBounds(coordinates: DroMapAiCoordinate[]): DroMapAiBounds | null {
  if (!coordinates.length) return null;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const coordinate of coordinates) {
    if (!Number.isFinite(coordinate.lng) || !Number.isFinite(coordinate.lat)) {
      continue;
    }
    west = Math.min(west, coordinate.lng);
    east = Math.max(east, coordinate.lng);
    south = Math.min(south, coordinate.lat);
    north = Math.max(north, coordinate.lat);
  }
  if (!Number.isFinite(west)) return null;
  return { west, east, south, north };
}

function expandAiBounds(
  bounds: DroMapAiBounds,
  paddingRatio = 0.14,
): DroMapAiBounds {
  const width = Math.max(bounds.east - bounds.west, 0.025);
  const height = Math.max(bounds.north - bounds.south, 0.025);
  const horizontalPadding = Math.max(0.012, width * paddingRatio);
  const verticalPadding = Math.max(0.012, height * paddingRatio);
  return {
    west: bounds.west - horizontalPadding,
    east: bounds.east + horizontalPadding,
    south: Math.max(-85.05112878, bounds.south - verticalPadding),
    north: Math.min(85.05112878, bounds.north + verticalPadding),
  };
}

function geoJsonLayersBounds(layerIds: string[]) {
  const layerIdSet = new Set(layerIds);
  let bounds: DroMapAiBounds | null = null;
  for (const layer of useEditorGeoJsonLayersStore.getState()
    .geoJsonLayers) {
    if (!layerIdSet.has(layer.id) || !layer.bounds) continue;
    bounds = mergeAiBounds(bounds, {
      south: layer.bounds.southWest.lat,
      west: layer.bounds.southWest.lng,
      north: layer.bounds.northEast.lat,
      east: layer.bounds.northEast.lng,
    });
  }
  return bounds;
}

function collectPlanCoordinates(plan: DroMapAiPlan) {
  const coordinates: DroMapAiCoordinate[] = [];
  for (const command of plan.commands) {
    if (command.coordinate) coordinates.push(command.coordinate);
    coordinates.push(...command.coordinates);
    command.rings.forEach((ring) => coordinates.push(...ring));
    for (const item of command.seriesItems) {
      if (item.coordinate) coordinates.push(item.coordinate);
      if (item.fromCoordinate) coordinates.push(item.fromCoordinate);
      if (item.toCoordinate) coordinates.push(item.toCoordinate);
    }
  }
  return coordinates;
}

async function deriveAutomaticWorkspaceBounds({
  plan,
  createdFeatures,
  createdGeoJsonLayerIds,
  placeCache,
}: {
  plan: DroMapAiPlan;
  createdFeatures: DroMapFeature[];
  createdGeoJsonLayerIds: string[];
  placeCache: Map<string, PlaceSearchResult>;
}) {
  let bounds = getFeatureBounds(createdFeatures);
  bounds = mergeAiBounds(bounds, geoJsonLayersBounds(createdGeoJsonLayerIds));
  bounds = mergeAiBounds(bounds, pointBounds(collectPlanCoordinates(plan)));

  // Une demande automatique peut ne faire que modifier des objets existants.
  // Dans ce cas, le résultat cartographique actuel reste la meilleure emprise
  // de secours, sans forcer l'IA à inventer une zone.
  if (!bounds) {
    bounds = getFeatureBounds(useEditorFeaturesStore.getState().features);
    const visibleLayerIds = useEditorGeoJsonLayersStore
      .getState()
      .geoJsonLayers.filter((layer) => layer.visible)
      .map((layer) => layer.id);
    bounds = mergeAiBounds(bounds, geoJsonLayersBounds(visibleLayerIds));
  }

  if (!bounds) {
    const placeNames: string[] = [];
    for (const command of plan.commands) {
      if (command.place) placeNames.push(command.place);
      placeNames.push(...command.places);
      for (const item of command.seriesItems) {
        if (item.place) placeNames.push(item.place);
        if (item.fromPlace) placeNames.push(item.fromPlace);
        if (item.toPlace) placeNames.push(item.toPlace);
      }
    }

    for (const place of Array.from(new Set(placeNames)).slice(0, 12)) {
      try {
        const result = await searchPlace(place, placeCache);
        bounds = mergeAiBounds(
          bounds,
          result.bounds ?? {
            south: result.lat,
            west: result.lng,
            north: result.lat,
            east: result.lng,
          },
        );
      } catch {
        // Les autres lieux ou coordonnées peuvent encore suffire.
      }
    }
  }

  return bounds ? expandAiBounds(bounds) : null;
}

function applyAutomaticWorkspace(
  bounds: DroMapAiBounds,
  createdFeatureIds: string[],
) {
  const workspaceBounds = normalizeWorkspaceBounds(
    { lat: bounds.south, lng: bounds.west },
    { lat: bounds.north, lng: bounds.east },
  );
  let workspaceStore = useEditorWorkspaceStore.getState();
  const restoreZoneLock = workspaceStore.workspaceZoneEditLocked;
  if (restoreZoneLock) {
    // Une commande IA de zone explicitement validée par l’utilisateur dans le
    // plan ne doit pas être bloquée par le verrou d’édition de l’interface.
    useEditorWorkspaceStore.setState({ workspaceZoneEditLocked: false });
    workspaceStore = useEditorWorkspaceStore.getState();
  }
  try {
    workspaceStore.setWorkspaceBounds(workspaceBounds);
    workspaceStore.validateWorkspaceZone();
  } finally {
    if (restoreZoneLock) {
      useEditorWorkspaceStore.setState({ workspaceZoneEditLocked: true });
    }
  }
  fitDroMapAiMapBounds(bounds, { paddingPx: 44, maxZoom: 15, animate: false });

  const finalZoom = getDroMapAiMapZoom() ?? getCurrentEditorMapZoom();
  if (finalZoom === null || createdFeatureIds.length === 0) return;

  const createdIdSet = new Set(createdFeatureIds);
  useEditorFeaturesStore
    .getState()
    .updateFeatures(createdFeatureIds, (feature) => {
      if (!createdIdSet.has(feature.id)) return feature;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          style: {
            ...feature.properties.style,
            ...(feature.properties.type === "text"
              ? { textReferenceZoom: finalZoom }
              : { visualReferenceZoom: finalZoom }),
          },
        },
      };
    });
}

export function establishDroMapAiWorkspaceAroundFeatures(featureIds: string[]) {
  const idSet = new Set(featureIds);
  const features = useEditorFeaturesStore
    .getState()
    .features.filter((feature) => idSet.has(feature.id));
  const bounds = getFeatureBounds(features);
  if (!bounds) return null;
  applyAutomaticWorkspace(bounds, featureIds);
  return bounds;
}

function configureLayer(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
) {
  const layerId = resolveLayerId(command.layerRef, aliases);
  const store = useEditorLayersStore.getState();
  const layer = store.layers.find((candidate) => candidate.id === layerId);
  if (!layer)
    throw new Error(`Calque introuvable : ${command.layerRef ?? layerId}.`);
  if (command.layerName) store.renameLayer(layerId, command.layerName);
  if (command.opacity !== null) store.setLayerOpacity(layerId, command.opacity);
  if (command.visible !== null && command.visible !== layer.visible)
    store.toggleLayerVisibility(layerId);
  if (command.locked !== null && command.locked !== layer.locked)
    store.toggleLayerLocked(layerId);
  if (command.active === true) store.setActiveLayerId(layerId);
}

function configureGeoJsonLayer(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
) {
  const layerId = resolveGeoJsonLayerId(
    command.geoJsonLayerRef ?? command.layerRef,
    aliases,
  );
  const store = useEditorGeoJsonLayersStore.getState();
  const layer = store.geoJsonLayers.find(
    (candidate) => candidate.id === layerId,
  );
  if (!layer) throw new Error(`Calque GeoJSON introuvable : ${layerId}.`);
  if (command.layerName) store.renameGeoJsonLayer(layerId, command.layerName);
  if (command.opacity !== null)
    store.setGeoJsonLayerOpacity(layerId, command.opacity);
  if (command.visible !== null && command.visible !== layer.visible)
    store.toggleGeoJsonLayerVisibility(layerId);
  if (command.locked !== null && command.locked !== layer.locked)
    store.toggleGeoJsonLayerLocked(layerId);
  if (command.geoJsonPrecision)
    store.setGeoJsonLayerPrecisionMode(layerId, command.geoJsonPrecision);
  const patch = Object.fromEntries(
    Object.entries(command.geoJsonStyle).filter(([, value]) => value !== null),
  );
  if (Object.keys(patch).length) store.updateGeoJsonLayerStyle(layerId, patch);
}

function applyFeatureUpdate(
  command: DroMapAiCommand,
  warnings: string[],
  ensureHistory: () => void,
  aliases: Map<string, string>,
) {
  const selected = selectFeatures(command.selector);
  if (!selected.length) {
    warnings.push(`Aucun objet ne correspond à « ${command.explanation} ».`);
    return;
  }
  const layers = useEditorLayersStore.getState().layers;
  const isOnlyLockChange =
    command.locked !== null &&
    command.label === null &&
    command.legendLabel === null &&
    command.mapLabelVisibility === null &&
    command.symbolId === null &&
    command.customMarkerRef === null &&
    Object.values(command.style).every((value) => value === null);
  const editable = selected.filter(
    (feature) =>
      isOnlyLockChange || !isFeatureEffectivelyLocked(feature, layers),
  );
  if (editable.length < selected.length)
    warnings.push(
      `${selected.length - editable.length} objet(s) verrouillé(s) n'ont pas été modifiés.`,
    );
  if (!editable.length) return;
  const stylePatch = stylePatchToFeatureStyle(command.style);
  let symbol: DroMapMarkerSymbol | null = null;
  if (command.symbolId || command.customMarkerRef)
    symbol = resolveMarkerSymbol(command, aliases);
  ensureHistory();
  useEditorFeaturesStore.getState().updateFeatures(
    editable.map((feature) => feature.id),
    (feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        ...(command.label !== null ? { label: command.label } : {}),
        ...(command.legendLabel !== null
          ? { legendLabel: command.legendLabel }
          : {}),
        ...(command.mapLabelVisibility !== null
          ? { mapLabelVisibility: command.mapLabelVisibility }
          : {}),
        ...(command.locked !== null
          ? {
              locked: command.locked,
              lockOverride: command.locked
                ? ("locked" as const)
                : ("unlocked" as const),
            }
          : {}),
        ...(command.geometryLocked !== null
          ? { geometryLocked: command.geometryLocked }
          : {}),
        ...(symbol && feature.properties.type === "marker" ? { symbol } : {}),
        style: { ...feature.properties.style, ...stylePatch },
        meta: { version: 1 },
      },
    }),
  );
}

function applyFeatureDeletion(
  command: DroMapAiCommand,
  warnings: string[],
  ensureHistory: () => void,
) {
  const selected = selectFeatures(command.selector);
  const layers = useEditorLayersStore.getState().layers;
  const deletable = selected.filter(
    (feature) => !isFeatureEffectivelyLocked(feature, layers),
  );
  if (deletable.length < selected.length)
    warnings.push(
      `${selected.length - deletable.length} objet(s) verrouillé(s) n'ont pas été supprimés.`,
    );
  if (!deletable.length) return;
  ensureHistory();
  useEditorFeaturesStore
    .getState()
    .removeFeaturesWithHistory(deletable.map((feature) => feature.id));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function arrangeAutomaticLegendForFeatures(
  features: DroMapFeature[],
  section: string | null = null,
) {
  if (!features.length) return;

  const store = useEditorExportStore.getState();
  const keys = uniqueStrings(
    features.map((feature) => getLegendDedupeKey(feature)),
  );

  if (section) {
    for (const key of keys) {
      store.setLegendGroupSection(key, section);
    }
  }

  const remaining = store.legendGroupOrder.filter((key) => !keys.includes(key));
  store.setLegendGroupOrder([...remaining, ...keys]);
}

function configureFeatureLegend(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
  fallbackFeatures: DroMapFeature[] = [],
) {
  const allFeatures = useEditorFeaturesStore.getState().features;
  const byId = new Map<string, DroMapFeature>(
    allFeatures.map((feature) => [feature.id, feature]),
  );
  const referencedFeatures = command.orderRefs.flatMap((reference) => {
    const resolvedId = aliases.get(reference) ?? reference;
    const feature = byId.get(resolvedId);
    return feature ? [feature] : [];
  });
  const selectedFeatures = hasSelectorConstraint(command.selector)
    ? selectFeatures(command.selector)
    : [];
  const explicitFeatures = Array.from(
    new Map<string, DroMapFeature>(
      [...referencedFeatures, ...selectedFeatures].map((feature) => [
        feature.id,
        feature,
      ]),
    ).values(),
  );

  const features = explicitFeatures.length
    ? explicitFeatures
    : Array.from(
        new Map<string, DroMapFeature>(
          fallbackFeatures.map((feature) => [feature.id, feature]),
        ).values(),
      );

  if (!features.length) {
    throw new Error(
      "configure_feature_legend exige orderRefs, un sélecteur valable, ou doit intervenir juste après la création/import des objets qu'elle organise.",
    );
  }

  const store = useEditorExportStore.getState();
  const keys = uniqueStrings(
    features.map((feature) => getLegendDedupeKey(feature)),
  );

  if (command.label !== null && keys.length === 1) {
    store.setLegendGroupLabel(keys[0], command.label);
  }
  if (command.section !== null) {
    for (const key of keys) {
      store.setLegendGroupSection(key, command.section);
    }
  }
  if (command.hidden !== null) {
    for (const key of keys) {
      const isHidden = store.hiddenLegendGroupKeys.includes(key);
      if (command.hidden !== isHidden) {
        store.toggleLegendGroupVisibility(key);
      }
    }
  }

  if (command.orderRefs.length) {
    const orderedKeys = uniqueStrings(
      command.orderRefs.flatMap((reference) => {
        const resolvedId = aliases.get(reference) ?? reference;
        const feature = byId.get(resolvedId);
        return feature ? [getLegendDedupeKey(feature)] : [];
      }),
    );
    const remaining = store.legendGroupOrder.filter(
      (key) => !orderedKeys.includes(key),
    );
    store.setLegendGroupOrder([...remaining, ...orderedKeys]);
  }
}

function configureLegend(command: DroMapAiCommand) {
  const store = useEditorExportStore.getState();
  if (command.legendTitle !== null) store.setLegendTitle(command.legendTitle);
  if (command.legendPosition !== null)
    store.setLegendPosition(command.legendPosition);
  if (command.legendMapPosition !== null)
    store.setLegendMapPosition(command.legendMapPosition);
  if (command.legendMapTitlePosition !== null)
    store.setLegendMapTitlePosition(command.legendMapTitlePosition);
  if (command.exportFormat !== null)
    store.setExportFormat(command.exportFormat);
  if (command.legendBackgroundColor !== null)
    store.setLegendBackgroundColor(command.legendBackgroundColor);
  if (command.legendSideWidth !== null)
    store.setLegendSideWidth(command.legendSideWidth);
  if (command.legendBottomHeight !== null)
    store.setLegendBottomHeight(command.legendBottomHeight);
  if (command.legendTitleFontSize !== null)
    store.setLegendTitleFontSize(command.legendTitleFontSize);
  if (command.legendItemFontSize !== null)
    store.setLegendItemFontSize(command.legendItemFontSize);
  if (command.legendSectionTitleFontSize !== null)
    store.setLegendSectionTitleFontSize(command.legendSectionTitleFontSize);
  if (command.legendSymbolSize !== null)
    store.setLegendSymbolSize(command.legendSymbolSize);
  if (command.legendItemGap !== null)
    store.setLegendItemGap(command.legendItemGap);
  if (command.legendLabelGap !== null)
    store.setLegendLabelGap(command.legendLabelGap);
  if (command.legendLabelLineHeight !== null)
    store.setLegendLabelLineHeight(command.legendLabelLineHeight);
  if (command.legendSectionGap !== null)
    store.setLegendSectionGap(command.legendSectionGap);
  if (command.legendMapBorderEnabled !== null)
    store.setLegendMapBorderEnabled(command.legendMapBorderEnabled);
  if (command.legendMapBorderColor !== null)
    store.setLegendMapBorderColor(command.legendMapBorderColor);
  if (command.legendMapBorderWidth !== null)
    store.setLegendMapBorderWidth(command.legendMapBorderWidth);
  if (command.legendMapBorderRadius !== null)
    store.setLegendMapBorderRadius(command.legendMapBorderRadius);
  if (command.legendMapPadding !== null)
    store.setLegendMapPadding(command.legendMapPadding);
}


function configureMapTitle(command: DroMapAiCommand) {
  const store = useEditorExportStore.getState();
  if (command.mapTitle !== null) store.setMapTitle(command.mapTitle);
  if (command.mapTitlePosition !== null)
    store.setMapTitlePosition(command.mapTitlePosition);
  if (command.mapTitleFontSize !== null)
    store.setMapTitleFontSize(command.mapTitleFontSize);
  if (command.mapTitleColor !== null)
    store.setMapTitleColor(command.mapTitleColor);
}

function configureBasemapRender(command: DroMapAiCommand) {
  if (command.showBasemapLabels !== null) {
    useEditorExportStore
      .getState()
      .setShowBasemapLabels(command.showBasemapLabels);
  }
  if (command.basemapDetailDelta !== null) {
    const workspace = useEditorWorkspaceStore.getState();
    const base =
      typeof workspace.workspaceBasemapBaseZoom === "number" &&
      Number.isFinite(workspace.workspaceBasemapBaseZoom)
        ? workspace.workspaceBasemapBaseZoom
        : typeof workspace.workspaceBasemapZoom === "number" &&
            Number.isFinite(workspace.workspaceBasemapZoom)
          ? workspace.workspaceBasemapZoom
          : null;
    if (base !== null) {
      workspace.setWorkspaceBasemapZoom(
        base + clamp(command.basemapDetailDelta, -1, 1),
      );
    }
  }
}

function alignLegendSizesWithMap() {
  const exportStore = useEditorExportStore.getState();
  const workspace = useEditorWorkspaceStore.getState();
  const mapVisualZoom =
    getCurrentEditorMapZoom() ??
    workspace.workspaceBasemapZoom ??
    workspace.workspaceBasemapBaseZoom ??
    0;
  const fallbackReferenceZoom =
    workspace.workspaceBasemapBaseZoom ?? mapVisualZoom;
  const globalSymbolScale = getExportLegendGlobalSymbolScale(
    exportStore.legendSymbolSize,
  );
  const nextOverrides = { ...exportStore.legendSymbolOverrides };
  const seenGroups = new Set<string>();

  for (const feature of useEditorFeaturesStore.getState().features) {
    const groupKey = getLegendDedupeKey(feature);
    if (seenGroups.has(groupKey)) continue;
    seenGroups.add(groupKey);

    const style = feature.properties.style ?? {};
    const visualScale = getFeatureVisualScale(
      feature,
      mapVisualZoom,
      fallbackReferenceZoom,
    );
    const currentOverride = nextOverrides[groupKey] ?? {};

    if (feature.properties.type === "marker") {
      nextOverrides[groupKey] = {
        ...currentOverride,
        size: clamp(
          (Number(style.markerSize ?? DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE) *
            visualScale) /
            globalSymbolScale,
          1,
          MAX_EXPORT_LEGEND_SYMBOL_SIZE,
        ),
        weight: clamp(Number(style.weight ?? 4) * visualScale, 0.5, 512),
      };
      continue;
    }

    if (feature.properties.type === "text") {
      nextOverrides[groupKey] = {
        ...currentOverride,
        size: clamp(
          (Number(style.fontSize ?? DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE) *
            visualScale) /
            globalSymbolScale,
          1,
          MAX_EXPORT_LEGEND_SYMBOL_SIZE,
        ),
        weight: clamp(
          Number(style.textBorderWidth ?? 1.5) * visualScale,
          0.5,
          512,
        ),
      };
      continue;
    }

    nextOverrides[groupKey] = {
      ...currentOverride,
      weight: clamp(Number(style.weight ?? 3) * visualScale, 0.5, 512),
    };
  }

  exportStore.setLegendSymbolOverrides(nextOverrides);
}

function addManualLegendEntry(command: DroMapAiCommand, warnings: string[]) {
  const label = cleanString(command.label) ?? "Élément";
  const matchingFeature = useEditorFeaturesStore
    .getState()
    .features.find((feature) => {
      const normalizedLabel = normalizeKey(label);
      return (
        normalizeKey(getLegendFeatureLabel(feature)) === normalizedLabel ||
        normalizeKey(feature.properties.label) === normalizedLabel
      );
    });

  if (matchingFeature) {
    const store = useEditorExportStore.getState();
    const groupKey = getLegendDedupeKey(matchingFeature);
    store.setLegendGroupLabel(groupKey, label);
    const section = cleanString(command.section);
    if (section) {
      store.setLegendGroupSection(groupKey, section);
    }
    warnings.push(
      `L'entrée manuelle « ${label} » n'a pas été dupliquée : la légende automatique de l'objet correspondant a été utilisée.`,
    );
    return null;
  }

  const style = stylePatchToFeatureStyle(command.style);
  const symbol = command.manualLegendSymbol ?? "marker";
  return useEditorExportStore.getState().addCustomLegendEntry({
    label,
    section: cleanString(command.section) ?? "Général",
    symbol,
    color: style.color ?? "#111827",
    fillColor: style.fillColor ?? style.color ?? "#111827",
    dashStyle: style.dashStyle ?? "solid",
    symbolStyle: {
      kind: symbol,
      color: style.color,
      opacity: style.opacity,
      weight: style.weight,
      dashStyle: style.dashStyle,
      fillColor: style.fillColor,
      fillOpacity: style.fillOpacity,
      markerFilled: style.markerFilled,
      arrowStart: style.arrowStart,
      arrowEnd: style.arrowEnd,
      zoneStrokeEnabled: style.zoneStrokeEnabled,
      zoneFillEnabled: style.zoneFillEnabled,
      zoneHatchingStyle:
        style.zoneHatchingStyle === "dots" ? "none" : style.zoneHatchingStyle,
      zoneHatchingColor: style.zoneHatchingColor,
      zoneHatchingWeight: style.zoneHatchingWeight,
      zoneHatchingSpacing: style.zoneHatchingSpacing,
      zoneDotsEnabled: style.zoneDotsEnabled,
      zoneDotsColor: style.zoneDotsColor,
      zoneDotsRadius: style.zoneDotsRadius,
      zoneDotsSpacing: style.zoneDotsSpacing,
      size: style.markerSize ?? style.fontSize,
      markerSymbolId: cleanString(command.symbolId) ?? undefined,
    },
  });
}

async function applyDirectWorkspaceCommand(
  command: DroMapAiCommand,
  cache: Map<string, PlaceSearchResult>,
) {
  let bounds: DroMapAiBounds | null = null;

  if (command.type === "set_workspace_bounds") {
    bounds = command.bounds;
    if (!bounds) {
      throw new Error("set_workspace_bounds exige bounds.");
    }
  } else if (command.type === "select_world") {
    bounds = {
      south: -85.05112878,
      west: -180,
      north: 85.05112878,
      east: 180,
    };
  } else if (command.type === "set_workspace_by_place") {
    const place = cleanString(command.place);
    if (!place) {
      throw new Error("set_workspace_by_place exige place.");
    }
    const result = await searchPlace(place, cache);
    const paddingRatio = clamp(command.paddingRatio ?? 0.08, 0, 0.6);
    bounds = result.bounds
      ? expandAiBounds(result.bounds, paddingRatio)
      : expandAiBounds(
          {
            south: result.lat,
            west: result.lng,
            north: result.lat,
            east: result.lng,
          },
          Math.max(0.2, paddingRatio),
        );
  }

  if (!bounds) {
    throw new Error("La commande de zone ne contient aucune emprise exploitable.");
  }

  applyAutomaticWorkspace(bounds, []);
  const applied = useEditorWorkspaceStore.getState().workspaceBounds;
  if (!applied) {
    throw new Error("DroMap n’a pas pu appliquer la nouvelle zone de travail.");
  }
  return bounds;
}

async function fetchGeoJsonFromUrl(url: string) {
  const response = await fetch(
    `/api/dromap/ai/fetch-geojson?url=${encodeURIComponent(url)}`,
    {
      headers: { Accept: "application/geo+json,application/json" },
      cache: "no-store",
    },
  );
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {}
    throw new Error(
      message || `Téléchargement GeoJSON impossible (${response.status}).`,
    );
  }
  return text;
}

async function importCatalogLayer(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
) {
  const id = cleanString(command.geoJsonCatalogId);
  if (!id) throw new Error("import_geojson_catalog exige geoJsonCatalogId.");
  const entry = DROMAP_GEOJSON_CATALOG.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Jeu GeoJSON inconnu : ${id}.`);
  const text = await fetchGeoJsonFromUrl(entry.downloadUrl);
  const store = useEditorGeoJsonLayersStore.getState();
  const layer = parseGeoJsonTextToDromapGeoJsonLayer(text, {
    sourceName: entry.title,
    layerName: cleanString(command.layerName) ?? entry.title,
    existingLayerCount: store.geoJsonLayers.length,
    precisionMode: command.geoJsonPrecision ?? entry.recommendedPrecision,
    catalogDatasetId: entry.id,
    sourceLabel: entry.sourceLabel,
    sourceUrl: entry.sourceUrl,
    sourceLicense: entry.sourceLicense,
    sourceAttribution: entry.sourceAttribution,
    sourceVersion: entry.versionLabel,
  });
  store.addGeoJsonLayer(layer);
  aliases.set(command.id, layer.id);
  aliases.set(layer.name, layer.id);
  return layer;
}

async function importUrlLayer(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
) {
  const url = cleanString(command.geoJsonUrl);
  if (!url) throw new Error("import_geojson_url exige geoJsonUrl.");
  const text = await fetchGeoJsonFromUrl(url);
  const store = useEditorGeoJsonLayersStore.getState();
  const layer = parseGeoJsonTextToDromapGeoJsonLayer(text, {
    sourceName: url,
    layerName: cleanString(command.layerName) ?? "Données IA",
    existingLayerCount: store.geoJsonLayers.length,
    precisionMode: command.geoJsonPrecision ?? "original",
    sourceUrl: url,
    sourceLabel: "Source externe proposée par l’assistant IA",
  });
  store.addGeoJsonLayer(layer);
  aliases.set(command.id, layer.id);
  aliases.set(layer.name, layer.id);
  return layer;
}

function createInlineGeoJsonLayer(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
) {
  if (!command.geoJsonData)
    throw new Error("create_geojson_layer exige geoJsonData.");
  const store = useEditorGeoJsonLayersStore.getState();
  const layer = parseGeoJsonTextToDromapGeoJsonLayer(
    JSON.stringify(command.geoJsonData),
    {
      sourceName: "Assistant IA",
      layerName: cleanString(command.layerName) ?? "Données IA",
      existingLayerCount: store.geoJsonLayers.length,
      precisionMode: command.geoJsonPrecision ?? "original",
      sourceLabel: "Assistant IA DroMap",
    },
  );
  store.addGeoJsonLayer(layer);
  aliases.set(command.id, layer.id);
  aliases.set(layer.name, layer.id);
  return layer;
}

function createCustomMarkerSvg(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
) {
  const svg = cleanString(command.customMarkerSvg);
  if (!svg) throw new Error("create_custom_marker_svg exige customMarkerSvg.");
  if (
    !/<svg[\s>]/i.test(svg) ||
    /<(?:script|iframe|object|embed|foreignObject)[\s>]/i.test(svg) ||
    /on\w+\s*=/i.test(svg) ||
    /(?:href|src)\s*=\s*["']\s*(?:https?:|javascript:|data:text\/html)/i.test(
      svg,
    )
  ) {
    throw new Error(
      "SVG de marqueur refusé : contenu invalide, externe ou potentiellement actif.",
    );
  }
  const id = createCustomMarkerId("image");
  const marker = useEditorCustomMarkersStore.getState().addCustomMarker({
    id,
    name: cleanString(command.label) ?? "Marqueur IA",
    kind: "image",
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  });
  aliases.set(command.id, marker.id);
  aliases.set(marker.name, marker.id);
  return marker.id;
}

function proportionalSize(
  value: number,
  maxValue: number,
  minSize: number,
  maxSize: number,
  method: string | null,
) {
  if (maxValue <= 0) return minSize;
  const ratio = clamp(value / maxValue, 0, 1);
  const scaled =
    method === "diameter" || method === "width" ? ratio : Math.sqrt(ratio);
  return clamp(maxSize * scaled, minSize, maxSize);
}

async function createProportionalMarkers(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
  cache: Map<string, PlaceSearchResult>,
  ensureHistory: () => void,
) {
  const items = command.seriesItems.filter(
    (item) => Number.isFinite(item.value) && item.value >= 0,
  );
  if (!items.length)
    throw new Error("create_proportional_markers exige seriesItems.");
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const minSize = clamp(command.minSize ?? 18, 2, 4096);
  const maxSize = clamp(command.maxSize ?? 90, minSize, 4096);
  const layerId = resolveLayerId(command.layerRef, aliases);
  const features: DroMapFeature[] = [];

  // Un nouvel essai de la même carte remplace les anciennes entrées manuelles
  // portant exactement les mêmes libellés, au lieu de les empiler.
  const targetLegendLabels = new Set(
    items.map(
      (item) =>
        `${item.label} — ${item.value.toLocaleString("fr-FR")}${item.unit ? ` ${item.unit}` : ""}`,
    ),
  );
  for (const entry of useEditorExportStore.getState().customLegendEntries) {
    if (targetLegendLabels.has(entry.label)) {
      useEditorExportStore.getState().removeCustomLegendEntry(entry.id);
    }
  }

  ensureHistory();
  for (const item of items) {
    const point = await resolveSeriesPoint(item, cache);
    const size = proportionalSize(
      item.value,
      maxValue,
      minSize,
      maxSize,
      command.proportionalMethod,
    );
    const derived: DroMapAiCommand = {
      ...command,
      type: "create_marker",
      label: item.label,
      legendLabel: `${item.label} — ${item.value.toLocaleString("fr-FR")}${item.unit ? ` ${item.unit}` : ""}`,
      symbolId: item.symbolId ?? command.symbolId ?? "circle",
      coordinate: point,
      style: {
        ...command.style,
        markerSize: size,
        color: item.color ?? command.style.color,
      },
      mapLabelVisibility: command.mapLabelVisibility ?? "show",
    };
    const feature = createPointFeature(derived, point, layerId, aliases);
    useEditorFeaturesStore.getState().addFeature(feature);
    features.push(feature);

    // La légende reste liée au vrai marqueur. Le libellé et la taille viennent
    // directement de la feature automatique : aucune copie manuelle n'est créée.
    aliases.set(item.id, feature.id);
  }
  arrangeAutomaticLegendForFeatures(
    features,
    cleanString(command.section) ?? cleanString(command.legendTitle),
  );
  return features;
}

async function createProportionalFlows(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
  cache: Map<string, PlaceSearchResult>,
  ensureHistory: () => void,
) {
  const items = command.seriesItems.filter(
    (item) => Number.isFinite(item.value) && item.value >= 0,
  );
  if (!items.length)
    throw new Error("create_proportional_flows exige seriesItems.");
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const minSize = clamp(command.minSize ?? 2, 0.5, 200);
  const maxSize = clamp(command.maxSize ?? 16, minSize, 200);
  const layerId = resolveLayerId(command.layerRef, aliases);
  const features: DroMapFeature[] = [];

  // Un nouvel essai de la même carte remplace les anciennes entrées manuelles
  // portant exactement les mêmes libellés, au lieu de les empiler.
  const targetLegendLabels = new Set(
    items.map(
      (item) =>
        `${item.label} — ${item.value.toLocaleString("fr-FR")}${item.unit ? ` ${item.unit}` : ""}`,
    ),
  );
  for (const entry of useEditorExportStore.getState().customLegendEntries) {
    if (targetLegendLabels.has(entry.label)) {
      useEditorExportStore.getState().removeCustomLegendEntry(entry.id);
    }
  }

  ensureHistory();
  for (const item of items) {
    const from =
      item.fromCoordinate ??
      (item.fromPlace
        ? await searchPlace(item.fromPlace, cache).then((r) => ({
            lng: r.lng,
            lat: r.lat,
          }))
        : null);
    const to =
      item.toCoordinate ??
      (item.toPlace
        ? await searchPlace(item.toPlace, cache).then((r) => ({
            lng: r.lng,
            lat: r.lat,
          }))
        : null);
    if (!from || !to)
      throw new Error(`Origine ou destination manquante pour ${item.label}.`);
    const weight = proportionalSize(
      item.value,
      maxValue,
      minSize,
      maxSize,
      command.proportionalMethod ?? "width",
    );
    const derived: DroMapAiCommand = {
      ...command,
      type: "create_line",
      label: item.label,
      legendLabel: `${item.label} — ${item.value.toLocaleString("fr-FR")}${item.unit ? ` ${item.unit}` : ""}`,
      style: {
        ...command.style,
        weight,
        color: item.color ?? command.style.color,
        arrowEnd: command.style.arrowEnd ?? true,
      },
    };
    const feature = createLineFeature(derived, [from, to], layerId);
    useEditorFeaturesStore.getState().addFeature(feature);
    features.push(feature);
    aliases.set(item.id, feature.id);
  }
  arrangeAutomaticLegendForFeatures(
    features,
    cleanString(command.section) ?? cleanString(command.legendTitle),
  );
  return features;
}

function findChoroplethClass(
  value: number,
  classes: DroMapAiChoroplethClass[],
) {
  return (
    classes.find(
      (item) =>
        (item.min === null || value >= item.min) &&
        (item.max === null || value <= item.max),
    ) ?? null
  );
}

function extractJoinValue(feature: DromapGeoJsonFeature, properties: string[]) {
  const candidates = properties.length
    ? properties
    : [
        "name",
        "NAME",
        "name_fr",
        "admin",
        "iso_a3",
        "ISO_A3",
        "adm0_a3",
        "code",
        "id",
      ];
  for (const key of candidates) {
    const value = feature.properties?.[key];
    if (value !== null && value !== undefined && String(value).trim())
      return String(value);
  }
  return null;
}

async function createChoropleth(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
) {
  let layer: DromapGeoJsonLayer;
  if (command.geoJsonCatalogId)
    layer = await importCatalogLayer(command, aliases);
  else if (command.geoJsonUrl) layer = await importUrlLayer(command, aliases);
  else if (command.geoJsonData)
    layer = createInlineGeoJsonLayer(command, aliases);
  else throw new Error("create_choropleth exige une source GeoJSON.");
  const values = new Map(
    command.choroplethValues.map((item) => [normalizeKey(item.key), item]),
  );
  const classes = command.classes;
  if (!values.size || !classes.length)
    throw new Error("create_choropleth exige choroplethValues et classes.");
  const nextData = {
    ...layer.data,
    features: layer.data.features.map((feature) => {
      const join = extractJoinValue(feature, command.geoJsonJoinProperties);
      const item = join ? values.get(normalizeKey(join)) : null;
      if (!item) return feature;
      const group = findChoroplethClass(item.value, classes);
      if (!group) return feature;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          dromap: {
            ...(typeof feature.properties.dromap === "object" &&
            feature.properties.dromap
              ? (feature.properties.dromap as Record<string, unknown>)
              : {}),
            style: {
              fillColor: group.fillColor,
              fillOpacity: group.fillOpacity,
              color: command.geoJsonStyle.strokeColor ?? "#ffffff",
              opacity: command.geoJsonStyle.strokeOpacity ?? 0.9,
              weight: command.geoJsonStyle.strokeWeight ?? 1,
              zoneFillEnabled: true,
              zoneStrokeEnabled: true,
            },
          },
          dromap_ai_value: item.value,
          dromap_ai_unit: item.unit,
        },
      };
    }),
  };
  const updated = { ...layer, data: nextData, locked: false };
  useEditorGeoJsonLayersStore
    .getState()
    .setGeoJsonLayers(
      useEditorGeoJsonLayersStore
        .getState()
        .geoJsonLayers.map((candidate) =>
          candidate.id === layer.id ? updated : candidate,
        ),
    );
  const exportStore = useEditorExportStore.getState();
  const automaticZoneLegendId = getGeoJsonLayerLegendId(layer.id, "zones");
  if (!exportStore.hiddenLegendFeatureIds.includes(automaticZoneLegendId)) {
    exportStore.toggleLegendFeatureVisibility(automaticZoneLegendId);
  }

  for (const group of classes) {
    useEditorExportStore.getState().addCustomLegendEntry({
      label: group.label,
      section:
        cleanString(command.section) ??
        cleanString(command.legendTitle) ??
        "Valeurs",
      symbol: "zone",
      color: command.geoJsonStyle.strokeColor ?? "#ffffff",
      fillColor: group.fillColor,
      dashStyle: "solid",
      symbolStyle: {
        kind: "zone",
        fillColor: group.fillColor,
        fillOpacity: group.fillOpacity,
        color: command.geoJsonStyle.strokeColor ?? "#ffffff",
        zoneFillEnabled: true,
        zoneStrokeEnabled: true,
      },
    });
  }
  return updated;
}

type BuildingFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  GeoJSON.GeoJsonProperties
>;

type BuildingSearchBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type DroMapAiBuildingSelectionTarget = {
  query: string;
  coordinate: DroMapAiCoordinate;
  bounds: DroMapAiBounds | null;
};

export type DroMapAiBuildingSelectionPreparation = {
  commandId: string;
  features: BuildingFeature[];
  bounds: DroMapAiBounds;
  suggestedFeatureIds: string[];
  suggestedGroupByFeatureId: Record<string, string>;
  queryTargets: DroMapAiBuildingSelectionTarget[];
  warnings: string[];
};

export type DroMapAiBuildingSelectionImportResult = {
  selectedCount: number;
  createdFeatureIds: string[];
  createdGeoJsonLayerIds: string[];
  createdLayerNames: string[];
  groupSummaries: Array<{
    label: string;
    count: number;
  }>;
};

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBuildingBounds(bounds: DroMapAiBounds): BuildingSearchBounds {
  return {
    south: Math.min(bounds.south, bounds.north),
    west: Math.min(bounds.west, bounds.east),
    north: Math.max(bounds.south, bounds.north),
    east: Math.max(bounds.west, bounds.east),
  };
}

function boundsAroundPoint(
  point: DroMapAiCoordinate,
  latitudePadding = 0.004,
  longitudePadding = 0.006,
): BuildingSearchBounds {
  return {
    south: point.lat - latitudePadding,
    west: point.lng - longitudePadding,
    north: point.lat + latitudePadding,
    east: point.lng + longitudePadding,
  };
}

function padBuildingBounds(
  bounds: BuildingSearchBounds,
  ratio = 0.12,
): BuildingSearchBounds {
  const latSpan = Math.max(0.0015, bounds.north - bounds.south);
  const lngSpan = Math.max(0.0015, bounds.east - bounds.west);
  const latPadding = Math.max(0.001, latSpan * ratio);
  const lngPadding = Math.max(0.001, lngSpan * ratio);
  return {
    south: bounds.south - latPadding,
    west: bounds.west - lngPadding,
    north: bounds.north + latPadding,
    east: bounds.east + lngPadding,
  };
}

function getRequestedBuildingQueries(command: DroMapAiCommand) {
  const source = command.buildingQueries.length
    ? command.buildingQueries
    : command.buildingSelectionMode === "named"
      ? command.places
      : [];
  return Array.from(
    new Set(
      source
        .map((query) => cleanString(query))
        .filter((query): query is string => Boolean(query)),
    ),
  );
}

function getWorkspaceBuildingBounds(): BuildingSearchBounds | null {
  const workspace = useEditorWorkspaceStore.getState().workspaceBounds;
  if (!workspace) return null;
  return {
    south: workspace.southWest.lat,
    west: workspace.southWest.lng,
    north: workspace.northEast.lat,
    east: workspace.northEast.lng,
  };
}

function placeResultBounds(result: PlaceSearchResult): BuildingSearchBounds {
  if (result.bounds) return padBuildingBounds(normalizeBuildingBounds(result.bounds));
  return boundsAroundPoint({ lng: result.lng, lat: result.lat });
}

async function resolveBuildingSearchAreas(
  command: DroMapAiCommand,
  placeCache: Map<string, PlaceSearchResult>,
): Promise<BuildingSearchBounds[]> {
  const workspaceBounds = getWorkspaceBuildingBounds();
  if (workspaceBounds) return [workspaceBounds];

  if (command.bounds) {
    return [normalizeBuildingBounds(command.bounds)];
  }

  const explicitPlace = cleanString(command.place);
  if (explicitPlace) {
    return [placeResultBounds(await searchPlace(explicitPlace, placeCache))];
  }

  const queries = getRequestedBuildingQueries(command).slice(0, 24);

  if (!queries.length) {
    throw new Error(
      "Import bâtiments impossible : valide une zone de travail ou précise un lieu de recherche dans la demande IA.",
    );
  }

  const areas: BuildingSearchBounds[] = [];
  for (const query of queries) {
    try {
      const result = await searchPlace(query, placeCache);
      areas.push(placeResultBounds(result));
    } catch {
      // La requête sera encore tentée par correspondance nominale sur les autres zones.
    }
  }

  if (!areas.length) {
    throw new Error(
      "DroMap n'a pas pu délimiter la recherche des bâtiments demandés. Précise la ville, le campus ou valide une zone de travail.",
    );
  }

  return areas;
}

async function fetchBuildingsForArea(
  bounds: BuildingSearchBounds,
  maxFeatures: number,
) {
  const params = new URLSearchParams(
    Object.fromEntries(
      Object.entries(bounds).map(([key, value]) => [key, String(value)]),
    ),
  );

  try {
    const response = await fetch(`/api/dromap/buildings?${params}`, {
      headers: { Accept: "application/geo+json,application/json" },
      cache: "no-store",
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (response.ok && Array.isArray(data.features) && data.features.length) {
      const { enrichBuildingNamesFromOverturePlaces } = await import(
        "./overture-buildings-client"
      );
      const enrichment = await enrichBuildingNamesFromOverturePlaces(
        data.features as BuildingFeature[],
        bounds,
        {
          maxPlaces: Math.min(25_000, Math.max(5_000, maxFeatures * 4)),
        },
      );
      return enrichment.features as BuildingFeature[];
    }
  } catch {
    // Le client Overture prend le relais.
  }

  const {
    downloadOvertureBuildings,
    enrichBuildingNamesFromOverturePlaces,
  } = await import("./overture-buildings-client");
  const payload = await downloadOvertureBuildings(bounds, { maxFeatures });
  const features = Array.isArray(payload.features)
    ? (payload.features as BuildingFeature[])
    : [];
  const enrichment = await enrichBuildingNamesFromOverturePlaces(
    features,
    bounds,
    {
      maxPlaces: Math.min(25_000, Math.max(5_000, maxFeatures * 4)),
    },
  );
  return enrichment.features as BuildingFeature[];
}

function getBuildingFeatureKey(feature: BuildingFeature, fallbackIndex: number) {
  if (typeof feature.id === "string" || typeof feature.id === "number") {
    return String(feature.id);
  }
  const properties = isRecordValue(feature.properties)
    ? feature.properties
    : {};
  for (const key of ["cleabs", "id", "osm_id", "gml_id", "fid"]) {
    const value = properties[key];
    if (typeof value === "string" || typeof value === "number") {
      return `${key}:${String(value)}`;
    }
  }
  return `geometry:${JSON.stringify(feature.geometry).slice(0, 500)}:${fallbackIndex}`;
}

function getInteractiveBuildingSelectionId(
  feature: BuildingFeature,
  fallbackIndex: number,
) {
  if (typeof feature.id === "string" || typeof feature.id === "number") {
    return String(feature.id);
  }
  const properties = isRecordValue(feature.properties)
    ? feature.properties
    : {};
  const candidate =
    properties.cleabs ??
    properties.id ??
    properties.label ??
    properties.nom;
  if (typeof candidate === "string" || typeof candidate === "number") {
    return String(candidate);
  }
  return `building-${fallbackIndex + 1}`;
}

function getBuildingCandidateStrings(feature: BuildingFeature) {
  const properties = isRecordValue(feature.properties)
    ? feature.properties
    : {};
  const preferredKeys = [
    "name",
    "official_name",
    "short_name",
    "osm_name",
    "nom",
    "toponyme",
    "denomination",
    "designation",
    "brand",
    "operator",
    "adresse",
    "address",
    "label",
  ];
  const values: string[] = [];
  for (const key of preferredKeys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) values.push(value.trim());
  }
  return Array.from(new Set(values));
}

function hasProperBuildingName(feature: BuildingFeature) {
  const properties = isRecordValue(feature.properties)
    ? feature.properties
    : {};
  const genericNames = new Set([
    "batiment",
    "batiment sans nom renseigne",
    "indifferencie",
    "commercial",
    "industriel",
    "residentiel",
    "agricole",
    "sans nom",
    "unknown",
  ]);
  for (const key of [
    "name",
    "official_name",
    "osm_name",
    "nom",
    "toponyme",
    "denomination",
    "designation",
  ]) {
    const value = properties[key];
    if (typeof value !== "string" || !value.trim()) continue;
    if (!genericNames.has(normalizeKey(value))) return true;
  }
  return false;
}

const BUILDING_MATCH_STOP_WORDS = new Set([
  "a",
  "au",
  "aux",
  "de",
  "des",
  "du",
  "en",
  "et",
  "la",
  "le",
  "les",
  "l",
  "d",
  "un",
  "une",
  "site",
  "campus",
  "batiment",
  "bâtiment",
]);

function significantBuildingWords(value: string) {
  return normalizeKey(value)
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 2 &&
        !BUILDING_MATCH_STOP_WORDS.has(word),
    );
}

function buildingAcronym(value: string) {
  return significantBuildingWords(value)
    .filter((word) => word.length > 2)
    .map((word) => word[0])
    .join("");
}

function scoreBuildingForQuery(feature: BuildingFeature, query: string) {
  const normalizedQuery = normalizeKey(query);
  if (!normalizedQuery) return 0;
  const candidates = getBuildingCandidateStrings(feature);
  const queryWords = significantBuildingWords(query);
  const queryAcronym = buildingAcronym(query);
  let best = 0;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeKey(candidate);
    if (!normalizedCandidate) continue;
    if (normalizedCandidate === normalizedQuery) best = Math.max(best, 1200);
    if (normalizedCandidate.includes(normalizedQuery)) {
      best = Math.max(best, 980 - Math.min(200, normalizedCandidate.length - normalizedQuery.length));
    }
    if (normalizedQuery.includes(normalizedCandidate) && normalizedCandidate.length >= 5) {
      best = Math.max(best, 900 - Math.min(200, normalizedQuery.length - normalizedCandidate.length));
    }

    const candidateWords = significantBuildingWords(candidate);
    const matchedWordCount = queryWords.filter((word) =>
      candidateWords.some(
        (candidateWord) =>
          candidateWord === word ||
          candidateWord.includes(word) ||
          word.includes(candidateWord),
      ),
    ).length;
    if (queryWords.length > 0 && matchedWordCount === queryWords.length) {
      best = Math.max(best, 720 + matchedWordCount * 20);
    } else if (matchedWordCount >= Math.max(2, Math.ceil(queryWords.length * 0.7))) {
      best = Math.max(best, 520 + matchedWordCount * 18);
    }

    const candidateAcronym = buildingAcronym(candidate);
    if (
      queryAcronym.length >= 3 &&
      candidateAcronym.length >= 3 &&
      (candidateAcronym === queryAcronym ||
        candidateAcronym.startsWith(queryAcronym) ||
        queryAcronym.startsWith(candidateAcronym))
    ) {
      best = Math.max(best, 780);
    }
  }

  return best;
}

function pointInRing(point: DroMapAiCoordinate, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInBuildingGeometry(
  point: DroMapAiCoordinate,
  geometry: BuildingFeature["geometry"],
) {
  const polygonContains = (polygon: number[][][]) => {
    if (!polygon.length || !pointInRing(point, polygon[0] ?? [])) return false;
    return !polygon.slice(1).some((hole) => pointInRing(point, hole));
  };
  if (geometry.type === "Polygon") return polygonContains(geometry.coordinates);
  return geometry.coordinates.some(polygonContains);
}

function collectBuildingCoordinates(geometry: BuildingFeature["geometry"]) {
  const result: Array<[number, number]> = [];
  const visit = (value: unknown) => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      result.push([value[0], value[1]]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry.coordinates);
  return result;
}

function getBuildingCenter(feature: BuildingFeature): DroMapAiCoordinate | null {
  const coordinates = collectBuildingCoordinates(feature.geometry);
  if (!coordinates.length) return null;
  let lng = 0;
  let lat = 0;
  for (const coordinate of coordinates) {
    lng += coordinate[0];
    lat += coordinate[1];
  }
  return { lng: lng / coordinates.length, lat: lat / coordinates.length };
}

function distanceMeters(first: DroMapAiCoordinate, second: DroMapAiCoordinate) {
  const radius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(second.lat - first.lat);
  const dLng = toRad(second.lng - first.lng);
  const lat1 = toRad(first.lat);
  const lat2 = toRad(second.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mergeBuildingBounds(
  boundsList: BuildingSearchBounds[],
): BuildingSearchBounds | null {
  if (!boundsList.length) return null;
  return boundsList.reduce<BuildingSearchBounds>(
    (current, bounds) => ({
      south: Math.min(current.south, bounds.south),
      west: Math.min(current.west, bounds.west),
      north: Math.max(current.north, bounds.north),
      east: Math.max(current.east, bounds.east),
    }),
    { ...boundsList[0] },
  );
}

function intersectBuildingBounds(
  first: BuildingSearchBounds,
  second: BuildingSearchBounds,
): BuildingSearchBounds | null {
  const intersection = {
    south: Math.max(first.south, second.south),
    west: Math.max(first.west, second.west),
    north: Math.min(first.north, second.north),
    east: Math.min(first.east, second.east),
  };
  return intersection.south < intersection.north &&
    intersection.west < intersection.east
    ? intersection
    : null;
}

function buildingBoundsContainsPoint(
  bounds: BuildingSearchBounds,
  point: DroMapAiCoordinate,
) {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  );
}

function buildingBoundsSizeMeters(bounds: BuildingSearchBounds) {
  const center = {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };
  return {
    width: distanceMeters(
      { lat: center.lat, lng: bounds.west },
      { lat: center.lat, lng: bounds.east },
    ),
    height: distanceMeters(
      { lat: bounds.south, lng: center.lng },
      { lat: bounds.north, lng: center.lng },
    ),
  };
}

function suggestedBuildingRadiusMeters(query: string) {
  const normalized = normalizeKey(query);
  if (
    /(campus|universite|universit|ecole|college|lycee|hopital|centre hospitalier|quartier general|base militaire|caserne|arsenal|site militaire|ens\b)/.test(
      normalized,
    )
  ) {
    return 220;
  }
  if (/(site|centre|complexe|institut|faculte|academie)/.test(normalized)) {
    return 170;
  }
  return 115;
}

async function resolveInteractiveBuildingSelectionArea(
  command: DroMapAiCommand,
  placeCache: Map<string, PlaceSearchResult>,
) {
  const queries = getRequestedBuildingQueries(command).slice(0, 24);
  const queryTargets: DroMapAiBuildingSelectionTarget[] = [];

  for (const query of queries) {
    try {
      const result = await searchPlace(query, placeCache);
      queryTargets.push({
        query,
        coordinate: { lng: result.lng, lat: result.lat },
        bounds: result.bounds,
      });
    } catch {
      // La sélection manuelle reste possible même si une cible n'est pas géocodée.
    }
  }

  const workspace = getWorkspaceBuildingBounds();
  const constrainToWorkspace = (candidate: BuildingSearchBounds) =>
    workspace ? intersectBuildingBounds(candidate, workspace) ?? workspace : candidate;

  if (command.bounds) {
    return {
      bounds: constrainToWorkspace(normalizeBuildingBounds(command.bounds)),
      queryTargets,
    };
  }

  const explicitPlace = cleanString(command.place);
  if (explicitPlace) {
    const place = await searchPlace(explicitPlace, placeCache);
    return {
      bounds: constrainToWorkspace(placeResultBounds(place)),
      queryTargets,
    };
  }

  if (queryTargets.length) {
    const targetBounds = queryTargets.map((target) =>
      target.bounds
        ? placeResultBounds({
            id: target.query,
            displayName: target.query,
            lat: target.coordinate.lat,
            lng: target.coordinate.lng,
            bounds: target.bounds,
          })
        : boundsAroundPoint(target.coordinate, 0.0035, 0.005),
    );
    const merged = mergeBuildingBounds(targetBounds);
    if (merged) {
      return {
        bounds: constrainToWorkspace(padBuildingBounds(merged, 0.1)),
        queryTargets,
      };
    }
  }

  if (workspace) return { bounds: workspace, queryTargets };

  throw new Error(
    "DroMap n'a pas pu déterminer la zone utile pour sélectionner les bâtiments. Précise la ville, le campus ou l'emprise dans ta demande.",
  );
}


export type DroMapAiRouteSelectionPreparation = {
  commandId: string;
  features: DromapRoadSelectionFeature[];
  bounds: DroMapAiBounds;
  categories: DromapRoadImportCategory[];
  source: DromapRoadSourceMetadata;
  suggestedFeatureIds: string[];
  hadExistingRoadLayer: boolean;
  warnings: string[];
};

export type DroMapAiRouteSelectionImportResult = {
  selectedCount: number;
  layerName: string | null;
  categories: DromapRoadImportCategory[];
  removed: boolean;
};

function getRoadCommandCategories(command: DroMapAiCommand): DromapRoadImportCategory[] {
  return command.roadCategories.length
    ? [...command.roadCategories]
    : ["motorways", "main"];
}

function approximateBoundsAreaKm2(bounds: BuildingSearchBounds) {
  const centerLat = (bounds.south + bounds.north) / 2;
  const heightKm = Math.abs(bounds.north - bounds.south) * 111.32;
  const widthKm =
    Math.abs(bounds.east - bounds.west) *
    111.32 *
    Math.max(0.08, Math.cos((centerLat * Math.PI) / 180));
  return widthKm * heightKm;
}

function clampRoadBoundsToAllowedArea(
  bounds: BuildingSearchBounds,
  categories: readonly DromapRoadImportCategory[],
) {
  const maxArea = getDromapRoadImportMaxAreaKm2(categories);
  const area = approximateBoundsAreaKm2(bounds);
  if (!maxArea || !Number.isFinite(area) || area <= maxArea * 0.96) return bounds;
  const ratio = Math.sqrt((maxArea * 0.9) / Math.max(area, 1));
  const centerLat = (bounds.south + bounds.north) / 2;
  const centerLng = (bounds.west + bounds.east) / 2;
  const halfLat = ((bounds.north - bounds.south) / 2) * ratio;
  const halfLng = ((bounds.east - bounds.west) / 2) * ratio;
  return {
    south: centerLat - halfLat,
    west: centerLng - halfLng,
    north: centerLat + halfLat,
    east: centerLng + halfLng,
  };
}

function getWorkspaceRoadBounds(): BuildingSearchBounds | null {
  const workspace = useEditorWorkspaceStore.getState().workspaceBounds;
  if (!workspace) return null;
  return {
    south: workspace.southWest.lat,
    west: workspace.southWest.lng,
    north: workspace.northEast.lat,
    east: workspace.northEast.lng,
  };
}

async function resolveRouteSelectionBounds(
  command: DroMapAiCommand,
  placeCache: Map<string, PlaceSearchResult>,
  options: { preferWorkspace: boolean },
) {
  const categories = getRoadCommandCategories(command);
  const workspace = getWorkspaceRoadBounds();
  if (options.preferWorkspace && workspace) {
    return clampRoadBoundsToAllowedArea(workspace, categories);
  }
  if (command.bounds) {
    return clampRoadBoundsToAllowedArea(normalizeBuildingBounds(command.bounds), categories);
  }
  const explicitPlace = cleanString(command.place);
  if (explicitPlace) {
    const place = await searchPlace(explicitPlace, placeCache);
    return clampRoadBoundsToAllowedArea(placeResultBounds(place), categories);
  }
  if (workspace) {
    return clampRoadBoundsToAllowedArea(workspace, categories);
  }
  throw new Error(
    "DroMap n'a pas pu déterminer la zone utile aux routes. Précise une ville, une région ou une emprise dans la demande IA.",
  );
}

function getRoadFeatureSearchText(feature: DromapRoadSelectionFeature) {
  const properties = feature.properties ?? {};
  return normalizeKey(
    [
      properties.ref,
      properties.name,
      properties.label,
      properties.__dromapRoadGroupKey,
    ]
      .filter((value) => typeof value === "string" || typeof value === "number")
      .map(String)
      .join(" "),
  );
}

function getRoadSuggestedSelectionIds(
  command: DroMapAiCommand,
  features: DromapRoadSelectionFeature[],
) {
  const existing = new Set(getInitialRoadSelectionIds(features));
  if (command.roadSelectionMode === "all") {
    features.forEach((feature, index) => {
      if (feature.properties?.__dromapRoadIsConnector === true) return;
      existing.add(getDromapRoadFeatureSelectionId(feature, index));
    });
    return Array.from(existing);
  }
  const queries = command.roadQueries
    .map((query) => normalizeKey(query))
    .filter(Boolean);
  if (!queries.length) return Array.from(existing);
  features.forEach((feature, index) => {
    if (feature.properties?.__dromapRoadIsConnector === true) return;
    const haystack = getRoadFeatureSearchText(feature);
    if (queries.some((query) => haystack.includes(query))) {
      existing.add(getDromapRoadFeatureSelectionId(feature, index));
    }
  });
  return Array.from(existing);
}

export async function prepareDroMapAiAutomaticRouteWorkspaceProposal(
  commands: DroMapAiCommand[],
): Promise<DroMapAiAutomaticWorkspaceProposal | null> {
  const routeCommands = commands.filter((command) => command.type === "import_routes");
  if (!routeCommands.length) return null;
  const placeCache = new Map<string, PlaceSearchResult>();
  const bounds: BuildingSearchBounds[] = [];
  const labels: string[] = [];
  for (const command of routeCommands) {
    bounds.push(
      await resolveRouteSelectionBounds(command, placeCache, {
        preferWorkspace: false,
      }),
    );
    const explicitPlace = cleanString(command.place);
    if (explicitPlace) labels.push(explicitPlace);
    labels.push(...command.roadQueries.slice(0, 4));
  }
  const merged = mergeBuildingBounds(bounds);
  if (!merged) return null;
  const strictestCategories = routeCommands.flatMap(getRoadCommandCategories);
  const clamped = clampRoadBoundsToAllowedArea(merged, strictestCategories);
  return {
    bounds: clamped,
    label: Array.from(new Set(labels)).slice(0, 4).join(" · ") || "secteur utile aux routes demandées",
  };
}

export async function prepareDroMapAiRouteSelection(
  command: DroMapAiCommand,
  searchBoundsOverride?: DroMapAiBounds | null,
): Promise<DroMapAiRouteSelectionPreparation> {
  if (command.type !== "import_routes") {
    throw new Error("Cette étape n'est pas un import de routes.");
  }
  const categories = getRoadCommandCategories(command);
  const placeCache = new Map<string, PlaceSearchResult>();
  const bounds = searchBoundsOverride
    ? clampRoadBoundsToAllowedArea(normalizeBuildingBounds(searchBoundsOverride), categories)
    : await resolveRouteSelectionBounds(command, placeCache, { preferWorkspace: true });
  const analysis = await analyzeDromapRoads({ bounds, categories });
  const existingLayers = getDromapManagedRoadLayers();
  const suggestedFeatureIds = getRoadSuggestedSelectionIds(command, analysis.features);
  const warnings: string[] = [];
  if (command.roadSelectionMode === "named" && command.roadQueries.length && !suggestedFeatureIds.length) {
    warnings.push(
      "L’IA n’a pas retrouvé automatiquement les axes demandés. Le sélecteur reste ouvert sur toutes les routes analysées afin que tu puisses les choisir manuellement.",
    );
  }
  if (existingLayers.length) {
    warnings.push(
      "Les routes déjà présentes dans le calque Routes sont présélectionnées. Toute route que tu désélectionnes sera retirée de ce même calque à la validation.",
    );
  }
  return {
    commandId: command.id,
    features: analysis.features,
    bounds,
    categories,
    source: analysis.source,
    suggestedFeatureIds,
    hadExistingRoadLayer: existingLayers.length > 0,
    warnings,
  };
}

export function importDroMapAiSelectedRoutes(
  command: DroMapAiCommand,
  preparation: DroMapAiRouteSelectionPreparation,
  selectedFeatures: DromapRoadSelectionFeature[],
): DroMapAiRouteSelectionImportResult {
  if (command.type !== "import_routes") {
    throw new Error("Cette étape n'est pas un import de routes.");
  }
  const result = reconcileDromapRoadImport({
    features: selectedFeatures,
    source: preparation.source,
    categories: preparation.categories,
    mode: command.roadSelectionMode === "all" ? "all" : "selection",
    layerName: command.layerName,
  });
  return {
    selectedCount: result.selectedCount,
    layerName: result.layerName,
    categories: preparation.categories,
    removed: result.removed,
  };
}

export type DroMapAiAutomaticWorkspaceProposal = {
  bounds: DroMapAiBounds;
  label: string;
};

export async function prepareDroMapAiAutomaticWorkspaceProposal(
  commands: DroMapAiCommand[],
): Promise<DroMapAiAutomaticWorkspaceProposal | null> {
  const buildingCommands = commands.filter(
    (command) => command.type === "import_buildings",
  );
  if (!buildingCommands.length) return null;

  const placeCache = new Map<string, PlaceSearchResult>();
  const resolvedBounds: BuildingSearchBounds[] = [];
  const labels: string[] = [];

  for (const command of buildingCommands) {
    const resolved = await resolveInteractiveBuildingSelectionArea(
      command,
      placeCache,
    );
    resolvedBounds.push(resolved.bounds);
    const commandLabels = getRequestedBuildingQueries(command);
    const explicitPlace = cleanString(command.place);
    labels.push(...commandLabels);
    if (explicitPlace) labels.push(explicitPlace);
  }

  const merged = mergeBuildingBounds(resolvedBounds);
  if (!merged) return null;
  const proposal = padBuildingBounds(merged, 0.04);
  const uniqueLabels = Array.from(new Set(labels)).slice(0, 4);

  return {
    bounds: {
      south: proposal.south,
      west: proposal.west,
      north: proposal.north,
      east: proposal.east,
    },
    label: uniqueLabels.length
      ? uniqueLabels.join(" · ")
      : "secteur utile aux bâtiments demandés",
  };
}

export function stageDroMapAiWorkspaceProposalForReview(
  proposal: DroMapAiAutomaticWorkspaceProposal,
) {
  const normalized = normalizeWorkspaceBounds(
    { lat: proposal.bounds.south, lng: proposal.bounds.west },
    { lat: proposal.bounds.north, lng: proposal.bounds.east },
  );
  let workspaceStore = useEditorWorkspaceStore.getState();
  const restoreZoneLock = workspaceStore.workspaceZoneEditLocked;

  // La proposition IA doit pouvoir être revue/redessinée avant validation,
  // y compris lorsqu'un verrou d'interface est momentanément présent. Le
  // panneau restaure le verrou juste après la validation de cette étape.
  if (restoreZoneLock) {
    useEditorWorkspaceStore.setState({ workspaceZoneEditLocked: false });
    workspaceStore = useEditorWorkspaceStore.getState();
  }

  workspaceStore.setWorkspaceBounds(normalized);
  workspaceStore.modifyWorkspaceZone();
  fitDroMapAiMapBounds(proposal.bounds, {
    paddingPx: 44,
    maxZoom: 16,
    animate: false,
  });

  return { restoreZoneLock };
}

export function restoreDroMapAiWorkspaceZoneLock(restore: boolean) {
  if (!restore) return;
  useEditorWorkspaceStore.setState({ workspaceZoneEditLocked: true });
}

async function suggestBuildingsForInteractiveSelection(
  features: BuildingFeature[],
  targets: DroMapAiBuildingSelectionTarget[],
) {
  const selected = new Map<string, string>();

  for (const target of targets) {
    const scored = features
      .map((feature, index) => ({
        feature,
        index,
        id: getInteractiveBuildingSelectionId(feature, index),
        score: scoreBuildingForQuery(feature, target.query),
      }))
      .filter((entry) => entry.score >= 520)
      .sort((first, second) => second.score - first.score);

    if (scored.length) {
      const bestScore = scored[0].score;
      scored
        .filter((entry) => entry.score >= Math.max(520, bestScore - 35))
        .slice(0, 18)
        .forEach((entry) => {
          if (!selected.has(entry.id)) selected.set(entry.id, target.query);
        });
    }

    const compactBounds = target.bounds
      ? normalizeBuildingBounds(target.bounds)
      : null;
    if (compactBounds) {
      const size = buildingBoundsSizeMeters(compactBounds);
      if (Math.max(size.width, size.height) <= 1_400) {
        const padded = padBuildingBounds(compactBounds, 0.08);
        features
          .map((feature, index) => ({
            feature,
            index,
            id: getInteractiveBuildingSelectionId(feature, index),
            center: getBuildingCenter(feature),
          }))
          .filter(
            (entry) =>
              entry.center && buildingBoundsContainsPoint(padded, entry.center),
          )
          .slice(0, 80)
          .forEach((entry) => {
            if (!selected.has(entry.id)) selected.set(entry.id, target.query);
          });
      }
    }

    const nearby = features
      .map((feature, index) => {
        const center = getBuildingCenter(feature);
        return {
          feature,
          index,
          id: getInteractiveBuildingSelectionId(feature, index),
          distance: center
            ? distanceMeters(target.coordinate, center)
            : Number.POSITIVE_INFINITY,
        };
      })
      .filter((entry) => Number.isFinite(entry.distance))
      .sort((first, second) => first.distance - second.distance);

    if (nearby.length) {
      const nearestDistance = nearby[0].distance;
      const radius = Math.min(
        320,
        Math.max(
          suggestedBuildingRadiusMeters(target.query),
          nearestDistance + 55,
        ),
      );
      nearby
        .filter((entry) => entry.distance <= radius)
        .slice(0, 55)
        .forEach((entry) => {
          if (!selected.has(entry.id)) selected.set(entry.id, target.query);
        });
    }
  }

  return selected;
}

export async function prepareDroMapAiBuildingSelection(
  command: DroMapAiCommand,
  searchBoundsOverride?: DroMapAiBounds | null,
): Promise<DroMapAiBuildingSelectionPreparation> {
  if (command.type !== "import_buildings") {
    throw new Error("Cette étape n'est pas un import de bâtiments.");
  }

  const placeCache = new Map<string, PlaceSearchResult>();
  const warnings: string[] = [];
  const resolved = await resolveInteractiveBuildingSelectionArea(
    command,
    placeCache,
  );
  // En mode zone automatique guidée, la zone validée par l'utilisateur devient
  // la source de vérité pour la recherche des bâtiments. On conserve les cibles
  // sémantiques de la commande pour la présélection, mais on ne revient jamais
  // à l'emprise initialement suggérée par l'IA après une correction manuelle.
  const effectiveSearchBounds = searchBoundsOverride
    ? normalizeBuildingBounds(searchBoundsOverride)
    : resolved.bounds;
  // Le sélecteur Bâtiments classique de DroMap est conçu pour pouvoir
  // afficher jusqu’à 15 000 empreintes. L’ancienne phase IA imposait
  // artificiellement 6 000 par défaut, ce qui bloquait des zones que
  // l’outil manuel accepte normalement. La phase interactive utilise donc
  // la même limite haute que l’import classique ; le nombre réellement
  // importé reste entièrement contrôlé par la sélection de l’utilisateur.
  const maxFeatures = 15_000;
  const fetchedFeatures = await fetchBuildingsForArea(effectiveSearchBounds, maxFeatures);
  if (!fetchedFeatures.length) {
    throw new Error(
      "Aucun bâtiment exploitable n'a été trouvé dans la zone utile déterminée par l'IA.",
    );
  }
  const features = fetchedFeatures.map((feature, index) => {
    const selectionId = getInteractiveBuildingSelectionId(feature, index);
    if (!selectionId.startsWith("building-")) return feature;
    return {
      ...feature,
      id: `dromap-ai-${selectionId}`,
    };
  });

  const suggested =
    command.buildingSelectionMode === "all" &&
    resolved.queryTargets.length === 0
      ? new Map(
          features.map((feature, index) => [
            getInteractiveBuildingSelectionId(feature, index),
            "Tous les bâtiments de la zone",
          ]),
        )
      : await suggestBuildingsForInteractiveSelection(
          features,
          resolved.queryTargets,
        );
  const requestedQueries = getRequestedBuildingQueries(command);
  if (features.length >= maxFeatures) {
    warnings.push(
      `La zone contient au moins ${maxFeatures.toLocaleString("fr-FR")} bâtiments. La récupération a atteint la limite de sécurité ; si le bâtiment recherché n'apparaît pas, resserre la zone de recherche de cette étape.`,
    );
  }
  if (requestedQueries.length && !suggested.size) {
    warnings.push(
      "L'IA n'a pas pu présélectionner de bâtiment avec assez de confiance. Le sélecteur reste ouvert sur toute la zone utile pour que tu choisisses manuellement les bonnes emprises.",
    );
  }

  return {
    commandId: command.id,
    features,
    bounds: resolved.bounds,
    suggestedFeatureIds: Array.from(suggested.keys()),
    suggestedGroupByFeatureId: Object.fromEntries(suggested),
    queryTargets: resolved.queryTargets,
    warnings,
  };
}

function assignSelectedBuildingGroup(
  feature: BuildingFeature,
  index: number,
  preparation: DroMapAiBuildingSelectionPreparation,
) {
  const id = getInteractiveBuildingSelectionId(feature, index);
  const suggested = preparation.suggestedGroupByFeatureId[id];
  if (suggested) return suggested;
  if (preparation.queryTargets.length === 1) {
    return preparation.queryTargets[0].query;
  }
  const center = getBuildingCenter(feature);
  if (!center || !preparation.queryTargets.length) return "Bâtiments sélectionnés";
  return preparation.queryTargets
    .map((target) => ({
      query: target.query,
      distance: distanceMeters(center, target.coordinate),
    }))
    .sort((first, second) => first.distance - second.distance)[0].query;
}

export function importDroMapAiSelectedBuildings(
  command: DroMapAiCommand,
  preparation: DroMapAiBuildingSelectionPreparation,
  selectedFeatures: BuildingFeature[],
): DroMapAiBuildingSelectionImportResult {
  if (command.type !== "import_buildings") {
    throw new Error("Cette étape n'est pas un import de bâtiments.");
  }
  if (!selectedFeatures.length) {
    throw new Error("Sélectionne au moins un bâtiment avant de valider.");
  }

  const groups = new Map<string, BuildingFeature[]>();
  selectedFeatures.forEach((feature, index) => {
    const group = assignSelectedBuildingGroup(feature, index, preparation);
    groups.set(group, [...(groups.get(group) ?? []), feature]);
  });

  const createdFeatureIds: string[] = [];
  const createdGeoJsonLayerIds: string[] = [];
  const createdLayerNames: string[] = [];
  const groupSummaries: Array<{ label: string; count: number }> = [];
  const featuresToAdd: DroMapFeature[] = [];

  for (const [groupLabel, groupFeatures] of groups) {
    const baseLayerName = cleanString(command.layerName);
    const layerName =
      groups.size === 1 && baseLayerName
        ? baseLayerName
        : `Bâtiments — ${groupLabel}`;
    const temporaryGeoJsonLayer = parseGeoJsonTextToDromapGeoJsonLayer(
      JSON.stringify({ type: "FeatureCollection", features: groupFeatures }),
      {
        sourceName: "Bâtiments",
        layerName,
        existingLayerCount:
          useEditorGeoJsonLayersStore.getState().geoJsonLayers.length,
        precisionMode: "original",
        catalogDatasetId: `ai-building-selection:${command.id}:${normalizeKey(groupLabel)}:${Date.now()}`,
        sourceLabel: "IGN BD TOPO® / Overture Maps",
      },
    );

    if (command.buildingMode === "geojson") {
      useEditorGeoJsonLayersStore
        .getState()
        .addGeoJsonLayer(temporaryGeoJsonLayer);
      createdGeoJsonLayerIds.push(temporaryGeoJsonLayer.id);
      createdLayerNames.push(layerName);
      groupSummaries.push({ label: groupLabel, count: groupFeatures.length });
      continue;
    }

    const layerId = useEditorLayersStore.getState().createLayer(layerName);
    const converted = convertGeoJsonLayerToDromapFeatures(
      temporaryGeoJsonLayer,
      layerId,
    ).map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        geometryLocked: true,
        locked: false,
        meta: { version: 1 } as const,
      },
    }));
    if (!converted.length) {
      useEditorLayersStore.getState().deleteLayer(layerId);
      continue;
    }
    useEditorLayersStore.setState((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === layerId
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
      activeLayerId: layerId,
    }));
    featuresToAdd.push(...converted);
    createdFeatureIds.push(...converted.map((feature) => feature.id));
    createdLayerNames.push(layerName);
    groupSummaries.push({ label: groupLabel, count: converted.length });
  }

  if (featuresToAdd.length) {
    useEditorFeaturesStore.getState().addFeaturesWithHistory(featuresToAdd);
  }

  return {
    selectedCount: selectedFeatures.length,
    createdFeatureIds,
    createdGeoJsonLayerIds,
    createdLayerNames,
    groupSummaries,
  };
}

async function selectNamedBuildings(
  features: BuildingFeature[],
  queries: string[],
  placeCache: Map<string, PlaceSearchResult>,
  warnings: string[],
) {
  const selected = new Map<string, BuildingFeature>();
  const unresolved: string[] = [];

  for (const query of queries) {
    const scored = features
      .map((feature, index) => ({
        feature,
        index,
        score: scoreBuildingForQuery(feature, query),
      }))
      .filter((entry) => entry.score >= 520)
      .sort((first, second) => second.score - first.score);

    if (scored.length) {
      const bestScore = scored[0].score;
      const matches = scored
        .filter((entry) => entry.score >= Math.max(520, bestScore - 25))
        .slice(0, 12);
      for (const match of matches) {
        selected.set(getBuildingFeatureKey(match.feature, match.index), match.feature);
      }
      continue;
    }

    try {
      const place = await searchPlace(query, placeCache);
      const point = { lng: place.lng, lat: place.lat };
      const containing = features.filter((feature) =>
        pointInBuildingGeometry(point, feature.geometry),
      );
      if (containing.length) {
        containing.slice(0, 12).forEach((feature, index) => {
          selected.set(getBuildingFeatureKey(feature, index), feature);
        });
        continue;
      }

      const nearest = features
        .map((feature, index) => {
          const center = getBuildingCenter(feature);
          return {
            feature,
            index,
            distance: center ? distanceMeters(point, center) : Number.POSITIVE_INFINITY,
          };
        })
        .sort((first, second) => first.distance - second.distance)[0];
      if (nearest && nearest.distance <= 450) {
        selected.set(getBuildingFeatureKey(nearest.feature, nearest.index), nearest.feature);
        continue;
      }
    } catch {
      // La cible est ajoutée à la liste des éléments non résolus ci-dessous.
    }

    unresolved.push(query);
  }

  if (unresolved.length) {
    warnings.push(
      `Bâtiments introuvables ou trop ambigus : ${unresolved.join(", ")}. Aucun bâtiment aléatoire n'a été ajouté pour ces cibles.`,
    );
  }

  return Array.from(selected.values());
}

function buildingCommandHasIndependentSearchArea(command: DroMapAiCommand) {
  return Boolean(
    command.bounds ||
      cleanString(command.place) ||
      getRequestedBuildingQueries(command).length > 0,
  );
}

async function importBuildings(
  command: DroMapAiCommand,
  aliases: Map<string, string>,
  warnings: string[],
  placeCache: Map<string, PlaceSearchResult>,
) {
  const maxFeatures = Math.round(
    clamp(
      command.maxFeatures ?? (command.buildingMode === "dromap" ? 1200 : 60000),
      1,
      command.buildingMode === "dromap" ? 5000 : 100000,
    ),
  );
  const searchAreas = await resolveBuildingSearchAreas(command, placeCache);
  const allFeatures = new Map<string, BuildingFeature>();

  for (const area of searchAreas) {
    const fetched = await fetchBuildingsForArea(area, maxFeatures);
    fetched.forEach((feature, index) => {
      allFeatures.set(getBuildingFeatureKey(feature, index), feature);
    });
    if (allFeatures.size >= maxFeatures) break;
  }

  const availableFeatures = Array.from(allFeatures.values());
  if (!availableFeatures.length) {
    throw new Error("Aucun bâtiment exploitable n'a été trouvé dans la zone recherchée.");
  }

  const queries = getRequestedBuildingQueries(command);
  const selectionMode =
    command.buildingSelectionMode ?? (queries.length ? "named" : "all");
  const selectedFeatures =
    selectionMode === "named"
      ? await selectNamedBuildings(
          availableFeatures,
          queries,
          placeCache,
          warnings,
        )
      : availableFeatures;
  const features = selectedFeatures.slice(0, maxFeatures);

  if (!features.length) {
    throw new Error(
      selectionMode === "named"
        ? "Aucun des bâtiments demandés n'a pu être identifié dans les données IGN/Overture de la zone."
        : "Aucun bâtiment exploitable n'a été trouvé.",
    );
  }

  if (selectedFeatures.length > features.length) {
    warnings.push(
      `${selectedFeatures.length - features.length} bâtiment(s) n'ont pas été importés pour respecter la limite maxFeatures=${maxFeatures}.`,
    );
  }

  const unnamedBuildingCount = features.filter(
    (feature) => !hasProperBuildingName(feature),
  ).length;
  if (unnamedBuildingCount > 0) {
    warnings.push(
      `${unnamedBuildingCount} bâtiment${unnamedBuildingCount > 1 ? "s restent" : " reste"} sans nom propre après croisement IGN, OpenStreetMap et Overture Maps Places. Une recherche supplémentaire par coordonnées est proposée dans l'outil Bâtiments ; elle n'est jamais lancée sans l'accord de l'utilisateur.`,
    );
  }

  const geoStore = useEditorGeoJsonLayersStore.getState();
  const layer = parseGeoJsonTextToDromapGeoJsonLayer(
    JSON.stringify({ type: "FeatureCollection", features }),
    {
      sourceName: "Bâtiments",
      layerName:
        cleanString(command.layerName) ??
        (selectionMode === "named" ? "Bâtiments sélectionnés par l'IA" : "Bâtiments"),
      existingLayerCount: geoStore.geoJsonLayers.length,
      precisionMode: "original",
      catalogDatasetId: `ai-buildings:${Date.now()}`,
      sourceLabel: "IGN BD TOPO® / Overture Maps",
    },
  );

  if (command.buildingMode !== "dromap") {
    geoStore.addGeoJsonLayer(layer);
    aliases.set(command.id, layer.id);
    return { layer, features: [] as DroMapFeature[] };
  }

  const layerId = useEditorLayersStore
    .getState()
    .createLayer(
      cleanString(command.layerName) ??
        (selectionMode === "named"
          ? "Bâtiments sélectionnés éditables"
          : "Bâtiments éditables individuellement"),
    );
  const dromapFeatures = convertGeoJsonLayerToDromapFeatures(layer, layerId)
    .slice(0, maxFeatures)
    .map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        geometryLocked: true,
        locked: false,
        meta: { version: 1 } as const,
      },
    }));
  useEditorFeaturesStore.getState().addFeaturesWithHistory(dromapFeatures);
  aliases.set(command.id, layerId);
  if (features.length > dromapFeatures.length) {
    warnings.push(
      `${features.length - dromapFeatures.length} bâtiment(s) n'ont pas été transformés pour respecter la limite demandée.`,
    );
  }
  return { layer: null, features: dromapFeatures };
}

function workspaceBoundsAreEqual(
  first: WorkspaceBounds,
  second: WorkspaceBounds,
) {
  return (
    first.southWest.lat === second.southWest.lat &&
    first.southWest.lng === second.southWest.lng &&
    first.northEast.lat === second.northEast.lat &&
    first.northEast.lng === second.northEast.lng
  );
}

export async function executeDroMapAiPlan(
  plan: DroMapAiPlan,
  options: {
    workspaceMode?: DroMapAiWorkspaceMode;
    executionMode?: "apply" | "preview";
  } = {},
): Promise<DroMapAiExecutionResult> {
  const workspaceMode = options.workspaceMode ?? "manual";
  const executionMode = options.executionMode ?? "apply";

  if (activePreviewSnapshot) {
    throw new Error(
      "Un aperçu IA temporaire est déjà actif. Valide-le ou quitte-le avant de relancer le plan.",
    );
  }
  const initialWorkspaceState = useEditorWorkspaceStore.getState();
  const initialMode = useEditorModeStore.getState().currentMode;
  const snapshot = captureSnapshot();

  if (
    workspaceMode === "manual" &&
    (initialMode !== "edit" || !initialWorkspaceState.workspaceBounds)
  ) {
    throw new Error(
      "Sélectionne puis valide une zone de travail avant d'utiliser le mode manuel de l'assistant IA.",
    );
  }

  const initialWorkspaceBounds = initialWorkspaceState.workspaceBounds
    ? structuredClone(initialWorkspaceState.workspaceBounds)
    : null;

  if (workspaceMode === "automatic" && initialWorkspaceState.workspaceBounds) {
    useEditorWorkspaceStore.getState().clearWorkspaceBounds();
  }
  const previousSnapshot = lastSuccessfulSnapshot;
  const aliases = new Map<string, string>();
  const placeCache = new Map<string, PlaceSearchResult>();
  const directWorkspaceCommandTypes = new Set<DroMapAiCommand["type"]>([
    "set_workspace_by_place",
    "set_workspace_bounds",
    "select_world",
  ]);
  const hasDirectWorkspaceCommand = plan.commands.some((command) =>
    directWorkspaceCommandTypes.has(command.type),
  );

  if (
    workspaceMode === "manual" &&
    initialWorkspaceBounds &&
    !hasDirectWorkspaceCommand
  ) {
    // Vérification avant toute mutation : une carte dense ne doit jamais être
    // partiellement créée puis annulée parce qu'un établissement est hors zone.
    await assertAiMarkersInsideManualWorkspace(
      plan,
      initialWorkspaceBounds,
      placeCache,
    );
  }

  const warnings = [...plan.warnings];
  const createdFeatures: DroMapFeature[] = [];
  const createdGeoJsonLayerIds: string[] = [];
  let lastLegendCandidateFeatures: DroMapFeature[] = [];
  let appliedCommandCount = 0;
  let featureHistoryCommitted = false;

  const ensureFeatureHistory = () => {
    if (!featureHistoryCommitted) {
      useEditorFeaturesStore.getState().commitFeaturesHistory();
      featureHistoryCommitted = true;
    }
  };

  try {
    useEditorToolStore.getState().resetActiveTool();
    useEditorSelectionStore.getState().clearSelectedFeatureId();

    const legendCommandTypes = new Set<DroMapAiCommand["type"]>([
      "configure_legend",
      "configure_map_title",
      "align_legend_sizes_with_map",
      "configure_basemap_render",
      "configure_scale",
      "configure_north_arrow",
      "configure_map_labels",
      "add_manual_legend_entry",
      "update_manual_legend_entry",
      "delete_manual_legend_entry",
      "configure_legend_group",
      "configure_feature_legend",
    ]);
    const previewCommands = plan.commands.filter(
      (command) => command.type === "open_export_preview",
    );
    const legendCommands = plan.commands.filter((command) =>
      legendCommandTypes.has(command.type),
    );
    const viewCommands = plan.commands.filter(
      (command) => command.type === "fit_view",
    );
    const directWorkspaceCommands = plan.commands.filter((command) =>
      directWorkspaceCommandTypes.has(command.type),
    );
    const objectAndDataCommands = plan.commands.filter(
      (command) =>
        command.type !== "open_export_preview" &&
        command.type !== "fit_view" &&
        !directWorkspaceCommandTypes.has(command.type) &&
        !legendCommandTypes.has(command.type),
    );
    const workspaceWasAvailableAtStart = Boolean(
      useEditorWorkspaceStore.getState().workspaceBounds,
    );
    const workspaceDependentCommands = objectAndDataCommands.filter(
      (command) =>
        command.type === "import_buildings" &&
        !workspaceWasAvailableAtStart &&
        !buildingCommandHasIndependentSearchArea(command),
    );
    const workspaceDependentCommandSet = new Set(workspaceDependentCommands);
    const preWorkspaceCommands = objectAndDataCommands.filter(
      (command) => !workspaceDependentCommandSet.has(command),
    );
    const orderedCommands = [
      ...directWorkspaceCommands,
      ...preWorkspaceCommands,
      ...workspaceDependentCommands,
      ...viewCommands,
      ...legendCommands,
      ...previewCommands,
    ];
    const finalPhaseCommandSet = new Set([
      ...viewCommands,
      ...legendCommands,
      ...previewCommands,
    ]);
    let automaticWorkspaceEstablished = false;
    let automaticWorkspaceFinalized = false;

    const establishAutomaticWorkspace = async () => {
      const bounds = await deriveAutomaticWorkspaceBounds({
        plan,
        createdFeatures,
        createdGeoJsonLayerIds,
        placeCache,
      });
      if (!bounds) {
        throw new Error(
          "DroMap n'a pas pu calculer une zone automatique : aucun élément géographique exploitable n'a été créé.",
        );
      }
      applyAutomaticWorkspace(
        bounds,
        createdFeatures.map((feature) => feature.id),
      );
      automaticWorkspaceEstablished = true;
    };

    for (const command of orderedCommands) {
      if (
        workspaceMode === "automatic" &&
        workspaceDependentCommandSet.has(command) &&
        !automaticWorkspaceEstablished
      ) {
        await establishAutomaticWorkspace();
      }

      if (
        workspaceMode === "automatic" &&
        finalPhaseCommandSet.has(command) &&
        !automaticWorkspaceFinalized
      ) {
        await establishAutomaticWorkspace();
        automaticWorkspaceFinalized = true;
      }
      switch (command.type) {
        case "set_workspace_by_place":
        case "set_workspace_bounds":
        case "select_world": {
          await applyDirectWorkspaceCommand(command, placeCache);
          automaticWorkspaceEstablished = true;
          automaticWorkspaceFinalized = true;
          break;
        }
        case "fit_view": {
          if (command.bounds)
            fitDroMapAiMapBounds(command.bounds, {
              maxZoom: command.zoom ?? 13,
            });
          else if (command.coordinate)
            flyDroMapAiMapTo(command.coordinate, command.zoom);
          else {
            const selected = hasSelectorConstraint(command.selector)
              ? selectFeatures(command.selector)
              : createdFeatures;
            const bounds = getFeatureBounds(selected);
            if (bounds)
              fitDroMapAiMapBounds(bounds, { maxZoom: command.zoom ?? 13 });
            else warnings.push("Aucun objet disponible pour recadrer la vue.");
          }
          break;
        }
        case "set_basemap":
          warnings.push(
            "Le changement de fond demandé par un ancien plan IA a été ignoré : l’IA peut conseiller un fond, mais ne le modifie plus elle-même.",
          );
          break;
        case "set_country_neighbors":
          if (command.active !== null)
            useEditorBasemapStore
              .getState()
              .setShowCountryNeighborContext(command.active);
          break;
        case "create_layer": {
          const name = cleanString(command.layerName) ?? "Calque IA";
          const id = useEditorLayersStore.getState().createLayer(name);
          aliases.set(command.id, id);
          aliases.set(name, id);
          break;
        }
        case "set_active_layer":
          useEditorLayersStore
            .getState()
            .setActiveLayerId(resolveLayerId(command.layerRef, aliases));
          break;
        case "configure_layer":
          configureLayer(command, aliases);
          break;
        case "reorder_layer":
          useEditorLayersStore
            .getState()
            .moveLayer(
              resolveLayerId(command.layerRef, aliases),
              command.layerDirection ?? "up",
            );
          break;
        case "delete_layer": {
          const id = resolveLayerId(command.layerRef, aliases);
          const features = useEditorFeaturesStore
            .getState()
            .features.filter((feature) => feature.properties.layerId === id);
          const deletable = features.filter(
            (feature) =>
              !isFeatureEffectivelyLocked(
                feature,
                useEditorLayersStore.getState().layers,
              ),
          );
          if (deletable.length)
            useEditorFeaturesStore
              .getState()
              .removeFeaturesWithHistory(
                deletable.map((feature) => feature.id),
              );
          useEditorLayersStore.getState().deleteLayer(id);
          break;
        }
        case "import_geojson_catalog": {
          const layer = await importCatalogLayer(command, aliases);
          createdGeoJsonLayerIds.push(layer.id);
          break;
        }
        case "import_geojson_url": {
          const layer = await importUrlLayer(command, aliases);
          createdGeoJsonLayerIds.push(layer.id);
          break;
        }
        case "create_geojson_layer": {
          const layer = createInlineGeoJsonLayer(command, aliases);
          createdGeoJsonLayerIds.push(layer.id);
          break;
        }
        case "configure_geojson_layer":
          configureGeoJsonLayer(command, aliases);
          break;
        case "reorder_geojson_layer":
          useEditorGeoJsonLayersStore
            .getState()
            .moveGeoJsonLayer(
              resolveGeoJsonLayerId(
                command.geoJsonLayerRef ?? command.layerRef,
                aliases,
              ),
              command.layerDirection ?? "up",
            );
          break;
        case "delete_geojson_layer":
          useEditorGeoJsonLayersStore
            .getState()
            .removeGeoJsonLayer(
              resolveGeoJsonLayerId(
                command.geoJsonLayerRef ?? command.layerRef,
                aliases,
              ),
            );
          break;
        case "convert_geojson_to_dromap": {
          lastLegendCandidateFeatures = [];
          const geoId = resolveGeoJsonLayerId(
            command.geoJsonLayerRef ?? command.layerRef,
            aliases,
          );
          const geoStore = useEditorGeoJsonLayersStore.getState();
          const source = geoStore.geoJsonLayers.find(
            (layer) => layer.id === geoId,
          );
          if (!source) throw new Error("Calque GeoJSON source introuvable.");
          const layerId = useEditorLayersStore
            .getState()
            .createLayer(cleanString(command.layerName) ?? source.name);
          const features = convertGeoJsonLayerToDromapFeatures(
            source,
            layerId,
          ).map((feature) => ({
            ...feature,
            properties: {
              ...feature.properties,
              locked: false,
              lockOverride: "unlocked" as const,
              meta: { version: 1 } as const,
            },
          }));
          useEditorFeaturesStore
            .getState()
            .addFeaturesWithHistory(features);
          aliases.set(command.id, layerId);
          createdFeatures.push(...features);
          lastLegendCandidateFeatures = [...features];
          break;
        }
        case "convert_dromap_to_geojson": {
          const layerId = resolveLayerId(command.layerRef, aliases);
          const layer = useEditorLayersStore
            .getState()
            .layers.find((candidate) => candidate.id === layerId);
          const features = useEditorFeaturesStore
            .getState()
            .features.filter(
              (feature) => feature.properties.layerId === layerId,
            );
          if (!layer || !canConvertDromapLayerToGeoJsonLayer(features))
            throw new Error("Calque DroMap non convertible.");
          if (
            !features.every(
              (feature) => feature.properties.source?.type === "geojson",
            )
          ) {
            throw new Error(
              "Par sécurité, seul un calque provenant initialement d'un GeoJSON peut revenir en GeoJSON léger.",
            );
          }
          const geo = convertDromapLayerToGeoJsonLayer({
            layer,
            features,
            existingGeoJsonLayerCount:
              useEditorGeoJsonLayersStore.getState().geoJsonLayers.length,
          });
          useEditorGeoJsonLayersStore.getState().addGeoJsonLayer(geo);
          createdGeoJsonLayerIds.push(geo.id);
          break;
        }
        case "import_buildings": {
          lastLegendCandidateFeatures = [];
          const result = await importBuildings(
            command,
            aliases,
            warnings,
            placeCache,
          );
          if (result.layer) createdGeoJsonLayerIds.push(result.layer.id);
          createdFeatures.push(...result.features);
          lastLegendCandidateFeatures = [...result.features];
          break;
        }
        case "create_custom_marker_svg":
          createCustomMarkerSvg(command, aliases);
          break;
        case "delete_custom_marker": {
          const ref =
            cleanString(command.customMarkerRef) ?? cleanString(command.label);
          if (!ref)
            throw new Error("Référence de marqueur personnalisé manquante.");
          const marker = useEditorCustomMarkersStore
            .getState()
            .customMarkers.find(
              (candidate) =>
                candidate.id === ref ||
                normalizeKey(candidate.name) === normalizeKey(ref),
            );
          if (!marker)
            warnings.push(`Marqueur personnalisé introuvable : ${ref}.`);
          else
            useEditorCustomMarkersStore
              .getState()
              .removeCustomMarker(marker.id);
          break;
        }
        case "create_marker":
        case "create_text": {
          lastLegendCandidateFeatures = [];
          const point = await resolvePoint(command, placeCache);
          const feature = createPointFeature(
            command,
            point,
            resolveLayerId(command.layerRef, aliases),
            aliases,
          );
          ensureFeatureHistory();
          useEditorFeaturesStore.getState().addFeature(feature);
          createdFeatures.push(feature);
          lastLegendCandidateFeatures = [feature];
          aliases.set(command.id, feature.id);
          break;
        }
        case "create_line": {
          lastLegendCandidateFeatures = [];
          const feature = createLineFeature(
            command,
            await resolvePathCoordinates(command, placeCache),
            resolveLayerId(command.layerRef, aliases),
          );
          ensureFeatureHistory();
          useEditorFeaturesStore.getState().addFeature(feature);
          createdFeatures.push(feature);
          lastLegendCandidateFeatures = [feature];
          aliases.set(command.id, feature.id);
          break;
        }
        case "create_zone": {
          lastLegendCandidateFeatures = [];
          const points = command.rings[0]?.length
            ? command.rings[0]
            : await resolvePathCoordinates(command, placeCache);
          const feature = createZoneFeature(
            command,
            points,
            resolveLayerId(command.layerRef, aliases),
          );
          ensureFeatureHistory();
          useEditorFeaturesStore.getState().addFeature(feature);
          createdFeatures.push(feature);
          lastLegendCandidateFeatures = [feature];
          aliases.set(command.id, feature.id);
          break;
        }
        case "create_shape": {
          lastLegendCandidateFeatures = [];
          const center =
            command.coordinate ?? (await resolvePoint(command, placeCache));
          const derived = { ...command, zoneVariant: "shape" as const };
          const feature = createZoneFeature(
            derived,
            shapeRing(command, center),
            resolveLayerId(command.layerRef, aliases),
          );
          ensureFeatureHistory();
          useEditorFeaturesStore.getState().addFeature(feature);
          createdFeatures.push(feature);
          lastLegendCandidateFeatures = [feature];
          aliases.set(command.id, feature.id);
          break;
        }
        case "fill_boundary": {
          lastLegendCandidateFeatures = [];
          const feature = await createBoundaryFillFeature(
            command,
            aliases,
            placeCache,
          );
          ensureFeatureHistory();
          useEditorFeaturesStore.getState().addFeature(feature);
          createdFeatures.push(feature);
          lastLegendCandidateFeatures = [feature];
          aliases.set(command.id, feature.id);
          break;
        }
        case "create_proportional_markers": {
          lastLegendCandidateFeatures = [];
          const features = await createProportionalMarkers(
            command,
            aliases,
            placeCache,
            ensureFeatureHistory,
          );
          createdFeatures.push(...features);
          lastLegendCandidateFeatures = [...features];
          break;
        }
        case "create_proportional_flows": {
          lastLegendCandidateFeatures = [];
          const features = await createProportionalFlows(
            command,
            aliases,
            placeCache,
            ensureFeatureHistory,
          );
          createdFeatures.push(...features);
          lastLegendCandidateFeatures = [...features];
          break;
        }
        case "create_choropleth": {
          const layer = await createChoropleth(command, aliases);
          createdGeoJsonLayerIds.push(layer.id);
          break;
        }
        case "update_features":
          applyFeatureUpdate(command, warnings, ensureFeatureHistory, aliases);
          break;
        case "duplicate_features": {
          lastLegendCandidateFeatures = [];
          const selected = selectFeatures(command.selector);
          const layers = useEditorLayersStore.getState().layers;
          const workspace =
            useEditorWorkspaceStore.getState().workspaceBounds;
          const copies = selected
            .filter(
              (feature) =>
                !feature.properties.geometryLocked &&
                !isFeatureEffectivelyLocked(feature, layers),
            )
            .map((feature) => duplicateDroMapFeature(feature, workspace));
          if (copies.length) {
            ensureFeatureHistory();
            useEditorFeaturesStore
              .getState()
              .addFeaturesWithHistory(copies);
            createdFeatures.push(...copies);
            lastLegendCandidateFeatures = [...copies];
          }
          break;
        }
        case "reorder_features": {
          const selected = selectFeatures(command.selector);
          const action =
            command.layerDirection === "down"
              ? "send-backward"
              : "bring-forward";
          selected.forEach((feature) =>
            useEditorFeaturesStore
              .getState()
              .reorderFeatureWithHistory(feature.id, action),
          );
          break;
        }
        case "delete_features":
          applyFeatureDeletion(command, warnings, ensureFeatureHistory);
          break;
        case "configure_legend":
          configureLegend(command);
          break;
        case "configure_map_title":
          configureMapTitle(command);
          break;
        case "align_legend_sizes_with_map":
          alignLegendSizesWithMap();
          break;
        case "configure_basemap_render":
          configureBasemapRender(command);
          break;
        case "add_manual_legend_entry": {
          const id = addManualLegendEntry(command, warnings);
          if (id) {
            aliases.set(command.id, id);
          }
          break;
        }
        case "update_manual_legend_entry": {
          const id =
            aliases.get(command.manualLegendEntryId ?? "") ??
            command.manualLegendEntryId;
          if (!id) throw new Error("Identifiant d'entrée manuelle manquant.");
          const style = stylePatchToFeatureStyle(command.style);
          useEditorExportStore.getState().updateCustomLegendEntry(id, {
            ...(command.label ? { label: command.label } : {}),
            ...(command.section ? { section: command.section } : {}),
            ...(command.manualLegendSymbol
              ? { symbol: command.manualLegendSymbol }
              : {}),
            symbolStyle: {
              kind: command.manualLegendSymbol ?? undefined,
              size: style.markerSize ?? style.fontSize,
              color: style.color,
              fillColor: style.fillColor,
              fillOpacity: style.fillOpacity,
              weight: style.weight,
              dashStyle: style.dashStyle,
              markerSymbolId: command.symbolId ?? undefined,
            },
          });
          break;
        }
        case "delete_manual_legend_entry": {
          const id =
            aliases.get(command.manualLegendEntryId ?? "") ??
            command.manualLegendEntryId;
          if (id)
            useEditorExportStore.getState().removeCustomLegendEntry(id);
          break;
        }
        case "configure_feature_legend": {
          configureFeatureLegend(command, aliases, lastLegendCandidateFeatures);
          break;
        }
        case "configure_legend_group": {
          const key = cleanString(command.legendGroupKey);
          if (!key)
            throw new Error("configure_legend_group exige legendGroupKey.");
          const store = useEditorExportStore.getState();
          if (command.label !== null)
            store.setLegendGroupLabel(key, command.label);
          if (command.section !== null)
            store.setLegendGroupSection(key, command.section);
          if (command.hidden !== null) {
            const isHidden = store.hiddenLegendGroupKeys.includes(key);
            if (command.hidden !== isHidden)
              store.toggleLegendGroupVisibility(key);
          }
          if (command.orderRefs.length)
            store.setLegendGroupOrder(
              command.orderRefs.map((ref) => aliases.get(ref) ?? ref),
            );
          break;
        }
        case "configure_scale": {
          const store = useEditorExportStore.getState();
          if (command.active !== null) store.setScaleBarEnabled(command.active);
          if (command.scaleStyle !== null)
            store.setScaleBarStyle(command.scaleStyle);
          if (command.scalePosition !== null)
            store.setScaleBarPosition(command.scalePosition);
          if (command.scaleMapPosition !== null)
            store.setScaleBarMapPosition(command.scaleMapPosition);
          break;
        }
        case "configure_north_arrow": {
          const store = useEditorExportStore.getState();
          if (command.active !== null)
            store.setNorthArrowEnabled(command.active);
          if (command.northStyle !== null)
            store.setNorthArrowStyle(command.northStyle);
          if (command.northPosition !== null)
            store.setNorthArrowPosition(command.northPosition);
          if (command.northMapPosition !== null)
            store.setNorthArrowMapPosition(command.northMapPosition);
          break;
        }
        case "configure_map_labels": {
          const store = useEditorMapLabelsStore.getState();
          if (command.allMapLabelsEnabled !== null) {
            store.setShowAllFeatureLabels(command.allMapLabelsEnabled);
          }
          if (command.geoJsonMapLabelsEnabled !== null) {
            store.setShowAllGeoJsonFeatureLabels(
              command.geoJsonMapLabelsEnabled,
            );
          } else if (command.mapLabelsEnabled !== null) {
            // Compatibilité avec les anciens plans IA : l'ancien champ visait
            // historiquement les étiquettes GeoJSON.
            store.setShowAllGeoJsonFeatureLabels(command.mapLabelsEnabled);
          }
          if (command.mapLabelScale !== null) {
            store.setFeatureMapLabelScale(command.mapLabelScale);
          }
          break;
        }
        case "select_feature": {
          let id = aliases.get(command.layerRef ?? "") ?? null;
          if (!id && hasSelectorConstraint(command.selector))
            id = selectFeatures(command.selector)[0]?.id ?? null;
          if (id)
            useEditorSelectionStore
              .getState()
              .setSelectedFeatureId(id, { focusOnMap: true });
          else warnings.push("Aucun objet n'a pu être sélectionné.");
          break;
        }
        case "clear_selection":
          useEditorSelectionStore.getState().clearSelectedFeatureId();
          break;
        case "open_export_preview":
          if (executionMode === "apply") {
            useEditorExportStore.getState().openExportPanel();
          }
          break;
      }
      appliedCommandCount += 1;
    }

    if (workspaceMode === "automatic" && !automaticWorkspaceFinalized) {
      await establishAutomaticWorkspace();
      automaticWorkspaceFinalized = true;
    }

    const finalWorkspaceState = useEditorWorkspaceStore.getState();
    const finalMode = useEditorModeStore.getState().currentMode;
    if (workspaceMode === "manual") {
      if (finalMode !== "edit" || !finalWorkspaceState.workspaceBounds) {
        throw new Error(
          "La zone de travail n’a pas pu être finalisée correctement par le plan IA.",
        );
      }
      if (
        !hasDirectWorkspaceCommand &&
        initialWorkspaceBounds &&
        !workspaceBoundsAreEqual(
          initialWorkspaceBounds,
          finalWorkspaceState.workspaceBounds,
        )
      ) {
        throw new Error(
          "La zone manuelle a changé sans commande de zone explicite. L’opération a été annulée.",
        );
      }
    } else if (finalMode !== "edit" || !finalWorkspaceState.workspaceBounds) {
      throw new Error(
        "La zone automatique n'a pas pu être finalisée autour des éléments créés.",
      );
    }

    const result: DroMapAiExecutionResult = {
      appliedCommandCount,
      createdFeatureIds: createdFeatures.map((feature) => feature.id),
      createdGeoJsonLayerIds,
      warnings,
    };

    if (executionMode === "preview") {
      activePreviewSnapshot = snapshot;
      activePreviewPreviousUndoSnapshot = previousSnapshot;
      activePreviewResult = result;
      lastSuccessfulSnapshot = previousSnapshot;
    } else {
      lastSuccessfulSnapshot = snapshot;
    }

    return result;
  } catch (error) {
    restoreSnapshot(snapshot);
    lastSuccessfulSnapshot = previousSnapshot;
    throw error;
  }
}

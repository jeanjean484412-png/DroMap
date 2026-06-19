import { create } from "zustand";

import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import {
  getWorkspaceObjectLoadingBounds,
  loadingBoundsIntersect,
  type DromapLoadingBounds,
} from "@/lib/dromap/workspace-object-loading";

export type DromapGeoJsonLayerDashStyle = "solid" | "dashed" | "dotted";
export type DromapGeoJsonPrecisionMode = "original" | "intermediate" | "light";

export type DromapGeoJsonLayerStyle = {
  strokeColor: string;
  strokeWeight: number;
  strokeOpacity: number;
  fillColor: string;
  fillOpacity: number;
  markerSize: number;
  dashStyle: DromapGeoJsonLayerDashStyle;
};

export type DromapGeoJsonLayer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  sourceName?: string | null;
  sourceSavedLayerId?: string;
  featureCount: number;
  coordinateCount: number;
  skippedGeometries: number;
  bounds: WorkspaceBounds | null;
  precisionMode: DromapGeoJsonPrecisionMode;
  style: DromapGeoJsonLayerStyle;
  data: DromapGeoJsonFeatureCollection;
};

export type DromapGeoJsonPoint = {
  type: "Point";
  coordinates: [number, number];
};

export type DromapGeoJsonMultiPoint = {
  type: "MultiPoint";
  coordinates: [number, number][];
};

export type DromapGeoJsonLineString = {
  type: "LineString";
  coordinates: [number, number][];
};

export type DromapGeoJsonMultiLineString = {
  type: "MultiLineString";
  coordinates: [number, number][][];
};

export type DromapGeoJsonPolygon = {
  type: "Polygon";
  coordinates: [number, number][][];
};

export type DromapGeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: [number, number][][][];
};

export type DromapGeoJsonGeometry =
  | DromapGeoJsonPoint
  | DromapGeoJsonMultiPoint
  | DromapGeoJsonLineString
  | DromapGeoJsonMultiLineString
  | DromapGeoJsonPolygon
  | DromapGeoJsonMultiPolygon;

export type DromapGeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  geometry: DromapGeoJsonGeometry;
  properties: Record<string, unknown>;
};

export type DromapGeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: DromapGeoJsonFeature[];
};

export type DromapSavedGeoJsonLayer = {
  id: string;
  name: string;
  savedAt: string;
  layer: DromapGeoJsonLayer;
};

const GEOJSON_LAYER_ORDER_STEP = 1000;
const DROMAP_SAVED_GEOJSON_LAYERS_STORAGE_KEY = "dromap-editor-test-saved-geojson-layers-v1";
const DEFAULT_GEOJSON_LAYER_STYLE: DromapGeoJsonLayerStyle = {
  strokeColor: "#000000",
  strokeWeight: 2,
  strokeOpacity: 1,
  fillColor: "#000000",
  fillOpacity: 0,
  markerSize: 18,
  dashStyle: "solid",
};

type EditorTestGeoJsonLayersState = {
  geoJsonLayers: DromapGeoJsonLayer[];
  setGeoJsonLayers: (layers: DromapGeoJsonLayer[]) => void;
  addGeoJsonLayer: (layer: DromapGeoJsonLayer) => void;
  removeGeoJsonLayer: (layerId: string) => void;
  renameGeoJsonLayer: (layerId: string, name: string) => void;
  toggleGeoJsonLayerVisibility: (layerId: string) => void;
  setGeoJsonLayerOpacity: (layerId: string, opacity: number) => void;
  setGeoJsonLayerPrecisionMode: (layerId: string, mode: DromapGeoJsonPrecisionMode) => void;
  toggleGeoJsonLayerLocked: (layerId: string) => void;
  moveGeoJsonLayer: (layerId: string, direction: "up" | "down") => void;
  updateGeoJsonLayerStyle: (
    layerId: string,
    patch: Partial<DromapGeoJsonLayerStyle>,
  ) => void;
  clearGeoJsonLayers: () => void;

  savedGeoJsonLayers: DromapSavedGeoJsonLayer[];
  loadSavedGeoJsonLayersFromStorage: () => void;
  saveGeoJsonLayerToLibrary: (savedLayer: DromapSavedGeoJsonLayer) => void;
  renameSavedGeoJsonLayer: (savedLayerId: string, name: string) => void;
  deleteSavedGeoJsonLayer: (savedLayerId: string) => void;
};

function nowIso() {
  return new Date().toISOString();
}

function createSavedGeoJsonLayerId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `dromap-saved-geojson-layer-${crypto.randomUUID()}`;
  }

  return `dromap-saved-geojson-layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createGeoJsonLayerId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `dromap-geojson-layer-${crypto.randomUUID()}`;
  }

  return `dromap-geojson-layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneJsonValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function clampOpacity(value: number) {
  return clamp(value, 0, 1);
}

function normalizeName(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordValue(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function parseNumberLike(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function parseStringLike(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function parseCoordinatePosition(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const lng = value[0];
  const lat = value[1];

  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat)
  ) {
    return null;
  }

  return [clamp(lng, -360, 360), clamp(lat, -85.05112878, 85.05112878)];
}

function parseLineCoordinates(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const coordinates = value
    .map(parseCoordinatePosition)
    .filter((coordinate): coordinate is [number, number] => coordinate !== null);

  return coordinates.length >= 2 ? coordinates : null;
}

function parsePolygonCoordinates(value: unknown): [number, number][][] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const rings = value
    .map((ring) => (Array.isArray(ring) ? parseLineCoordinates(ring) : null))
    .filter((ring): ring is [number, number][] => ring !== null && ring.length >= 4);

  return rings.length > 0 ? rings : null;
}

function parseGeoJsonGeometry(value: unknown): DromapGeoJsonGeometry | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = getRecordValue(value, "type");
  const coordinates = getRecordValue(value, "coordinates");

  if (type === "Point") {
    const point = parseCoordinatePosition(coordinates);
    return point ? { type: "Point", coordinates: point } : null;
  }

  if (type === "MultiPoint") {
    if (!Array.isArray(coordinates)) {
      return null;
    }

    const points = coordinates
      .map(parseCoordinatePosition)
      .filter((point): point is [number, number] => point !== null);

    return points.length > 0 ? { type: "MultiPoint", coordinates: points } : null;
  }

  if (type === "LineString") {
    const line = parseLineCoordinates(coordinates);
    return line ? { type: "LineString", coordinates: line } : null;
  }

  if (type === "MultiLineString") {
    if (!Array.isArray(coordinates)) {
      return null;
    }

    const lines = coordinates
      .map(parseLineCoordinates)
      .filter((line): line is [number, number][] => line !== null);

    return lines.length > 0 ? { type: "MultiLineString", coordinates: lines } : null;
  }

  if (type === "Polygon") {
    const polygon = parsePolygonCoordinates(coordinates);
    return polygon ? { type: "Polygon", coordinates: polygon } : null;
  }

  if (type === "MultiPolygon") {
    if (!Array.isArray(coordinates)) {
      return null;
    }

    const polygons = coordinates
      .map(parsePolygonCoordinates)
      .filter((polygon): polygon is [number, number][][] => polygon !== null);

    return polygons.length > 0 ? { type: "MultiPolygon", coordinates: polygons } : null;
  }

  return null;
}

function normalizeGeoJsonFeature(
  geometry: DromapGeoJsonGeometry,
  properties: Record<string, unknown>,
  index: number,
): DromapGeoJsonFeature {
  return {
    type: "Feature",
    id: `geojson-layer-feature-${index + 1}`,
    geometry,
    properties: cloneJsonValue(properties),
  };
}

function flattenGeoJsonRecord(
  value: Record<string, unknown>,
  fallbackProperties: Record<string, unknown>,
): { features: DromapGeoJsonFeature[]; skipped: number } {
  const type = getRecordValue(value, "type");

  if (type === "FeatureCollection") {
    const rawFeatures = getRecordValue(value, "features");
    if (!Array.isArray(rawFeatures)) {
      return { features: [], skipped: 1 };
    }

    return rawFeatures.reduce(
      (result, item) => {
        if (!isRecord(item)) {
          result.skipped += 1;
          return result;
        }

        const parsed = flattenGeoJsonRecord(item, fallbackProperties);
        result.features.push(...parsed.features);
        result.skipped += parsed.skipped;
        return result;
      },
      { features: [] as DromapGeoJsonFeature[], skipped: 0 },
    );
  }

  if (type === "Feature") {
    const geometry = getRecordValue(value, "geometry");
    const rawProperties = getRecordValue(value, "properties");
    const properties = isRecord(rawProperties) ? rawProperties : fallbackProperties;

    if (!isRecord(geometry)) {
      return { features: [], skipped: 1 };
    }

    return flattenGeoJsonGeometryRecord(geometry, properties);
  }

  return flattenGeoJsonGeometryRecord(value, fallbackProperties);
}

function flattenGeoJsonGeometryRecord(
  geometry: Record<string, unknown>,
  properties: Record<string, unknown>,
): { features: DromapGeoJsonFeature[]; skipped: number } {
  const type = getRecordValue(geometry, "type");

  if (type === "GeometryCollection") {
    const geometries = getRecordValue(geometry, "geometries");
    if (!Array.isArray(geometries)) {
      return { features: [], skipped: 1 };
    }

    return geometries.reduce(
      (result, item) => {
        if (!isRecord(item)) {
          result.skipped += 1;
          return result;
        }

        const parsed = flattenGeoJsonGeometryRecord(item, properties);
        result.features.push(...parsed.features);
        result.skipped += parsed.skipped;
        return result;
      },
      { features: [] as DromapGeoJsonFeature[], skipped: 0 },
    );
  }

  const parsedGeometry = parseGeoJsonGeometry(geometry);

  if (!parsedGeometry) {
    return { features: [], skipped: 1 };
  }

  return { features: [normalizeGeoJsonFeature(parsedGeometry, properties, 0)], skipped: 0 };
}

function createLayerNameFromSource(sourceName?: string | null) {
  const source = sourceName?.trim();
  if (!source) {
    return "Calque GeoJSON";
  }

  return source.replace(/\.(geojson|json)$/i, "") || "Calque GeoJSON";
}

function getDromapStyleFromProperties(properties: Record<string, unknown>) {
  const dromap = getRecordValue(properties, "dromap");
  const dromapStyle = isRecord(dromap) ? getRecordValue(dromap, "style") : null;

  return isRecord(dromapStyle) ? dromapStyle : null;
}

function getDromapLayerStyleFromProperties(properties: Record<string, unknown>) {
  const dromap = getRecordValue(properties, "dromap");
  const dromapLayerStyle = isRecord(dromap) ? getRecordValue(dromap, "layerStyle") : null;

  if (isRecord(dromapLayerStyle)) {
    return dromapLayerStyle;
  }

  const exportedLayerStyle = getRecordValue(properties, "dromap_geojson_layer_style");
  return isRecord(exportedLayerStyle) ? exportedLayerStyle : null;
}

function getStyleStringFromStyle(
  style: Record<string, unknown> | null,
  keys: string[],
  fallback: string,
) {
  if (!style) {
    return fallback;
  }

  for (const key of keys) {
    const parsed = parseStringLike(getRecordValue(style, key));
    if (parsed) {
      return parsed;
    }
  }

  return fallback;
}

function getStyleNumberFromStyle(
  style: Record<string, unknown> | null,
  keys: string[],
  fallback: number,
) {
  if (!style) {
    return fallback;
  }

  for (const key of keys) {
    const value = getRecordValue(style, key);
    if (value !== undefined && value !== null && value !== "") {
      return parseNumberLike(value, fallback);
    }
  }

  return fallback;
}

function getInitialLayerStyle(features: DromapGeoJsonFeature[]): DromapGeoJsonLayerStyle {
  const firstProperties = features[0]?.properties ?? {};
  const dromapFeatureStyle = getDromapStyleFromProperties(firstProperties);
  const dromapLayerStyle = getDromapLayerStyleFromProperties(firstProperties);
  const sourceStyle = dromapFeatureStyle ?? dromapLayerStyle;

  // Important : les styles GeoJSON externes (stroke, fill, fill-opacity, etc.)
  // ne doivent plus devenir le rendu par défaut DroMap. Beaucoup d'outils,
  // dont geojson.io, stockent un bleu Leaflet dans les propriétés ; si on le
  // relit ici, on se retrouve avec un ancien rendu bleu sous/à côté du rendu
  // DroMap. On ne conserve que les styles explicitement DroMap.
  if (!sourceStyle) {
    return { ...DEFAULT_GEOJSON_LAYER_STYLE };
  }

  const strokeColor = getStyleStringFromStyle(
    sourceStyle,
    ["color", "strokeColor", "stroke", "colour"],
    DEFAULT_GEOJSON_LAYER_STYLE.strokeColor,
  );
  const fillColor = getStyleStringFromStyle(
    sourceStyle,
    ["fillColor", "fill", "fill-color"],
    DEFAULT_GEOJSON_LAYER_STYLE.fillColor,
  );
  const dashStyle = getStyleStringFromStyle(
    sourceStyle,
    ["dashStyle", "stroke-dashstyle", "strokeDashStyle", "stroke-dasharray"],
    DEFAULT_GEOJSON_LAYER_STYLE.dashStyle,
  );

  return {
    strokeColor,
    strokeWeight: clamp(
      getStyleNumberFromStyle(sourceStyle, ["weight", "strokeWeight", "stroke-width", "strokeWidth"], DEFAULT_GEOJSON_LAYER_STYLE.strokeWeight),
      1,
      24,
    ),
    strokeOpacity: clampOpacity(
      getStyleNumberFromStyle(sourceStyle, ["opacity", "strokeOpacity", "stroke-opacity"], DEFAULT_GEOJSON_LAYER_STYLE.strokeOpacity),
    ),
    fillColor,
    fillOpacity: clampOpacity(
      getStyleNumberFromStyle(sourceStyle, ["fillOpacity", "fill-opacity"], DEFAULT_GEOJSON_LAYER_STYLE.fillOpacity),
    ),
    markerSize: clamp(
      getStyleNumberFromStyle(sourceStyle, ["markerSize", "marker-size", "size"], DEFAULT_GEOJSON_LAYER_STYLE.markerSize),
      2,
      48,
    ),
    dashStyle: dashStyle === "dotted" ? "dotted" : dashStyle === "dashed" || dashStyle !== "solid" ? "dashed" : "solid",
  };
}

function collectGeometryCoordinates(
  geometry: DromapGeoJsonGeometry,
  collect: (position: [number, number]) => void,
) {
  if (geometry.type === "Point") {
    collect(geometry.coordinates);
    return;
  }

  if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
    geometry.coordinates.forEach(collect);
    return;
  }

  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    geometry.coordinates.forEach((lineOrRing) => lineOrRing.forEach(collect));
    return;
  }

  geometry.coordinates.forEach((polygon) =>
    polygon.forEach((ring) => ring.forEach(collect)),
  );
}


function getGeoJsonGeometryLoadingBounds(
  geometry: DromapGeoJsonGeometry,
): DromapLoadingBounds | null {
  const lngs: number[] = [];
  const lats: number[] = [];

  collectGeometryCoordinates(geometry, ([lng, lat]) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return;
    }

    lngs.push(lng);
    lats.push(lat);
  });

  if (lngs.length === 0 || lats.length === 0) {
    return null;
  }

  return {
    south: Math.min(...lats),
    west: Math.min(...lngs),
    north: Math.max(...lats),
    east: Math.max(...lngs),
  };
}

export function isGeoJsonFeatureLoadedInWorkspace(
  feature: DromapGeoJsonFeature,
  workspaceBounds: WorkspaceBounds | null | undefined,
) {
  const loadingBounds = getWorkspaceObjectLoadingBounds(workspaceBounds);

  if (!loadingBounds) {
    return true;
  }

  return loadingBoundsIntersect(
    loadingBounds,
    getGeoJsonGeometryLoadingBounds(feature.geometry),
  );
}

function getWorkspaceLoadingCacheKey(workspaceBounds: WorkspaceBounds | null | undefined) {
  const loadingBounds = getWorkspaceObjectLoadingBounds(workspaceBounds);

  if (!loadingBounds) {
    return "all";
  }

  return [
    loadingBounds.south,
    loadingBounds.west,
    loadingBounds.north,
    loadingBounds.east,
  ]
    .map((value) => value.toFixed(6))
    .join(":");
}

function normalizePrecisionMode(value: unknown): DromapGeoJsonPrecisionMode {
  if (value === "light") {
    return "light";
  }

  if (value === "intermediate") {
    return "intermediate";
  }

  return "original";
}

export function getGeoJsonPrecisionModeLabel(mode: DromapGeoJsonPrecisionMode) {
  if (mode === "light") {
    return "Légère";
  }

  if (mode === "intermediate") {
    return "Intermédiaire";
  }

  return "Originale";
}

function getGeoJsonPrecisionRatio(mode: DromapGeoJsonPrecisionMode) {
  if (mode === "light") {
    return 0.25;
  }

  if (mode === "intermediate") {
    return 2 / 3;
  }

  return 1;
}

function samePosition(a: [number, number] | undefined, b: [number, number] | undefined) {
  return Boolean(a && b && Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12);
}

function pickEvenlySpacedPositions(
  coordinates: [number, number][],
  targetCount: number,
): [number, number][] {
  if (coordinates.length <= targetCount) {
    return coordinates.map((position) => [...position] as [number, number]);
  }

  const result: [number, number][] = [];
  const usedIndexes = new Set<number>();
  const lastIndex = coordinates.length - 1;

  for (let i = 0; i < targetCount; i += 1) {
    const index = Math.min(
      lastIndex,
      Math.max(0, Math.round((i * lastIndex) / Math.max(1, targetCount - 1))),
    );

    if (usedIndexes.has(index)) {
      continue;
    }

    usedIndexes.add(index);
    const coordinate = coordinates[index];
    if (coordinate) {
      result.push([...coordinate] as [number, number]);
    }
  }

  const first = coordinates[0];
  const last = coordinates[lastIndex];

  if (first && !samePosition(result[0], first)) {
    result.unshift([...first] as [number, number]);
  }

  if (last && !samePosition(result[result.length - 1], last)) {
    result.push([...last] as [number, number]);
  }

  return result;
}

function simplifyOpenLineCoordinates(
  coordinates: [number, number][],
  ratio: number,
): [number, number][] {
  if (ratio >= 0.999 || coordinates.length <= 2) {
    return coordinates.map((position) => [...position] as [number, number]);
  }

  const targetCount = Math.max(2, Math.ceil(coordinates.length * ratio));
  return pickEvenlySpacedPositions(coordinates, targetCount);
}

function simplifyClosedRingCoordinates(
  coordinates: [number, number][],
  ratio: number,
): [number, number][] {
  if (coordinates.length <= 4 || ratio >= 0.999) {
    const cloned = coordinates.map((position) => [...position] as [number, number]);
    const first = cloned[0];
    if (first && !samePosition(first, cloned[cloned.length - 1])) {
      cloned.push([...first] as [number, number]);
    }
    return cloned;
  }

  const alreadyClosed = samePosition(coordinates[0], coordinates[coordinates.length - 1]);
  const core = alreadyClosed ? coordinates.slice(0, -1) : coordinates;
  const targetCoreCount = Math.max(3, Math.ceil(core.length * ratio));
  const simplifiedCore = pickEvenlySpacedPositions(core, targetCoreCount);
  const first = simplifiedCore[0];

  if (first && !samePosition(first, simplifiedCore[simplifiedCore.length - 1])) {
    simplifiedCore.push([...first] as [number, number]);
  }

  return simplifiedCore.length >= 4
    ? simplifiedCore
    : simplifyClosedRingCoordinates(coordinates, 1);
}

function simplifyGeoJsonGeometry(
  geometry: DromapGeoJsonGeometry,
  ratio: number,
): DromapGeoJsonGeometry {
  if (ratio >= 0.999) {
    return cloneJsonValue(geometry);
  }

  if (geometry.type === "Point" || geometry.type === "MultiPoint") {
    return cloneJsonValue(geometry);
  }

  if (geometry.type === "LineString") {
    return {
      type: "LineString",
      coordinates: simplifyOpenLineCoordinates(geometry.coordinates, ratio),
    };
  }

  if (geometry.type === "MultiLineString") {
    return {
      type: "MultiLineString",
      coordinates: geometry.coordinates.map((line) => simplifyOpenLineCoordinates(line, ratio)),
    };
  }

  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) => simplifyClosedRingCoordinates(ring, ratio)),
    };
  }

  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((polygon) =>
      polygon.map((ring) => simplifyClosedRingCoordinates(ring, ratio)),
    ),
  };
}

const displayDataCache = new WeakMap<DromapGeoJsonLayer, DromapGeoJsonFeatureCollection>();

export function getGeoJsonLayerDisplayData(
  layer: DromapGeoJsonLayer,
): DromapGeoJsonFeatureCollection {
  if (layer.precisionMode === "original") {
    return layer.data;
  }

  const cached = displayDataCache.get(layer);
  if (cached) {
    return cached;
  }

  const ratio = getGeoJsonPrecisionRatio(layer.precisionMode);
  const displayData: DromapGeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features: layer.data.features.map((feature) => ({
      ...feature,
      properties: cloneJsonValue(feature.properties ?? {}),
      geometry: simplifyGeoJsonGeometry(feature.geometry, ratio),
    })),
  };

  displayDataCache.set(layer, displayData);
  return displayData;
}

const loadedDisplayDataCache = new WeakMap<
  DromapGeoJsonLayer,
  Map<string, DromapGeoJsonFeatureCollection>
>();

export function getGeoJsonLayerLoadedDisplayData(
  layer: DromapGeoJsonLayer,
  workspaceBounds: WorkspaceBounds | null | undefined,
): DromapGeoJsonFeatureCollection {
  const loadingBounds = getWorkspaceObjectLoadingBounds(workspaceBounds);

  if (!loadingBounds) {
    return getGeoJsonLayerDisplayData(layer);
  }

  const cacheKey = `${layer.precisionMode}:${getWorkspaceLoadingCacheKey(workspaceBounds)}`;
  const layerCache = loadedDisplayDataCache.get(layer) ?? new Map<string, DromapGeoJsonFeatureCollection>();
  const cached = layerCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const displayData = getGeoJsonLayerDisplayData(layer);
  const loadedData: DromapGeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features: displayData.features.filter((feature) =>
      loadingBoundsIntersect(
        loadingBounds,
        getGeoJsonGeometryLoadingBounds(feature.geometry),
      ),
    ),
  };

  layerCache.set(cacheKey, loadedData);
  loadedDisplayDataCache.set(layer, layerCache);

  return loadedData;
}

export function getGeoJsonLayerLoadedFeatureCount(
  layer: DromapGeoJsonLayer,
  workspaceBounds: WorkspaceBounds | null | undefined,
) {
  return getGeoJsonLayerLoadedDisplayData(layer, workspaceBounds).features.length;
}

export function getGeoJsonLayerDisplayCoordinateCount(layer: DromapGeoJsonLayer) {
  return getGeoJsonLayerCoordinateCount({ data: getGeoJsonLayerDisplayData(layer) });
}

export function getGeoJsonLayerBoundsFromFeatures(
  features: DromapGeoJsonFeature[],
): WorkspaceBounds | null {
  const lngs: number[] = [];
  const lats: number[] = [];

  for (const feature of features) {
    collectGeometryCoordinates(feature.geometry, ([lng, lat]) => {
      lngs.push(lng);
      lats.push(lat);
    });
  }

  if (lngs.length === 0 || lats.length === 0) {
    return null;
  }

  let west = Math.min(...lngs);
  let east = Math.max(...lngs);
  let south = Math.min(...lats);
  let north = Math.max(...lats);
  const lngSpan = east - west;
  const latSpan = north - south;
  const paddingLng = lngSpan > 0 ? Math.max(lngSpan * 0.08, 0.02) : 0.08;
  const paddingLat = latSpan > 0 ? Math.max(latSpan * 0.08, 0.02) : 0.08;

  west = clamp(west - paddingLng, -360, 360);
  east = clamp(east + paddingLng, -360, 360);
  south = clamp(south - paddingLat, -85.05112878, 85.05112878);
  north = clamp(north + paddingLat, -85.05112878, 85.05112878);

  if (east - west < 0.000001 || north - south < 0.000001) {
    return null;
  }

  return {
    southWest: { lat: south, lng: west },
    northEast: { lat: north, lng: east },
  };
}

export function getGeoJsonLayerCoordinateCount(layer: Pick<DromapGeoJsonLayer, "data">) {
  let count = 0;

  for (const feature of layer.data.features) {
    collectGeometryCoordinates(feature.geometry, () => {
      count += 1;
    });
  }

  return count;
}

export function parseGeoJsonTextToDromapGeoJsonLayer(
  jsonText: string,
  options: { sourceName?: string | null; existingLayerCount?: number; precisionMode?: DromapGeoJsonPrecisionMode } = {},
): DromapGeoJsonLayer {
  const parsed = JSON.parse(jsonText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Import GeoJSON impossible : le fichier doit contenir un objet GeoJSON.");
  }

  const flattened = flattenGeoJsonRecord(parsed, {});
  const features = flattened.features.map((feature, index) => ({
    ...feature,
    id: `geojson-layer-feature-${index + 1}`,
  }));

  if (features.length === 0) {
    throw new Error(
      "Import GeoJSON impossible : aucun Point, LineString, Polygon ou Multi* exploitable n’a été trouvé.",
    );
  }

  const timestamp = nowIso();
  const order = ((options.existingLayerCount ?? 0) + 1) * GEOJSON_LAYER_ORDER_STEP;
  const data: DromapGeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features,
  };
  const temporaryLayer = { data };

  return {
    id: createGeoJsonLayerId(),
    name: createLayerNameFromSource(options.sourceName),
    visible: true,
    opacity: 1,
    locked: true,
    order,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceName: options.sourceName ?? null,
    featureCount: features.length,
    coordinateCount: getGeoJsonLayerCoordinateCount(temporaryLayer),
    skippedGeometries: flattened.skipped,
    bounds: getGeoJsonLayerBoundsFromFeatures(features),
    precisionMode: normalizePrecisionMode(options.precisionMode),
    style: getInitialLayerStyle(features),
    data,
  };
}

function normalizeColorKey(value: string) {
  return value.trim().toLowerCase();
}

function isLegacyGeoJsonBlueStyle(style: DromapGeoJsonLayerStyle) {
  const strokeColor = normalizeColorKey(style.strokeColor);
  const fillColor = normalizeColorKey(style.fillColor);
  const isOldDroMapBlue = strokeColor === "#2563eb" && fillColor === "#2563eb";
  const isLeafletBlue = strokeColor === "#3388ff" && fillColor === "#3388ff";

  return (
    (isOldDroMapBlue || isLeafletBlue) &&
    Math.abs(style.strokeWeight - 2) < 0.001 &&
    style.strokeOpacity >= 0.85 &&
    style.fillOpacity > 0 &&
    style.fillOpacity <= 0.35 &&
    style.markerSize <= 8 &&
    style.dashStyle === "solid"
  );
}

function normalizeLayerStyle(value: unknown): DromapGeoJsonLayerStyle {
  if (!isRecord(value)) {
    return { ...DEFAULT_GEOJSON_LAYER_STYLE };
  }

  const strokeColor = normalizeName(getRecordValue(value, "strokeColor"), DEFAULT_GEOJSON_LAYER_STYLE.strokeColor);
  const fillColor = normalizeName(getRecordValue(value, "fillColor"), strokeColor);
  const normalizedStyle: DromapGeoJsonLayerStyle = {
    strokeColor,
    strokeWeight: clamp(parseNumberLike(getRecordValue(value, "strokeWeight"), DEFAULT_GEOJSON_LAYER_STYLE.strokeWeight), 1, 24),
    strokeOpacity: clampOpacity(parseNumberLike(getRecordValue(value, "strokeOpacity"), DEFAULT_GEOJSON_LAYER_STYLE.strokeOpacity)),
    fillColor,
    fillOpacity: clampOpacity(parseNumberLike(getRecordValue(value, "fillOpacity"), DEFAULT_GEOJSON_LAYER_STYLE.fillOpacity)),
    markerSize: clamp(parseNumberLike(getRecordValue(value, "markerSize"), DEFAULT_GEOJSON_LAYER_STYLE.markerSize), 2, 48),
    dashStyle:
      getRecordValue(value, "dashStyle") === "dotted"
        ? "dotted"
        : getRecordValue(value, "dashStyle") === "dashed"
          ? "dashed"
          : "solid",
  };

  // Migration douce : les anciens calques GeoJSON importés avant le changement
  // avaient le bleu Leaflet/DroMap par défaut. Ce bleu n'est pas un vrai style
  // choisi par l'utilisateur ; il doit donc devenir noir sans fond.
  return isLegacyGeoJsonBlueStyle(normalizedStyle)
    ? { ...DEFAULT_GEOJSON_LAYER_STYLE }
    : normalizedStyle;
}

function normalizeGeoJsonFeatureCollection(value: unknown): DromapGeoJsonFeatureCollection | null {
  if (!isRecord(value)) {
    return null;
  }

  const flattened = flattenGeoJsonRecord(value, {});

  if (flattened.features.length === 0) {
    return null;
  }

  return {
    type: "FeatureCollection",
    features: flattened.features.map((feature, index) => ({
      ...feature,
      id: `geojson-layer-feature-${index + 1}`,
    })),
  };
}

export function normalizeDromapGeoJsonLayer(
  value: unknown,
  index: number,
): DromapGeoJsonLayer | null {
  if (!isRecord(value)) {
    return null;
  }

  const data = normalizeGeoJsonFeatureCollection(getRecordValue(value, "data"));
  if (!data) {
    return null;
  }

  const timestamp = nowIso();
  const featureCount = data.features.length;
  const temporaryLayer = { data };

  return {
    id: normalizeName(getRecordValue(value, "id"), createGeoJsonLayerId()),
    name: normalizeName(getRecordValue(value, "name"), `Calque GeoJSON ${index + 1}`),
    visible: getRecordValue(value, "visible") !== false,
    opacity: clampOpacity(parseNumberLike(getRecordValue(value, "opacity"), 1)),
    locked: getRecordValue(value, "locked") !== false,
    order: parseNumberLike(getRecordValue(value, "order"), (index + 1) * GEOJSON_LAYER_ORDER_STEP),
    createdAt: normalizeName(getRecordValue(value, "createdAt"), timestamp),
    updatedAt: normalizeName(getRecordValue(value, "updatedAt"), timestamp),
    sourceName:
      typeof getRecordValue(value, "sourceName") === "string"
        ? (getRecordValue(value, "sourceName") as string)
        : null,
    ...(typeof getRecordValue(value, "sourceSavedLayerId") === "string" &&
    String(getRecordValue(value, "sourceSavedLayerId")).trim()
      ? { sourceSavedLayerId: String(getRecordValue(value, "sourceSavedLayerId")).trim() }
      : {}),
    featureCount,
    coordinateCount: getGeoJsonLayerCoordinateCount(temporaryLayer),
    skippedGeometries: Math.max(0, Math.round(parseNumberLike(getRecordValue(value, "skippedGeometries"), 0))),
    bounds: getGeoJsonLayerBoundsFromFeatures(data.features),
    precisionMode: normalizePrecisionMode(getRecordValue(value, "precisionMode")),
    style: normalizeLayerStyle(getRecordValue(value, "style")),
    data,
  };
}

export function normalizeDromapGeoJsonLayers(value: unknown): DromapGeoJsonLayer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeDromapGeoJsonLayer)
    .filter((layer): layer is DromapGeoJsonLayer => layer !== null)
    .sort((a, b) => a.order - b.order)
    .map((layer, index) => ({
      ...layer,
      order: (index + 1) * GEOJSON_LAYER_ORDER_STEP,
    }));
}

function renormalizeOrders(layers: DromapGeoJsonLayer[]) {
  return layers.map((layer, index) => ({
    ...layer,
    order: (index + 1) * GEOJSON_LAYER_ORDER_STEP,
  }));
}

export function getRenderableGeoJsonLayers(layers: DromapGeoJsonLayer[]) {
  return layers
    .filter((layer) => layer.visible !== false && layer.opacity > 0)
    .sort((a, b) => a.order - b.order);
}


function createGeoJsonLayerCopyForLibrary(layer: DromapGeoJsonLayer): DromapGeoJsonLayer {
  return {
    ...cloneJsonValue(layer),
    visible: true,
    locked: layer.locked === true,
    sourceSavedLayerId: undefined,
  };
}

export function createDromapSavedGeoJsonLayer(input: {
  name: string;
  layer: DromapGeoJsonLayer;
}): DromapSavedGeoJsonLayer {
  return {
    id: createSavedGeoJsonLayerId(),
    name: input.name.trim() || input.layer.name || "Calque GeoJSON enregistré",
    savedAt: nowIso(),
    layer: createGeoJsonLayerCopyForLibrary(input.layer),
  };
}

export function remapSavedGeoJsonLayerToMap(
  savedLayer: DromapSavedGeoJsonLayer,
  existingLayerCount: number,
): DromapGeoJsonLayer {
  const timestamp = nowIso();
  const nextId = createGeoJsonLayerId();
  const clonedLayer = cloneJsonValue(savedLayer.layer);

  return {
    ...clonedLayer,
    id: nextId,
    name: savedLayer.name || clonedLayer.name || "Calque GeoJSON",
    visible: true,
    order: (existingLayerCount + 1) * GEOJSON_LAYER_ORDER_STEP,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceSavedLayerId: savedLayer.id,
  };
}

function persistSavedGeoJsonLayers(savedLayers: DromapSavedGeoJsonLayer[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      DROMAP_SAVED_GEOJSON_LAYERS_STORAGE_KEY,
      JSON.stringify(savedLayers),
    );
  } catch {
    // La base locale ne doit jamais casser l'éditeur.
  }
}

function normalizeSavedGeoJsonLayer(value: unknown): DromapSavedGeoJsonLayer | null {
  if (!isRecord(value)) {
    return null;
  }

  const layer = normalizeDromapGeoJsonLayer(getRecordValue(value, "layer"), 0);
  if (!layer) {
    return null;
  }

  const timestamp = nowIso();

  return {
    id: normalizeName(getRecordValue(value, "id"), createSavedGeoJsonLayerId()),
    name: normalizeName(getRecordValue(value, "name"), layer.name),
    savedAt: normalizeName(getRecordValue(value, "savedAt"), timestamp),
    layer,
  };
}

function parseSavedGeoJsonLayers(value: unknown): DromapSavedGeoJsonLayer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeSavedGeoJsonLayer)
    .filter((layer): layer is DromapSavedGeoJsonLayer => layer !== null);
}

function loadSavedGeoJsonLayersFromStorageValue() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DROMAP_SAVED_GEOJSON_LAYERS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return parseSavedGeoJsonLayers(JSON.parse(raw));
  } catch {
    return [];
  }
}

export const useEditorTestGeoJsonLayersStore = create<EditorTestGeoJsonLayersState>((set) => ({
  geoJsonLayers: [],
  savedGeoJsonLayers: [],

  setGeoJsonLayers: (layers) =>
    set({ geoJsonLayers: normalizeDromapGeoJsonLayers(layers) }),

  addGeoJsonLayer: (layer) =>
    set((state) => ({
      geoJsonLayers: renormalizeOrders([
        ...state.geoJsonLayers,
        normalizeDromapGeoJsonLayer(layer, state.geoJsonLayers.length) ?? layer,
      ]),
    })),

  removeGeoJsonLayer: (layerId) =>
    set((state) => ({
      geoJsonLayers: renormalizeOrders(
        state.geoJsonLayers.filter((layer) => layer.id !== layerId),
      ),
    })),

  renameGeoJsonLayer: (layerId, name) =>
    set((state) => ({
      geoJsonLayers: state.geoJsonLayers.map((layer) =>
        layer.id === layerId
          ? { ...layer, name: name.trim() || layer.name, updatedAt: nowIso() }
          : layer,
      ),
    })),

  toggleGeoJsonLayerVisibility: (layerId) =>
    set((state) => ({
      geoJsonLayers: state.geoJsonLayers.map((layer) =>
        layer.id === layerId
          ? { ...layer, visible: !layer.visible, updatedAt: nowIso() }
          : layer,
      ),
    })),

  setGeoJsonLayerOpacity: (layerId, opacity) =>
    set((state) => ({
      geoJsonLayers: state.geoJsonLayers.map((layer) =>
        layer.id === layerId
          ? { ...layer, opacity: clampOpacity(opacity), updatedAt: nowIso() }
          : layer,
      ),
    })),

  setGeoJsonLayerPrecisionMode: (layerId, mode) =>
    set((state) => ({
      geoJsonLayers: state.geoJsonLayers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              precisionMode: normalizePrecisionMode(mode),
              updatedAt: nowIso(),
            }
          : layer,
      ),
    })),

  toggleGeoJsonLayerLocked: (layerId) =>
    set((state) => ({
      geoJsonLayers: state.geoJsonLayers.map((layer) =>
        layer.id === layerId
          ? { ...layer, locked: !layer.locked, updatedAt: nowIso() }
          : layer,
      ),
    })),

  moveGeoJsonLayer: (layerId, direction) =>
    set((state) => {
      const sorted = [...state.geoJsonLayers].sort((a, b) => b.order - a.order);
      const index = sorted.findIndex((layer) => layer.id === layerId);
      if (index < 0) {
        return state;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= sorted.length) {
        return state;
      }

      const nextLayers = [...sorted];
      const [layer] = nextLayers.splice(index, 1);
      if (!layer) {
        return state;
      }
      nextLayers.splice(targetIndex, 0, layer);

      return {
        geoJsonLayers: renormalizeOrders(nextLayers.reverse()),
      };
    }),

  updateGeoJsonLayerStyle: (layerId, patch) =>
    set((state) => ({
      geoJsonLayers: state.geoJsonLayers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              updatedAt: nowIso(),
              style: normalizeLayerStyle({ ...layer.style, ...patch }),
            }
          : layer,
      ),
    })),

  clearGeoJsonLayers: () => set({ geoJsonLayers: [] }),

  loadSavedGeoJsonLayersFromStorage: () =>
    set({ savedGeoJsonLayers: loadSavedGeoJsonLayersFromStorageValue() }),

  saveGeoJsonLayerToLibrary: (savedLayer) =>
    set((state) => {
      const nextSavedLayers = [savedLayer, ...state.savedGeoJsonLayers];
      persistSavedGeoJsonLayers(nextSavedLayers);
      return { savedGeoJsonLayers: nextSavedLayers };
    }),

  renameSavedGeoJsonLayer: (savedLayerId, name) =>
    set((state) => {
      const nextSavedLayers = state.savedGeoJsonLayers.map((savedLayer) =>
        savedLayer.id === savedLayerId
          ? { ...savedLayer, name: name.trim() || savedLayer.name }
          : savedLayer,
      );
      persistSavedGeoJsonLayers(nextSavedLayers);
      return { savedGeoJsonLayers: nextSavedLayers };
    }),

  deleteSavedGeoJsonLayer: (savedLayerId) =>
    set((state) => {
      const nextSavedLayers = state.savedGeoJsonLayers.filter(
        (savedLayer) => savedLayer.id !== savedLayerId,
      );
      persistSavedGeoJsonLayers(nextSavedLayers);
      return { savedGeoJsonLayers: nextSavedLayers };
    }),
}));

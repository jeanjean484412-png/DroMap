import type { DroMapFeature, DroMapFeatureDashStyle } from "@/lib/dromap/feature";
import type { DroMapLayer } from "@/stores/editor-test-layers";
import type {
  DromapGeoJsonFeature,
  DromapGeoJsonFeatureCollection,
  DromapGeoJsonGeometry,
  DromapGeoJsonLayer,
  DromapGeoJsonLayerStyle,
} from "@/stores/editor-test-geojson-layers";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";

const GEOJSON_LAYER_ORDER_STEP = 1000;

function nowIso() {
  return new Date().toISOString();
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

function clampOpacity(value: unknown, fallback = 1) {
  return clamp(typeof value === "number" ? value : fallback, 0, 1);
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  return clamp(typeof value === "number" ? value : fallback, min, max);
}

function normalizeDashStyle(value: unknown): DroMapFeatureDashStyle {
  if (value === "dashed" || value === "dotted") {
    return value;
  }

  return "solid";
}

function getFeatureDashStyle(feature: DroMapFeature) {
  return normalizeDashStyle(feature.properties.style?.dashStyle);
}

function getFeatureStrokeColor(feature: DroMapFeature) {
  return normalizeColor(
    feature.properties.style?.color,
    feature.properties.type === "zone"
      ? feature.properties.style?.fillColor ?? "#000000"
      : "#000000",
  );
}

function getFeatureFillColor(feature: DroMapFeature) {
  return normalizeColor(
    feature.properties.style?.fillColor,
    feature.properties.style?.color ?? "#000000",
  );
}

function deriveLayerStyle(features: DroMapFeature[]): DromapGeoJsonLayerStyle {
  const firstZone = features.find((feature) => feature.properties.type === "zone");
  const firstLine = features.find((feature) => feature.properties.type === "line");
  const firstPoint = features.find(
    (feature) =>
      feature.properties.type === "marker" || feature.properties.type === "text",
  );
  const representative = firstZone ?? firstLine ?? firstPoint ?? features[0];

  if (!representative) {
    return {
      strokeColor: "#000000",
      strokeWeight: 2,
      strokeOpacity: 1,
      fillColor: "#000000",
      fillOpacity: 0,
      markerSize: 18,
      dashStyle: "solid",
    };
  }

  return {
    strokeColor: getFeatureStrokeColor(representative),
    strokeWeight: normalizeNumber(representative.properties.style?.weight, 2, 1, 24),
    strokeOpacity: clampOpacity(representative.properties.style?.opacity, 1),
    fillColor: getFeatureFillColor(firstZone ?? representative),
    fillOpacity: clampOpacity(firstZone?.properties.style?.fillOpacity, 0),
    markerSize: normalizeNumber(firstPoint?.properties.style?.markerSize, 18, 2, 48),
    dashStyle: getFeatureDashStyle(representative),
  };
}

function closeRing(ring: [number, number][]) {
  if (ring.length < 3) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];

  if (!first || !last) {
    return ring;
  }

  if (first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }

  return [...ring, first];
}

function normalizeGeometry(feature: DroMapFeature): DromapGeoJsonGeometry {
  if (feature.geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: feature.geometry.coordinates.map(closeRing),
    };
  }

  return cloneJsonValue(feature.geometry) as DromapGeoJsonGeometry;
}

function getFeatureVariant(feature: DroMapFeature) {
  if (feature.properties.type === "line") {
    return feature.properties.lineVariant ?? "straight";
  }

  if (feature.properties.type === "zone") {
    return feature.properties.zoneVariant ?? "polygon";
  }

  return null;
}

function getOriginalProperties(feature: DroMapFeature) {
  const originalProperties = feature.properties.source?.originalProperties;
  return originalProperties && typeof originalProperties === "object"
    ? cloneJsonValue(originalProperties)
    : {};
}

function createGeoJsonFeatureProperties(feature: DroMapFeature, layer: DroMapLayer) {
  const variant = getFeatureVariant(feature);
  const originalProperties = getOriginalProperties(feature);

  return {
    ...originalProperties,
    name: feature.properties.label,
    label: feature.properties.label,
    legend_label: feature.properties.legendLabel ?? layer.name,
    dromap_type: feature.properties.type,
    dromap_variant: variant,
    dromap_locked: feature.properties.locked ?? false,
    dromap_lock_override: feature.properties.lockOverride ?? null,
    dromap_map_label_visibility:
      feature.properties.mapLabelVisibility ?? "inherit",
    dromap_order: feature.properties.order ?? null,
    dromap_layer_id: layer.id,
    dromap_layer_name: layer.name,
    style: cloneJsonValue(feature.properties.style ?? {}),
    symbol: feature.properties.symbol
      ? cloneJsonValue(feature.properties.symbol)
      : null,
    dromap: {
      schema: "dromap.layer-feature",
      schemaVersion: 1,
      originalId: feature.id,
      featureType: feature.properties.type,
      label: feature.properties.label,
      legendLabel: feature.properties.legendLabel ?? layer.name,
      mapLabelVisibility: feature.properties.mapLabelVisibility ?? "inherit",
      lineVariant: feature.properties.lineVariant ?? null,
      zoneVariant: feature.properties.zoneVariant ?? null,
      zoneShapeKind: feature.properties.zoneShapeKind ?? null,
      locked: feature.properties.locked ?? false,
      lockOverride: feature.properties.lockOverride ?? null,
      order: feature.properties.order ?? null,
      layerId: layer.id,
      layerName: layer.name,
      style: cloneJsonValue(feature.properties.style ?? {}),
      symbol: feature.properties.symbol
        ? cloneJsonValue(feature.properties.symbol)
        : null,
      source: feature.properties.source
        ? cloneJsonValue(feature.properties.source)
        : null,
      meta: cloneJsonValue(feature.properties.meta ?? { version: 1 }),
    },
  };
}

function convertFeatureToGeoJsonFeature(
  feature: DroMapFeature,
  layer: DroMapLayer,
  index: number,
): DromapGeoJsonFeature {
  const source = feature.properties.source;

  return {
    type: "Feature",
    id:
      source?.originalFeatureId !== undefined && source.originalFeatureId !== null
        ? source.originalFeatureId
        : `${layer.id}-dromap-feature-${index + 1}`,
    geometry: normalizeGeometry(feature),
    properties: createGeoJsonFeatureProperties(feature, layer),
  };
}

function stableJsonPrimitive(value: unknown): string {
  const stringified = JSON.stringify(value);
  return typeof stringified === "string" ? stringified : "null";
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return stableJsonPrimitive(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${stableJsonPrimitive(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function getGeoJsonSourceGroupKey(feature: DroMapFeature) {
  const source = feature.properties.source;

  if (source?.type !== "geojson" || !source.importId) {
    return null;
  }

  if (source.originalFeatureId !== undefined && source.originalFeatureId !== null) {
    return `${source.importId}::${String(source.originalFeatureId)}`;
  }

  if (source.originalProperties) {
    return `${source.importId}::props::${stableStringify(source.originalProperties)}`;
  }

  return null;
}

function getOriginalPartIndex(feature: DroMapFeature, fallback: number) {
  const partIndex = feature.properties.source?.originalPartIndex;
  return typeof partIndex === "number" && Number.isFinite(partIndex) ? partIndex : fallback;
}

function sortFeaturesByOriginalPart(features: DroMapFeature[]) {
  return [...features].sort(
    (a, b) => getOriginalPartIndex(a, 0) - getOriginalPartIndex(b, 0),
  );
}

function canGroupAsMulti(features: DroMapFeature[]) {
  if (features.length <= 1) {
    return false;
  }

  const firstGeometryType = features[0]?.geometry.type;

  return Boolean(
    firstGeometryType && features.every((feature) => feature.geometry.type === firstGeometryType),
  );
}

function createGroupedGeoJsonFeature(
  features: DroMapFeature[],
  layer: DroMapLayer,
  fallbackIndex: number,
): DromapGeoJsonFeature | null {
  if (!canGroupAsMulti(features)) {
    return null;
  }

  const orderedFeatures = sortFeaturesByOriginalPart(features);
  const firstFeature = orderedFeatures[0];

  if (!firstFeature) {
    return null;
  }

  const base = convertFeatureToGeoJsonFeature(firstFeature, layer, fallbackIndex);

  if (firstFeature.geometry.type === "Point") {
    return {
      ...base,
      geometry: {
        type: "MultiPoint",
        coordinates: orderedFeatures.map(
          (feature) => (feature.geometry as { type: "Point"; coordinates: [number, number] }).coordinates,
        ),
      },
    };
  }

  if (firstFeature.geometry.type === "LineString") {
    return {
      ...base,
      geometry: {
        type: "MultiLineString",
        coordinates: orderedFeatures.map(
          (feature) =>
            (feature.geometry as { type: "LineString"; coordinates: [number, number][] }).coordinates,
        ),
      },
    };
  }

  if (firstFeature.geometry.type === "Polygon") {
    return {
      ...base,
      geometry: {
        type: "MultiPolygon",
        coordinates: orderedFeatures.map((feature) =>
          (feature.geometry as { type: "Polygon"; coordinates: [number, number][][] }).coordinates.map(closeRing),
        ),
      },
    };
  }

  return null;
}

function convertFeaturesToGeoJsonFeatures(
  features: DroMapFeature[],
  layer: DroMapLayer,
) {
  const output: DromapGeoJsonFeature[] = [];
  const grouped = new Map<string, DroMapFeature[]>();
  const ungrouped: DroMapFeature[] = [];

  for (const feature of features) {
    const groupKey = getGeoJsonSourceGroupKey(feature);

    if (!groupKey) {
      ungrouped.push(feature);
      continue;
    }

    const group = grouped.get(groupKey) ?? [];
    group.push(feature);
    grouped.set(groupKey, group);
  }

  for (const group of grouped.values()) {
    const groupedFeature = createGroupedGeoJsonFeature(group, layer, output.length);

    if (groupedFeature) {
      output.push(groupedFeature);
      continue;
    }

    group.forEach((feature) => {
      output.push(convertFeatureToGeoJsonFeature(feature, layer, output.length));
    });
  }

  ungrouped.forEach((feature) => {
    output.push(convertFeatureToGeoJsonFeature(feature, layer, output.length));
  });

  return output;
}

function collectCoordinate(
  coordinate: [number, number],
  output: { lngs: number[]; lats: number[] },
) {
  const [lng, lat] = coordinate;

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return;
  }

  output.lngs.push(lng);
  output.lats.push(lat);
}

function collectGeometryCoordinates(
  geometry: DromapGeoJsonGeometry,
  output: { lngs: number[]; lats: number[] },
) {
  if (geometry.type === "Point") {
    collectCoordinate(geometry.coordinates, output);
    return;
  }

  if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
    geometry.coordinates.forEach((coordinate) => collectCoordinate(coordinate, output));
    return;
  }

  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    geometry.coordinates.forEach((line) =>
      line.forEach((coordinate) => collectCoordinate(coordinate, output)),
    );
    return;
  }

  geometry.coordinates.forEach((polygon) =>
    polygon.forEach((ring) =>
      ring.forEach((coordinate) => collectCoordinate(coordinate, output)),
    ),
  );
}

function getCoordinateCountForGeometry(geometry: DromapGeoJsonGeometry): number {
  if (geometry.type === "Point") return 1;
  if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
    return geometry.coordinates.length;
  }
  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    return geometry.coordinates.reduce((count, line) => count + line.length, 0);
  }

  return geometry.coordinates.reduce(
    (count, polygon) =>
      count + polygon.reduce((polygonCount, ring) => polygonCount + ring.length, 0),
    0,
  );
}

function getBoundsFromFeatures(features: DromapGeoJsonFeature[]): WorkspaceBounds | null {
  const output = { lngs: [] as number[], lats: [] as number[] };

  features.forEach((feature) => collectGeometryCoordinates(feature.geometry, output));

  if (output.lngs.length === 0 || output.lats.length === 0) {
    return null;
  }

  return {
    southWest: {
      lat: Math.min(...output.lats),
      lng: Math.min(...output.lngs),
    },
    northEast: {
      lat: Math.max(...output.lats),
      lng: Math.max(...output.lngs),
    },
  };
}

function getCoordinateCount(features: DromapGeoJsonFeature[]) {
  return features.reduce(
    (count, feature) => count + getCoordinateCountForGeometry(feature.geometry),
    0,
  );
}

export function canConvertDromapLayerToGeoJsonLayer(features: DroMapFeature[]) {
  return features.length > 0;
}

export function convertDromapLayerToGeoJsonLayer(input: {
  layer: DroMapLayer;
  features: DroMapFeature[];
  existingGeoJsonLayerCount: number;
}): DromapGeoJsonLayer {
  const timestamp = nowIso();
  const geoJsonFeatures = convertFeaturesToGeoJsonFeatures(input.features, input.layer);
  const data: DromapGeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features: geoJsonFeatures,
  };

  return {
    id: createGeoJsonLayerId(),
    name: input.layer.name,
    visible: input.layer.visible,
    opacity: input.layer.opacity,
    locked: input.layer.locked,
    order: (input.existingGeoJsonLayerCount + 1) * GEOJSON_LAYER_ORDER_STEP,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceName: `Calque DroMap : ${input.layer.name}`,
    featureCount: geoJsonFeatures.length,
    coordinateCount: getCoordinateCount(geoJsonFeatures),
    skippedGeometries: 0,
    bounds: getBoundsFromFeatures(geoJsonFeatures),
    precisionMode: "original",
    style: deriveLayerStyle(input.features),
    data,
  };
}

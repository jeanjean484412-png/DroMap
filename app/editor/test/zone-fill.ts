import type { DromapBasemapId } from "@/lib/dromap/basemap";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import type {
  DromapBoundaryFeature,
  DromapBoundaryFeatureCollection,
  DromapBoundaryPosition,
} from "@/lib/dromap/basemap-boundaries";
import {
  getDromapBoundaryFeatureForLayer,
  loadDromapBoundaryFeatureCollection,
} from "@/lib/dromap/basemap-boundaries";
import type { DroMapFeature, DroMapFeatureStyle } from "@/lib/dromap/feature";
import type {
  DromapGeoJsonFeature,
  DromapGeoJsonLayer,
} from "@/stores/editor-test-geojson-layers";
import {
  getGeoJsonLayerLoadedDisplayData,
  getRenderableGeoJsonLayers,
} from "@/stores/editor-test-geojson-layers";

export type ZoneFillMatch = {
  feature: DroMapFeature;
  sourceLabel: string;
};

export type ZoneFillResult = {
  match: ZoneFillMatch | null;
};

const FILLABLE_BOUNDARY_KINDS = new Set([
  "admin0-countries",
  "admin1-regions",
  "france-departments",
  "france-regions",
  "france-outline",
]);

const LABEL_PROPERTY_KEYS = [
  "nom",
  "name",
  "NAME",
  "name_fr",
  "NAME_FR",
  "name_en",
  "NAME_EN",
  "admin",
  "ADMIN",
  "geounit",
  "GEOUNIT",
  "libelle",
  "libellé",
  "nom_reg",
  "nom_region",
  "nom_dept",
  "nom_departement",
  "nom_département",
  "departement",
  "département",
  "region",
  "région",
  "code",
  "code_insee",
];

function getRingKey(ring: DromapBoundaryPosition[]) {
  return ring
    .map((position) => `${position[0].toFixed(6)},${position[1].toFixed(6)}`)
    .join("|");
}

function closeRing(ring: DromapBoundaryPosition[]) {
  if (ring.length === 0) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }

  return [...ring, first];
}

function pointIsInRing(
  point: DromapBoundaryPosition,
  rawRing: DromapBoundaryPosition[],
) {
  const ring = closeRing(rawRing);

  if (ring.length < 4) {
    return false;
  }

  const [x, y] = point;
  let inside = false;

  for (
    let index = 0, previousIndex = ring.length - 1;
    index < ring.length;
    previousIndex = index, index += 1
  ) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previousIndex];

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointIsInPolygon(
  point: DromapBoundaryPosition,
  polygon: DromapBoundaryPosition[][],
) {
  const exteriorRing = polygon[0];

  if (!exteriorRing || !pointIsInRing(point, exteriorRing)) {
    return false;
  }

  const holes = polygon.slice(1);

  return !holes.some((hole) => pointIsInRing(point, hole));
}

function getContainingPolygonFromBoundaryFeature(
  feature: DromapBoundaryFeature,
  point: DromapBoundaryPosition,
): DromapBoundaryPosition[][] | null {
  const geometry = feature.geometry;

  if (!geometry) {
    return null;
  }

  if (geometry.type === "Polygon") {
    return pointIsInPolygon(point, geometry.coordinates)
      ? geometry.coordinates.map(closeRing)
      : null;
  }

  if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      if (pointIsInPolygon(point, polygon)) {
        return polygon.map(closeRing);
      }
    }

    return null;
  }

  if (geometry.type === "LineString") {
    const ring = closeRing(geometry.coordinates);

    return pointIsInRing(point, ring) ? [ring] : null;
  }

  if (geometry.type === "MultiLineString") {
    for (const lineString of geometry.coordinates) {
      const ring = closeRing(lineString);

      if (pointIsInRing(point, ring)) {
        return [ring];
      }
    }
  }

  return null;
}

function getStringProperty(
  properties: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = properties?.[key];

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getBoundaryFeatureLabel(
  feature: DromapBoundaryFeature,
  layerKind?: string,
) {
  if (layerKind === "france-outline") {
    return "France";
  }

  for (const key of LABEL_PROPERTY_KEYS) {
    const value = getStringProperty(feature.properties, key);

    if (value) {
      return value;
    }
  }

  return "Zone remplie";
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function getVisibleZoneFillStyle(
  style: DroMapFeatureStyle,
): DroMapFeatureStyle {
  const nextStyle: DroMapFeatureStyle = { ...style };
  const strokeEnabled = nextStyle.zoneStrokeEnabled !== false;
  const explicitFillEnabled = nextStyle.zoneFillEnabled;
  const fillOpacity = clamp01(Number(nextStyle.fillOpacity ?? 0));
  const fillEnabled =
    explicitFillEnabled === true ||
    (explicitFillEnabled !== false && fillOpacity > 0);

  nextStyle.zoneFillEnabled = fillEnabled;

  if (!strokeEnabled && !fillEnabled) {
    nextStyle.zoneStrokeEnabled = true;
  }

  return nextStyle;
}

export function createZoneFeatureFromBoundaryPolygon({
  polygon,
  label,
  style,
  legendLabel = "Zone",
}: {
  polygon: DromapBoundaryPosition[][];
  label: string;
  style: DroMapFeatureStyle;
  legendLabel?: string;
}): DroMapFeature {
  return {
    type: "Feature",
    id: crypto.randomUUID(),
    geometry: {
      type: "Polygon",
      coordinates: polygon,
    },
    properties: {
      type: "zone",
      label,
      legendLabel,
      zoneVariant: "boundary-fill",
      style: getVisibleZoneFillStyle(style),
      meta: { version: 1 },
    },
  };
}


function getGeoJsonFeatureLabel(feature: DromapGeoJsonFeature, layer: DromapGeoJsonLayer) {
  const dromap = feature.properties?.dromap;

  if (typeof dromap === "object" && dromap !== null && !Array.isArray(dromap)) {
    for (const key of ["label", "legendLabel", "name"]) {
      const value = (dromap as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
  }

  for (const key of LABEL_PROPERTY_KEYS) {
    const value = getStringProperty(feature.properties, key);

    if (value) {
      return value;
    }
  }

  return layer.name || "Zone GeoJSON";
}

function getContainingPolygonFromGeoJsonFeature(
  feature: DromapGeoJsonFeature,
  point: DromapBoundaryPosition,
): DromapBoundaryPosition[][] | null {
  const geometry = feature.geometry;

  if (geometry.type === "Polygon") {
    return pointIsInPolygon(point, geometry.coordinates)
      ? geometry.coordinates.map(closeRing)
      : null;
  }

  if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      if (pointIsInPolygon(point, polygon)) {
        return polygon.map(closeRing);
      }
    }
  }

  return null;
}

export function createZoneFillFeatureFromGeoJsonLayersAtLngLat({
  layers,
  lngLat,
  style,
  workspaceBounds,
}: {
  layers: DromapGeoJsonLayer[];
  lngLat: DromapBoundaryPosition;
  style: DroMapFeatureStyle;
  workspaceBounds?: WorkspaceBounds | null;
}): ZoneFillResult {
  const renderableLayers = getRenderableGeoJsonLayers(layers);

  for (const layer of [...renderableLayers].reverse()) {
    const seenPolygonKeys = new Set<string>();

    for (const feature of getGeoJsonLayerLoadedDisplayData(layer, workspaceBounds).features) {
      const polygon = getContainingPolygonFromGeoJsonFeature(feature, lngLat);

      if (!polygon) {
        continue;
      }

      const polygonKey = getRingKey(polygon[0] ?? []);

      if (seenPolygonKeys.has(polygonKey)) {
        continue;
      }

      seenPolygonKeys.add(polygonKey);

      const sourceLabel = getGeoJsonFeatureLabel(feature, layer);

      return {
        match: {
          sourceLabel,
          feature: createZoneFeatureFromBoundaryPolygon({
            polygon,
            label: sourceLabel,
            style,
          }),
        },
      };
    }
  }

  return { match: null };
}

async function getFillableFeatureCollections(basemapId: DromapBasemapId) {
  const basemap = getDromapBasemapConfig(basemapId);
  const layers = basemap.boundaryOverlay?.layers ?? [];
  const fillableLayers = layers.filter((layer) =>
    FILLABLE_BOUNDARY_KINDS.has(layer.kind),
  );

  const result: {
    layer: (typeof fillableLayers)[number];
    featureCollection: DromapBoundaryFeatureCollection;
  }[] = [];

  for (const layer of fillableLayers) {
    const featureCollection = await loadDromapBoundaryFeatureCollection(
      layer.dataUrl,
    );

    result.push({ layer, featureCollection });
  }

  return result;
}

export async function createZoneFillFeatureAtLngLat({
  basemapId,
  lngLat,
  style,
}: {
  basemapId: DromapBasemapId;
  lngLat: DromapBoundaryPosition;
  style: DroMapFeatureStyle;
}): Promise<ZoneFillResult> {
  const featureCollections = await getFillableFeatureCollections(basemapId);

  for (const { layer, featureCollection } of featureCollections) {
    const seenPolygonKeys = new Set<string>();

    for (const rawFeature of featureCollection.features) {
      const feature = getDromapBoundaryFeatureForLayer(rawFeature, layer);

      if (!feature) {
        continue;
      }

      const polygon = getContainingPolygonFromBoundaryFeature(feature, lngLat);

      if (!polygon) {
        continue;
      }

      const polygonKey = getRingKey(polygon[0] ?? []);

      if (seenPolygonKeys.has(polygonKey)) {
        continue;
      }

      seenPolygonKeys.add(polygonKey);

      const sourceLabel = getBoundaryFeatureLabel(feature, layer.kind);
      const label = sourceLabel;

      return {
        match: {
          sourceLabel,
          feature: createZoneFeatureFromBoundaryPolygon({
            polygon,
            label,
            style,
          }),
        },
      };
    }
  }

  return { match: null };
}

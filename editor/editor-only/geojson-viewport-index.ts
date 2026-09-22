/**
 * FRONTIÈRE ARCHITECTURALE : module strictement réservé à la carte éditeur.
 *
 * La preview et les exports doivent continuer à lire les collections complètes
 * du store. Les chemins `export-*` ont une règle ESLint qui interdit tout import
 * depuis `editor-only`.
 */

import {
  getGeoJsonLayerDisplayData,
  isIgnBdTopoBuildingsLayer,
  type DromapGeoJsonFeature,
  type DromapGeoJsonGeometry,
  type DromapGeoJsonLayer,
  type DromapGeoJsonPrecisionMode,
} from "@/stores/editor-geojson-layers";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import {
  getWorkspaceObjectLoadingBounds,
  loadingBoundsIntersect,
  type DromapLoadingBounds,
} from "@/lib/dromap/workspace-object-loading";

export const GEOJSON_VIEWPORT_PADDING_RATIO = 0.25;
export const GENERIC_LARGE_GEOJSON_MIN_FEATURES = 1_000;

export type GeoJsonViewportFeatureEntry = {
  id: string;
  sourceIndex: number;
  sourceGeometry: DromapGeoJsonGeometry;
  displayGeometry: DromapGeoJsonGeometry;
  bounds: DromapLoadingBounds;
};

export type GeoJsonViewportIndex = {
  layerId: string;
  effectivePrecision: DromapGeoJsonPrecisionMode;
  sourceData: DromapGeoJsonLayer["data"];
  sourceFeatureIds: string[];
  sourceGeometries: DromapGeoJsonGeometry[];
  features: GeoJsonViewportFeatureEntry[];
  featuresById: Map<string, GeoJsonViewportFeatureEntry>;
  longitudeBuckets: GeoJsonViewportFeatureEntry[][];
  longitudeBucketWest: number;
  longitudeBucketWidth: number;
  longitudeOverflowFeatures: GeoJsonViewportFeatureEntry[];
};

export type GeoJsonViewportBounds = DromapLoadingBounds;

function getFeatureId(feature: DromapGeoJsonFeature) {
  if (typeof feature.id === "string" && feature.id.length > 0) {
    return feature.id;
  }

  if (typeof feature.id === "number" && Number.isFinite(feature.id)) {
    return String(feature.id);
  }

  return null;
}

function isCanvasPathGeometry(geometry: DromapGeoJsonGeometry) {
  return (
    geometry.type === "Point" ||
    geometry.type === "MultiPoint" ||
    geometry.type === "LineString" ||
    geometry.type === "MultiLineString" ||
    geometry.type === "Polygon" ||
    geometry.type === "MultiPolygon"
  );
}

function collectGeometryCoordinates(
  geometry: DromapGeoJsonGeometry,
  collect: (coordinate: [number, number]) => void,
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

function getGeometryBounds(geometry: DromapGeoJsonGeometry) {
  let south = Number.POSITIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;

  collectGeometryCoordinates(geometry, ([lng, lat]) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return;
    }

    south = Math.min(south, lat);
    west = Math.min(west, lng);
    north = Math.max(north, lat);
    east = Math.max(east, lng);
  });

  if (
    !Number.isFinite(south) ||
    !Number.isFinite(west) ||
    !Number.isFinite(north) ||
    !Number.isFinite(east)
  ) {
    return null;
  }

  return { south, west, north, east } satisfies DromapLoadingBounds;
}

export function getGeoJsonEffectivePrecision(
  layer: DromapGeoJsonLayer,
): DromapGeoJsonPrecisionMode {
  // Les bâtiments IGN/Overture ignorent déjà la simplification dans le store.
  // Changer leur sélecteur de précision ne change donc aucune coordonnée et ne
  // doit pas invalider l'index bbox.
  return isIgnBdTopoBuildingsLayer(layer) ? "original" : layer.precisionMode;
}

export function isGeoJsonViewportCanvasCandidate(layer: DromapGeoJsonLayer) {
  if (!layer.locked || layer.data.features.length === 0) {
    return false;
  }

  return (
    isIgnBdTopoBuildingsLayer(layer) ||
    layer.data.features.length >= GENERIC_LARGE_GEOJSON_MIN_FEATURES
  );
}

export function canReuseGeoJsonViewportIndex(
  index: GeoJsonViewportIndex,
  layer: DromapGeoJsonLayer,
) {
  if (
    index.layerId !== layer.id ||
    index.effectivePrecision !== getGeoJsonEffectivePrecision(layer) ||
    index.sourceGeometries.length !== layer.data.features.length
  ) {
    return false;
  }

  // Nom, visibilité, opacité, verrouillage, ordre et autres métadonnées
  // conservent l'identité de `data` : aucun scan des features n'est requis.
  if (index.sourceData === layer.data) {
    return true;
  }

  for (let featureIndex = 0; featureIndex < layer.data.features.length; featureIndex += 1) {
    const feature = layer.data.features[featureIndex];
    if (
      getFeatureId(feature) !== index.sourceFeatureIds[featureIndex] ||
      feature.geometry !== index.sourceGeometries[featureIndex]
    ) {
      return false;
    }
  }

  return true;
}

export function reuseGeoJsonViewportIndex(
  index: GeoJsonViewportIndex,
  layer: DromapGeoJsonLayer,
) {
  index.sourceData = layer.data;
  return index;
}

export function createGeoJsonViewportIndex(
  layer: DromapGeoJsonLayer,
): GeoJsonViewportIndex | null {
  if (!isGeoJsonViewportCanvasCandidate(layer)) {
    return null;
  }

  const displayData = getGeoJsonLayerDisplayData(layer);
  if (displayData.features.length !== layer.data.features.length) {
    return null;
  }

  const sourceFeatureIds: string[] = [];
  const sourceGeometries: DromapGeoJsonGeometry[] = [];
  const features: GeoJsonViewportFeatureEntry[] = [];
  const featuresById = new Map<string, GeoJsonViewportFeatureEntry>();
  let layerWest = Number.POSITIVE_INFINITY;
  let layerEast = Number.NEGATIVE_INFINITY;

  for (let featureIndex = 0; featureIndex < layer.data.features.length; featureIndex += 1) {
    const sourceFeature = layer.data.features[featureIndex];
    const displayFeature = displayData.features[featureIndex];
    const sourceFeatureId = getFeatureId(sourceFeature);
    const displayFeatureId = getFeatureId(displayFeature);

    if (
      !sourceFeatureId ||
      sourceFeatureId !== displayFeatureId ||
      featuresById.has(sourceFeatureId) ||
      !isCanvasPathGeometry(displayFeature.geometry)
    ) {
      return null;
    }

    const bounds = getGeometryBounds(displayFeature.geometry);
    if (!bounds) {
      return null;
    }

    const entry: GeoJsonViewportFeatureEntry = {
      id: sourceFeatureId,
      sourceIndex: featureIndex,
      sourceGeometry: sourceFeature.geometry,
      displayGeometry: displayFeature.geometry,
      bounds,
    };

    sourceFeatureIds.push(sourceFeatureId);
    sourceGeometries.push(sourceFeature.geometry);
    features.push(entry);
    featuresById.set(sourceFeatureId, entry);
    layerWest = Math.min(layerWest, bounds.west);
    layerEast = Math.max(layerEast, bounds.east);
  }

  const bucketCount = Math.max(
    1,
    Math.min(256, Math.ceil(Math.sqrt(features.length))),
  );
  const longitudeBucketWidth = Math.max(
    1e-9,
    (layerEast - layerWest) / bucketCount,
  );
  const longitudeBuckets = Array.from(
    { length: bucketCount },
    () => [] as GeoJsonViewportFeatureEntry[],
  );
  const longitudeOverflowFeatures: GeoJsonViewportFeatureEntry[] = [];

  const getBucketIndex = (longitude: number) =>
    Math.max(
      0,
      Math.min(
        bucketCount - 1,
        Math.floor((longitude - layerWest) / longitudeBucketWidth),
      ),
    );

  for (const entry of features) {
    const firstBucket = getBucketIndex(entry.bounds.west);
    const lastBucket = getBucketIndex(entry.bounds.east);
    if (lastBucket - firstBucket > 32) {
      longitudeOverflowFeatures.push(entry);
      continue;
    }
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      longitudeBuckets[bucket].push(entry);
    }
  }

  return {
    layerId: layer.id,
    effectivePrecision: getGeoJsonEffectivePrecision(layer),
    sourceData: layer.data,
    sourceFeatureIds,
    sourceGeometries,
    features,
    featuresById,
    longitudeBuckets,
    longitudeBucketWest: layerWest,
    longitudeBucketWidth,
    longitudeOverflowFeatures,
  };
}

export function createIndexedGeoJsonFeature(
  layer: DromapGeoJsonLayer,
  index: GeoJsonViewportIndex,
  entry: GeoJsonViewportFeatureEntry,
): DromapGeoJsonFeature | null {
  const sourceFeature = layer.data.features[entry.sourceIndex];
  if (
    !sourceFeature ||
    getFeatureId(sourceFeature) !== entry.id ||
    sourceFeature.geometry !== index.sourceGeometries[entry.sourceIndex]
  ) {
    return null;
  }

  return {
    ...sourceFeature,
    geometry: entry.displayGeometry,
  };
}

export function queryGeoJsonViewportIndex(
  index: GeoJsonViewportIndex,
  viewportBounds: GeoJsonViewportBounds,
  workspaceBounds: WorkspaceBounds | null | undefined,
) {
  const workspaceLoadingBounds = getWorkspaceObjectLoadingBounds(workspaceBounds);
  const wantedIds = new Set<string>();
  const effectiveBounds = workspaceLoadingBounds
    ? {
        south: Math.max(viewportBounds.south, workspaceLoadingBounds.south),
        west: Math.max(viewportBounds.west, workspaceLoadingBounds.west),
        north: Math.min(viewportBounds.north, workspaceLoadingBounds.north),
        east: Math.min(viewportBounds.east, workspaceLoadingBounds.east),
      }
    : viewportBounds;

  if (
    effectiveBounds.south > effectiveBounds.north ||
    effectiveBounds.west > effectiveBounds.east
  ) {
    return wantedIds;
  }

  const bucketCount = index.longitudeBuckets.length;
  const getBucketIndex = (longitude: number) =>
    Math.max(
      0,
      Math.min(
        bucketCount - 1,
        Math.floor(
          (longitude - index.longitudeBucketWest) / index.longitudeBucketWidth,
        ),
      ),
    );
  const firstBucket = getBucketIndex(effectiveBounds.west);
  const lastBucket = getBucketIndex(effectiveBounds.east);
  const checkedIds = new Set<string>();
  const candidates = index.longitudeOverflowFeatures.slice();
  for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
    candidates.push(...index.longitudeBuckets[bucket]);
  }

  for (const entry of candidates) {
    if (checkedIds.has(entry.id)) continue;
    checkedIds.add(entry.id);
    if (
      loadingBoundsIntersect(entry.bounds, effectiveBounds)
    ) {
      wantedIds.add(entry.id);
    }
  }

  return wantedIds;
}

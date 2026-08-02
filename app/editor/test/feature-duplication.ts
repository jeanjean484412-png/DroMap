import type { Map as LeafletMap } from "leaflet";

import type {
  DroMapFeature,
  DroMapGeometry,
  DroMapLineString,
  DroMapPoint,
  DroMapPolygon,
} from "@/lib/dromap/feature";
import {
  isFeatureGeometryLocked,
  isFeatureLocked,
} from "@/lib/dromap/feature";
import {
  isFeatureEffectivelyLocked,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

/** Décalage visuel constant entre l'original et sa copie. */
const DUPLICATE_PIXEL_OFFSET = 28;

/** Repli utilisé uniquement si la carte Leaflet n'est pas encore montée. */
const FALLBACK_DUPLICATE_LNG_OFFSET = 0.01;
const FALLBACK_DUPLICATE_LAT_OFFSET = -0.01;

type Coordinate = [number, number];

type CoordinatesBounds = {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};

type GeographicOffset = {
  lng: number;
  lat: number;
};

type PixelOffset = {
  x: number;
  y: number;
};

let currentDuplicationMap: LeafletMap | null = null;

export function setFeatureDuplicationMap(map: LeafletMap | null) {
  currentDuplicationMap = map;
}

function cloneDroMapFeature(feature: DroMapFeature): DroMapFeature {
  if (typeof structuredClone === "function") {
    return structuredClone(feature);
  }

  return JSON.parse(JSON.stringify(feature)) as DroMapFeature;
}

function createFeatureId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `feature-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function expandBoundsWithCoordinate(
  bounds: CoordinatesBounds | null,
  coordinate: Coordinate,
): CoordinatesBounds {
  const [lng, lat] = coordinate;

  if (!bounds) {
    return {
      minLng: lng,
      maxLng: lng,
      minLat: lat,
      maxLat: lat,
    };
  }

  return {
    minLng: Math.min(bounds.minLng, lng),
    maxLng: Math.max(bounds.maxLng, lng),
    minLat: Math.min(bounds.minLat, lat),
    maxLat: Math.max(bounds.maxLat, lat),
  };
}

function getGeometryBounds(geometry: DroMapGeometry): CoordinatesBounds | null {
  if (geometry.type === "Point") {
    return expandBoundsWithCoordinate(null, geometry.coordinates);
  }

  if (geometry.type === "LineString") {
    return geometry.coordinates.reduce<CoordinatesBounds | null>(
      (bounds, coordinate) => expandBoundsWithCoordinate(bounds, coordinate),
      null,
    );
  }

  return geometry.coordinates.reduce<CoordinatesBounds | null>(
    (polygonBounds, ring) =>
      ring.reduce<CoordinatesBounds | null>(
        (ringBounds, coordinate) =>
          expandBoundsWithCoordinate(ringBounds, coordinate),
        polygonBounds,
      ),
    null,
  );
}

function geometryFitsWorkspace(
  geometry: DroMapGeometry,
  workspaceBounds: WorkspaceBounds | null,
) {
  if (!workspaceBounds) {
    return true;
  }

  const bounds = getGeometryBounds(geometry);

  if (!bounds) {
    return true;
  }

  return (
    bounds.minLng >= workspaceBounds.southWest.lng &&
    bounds.maxLng <= workspaceBounds.northEast.lng &&
    bounds.minLat >= workspaceBounds.southWest.lat &&
    bounds.maxLat <= workspaceBounds.northEast.lat
  );
}

function translateCoordinateByPixels(
  coordinate: Coordinate,
  map: LeafletMap,
  offset: PixelOffset,
): Coordinate {
  const zoom = map.getZoom();
  const projectedPoint = map.project([coordinate[1], coordinate[0]], zoom);
  const shiftedPoint = projectedPoint.add([offset.x, offset.y]);
  const shiftedLatLng = map.unproject(shiftedPoint, zoom);

  return [shiftedLatLng.lng, shiftedLatLng.lat];
}

function translateGeometryByPixels(
  geometry: DroMapGeometry,
  map: LeafletMap,
  offset: PixelOffset,
): DroMapGeometry {
  if (geometry.type === "Point") {
    return {
      ...geometry,
      coordinates: translateCoordinateByPixels(geometry.coordinates, map, offset),
    } as DroMapPoint;
  }

  if (geometry.type === "LineString") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((coordinate) =>
        translateCoordinateByPixels(coordinate, map, offset),
      ),
    } as DroMapLineString;
  }

  return {
    ...geometry,
    coordinates: geometry.coordinates.map((ring) =>
      ring.map((coordinate) =>
        translateCoordinateByPixels(coordinate, map, offset),
      ),
    ),
  } as DroMapPolygon;
}

function translateGeometryByGeographicOffset(
  geometry: DroMapGeometry,
  offset: GeographicOffset,
): DroMapGeometry {
  if (geometry.type === "Point") {
    return {
      ...geometry,
      coordinates: [
        geometry.coordinates[0] + offset.lng,
        geometry.coordinates[1] + offset.lat,
      ],
    } as DroMapPoint;
  }

  if (geometry.type === "LineString") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(
        (coordinate) =>
          [coordinate[0] + offset.lng, coordinate[1] + offset.lat] as Coordinate,
      ),
    } as DroMapLineString;
  }

  return {
    ...geometry,
    coordinates: geometry.coordinates.map((ring) =>
      ring.map(
        (coordinate) =>
          [coordinate[0] + offset.lng, coordinate[1] + offset.lat] as Coordinate,
      ),
    ),
  } as DroMapPolygon;
}

function getPixelTranslatedGeometry(
  geometry: DroMapGeometry,
  map: LeafletMap,
  workspaceBounds: WorkspaceBounds | null,
) {
  const candidateOffsets: PixelOffset[] = [
    { x: DUPLICATE_PIXEL_OFFSET, y: DUPLICATE_PIXEL_OFFSET },
    { x: -DUPLICATE_PIXEL_OFFSET, y: DUPLICATE_PIXEL_OFFSET },
    { x: DUPLICATE_PIXEL_OFFSET, y: -DUPLICATE_PIXEL_OFFSET },
    { x: -DUPLICATE_PIXEL_OFFSET, y: -DUPLICATE_PIXEL_OFFSET },
  ];

  const translatedCandidates = candidateOffsets.map((offset) =>
    translateGeometryByPixels(geometry, map, offset),
  );

  return (
    translatedCandidates.find((candidate) =>
      geometryFitsWorkspace(candidate, workspaceBounds),
    ) ?? translatedCandidates[0] ?? geometry
  );
}

function getDuplicatedGeometry(
  geometry: DroMapGeometry,
  workspaceBounds: WorkspaceBounds | null,
) {
  const map = currentDuplicationMap;

  if (map) {
    return getPixelTranslatedGeometry(geometry, map, workspaceBounds);
  }

  return translateGeometryByGeographicOffset(geometry, {
    lng: FALLBACK_DUPLICATE_LNG_OFFSET,
    lat: FALLBACK_DUPLICATE_LAT_OFFSET,
  });
}

export function duplicateDroMapFeature(
  feature: DroMapFeature,
  workspaceBounds: WorkspaceBounds | null,
): DroMapFeature {
  const duplicatedFeature = cloneDroMapFeature(feature);
  const {
    lockOverride: _lockOverride,
    ...duplicatedProperties
  } = duplicatedFeature.properties;

  return {
    ...duplicatedFeature,
    id: createFeatureId(),
    geometry: getDuplicatedGeometry(
      duplicatedFeature.geometry,
      workspaceBounds,
    ),
    properties: {
      ...duplicatedProperties,
      style: {
        ...duplicatedFeature.properties.style,
      },
      locked: false,
      meta: { version: 1 },
      ...(duplicatedFeature.properties.symbol
        ? {
            symbol: {
              ...duplicatedFeature.properties.symbol,
            },
          }
        : {}),
    },
  };
}

export function duplicateSelectedFeature() {
  const selectedFeatureId =
    useEditorTestSelectionStore.getState().selectedFeatureId;

  if (!selectedFeatureId) {
    return false;
  }

  const feature = useEditorTestFeaturesStore
    .getState()
    .features.find((candidate) => candidate.id === selectedFeatureId);

  if (!feature) {
    useEditorTestSelectionStore.getState().clearSelectedFeatureId();
    return false;
  }

  if (
    isFeatureLocked(feature) ||
    isFeatureGeometryLocked(feature) ||
    isFeatureEffectivelyLocked(
      feature,
      useEditorTestLayersStore.getState().layers,
    )
  ) {
    return false;
  }

  const workspaceBounds = useEditorTestWorkspaceStore.getState().workspaceBounds;
  const duplicatedFeature = duplicateDroMapFeature(feature, workspaceBounds);

  useEditorTestFeaturesStore.getState().addFeatureWithHistory(duplicatedFeature);
  useEditorTestSelectionStore
    .getState()
    .setSelectedFeatureId(duplicatedFeature.id);

  return true;
}

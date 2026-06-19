import type {
  DroMapFeature,
  DroMapGeometry,
  DroMapLineString,
  DroMapPoint,
  DroMapPolygon,
} from "@/lib/dromap/feature";
import { isFeatureLocked } from "@/lib/dromap/feature";
import {
  isFeatureEffectivelyLocked,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

const DEFAULT_DUPLICATE_LNG_OFFSET = 0.01;
const DEFAULT_DUPLICATE_LAT_OFFSET = -0.01;
const WORKSPACE_DUPLICATE_OFFSET_RATIO = 0.025;
const FEATURE_DUPLICATE_OFFSET_RATIO = 0.12;

type CoordinatesBounds = {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};

type DuplicateOffset = {
  lng: number;
  lat: number;
};

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
  coordinate: [number, number],
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

  if (geometry.type === "Polygon") {
    return geometry.coordinates.reduce<CoordinatesBounds | null>(
      (polygonBounds, ring) =>
        ring.reduce<CoordinatesBounds | null>(
          (ringBounds, coordinate) => expandBoundsWithCoordinate(ringBounds, coordinate),
          polygonBounds,
        ),
      null,
    );
  }

  return null;
}

function getWorkspaceSize(workspaceBounds: WorkspaceBounds | null) {
  if (!workspaceBounds) {
    return null;
  }

  const lngSize = Math.abs(
    workspaceBounds.northEast.lng - workspaceBounds.southWest.lng,
  );
  const latSize = Math.abs(
    workspaceBounds.northEast.lat - workspaceBounds.southWest.lat,
  );

  if (!Number.isFinite(lngSize) || !Number.isFinite(latSize)) {
    return null;
  }

  if (lngSize <= 0 || latSize <= 0) {
    return null;
  }

  return {
    lngSize,
    latSize,
  };
}

function getFeatureSize(featureBounds: CoordinatesBounds | null) {
  if (!featureBounds) {
    return null;
  }

  return {
    lngSize: Math.abs(featureBounds.maxLng - featureBounds.minLng),
    latSize: Math.abs(featureBounds.maxLat - featureBounds.minLat),
  };
}

function getDuplicateOffset(
  feature: DroMapFeature,
  workspaceBounds: WorkspaceBounds | null,
): DuplicateOffset {
  const featureBounds = getGeometryBounds(feature.geometry);
  const workspaceSize = getWorkspaceSize(workspaceBounds);
  const featureSize = getFeatureSize(featureBounds);

  const lngOffset = Math.max(
    workspaceSize
      ? workspaceSize.lngSize * WORKSPACE_DUPLICATE_OFFSET_RATIO
      : DEFAULT_DUPLICATE_LNG_OFFSET,
    featureSize ? featureSize.lngSize * FEATURE_DUPLICATE_OFFSET_RATIO : 0,
    DEFAULT_DUPLICATE_LNG_OFFSET,
  );

  const latOffset = Math.max(
    workspaceSize
      ? workspaceSize.latSize * WORKSPACE_DUPLICATE_OFFSET_RATIO
      : Math.abs(DEFAULT_DUPLICATE_LAT_OFFSET),
    featureSize ? featureSize.latSize * FEATURE_DUPLICATE_OFFSET_RATIO : 0,
    Math.abs(DEFAULT_DUPLICATE_LAT_OFFSET),
  );

  let nextLngOffset = lngOffset;
  let nextLatOffset = -latOffset;

  if (workspaceBounds && featureBounds) {
    if (featureBounds.maxLng + nextLngOffset > workspaceBounds.northEast.lng) {
      nextLngOffset = -lngOffset;
    }

    if (featureBounds.minLat + nextLatOffset < workspaceBounds.southWest.lat) {
      nextLatOffset = latOffset;
    }
  }

  return {
    lng: nextLngOffset,
    lat: nextLatOffset,
  };
}

function translatePointGeometry(
  geometry: DroMapPoint,
  offset: DuplicateOffset,
): DroMapPoint {
  return {
    ...geometry,
    coordinates: [
      geometry.coordinates[0] + offset.lng,
      geometry.coordinates[1] + offset.lat,
    ],
  };
}

function translateLineStringGeometry(
  geometry: DroMapLineString,
  offset: DuplicateOffset,
): DroMapLineString {
  return {
    ...geometry,
    coordinates: geometry.coordinates.map(
      (coordinate) =>
        [coordinate[0] + offset.lng, coordinate[1] + offset.lat] as [
          number,
          number,
        ],
    ),
  };
}

function translatePolygonGeometry(
  geometry: DroMapPolygon,
  offset: DuplicateOffset,
): DroMapPolygon {
  return {
    ...geometry,
    coordinates: geometry.coordinates.map((ring) =>
      ring.map(
        (coordinate) =>
          [coordinate[0] + offset.lng, coordinate[1] + offset.lat] as [
            number,
            number,
          ],
      ),
    ),
  };
}

function translateGeometry(
  geometry: DroMapGeometry,
  offset: DuplicateOffset,
): DroMapGeometry {
  if (geometry.type === "Point") {
    return translatePointGeometry(geometry, offset);
  }

  if (geometry.type === "LineString") {
    return translateLineStringGeometry(geometry, offset);
  }

  return translatePolygonGeometry(geometry, offset);
}

export function duplicateDroMapFeature(
  feature: DroMapFeature,
  workspaceBounds: WorkspaceBounds | null,
): DroMapFeature {
  const offset = getDuplicateOffset(feature, workspaceBounds);
  const duplicatedFeature = cloneDroMapFeature(feature);

  return {
    ...duplicatedFeature,
    id: createFeatureId(),
    geometry: translateGeometry(duplicatedFeature.geometry, offset),
    properties: {
      ...duplicatedFeature.properties,
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
    isFeatureEffectivelyLocked(feature, useEditorTestLayersStore.getState().layers)
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

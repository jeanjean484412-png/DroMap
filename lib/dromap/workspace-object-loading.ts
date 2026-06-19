import type { DroMapFeature, DroMapGeometry } from "./feature";
import type { WorkspaceBounds } from "./workspace-bounds";

export type DromapLoadingBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export const DROMAP_WORKSPACE_OBJECT_LOADING_PADDING_RATIO = 0.22;
export const DROMAP_WORKSPACE_OBJECT_LOADING_MIN_PADDING_DEGREES = 0.02;

function clampLatitude(value: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, value));
}

function clampLongitude(value: number) {
  return Math.max(-360, Math.min(360, value));
}

function normalizeBounds(bounds: WorkspaceBounds): DromapLoadingBounds {
  return {
    south: Math.min(bounds.southWest.lat, bounds.northEast.lat),
    west: Math.min(bounds.southWest.lng, bounds.northEast.lng),
    north: Math.max(bounds.southWest.lat, bounds.northEast.lat),
    east: Math.max(bounds.southWest.lng, bounds.northEast.lng),
  };
}

export function getWorkspaceObjectLoadingBounds(
  workspaceBounds: WorkspaceBounds | null | undefined,
  paddingRatio = DROMAP_WORKSPACE_OBJECT_LOADING_PADDING_RATIO,
): DromapLoadingBounds | null {
  if (!workspaceBounds) {
    return null;
  }

  const bounds = normalizeBounds(workspaceBounds);
  const lngSpan = Math.max(0, bounds.east - bounds.west);
  const latSpan = Math.max(0, bounds.north - bounds.south);
  const lngPadding = Math.max(
    lngSpan * paddingRatio,
    DROMAP_WORKSPACE_OBJECT_LOADING_MIN_PADDING_DEGREES,
  );
  const latPadding = Math.max(
    latSpan * paddingRatio,
    DROMAP_WORKSPACE_OBJECT_LOADING_MIN_PADDING_DEGREES,
  );

  return {
    south: clampLatitude(bounds.south - latPadding),
    west: clampLongitude(bounds.west - lngPadding),
    north: clampLatitude(bounds.north + latPadding),
    east: clampLongitude(bounds.east + lngPadding),
  };
}

export function loadingBoundsToWorkspaceBounds(
  bounds: DromapLoadingBounds,
): WorkspaceBounds {
  return {
    southWest: { lat: bounds.south, lng: bounds.west },
    northEast: { lat: bounds.north, lng: bounds.east },
  };
}

function coordinateIsFinite(coordinate: [number, number]) {
  return (
    Number.isFinite(coordinate[0]) &&
    Number.isFinite(coordinate[1])
  );
}

export function coordinateIntersectsLoadingBounds(
  coordinate: [number, number],
  bounds: DromapLoadingBounds | null | undefined,
) {
  if (!bounds) {
    return true;
  }

  if (!coordinateIsFinite(coordinate)) {
    return false;
  }

  const [lng, lat] = coordinate;

  return (
    lng >= bounds.west &&
    lng <= bounds.east &&
    lat >= bounds.south &&
    lat <= bounds.north
  );
}

function getCoordinateBounds(coordinates: [number, number][]) {
  if (coordinates.length === 0) {
    return null;
  }

  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const [lng, lat] of coordinates) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      continue;
    }

    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }

  if (
    !Number.isFinite(west) ||
    !Number.isFinite(east) ||
    !Number.isFinite(south) ||
    !Number.isFinite(north)
  ) {
    return null;
  }

  return { south, west, north, east } satisfies DromapLoadingBounds;
}

export function loadingBoundsIntersect(
  first: DromapLoadingBounds | null | undefined,
  second: DromapLoadingBounds | null | undefined,
) {
  if (!first || !second) {
    return true;
  }

  return !(
    second.west > first.east ||
    second.east < first.west ||
    second.south > first.north ||
    second.north < first.south
  );
}

export function collectDromapGeometryCoordinates(
  geometry: DroMapGeometry,
  callback: (coordinate: [number, number]) => void,
) {
  if (geometry.type === "Point") {
    callback(geometry.coordinates);
    return;
  }

  if (geometry.type === "LineString") {
    geometry.coordinates.forEach(callback);
    return;
  }

  geometry.coordinates.forEach((ring) => ring.forEach(callback));
}

export function getDromapGeometryLoadingBounds(
  geometry: DroMapGeometry,
): DromapLoadingBounds | null {
  const coordinates: [number, number][] = [];
  collectDromapGeometryCoordinates(geometry, (coordinate) => {
    coordinates.push(coordinate);
  });

  return getCoordinateBounds(coordinates);
}

export function isDromapFeatureLoadedInWorkspace(
  feature: DroMapFeature,
  workspaceBounds: WorkspaceBounds | null | undefined,
) {
  const loadingBounds = getWorkspaceObjectLoadingBounds(workspaceBounds);

  if (!loadingBounds) {
    return true;
  }

  const featureBounds = getDromapGeometryLoadingBounds(feature.geometry);

  return loadingBoundsIntersect(loadingBounds, featureBounds);
}

import L from "leaflet";

/** Bounds Leaflet sérialisables (zone de travail, hors features pédagogiques). */
export type WorkspaceBounds = {
  southWest: { lat: number; lng: number };
  northEast: { lat: number; lng: number };

  /**
   * Anciens formats Leaflet/projet acceptés uniquement pour relire des sauvegardes
   * ou des objets sérialisés avant normalisation. Les nouvelles écritures doivent
   * continuer à utiliser southWest/northEast.
   */
  sw?: { lat: number; lng: number };
  ne?: { lat: number; lng: number };
  _southWest?: { lat: number; lng: number };
  _northEast?: { lat: number; lng: number };
  south?: number;
  west?: number;
  north?: number;
  east?: number;
};

export type WorkspaceClampBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

const WORKSPACE_MIN_LAT = -85.05112878;
const WORKSPACE_MAX_LAT = 85.05112878;
const WORKSPACE_MIN_LNG = -360;
const WORKSPACE_MAX_LNG = 360;
const WORKSPACE_MIN_SIZE_DEGREES = 0.000001;

function clampLatitude(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, WORKSPACE_MIN_LAT), WORKSPACE_MAX_LAT);
}

function clampLongitude(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, WORKSPACE_MIN_LNG), WORKSPACE_MAX_LNG);
}

function clampToRange(value: number, min: number, max: number) {
  if (min > max) {
    return (min + max) / 2;
  }

  return Math.min(Math.max(value, min), max);
}

export function getWorkspaceClampBoundsFromLatLngBounds(
  bounds: L.LatLngBounds,
): WorkspaceClampBounds {
  return {
    south: clampLatitude(bounds.getSouth()),
    west: clampLongitude(bounds.getWest()),
    north: clampLatitude(bounds.getNorth()),
    east: clampLongitude(bounds.getEast()),
  };
}

export function normalizeWorkspaceBounds(
  southWest: L.LatLng,
  northEast: L.LatLng,
  clampBounds?: WorkspaceClampBounds | null,
): WorkspaceBounds {
  const defaultSouth = clampLatitude(Math.min(southWest.lat, northEast.lat));
  const defaultNorth = clampLatitude(Math.max(southWest.lat, northEast.lat));
  const defaultWest = clampLongitude(Math.min(southWest.lng, northEast.lng));
  const defaultEast = clampLongitude(Math.max(southWest.lng, northEast.lng));

  const constraint = clampBounds
    ? {
        south: clampLatitude(Math.min(clampBounds.south, clampBounds.north)),
        north: clampLatitude(Math.max(clampBounds.south, clampBounds.north)),
        west: clampLongitude(Math.min(clampBounds.west, clampBounds.east)),
        east: clampLongitude(Math.max(clampBounds.west, clampBounds.east)),
      }
    : {
        south: WORKSPACE_MIN_LAT,
        north: WORKSPACE_MAX_LAT,
        west: WORKSPACE_MIN_LNG,
        east: WORKSPACE_MAX_LNG,
      };

  let south = clampToRange(defaultSouth, constraint.south, constraint.north);
  let north = clampToRange(defaultNorth, constraint.south, constraint.north);
  let west = clampToRange(defaultWest, constraint.west, constraint.east);
  let east = clampToRange(defaultEast, constraint.west, constraint.east);

  if (north - south < WORKSPACE_MIN_SIZE_DEGREES) {
    const center = (north + south) / 2;
    south = clampToRange(
      center - WORKSPACE_MIN_SIZE_DEGREES / 2,
      constraint.south,
      constraint.north,
    );
    north = clampToRange(
      center + WORKSPACE_MIN_SIZE_DEGREES / 2,
      constraint.south,
      constraint.north,
    );
  }

  if (east - west < WORKSPACE_MIN_SIZE_DEGREES) {
    const center = (east + west) / 2;
    west = clampToRange(
      center - WORKSPACE_MIN_SIZE_DEGREES / 2,
      constraint.west,
      constraint.east,
    );
    east = clampToRange(
      center + WORKSPACE_MIN_SIZE_DEGREES / 2,
      constraint.west,
      constraint.east,
    );
  }

  return {
    southWest: { lat: south, lng: west },
    northEast: { lat: north, lng: east },
  };
}

export function clampWorkspaceBounds(
  bounds: WorkspaceBounds,
  clampBounds?: WorkspaceClampBounds | null,
): WorkspaceBounds {
  return normalizeWorkspaceBounds(
    L.latLng(bounds.southWest.lat, bounds.southWest.lng),
    L.latLng(bounds.northEast.lat, bounds.northEast.lng),
    clampBounds,
  );
}

export function boundsFromRectangle(
  layer: L.Rectangle,
  clampBounds?: WorkspaceClampBounds | null,
): WorkspaceBounds {
  const bounds = layer.getBounds();

  return normalizeWorkspaceBounds(
    bounds.getSouthWest(),
    bounds.getNorthEast(),
    clampBounds,
  );
}

export function toLatLngBounds(bounds: WorkspaceBounds): L.LatLngBounds {
  return L.latLngBounds(
    [bounds.southWest.lat, bounds.southWest.lng],
    [bounds.northEast.lat, bounds.northEast.lng],
  );
}
